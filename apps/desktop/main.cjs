const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const devUrl = process.env.SKETCHFORGE_DESKTOP_DEV_URL?.trim() || "";
// Keep the desktop origin stable. localStorage and IndexedDB are scoped to the
// full origin (including the port), so a random port made projects appear to
// vanish after every restart.
const DESKTOP_PORT = Number.parseInt(process.env.SKETCHFORGE_DESKTOP_PORT || "62158", 10);

const isLinux = process.platform === "linux";

let mainWindow = null;
let tray = null;
let webServer = null;
let webServerOutput = "";
let isQuitting = false;
let updaterConfigured = false;
let desktopIpcConfigured = false;
let updateCheckInFlight = false;
let manualUpdateCheck = false;
let downloadedUpdateReady = false;
let updateInstallRequested = false;
let lastUpdateCheckResult = null;
let lastUpdateCheckError = "";

function appendServerOutput(chunk) {
  webServerOutput += String(chunk);
  if (webServerOutput.length > 12_000) {
    webServerOutput = webServerOutput.slice(-12_000);
  }
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    if (webServer && webServer.exitCode !== null) {
      throw new Error(`SketchForge web process exited with code ${webServer.exitCode}.`);
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
  throw new Error(`SketchForge did not start its local web process in time.${detail}`);
}

async function startPackagedWebServer() {
  const webRoot = path.join(process.resourcesPath, "web");
  const serverPath = path.join(webRoot, "apps", "web", "server.js");
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Desktop web bundle is missing: ${serverPath}`);
  }

  const port = DESKTOP_PORT;
  const packagedNodeModules = path.join(process.resourcesPath, "app.asar", "node_modules");

  webServer = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: [packagedNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      SKETCHFORGE_DESKTOP: "1",
      SKETCHFORGE_DESKTOP_VERSION: app.getVersion(),
      SKETCHFORGE_SHARED_PROJECTS_DIR: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  webServer.stdout?.on("data", appendServerOutput);
  webServer.stderr?.on("data", appendServerOutput);

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

function stopPackagedWebServer() {
  if (!webServer || webServer.exitCode !== null) return;
  try {
    webServer.kill();
  } catch {
    // The process may already be gone while Electron is shutting down.
  }
}

function appIconPath() {
  return devUrl
    ? path.join(__dirname, "..", "web", "public", "assets", "sketchforge", "sketchforge-logo.png")
    : path.join(process.resourcesPath, "web", "apps", "web", "public", "assets", "sketchforge", "sketchforge-logo.png");
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function installDownloadedUpdate() {
  if (!downloadedUpdateReady) return;
  isQuitting = true;
  stopPackagedWebServer();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
}

async function downloadAndInstallDesktopUpdate() {
  if (!app.isPackaged) {
    return desktopUpdatePayload(null, "Updates can only be installed from the packaged SketchForge app.");
  }

  lastUpdateCheckError = "";
  try {
    let result = lastUpdateCheckResult;
    if (!result?.isUpdateAvailable) {
      result = await autoUpdater.checkForUpdates();
      lastUpdateCheckResult = result;
    }
    if (!result?.isUpdateAvailable) {
      return desktopUpdatePayload(result);
    }

    updateInstallRequested = true;
    await autoUpdater.downloadUpdate();
    return desktopUpdatePayload(result);
  } catch (error) {
    updateInstallRequested = false;
    const message = error instanceof Error ? error.message : String(error);
    lastUpdateCheckError = message;
    return desktopUpdatePayload(lastUpdateCheckResult, message);
  }
}

function desktopUpdatePayload(result = lastUpdateCheckResult, errorMessage = lastUpdateCheckError) {
  return {
    currentVersion: app.getVersion(),
    latestVersion: result?.updateInfo?.version || null,
    updateAvailable: Boolean(result?.isUpdateAvailable),
    downloaded: downloadedUpdateReady,
    checkedAt: new Date().toISOString(),
    error: errorMessage || undefined,
  };
}

async function checkForDesktopUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      await dialog.showMessageBox({
        type: "info",
        title: "SketchForge updates",
        message: "Automatic updates are tested from the installed SketchForge app.",
      });
    }
    return desktopUpdatePayload(null);
  }
  if (downloadedUpdateReady) {
    return desktopUpdatePayload();
  }
  if (updateCheckInFlight) {
    return desktopUpdatePayload();
  }

  manualUpdateCheck = manualUpdateCheck || manual;
  updateCheckInFlight = true;
  lastUpdateCheckError = "";
  try {
    const result = await autoUpdater.checkForUpdates();
    lastUpdateCheckResult = result;
    return desktopUpdatePayload(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastUpdateCheckError = message;
    if (manualUpdateCheck) {
      dialog.showErrorBox("Could not check for updates", message);
      manualUpdateCheck = false;
    }
    return desktopUpdatePayload(null, message);
  } finally {
    updateCheckInFlight = false;
  }
}

function setupDesktopIpc() {
  if (desktopIpcConfigured) return;
  desktopIpcConfigured = true;

  ipcMain.handle("sketchforge:get-version", () => app.getVersion());
  ipcMain.handle("sketchforge:check-for-updates", () => checkForDesktopUpdates(false));
  ipcMain.handle("sketchforge:install-update", () => downloadAndInstallDesktopUpdate());
}

function setupDesktopUpdater() {
  if (updaterConfigured || !app.isPackaged) return;
  updaterConfigured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("update-available", (info) => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    void dialog.showMessageBox({
      type: "info",
      title: "SketchForge update",
      message: `SketchForge ${info.version} is available.`,
      detail: "Open Settings and press Update to install it.",
    });
  });

  autoUpdater.on("update-not-available", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    void dialog.showMessageBox({
      type: "info",
      title: "SketchForge updates",
      message: "SketchForge is up to date.",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    if (tray) tray.setToolTip(`SketchForge - downloading update ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    downloadedUpdateReady = true;
    if (tray) tray.setToolTip(`SketchForge ${info.version} ready to install`);
    if (updateInstallRequested) installDownloadedUpdate();
  });

  autoUpdater.on("error", (error) => {
    if (tray) tray.setToolTip("SketchForge");
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showErrorBox("Could not update SketchForge", error instanceof Error ? error.message : String(error));
  });

  setTimeout(() => void checkForDesktopUpdates(false), 4_000).unref();
  setInterval(() => void checkForDesktopUpdates(false), 6 * 60 * 60 * 1000).unref();
}

function createTray() {
  if (tray) return;

  let icon;
  try {
    icon = nativeImage.createFromPath(appIconPath()).resize({ width: 20, height: 20 });
    tray = new Tray(icon);
  } catch (error) {
    // Several Linux desktops ship no StatusNotifier host, so the tray is a
    // bonus rather than a requirement. Never let it block startup.
    console.warn(`SketchForge could not create a tray icon: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  tray.setToolTip("SketchForge");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open SketchForge",
      click: showMainWindow,
    },
    {
      label: "Check for Updates",
      click: () => void checkForDesktopUpdates(true),
    },
    { type: "separator" },
    {
      label: "Quit SketchForge",
      click: () => {
        if (downloadedUpdateReady) {
          installDownloadedUpdate();
          return;
        }
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", showMainWindow);
}

function createMainWindow(url) {
  const appOrigin = new URL(url).origin;
  const iconPath = appIconPath();

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: "SketchForge",
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.removeMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    try {
      const target = new URL(targetUrl);
      if (target.origin === appOrigin) return { action: "allow" };
      if (target.protocol === "http:" || target.protocol === "https:") {
        void shell.openExternal(targetUrl);
      }
    } catch {
      // Ignore malformed URLs instead of handing them to the OS.
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    try {
      const target = new URL(targetUrl);
      if (target.origin === appOrigin) return;
      event.preventDefault();
      if (target.protocol === "http:" || target.protocol === "https:") {
        void shell.openExternal(targetUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    // Hiding to the tray is only safe where a tray is dependable. GNOME has no
    // StatusNotifier host without an extension, so a hidden window would leave
    // SketchForge running with no way to reopen or quit it.
    if (isLinux) return;
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(url);
}

async function startDesktop() {
  Menu.setApplicationMenu(null);

  try {
    const url = devUrl || await startPackagedWebServer();
    setupDesktopIpc();
    createTray();
    createMainWindow(url);
    setupDesktopUpdater();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = webServerOutput.trim();
    dialog.showErrorBox(
      "SketchForge could not start",
      detail ? `${message}\n\n${detail}` : message,
    );
    app.quit();
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", showMainWindow);

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("com.sketchforge.desktop");
    void startDesktop();

    app.on("activate", () => {
      if (mainWindow) {
        showMainWindow();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        void startDesktop();
      }
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  stopPackagedWebServer();
});

app.on("window-all-closed", () => {
  // Keep SketchForge available from the system tray. Use Quit SketchForge
  // from the tray menu when the user wants to fully stop the application.
  // Linux desktops cannot rely on a tray, and closing the last window is the
  // expected way to quit there, so honour that instead.
  if (isLinux) app.quit();
});
