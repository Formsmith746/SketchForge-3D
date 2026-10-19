import AppKit
import UniformTypeIdentifiers
import WebKit

/// Owns the single SketchForge window and its web view.
@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate {
    let webView: SketchForgeWebView
    private let nativeAPI: NativeAPI
    private let schemeHandler: AppSchemeHandler
    private let updater: Updater
    private var pageReady = false
    private var pendingOpenURLs: [URL] = []
    private var lastSaveDirectory: URL?
    private var crashReloads: [Date] = []
    private var quitCompletion: (@MainActor () -> Void)?

    private static let chromeColorKey = "ChromeColor"
    private static let frameName = "SketchForgeMainWindow"

    init(updater: Updater, mcp: McpBridge) {
        self.updater = updater
        nativeAPI = NativeAPI(supportDirectory: AppInfo.supportDirectory, mcp: mcp)
        schemeHandler = AppSchemeHandler(root: AppInfo.webRoot, api: nativeAPI)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: AppInfo.scheme)
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.preferences.isFraudulentWebsiteWarningEnabled = false
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // Look like Safari on this macOS to UA sniffers, and identify the desktop app.
        let osMajor = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
        configuration.applicationNameForUserAgent = "Version/\(osMajor).0 Safari/605.1.15 SketchForgeDesktop/\(AppInfo.version)"
        WebKitTuning.apply(to: configuration.preferences)

        let content = configuration.userContentController
        content.addUserScript(WKUserScript(source: BridgeScripts.desktopBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addUserScript(WKUserScript(source: BridgeScripts.fetchBodyShim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addUserScript(WKUserScript(source: BridgeScripts.chromeColorReporter, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addUserScript(WKUserScript(source: BridgeScripts.desktopPolish, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        webView = SketchForgeWebView(frame: .zero, configuration: configuration)
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) {
            webView.isInspectable = UserDefaults.standard.bool(forKey: "WebInspectorEnabled") || AppInfo.devServerURL != nil
        }

        let chrome = Self.storedChromeColor()
        webView.underPageBackgroundColor = chrome

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 920),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "SketchForge"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = chrome
        window.minSize = NSSize(width: 1024, height: 680)
        window.tabbingMode = .disallowed
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        if !window.setFrameUsingName(Self.frameName) { window.center() }
        window.setFrameAutosaveName(Self.frameName)

        super.init(window: window)
        window.delegate = self
        webView.navigationDelegate = self
        webView.uiDelegate = self
        content.addScriptMessageHandler(self, contentWorld: .page, name: BridgeScripts.handlerName)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    func loadApp() {
        if let devURL = AppInfo.devServerURL {
            webView.load(URLRequest(url: devURL))
        } else {
            webView.load(URLRequest(url: AppInfo.startURL))
        }
    }

    func present() {
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: Window

    /// Closing hides the window so the editor (and any running CAD job) survives;
    /// clicking the Dock icon brings it straight back. ⌘Q quits.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    private func applyChromeColor(_ cssColor: String) {
        guard let color = Self.parseCSSColor(cssColor), let window else { return }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            window.animator().backgroundColor = color
        }
        webView.underPageBackgroundColor = color
        UserDefaults.standard.set(cssColor, forKey: Self.chromeColorKey)
    }

    private static func storedChromeColor() -> NSColor {
        UserDefaults.standard.string(forKey: chromeColorKey).flatMap(parseCSSColor)
            ?? NSColor(srgbRed: 0.08, green: 0.43, blue: 0.96, alpha: 1)
    }

    static func parseCSSColor(_ value: String) -> NSColor? {
        let numbers = value
            .components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted)
            .compactMap(Double.init)
        guard value.hasPrefix("rgb"), numbers.count >= 3 else { return nil }
        return NSColor(srgbRed: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: 1)
    }

    // MARK: Opening files

    func open(_ urls: [URL]) {
        let accepted = urls.filter { ["skf", "stl", "obj", "step", "stp", "svg"].contains($0.pathExtension.lowercased()) }
        guard !accepted.isEmpty else { return }
        accepted.forEach { NSDocumentController.shared.noteNewRecentDocumentURL($0) }
        pendingOpenURLs.append(contentsOf: accepted)
        present()
        flushPendingOpenURLs()
    }

    func showOpenPanel() {
        guard let window else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = ["skf", "stl", "obj", "step", "stp", "svg"].compactMap { UTType(filenameExtension: $0) }
        panel.message = "Open a SketchForge project or import STL, OBJ, STEP or SVG geometry."
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK else { return }
            self?.open(panel.urls)
        }
    }

    private func flushPendingOpenURLs() {
        guard pageReady, !pendingOpenURLs.isEmpty else { return }
        let urls = pendingOpenURLs
        pendingOpenURLs.removeAll()
        // The dashboard accepts one .skf at a time; geometry can be imported together.
        let projects = urls.filter { $0.pathExtension.lowercased() == "skf" }
        let geometry = urls.filter { $0.pathExtension.lowercased() != "skf" }
        let batches = projects.map { [$0] } + (geometry.isEmpty ? [] : [geometry])
        Task { @MainActor in
            for batch in batches {
                let items: [[String: Any]] = batch.map { url in
                    let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
                    return ["url": nativeAPI.registerOpenFile(url), "name": url.lastPathComponent, "modified": modified.timeIntervalSince1970 * 1000]
                }
                do {
                    let result = try await webView.callAsyncJavaScript(BridgeScripts.openFiles, arguments: ["items": items], contentWorld: .page)
                    if result as? String == "not-ready" {
                        pendingOpenURLs.append(contentsOf: batch)
                        return
                    }
                } catch {
                    presentError(title: "Could not open \(batch.map(\.lastPathComponent).joined(separator: ", "))", message: error.localizedDescription)
                }
            }
        }
    }

    // MARK: Quit

    func prepareForQuit(_ done: @escaping @MainActor () -> Void) {
        guard pageReady else { return done() }
        quitCompletion = done
        webView.callAsyncJavaScript(BridgeScripts.prepareForQuit, arguments: [:], in: nil, in: .page) { [weak self] _ in
            self?.finishQuit()
        }
        // Never let a busy page block quitting.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.finishQuit() }
    }

    private func finishQuit() {
        quitCompletion?()
        quitCompletion = nil
    }

    private func presentError(title: String, message: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = message
        if let window, window.isVisible { alert.beginSheetModal(for: window) } else { alert.runModal() }
    }
}

// MARK: - Bridge

extension MainWindowController: WKScriptMessageHandlerWithReply {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            return replyHandler(nil, "Invalid message")
        }
        switch type {
        case "getVersion":
            replyHandler(AppInfo.version, nil)
        case "checkForUpdates":
            Task { replyHandler(updater.payload(await updater.check()), nil) }
        case "installUpdate":
            Task { replyHandler(updater.payload(await updater.installLatest()), nil) }
        #if SKETCHFORGE_AUTOMATION
        case "automationKey":
            Automation.sendKey(body, to: window)
            replyHandler(true, nil)
        #endif
        case "chromeColor":
            if let color = body["color"] as? String { applyChromeColor(color) }
            replyHandler(nil, nil)
        default:
            replyHandler(nil, "Unknown message \(type)")
        }
    }
}

// MARK: - Navigation

extension MainWindowController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 preferences: WKWebpagePreferences) async -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        if action.shouldPerformDownload { return (.download, preferences) }
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return (.cancel, preferences) }

        let isAppURL = scheme == AppInfo.scheme
            || (AppInfo.devServerURL.map { url.host == $0.host && url.port == $0.port } ?? false)
        if isAppURL || scheme == "about" || scheme == "blob" || scheme == "data" {
            return (.allow, preferences)
        }
        // Links to the website, GitHub, the license… open in the user's browser.
        if action.targetFrame?.isMainFrame ?? true, ["http", "https", "mailto"].contains(scheme) {
            NSWorkspace.shared.open(url)
            return (.cancel, preferences)
        }
        return (action.targetFrame?.isMainFrame == false ? .allow : .cancel, preferences)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        response.canShowMIMEType ? .allow : .download
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        flushPendingOpenURLs()
        #if SKETCHFORGE_AUTOMATION
        Automation.pageDidLoad(in: webView)
        #endif
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        pageReady = false
    }

    /// The web content process can be killed under memory pressure (very large
    /// STEP imports) or crash. Projects autosave, so reload instead of leaving a
    /// blank window; stop retrying if it keeps happening.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        pageReady = false
        crashReloads = crashReloads.filter { Date().timeIntervalSince($0) < 60 } + [Date()]
        if crashReloads.count <= 2 {
            loadApp()
        } else {
            presentError(title: "SketchForge stopped responding",
                         message: "The editor closed unexpectedly several times. Your projects are saved locally. Choose View ▸ Reload Editor to try again.")
        }
    }
}

// MARK: - Downloads (exports)

extension MainWindowController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        #if SKETCHFORGE_AUTOMATION
        if let directory = ProcessInfo.processInfo.environment["SKETCHFORGE_AUTOMATION_DOWNLOAD_DIR"] {
            let url = URL(fileURLWithPath: directory).appendingPathComponent(suggestedFilename)
            try? FileManager.default.removeItem(at: url)
            return completionHandler(url)
        }
        #endif
        guard let window else { return completionHandler(nil) }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        panel.directoryURL = lastSaveDirectory ?? FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        let ext = (suggestedFilename as NSString).pathExtension
        if !ext.isEmpty, let type = UTType(filenameExtension: ext) { panel.allowedContentTypes = [type] }
        panel.beginSheetModal(for: window) { [weak self] result in
            guard result == .OK, let url = panel.url else { return completionHandler(nil) }
            // The panel already asked about replacing; WKDownload refuses existing files.
            try? FileManager.default.removeItem(at: url)
            self?.lastSaveDirectory = url.deletingLastPathComponent()
            completionHandler(url)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let path = download.progress.fileURL?.path else { return }
        // Bounces the Downloads stack in the Dock like Safari does.
        DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: path)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if (error as NSError).code == NSUserCancelledError { return }
        presentError(title: "Export failed", message: error.localizedDescription)
    }
}

// MARK: - Panels and dialogs

extension MainWindowController: WKUIDelegate {
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let window else { return completionHandler(nil) }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        // The page's `accept` list is only exposed through WebKit's private API.
        let extensionsSelector = NSSelectorFromString("_allowedFileExtensions")
        if parameters.responds(to: extensionsSelector),
           let extensions = parameters.perform(extensionsSelector)?.takeUnretainedValue() as? [String] {
            let types = extensions.compactMap { UTType(filenameExtension: $0.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
            if !types.isEmpty { panel.allowedContentTypes = types }
        }
        panel.beginSheetModal(for: window) { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.scheme == AppInfo.scheme { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = message
        _ = await runSheet(alert)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        return await runSheet(alert) == .alertFirstButtonReturn
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        let alert = NSAlert()
        alert.messageText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        return await runSheet(alert) == .alertFirstButtonReturn ? field.stringValue : nil
    }

    private func runSheet(_ alert: NSAlert) async -> NSApplication.ModalResponse {
        guard let window, window.isVisible else { return alert.runModal() }
        return await withCheckedContinuation { continuation in
            alert.beginSheetModal(for: window) { continuation.resume(returning: $0) }
        }
    }
}

// MARK: - Web view

/// Trims browser-only items (Reload, Back, Open in New Window…) from context menus;
/// text editing items such as Cut/Copy/Paste and Look Up stay.
final class SketchForgeWebView: WKWebView {
    private static let hiddenIdentifiers: Set<String> = [
        "WKMenuItemIdentifierReload",
        "WKMenuItemIdentifierGoBack",
        "WKMenuItemIdentifierGoForward",
        "WKMenuItemIdentifierOpenLinkInNewWindow",
        "WKMenuItemIdentifierDownloadLinkedFile",
        "WKMenuItemIdentifierOpenImageInNewWindow",
        "WKMenuItemIdentifierDownloadImage",
        "WKMenuItemIdentifierOpenFrameInNewWindow",
        "WKMenuItemIdentifierOpenMediaInNewWindow",
        "WKMenuItemIdentifierDownloadMedia",
        "WKMenuItemIdentifierShareMenu",
    ]

    override func willOpenMenu(_ menu: NSMenu, with event: NSEvent) {
        for item in menu.items where Self.hiddenIdentifiers.contains(item.identifier?.rawValue ?? "") {
            menu.removeItem(item)
        }
        // Drop separators left dangling at the edges or doubled up.
        var previousWasSeparator = true
        for item in menu.items {
            if item.isSeparatorItem && previousWasSeparator { menu.removeItem(item) } else { previousWasSeparator = item.isSeparatorItem }
        }
        if menu.items.last?.isSeparatorItem == true { menu.removeItem(menu.items.last!) }
        super.willOpenMenu(menu, with: event)
    }
}
