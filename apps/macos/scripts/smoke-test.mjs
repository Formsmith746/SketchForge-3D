// End-to-end smoke test of the native app (Apple silicon, needs a GUI session).
//
//   node apps/macos/scripts/smoke-test.mjs            # builds with --automation, then tests
//   node apps/macos/scripts/smoke-test.mjs --no-build # tests dist/macos/SketchForge.app as is
//
// Launches the real app, runs checks inside the page through the automation hook
// and fails with a non-zero exit code if anything is off. Rebuild without
// --automation before shipping.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const macosDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(macosDir, "..", "..");
const binary = path.join(repoRoot, "dist", "macos", "SketchForge.app", "Contents", "MacOS", "SketchForge");

if (!process.argv.includes("--no-build")) {
  const build = spawnSync(process.execPath, [path.join(macosDir, "scripts", "build.mjs"), "--automation", "--skip-web"], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
if (!existsSync(binary)) {
  console.error(`[smoke] Missing ${binary}`);
  process.exit(1);
}

const work = mkdtempSync(path.join(os.tmpdir(), "sketchforge-smoke-"));
const script = path.join(work, "smoke.js");
const output = path.join(work, "result.json");
writeFileSync(script, `
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const r = {};
const hydrated = () => [...document.querySelectorAll("button")].some((b) => (b.innerText || "").trim() === "Create new 3D design" && Object.keys(b).some((k) => k.startsWith("__reactProps")));
for (let i = 0; i < 400 && !hydrated(); i++) await sleep(25);
r.dashboard = hydrated();
r.secureContext = isSecureContext && !!crypto.subtle;
r.bridgeVersion = await window.sketchforgeDesktop.getVersion();
r.indexedDB = await new Promise((resolve) => {
  const open = indexedDB.open("__smoke", 1);
  open.onupgradeneeded = () => open.result.createObjectStore("s");
  open.onsuccess = () => { const tx = open.result.transaction("s", "readwrite"); tx.objectStore("s").put(1, "k"); tx.oncomplete = () => resolve(true); tx.onerror = () => resolve(false); };
  open.onerror = () => resolve(false);
});
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
await fetch("/api/project-thumbnail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: png, projectId: "smoke-test" }) });
r.thumbnail = (await fetch("/api/project-thumbnail?projectId=smoke-test")).status === 200;
await fetch("/api/project-thumbnail?projectId=smoke-test", { method: "DELETE" });
const form = new FormData();
form.set("file", new Blob([new Uint8Array([7, 7, 7])]), "smoke.bin");
form.set("filename", "smoke.bin");
form.set("folder", ${JSON.stringify(work)});
r.saveToFolder = (await (await fetch("/api/local-download", { method: "POST", body: form })).json()).path || null;
r.mcpRoute = Array.isArray((await (await fetch("/api/sketchforge-mcp")).json()).editors);
r.wasm = await WebAssembly.compileStreaming(fetch("/manifold.wasm")).then(() => true, () => false);
r.fps = await new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(n); }; requestAnimationFrame(tick); });
return r;
`);

const run = spawnSync(binary, [], {
  env: { ...process.env, SKETCHFORGE_AUTOMATION_SCRIPT: script, SKETCHFORGE_AUTOMATION_OUTPUT: output },
  stdio: ["ignore", "inherit", "ignore"],
  timeout: 120_000,
});
if (!existsSync(output)) {
  console.error(`[smoke] The app produced no result (status ${run.status}, signal ${run.signal}).`);
  process.exit(1);
}

const result = JSON.parse(readFileSync(output, "utf8"));
const value = result.value ?? {};
const savedBytes = value.saveToFolder && existsSync(value.saveToFolder) ? [...readFileSync(value.saveToFolder)] : [];
const checks = [
  ["page script ran", result.ok === true, result.error],
  ["dashboard hydrated", value.dashboard === true],
  ["secure context + WebCrypto", value.secureContext === true],
  ["desktop bridge", typeof value.bridgeVersion === "string", value.bridgeVersion],
  ["IndexedDB", value.indexedDB === true],
  ["thumbnail API", value.thumbnail === true],
  ["binary Save to folder", savedBytes.join(",") === "7,7,7", value.saveToFolder],
  ["MCP bridge route", value.mcpRoute === true],
  ["WASM streaming compile", value.wasm === true],
  ["rendering frames", value.fps > 20, `${value.fps} rAF/s`],
];
let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` (${detail})` : ""}`);
}
rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
