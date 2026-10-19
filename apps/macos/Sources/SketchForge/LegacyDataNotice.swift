import AppKit

/// Projects made with the Electron build live in Chromium storage under
/// `~/Library/Application Support/SketchForge`, which WebKit cannot read. Tell
/// people once how to bring them across instead of letting them look lost.
@MainActor
enum LegacyDataNotice {
    private static let shownKey = "LegacyElectronNoticeShown"

    static func showIfNeeded(over window: NSWindow?) {
        guard !UserDefaults.standard.bool(forKey: shownKey) else { return }
        let profile = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SketchForge", isDirectory: true)
        let hasProjects = ["IndexedDB", "Local Storage"].contains {
            FileManager.default.fileExists(atPath: profile.appendingPathComponent($0).path)
        }
        guard hasProjects else { return }
        UserDefaults.standard.set(true, forKey: shownKey)

        let alert = NSAlert()
        alert.messageText = "Bring over projects from the previous SketchForge app"
        alert.informativeText = """
        This version of SketchForge is a native Mac app and keeps its own project library. \
        Projects from the earlier SketchForge app are still on this Mac, but they are not moved automatically.

        To move a project, open it in the earlier app and choose Export ▸ SketchForge project (.skf), \
        then double-click the .skf file or drag it onto SketchForge.
        """
        alert.addButton(withTitle: "OK")
        if let window { alert.beginSheetModal(for: window) } else { alert.runModal() }
    }
}
