import { describe, expect, it } from "vitest";
import { rotateSketchPoints, selectedClosedSketchPoints } from "@/lib/sketchRotation";
import type { SketchProfile } from "@/types/sketchforge";

const rectangle: SketchProfile = {
  points: [
    { id: "a", x: 0, z: 0, handleOut: { x: 1, z: 0 } },
    { id: "b", x: 4, z: 0 },
    { id: "c", x: 4, z: 2 },
    { id: "d", x: 0, z: 2 },
  ],
  segments: [
    { id: "ab", startId: "a", endId: "b" },
    { id: "bc", startId: "b", endId: "c" },
    { id: "cd", startId: "c", endId: "d" },
    { id: "da", startId: "d", endId: "a" },
  ],
};

describe("sketch rotation", () => {
  it("recognizes a complete closed sketch selection", () => {
    const points = selectedClosedSketchPoints(rectangle, {
      pointIds: ["a", "b", "c", "d"],
      segmentIds: ["ab", "bc", "cd", "da"],
    });
    expect(points?.map((point) => point.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects an open, partial, or image-inclusive selection", () => {
    expect(selectedClosedSketchPoints(rectangle, {
      pointIds: ["a", "b", "c", "d"],
      segmentIds: ["ab", "bc", "cd"],
    })).toBeNull();
    expect(selectedClosedSketchPoints(rectangle, {
      pointIds: ["a", "b", "c", "d"],
      segmentIds: ["ab", "bc", "cd", "da"],
      imageIds: ["reference-image"],
    })).toBeNull();
  });

  it("rotates points and bezier handles around the selection bounds center", () => {
    const rotated = rotateSketchPoints(rectangle.points, 90);
    const first = rotated.find((point) => point.id === "a");
    expect(first?.x).toBeCloseTo(3, 8);
    expect(first?.z).toBeCloseTo(-1, 8);
    expect(first?.handleOut?.x).toBeCloseTo(3, 8);
    expect(first?.handleOut?.z).toBeCloseTo(0, 8);
  });
});
