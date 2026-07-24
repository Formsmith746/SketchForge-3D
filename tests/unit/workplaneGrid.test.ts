import { describe, expect, it } from "vitest";
import { interiorWorkplaneGridCoordinates, workplaneGridPalette, WORKPLANE_LINE_ELEVATION, WORKPLANE_MAJOR_GRID_INTERVAL } from "@/lib/workplaneGrid";

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
});
