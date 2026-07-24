import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule, { type ManifoldToplevel } from "manifold-3d";
import {
  buildSketchRevolveMesh,
  normalizeSketchRevolveSettings,
  sketchProfileToRevolvePolygons,
} from "@/lib/sketchRevolve";
import type { SketchProfile } from "@/types/sketchforge";

function rectangleProfile(innerRadius = 5, outerRadius = 10, height = 20): SketchProfile {
  return {
    points: [
      { id: "a", x: -innerRadius, z: 0 },
      { id: "b", x: -outerRadius, z: 0 },
      { id: "c", x: -outerRadius, z: height },
      { id: "d", x: -innerRadius, z: height },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line" },
      { id: "bc", startId: "b", endId: "c", kind: "line" },
      { id: "cd", startId: "c", endId: "d", kind: "line" },
      { id: "da", startId: "d", endId: "a", kind: "line" },
    ],
  };
}

describe("sketch revolve", () => {
  let runtime: ManifoldToplevel;

  beforeAll(async () => {
    runtime = await manifoldModule();
    runtime.setup();
  });

  it("revolves a closed left-side profile around the center axis", () => {
    const mesh = buildSketchRevolveMesh(runtime, rectangleProfile(), { sides: 32 });
    expect(mesh.triangleCount).toBeGreaterThan(100);
    expect(mesh.width).toBeCloseTo(20, 4);
    expect(mesh.depth).toBeCloseTo(20, 4);
    expect(mesh.height).toBeCloseTo(20, 4);
    expect(Math.min(...mesh.positions.filter((_value, index) => index % 3 === 1))).toBeCloseTo(0, 6);
  });

  it("creates thickness automatically for an open profile", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: -8, z: 0 }, { id: "b", x: -8, z: 20 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line" }],
    };
    const polygons = sketchProfileToRevolvePolygons(profile, { thickness: 2 });
    expect(polygons).toHaveLength(1);
    expect(Math.min(...polygons[0].map((point) => point[0]))).toBeCloseTo(7, 6);
    expect(Math.max(...polygons[0].map((point) => point[0]))).toBeCloseTo(9, 6);
    const mesh = buildSketchRevolveMesh(runtime, profile, { thickness: 2, sides: 24 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.width).toBeCloseTo(18, 4);
    expect(mesh.height).toBeCloseTo(20, 4);
  });

  it("allows construction points across the axis but only revolves the working-side segment", () => {
    const profile: SketchProfile = {
      points: [{ id: "construction", x: 10, z: 0 }, { id: "profile", x: -10, z: 20 }],
      segments: [{ id: "crossing", startId: "construction", endId: "profile", kind: "line" }],
    };
    const polygons = sketchProfileToRevolvePolygons(profile, { thickness: 1 });
    expect(polygons).toHaveLength(1);
    expect(Math.max(...polygons[0].map((point) => point[1]))).toBeLessThan(11);
    expect(Math.max(...polygons[0].map((point) => point[0]))).toBeGreaterThan(10);

    const mesh = buildSketchRevolveMesh(runtime, profile, { thickness: 1, sides: 24 });
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.height).toBeGreaterThan(9);
    expect(mesh.height).toBeLessThan(11);
  });

  it("supports partial and reverse sweeps", () => {
    const quarter = buildSketchRevolveMesh(runtime, rectangleProfile(), { startAngle: 30, sweepAngle: 90, sides: 48 });
    const reverse = buildSketchRevolveMesh(runtime, rectangleProfile(), { startAngle: 120, sweepAngle: -90, sides: 48 });
    expect(quarter.triangleCount).toBeGreaterThan(0);
    expect(reverse.triangleCount).toBeGreaterThan(0);
    expect(quarter.width).toBeLessThanOrEqual(20.001);
    expect(quarter.depth).toBeLessThanOrEqual(20.001);
  });

  it("normalizes unsafe revolve settings", () => {
    expect(normalizeSketchRevolveSettings({ startAngle: -30, sweepAngle: 0, sides: 500, quality: 0, thickness: -2 })).toEqual({
      startAngle: 330,
      sweepAngle: 1,
      sides: 128,
      quality: 1,
      thickness: 0.1,
    });
  });
});
