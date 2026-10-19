// Builds SketchForge.app for Apple silicon Macs.
//
//   node apps/macos/scripts/build.mjs                 # web bundle + app → dist/macos/SketchForge.app
//   node apps/macos/scripts/build.mjs --release       # also DMG + update ZIP
//   node apps/macos/scripts/build.mjs --skip-web      # reuse apps/macos/.build/web
//   node apps/macos/scripts/build.mjs --automation    # include the end-to-end test hook
//
// Signing: set SKETCHFORGE_CODESIGN_IDENTITY ("Developer ID Application: …") to
// sign with the hardened runtime; otherwise the app is ad-hoc signed. With
// --notarize and APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID and
// APPLE_API_ISSUER the DMG is notarized and stapled.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const macosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(macosDir, "..", "..");
const buildDir = path.join(macosDir, ".build");
const distDir = path.join(repoRoot, "dist", "macos");
const appDir = path.join(distDir, "SketchForge.app");
const version = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
const identity = process.env.SKETCHFORGE_CODESIGN_IDENTITY?.trim() || "-";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", cwd: repoRoot, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[macos] ${command} ${commandArgs.join(" ")} failed with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function step(message) {
  console.log(`\n[macos] ${message}`);
}

if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.error("[macos] The native app builds on Apple silicon Macs only.");
  process.exit(1);
}

if (!args.has("--skip-web") || !existsSync(path.join(buildDir, "web", "index.html"))) {
  step("Building the static web bundle");
  run(process.execPath, [path.join(macosDir, "scripts", "build-web.mjs")]);
}

step("Compiling the Swift app (release, arm64)");
const swiftArgs = ["build", "-c", "release", "--arch", "arm64", "--package-path", macosDir];
if (args.has("--automation")) swiftArgs.push("-Xswiftc", "-DSKETCHFORGE_AUTOMATION");
run("swift", swiftArgs);
const binDir = spawnSync("swift", [...swiftArgs, "--show-bin-path"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();

step("Assembling SketchForge.app");
rmSync(appDir, { recursive: true, force: true });
const contents = path.join(appDir, "Contents");
mkdirSync(path.join(contents, "MacOS"), { recursive: true });
mkdirSync(path.join(contents, "Resources"), { recursive: true });

cpSync(path.join(binDir, "SketchForge"), path.join(contents, "MacOS", "SketchForge"));
run("strip", ["-x", path.join(contents, "MacOS", "SketchForge")]);
cpSync(path.join(buildDir, "web"), path.join(contents, "Resources", "web"), { recursive: true });
// The stock MCP server, unchanged; AI Control points assistants at it.
mkdirSync(path.join(contents, "Resources", "mcp"), { recursive: true });
cpSync(path.join(repoRoot, "scripts", "sketchforge-mcp-server.mjs"), path.join(contents, "Resources", "mcp", "sketchforge-mcp-server.mjs"));

const now = new Date();
const buildNumber = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}.${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
const plist = readFileSync(path.join(macosDir, "Resources", "Info.plist"), "utf8")
  .replaceAll("__VERSION__", version)
  .replaceAll("__BUILD__", buildNumber);
writeFileSync(path.join(contents, "Info.plist"), plist);
writeFileSync(path.join(contents, "PkgInfo"), "APPL????");

const iconset = path.join(buildDir, "AppIcon.iconset");
const icns = path.join(buildDir, "AppIcon.icns");
const iconSource = path.join(repoRoot, "apps", "web", "public", "assets", "sketchforge", "sketchforge-logo-white.png");
const iconScript = path.join(macosDir, "scripts", "make-icon.swift");
if (!existsSync(icns) || statSync(icns).mtimeMs < Math.max(statSync(iconScript).mtimeMs, statSync(iconSource).mtimeMs)) {
  step("Rendering the app icon");
  run("swift", [iconScript, iconSource, iconset]);
  run("iconutil", ["-c", "icns", iconset, "-o", icns]);
}
cpSync(icns, path.join(contents, "Resources", "AppIcon.icns"));

step(identity === "-" ? "Signing (ad hoc)" : `Signing as ${identity}`);
const signArgs = ["--force", "--sign", identity];
if (identity !== "-") signArgs.push("--options", "runtime", "--timestamp");
run("codesign", [...signArgs, appDir]);
run("codesign", ["--verify", "--strict", "--verbose=1", appDir]);

function folderSize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (total, entry) => total + (entry.isDirectory() ? folderSize(path.join(dir, entry.name)) : statSync(path.join(dir, entry.name)).size),
    0,
  );
}
console.log(`[macos] ${path.relative(repoRoot, appDir)} (${(folderSize(appDir) / 1e6).toFixed(1)} MB)`);

if (args.has("--release")) {
  const suffix = identity === "-" ? "-unsigned" : "";
  const zipPath = path.join(distDir, `SketchForge-macOS-${version}-arm64${suffix}.zip`);
  const dmgPath = path.join(distDir, `SketchForge-macOS-${version}-arm64${suffix}.dmg`);

  step("Creating the update ZIP");
  rmSync(zipPath, { force: true });
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appDir, zipPath]);

  step("Creating the DMG");
  const stage = path.join(buildDir, "dmg");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  run("ditto", [appDir, path.join(stage, "SketchForge.app")]);
  run("ln", ["-s", "/Applications", path.join(stage, "Applications")]);
  rmSync(dmgPath, { force: true });
  run("hdiutil", ["create", "-volname", "SketchForge", "-srcfolder", stage, "-fs", "APFS", "-format", "ULFO", "-ov", dmgPath]);
  if (identity !== "-") run("codesign", ["--force", "--sign", identity, "--timestamp", dmgPath]);

  if (args.has("--notarize")) {
    const { APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER } = process.env;
    if (identity === "-" || !APPLE_API_KEY || !APPLE_API_KEY_ID || !APPLE_API_ISSUER) {
      console.error("[macos] --notarize needs a Developer ID identity and APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER.");
      process.exit(1);
    }
    step("Notarizing");
    run("xcrun", ["notarytool", "submit", dmgPath, "--key", APPLE_API_KEY, "--key-id", APPLE_API_KEY_ID, "--issuer", APPLE_API_ISSUER, "--wait"]);
    run("xcrun", ["stapler", "staple", dmgPath]);
    run("xcrun", ["stapler", "staple", appDir]);
    rmSync(zipPath, { force: true });
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", appDir, zipPath]);
  }

  for (const file of [zipPath, dmgPath]) {
    console.log(`[macos] ${path.relative(repoRoot, file)} (${(statSync(file).size / 1e6).toFixed(1)} MB)`);
  }
}
