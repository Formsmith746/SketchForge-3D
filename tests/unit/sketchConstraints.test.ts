import { describe, expect, it } from "vitest";
import {
  moveConstrainedSketchPoint,
  pruneSketchParameters,
  setSketchPointFixed,
  setSketchSegmentConstraint,
  setSketchSegmentLength,
  solveSketchProfile,
} from "@/lib/sketchConstraints";
import type { SketchProfile } from "@/types/sketchforge";

function profile(): SketchProfile {
  return {
    points: [
      { id: "a", x: 0, z: 0 },
      { id: "b", x: 8, z: 4 },
      { id: "c", x: 12, z: 12 },
    ],
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line" },
      { id: "bc", startId: "b", endId: "c", kind: "line" },
    ],
  };
}

const createId = (prefix: string) => `${prefix}-id`;

describe("sketch constraints", () => {
  it("applies horizontal and vertical constraints without mutating the source", () => {
    const source = profile();
    const horizontal = setSketchSegmentConstraint(source, "ab", "horizontal", true, createId).profile;
    const vertical = setSketchSegmentConstraint(horizontal, "bc", "vertical", true, createId).profile;

    expect(source.points[1]).toEqual({ id: "b", x: 8, z: 4 });
    expect(horizontal.points[1].z).toBe(0);
    expect(vertical.points[2].x).toBe(vertical.points[1].x);
    expect(vertical.constraints).toHaveLength(2);
  });

  it("creates and updates a driving segment length", () => {
    const horizontal = setSketchSegmentConstraint(profile(), "ab", "horizontal", true, createId).profile;
    const dimensioned = setSketchSegmentLength(horizontal, "ab", 25, createId).profile;
    const updated = setSketchSegmentLength(dimensioned, "ab", 30, createId).profile;

    expect(dimensioned.points[1]).toMatchObject({ x: 25, z: 0 });
    expect(dimensioned.dimensions).toEqual([{ id: "sketch-length-id", kind: "length", segmentId: "ab", value: 25 }]);
    expect(solveSketchProfile(dimensioned).conflicts).toEqual([]);
    expect(updated.dimensions).toEqual([{ id: "sketch-length-id", kind: "length", segmentId: "ab", value: 30 }]);
    expect(setSketchSegmentLength(updated, "ab", null, createId).profile.dimensions).toEqual([]);
  });

  it("preserves a fixed point while solving connected geometry", () => {
    const fixed = setSketchPointFixed(profile(), "a", true, createId).profile;
    const constrained = setSketchSegmentConstraint(fixed, "ab", "horizontal", true, createId).profile;
    const moved = moveConstrainedSketchPoint(constrained, "b", { x: 20, z: 7 }).profile;
    const rejected = moveConstrainedSketchPoint(moved, "a", { x: 50, z: 50 }).profile;

    expect(moved.points.find((point) => point.id === "a")).toMatchObject({ x: 0, z: 0 });
    expect(moved.points.find((point) => point.id === "b")).toMatchObject({ x: 20, z: 0 });
    expect(rejected.points.find((point) => point.id === "a")).toMatchObject({ x: 0, z: 0 });
  });

  it("prunes parameters that reference deleted geometry", () => {
    const source: SketchProfile = {
      ...profile(),
      constraints: [
        { id: "fixed-a", kind: "fixed", pointId: "a", x: 0, z: 0 },
        { id: "missing-segment", kind: "horizontal", segmentId: "gone" },
      ],
      dimensions: [{ id: "missing-dimension", kind: "length", segmentId: "gone", value: 10 }],
    };

    const pruned = pruneSketchParameters(source);

    expect(pruned.constraints).toEqual([{ id: "fixed-a", kind: "fixed", pointId: "a", x: 0, z: 0 }]);
    expect(pruned.dimensions).toEqual([]);
  });

  it("propagates a driving length through a closed constrained profile", () => {
    const rectangle: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 10, z: 0 },
        { id: "c", x: 10, z: 5 },
        { id: "d", x: 0, z: 5 },
      ],
      segments: [
        { id: "ab", startId: "a", endId: "b", kind: "line" },
        { id: "bc", startId: "b", endId: "c", kind: "line" },
        { id: "cd", startId: "c", endId: "d", kind: "line" },
        { id: "da", startId: "d", endId: "a", kind: "line" },
      ],
      constraints: [
        { id: "h1", kind: "horizontal", segmentId: "ab" },
        { id: "v1", kind: "vertical", segmentId: "bc" },
        { id: "h2", kind: "horizontal", segmentId: "cd" },
        { id: "v2", kind: "vertical", segmentId: "da" },
      ],
    };
    const dimensioned = setSketchSegmentLength(rectangle, "ab", 20, createId).profile;
    const moved = moveConstrainedSketchPoint(dimensioned, "b", { x: 30, z: 2 });

    expect(moved.conflicts).toEqual([]);
    expect(moved.profile.points).toEqual([
      { id: "a", x: 10, z: 2, handleIn: undefined, handleOut: undefined },
      { id: "b", x: 30, z: 2, handleIn: undefined, handleOut: undefined },
      { id: "c", x: 30, z: 5, handleIn: undefined, handleOut: undefined },
      { id: "d", x: 10, z: 5, handleIn: undefined, handleOut: undefined },
    ]);
  });
});
