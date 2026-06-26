const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const staticRoot = path.join(__dirname, "..", "..", "apps", "web", "out");
const indexPath = path.join(staticRoot, "index.html");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0b1220",
    title: "SketchForge",
    icon: resolveIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.removeMenu();

  if (!fs.existsSync(indexPath)) {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(missingBuildHtml(indexPath)),
    );
  } else {
    win.loadFile(indexPath);
  }

  win.webContents.once("did-finish-load", () => {
    console.log("[sketchforge] did-finish-load");
    if (process.env.SKETCHFORGE_ELECTRON_SMOKE === "1") {
      setTimeout(() => app.quit(), 250);
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") {
      console.error("[sketchforge] renderer gone:", details);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    if (target.protocol !== "file:") {
      event.preventDefault();
      if (target.protocol === "http:" || target.protocol === "https:") {
        shell.openExternal(url);
      }
    }
  });
}

function resolveIcon() {
  const candidates = [
    path.join(__dirname, "icon.png"),
    path.join(staticRoot, "assets", "sketchforge", "sketchforge-logo.png"),
    path.join(
      __dirname,
      "..",
      "..",
      "apps",
      "web",
      "public",
      "assets",
      "sketchforge",
      "sketchforge-logo.png",
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function missingBuildHtml(expectedPath) {
  return `<!doctype html><meta charset="utf-8"><title>SketchForge - build missing</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e2e8f0;padding:32px;line-height:1.5}code{background:#1e293b;padding:2px 6px;border-radius:4px}</style>
<h1>SketchForge static build not found</h1>
<p>Expected file: <code>${expectedPath.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></p>
<p>Run <code>npm run export</code> first to generate the static export, then relaunch.</p>`;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
