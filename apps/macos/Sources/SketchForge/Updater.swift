import AppKit
import Security

/// Checks GitHub releases for a newer native macOS build and installs it in place.
///
/// Release assets are expected as `SketchForge-macOS-<version>-arm64[-unsigned].zip` (made by
/// `apps/macos/scripts/build.mjs --release`). Electron assets on the same release are
/// ignored. A downloaded update must carry this app's bundle identifier and, when the
/// running app is Developer ID signed, a valid signature from the same team.
@MainActor
final class Updater {
    struct Status {
        var latestVersion: String?
        var updateAvailable = false
        var downloaded = false
        var error: String?
    }

    private struct Release {
        var version: String
        var assetURL: URL
        var pageURL: URL?
    }

    private static let assetPattern = try! NSRegularExpression(pattern: #"^SketchForge-macOS-(.+)-arm64(?:-unsigned)?\.zip$"#)
    private static let cacheLifetime: TimeInterval = 5 * 60

    private var cached: (release: Release?, fetchedAt: Date)?
    private var installing = false
    private(set) var status = Status()

    var currentVersion: String { AppInfo.version }

    /// Payload consumed by `window.sketchforgeDesktop` in the web UI.
    func payload(_ status: Status) -> [String: Any] {
        var result: [String: Any] = [
            "currentVersion": currentVersion,
            "latestVersion": status.latestVersion ?? NSNull(),
            "updateAvailable": status.updateAvailable,
            "downloaded": status.downloaded,
            "checkedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        if let error = status.error { result["error"] = error }
        return result
    }

    func check(force: Bool = false) async -> Status {
        do {
            let release = try await latestRelease(force: force)
            status.latestVersion = release?.version
            status.updateAvailable = release.map { Self.isVersion($0.version, newerThan: currentVersion) } ?? false
            status.error = nil
        } catch {
            status.error = "Could not check for updates: \(error.localizedDescription)"
        }
        return status
    }

    /// Downloads, verifies and swaps the app bundle, then relaunches.
    func installLatest() async -> Status {
        guard !installing else { return status }
        guard AppInfo.isRunningFromBundle else {
            status.error = "Updates can only be installed from the packaged SketchForge app."
            return status
        }
        installing = true
        defer { installing = false }
        do {
            guard let release = try await latestRelease(force: true),
                  Self.isVersion(release.version, newerThan: currentVersion)
            else {
                status.updateAvailable = false
                return status
            }
            let newApp = try await download(release)
            try verify(newApp, expectedVersion: release.version)
            try replaceRunningApp(with: newApp)
            status.downloaded = true
            status.error = nil
            relaunchSoon()
        } catch {
            status.error = error.localizedDescription
        }
        return status
    }

    /// "Check for Updates…" from the app menu.
    func checkInteractively() {
        Task {
            let result = await check(force: true)
            let alert = NSAlert()
            if let error = result.error {
                alert.alertStyle = .warning
                alert.messageText = "Could not check for updates"
                alert.informativeText = error
                alert.runModal()
            } else if result.updateAvailable, let latest = result.latestVersion {
                alert.messageText = "SketchForge \(latest) is available"
                alert.informativeText = "You have \(currentVersion). The update downloads in the background and SketchForge restarts when it is ready."
                alert.addButton(withTitle: "Install and Relaunch")
                alert.addButton(withTitle: "Later")
                if alert.runModal() == .alertFirstButtonReturn {
                    let installed = await installLatest()
                    if let error = installed.error {
                        let failure = NSAlert()
                        failure.alertStyle = .warning
                        failure.messageText = "Could not install the update"
                        failure.informativeText = error
                        failure.runModal()
                    }
                }
            } else {
                alert.messageText = "SketchForge is up to date"
                alert.informativeText = "Version \(currentVersion) is the newest version available."
                alert.runModal()
            }
        }
    }

    // MARK: GitHub

    private func latestRelease(force: Bool) async throws -> Release? {
        if !force, let cached, Date().timeIntervalSince(cached.fetchedAt) < Self.cacheLifetime {
            return cached.release
        }
        var request = URLRequest(url: URL(string: "https://api.github.com/repos/\(AppInfo.repository)/releases/latest")!)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("SketchForge-macOS/\(currentVersion)", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw UpdateError("GitHub answered with status \((response as? HTTPURLResponse)?.statusCode ?? 0).")
        }
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw UpdateError("Unexpected release data from GitHub.")
        }
        let assets = json["assets"] as? [[String: Any]] ?? []
        var release: Release?
        for asset in assets {
            guard let name = asset["name"] as? String,
                  let link = asset["browser_download_url"] as? String,
                  let url = URL(string: link),
                  let match = Self.assetPattern.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)),
                  let versionRange = Range(match.range(at: 1), in: name)
            else { continue }
            release = Release(version: String(name[versionRange]), assetURL: url, pageURL: (json["html_url"] as? String).flatMap(URL.init(string:)))
        }
        cached = (release, Date())
        return release
    }

    // MARK: Install

    private func download(_ release: Release) async throws -> URL {
        let (archive, response) = try await URLSession.shared.download(from: release.assetURL)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw UpdateError("The update download failed.")
        }
        // Unpack next to the installed app so the final swap is a same-volume rename.
        let workspace = try FileManager.default.url(for: .itemReplacementDirectory, in: .userDomainMask,
                                                    appropriateFor: Bundle.main.bundleURL, create: true)
        try run("/usr/bin/ditto", ["-x", "-k", archive.path, workspace.path])
        try? FileManager.default.removeItem(at: archive)
        guard let app = try FileManager.default.contentsOfDirectory(at: workspace, includingPropertiesForKeys: nil)
            .first(where: { $0.pathExtension == "app" })
        else { throw UpdateError("The update archive does not contain an app.") }
        return app
    }

    private func verify(_ app: URL, expectedVersion: String) throws {
        guard let bundle = Bundle(url: app),
              bundle.bundleIdentifier == AppInfo.bundleIdentifier,
              bundle.infoDictionary?["CFBundleShortVersionString"] as? String == expectedVersion
        else { throw UpdateError("The downloaded update is not a SketchForge \(expectedVersion) build.") }

        var staticCode: SecStaticCode?
        guard SecStaticCodeCreateWithPath(app as CFURL, [], &staticCode) == errSecSuccess, let staticCode else {
            throw UpdateError("The update's code signature could not be read.")
        }
        var requirementText = "identifier \"\(AppInfo.bundleIdentifier)\""
        if let team = Self.runningTeamIdentifier() {
            requirementText = "anchor apple generic and certificate leaf[subject.OU] = \"\(team)\" and " + requirementText
        }
        var requirement: SecRequirement?
        guard SecRequirementCreateWithString(requirementText as CFString, [], &requirement) == errSecSuccess else {
            throw UpdateError("Could not build the signature requirement.")
        }
        let flags = SecCSFlags(rawValue: kSecCSCheckAllArchitectures | kSecCSCheckNestedCode | kSecCSStrictValidate)
        guard SecStaticCodeCheckValidity(staticCode, flags, requirement) == errSecSuccess else {
            throw UpdateError("The update's code signature is not valid.")
        }
    }

    private static func runningTeamIdentifier() -> String? {
        var code: SecCode?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code else { return nil }
        var staticCode: SecStaticCode?
        guard SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode else { return nil }
        var info: CFDictionary?
        guard SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess else { return nil }
        return (info as? [String: Any])?[kSecCodeInfoTeamIdentifier as String] as? String
    }

    private func replaceRunningApp(with newApp: URL) throws {
        let installed = Bundle.main.bundleURL
        guard FileManager.default.isWritableFile(atPath: installed.deletingLastPathComponent().path) else {
            throw UpdateError("SketchForge cannot replace itself in \(installed.deletingLastPathComponent().path). Download the new version from GitHub instead.")
        }
        _ = try FileManager.default.replaceItemAt(installed, withItemAt: newApp)
    }

    private func relaunchSoon() {
        let script = "while /bin/kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do /bin/sleep 0.1; done; /usr/bin/open \"$0\""
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", script, Bundle.main.bundleURL.path]
        try? process.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { NSApp.terminate(nil) }
    }

    private func run(_ tool: String, _ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: tool)
        process.arguments = arguments
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw UpdateError("\(tool) failed with status \(process.terminationStatus).") }
    }

    // MARK: Versions

    static func isVersion(_ candidate: String, newerThan current: String) -> Bool {
        func parts(_ version: String) -> (numbers: [Int], prerelease: String?) {
            let trimmed = version.hasPrefix("v") ? String(version.dropFirst()) : version
            let core = trimmed.split(separator: "+", maxSplits: 1)[0]
            let pieces = core.split(separator: "-", maxSplits: 1)
            let numbers = pieces[0].split(separator: ".").map { Int($0) ?? 0 }
            return (numbers, pieces.count > 1 ? String(pieces[1]) : nil)
        }
        let (a, aPre) = parts(candidate)
        let (b, bPre) = parts(current)
        for index in 0..<max(a.count, b.count) {
            let left = index < a.count ? a[index] : 0
            let right = index < b.count ? b[index] : 0
            if left != right { return left > right }
        }
        // 1.2.0 is newer than 1.2.0-beta.
        if aPre == nil, bPre != nil { return true }
        if let aPre, let bPre { return aPre.compare(bPre, options: .numeric) == .orderedDescending }
        return false
    }
}

struct UpdateError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
