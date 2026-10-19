import Foundation
import Network

/// Native port of `apps/web/src/lib/sketchforgeMcpStore.ts` and the
/// `/api/sketchforge-mcp` route. The editor heartbeats and long-polls through the
/// app scheme; MCP clients (the stock `scripts/sketchforge-mcp-server.mjs`) dispatch
/// commands through `McpHTTPServer` on 127.0.0.1. All methods are thread-safe and
/// may block their (background) caller while waiting.
final class McpBridge {
    static let route = "/api/sketchforge-mcp"
    private static let staleAfter: TimeInterval = 15
    private static let longPollTimeout: TimeInterval = 25

    private let condition = NSCondition()
    private var editors: [String: [String: Any]] = [:]
    private var lastSeen: [String: Date] = [:]
    private var queues: [String: [[String: Any]]] = [:]
    private var activePolls: [String: Int] = [:]
    private var pendingEditor: [String: String] = [:]
    private var results: [String: [String: Any]] = [:]

    func handle(method: String, body: Data) -> SchemeResponse {
        if method == "GET" { return .json(["editors": listEditors()]) }
        guard method == "POST" else { return .error("Method not allowed", status: 405) }
        guard let payload = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let type = payload["type"] as? String
        else { return .error("Invalid SketchForge MCP request.", status: 400) }

        switch type {
        case "heartbeat":
            guard let editor = payload["editor"] as? [String: Any], let id = editor["editorId"] as? String else {
                return .error("Invalid editor heartbeat.", status: 400)
            }
            register(editor, id: id)
            return .json(["ok": true, "editors": listEditors()])
        case "poll":
            guard let id = payload["editorId"] as? String else { return .error("Invalid editor poll.", status: 400) }
            return .json(["command": waitForCommand(editorId: id) as Any? ?? NSNull()])
        case "result":
            guard let id = payload["editorId"] as? String,
                  let result = payload["result"] as? [String: Any],
                  result["commandId"] is String, result["ok"] is Bool
            else { return .error("Invalid command result.", status: 400) }
            return .json(["ok": complete(editorId: id, result: result)])
        case "command":
            guard let action = payload["action"] as? String else { return .error("Invalid command action.", status: 400) }
            let result = dispatch(
                action: action,
                editorId: payload["editorId"] as? String,
                editorNumber: (payload["editorNumber"] as? NSNumber)?.intValue,
                params: payload["params"] as? [String: Any] ?? [:],
                timeout: ((payload["timeoutMs"] as? NSNumber)?.doubleValue ?? 15_000) / 1000
            )
            return .json(result, status: result["ok"] as? Bool == true ? 200 : 504)
        default:
            return .error("Unknown SketchForge MCP request.", status: 400)
        }
    }

    // MARK: Store

    private func register(_ editor: [String: Any], id: String) {
        condition.lock()
        defer { condition.unlock() }
        prune()
        editors[id] = editor
        lastSeen[id] = Date()
        if queues[id] == nil { queues[id] = [] }
    }

    func listEditors() -> [[String: Any]] {
        condition.lock()
        defer { condition.unlock() }
        prune()
        return editors.map { id, editor in
            var summary = editor
            summary["lastSeen"] = Int((lastSeen[id] ?? Date()).timeIntervalSince1970 * 1000)
            return summary
        }
        .sorted { ($0["editorNumber"] as? Int ?? 0) < ($1["editorNumber"] as? Int ?? 0) }
    }

    private func waitForCommand(editorId: String) -> [String: Any]? {
        condition.lock()
        defer { condition.unlock() }
        activePolls[editorId, default: 0] += 1
        lastSeen[editorId] = Date()
        let deadline = Date().addingTimeInterval(Self.longPollTimeout)
        while queues[editorId]?.isEmpty ?? true, condition.wait(until: deadline) {}
        let command = (queues[editorId]?.isEmpty == false) ? queues[editorId]!.removeFirst() : nil
        activePolls[editorId, default: 1] -= 1
        lastSeen[editorId] = Date()
        return command
    }

    private func complete(editorId: String, result: [String: Any]) -> Bool {
        condition.lock()
        defer { condition.unlock() }
        guard let commandId = result["commandId"] as? String, pendingEditor[commandId] == editorId else { return false }
        pendingEditor.removeValue(forKey: commandId)
        var completed = result
        if completed["completedAt"] == nil { completed["completedAt"] = Self.now() }
        results[commandId] = completed
        condition.broadcast()
        return true
    }

    private func dispatch(action: String, editorId: String?, editorNumber: Int?, params: [String: Any], timeout: TimeInterval) -> [String: Any] {
        condition.lock()
        defer { condition.unlock() }
        prune()
        let target = editorId.flatMap { editors[$0] != nil ? $0 : nil }
            ?? editorNumber.flatMap { number in editors.first { ($0.value["editorNumber"] as? Int) == number }?.key }
        guard let target else {
            return ["commandId": "", "ok": false, "completedAt": Self.now(),
                    "error": editorNumber.map { "No open SketchForge editor \($0)" } ?? "No matching open SketchForge editor"]
        }
        let commandId = UUID().uuidString.lowercased()
        queues[target, default: []].append(["id": commandId, "action": action, "params": params, "createdAt": Self.now()])
        pendingEditor[commandId] = target
        condition.broadcast()

        let deadline = Date().addingTimeInterval(min(max(timeout, 1), 60))
        while results[commandId] == nil, condition.wait(until: deadline) {}
        pendingEditor.removeValue(forKey: commandId)
        if let result = results.removeValue(forKey: commandId) { return result }
        let number = editors[target]?["editorNumber"] ?? editorNumber ?? 0
        return ["commandId": commandId, "ok": false, "completedAt": Self.now(),
                "error": "Timed out waiting for SketchForge editor \(number)"]
    }

    /// Drops editors that stopped heartbeating; fails their pending commands.
    /// Caller holds the lock.
    private func prune() {
        let now = Date()
        for (id, seen) in lastSeen where (activePolls[id] ?? 0) == 0 && now.timeIntervalSince(seen) > Self.staleAfter {
            let number = editors[id]?["editorNumber"] ?? 0
            editors.removeValue(forKey: id)
            lastSeen.removeValue(forKey: id)
            queues.removeValue(forKey: id)
            for (commandId, editor) in pendingEditor where editor == id {
                pendingEditor.removeValue(forKey: commandId)
                results[commandId] = ["commandId": commandId, "ok": false, "completedAt": Self.now(),
                                      "error": "SketchForge editor \(number) is no longer open"]
            }
            condition.broadcast()
        }
    }

    private static func now() -> Int { Int(Date().timeIntervalSince1970 * 1000) }
}

/// Minimal HTTP/1.1 endpoint on 127.0.0.1 exposing only `/api/sketchforge-mcp`, so
/// `scripts/sketchforge-mcp-server.mjs` (SKETCHFORGE_URL=http://127.0.0.1:<port>)
/// can drive the app. Requests carrying an Origin header, or a Host other than the
/// loopback address, are refused: that blocks web pages (CSRF) and DNS rebinding.
final class McpHTTPServer {
    let port: UInt16
    private let bridge: McpBridge
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "com.sketchforge.mcp-http", qos: .userInitiated, attributes: .concurrent)
    private static let maxRequestBytes = 16 * 1024 * 1024

    init(bridge: McpBridge, port: UInt16) {
        self.bridge = bridge
        self.port = port
    }

    var isRunning: Bool { listener != nil }

    func start() throws {
        guard listener == nil, let endpointPort = NWEndpoint.Port(rawValue: port) else { return }
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: endpointPort)
        parameters.allowLocalEndpointReuse = true
        let listener = try NWListener(using: parameters)
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.start(queue: queue)
        self.listener = listener
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return connection.cancel() }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let request = HTTPRequest(buffer) {
                return self.respond(to: request, on: connection)
            }
            if error != nil || isComplete || buffer.count > Self.maxRequestBytes {
                return self.send(.error("Bad request", status: 400), on: connection)
            }
            self.receive(on: connection, buffer: buffer)
        }
    }

    private func respond(to request: HTTPRequest, on connection: NWConnection) {
        let allowedHosts = ["127.0.0.1:\(port)", "localhost:\(port)"]
        guard request.headers["origin"] == nil, allowedHosts.contains(request.headers["host"] ?? "") else {
            return send(.error("SketchForge MCP only accepts local, non-browser requests.", status: 403), on: connection)
        }
        guard request.path.split(separator: "?").first.map(String.init) == McpBridge.route else {
            return send(.error("Not found", status: 404), on: connection)
        }
        // Commands block until the editor answers; keep that off the network queue.
        DispatchQueue.global(qos: .userInitiated).async { [bridge] in
            self.send(bridge.handle(method: request.method, body: request.body), on: connection)
        }
    }

    private func send(_ response: SchemeResponse, on connection: NWConnection) {
        let reason = HTTPURLResponse.localizedString(forStatusCode: response.status).capitalized
        var head = "HTTP/1.1 \(response.status) \(reason)\r\n"
        var headers = response.headers
        headers["Content-Length"] = String(response.body.count)
        headers["Connection"] = "close"
        for (name, value) in headers { head += "\(name): \(value)\r\n" }
        head += "\r\n"
        connection.send(content: Data(head.utf8) + response.body, completion: .contentProcessed { _ in connection.cancel() })
    }
}

/// A complete HTTP request parsed from a buffer, or nil while more bytes are needed.
private struct HTTPRequest {
    let method: String
    let path: String
    let headers: [String: String]
    let body: Data

    init?(_ buffer: Data) {
        guard let headerEnd = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let lines = String(decoding: buffer[..<headerEnd.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
        let requestLine = lines.first?.split(separator: " ") ?? []
        guard requestLine.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let length = Int(headers["content-length"] ?? "0") ?? 0
        let bodyStart = headerEnd.upperBound
        guard buffer.count - bodyStart >= length else { return nil }
        method = String(requestLine[0]).uppercased()
        path = String(requestLine[1])
        self.headers = headers
        body = Data(buffer[bodyStart..<(bodyStart + length)])
    }
}
