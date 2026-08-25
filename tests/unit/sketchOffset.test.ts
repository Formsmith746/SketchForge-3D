import { describe, expect, it } from "vitest";
import { offsetSketchSegments } from "@/lib/sketchOffset";
import type { SketchProfile } from "@/types/sketchforge";

function sequentialIds() {
  let next = 0;
  return (prefix: string) => `${prefix}-${++next}`;
}

function generatedPoints(result: ReturnType<typeof offsetSketchSegments>) {
  const ids = new Set(result.pointIds);
  return result.profile.points.filter((point) => ids.has(point.id));
}

function square(clockwise = false): SketchProfile {
  const points = [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: 4, z: 0 },
    { id: "c", x: 4, z: 4 },
    { id: "d", x: 0, z: 4 },
  ];
  const order = clockwise ? ["a", "d", "c", "b"] : ["a", "b", "c", "d"];
  return {
    points,
    segments: order.map((startId, index) => ({
      id: `side-${index}`,
      startId,
      endId: order[(index + 1) % order.length],
      kind: "line" as const,
    })),
  };
}

function bounds(points: Array<{ x: number; z: number }>) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minZ: Math.min(...points.map((point) => point.z)),
    maxZ: Math.max(...points.map((point) => point.z)),
  };
}

describe("sketch offset", () => {
  it("offsets an open line left for positive distance and right for negative distance", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 5, z: 0 }],
      segments: [{ id: "line", startId: "a", endId: "b", kind: "line" }],
    };

    const left = offsetSketchSegments(profile, ["line"], 2, { createId: sequentialIds() });
    const right = offsetSketchSegments(profile, ["line"], -2, { createId: sequentialIds() });

    expect(generatedPoints(left).map(({ x, z }) => ({ x, z }))).toEqual([{ x: 0, z: 2 }, { x: 5, z: 2 }]);
    expect(generatedPoints(right).map(({ x, z }) => ({ x, z }))).toEqual([{ x: 0, z: -2 }, { x: 5, z: -2 }]);
    expect(left.closed).toBe(false);
  });

  it("expands one selected seed through a connected L chain", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 4, z: 0 }, { id: "c", x: 4, z: 3 }],
      segments: [
        { id: "ab", startId: "a", endId: "b", kind: "line" },
        { id: "bc", startId: "b", endId: "c", kind: "line" },
      ],
    };

    const result = offsetSketchSegments(profile, ["bc"], 1, { createId: sequentialIds() });

    expect(generatedPoints(result).map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 0, z: 1 },
      { x: 3, z: 1 },
      { x: 3, z: 3 },
    ]);
    expect(result.segmentIds).toHaveLength(2);

    const selectedOnly = offsetSketchSegments(profile, ["bc"], 1, { includeConnected: false, createId: sequentialIds() });
    expect(generatedPoints(selectedOnly).map(({ x, z }) => ({ x, z }))).toEqual([{ x: 3, z: 0 }, { x: 3, z: 3 }]);
  });

  it.each([false, true])("offsets a square outward and inward independent of winding (clockwise=%s)", (clockwise) => {
    const profile = square(clockwise);
    const outward = offsetSketchSegments(profile, ["side-2"], 1, { createId: sequentialIds() });
    const inward = offsetSketchSegments(profile, ["side-0"], -1, { createId: sequentialIds() });

    expect(bounds(generatedPoints(outward))).toEqual({ minX: -1, maxX: 5, minZ: -1, maxZ: 5 });
    expect(bounds(generatedPoints(inward))).toEqual({ minX: 1, maxX: 3, minZ: 1, maxZ: 3 });
    expect(outward.closed).toBe(true);
    expect(outward.segmentIds).toHaveLength(outward.pointIds.length);
  });

  it("adaptively flattens Bezier segments using forward and reverse handles", () => {
    const reverse: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, handleIn: { x: 0, z: 4 } },
        { id: "b", x: 6, z: 0, handleOut: { x: 6, z: 4 } },
      ],
      segments: [{ id: "curve", startId: "b", endId: "a", kind: "bezier" }],
    };
    const forward: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, handleOut: { x: 0, z: 4 } },
        { id: "b", x: 6, z: 0, handleIn: { x: 6, z: 4 } },
      ],
      segments: [{ id: "curve", startId: "a", endId: "b", kind: "bezier" }],
    };

    const result = offsetSketchSegments(reverse, ["curve"], 0.5, { createId: sequentialIds() });
    const forwardResult = offsetSketchSegments(forward, ["curve"], 0.5, { createId: sequentialIds() });
    const points = generatedPoints(result);

    expect(points.length).toBeGreaterThan(8);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(3);
    expect(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expect(generatedPoints(forwardResult).map(({ x, z }) => ({ x, z }))).toEqual(points.map(({ x, z }) => ({ x, z })));
  });

  it("falls back to a line when a Bezier handle is missing", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0, handleOut: { x: 2, z: 4 } }, { id: "b", x: 4, z: 0 }],
      segments: [{ id: "curve", startId: "a", endId: "b", kind: "bezier" }],
    };

    expect(generatedPoints(offsetSketchSegments(profile, ["curve"], 1, { createId: sequentialIds() })))
      .toMatchObject([{ x: 0, z: 1 }, { x: 4, z: 1 }]);
  });

  it("rejects branches, disconnected selections, invalid references, and zero-length topology", () => {
    const branch: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 2, z: 0 },
        { id: "c", x: 4, z: 0 },
        { id: "d", x: 2, z: 2 },
      ],
      segments: [
        { id: "ab", startId: "a", endId: "b" },
        { id: "bc", startId: "b", endId: "c" },
        { id: "bd", startId: "b", endId: "d" },
      ],
    };
    const disconnected: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 }, { id: "b", x: 1, z: 0 },
        { id: "c", x: 3, z: 0 }, { id: "d", x: 4, z: 0 },
      ],
      segments: [{ id: "ab", startId: "a", endId: "b" }, { id: "cd", startId: "c", endId: "d" }],
    };
    const invalid: SketchProfile = { points: [{ id: "a", x: 0, z: 0 }], segments: [{ id: "bad", startId: "a", endId: "missing" }] };
    const zeroLength: SketchProfile = {
      points: [{ id: "a", x: 1, z: 1 }, { id: "b", x: 1, z: 1 }],
      segments: [{ id: "zero", startId: "a", endId: "b" }],
    };

    expect(() => offsetSketchSegments(branch, ["ab"], 1)).toThrow(/branches/);
    expect(() => offsetSketchSegments(disconnected, ["ab", "cd"], 1)).toThrow(/disconnected/);
    expect(() => offsetSketchSegments(invalid, ["bad"], 1)).toThrow(/Invalid point reference/);
    expect(() => offsetSketchSegments(zeroLength, ["zero"], 1)).toThrow(/Zero-length/);
    expect(() => offsetSketchSegments(disconnected, ["missing"], 1)).toThrow(/Invalid sketch segment reference/);
  });

  it("rejects zero distance and a collapsed closed inward offset", () => {
    expect(() => offsetSketchSegments(square(), ["side-0"], 0)).toThrow(/non-zero/);
    expect(() => offsetSketchSegments(square(), ["side-0"], -2)).toThrow(/collapsed/);
  });

  it("rejects a generated self-intersecting offset", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 4, z: 4 },
        { id: "c", x: 0, z: 4 },
        { id: "d", x: 4, z: 0 },
      ],
      segments: [
        { id: "ab", startId: "a", endId: "b" },
        { id: "bc", startId: "b", endId: "c" },
        { id: "cd", startId: "c", endId: "d" },
      ],
    };

    expect(() => offsetSketchSegments(profile, ["ab"], 0.1)).toThrow(/self-intersects/);
  });

  it("uses fresh unique IDs, appends independent lines, and leaves the source immutable", () => {
    const profile = square();
    profile.constraints = [{ id: "constraint", kind: "horizontal", segmentId: "side-0" }];
    profile.dimensions = [{ id: "dimension", kind: "length", segmentId: "side-0", value: 4 }];
    const snapshot = structuredClone(profile);
    const ids = ["a", "side-0", "new-point", "new-point-2", "new-point-3", "new-point-4", "new-segment", "new-segment-2", "new-segment-3", "new-segment-4"];

    const result = offsetSketchSegments(profile, ["side-0"], 1, { createId: () => ids.shift() ?? "unused" });

    expect(profile).toEqual(snapshot);
    expect(result.profile).not.toBe(profile);
    expect(result.profile.points.slice(0, profile.points.length)).toEqual(profile.points);
    expect(new Set([...result.pointIds, ...result.segmentIds]).size).toBe(result.pointIds.length + result.segmentIds.length);
    expect(result.pointIds).not.toContain("a");
    expect(result.segmentIds).not.toContain("side-0");
    expect(result.profile.segments.slice(-result.segmentIds.length).every((segment) => segment.kind === "line")).toBe(true);
    expect(result.profile.constraints).toEqual(profile.constraints);
    expect(result.profile.dimensions).toEqual(profile.dimensions);
  });
});
