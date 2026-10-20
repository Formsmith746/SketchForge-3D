import { describe, expect, it } from "vitest";
import { addLineIntersectionPoints, closestPointOnSketchSegment, splitSketchSegment } from "@/lib/sketchPointRefinement";
import type { SketchProfile } from "@/types/sketchforge";

function idFactory() {
  let value = 0;
  return (prefix: string) => `${prefix}-${++value}`;
}

describe("sketch point refinement", () => {
  it("projects the refine preview onto the exact line position", () => {
    const start = { id: "a", x: 0, z: 0 };
    const end = { id: "b", x: 10, z: 0 };
    const placement = closestPointOnSketchSegment(
      { id: "line", startId: "a", endId: "b", kind: "line" },
      start,
      end,
      { x: 3, z: 4 },
    );
    expect(placement.amount).toBeCloseTo(0.3, 8);
    expect(placement.point).toEqual({ x: 3, z: 0 });
  });

  it("splits a bezier without moving the curve at the inserted point", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, handleOut: { x: 0, z: 10 }, mode: "smooth" },
        { id: "b", x: 10, z: 0, handleIn: { x: 10, z: 10 }, mode: "smooth" },
      ],
      segments: [{ id: "curve", startId: "a", endId: "b", kind: "bezier" }],
    };
    const result = splitSketchSegment(profile, "curve", 0.5, idFactory());
    expect(result.inserted).toBe(true);
    const inserted = result.profile.points.find((point) => point.id === result.pointId);
    expect(inserted?.x).toBeCloseTo(5, 8);
    expect(inserted?.z).toBeCloseTo(7.5, 8);
    expect(inserted?.handleIn).toEqual({ x: 2.5, z: 7.5 });
    expect(inserted?.handleOut).toEqual({ x: 7.5, z: 7.5 });
    expect(result.profile.segments).toHaveLength(2);
    expect(result.profile.segments[0].endId).toBe(result.pointId);
    expect(result.profile.segments[1].startId).toBe(result.pointId);
  });

  it("adds one shared point and splits both crossing lines", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 10, z: 10 },
        { id: "c", x: 0, z: 10 },
        { id: "d", x: 10, z: 0 },
      ],
      segments: [
        { id: "first", startId: "a", endId: "b", kind: "line" },
        { id: "second", startId: "c", endId: "d", kind: "line" },
      ],
    };
    const next = addLineIntersectionPoints(profile, idFactory());
    const intersection = next.points.find((point) => Math.abs(point.x - 5) < 1e-8 && Math.abs(point.z - 5) < 1e-8);
    expect(intersection).toBeTruthy();
    expect(next.points).toHaveLength(5);
    expect(next.segments).toHaveLength(4);
    expect(next.segments.filter((segment) => segment.startId === intersection?.id || segment.endId === intersection?.id)).toHaveLength(4);
  });

  it("reuses an existing endpoint when it lands on the middle of another line", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 10, z: 0 },
        { id: "touch", x: 5, z: 0 },
        { id: "d", x: 5, z: 6 },
      ],
      segments: [
        { id: "horizontal", startId: "a", endId: "b", kind: "line" },
        { id: "vertical", startId: "touch", endId: "d", kind: "line" },
      ],
    };
    const next = addLineIntersectionPoints(profile, idFactory());
    expect(next.points).toHaveLength(4);
    expect(next.segments).toHaveLength(3);
    expect(next.segments.filter((segment) => segment.startId === "touch" || segment.endId === "touch")).toHaveLength(3);
  });

  it("does not invent points for collinear overlap", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 10, z: 0 },
        { id: "c", x: 5, z: 0 },
        { id: "d", x: 15, z: 0 },
      ],
      segments: [
        { id: "first", startId: "a", endId: "b", kind: "line" },
        { id: "second", startId: "c", endId: "d", kind: "line" },
      ],
    };
    expect(addLineIntersectionPoints(profile, idFactory())).toBe(profile);
  });
});
