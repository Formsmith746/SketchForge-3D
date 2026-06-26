<div align="center">
  <table>
    <tr>
      <td width="145" align="center">
        <img src="apps/web/public/assets/sketchforge/sketchforge-logo-transparent.png" width="120" alt="SketchForge logo">
      </td>
      <td>
        <h1 align="right">SketchForge</h1>
        <h3 align="right">A local-first 3D design editor that runs in your browser.</h3>
        <p align="right">
          Build shapes, cut holes, group parts, import STL files, and export models without accounts, cloud lock-in, or heavyweight CAD setup.
        </p>
      </td>
    </tr>
  </table>

  <p>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-16a34a"></a>
    <a href="https://github.com/Formsmith746/SketchForge-3D/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Formsmith746/SketchForge-3D?style=social"></a>
    <img alt="Local first" src="https://img.shields.io/badge/local--first-no%20account-0ea5e9">
    <img alt="Version 0.2.0" src="https://img.shields.io/badge/version-0.2.0-2563eb">
  </p>
</div>

![SketchForge v0.2 editor showing a selected box on the workplane](docs/media/sketchforge-editor-v0.2.png)

## Why SketchForge

SketchForge is a lightweight CAD-style workspace for people who want to sketch, cut, and export 3D models quickly.

It is built for the satisfying loop: drop a shape, resize it, rotate it, make another shape a hole, group the result, import an STL if primitives are not enough, and export the finished model.

No login. No server project storage. No heavyweight CAD install just to make a useful part.

## What It Does

- **Local-first projects** - designs live in browser storage with generated project thumbnails.
- **Real 3D workplane** - grid, camera controls, snap settings, transform handles, outlines, and inspector controls.
- **Primitive shape library** - boxes, cylinders, spheres, cones, pyramids, wedges, text, roofs, half spheres, torus shapes, tubes, and more.
- **Solid and hole workflow** - turn shapes into cutters and group them into final geometry.
- **Boolean Intersection** - keep only the geometry where selected solid and hole shapes overlap.
- **STL import** - bring outside models into the same workspace as primitives.
- **STL and OBJ export** - export selected objects or the whole scene.
- **Fast browser stack** - Next.js, React, TypeScript, Three.js, and Manifold/CSG geometry tooling.

## Demo

![SketchForge editor demo preview](docs/media/videos/01-create-and-edit-block-preview.gif)

## Quick Start

Requirements:

- Node.js 20 or newer
- npm

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000/
```

## Desktop App (Electron)

Run SketchForge as a native desktop app on Windows, macOS, or Linux. 

```bash
npm install
npm run electron:dev      # build the static export and open it in Electron
```

Package installers (Windows NSIS / macOS DMG / Linux AppImage) go to
`deploy/electron/dist/`:

```bash
npm run electron:dist        # current platform
npm run electron:dist:win    # Windows
npm run electron:dist:mac    # macOS
npm run electron:dist:linux  # Linux
```

See [`deploy/electron/README.md`](deploy/electron/README.md) for details.

## Docker / FabLab Server (Recommended)

The Docker image contains a static SketchForge build served by Nginx. Projects stay in each user's browser; STL and OBJ files download through that browser. The container does not receive or store project files.

Docker is the recommended server setup because it packages the correct Node build environment, static app, Nginx configuration, health check, and restart policy together. It is easier to reproduce and update than configuring each part by hand.

Requirements:

- Docker Engine with Docker Compose

Build and start SketchForge:

```bash
npm run docker:up
```

Open it on the server:

```text
http://127.0.0.1:3000/
```

Other computers on the same network can use the server's LAN address:

```text
http://SERVER_IP:3000/
```

To use another host port:

```bash
SKETCHFORGE_PORT=8080 npm run docker:up
```

On PowerShell:

```powershell
$env:SKETCHFORGE_PORT = "8080"
npm run docker:up
```

Stop the server with:

```bash
npm run docker:down
```

### Manual Static Deployment (Advanced)

This is the harder alternative for servers where Docker cannot be used. The administrator must install and maintain Node.js, npm, Nginx or another static web server, firewall access, startup behavior, and future updates separately.

Requirements:

- Node.js 20 or newer
- npm
- Nginx, Apache, Caddy, or another static web server

Create the static build on Linux or macOS:

```bash
npm ci
STATIC_EXPORT=true npm run build
```

Create it with PowerShell on Windows:

```powershell
npm ci
$env:STATIC_EXPORT = "true"
npm run build
Remove-Item Env:STATIC_EXPORT
```

The deployable files are generated in `apps/web/out`. Configure the web server to serve that directory and fall back to `index.html` for unknown application paths. [`deploy/docker/nginx.conf`](deploy/docker/nginx.conf) is the configuration used by the Docker image and can be adapted for a manual Nginx installation.

The administrator must also open the chosen LAN port in the server firewall and arrange for the web server to start automatically after a reboot. For each SketchForge update, pull the new source, install dependencies, rebuild `apps/web/out`, replace the served files, and reload the web server.

## Development

```bash
npm run typecheck
```

Run TypeScript checks.

```bash
npm run build
```

Create a production build.

```bash
npm run export
```

Build with static export mode enabled.

## Project Layout

```text
apps/web/                   Next.js app workspace
apps/web/src/app/           App routes, dashboard, API routes, styles
apps/web/src/components/    Editor, viewport, sidebar, icons, controls
apps/web/src/types/         Shared shape and editor types
apps/web/src/generated/     Generated Manifold runtime source
apps/web/src/lib/           Shared utilities
apps/web/public/assets/     Static app images, icons, logos, shape assets
docs/media/                 README screenshots and demo videos
deploy/docker/              Docker, Compose, and Nginx deployment files
.github/                    Issue templates and community files
```

## Current Status

SketchForge is alpha, but the core editor loop is usable today:

- create and reopen local projects
- add, move, resize, rotate, mirror, align, duplicate, hide, and delete shapes
- switch shapes between solid and hole modes
- group and ungroup geometry
- import STL files
- export STL or OBJ
- generate project thumbnails

The next big areas are workflow polish, more geometry edge-case testing, stronger automated editor coverage, and better release documentation.

## Contributing

Contributions are welcome. Good places to help:

- editor bug fixes
- geometry and boolean test cases
- STL import/export edge cases
- UI polish
- documentation screenshots and videos
- accessibility and performance improvements

Read [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a pull request.

## Security

Please do not open public issues for security-sensitive reports. Read [.github/SECURITY.md](.github/SECURITY.md) for the reporting process.

## License

MIT. See [LICENSE](LICENSE).
