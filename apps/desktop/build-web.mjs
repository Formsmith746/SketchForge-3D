import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(desktopDir, "..", "..");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const copyOcctScript = path.join(repoRoot, "scripts", "copy-occt-wasm.mjs");

function runNode(args, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNode([copyOcctScript]);
runNode([nextBin, "build", "apps/web"], {
  ...process.env,
  SKETCHFORGE_DOCKER_BUILD: "true",
  NEXT_TELEMETRY_DISABLED: "1",
});

const requiredPaths = [
  path.join(repoRoot, "apps", "web", ".next", "standalone", "apps", "web", "server.js"),
  path.join(repoRoot, "apps", "web", ".next", "static"),
  path.join(repoRoot, "apps", "web", "public"),
];

for (const requiredPath of requiredPaths) {
  if (!fs.existsSync(requiredPath)) {
    console.error(`[desktop:web:build] Missing expected build output: ${requiredPath}`);
    process.exit(1);
  }
}

console.log("[desktop:web:build] Standalone SketchForge web bundle is ready.");
