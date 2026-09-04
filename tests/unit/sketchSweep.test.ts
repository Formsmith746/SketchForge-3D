import { describe, expect, it } from "vitest";
import { buildSketchSweepGeometry, resolveSketchSweep } from "@/lib/sketchSweep";
import type { SketchProfile } from "@/types/sketchforge";

function sweepProfile(): SketchProfile {
  return {
    points: [
      { id: "a", x: -1, z: -1 },
      { id: "b", x: 1, z: -1 },
      { id: "c", x: 1, z: 1 },
      { id: "d", x: -1, z: 1 },
      { id: "path-a", x: 3, z: 0 },
      { id: "path-b", x: 8, z: 0, handleIn: { x: 6, z: -2 } },
      { id: "path-c", x: 12, z: 4, handleOut: { x: 10, z: 2 } },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line" },
      { id: "bc", startId: "b", endId: "c", kind: "line" },
      { id: "cd", startId: "c", endId: "d", kind: "line" },
      { id: "da", startId: "d", endId: "a", kind: "line" },
      { id: "path-1", startId: "path-a", endId: "path-b", kind: "line" },
      { id: "path-2", startId: "path-b", endId: "path-c", kind: "bezier" },
    ],
  };
}

describe("sketch sweep", () => {
  it("identifies one closed section and one open path from selected segments", () => {
    const resolved = resolveSketchSweep(sweepProfile(), ["ab", "bc", "cd", "da", "path-1", "path-2"]);

    expect(resolved.section.closed).toBe(true);
    expect(resolved.section.steps.map((step) => step.segment.id)).toEqual(["ab", "bc", "cd", "da"]);
    expect(resolved.path.closed).toBe(false);
    expect(resolved.path.steps.map((step) => step.segment.id).sort()).toEqual(["path-1", "path-2"]);
  });

  it("builds finite triangle geometry along the selected path", () => {
    const result = buildSketchSweepGeometry(sweepProfile(), ["ab", "bc", "cd", "da", "path-1", "path-2"]);
    try {
      const positions = result.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(12);
      expect(Array.from(positions.array as ArrayLike<number>).every(Number.isFinite)).toBe(true);
      result.geometry.computeBoundingBox();
      expect(result.geometry.boundingBox?.max.x).toBeGreaterThan(8);
      expect(result.geometry.boundingBox?.max.y).toBeGreaterThan(0);
    } finally {
      result.geometry.dispose();
    }
  });

  it("rejects selections without exactly one closed and one open path", () => {
    expect(() => resolveSketchSweep(sweepProfile(), ["ab", "bc", "cd", "da"]))
      .toThrow("exactly one closed profile");
    expect(() => resolveSketchSweep(sweepProfile(), ["ab", "bc", "path-1", "path-2"]))
      .toThrow("exactly one closed profile");
  });
});
