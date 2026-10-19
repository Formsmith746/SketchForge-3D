import Foundation

/// Native replacements for the Next.js route handlers in `apps/web/src/app/api`.
/// Request and response shapes mirror the upstream routes so the web UI runs
/// unchanged. Methods run on a background queue and must stay thread-safe.
final class NativeAPI {
    static let openFilePrefix = "/__native/open/"

    private static let maxThumbnailBytes = 5 * 1024 * 1024
    private static let maxTextDownloadBytes = 25 * 1024 * 1024
    private static let maxBinaryDownloadBytes = 512 * 1024 * 1024
    private static let pngDataURLPrefix = "data:image/png;base64,"

    private let thumbnailDirectory: URL
    private let mcp: McpBridge
    private let lock = NSLock()
    private var openFiles: [String: URL] = [:]

    init(supportDirectory: URL, mcp: McpBridge) {
        thumbnailDirectory = supportDirectory.appendingPathComponent("Thumbnails", isDirectory: true)
        self.mcp = mcp
    }

    // MARK: Routing

    func handle(_ request: URLRequest, path: String) -> SchemeResponse {
        let method = (request.httpMethod ?? "GET").uppercased()
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []

        if path.hasPrefix(Self.openFilePrefix) {
            return serveOpenFile(token: String(path.dropFirst(Self.openFilePrefix.count)))
        }

        switch path {
        case "/api/shared-projects":
            // Shared folders are a Docker/FabLab server feature; the desktop app keeps
            // projects local, exactly like the Electron build (empty SHARED_PROJECTS_DIR).
            return method == "GET"
                ? .json(["enabled": false, "projects": []])
                : .error("Shared projects are not enabled", status: 404)
        case "/api/project-thumbnail":
            let projectId = query.first(where: { $0.name == "projectId" })?.value ?? ""
            switch method {
            case "GET": return readThumbnail(projectId: projectId)
            case "POST": return writeThumbnail(body: Self.body(of: request))
            case "DELETE": return deleteThumbnail(projectId: projectId)
            default: return .error("Method not allowed", status: 405)
            }
        case McpBridge.route:
            return mcp.handle(method: method, body: Self.body(of: request))
        case "/api/local-download":
            return method == "POST" ? saveToFolder(request) : .error("Method not allowed", status: 405)
        default:
            // app-update is answered by the native updater bridge; the screenshot
            // route is local-development tooling.
            return .error("Not available in the macOS app", status: 404)
        }
    }

    // MARK: Files opened from Finder / File > Open

    /// Exposes a local file to the page once, via an unguessable URL.
    func registerOpenFile(_ url: URL) -> String {
        let token = UUID().uuidString
        lock.lock()
        openFiles[token] = url
        lock.unlock()
        return Self.openFilePrefix + token
    }

    private func serveOpenFile(token: String) -> SchemeResponse {
        lock.lock()
        let url = openFiles.removeValue(forKey: token)
        lock.unlock()
        guard let url, let data = try? Data(contentsOf: url, options: .alwaysMapped) else {
            return .text("Not found", status: 404)
        }
        return SchemeResponse(status: 200, headers: ["Content-Type": "application/octet-stream", "Cache-Control": "no-store"], body: data)
    }

    // MARK: Thumbnails

    private func thumbnailURL(projectId: String) -> URL? {
        let safe = projectId.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
        return safe.isEmpty ? nil : thumbnailDirectory.appendingPathComponent("\(safe).png")
    }

    private func readThumbnail(projectId: String) -> SchemeResponse {
        guard let url = thumbnailURL(projectId: projectId) else { return .text("Invalid project id", status: 400) }
        guard let data = try? Data(contentsOf: url) else { return .text("Thumbnail not found", status: 404) }
        return SchemeResponse(status: 200, headers: ["Content-Type": "image/png", "Cache-Control": "no-store"], body: data)
    }

    private func writeThumbnail(body: Data) -> SchemeResponse {
        guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let projectId = object["projectId"] as? String,
              let dataURL = object["dataUrl"] as? String
        else { return .error("Invalid thumbnail request", status: 400) }
        guard let url = thumbnailURL(projectId: projectId), dataURL.hasPrefix(Self.pngDataURLPrefix),
              let png = Data(base64Encoded: String(dataURL.dropFirst(Self.pngDataURLPrefix.count)))
        else { return .error("Invalid thumbnail image", status: 400) }
        guard png.count <= Self.maxThumbnailBytes else { return .error("Thumbnail image is too large", status: 413) }
        do {
            try FileManager.default.createDirectory(at: thumbnailDirectory, withIntermediateDirectories: true)
            try png.write(to: url, options: .atomic)
            return .json(["version": Int(Date().timeIntervalSince1970 * 1000)])
        } catch {
            return .error(error.localizedDescription, status: 500)
        }
    }

    private func deleteThumbnail(projectId: String) -> SchemeResponse {
        guard let url = thumbnailURL(projectId: projectId) else { return .error("Invalid project id", status: 400) }
        try? FileManager.default.removeItem(at: url)
        return .json(["deleted": true])
    }

    // MARK: Save to folder

    private func saveToFolder(_ request: URLRequest) -> SchemeResponse {
        let body = Self.body(of: request)
        let contentType = request.value(forHTTPHeaderField: "Content-Type") ?? ""
        let filename: String
        let folder: String
        let content: Data

        if contentType.lowercased().hasPrefix("multipart/form-data") {
            guard let parts = Multipart.parse(body, contentType: contentType),
                  let file = parts["file"]?.data,
                  let name = parts["filename"]?.string,
                  let target = parts["folder"]?.string
            else { return .error("Invalid binary download request", status: 400) }
            guard file.count <= Self.maxBinaryDownloadBytes else { return .error("File is too large for local folder download", status: 413) }
            (filename, folder, content) = (name, target, file)
        } else {
            guard let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                  let text = object["content"] as? String,
                  let name = object["filename"] as? String,
                  let target = object["folder"] as? String
            else { return .error("Invalid download request", status: 400) }
            let data = Data(text.utf8)
            guard data.count <= Self.maxTextDownloadBytes else { return .error("File is too large for local folder download", status: 413) }
            (filename, folder, content) = (name, target, data)
        }

        let trimmed = folder.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .error("Choose a folder first", status: 400) }

        let expanded = (trimmed as NSString).expandingTildeInPath
        let directory = expanded.hasPrefix("/")
            ? URL(fileURLWithPath: expanded, isDirectory: true)
            : FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(expanded, isDirectory: true)
        let safeName = Self.safeFileName(filename)
        let target = directory.appendingPathComponent(safeName).standardizedFileURL
        guard target.deletingLastPathComponent().path == directory.standardizedFileURL.path else {
            return .error("Invalid file path", status: 400)
        }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try content.write(to: target, options: .atomic)
            return .json(["path": target.path])
        } catch {
            return .error(error.localizedDescription, status: 500)
        }
    }

    static func safeFileName(_ name: String) -> String {
        let base = (name as NSString).lastPathComponent
        let invalid = CharacterSet(charactersIn: "<>:\"/\\|?*").union(.controlCharacters)
        let cleaned = String(base.unicodeScalars.map { invalid.contains($0) ? "_" : Character($0) })
            .trimmingCharacters(in: .whitespaces)
        return cleaned.isEmpty || cleaned == "." || cleaned == ".." ? "download.txt" : cleaned
    }

    // MARK: Request bodies

    /// WebKit hands custom-scheme bodies over either as `httpBody` or as a stream.
    static func body(of request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        let chunk = 256 * 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: chunk)
        defer { buffer.deallocate() }
        while true {
            let read = stream.read(buffer, maxLength: chunk)
            if read <= 0 { break }
            data.append(buffer, count: read)
        }
        return data
    }
}

/// Minimal multipart/form-data reader for the `local-download` route.
enum Multipart {
    struct Part {
        var data: Data
        var string: String? { String(data: data, encoding: .utf8) }
    }

    static func parse(_ body: Data, contentType: String) -> [String: Part]? {
        guard let boundaryParameter = contentType
            .split(separator: ";")
            .map({ $0.trimmingCharacters(in: .whitespaces) })
            .first(where: { $0.lowercased().hasPrefix("boundary=") })
        else { return nil }
        let boundary = boundaryParameter.dropFirst("boundary=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        let delimiter = Data("--\(boundary)".utf8)
        let headerEnd = Data("\r\n\r\n".utf8)
        var parts: [String: Part] = [:]

        var cursor = body.startIndex
        guard let first = body.range(of: delimiter, in: cursor..<body.endIndex) else { return nil }
        cursor = first.upperBound
        while cursor < body.endIndex {
            // "--" after a delimiter ends the body.
            if body[cursor...].starts(with: Data("--".utf8)) { break }
            guard let headersRange = body.range(of: headerEnd, in: cursor..<body.endIndex),
                  let next = body.range(of: delimiter, in: headersRange.upperBound..<body.endIndex)
            else { break }
            let headers = String(decoding: body[cursor..<headersRange.lowerBound], as: UTF8.self)
            var contentEnd = next.lowerBound
            if contentEnd - headersRange.upperBound >= 2,
               body[contentEnd - 2] == 0x0D, body[contentEnd - 1] == 0x0A {
                contentEnd -= 2
            }
            if let name = fieldName(in: headers) {
                parts[name] = Part(data: Data(body[headersRange.upperBound..<contentEnd]))
            }
            cursor = next.upperBound
        }
        return parts
    }

    private static func fieldName(in headers: String) -> String? {
        guard let disposition = headers
            .components(separatedBy: "\r\n")
            .first(where: { $0.lowercased().hasPrefix("content-disposition:") }),
            let range = disposition.range(of: "name=\"")
        else { return nil }
        let rest = disposition[range.upperBound...]
        guard let end = rest.firstIndex(of: "\"") else { return nil }
        return String(rest[..<end])
    }
}
