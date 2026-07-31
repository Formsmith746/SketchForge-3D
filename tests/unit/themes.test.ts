import { describe, expect, it } from "vitest";
import { appColorModeForThemePreset, defaultThemes, THEME_PRESET_OPTIONS } from "@/lib/themes";

describe("theme presets", () => {
  it("includes the current SketchForge appearance as a selectable preset", () => {
    expect(THEME_PRESET_OPTIONS.map((option) => option.value)).toEqual([
      "sketchforge",
      "light",
      "dark",
      "solidworks",
      "inventor",
      "custom",
    ]);
    expect(defaultThemes.sketchforge).toMatchObject({
      id: "sketchforge",
      name: "SketchForge",
      ui: { background: "#101820", primary: "#0e69f1" },
      viewport: { background: "#101820", gridAxis: "#65c9df" },
    });
  });

  it("uses app dark mode only for the current preset so legacy presets are not overridden", () => {
    expect(appColorModeForThemePreset("sketchforge")).toBe("dark");
    expect(appColorModeForThemePreset("dark")).toBe("light");
    expect(appColorModeForThemePreset("solidworks")).toBe("light");
    expect(appColorModeForThemePreset("custom")).toBe("light");
  });
});
