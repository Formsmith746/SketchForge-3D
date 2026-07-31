import { describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import { findSketchOutlineIntersection } from "@/lib/sketchProfileValidation";

describe("sketch profile validation", () => {
  it("rejects a bow-tie profile whose non-adjacent edges cross", () => {
    expect(findSketchOutlineIntersection([[
      { x: 0, y: 10 },
      { x: 37, y: 10 },
      { x: 3, y: 0 },
      { x: 34, y: 0 },
    ]])).toEqual({ outlineA: 0, edgeA: 1, outlineB: 0, edgeB: 3 });
  });

  it("accepts a normal simple profile", () => {
    expect(findSketchOutlineIntersection([[
      { x: 0, y: 10 },
      { x: 37, y: 10 },
      { x: 34, y: 0 },
      { x: 3, y: 0 },
    ]])).toBeNull();
  });

  it("allows disjoint and nested profiles", () => {
    expect(findSketchOutlineIntersection([
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
      [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }],
      [{ x: 30, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 30, y: 10 }],
    ])).toBeNull();
  });

  it("rejects closed profiles that cross or touch each other", () => {
    expect(findSketchOutlineIntersection([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 5, y: -5 }, { x: 15, y: -5 }, { x: 15, y: 5 }, { x: 5, y: 5 }],
    ])).not.toBeNull();
  });

  it("resolves a bow-tie into valid even-odd regions that can be extruded", async () => {
    const runtime = await manifoldModule();
    runtime.setup();
    const section = new runtime.CrossSection([[
      [-18.5, -5],
      [18.5, -5],
      [-15.5, 5],
      [15.5, 5],
    ]], "EvenOdd");
    const solid = section.extrude(10);
    try {
      expect(section.toPolygons()).toHaveLength(2);
      expect(solid.status()).toBe("NoError");
      expect(solid.numTri()).toBeGreaterThan(0);
    } finally {
      solid.delete();
      section.delete();
    }
  });
});
