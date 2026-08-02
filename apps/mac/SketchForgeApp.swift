import AppKit
import Darwin
import WebKit

private let loopbackHost = "127.0.0.1"
private let loopbackPort: UInt16 = 3000

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: Process?
    private var serverLog: FileHandle?
    private var serverOrigin: URL?
    private var isTerminating = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMainMenu()
        createWindow()
        NSApp.activate(ignoringOtherApps: true)

        do {
            try startServer()
        } catch {
            let message = error.localizedDescription
            NSLog("SketchForge startup failed: %@", message)
            if let bytes = "Native startup failed: \(message)\n".data(using: .utf8) {
                try? serverLog?.write(contentsOf: bytes)
                try? serverLog?.synchronize()
            }
            presentStartupFailure(message)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        isTerminating = true
        if let server, server.isRunning {
            server.terminate()
            server.waitUntilExit()
        }
        try? serverLog?.close()
    }

    private func createWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "SketchForge"
        window.tabbingMode = .disallowed
        window.minSize = NSSize(width: 900, height: 620)
        window.contentView = webView
        window.delegate = self
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    private func startServer() throws {
        guard let resources = Bundle.main.resourceURL else {
            throw AppError("The application resources could not be found.")
        }

        let node = resources.appendingPathComponent("runtime/node")
        let serverDirectory = resources.appendingPathComponent("server")
        let serverScript = serverDirectory.appendingPathComponent("apps/web/server.js")
        guard FileManager.default.isExecutableFile(atPath: node.path) else {
            throw AppError("The bundled Node.js runtime is missing or is not executable.")
        }
        guard FileManager.default.fileExists(atPath: serverScript.path) else {
            throw AppError("The bundled SketchForge server is missing.")
        }

        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("SketchForge", isDirectory: true)
        let projects = applicationSupport.appendingPathComponent("Projects", isDirectory: true)
        let logs = applicationSupport.appendingPathComponent("Logs", isDirectory: true)
        try FileManager.default.createDirectory(at: projects, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)

        let logURL = logs.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        let logHandle = try FileHandle(forWritingTo: logURL)
        try logHandle.truncate(atOffset: 0)
        serverLog = logHandle

        let port = try availableLoopbackPort(requestedPort: loopbackPort)
        let origin = URL(string: "http://\(loopbackHost):\(port)")!
        serverOrigin = origin

        let process = Process()
        process.executableURL = node
        process.arguments = [serverScript.path]
        process.currentDirectoryURL = serverDirectory
        process.standardOutput = logHandle
        process.standardError = logHandle
        process.environment = ProcessInfo.processInfo.environment.merging([
            "NODE_ENV": "production",
            "NEXT_TELEMETRY_DISABLED": "1",
            "HOSTNAME": loopbackHost,
            "PORT": String(port),
            "SKETCHFORGE_ENABLE_MCP": "true",
            "SKETCHFORGE_SHARED_PROJECTS_DIR": projects.path,
        ]) { _, packagedValue in packagedValue }
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                guard let self, !self.isTerminating else { return }
                self.presentStartupFailure("The local SketchForge server stopped unexpectedly (exit code \(process.terminationStatus)). See \(logURL.path).")
            }
        }

        try process.run()
        server = process
        waitForServer(origin: origin, attemptsRemaining: 200)
    }

    private func waitForServer(origin: URL, attemptsRemaining: Int) {
        guard attemptsRemaining > 0 else {
            presentStartupFailure("The local SketchForge server did not become ready. See ~/Library/Application Support/SketchForge/Logs/server.log.")
            return
        }

        var request = URLRequest(url: origin.appendingPathComponent("api/shared-projects"))
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            let ready = (response as? HTTPURLResponse).map { (200..<500).contains($0.statusCode) } ?? false
            DispatchQueue.main.asyncAfter(deadline: .now() + (ready ? 0 : 0.1)) {
                guard let self else { return }
                if ready {
                    self.webView.load(URLRequest(url: origin))
                } else if self.server?.isRunning == true {
                    self.waitForServer(origin: origin, attemptsRemaining: attemptsRemaining - 1)
                }
            }
        }.resume()
    }

    private func availableLoopbackPort(requestedPort: UInt16 = 0) throws -> UInt16 {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw AppError("Could not allocate a local server socket.") }
        defer { close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = requestedPort.bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr(loopbackHost))

        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else {
            if requestedPort != 0 {
                throw AppError("SketchForge's local port \(requestedPort) is already in use. Close the process using that port and reopen SketchForge.")
            }
            throw AppError("Could not reserve a local server port.")
        }

        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let named = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(descriptor, $0, &length)
            }
        }
        guard named == 0 else { throw AppError("Could not determine the local server port.") }
        return UInt16(bigEndian: address.sin_port)
    }

    private func presentStartupFailure(_ message: String) {
        guard window != nil else { return }
        let html = """
        <!doctype html><meta charset="utf-8"><style>
        body{font:16px -apple-system;padding:48px;background:#111827;color:#f9fafb}main{max-width:720px;margin:auto}
        h1{font-size:28px}.detail{white-space:pre-wrap;color:#d1d5db;line-height:1.5}
        </style><main><h1>SketchForge could not start</h1><div class="detail">\(escapeHTML(message))</div></main>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    private func escapeHTML(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
        } else if isLocalAppURL(url) || url.scheme == "about" || url.scheme == "blob" {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.url : nil)
        }
    }

    private func isLocalAppURL(_ url: URL) -> Bool {
        guard let origin = serverOrigin else { return false }
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    private func installMainMenu() {
        let mainMenu = NSMenu()
        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About SketchForge", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit SketchForge", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        NSApp.mainMenu = mainMenu
    }
}

private struct AppError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

@main
private enum SketchForgeMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            application.applicationIconImage = icon
        }
        application.run()
        withExtendedLifetime(delegate) {}
    }
}
