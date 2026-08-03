import { describe, expect, it } from "vitest";
import { placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import { placeSketchExtrusion } from "@/lib/sketchPlacement";
import type { WorkplaneShape } from "@/types/sketchforge";

function extrusion(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "sketch-extrusion-1",
    name: "Sketch extrusion",
    kind: "mesh",
    color: "#d41721",
    x: 3,
    z: -2,
    elevation: 0,
    size: 12,
    width: 12,
    depth: 8,
    height: 10,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 12,
      baseDepth: 8,
      baseHeight: 10,
      triangleCount: 1,
      sourceFormat: "json",
    },
    ...overrides,
  };
}

describe("sketch extrusion placement", () => {
  it("places a new extrusion outward from a vertical face", () => {
    const workplane = placementWorkplaneFromSurface(
      { x: 20, y: 7, z: 4 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const placed = placeSketchExtrusion(extrusion(), workplane);

    expect(placed.x).toBeCloseTo(25);
    expect(placed.elevation).toBeCloseTo(5);
    expect(placed.rotationZ).toBeCloseTo(270);
  });

  it("keeps an edited extrusion's existing world transform", () => {
    const existing = extrusion({
      x: 28,
      z: 14,
      elevation: 9,
      rotation: 18,
      rotationX: 32,
      rotationZ: -21,
    });
    const regenerated = extrusion({ width: 20 });
    const placed = placeSketchExtrusion(
      regenerated,
      placementWorkplaneFromSurface(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 0, z: 0 },
      ),
      existing,
    );

    expect(placed).toEqual(expect.objectContaining({
      x: 28,
      z: 14,
      elevation: 9,
      rotation: 18,
      rotationX: 32,
      rotationZ: 339,
      width: 20,
    }));
  });
});
