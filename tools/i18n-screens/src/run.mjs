#!/usr/bin/env node
// Screenshots every screen of the tour in every UI language and writes an HTML report of layout
// differences against the baseline language. Usage: see ../README.md.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createKeyFinder, loadCatalogs, messageText } from "./catalogs.mjs";
import { compareScreen } from "./compare.mjs";
import { collectTextLayout } from "./detect.mjs";
import { writeReport } from "./report.mjs";
import { tour } from "./tour.mjs";

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(toolDir, "../..");
const localesDir = path.join(repoRoot, "apps/web/src/i18n/locales");

const { values: options } = parseArgs({
  options: {
    "base-url": { type: "string" },
    port: { type: "string", default: "3199" },
    languages: { type: "string" },
    baseline: { type: "string", default: "en" },
    viewports: { type: "string", default: "1440x900" },
    screens: { type: "string" },
    out: { type: "string" },
    "color-scheme": { type: "string", default: "light" },
    browser: { type: "string", default: "chrome" },
    "executable-path": { type: "string" },
    headed: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (options.help) {
  console.log(`npm run report -- [options]
  --base-url URL         use a running SketchForge (default: start "next dev" on --port)
  --port N               port for the dev server it starts (default 3199)
  --languages en,ru,de   languages to shoot (default: every language the app offers)
  --baseline en          language the others are compared with (default en)
  --viewports 1440x900,1100x700
  --screens id,prefix    only screens whose id starts with one of these
  --out DIR              report folder (default out/<timestamp>)
  --color-scheme light|dark
  --browser chrome|chromium|msedge   installed browser channel (default chrome)
  --executable-path PATH            browser binary instead of a channel
  --headed               show the browser`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.resolve(options.out ?? path.join(toolDir, "out", stamp));
const viewports = options.viewports.split(",").map((value) => {
  const [width, height] = value.split("x").map(Number);
  if (!width || !height) throw new Error(`Bad viewport "${value}", expected WIDTHxHEIGHT`);
  return { id: `${width}x${height}`, width, height };
});
const screenFilter = options.screens?.split(",").map((value) => value.trim()).filter(Boolean);
const wanted = (id) => !screenFilter || screenFilter.some((prefix) => id.startsWith(prefix));
const chapterWanted = (chapter) => !screenFilter || screenFilter.some((filter) => chapter.screens.some((prefix) => filter.startsWith(prefix) || prefix.startsWith(filter)));

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`SketchForge did not answer at ${url} within ${timeoutMs / 1000} s`);
}

function startDevServer(port) {
  const server = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", port], {
    cwd: repoRoot,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so stop() ends both npm and the next dev it starts.
    detached: true,
  });
  let log = "";
  server.stdout.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  server.stderr.on("data", (chunk) => { log = (log + chunk).slice(-4000); });
  return {
    stop: () => {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    },
    log: () => log,
  };
}

// Freeze motion and the text caret so screenshots of the same state match.
const STILL_CSS = "*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }";

async function newPage(browser, viewport, lang) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: options["color-scheme"],
    reducedMotion: "reduce",
    locale: lang,
  });
  await context.addInitScript(({ lang, css }) => {
    try {
      localStorage.setItem("sketchForge.language", lang);
    } catch {
      // storage unavailable: the app falls back to the browser language
    }
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
    });
  }, { lang, css: STILL_CSS });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

const CROP_MARGIN = 12;

async function scopeClip(page, scope, viewport) {
  const box = await page.locator(scope).first().boundingBox();
  if (!box) return null;
  const x = Math.max(0, Math.floor(box.x - CROP_MARGIN));
  const y = Math.max(0, Math.floor(box.y - CROP_MARGIN));
  const width = Math.min(viewport.w, Math.ceil(box.x + box.width + CROP_MARGIN)) - x;
  const height = Math.min(viewport.h, Math.ceil(box.y + box.height + CROP_MARGIN)) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Moves boxes into the cropped screenshot's coordinates. */
function cropLayout(layout, clip) {
  return {
    viewport: { w: clip.width, h: clip.height },
    items: layout.items.map((item) => ({ ...item, box: { ...item.box, x: item.box.x - clip.x, y: item.box.y - clip.y } })),
  };
}

async function appLanguages(browser, baseUrl) {
  const { context, page } = await newPage(browser, viewports[0], "en");
  try {
    await page.goto(baseUrl);
    await page.locator(".dashboard-settings-button").click();
    const values = await page.locator(".dashboard-settings-panel select").first().evaluate((select) => Array.from(select.options, (option) => option.value));
    return values.filter((value) => value !== "system");
  } finally {
    await context.close();
  }
}

async function main() {
  const catalogs = loadCatalogs(localesDir);
  const findKeys = createKeyFinder(catalogs, localesDir, repoRoot);
  let server = null;
  let baseUrl = options["base-url"];
  if (!baseUrl) {
    baseUrl = `http://127.0.0.1:${options.port}`;
    console.log(`Starting SketchForge dev server on ${baseUrl} …`);
    server = startDevServer(options.port);
  }

  // Chrome contacts Google on its own (component updates, push messaging) even on a local page. It may
  // resolve only the app's host, so the browser cannot reach anything else.
  const appHost = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  const browser = await chromium.launch({
    channel: options["executable-path"] ? undefined : options.browser === "chromium" ? undefined : options.browser,
    executablePath: options["executable-path"],
    headless: !options.headed,
    args: [
      // WebGL without a GPU, so the 3D view renders in headless mode. Chrome calls software WebGL "unsafe" for
      // untrusted sites; this browser opens only the app.
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${appHost}`,
    ],
  });

  try {
    await waitForServer(baseUrl, 180_000).catch((error) => {
      throw server ? new Error(`${error.message}\n--- dev server output ---\n${server.log()}`) : error;
    });
    const languages = options.languages ? options.languages.split(",").map((value) => value.trim()) : await appLanguages(browser, baseUrl);
    if (!languages.includes(options.baseline)) languages.unshift(options.baseline);
    const ordered = [options.baseline, ...languages.filter((lang) => lang !== options.baseline)];
    console.log(`Languages: ${ordered.join(", ")} · baseline ${options.baseline} · viewports ${viewports.map((viewport) => viewport.id).join(", ")}`);

    const screens = new Map();
    const shots = {};
    for (const viewport of viewports) {
      shots[viewport.id] = {};
      for (const lang of ordered) {
        shots[viewport.id][lang] = {};
        for (const chapter of tour.filter(chapterWanted)) {
          const { context, page } = await newPage(browser, viewport, lang);
          const ui = {
            page,
            lang,
            label: (key) => messageText(catalogs, lang, key),
            settle: async (ms = 350) => {
              await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
              await page.waitForTimeout(ms);
            },
            capture: async (id, title, captureOptions = {}) => {
              if (!wanted(id)) return;
              if (!screens.has(id)) screens.set(id, { id, title, chapter: chapter.id, scope: captureOptions.scope ?? null });
              const file = path.join("screens", viewport.id, lang, `${id}.png`);
              mkdirSync(path.join(outDir, path.dirname(file)), { recursive: true });
              const layout = await page.evaluate(collectTextLayout, captureOptions.scope ?? null);
              // A scoped screen is cropped to its container (plus a margin) so its frames are readable.
              const clip = captureOptions.scope ? await scopeClip(page, captureOptions.scope, layout.viewport) : null;
              await page.screenshot({ path: path.join(outDir, file), clip: clip ?? undefined });
              shots[viewport.id][lang][id] = { file, layout: clip ? cropLayout(layout, clip) : layout };
              process.stdout.write(`  ${viewport.id} ${lang} ${id}\n`);
            },
          };
          try {
            await page.goto(baseUrl);
            await page.locator(".dashboard-settings-button").waitFor();
            // Languages other than English are downloaded after the page starts; <html lang> changes once one is shown.
            await page.waitForFunction((code) => document.documentElement.lang === code, lang);
            await chapter.run(ui);
          } catch (error) {
            // Playwright puts the step it was waiting for on the following lines.
            const message = error instanceof Error ? error.message.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" · ") : String(error);
            console.warn(`  ! ${viewport.id} ${lang} chapter "${chapter.id}" stopped: ${message}`);
            shots[viewport.id][lang][`chapter:${chapter.id}`] = { error: message };
          } finally {
            await context.close();
          }
        }
      }
    }

    const report = {
      createdAt: new Date().toISOString(),
      repoRoot,
      outDir,
      commit: git("rev-parse", "--short", "HEAD"),
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      baseUrl,
      baseline: options.baseline,
      languages: ordered,
      viewports: viewports.map((viewport) => viewport.id),
      command: `cd tools/i18n-screens && npm run report -- --languages ${ordered.join(",")} --viewports ${viewports.map((viewport) => viewport.id).join(",")}`,
      screens: [...screens.values()],
      results: {},
      errors: [],
    };
    for (const viewport of report.viewports) {
      report.results[viewport] = {};
      for (const lang of ordered) {
        report.results[viewport][lang] = {};
        for (const [key, shot] of Object.entries(shots[viewport][lang])) {
          if (shot.error) {
            report.errors.push({ viewport, lang, chapter: key.replace("chapter:", ""), message: shot.error });
            continue;
          }
          const baselineShot = shots[viewport][options.baseline]?.[key];
          report.results[viewport][lang][key] = {
            file: shot.file,
            viewport: shot.layout.viewport,
            issues: compareScreen({ layout: shot.layout, baselineLayout: baselineShot?.layout, lang, baseline: options.baseline, findKeys }),
          };
        }
      }
    }

    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
    const reportFile = writeReport(report, outDir);
    const counts = {};
    for (const byLang of Object.values(report.results)) {
      for (const [lang, byScreen] of Object.entries(byLang)) {
        for (const result of Object.values(byScreen)) {
          for (const issue of result.issues) counts[`${lang} ${issue.category}`] = (counts[`${lang} ${issue.category}`] ?? 0) + 1;
        }
      }
    }
    console.log(`\nScreens: ${report.screens.length} · chapters stopped: ${report.errors.length}`);
    for (const [key, count] of Object.entries(counts).sort()) console.log(`  ${key}: ${count}`);
    console.log(`\nReport: ${reportFile}`);
  } finally {
    await browser.close();
    if (server) server.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
