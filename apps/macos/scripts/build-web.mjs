// Builds the SketchForge web app as a fully static bundle for the native macOS
// shell. The upstream `apps/web` sources are never modified: they are staged
// into `apps/macos/.build/web-stage`, the server-only `src/app/api` routes are
// dropped (the Swift shell answers the few routes the UI calls), and a
// macOS-specific Next.js config exports to `apps/macos/.build/web`.
//
// The build keeps NEXT_PUBLIC_STATIC_EXPORT=false on purpose: in "static" mode
// the UI disables desktop updates and "Save to folder" and stores thumbnails as
// data URLs in localStorage. The native shell provides those APIs instead.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const macosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(macosDir, "..", "..");
const webDir = path.join(repoRoot, "apps", "web");
const buildDir = path.join(macosDir, ".build");
const stageDir = path.join(buildDir, "web-stage");
const outDir = path.join(buildDir, "web");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!existsSync(nextBin)) {
  console.error("[macos:web] Next.js is not installed. Run `npm ci` in the repository root first.");
  process.exit(1);
}

// Stage the OCCT kernel exactly like the upstream dev/build scripts do.
run([path.join(repoRoot, "scripts", "copy-occt-wasm.mjs")]);

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

const skipTopLevel = new Set([".next", ".next-dev", ".next-export", "out", "node_modules", "next.config.ts", "next-env.d.ts"]);
for (const entry of readdirSync(webDir)) {
  if (skipTopLevel.has(entry) || entry.startsWith(".env")) continue;
  cpSync(path.join(webDir, entry), path.join(stageDir, entry), { recursive: true });
}

// Route handlers cannot be part of `output: "export"`; the native shell owns them.
rmSync(path.join(stageDir, "src", "app", "api"), { recursive: true, force: true });
// `public/assets/occt` is an older, unreferenced copy of the kernel (~22 MB); the
// app loads `/occt/*`, which copy-occt-wasm.mjs stages from node_modules.
rmSync(path.join(stageDir, "public", "assets", "occt"), { recursive: true, force: true });

// The editor's MCP client (AI control) is limited to `next dev` on localhost.
// In the staged copy only, also start it when the native shell advertises its
// MCP bridge (`window.sketchforgeDesktop.mcp`). Upstream files stay untouched;
// if the code moved, the app still builds, just without AI control.
const editorFile = path.join(stageDir, "src", "components", "SketchForgeEditor.tsx");
const mcpGate = `    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }
    if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      return;
    }

    const identity = readMcpEditorIdentity();`;
const nativeMcpGate = `    if (typeof window === "undefined") {
      return;
    }
    const nativeMcp = (window as unknown as { sketchforgeDesktop?: { mcp?: boolean } }).sketchforgeDesktop?.mcp === true;
    if (!nativeMcp && (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname))) {
      return;
    }

    const identity = readMcpEditorIdentity();`;
const editorSource = readFileSync(editorFile, "utf8").replaceAll("\r\n", "\n");
if (editorSource.includes(mcpGate)) {
  writeFileSync(editorFile, editorSource.replace(mcpGate, nativeMcpGate));
} else {
  console.warn("[macos:web] MCP client gate not found in SketchForgeEditor.tsx; AI control will be unavailable in this build.");
}

writeFileSync(
  path.join(stageDir, "next.config.ts"),
  `import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  distDir: ${JSON.stringify(path.relative(stageDir, outDir))},
  trailingSlash: true,
  outputFileTracingRoot: ${JSON.stringify(repoRoot)},
  devIndicators: false,
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: "false",
    NEXT_PUBLIC_SKETCHFORGE_NATIVE_MACOS: "true",
  },
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "brepkit-wasm": false,
      "brepjs-opencascade": false,
    };
    return config;
  },
};

export default nextConfig;
`,
);
writeFileSync(path.join(stageDir, "next-env.d.ts"), '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n');

rmSync(outDir, { recursive: true, force: true });
run([nextBin, "build", path.relative(repoRoot, stageDir)], {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  STATIC_EXPORT: "",
  SKETCHFORGE_DOCKER_BUILD: "",
});

if (!existsSync(path.join(outDir, "index.html"))) {
  console.error(`[macos:web] Static export is missing ${path.join(outDir, "index.html")}`);
  process.exit(1);
}

// Next leaves build caches next to the export when distDir === export dir.
for (const leftover of ["cache", "server", "types", "trace", "diagnostics"]) {
  rmSync(path.join(outDir, leftover), { recursive: true, force: true });
}
for (const entry of readdirSync(outDir)) {
  if (entry.endsWith(".json") && !entry.startsWith("manifest")) rmSync(path.join(outDir, entry), { force: true });
}

function directorySize(dir) {
  return readdirSync(dir).reduce((total, entry) => {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    return total + (stat.isDirectory() ? directorySize(full) : stat.size);
  }, 0);
}

console.log(`[macos:web] Static bundle ready at ${path.relative(repoRoot, outDir)} (${(directorySize(outDir) / 1e6).toFixed(1)} MB).`);
