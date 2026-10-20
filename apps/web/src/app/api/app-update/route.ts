import { timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { appUpdateIsAvailable, OFFICIAL_UPDATE_GUIDE_URL, type AppUpdateStatus } from "@/lib/appUpdates";
import { SKF_CREATED_WITH_VERSION } from "@/lib/skfProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = false;

const DEFAULT_MANIFEST_URL = "https://raw.githubusercontent.com/Formsmith746/SketchForge-3D/main/package.json";
const OFFICIAL_REPO_URL = "https://github.com/Formsmith746/SketchForge-3D.git";
const UPDATE_CACHE_MS = 5 * 60 * 1000;
const UPDATE_TRIGGER_COOLDOWN_MS = 15 * 1000;
const execFileAsync = promisify(execFile);
const VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

let cachedLatest: { version: string; expiresAt: number } | null = null;
let nextTriggerAt = 0;

function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "");
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

function loopbackRequest(request: Request) {
  try {
    const hostname = new URL(request.url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function findParentRoot(requireGit: boolean) {
  let current = path.resolve(process.cwd());
  for (let depth = 0; depth < 7; depth += 1) {
    const hasPackage = existsSync(path.join(current, "package.json"));
    const hasGit = existsSync(path.join(current, ".git"));
    if (hasPackage && (!requireGit || hasGit)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function packageVersion(root: string | null) {
  if (!root) return null;
  try {
    const payload = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version?: unknown };
    const version = typeof payload.version === "string" ? payload.version.trim() : "";
    return VERSION_PATTERN.test(version) ? version : null;
  } catch {
    return null;
  }
}

function currentAppVersion() {
  const configured = process.env.SKETCHFORGE_APP_VERSION?.trim();
  if (configured && VERSION_PATTERN.test(configured)) return configured;
  return packageVersion(findParentRoot(false)) || SKF_CREATED_WITH_VERSION;
}

function localRepoForRequest(request: Request) {
  if (!loopbackRequest(request)) return null;
  return findParentRoot(true);
}

function updateTriggerUrl() {
  const configured = process.env.SKETCHFORGE_UPDATE_TRIGGER_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

async function latestOfficialVersion(force = false) {
  if (!force && cachedLatest && cachedLatest.expiresAt > Date.now()) return cachedLatest.version;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_500);
  try {
    const response = await fetch(process.env.SKETCHFORGE_UPDATE_MANIFEST_URL?.trim() || DEFAULT_MANIFEST_URL, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "SketchForge update checker" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Update server returned ${response.status}`);
    const payload = await response.json() as { version?: unknown };
    const version = typeof payload.version === "string" ? payload.version.trim() : "";
    if (!VERSION_PATTERN.test(version)) {
      throw new Error("Update server returned an invalid version");
    }
    cachedLatest = { version, expiresAt: Date.now() + UPDATE_CACHE_MS };
    return version;
  } finally {
    clearTimeout(timeout);
  }
}

function updateGuideUrl() {
  return process.env.SKETCHFORGE_UPDATE_GUIDE_URL?.trim() || OFFICIAL_UPDATE_GUIDE_URL;
}

async function statusResponse(request: Request, force = false): Promise<AppUpdateStatus> {
  const trigger = updateTriggerUrl();
  const adminKeyConfigured = Boolean(process.env.SKETCHFORGE_UPDATE_ADMIN_KEY?.trim());
  const localRepo = localRepoForRequest(request);
  const currentVersion = currentAppVersion();
  try {
    const latestVersion = await latestOfficialVersion(force);
    return {
      currentVersion,
      latestVersion,
      updateAvailable: appUpdateIsAvailable(currentVersion, latestVersion),
      checkedAt: new Date().toISOString(),
      updateUrl: updateGuideUrl(),
      installationReady: Boolean(localRepo || (trigger && adminKeyConfigured)),
      requiresUpdateKey: localRepo ? false : Boolean(trigger && adminKeyConfigured),
      updateMode: localRepo ? "local" : "server",
    };
  } catch (error) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      updateUrl: updateGuideUrl(),
      installationReady: Boolean(localRepo || (trigger && adminKeyConfigured)),
      requiresUpdateKey: localRepo ? false : Boolean(trigger && adminKeyConfigured),
      updateMode: localRepo ? "local" : "server",
      checkError: error instanceof Error ? error.message : "Could not check for updates",
    };
  }
}

async function runLocalUpdate(repoRoot: string, expectedVersion: string) {
  const gitOptions = { cwd: repoRoot, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 };
  const { stdout: dirtyOutput } = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=no"], gitOptions);
  if (dirtyOutput.trim()) {
    throw new Error("Local SketchForge has uncommitted code changes. Commit or stash them before updating so the updater does not overwrite your work.");
  }

  await execFileAsync("git", ["fetch", "--no-tags", OFFICIAL_REPO_URL, "main"], gitOptions);
  await execFileAsync("git", ["merge", "--ff-only", "FETCH_HEAD"], gitOptions);

  const installedVersion = packageVersion(repoRoot);
  if (installedVersion && appUpdateIsAvailable(installedVersion, expectedVersion)) {
    throw new Error(`The local checkout updated to ${installedVersion}, but ${expectedVersion} was expected.`);
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  await execFileAsync(npmCommand, ["install", "--no-audit", "--no-fund"], {
    cwd: repoRoot,
    timeout: 5 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });

  const restartScript = path.join(repoRoot, "scripts", "restart-local-dev.mjs");
  if (existsSync(restartScript)) {
    const child = spawn(process.execPath, [restartScript, String(process.pid), repoRoot], {
      cwd: repoRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }

  return installedVersion || expectedVersion;
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";
  return NextResponse.json(await statusResponse(request, force), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Updates only accept same-origin requests" }, { status: 403 });

  const localRepo = localRepoForRequest(request);
  if (localRepo) {
    if (Date.now() < nextTriggerAt) {
      return NextResponse.json({ error: "An update was already requested. Wait a moment before trying again." }, { status: 429 });
    }
    const status = await statusResponse(request, true);
    if (status.checkError) return NextResponse.json({ error: status.checkError }, { status: 502 });
    if (!status.updateAvailable || !status.latestVersion) {
      return NextResponse.json({ error: "SketchForge is already up to date", status }, { status: 409 });
    }

    nextTriggerAt = Date.now() + UPDATE_TRIGGER_COOLDOWN_MS;
    try {
      const installedVersion = await runLocalUpdate(localRepo, status.latestVersion);
      return NextResponse.json(
        {
          accepted: true,
          currentVersion: installedVersion,
          latestVersion: status.latestVersion,
          updateMode: "local",
          restartRequired: true,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      nextTriggerAt = 0;
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update local SketchForge" }, { status: 409 });
    }
  }

  const trigger = updateTriggerUrl();
  const adminKey = process.env.SKETCHFORGE_UPDATE_ADMIN_KEY?.trim() || "";
  if (!trigger || !adminKey) {
    return NextResponse.json(
      { error: "One-click installation is not configured on this server", updateUrl: updateGuideUrl() },
      { status: 409 },
    );
  }

  const suppliedKey = request.headers.get("x-sketchforge-update-key")?.trim() || "";
  if (!suppliedKey || !safeEqual(suppliedKey, adminKey)) {
    return NextResponse.json({ error: "The update key is incorrect" }, { status: 401 });
  }
  if (Date.now() < nextTriggerAt) {
    return NextResponse.json({ error: "An update was already requested. Wait a moment before trying again." }, { status: 429 });
  }

  const status = await statusResponse(request, true);
  if (status.checkError) return NextResponse.json({ error: status.checkError }, { status: 502 });
  if (!status.updateAvailable || !status.latestVersion) {
    return NextResponse.json({ error: "SketchForge is already up to date", status }, { status: 409 });
  }

  nextTriggerAt = Date.now() + UPDATE_TRIGGER_COOLDOWN_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const triggerToken = process.env.SKETCHFORGE_UPDATE_TRIGGER_TOKEN?.trim();
    const response = await fetch(trigger, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(triggerToken ? { Authorization: `Bearer ${triggerToken}` } : {}),
      },
      body: JSON.stringify({
        application: "SketchForge",
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        preserveProjectStorage: true,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Update service returned ${response.status}`);
    return NextResponse.json(
      { accepted: true, currentVersion: status.currentVersion, latestVersion: status.latestVersion, updateMode: "server" },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    nextTriggerAt = 0;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the update" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
