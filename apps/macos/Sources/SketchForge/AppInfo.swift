import Foundation

/// Static facts about the running app and where it keeps its files.
enum AppInfo {
    static let scheme = "sketchforge"
    static let host = "app"
    static let startURL = URL(string: "\(scheme)://\(host)/")!

    static let repository = "Formsmith746/SketchForge-3D"
    static let websiteURL = URL(string: "https://sketchforge3d.com")!
    static let sourceURL = URL(string: "https://github.com/\(repository)")!
    static let issuesURL = URL(string: "https://github.com/\(repository)/issues")!

    static var bundleIdentifier: String { Bundle.main.bundleIdentifier ?? "com.sketchforge.mac" }

    static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
            ?? ProcessInfo.processInfo.environment["SKETCHFORGE_VERSION"]
            ?? "0.0.0"
    }

    /// The static web bundle. `SKETCHFORGE_WEB_ROOT` points an unbundled `swift run`
    /// at `apps/macos/.build/web` during development.
    static var webRoot: URL {
        if let override = ProcessInfo.processInfo.environment["SKETCHFORGE_WEB_ROOT"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true).standardizedFileURL
        }
        return Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true).standardizedFileURL
    }

    /// Optional live Next.js dev server (`npm run dev`) instead of the bundled export.
    static var devServerURL: URL? {
        guard let value = ProcessInfo.processInfo.environment["SKETCHFORGE_DEV_URL"], !value.isEmpty else { return nil }
        return URL(string: value)
    }

    /// `~/Library/Application Support/<bundle id>`. Deliberately not `SketchForge`,
    /// which is the Electron app's profile folder.
    static let supportDirectory: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent(bundleIdentifier, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    static var isRunningFromBundle: Bool { Bundle.main.bundleURL.pathExtension == "app" }
}
