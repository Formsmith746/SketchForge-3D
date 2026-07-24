import { spawn } from "node:child_process";
import net from "node:net";

const parsePort = (value, fallback, name) => {
  const port = Number.parseInt(value ?? "", 10);
  if (Number.isInteger(port) && port > 0 && port <= 65_535) {
    return port;
  }
  if (value) {
    console.warn(`Ignoring invalid ${name} value "${value}"; using ${fallback}.`);
  }
  return fallback;
};

const appPort = parsePort(process.env.PORT, 3000, "PORT");
const legacyPort = parsePort(process.env.SKETCHFORGE_LEGACY_PORT, 80, "SKETCHFORGE_LEGACY_PORT");
const app = spawn(process.execPath, ["apps/web/server.js"], {
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    PORT: String(appPort),
  },
  stdio: "inherit",
});

let proxy;
let shuttingDown = false;

if (legacyPort !== appPort) {
  proxy = net.createServer((client) => {
    const upstream = net.createConnection({
      host: "127.0.0.1",
      port: appPort,
    });

    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  });

  proxy.on("error", (error) => {
    console.error(`Legacy port ${legacyPort} proxy failed:`, error);
    app.kill("SIGTERM");
  });

  proxy.listen(legacyPort, "0.0.0.0", () => {
    console.log(`Legacy Docker port ${legacyPort} forwards to SketchForge on port ${appPort}.`);
  });
}

const finish = (code) => {
  if (proxy?.listening) {
    proxy.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 5_000).unref();
    return;
  }
  process.exit(code);
};

const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (!app.killed) {
    app.kill(signal);
  }
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

app.on("error", (error) => {
  console.error("Unable to start SketchForge:", error);
  finish(1);
});

app.on("exit", (code, signal) => {
  if (!shuttingDown && signal) {
    console.error(`SketchForge exited from ${signal}.`);
  }
  finish(shuttingDown ? 0 : code ?? 1);
});
