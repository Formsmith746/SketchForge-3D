import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let updater = Updater()
    private let aiControl = AIControl()
    private var controller: MainWindowController!
    private var pendingURLs: [URL] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.build(target: self)
        // Create the web view as early as possible so WebKit's processes spin up
        // while AppKit finishes launching.
        controller = MainWindowController(updater: updater, mcp: aiControl.bridge)
        controller.loadApp()
        aiControl.startIfEnabled()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller.present()
        if !pendingURLs.isEmpty {
            controller.open(pendingURLs)
            pendingURLs.removeAll()
        }
        LegacyDataNotice.showIfNeeded(over: controller.window)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let controller else { return pendingURLs.append(contentsOf: urls) }
        controller.open(urls)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { controller.present() }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        controller.prepareForQuit { NSApp.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }

    // MARK: Menu actions

    @objc func showAbout(_ sender: Any?) {
        let credits = NSMutableAttributedString(
            string: "A local-first 3D design editor.\nLicensed under the GNU AGPLv3.\n",
            attributes: [.font: NSFont.systemFont(ofSize: 11), .foregroundColor: NSColor.secondaryLabelColor]
        )
        credits.append(NSAttributedString(string: "sketchforge3d.com", attributes: [.link: AppInfo.websiteURL, .font: NSFont.systemFont(ofSize: 11)]))
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        credits.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: credits.length))
        NSApp.orderFrontStandardAboutPanel(options: [.credits: credits])
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func checkForUpdates(_ sender: Any?) { updater.checkInteractively() }
    @objc func showAIControl(_ sender: Any?) { controller.present(); aiControl.showPanel(over: controller.window) }
    @objc func openDocument(_ sender: Any?) { controller.present(); controller.showOpenPanel() }
    @objc func showMainWindow(_ sender: Any?) { controller.present() }
    @objc func reloadEditor(_ sender: Any?) { controller.loadApp() }
    @objc func openWebsite(_ sender: Any?) { NSWorkspace.shared.open(AppInfo.websiteURL) }
    @objc func openSource(_ sender: Any?) { NSWorkspace.shared.open(AppInfo.sourceURL) }
    @objc func reportIssue(_ sender: Any?) { NSWorkspace.shared.open(AppInfo.issuesURL) }
}
