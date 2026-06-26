# SketchForge Desktop (Electron)

Wraps the static SketchForge build in an Electron shell so it can ship as a
native desktop app on Windows, macOS, and Linux.

## Run from source

```bash
npm install
npm run electron:dev
```

## Package installers

```bash
npm run electron:dist          # current platform
npm run electron:dist:win      # Windows NSIS installer
npm run electron:dist:mac      # macOS DMG (universal arches)
npm run electron:dist:linux    # Linux AppImage
```

Output goes to `deploy/electron/dist/`.
