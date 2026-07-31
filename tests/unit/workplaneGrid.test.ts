import { describe, expect, it } from "vitest";
import { interiorWorkplaneGridCoordinates, workplaneGridPalette, workplaneThemePalette, WORKPLANE_LINE_ELEVATION, WORKPLANE_MAJOR_GRID_INTERVAL } from "@/lib/workplaneGrid";

describe("workplane grid geometry", () => {
  it("excludes both perimeter coordinates when spacing divides the workplane", () => {
    const coordinates = interiorWorkplaneGridCoordinates(200, 5).map(({ coordinate }) => coordinate);

    expect(coordinates).not.toContain(-100);
    expect(coordinates).not.toContain(100);
    expect(coordinates).toContain(0);
    expect(coordinates.at(0)).toBe(-95);
    expect(coordinates.at(-1)).toBe(95);
  });

  it("keeps the final interior line for custom spacing", () => {
    const coordinates = interiorWorkplaneGridCoordinates(200, 30).map(({ coordinate }) => coordinate);

    expect(coordinates).toEqual([-70, -40, -10, 20, 50, 80]);
  });

  it("uses one elevation for grid and border lines", () => {
    expect(WORKPLANE_LINE_ELEVATION).toBe(0);
  });

  it("groups minor grid blocks into five-by-five major sections", () => {
    expect(WORKPLANE_MAJOR_GRID_INTERVAL).toBe(5);
  });

  it("preserves the minor, major, and axis line hierarchy", () => {
    const palette = workplaneGridPalette();

    expect(palette.minor.opacity).toBeLessThan(palette.major.opacity);
    expect(palette.major.opacity).toBeLessThan(palette.axis.opacity);
    expect(palette.minor.color).not.toBe(palette.major.color);
  });

  it("uses a complete dark viewport palette without changing the configured project background", () => {
    const configuredBackground = "#f8fbfc";
    const dark = workplaneThemePalette("dark", configuredBackground);
    const light = workplaneThemePalette("light", configuredBackground);

    expect(dark.sceneBackground).not.toBe(configuredBackground);
    expect(dark.surface.color).not.toBe(light.surface.color);
    expect(dark.grid.minor.color).not.toBe(light.grid.minor.color);
    expect(light.sceneBackground).toBe(configuredBackground);
  });

  it("applies a custom project grid color while retaining line hierarchy", () => {
    const customColor = "#c23b72";
    const palette = workplaneGridPalette("light", customColor);

    expect(palette.minor.color).toBe(customColor);
    expect(palette.major.color).toBe(customColor);
    expect(palette.axis.color).toBe(customColor);
    expect(palette.minor.opacity).toBeLessThan(palette.major.opacity);
    expect(palette.major.opacity).toBeLessThan(palette.axis.opacity);
  });
});
