import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import type { SkfProjectExportInput } from "@/lib/skfProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

// The UI language must only change what is shown, never what is saved. The store and the serializer are loaded
// fresh per language so a serializer that started reading the language would see the switch.
async function loadFor(systemLanguage: string) {
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: () => undefined },
    addEventListener: () => undefined,
  });
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
  vi.stubGlobal("navigator", { languages: [systemLanguage], language: systemLanguage });
  vi.resetModules();
  const store = await import("@/i18n/store");
  store.initLanguage();
  const { exportSkfProject } = await import("@/lib/skfProject");
  return { locale: store.getLocale(), exportSkfProject };
}

describe("project file and UI language", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("saves the same .skf bytes whatever the UI language", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    const shapes = toolbarShapeAssets.map((asset, index) => makeShapeFromAsset(asset, { x: index * 30, z: 0 }));
    const input: SkfProjectExportInput = {
      projectId: "project-locale",
      projectName: "Untitled design 1",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes,
      history: [editorHistoryEntry(shapes, [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    };

    const russian = await loadFor("ru-RU");
    expect(russian.locale).toBe("ru");
    const savedInRussian = await russian.exportSkfProject(input);

    const english = await loadFor("en-US");
    expect(english.locale).toBe("en");
    const savedInEnglish = await english.exportSkfProject(input);

    expect(savedInRussian).toEqual(savedInEnglish);
    const project = strFromU8(unzipSync(savedInRussian)["project.json"]);
    for (const asset of toolbarShapeAssets) expect(project).toContain(`"name":"${asset.name}"`);
    expect(project).not.toMatch(/[А-Яа-яЁё]/);
  });
});
