import { describe, expect, it } from "vitest";
import { circleFromPoints, circleSketchGeometry } from "@/lib/sketchCircles";
import { cadSketchRegions, orderedCadSketchPaths } from "@/lib/sketchCadProfile";

describe("sketch circle geometry", () => {
  it("creates a closed four-segment cubic circle", () => {
    let id = 0;
    const geometry = circleSketchGeometry({ x: 12, z: -4 }, 10, (prefix) => `${prefix}-${id++}`);

    expect(geometry.points).toHaveLength(4);
    expect(geometry.segments).toHaveLength(4);
    expect(geometry.segments.every((segment) => segment.kind === "bezier")).toBe(true);
    expect(geometry.points.every((point) => point.mode === "smooth" && point.handleIn && point.handleOut)).toBe(true);

    const paths = orderedCadSketchPaths(geometry);
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].steps).toHaveLength(4);
  });

  it("uses the requested center and radius", () => {
    let id = 0;
    const geometry = circleSketchGeometry({ x: 7, z: 11 }, 6, (prefix) => `${prefix}-${id++}`);
    const xs = geometry.points.map((point) => point.x);
    const zs = geometry.points.map((point) => point.z);

    expect(Math.min(...xs)).toBeCloseTo(1);
    expect(Math.max(...xs)).toBeCloseTo(13);
    expect(Math.min(...zs)).toBeCloseTo(5);
    expect(Math.max(...zs)).toBeCloseTo(17);
  });

  it("derives center-radius and opposite-point diameter circles", () => {
    expect(circleFromPoints("center-radius", { x: 2, z: 3 }, { x: 5, z: 7 })).toEqual({
      center: { x: 2, z: 3 },
      radius: 5,
    });
    expect(circleFromPoints("diameter", { x: -4, z: 2 }, { x: 8, z: 2 })).toEqual({
      center: { x: 2, z: 2 },
      radius: 6,
    });
  });

  it("is classified as one closed CAD region", () => {
    let id = 0;
    const geometry = circleSketchGeometry({ x: 0, z: 0 }, 15, (prefix) => `${prefix}-${id++}`);
    const regions = cadSketchRegions(geometry);

    expect(regions).toHaveLength(1);
    expect(regions[0].outer.closed).toBe(true);
    expect(regions[0].holes).toHaveLength(0);
  });
});
