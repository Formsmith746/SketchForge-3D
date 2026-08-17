import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(desktopDir, "..", "..");
const nextBin = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const copyOcctScript = path.join(repoRoot, "scripts", "copy-occt-wasm.mjs");
const electronMain = path.join(desktopDir, "main.cjs");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Could not reserve a local development port."));
        else resolve(port);
      });
    });
  });
}

async function waitForUrl(url, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  const detail = lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new Error(`Timed out waiting for SketchForge dev server.${detail}`);
}

const copyResult = spawnSync(process.execPath, [copyOcctScript], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

if (copyResult.status !== 0) {
  process.exit(copyResult.status ?? 1);
}

const port = await findFreePort();
const url = `http://127.0.0.1:${port}`;

const nextProcess = spawn(
  process.execPath,
  [nextBin, "dev", "apps/web", "-H", "127.0.0.1", "-p", String(port)],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      SKETCHFORGE_SHARED_PROJECTS_DIR: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);

let electronProcess = null;
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (electronProcess && electronProcess.exitCode === null) {
    try {
      electronProcess.kill();
    } catch {}
  }

  if (nextProcess.exitCode === null) {
    try {
      nextProcess.kill();
    } catch {}
  }

  setTimeout(() => process.exit(exitCode), 100).unref();
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

nextProcess.on("exit", (code) => {
  if (!shuttingDown && (!electronProcess || electronProcess.exitCode === null)) {
    shutdown(code ?? 1);
  }
});

try {
  await waitForUrl(url, nextProcess);

  electronProcess = spawn(electronPath, [electronMain], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      SKETCHFORGE_DESKTOP_DEV_URL: url,
    },
  });

  electronProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  shutdown(1);
}
