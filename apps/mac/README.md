# SketchForge for macOS

SketchForge for macOS packages the browser-based 3D editor as a standalone Mac
application. This README starts with installation and coding-agent setup for
people who downloaded the app. Build and architecture information for
developers follows afterward.

## Install and run

1. Open `SketchForge.dmg`.
2. Drag `SketchForge.app` onto the **Applications** shortcut.
3. Eject the disk image and start SketchForge from Applications.

The disk image also includes this `README.md` and the project's `LICENSE` file.

The distributed app is architecture-specific: use the Apple Silicon build on
an `arm64` Mac and the Intel build on an `x86_64` Mac. It requires macOS 13 or
later.

`SketchForge.app` is self-contained. Running the editor does not require the
source repository, Docker, Homebrew, Node.js, npm, or an internet connection.
The web server, JavaScript runtime, assets, MCP adapter, and coding-agent skill
are all inside the application bundle.

Shared project files are stored in:

```text
~/Library/Application Support/SketchForge/Projects
```

Server diagnostics are written to the adjacent `Logs` directory.

## Connect a coding agent

SketchForge exposes its live editor to trusted local coding agents through MCP.
An agent can inspect the scene, create or modify objects, exercise CAD
operations, inspect errors, and capture viewport images. This is intended for
interactive development: changes made through MCP appear in the open editor.

While the app is running, its web app and internal MCP bridge listen on
`127.0.0.1:3000`. The listener is restricted to IPv4 loopback and is not
reachable from the LAN. It has no authentication, so only run trusted local
agents while SketchForge is open. Closing the app stops the listener.

### Attach Codex

The HTTP route on port 3000 is an internal bridge, not a Streamable HTTP MCP
endpoint. Codex must start the STDIO adapter bundled inside `SketchForge.app`.
No source checkout or separate Node.js installation is needed.

1. Start SketchForge and open or create a project so the editor is visible.

2. If the app is installed in `/Applications`, register its bundled adapter:

   ```bash
   codex mcp add sketchforge -- "/Applications/SketchForge.app/Contents/MacOS/SketchForgeMCP"
   ```

   If the app is stored elsewhere, replace `/Applications/SketchForge.app` with
   its absolute path.

3. Confirm that Codex knows about the server:

   ```bash
   codex mcp list
   ```

4. Optionally install the workflow skill bundled with the app:

   ```bash
   ditto "/Applications/SketchForge.app/Contents/Resources/mcp/sketchforge-mcp-skill" \
     "$HOME/.codex/skills/sketchforge-mcp-skill"
   ```

5. Restart Codex or begin a new Codex session. Use `/mcp` to confirm that
   `sketchforge` is connected, then try:

   ```text
   Use $sketchforge-mcp-skill to list my open SketchForge editors and inspect the current scene.
   ```

Without the optional skill, ask Codex to use the SketchForge MCP tools directly.
An empty editor list normally means SketchForge is running but a project editor
is not open. If the app reports that port 3000 is occupied, stop the other local
process before relaunching SketchForge.

---

## Developer guide

The files in `apps/mac` build and package the existing Next.js application as a
native AppKit application with a `WKWebView` frontend and a bundled loopback
server.

### Standalone design contract

The generated `SketchForge.app` is the sole SketchForge artifact delivered to a
Mac user. Treat the following rules as mandatory for all future work in
`apps/mac`:

- Editor use must require only macOS and `SketchForge.app`. Never introduce a
  runtime dependency on the repository, Docker, Homebrew, Node.js, npm, or
  another separately installed runtime.
- Coding-agent integration must be equally standalone. The Node.js runtime,
  STDIO MCP adapter, Codex skill, web server, static assets, and every other
  SketchForge runtime dependency belong inside the application bundle.
- User-facing MCP configuration may reference paths inside `SketchForge.app`,
  but must never reference the source checkout or a system `node` executable.
- Keep the app relocatable. Bundled launchers must resolve resources relative
  to their own location. If a user moves the app, only the external MCP
  configuration path needs updating.
- Never write mutable runtime data into the signed bundle. Projects, logs,
  preferences, and other state belong in the user's Library.
- Bind the web app and MCP bridge only to `127.0.0.1:3000`, never to `0.0.0.0`
  or a LAN interface. Closing the app must terminate its web server.
- Implement Mac-specific behavior within `apps/mac` or disposable ignored
  staging output. Do not modify existing SketchForge source outside `apps/mac`.

Build-time tools are allowed on the developer machine creating the bundle; they
must not become requirements for the person receiving it.

### How the bundle is assembled

`build-app.sh` creates an isolated copy of `apps/web` under the ignored
`apps/mac/.cache` directory. `prepare-web-build.mjs` enables the localhost MCP
bridge only in that staged copy, after which Next.js produces a standalone
server. The original web source and Docker behavior remain unchanged.

The important bundle contents are:

```text
SketchForge.app/Contents/
├── MacOS/
│   ├── SketchForge          native AppKit/WKWebView launcher
│   └── SketchForgeMCP       relocatable STDIO MCP launcher
└── Resources/
    ├── runtime/node         bundled Node.js runtime
    ├── server/              standalone Next.js app and static assets
    └── mcp/
        ├── sketchforge-mcp-server.mjs
        └── sketchforge-mcp-skill/
```

At runtime, the native launcher starts the bundled Next.js server on
`127.0.0.1:3000`, waits for it to become healthy, and loads it in `WKWebView`.
`SketchForgeMCP` resolves the application bundle from its own location and
starts the bundled adapter with the bundled Node.js runtime.

### Build the application

Building requires macOS 13 or later, Xcode Command Line Tools, Node.js/npm,
`curl`, and `tar`. Install the lockfile dependencies before the first build:

```bash
npm ci
apps/mac/build-app.sh
```

The result is `apps/mac/dist/SketchForge.app`. The script downloads and caches
the matching official Node.js runtime on the first build. For an offline build,
provide an existing official archive with `--node-archive FILE`. Run
`apps/mac/build-app.sh --help` for all options.

The output is architecture-specific and ad-hoc signed for local testing. Public
distribution requires signing with an Apple Developer ID certificate and Apple
notarization.

### Build the distribution disk image

After building the app, create the compressed distribution image:

```bash
apps/mac/build-app-dist.sh
```

The result is `apps/mac/dist/SketchForge.dmg`. It contains
`SketchForge.app`, this `README.md`, the repository-root `LICENSE`, and an
`Applications` shortcut. The script verifies the app's code signature before
packaging and verifies the completed disk image. Use `--output FILE` to select
another destination.

### Release verification

Before shipping a build:

1. Test `SketchForge.app` and `Contents/MacOS/SketchForgeMCP` from outside the
   repository and without using a system Node.js executable.
2. Confirm that the running server is bound only to loopback:

   ```bash
   lsof -nP -iTCP:3000 -sTCP:LISTEN
   ```

   The SketchForge listener must be shown as `127.0.0.1:3000`, never `*:3000`.

3. Verify the application and disk image:

   ```bash
   codesign --verify --deep --strict apps/mac/dist/SketchForge.app
   hdiutil verify apps/mac/dist/SketchForge.dmg
   ```

4. Confirm that the pull request contains no Mac-specific changes outside
   `apps/mac`.
