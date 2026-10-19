import AppKit

/// "AI Control (MCP)…": lets local AI assistants (Claude Code, Claude Desktop,
/// Codex…) drive the editor through the stock SketchForge MCP server that ships
/// inside the app bundle. Off by default; the choice persists.
@MainActor
final class AIControl {
    private static let enabledKey = "MCPServerEnabled"
    private static let portKey = "MCPServerPort"
    private static let defaultPort: UInt16 = 47231

    let bridge = McpBridge()
    private var server: McpHTTPServer?

    private var port: UInt16 {
        let stored = UserDefaults.standard.integer(forKey: Self.portKey)
        return (1024...65535).contains(stored) ? UInt16(stored) : Self.defaultPort
    }

    var isEnabled: Bool { server?.isRunning == true }

    func startIfEnabled() {
        if UserDefaults.standard.bool(forKey: Self.enabledKey) { _ = setEnabled(true) }
    }

    @discardableResult
    func setEnabled(_ enabled: Bool) -> String? {
        UserDefaults.standard.set(enabled, forKey: Self.enabledKey)
        guard enabled else {
            server?.stop()
            server = nil
            return nil
        }
        guard server == nil else { return nil }
        let server = McpHTTPServer(bridge: bridge, port: port)
        do {
            try server.start()
            self.server = server
            return nil
        } catch {
            UserDefaults.standard.set(false, forKey: Self.enabledKey)
            return "Port \(port) is not available: \(error.localizedDescription)"
        }
    }

    private var scriptPath: String {
        Bundle.main.resourceURL!.appendingPathComponent("mcp/sketchforge-mcp-server.mjs").path
    }

    private var nodePath: String {
        ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
            .first { FileManager.default.isExecutableFile(atPath: $0) } ?? "node"
    }

    private var claudeCodeCommand: String {
        "claude mcp add sketchforge --env SKETCHFORGE_URL=http://127.0.0.1:\(port) -- \(nodePath) \"\(scriptPath)\""
    }

    private var jsonConfig: String {
        """
        {
          "mcpServers": {
            "sketchforge": {
              "command": "\(nodePath)",
              "args": ["\(scriptPath)"],
              "env": { "SKETCHFORGE_URL": "http://127.0.0.1:\(port)" }
            }
          }
        }
        """
    }

    func showPanel(over window: NSWindow?) {
        let alert = NSAlert()
        alert.messageText = "AI Control (MCP)"
        if isEnabled {
            alert.informativeText = """
            Local AI assistants can read and edit the open design: list and select objects, \
            create shapes, group, cut, fillet and capture images. Only apps on this Mac can connect.

            Add SketchForge to your assistant with one of these, then keep a design open:
            """
            let text = NSTextView(frame: NSRect(x: 0, y: 0, width: 520, height: 200))
            text.string = "Claude Code (Terminal):\n\(claudeCodeCommand)\n\nClaude Desktop, Codex, Cursor… (MCP JSON):\n\(jsonConfig)"
            text.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
            text.isEditable = false
            text.textContainerInset = NSSize(width: 6, height: 6)
            let scroll = NSScrollView(frame: text.frame)
            scroll.documentView = text
            scroll.hasVerticalScroller = true
            scroll.borderType = .bezelBorder
            alert.accessoryView = scroll
            alert.addButton(withTitle: "Done")
            alert.addButton(withTitle: "Copy Claude Code Command")
            alert.addButton(withTitle: "Copy MCP JSON")
            alert.addButton(withTitle: "Turn Off")
        } else {
            alert.informativeText = """
            Let AI assistants on this Mac (Claude Code, Claude Desktop, Codex…) control SketchForge \
            through the Model Context Protocol. They connect to 127.0.0.1:\(port); nothing is exposed \
            to the network. Requires Node.js for the bundled MCP server.
            """
            alert.addButton(withTitle: "Turn On")
            alert.addButton(withTitle: "Cancel")
        }

        let handle: (NSApplication.ModalResponse) -> Void = { [self] response in
            if !isEnabled {
                guard response == .alertFirstButtonReturn else { return }
                if let error = setEnabled(true) {
                    let failure = NSAlert()
                    failure.alertStyle = .warning
                    failure.messageText = "Could not turn on AI Control"
                    failure.informativeText = error
                    failure.runModal()
                } else {
                    DispatchQueue.main.async { self.showPanel(over: window) }
                }
                return
            }
            switch response {
            case .alertSecondButtonReturn: copy(claudeCodeCommand)
            case .alertThirdButtonReturn: copy(jsonConfig)
            case NSApplication.ModalResponse(rawValue: NSApplication.ModalResponse.alertThirdButtonReturn.rawValue + 1): setEnabled(false)
            default: break
            }
        }
        if let window, window.isVisible { alert.beginSheetModal(for: window, completionHandler: handle) } else { handle(alert.runModal()) }
    }

    private func copy(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }
}
