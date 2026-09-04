import { describe, expect, it } from "vitest";
import { pruneSketchParameters } from "@/lib/sketchConstraints";
import { sketchDimensionAnchorCandidates, sketchDimensionAnchorPoint, sketchDistanceDimensionValue } from "@/lib/sketchDimensions";
import type { SketchProfile } from "@/types/sketchforge";

function crossingProfile(): SketchProfile {
  return {
    points: [
      { id: "left", x: -10, z: 0 },
      { id: "right", x: 10, z: 0 },
      { id: "top", x: 0, z: -8 },
      { id: "bottom", x: 0, z: 12 },
    ],
    segments: [
      { id: "horizontal", kind: "line", startId: "left", endId: "right" },
      { id: "vertical", kind: "line", startId: "top", endId: "bottom" },
    ],
  };
}

describe("sketch dimension anchors", () => {
  it("offers endpoints, midpoints, and overlap intersections", () => {
    const candidates = sketchDimensionAnchorCandidates(crossingProfile());
    expect(candidates.filter((candidate) => candidate.kind === "point")).toHaveLength(4);
    expect(candidates).toContainEqual(expect.objectContaining({
      kind: "intersection",
      x: 0,
      z: 0,
      anchor: { kind: "intersection", firstSegmentId: "horizontal", secondSegmentId: "vertical", index: 0 },
    }));
    expect(candidates).toContainEqual(expect.objectContaining({ kind: "midpoint", x: 0, z: 2 }));
  });

  it("resolves midpoint and intersection references from current geometry", () => {
    const profile = crossingProfile();
    expect(sketchDimensionAnchorPoint(profile, { kind: "midpoint", segmentId: "vertical" })).toEqual({ x: 0, z: 2 });
    expect(sketchDimensionAnchorPoint(profile, { kind: "intersection", firstSegmentId: "horizontal", secondSegmentId: "vertical", index: 0 })).toEqual({ x: 0, z: 0 });
    expect(sketchDistanceDimensionValue(profile, { kind: "point", pointId: "left" }, { kind: "midpoint", segmentId: "vertical" })).toBeCloseTo(Math.hypot(10, 2));
  });

  it("prunes reference dimensions when an anchor target disappears", () => {
    const profile: SketchProfile = {
      ...crossingProfile(),
      dimensions: [{
        id: "reference",
        kind: "distance",
        start: { kind: "point", pointId: "left" },
        end: { kind: "intersection", firstSegmentId: "horizontal", secondSegmentId: "vertical", index: 0 },
      }],
    };
    expect(pruneSketchParameters(profile).dimensions).toHaveLength(1);
    expect(pruneSketchParameters({ ...profile, segments: profile.segments.filter((segment) => segment.id !== "vertical") }).dimensions).toEqual([]);
  });
});
