import Foundation
import WebKit

/// A response produced off the main thread and delivered to a `WKURLSchemeTask`.
struct SchemeResponse {
    var status: Int
    var headers: [String: String]
    var body: Data

    static func json(_ object: Any, status: Int = 200) -> SchemeResponse {
        let body = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
        return SchemeResponse(status: status, headers: ["Content-Type": "application/json", "Cache-Control": "no-store"], body: body)
    }

    static func error(_ message: String, status: Int) -> SchemeResponse {
        json(["error": message], status: status)
    }

    static func text(_ message: String, status: Int) -> SchemeResponse {
        SchemeResponse(status: status, headers: ["Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"], body: Data(message.utf8))
    }
}

/// Serves the static SketchForge export from the app bundle as `sketchforge://app/…`
/// and routes `/api/*` to `NativeAPI`. A custom scheme gives the page a stable origin
/// (so localStorage and IndexedDB persist) without a local HTTP server or port.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private let api: NativeAPI
    private let queue = DispatchQueue(label: "com.sketchforge.scheme", qos: .userInitiated, attributes: .concurrent)
    /// Tasks WebKit has not stopped yet. Touched on the main thread only.
    private var liveTasks = Set<ObjectIdentifier>()

    init(root: URL, api: NativeAPI) {
        self.root = root
        self.api = api
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let id = ObjectIdentifier(task)
        liveTasks.insert(id)
        let request = task.request
        queue.async { [self] in
            let response = respond(to: request)
            DispatchQueue.main.async { [self] in
                guard liveTasks.remove(id) != nil, let url = request.url else { return }
                var headers = response.headers
                headers["Content-Length"] = String(response.body.count)
                let http = HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: headers)!
                task.didReceive(http)
                if request.httpMethod != "HEAD", !response.body.isEmpty {
                    task.didReceive(response.body)
                }
                task.didFinish()
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        liveTasks.remove(ObjectIdentifier(task))
    }

    private func respond(to request: URLRequest) -> SchemeResponse {
        guard let url = request.url, url.host == AppInfo.host else {
            return .text("Not found", status: 404)
        }
        let path = url.path.isEmpty ? "/" : url.path
        if path.hasPrefix("/api/") || path.hasPrefix(NativeAPI.openFilePrefix) {
            return api.handle(request, path: path)
        }
        return serveStatic(path: path, trailingSlash: url.absoluteString.split(separator: "?")[0].hasSuffix("/"))
    }

    private func serveStatic(path: String, trailingSlash: Bool) -> SchemeResponse {
        let components = path.split(separator: "/").map(String.init)
        guard !components.contains(where: { $0 == ".." || $0.hasPrefix(".") && $0 != ".well-known" }) else {
            return .text("Not found", status: 404)
        }
        var file = components.reduce(root) { $0.appendingPathComponent($1) }
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), isDirectory.boolValue || trailingSlash {
            file.appendPathComponent("index.html")
        }
        guard file.standardizedFileURL.path.hasPrefix(root.path),
              let data = try? Data(contentsOf: file, options: .alwaysMapped)
        else {
            let notFound = (try? Data(contentsOf: root.appendingPathComponent("404.html"))) ?? Data("Not found".utf8)
            return SchemeResponse(status: 404, headers: ["Content-Type": "text/html; charset=utf-8"], body: notFound)
        }
        let immutable = path.hasPrefix("/_next/static/")
        return SchemeResponse(
            status: 200,
            headers: [
                "Content-Type": Self.mimeType(for: file.pathExtension),
                "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
            ],
            body: data
        )
    }

    static func mimeType(for pathExtension: String) -> String {
        switch pathExtension.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json"
        case "txt": return "text/plain; charset=utf-8"
        case "wasm": return "application/wasm"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "ico": return "image/x-icon"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "mp4": return "video/mp4"
        case "webm": return "video/webm"
        case "stl": return "model/stl"
        case "obj": return "model/obj"
        case "step", "stp": return "model/step"
        case "skf": return "application/vnd.sketchforge.project+zip"
        default: return "application/octet-stream"
        }
    }
}
