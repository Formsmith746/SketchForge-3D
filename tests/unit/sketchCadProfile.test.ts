import { describe, expect, it } from "vitest";
import { cadSketchRegions, orderedCadSketchPaths } from "@/lib/sketchCadProfile";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

function rectangle(id: string, x: number, z: number, width: number, depth: number) {
  const points: SketchPoint[] = [
    { id: `${id}-0`, x, z },
    { id: `${id}-1`, x: x + width, z },
    { id: `${id}-2`, x: x + width, z: z + depth },
    { id: `${id}-3`, x, z: z + depth },
  ];
  const segments: SketchSegment[] = points.map((point, index) => ({
    id: `${id}-s${index}`,
    kind: "line",
    startId: point.id,
    endId: points[(index + 1) % points.length].id,
  }));
  return { points, segments };
}

function profile(...rectangles: ReturnType<typeof rectangle>[]): SketchProfile {
  return {
    points: rectangles.flatMap((rectangle) => rectangle.points),
    segments: rectangles.flatMap((rectangle) => rectangle.segments),
  };
}

describe("OCCT sketch profile preparation", () => {
  it("orders a closed loop even when its segments arrive out of order", () => {
    const square = rectangle("outer", 0, 0, 20, 10);
    const paths = orderedCadSketchPaths({ ...profile(square), segments: [...square.segments].reverse() });
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].steps).toHaveLength(4);
  });

  it("assigns an enclosed loop as a hole", () => {
    const regions = cadSketchRegions(profile(
      rectangle("outer", 0, 0, 20, 20),
      rectangle("hole", 5, 5, 4, 4),
    ));
    expect(regions).toHaveLength(1);
    expect(regions[0].outer.id).toContain("outer");
    expect(regions[0].holes).toHaveLength(1);
  });

  it("keeps disjoint loops as separate solids", () => {
    const regions = cadSketchRegions(profile(
      rectangle("left", 0, 0, 4, 4),
      rectangle("right", 10, 0, 4, 4),
    ));
    expect(regions).toHaveLength(2);
    expect(regions.every((region) => region.holes.length === 0)).toBe(true);
  });

  it("rejects open paths with a clear error", () => {
    const square = rectangle("open", 0, 0, 10, 10);
    square.segments.pop();
    expect(() => cadSketchRegions(profile(square))).toThrow(/open/i);
  });

  it("creates a solid island inside a hole (3-level nesting)", () => {
    const regions = cadSketchRegions(profile(
      rectangle("outer", 0, 0, 40, 40),
      rectangle("hole", 5, 5, 30, 30),
      rectangle("island", 12, 12, 16, 16),
    ));
    expect(regions).toHaveLength(2);
    const outerRegion = regions.find((r) => r.outer.id.includes("outer"));
    const islandRegion = regions.find((r) => r.outer.id.includes("island"));
    expect(outerRegion).toBeDefined();
    expect(outerRegion!.holes).toHaveLength(1);
    expect(outerRegion!.holes[0].id).toContain("hole");
    expect(islandRegion).toBeDefined();
    expect(islandRegion!.holes).toHaveLength(0);
  });

  it("handles 4-level nesting (outer > hole > island > island-hole)", () => {
    const regions = cadSketchRegions(profile(
      rectangle("outer", 0, 0, 60, 60),
      rectangle("hole", 5, 5, 50, 50),
      rectangle("island", 15, 15, 30, 30),
      rectangle("ihole", 20, 20, 20, 20),
    ));
    const outerRegion = regions.find((r) => r.outer.id.includes("outer"));
    const islandRegion = regions.find((r) => r.outer.id.includes("island"));
    expect(outerRegion).toBeDefined();
    expect(outerRegion!.holes).toHaveLength(1);
    expect(outerRegion!.holes[0].id).toContain("hole");
    expect(islandRegion).toBeDefined();
    expect(islandRegion!.holes).toHaveLength(1);
    expect(islandRegion!.holes[0].id).toContain("ihole");
  });

  it("throws when all paths are open", () => {
    const open1 = rectangle("a", 0, 0, 10, 10);
    open1.segments.pop();
    const open2 = rectangle("b", 20, 0, 10, 10);
    open2.segments.pop();
    expect(() => cadSketchRegions(profile(open1, open2))).toThrow(/open/i);
  });

  it("returns empty for a single degenerate zero-area path", () => {
    const degenerate: SketchProfile = {
      points: [
        { id: "d-0", x: 0, z: 0 },
        { id: "d-1", x: 1, z: 0 },
        { id: "d-2", x: 0, z: 0 },
      ],
      segments: [
        { id: "d-s0", kind: "line", startId: "d-0", endId: "d-1" },
        { id: "d-s1", kind: "line", startId: "d-1", endId: "d-2" },
        { id: "d-s2", kind: "line", startId: "d-2", endId: "d-0" },
      ],
    };
    expect(cadSketchRegions(degenerate)).toEqual([]);
  });
});
