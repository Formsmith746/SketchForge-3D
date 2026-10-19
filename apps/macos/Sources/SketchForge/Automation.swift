#if SKETCHFORGE_AUTOMATION
import AppKit
import WebKit

/// End-to-end test hook, compiled only with `-D SKETCHFORGE_AUTOMATION`
/// (`node apps/macos/scripts/build.mjs --automation`). After the page loads it runs
/// the async JavaScript in `SKETCHFORGE_AUTOMATION_SCRIPT`, writes the JSON result
/// to `SKETCHFORGE_AUTOMATION_OUTPUT`, snapshots the window to
/// `SKETCHFORGE_AUTOMATION_SNAPSHOT` (optional), and quits unless
/// `SKETCHFORGE_AUTOMATION_KEEP_OPEN` is set.
@MainActor
enum Automation {
    private static var started = false

    static func pageDidLoad(in webView: WKWebView) {
        let env = ProcessInfo.processInfo.environment
        guard !started, let scriptPath = env["SKETCHFORGE_AUTOMATION_SCRIPT"],
              let script = try? String(contentsOfFile: scriptPath, encoding: .utf8)
        else { return }
        started = true
        Task { @MainActor in
            var result: [String: Any] = [:]
            do {
                let value = try await webView.callAsyncJavaScript(script, arguments: [:], contentWorld: .page)
                result["ok"] = true
                result["value"] = value ?? NSNull()
            } catch {
                result["ok"] = false
                result["error"] = String(describing: error)
            }
            if let snapshotPath = env["SKETCHFORGE_AUTOMATION_SNAPSHOT"],
               let image = try? await webView.takeSnapshot(configuration: nil),
               let tiff = image.tiffRepresentation,
               let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: snapshotPath))
            }
            if let framePath = env["SKETCHFORGE_AUTOMATION_WINDOW_SNAPSHOT"], let window = webView.window {
                result["windowBackground"] = window.backgroundColor.usingColorSpace(.sRGB).map {
                    String(format: "#%02X%02X%02X", Int($0.redComponent * 255), Int($0.greenComponent * 255), Int($0.blueComponent * 255))
                }
                try? await Task.sleep(nanoseconds: 400_000_000) // let the color animation settle
                writeWindowSnapshot(window: window, webView: webView, to: framePath)
            }
            let data = (try? JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .fragmentsAllowed])) ?? Data()
            if let outputPath = env["SKETCHFORGE_AUTOMATION_OUTPUT"] {
                try? data.write(to: URL(fileURLWithPath: outputPath))
            } else {
                FileHandle.standardOutput.write(data)
            }
            if env["SKETCHFORGE_AUTOMATION_KEEP_OPEN"] == nil { NSApp.terminate(nil) }
        }
    }

    /// Test-only: posts a real key event through NSApp so it travels the same path as
    /// typing (menu key equivalents first, then the web view). JS calls
    /// `postMessage({ type: "automationKey", key: "z", modifiers: ["command"] })`.
    static func sendKey(_ body: [String: Any], to window: NSWindow?) {
        guard let window, let key = body["key"] as? String else { return }
        var flags: NSEvent.ModifierFlags = []
        for modifier in body["modifiers"] as? [String] ?? [] {
            switch modifier {
            case "command": flags.insert(.command)
            case "shift": flags.insert(.shift)
            case "option": flags.insert(.option)
            case "control": flags.insert(.control)
            default: break
            }
        }
        let codes: [String: UInt16] = ["a": 0, "z": 6, "c": 8, "v": 9, "d": 2, "o": 31, "w": 13]
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            guard let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime,
                                               windowNumber: window.windowNumber, context: nil, characters: key,
                                               charactersIgnoringModifiers: key, isARepeat: false, keyCode: codes[key] ?? 0)
            else { continue }
            NSApp.sendEvent(event)
        }
    }

    /// Renders the window frame (title bar, traffic lights) with the web content
    /// composited in, without needing Screen Recording permission.
    private static func writeWindowSnapshot(window: NSWindow, webView: WKWebView, to path: String) {
        guard let frameView = window.contentView?.superview else { return }
        let bounds = frameView.bounds
        guard let rep = frameView.bitmapImageRepForCachingDisplay(in: bounds) else { return }
        frameView.cacheDisplay(in: bounds, to: rep)
        webView.takeSnapshot(with: nil) { image, _ in
            let composite = NSImage(size: bounds.size)
            composite.lockFocus()
            rep.draw(in: bounds)
            if let image { image.draw(in: webView.convert(webView.bounds, to: frameView)) }
            composite.unlockFocus()
            if let tiff = composite.tiffRepresentation,
               let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
                try? png.write(to: URL(fileURLWithPath: path))
            }
        }
    }
}
#endif
