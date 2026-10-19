# SketchForge for Mac (native)

A native Swift/AppKit shell for Apple silicon Macs. It runs the same SketchForge web app in the
system WebKit instead of a bundled Chromium, with no local server and no open port.

|  | Native (this app) | Electron build |
| --- | --- | --- |
| App size | 36 MB (DMG 18 MB) | 742 MB |
| Launch to interactive dashboard | ~280 ms | ~620 ms warm, ~2 s cold |
| Idle memory (dashboard) | ~140 MB | ~175 MB |
| 3D viewport frame rate (120 Hz display) | 120 fps | 120 fps |
| Processes | app + WebKit services | Electron main + renderer + GPU + Node server |

Measured on an M5 Pro (macOS 27, 120 Hz display) against the packaged 1.0.9 Electron app. In an
engine benchmark using SketchForge's own renderer settings and CAD kernels (headed, device pixel ratio 2,
two runs each), WebKit matched or beat Chromium (Electron 43): 6.8 vs 7.1 ms/frame for 1,600 outlined
parts, 3.4 vs 3.6 ms/frame for 5.5 M triangles, and the same Manifold and OpenCascade timings within ±3%.

## Build

Requires an Apple silicon Mac with Xcode (Swift 5.10+) and Node.js. Run from the repository root:

```bash
npm ci
node apps/macos/scripts/build.mjs             # → dist/macos/SketchForge.app
node apps/macos/scripts/build.mjs --release   # also the DMG and the update ZIP
node apps/macos/scripts/smoke-test.mjs        # end-to-end check of the real app
```

`build-web.mjs` copies `apps/web` into `apps/macos/.build/web-stage`, leaves out the server-only
`src/app/api` routes, and exports a static bundle. Nothing under `apps/web` is modified.

Signing: set `SKETCHFORGE_CODESIGN_IDENTITY="Developer ID Application: …"` to sign with the hardened
runtime. Add `--notarize` with `APPLE_API_KEY` (path to the .p8 key), `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER` to notarize and staple. Without an identity, the app is ad-hoc signed and the files
are named `-unsigned`, matching the Electron release convention.

Development: `SKETCHFORGE_WEB_ROOT=apps/macos/.build/web swift run --package-path apps/macos` runs
without an app bundle. With `npm run dev` running, `SKETCHFORGE_DEV_URL=http://127.0.0.1:3000` loads the
live Next.js dev server instead. To use Safari's Web Inspector, run
`defaults write com.sketchforge.mac WebInspectorEnabled -bool YES`.

## How it works

- **`sketchforge://app/`** (`AppSchemeHandler`) serves the export from the bundle using memory-mapped
  reads, correct MIME types (streaming WASM compilation) and immutable caching for `_next/static`. A
  fixed custom origin keeps localStorage and IndexedDB stable without a fixed TCP port. WebKit treats
  this origin as a secure context, so WebCrypto works for `.skf` hashing.
- **`NativeAPI`** answers the routes the UI calls, with the same request and response shapes as
  `apps/web/src/app/api`:
  - Project thumbnails are stored in `~/Library/Application Support/com.sketchforge.mac/Thumbnails`.
  - "Save to folder" exports accept `~` paths, with path traversal blocked.
  - Shared projects are disabled.
  - The MCP bridge is described below.
- **`window.sketchforgeDesktop`** offers the same contract as the Electron preload (`getVersion`,
  `checkForUpdates`, `installUpdate`), backed by a GitHub Releases updater. The updater installs
  `SketchForge-macOS-<version>-arm64[-unsigned].zip`. It checks the bundle identifier and the code
  signature, and requires the same team when the running app is Developer ID signed.
- **120 Hz:** WebKit caps `requestAnimationFrame` at 60 fps by default. `WebKitTuning` switches off
  WebKit's internal `PreferPageRenderingUpdatesNear60FPSEnabled` preference, so the viewport follows
  ProMotion displays. If a future macOS removes the switch, the app falls back to 60 fps.
- **Exports** use `WKDownload` with a native save sheet.
- **Opening files:** `.skf` is a registered document type, and STL/OBJ/STEP/SVG appear under
  "Open With". Files from Finder, the Dock or File ▸ Open are handed to the dashboard's own import
  input, so they go through the normal validation.
- **Mac behavior:**
  - A full menu bar, including Open Recent.
  - The title bar takes on the color of the page header.
  - Closing the window keeps the editor alive; clicking the Dock icon brings it back.
  - Pending edits are flushed before quitting.
  - If the web content process crashes, the editor reloads automatically.
  - Browser-only context-menu items (Reload, Back, Open in New Window…) are removed.

WebKit drops Blob request bodies sent to custom schemes. A small `fetch` shim re-encodes same-origin
Blob/FormData bodies as ArrayBuffers, keeping the multipart boundary, so binary "Save to folder"
exports work.

## AI control (MCP)

Turn it on with **SketchForge ▸ AI Control (MCP)…**. The app then listens on `127.0.0.1:47231`, and only
on the MCP route. Requests with an `Origin` header (web pages) or a foreign `Host` (DNS rebinding) are
rejected. The panel can copy a ready-made setup for any assistant. Both setups use the unchanged
`scripts/sketchforge-mcp-server.mjs`, which ships inside the app:

```bash
claude mcp add sketchforge --env SKETCHFORGE_URL=http://127.0.0.1:47231 -- \
  node "/Applications/SketchForge.app/Contents/Resources/mcp/sketchforge-mcp-server.mjs"
```

The MCP server is a Node script, so the Mac needs Node.js (the panel looks in `/opt/homebrew/bin` and
`/usr/local/bin`). All 17 tools work against the native app, from `sketchforge_list_editors` to
`sketchforge_capture_image`. Commands take a few milliseconds.

The editor's MCP client only runs under `next dev` on localhost. `build-web.mjs` widens that one
condition in the *staged copy* so the client also starts when the native shell sets
`sketchforgeDesktop.mcp`. If upstream moves that code, the build prints a warning and ships without AI
control.

## Moving from the Electron app

WebKit cannot read Chromium's storage. On first launch, if an Electron profile exists, the app explains
how to move projects across: export each one as `.skf` from the old app, then open the file here.

## Testing hooks

`build.mjs --automation` compiles in `Automation.swift`. It runs a JavaScript file from
`SKETCHFORGE_AUTOMATION_SCRIPT` after the page loads, writes the result as JSON and can save the page and
window as images. Normal builds do not include this code.
