import { describe, expect, it } from "vitest";
import type { WorkplaneShape } from "@/types/sketchforge";
import { aabbsOverlap, shapeYawDegrees, worldAabb } from "@/lib/stepExport";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "s1",
    name: "Shape",
    kind: "box",
    color: "#ffffff",
    x: 0,
    z: 0,
    size: 10,
    width: 10,
    depth: 10,
    height: 10,
    rotation: 0,
    ...overrides,
  };
}

describe("shapeYawDegrees", () => {
  it("drops yaw on a circular cylinder so the exported diameter is invariant", () => {
    expect(shapeYawDegrees(shape({ kind: "cylinder", width: 8, depth: 8, rotation: 30 }))).toBe(0);
  });

  it("drops yaw on a circular cone too", () => {
    expect(shapeYawDegrees(shape({ kind: "cone", width: 8, depth: 8, rotation: 30 }))).toBe(0);
  });

  it("keeps yaw on an elliptical cylinder where orientation matters", () => {
    expect(shapeYawDegrees(shape({ kind: "cylinder", width: 8, depth: 4, rotation: 30 }))).toBe(30);
  });

  it("keeps yaw on a box regardless of footprint", () => {
    expect(shapeYawDegrees(shape({ kind: "box", width: 8, depth: 8, rotation: 45 }))).toBe(45);
  });
});

describe("worldAabb", () => {
  it("builds a tight box for an axis-aligned shape, offset by elevation", () => {
    const box = worldAabb(shape({ x: 5, z: -3, elevation: 2, width: 10, depth: 6, height: 4 }));
    expect(box.min).toEqual([0, 2, -6]);
    expect(box.max).toEqual([10, 6, 0]);
  });

  it("falls back to the bounding-sphere box for a rotated shape", () => {
    const box = worldAabb(shape({ width: 10, depth: 6, height: 4, rotation: 30 }));
    const r = 0.5 * Math.sqrt(10 * 10 + 4 * 4 + 6 * 6);
    expect(box.min).toEqual([-r, 2 - r, -r]);
    expect(box.max).toEqual([r, 2 + r, r]);
  });

  it("treats a circular cylinder's yaw as no rotation and keeps the tight box", () => {
    const box = worldAabb(shape({ kind: "cylinder", width: 8, depth: 8, height: 4, rotation: 90 }));
    expect(box.min).toEqual([-4, 0, -4]);
    expect(box.max).toEqual([4, 4, 4]);
  });
});

describe("aabbsOverlap", () => {
  const a = { min: [0, 0, 0] as [number, number, number], max: [10, 10, 10] as [number, number, number] };

  it("detects overlapping boxes", () => {
    expect(aabbsOverlap(a, { min: [5, 5, 5], max: [15, 15, 15] })).toBe(true);
  });

  it("treats face-touching boxes as overlapping (inclusive bounds)", () => {
    expect(aabbsOverlap(a, { min: [10, 0, 0], max: [20, 10, 10] })).toBe(true);
  });

  it("rejects boxes separated on a single axis", () => {
    expect(aabbsOverlap(a, { min: [11, 0, 0], max: [20, 10, 10] })).toBe(false);
    expect(aabbsOverlap(a, { min: [0, 0, 11], max: [10, 10, 20] })).toBe(false);
  });
});
