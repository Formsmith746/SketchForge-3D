import { spawn } from "node:child_process";

const parentPid = Number.parseInt(process.argv[2] || "", 10);
const repoRoot = process.argv[3] || process.cwd();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Give the update API response time to reach the browser before stopping Next.
await sleep(1200);

if (Number.isFinite(parentPid) && parentPid > 0) {
  try {
    process.kill(parentPid, "SIGTERM");
  } catch {
    // The dev server may already have stopped on its own.
  }
}

await sleep(1200);

const options = {
  cwd: repoRoot,
  detached: true,
  stdio: "ignore",
  windowsHide: true,
};

const child = process.platform === "win32"
  ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run dev"], options)
  : spawn("npm", ["run", "dev"], options);

child.unref();
