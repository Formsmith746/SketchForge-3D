import { describe, expect, it } from "vitest";
import { translatorFor } from "@/i18n/translator";
import { WORKSPACE_UNIT_OPTIONS, scaleOptionsForUnits, snapGridLabel, workspaceScaleLabel, workspaceUnitsLabel } from "@/lib/measurementUnits";
import type { GridSize } from "@/types/sketchforge";

const en = translatorFor("en");
const ru = translatorFor("ru");
const GRID_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];

describe("measurement labels", () => {
  it("keeps stored unit and scale values in English", () => {
    expect(WORKSPACE_UNIT_OPTIONS).toEqual(["Metric (Default)", "Imperial", "Bricks"]);
    expect(scaleOptionsForUnits("Metric (Default)")).toEqual(["1:1 (millimeters)", "1:10 (centimeters)", "1:1000 (meters)"]);
  });

  it("translates every stored unit and scale value for display", () => {
    for (const units of WORKSPACE_UNIT_OPTIONS) {
      expect(workspaceUnitsLabel(ru, units)).not.toBe(units);
      for (const scale of scaleOptionsForUnits(units)) {
        expect(workspaceScaleLabel(ru, scale)).not.toBe(scale);
        expect(workspaceScaleLabel(en, scale)).not.toMatch(/^panels\./);
      }
    }
  });

  it("passes unknown stored values through", () => {
    expect(workspaceUnitsLabel(ru, "Parsecs")).toBe("Parsecs");
    expect(workspaceScaleLabel(ru, "1:7 (cubits)")).toBe("1:7 (cubits)");
  });

  it("labels every snap grid step", () => {
    expect(GRID_SIZES.map((size) => snapGridLabel(en, size))).toEqual(["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"]);
    for (const size of GRID_SIZES) expect(snapGridLabel(ru, size)).not.toBe(size);
  });
});
