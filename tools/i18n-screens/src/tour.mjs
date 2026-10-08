/**
 * The screens to photograph, as chapters. Each chapter starts in a fresh browser profile on the
 * dashboard, so a failure in one chapter does not affect the others. Steps find controls by class,
 * icon or role, or by the label from the app's own catalog for the current language (`ui.label`),
 * never by hard-coded text, so one tour works for every language.
 *
 * Add a screen: call `ui.capture(id, title, { scope })` after the steps that open it. `id` must be
 * unique and stable (it names the screenshot and links issues across runs) and start with one of the
 * chapter's `screens` prefixes, so `--screens` can skip whole chapters. `scope` limits the layout
 * check to one container when the rest of the screen is covered elsewhere.
 */

const shapeIcon = (name) => `button.shape-menu-item:has(img[src$="/${name}"])`;
const toolbarIcon = (file) => `button:has(img[src$="${file}"])`;

async function openEditor(ui) {
  await ui.page.locator(".dashboard-action-tile.create").click();
  await ui.page.locator(".shape-menu-trigger").waitFor();
  await ui.settle(800);
}

async function addShape(ui, icon) {
  const trigger = ui.page.locator(".shape-menu-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  const item = ui.page.locator(shapeIcon(icon)).first();
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await ui.page.locator(".shape-inspector").waitFor();
  await ui.settle();
}

async function openWorkspaceSettings(ui) {
  await ui.page.locator(toolbarIcon("toolbar-settings.png")).click();
  await ui.page.locator(".workspace-modal-content").waitFor();
  await ui.settle();
}

async function walkTutorial(ui, startIndex, prefix, title) {
  await ui.page.locator(".dashboard-nav-item").nth(1).click();
  await ui.page.locator(".challenge-key-tag-start").nth(startIndex).click();
  const panel = ui.page.locator("aside.key-tag-tutorial-panel");
  await panel.waitFor();
  await ui.settle(800);
  // The panel header shows "current / total"; the last step's primary button finishes the tutorial.
  const progress = async () => {
    const match = (await panel.innerText()).match(/(\d+)\s*\/\s*(\d+)/);
    return match ? { current: Number(match[1]), total: Number(match[2]) } : null;
  };
  for (let guard = 0; guard < 30; guard += 1) {
    const step = await progress();
    if (!step) break;
    await ui.capture(`${prefix}-${String(step.current).padStart(2, "0")}`, `${title}, step ${step.current} of ${step.total}`, { scope: "aside.key-tag-tutorial-panel" });
    if (step.current >= step.total) break;
    await panel.locator("button.primary").click();
    await ui.settle();
  }
}

export const tour = [
  {
    id: "dashboard",
    screens: ["dashboard-"],
    run: async (ui) => {
      await ui.capture("dashboard-home", "Dashboard");
      await ui.page.locator(".dashboard-settings-button").click();
      await ui.capture("dashboard-settings", "Dashboard settings", { scope: ".dashboard-settings-panel" });
      await ui.page.locator(".dashboard-settings-panel header button").click();
      await ui.page.locator(".dashboard-nav-item").nth(1).click();
      await ui.capture("dashboard-challenges", "Challenges");
      await ui.page.locator(".dashboard-nav-item").nth(2).click();
      await ui.capture("dashboard-customization", "Customization");
    },
  },
  {
    id: "editor",
    screens: ["editor-", "inspector-"],
    run: async (ui) => {
      await openEditor(ui);
      await ui.capture("editor-empty", "Editor");
      await ui.page.locator(".shape-menu-trigger").click();
      await ui.settle();
      await ui.capture("editor-shape-menu", "Shape menu");
      await ui.page.keyboard.press("Escape");
      await addShape(ui, "box.png");
      await ui.capture("inspector-box", "Inspector: box", { scope: ".shape-inspector" });
      await addShape(ui, "spur.png");
      await ui.capture("inspector-gear", "Inspector: gear", { scope: ".shape-inspector" });
      await ui.page.locator(".shape-inspector").hover();
      await ui.page.mouse.wheel(0, 2000);
      await ui.settle();
      await ui.capture("inspector-gear-end", "Inspector: gear, scrolled down", { scope: ".shape-inspector" });
      await addShape(ui, "text.png");
      await ui.capture("inspector-text", "Inspector: text", { scope: ".shape-inspector" });
      // Select all needs keyboard focus outside text fields (the text shape focuses its input).
      await ui.page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      await ui.page.keyboard.press("ControlOrMeta+A");
      await ui.settle();
      await ui.page.getByRole("button", { name: ui.label("editor.toolbar.align"), exact: true }).click();
      await ui.settle();
      await ui.capture("editor-align", "Align mode");
      await ui.page.keyboard.press("Escape");
      await ui.page.locator(".visibility-menu-trigger").click();
      await ui.settle();
      await ui.capture("editor-visibility-menu", "Visibility menu");
      await ui.page.keyboard.press("Escape");
      await ui.page.locator(".ruler-trigger").click();
      await ui.settle();
      await ui.capture("editor-ruler", "Ruler tools");
    },
  },
  {
    id: "workspace-settings",
    screens: ["settings-"],
    run: async (ui) => {
      await openEditor(ui);
      await openWorkspaceSettings(ui);
      const sections = ["appearance", "measurement", "workplane", "shape-defaults", "history"];
      for (const [index, section] of sections.entries()) {
        await ui.page.locator(".workspace-modal-content").locator("xpath=..").locator("nav button").nth(index).click();
        await ui.settle();
        await ui.capture(`settings-${section}`, `Workspace settings: ${section.replace("-", " ")}`);
        const body = ui.page.locator(".workspace-modal-body");
        const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 4);
        if (scrollable) {
          await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
          await ui.settle();
          await ui.capture(`settings-${section}-end`, `Workspace settings: ${section.replace("-", " ")}, scrolled down`);
        }
      }
    },
  },
  {
    id: "files",
    screens: ["export", "import"],
    run: async (ui) => {
      await openEditor(ui);
      await addShape(ui, "box.png");
      await ui.page.locator(toolbarIcon("toolbar-export.png")).click();
      const exportPanel = ui.page.locator(".export-action-panel");
      await exportPanel.waitFor();
      const formats = exportPanel.locator(".export-format-slider [role=radio]");
      const count = await formats.count();
      if (count === 0) await ui.capture("export", "Export", { scope: ".export-action-panel" });
      for (let index = 0; index < count; index += 1) {
        await formats.nth(index).click();
        await ui.settle();
        const format = (await formats.nth(index).innerText()).trim().toLowerCase() || String(index + 1);
        await ui.capture(`export-${format}`, `Export: ${format.toUpperCase()}`, { scope: ".export-action-panel" });
      }
      await ui.page.locator(toolbarIcon("toolbar-export.png")).click();
      await ui.page.locator(toolbarIcon("toolbar-import.png")).click();
      await ui.page.locator(".import-action-panel").waitFor();
      await ui.settle();
      await ui.capture("import", "Import", { scope: ".import-action-panel" });
    },
  },
  {
    id: "edges",
    screens: ["edges-"],
    run: async (ui) => {
      await openEditor(ui);
      await addShape(ui, "box.png");
      await ui.page.locator("[data-sketchforge-tool=fillet]").click();
      await ui.page.locator(".edge-modifier-panel").waitFor({ timeout: 60_000 });
      await ui.page.waitForFunction(() => !document.querySelector(".edge-modifier-panel")?.textContent?.includes("…"), null, { timeout: 60_000 }).catch(() => undefined);
      await ui.settle(600);
      await ui.capture("edges-fillet", "Fillet edges", { scope: ".edge-modifier-panel" });
      await ui.page.keyboard.press("Escape");
      await ui.settle();
    },
  },
  {
    id: "sketch",
    screens: ["sketch-"],
    run: async (ui) => {
      await openEditor(ui);
      await ui.page.locator("[role=tab]").nth(1).click();
      await ui.settle();
      await ui.capture("sketch-tab", "Sketch tab");
      await ui.page.locator(".sketch-create-menu-trigger").click();
      await ui.settle();
      await ui.capture("sketch-create-menu", "Sketch to 3D menu");
      await ui.page.locator(".sketch-create-menu [role=menuitem]").nth(0).click();
      await ui.settle(800);
      await ui.capture("sketch-extrude", "Sketch mode: extrude");
    },
  },
  { id: "tutorial-key-tag", screens: ["tutorial-key-tag"], run: (ui) => walkTutorial(ui, 0, "tutorial-key-tag", "Key Tag tutorial") },
  { id: "tutorial-nameplate", screens: ["tutorial-nameplate"], run: (ui) => walkTutorial(ui, 1, "tutorial-nameplate", "Nameplate tutorial") },
];
