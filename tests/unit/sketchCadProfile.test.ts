import { describe, expect, it } from "vitest";
import { cadSketchProfileForRegions, cadSketchRegions, cadSketchSelectableRegions, orderedCadSketchPaths, selectedCadSketchRegions } from "@/lib/sketchCadProfile";
import { circleSketchGeometry } from "@/lib/sketchCircles";
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

function circle(id: string, x: number, z: number, radius: number) {
  let index = 0;
  return circleSketchGeometry({ x, z }, radius, (prefix) => `${id}-${prefix}-${index++}`);
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

  it("exposes the inside of a hole as a separately selectable profile", () => {
    const source = profile(
      rectangle("outer", 0, 0, 20, 20),
      rectangle("inner", 5, 5, 4, 4),
    );
    const regions = cadSketchSelectableRegions(source);
    const outer = regions.find((region) => region.id.includes("outer-s0"));
    const inner = regions.find((region) => region.id.includes("inner-s0"));
    expect(regions).toHaveLength(2);
    expect(outer?.holes[0].id).toContain("inner");
    expect(inner?.holes).toHaveLength(0);
    expect(selectedCadSketchRegions(source, [inner!.id])).toEqual([inner]);
  });

  it("keeps disjoint loops as separate solids", () => {
    const regions = cadSketchRegions(profile(
      rectangle("left", 0, 0, 4, 4),
      rectangle("right", 10, 0, 4, 4),
    ));
    expect(regions).toHaveLength(2);
    expect(regions.every((region) => region.holes.length === 0)).toBe(true);
  });

  it("splits overlapping loops into separately selectable faces", () => {
    const source = profile(
      rectangle("first", 0, 0, 10, 10),
      rectangle("second", 5, 5, 10, 10),
    );
    const selectable = cadSketchSelectableRegions(source);
    const overlap = selectable.find((region) => region.sourcePathIds?.length === 2);
    const exclusive = selectable.filter((region) => region.sourcePathIds?.length === 1);
    expect(selectable).toHaveLength(3);
    expect(exclusive).toHaveLength(2);
    expect(overlap).toBeDefined();
    expect(cadSketchRegions(source).map((region) => region.id).sort()).toEqual(exclusive.map((region) => region.id).sort());
    expect(selectedCadSketchRegions(source, [overlap!.id])).toEqual([overlap]);
    expect(cadSketchSelectableRegions({ ...source, segments: [...source.segments].reverse() }).map((region) => region.id)).toEqual(selectable.map((region) => region.id));
  });

  it("splits overlapping curved profiles", () => {
    const selectable = cadSketchSelectableRegions(profile(
      circle("left", 0, 0, 10),
      circle("right", 10, 0, 10),
    ));
    expect(selectable).toHaveLength(3);
    expect(selectable.filter((region) => region.sourcePathIds?.length === 1)).toHaveLength(2);
    expect(selectable.filter((region) => region.sourcePathIds?.length === 2)).toHaveLength(1);
  });

  it("splits profiles with collinear overlapping edges", () => {
    const selectable = cadSketchSelectableRegions(profile(
      rectangle("left", 0, 0, 10, 10),
      rectangle("right", 5, 0, 10, 10),
    ));
    expect(selectable).toHaveLength(3);
    expect(selectable.filter((region) => region.sourcePathIds?.length === 2)).toHaveLength(1);
  });

  it("uses an open crossing line to divide a closed profile", () => {
    const divider = {
      points: [
        { id: "divider-start", x: -5, z: 5 },
        { id: "divider-end", x: 15, z: 5 },
      ],
      segments: [{ id: "divider-segment", kind: "line" as const, startId: "divider-start", endId: "divider-end" }],
    };
    const selectable = cadSketchSelectableRegions(profile(rectangle("outer", 0, 0, 10, 10), divider));
    expect(selectable).toHaveLength(2);
    expect(new Set(selectable.map((region) => region.id)).size).toBe(2);
  });

  it("assigns stable region IDs regardless of segment order", () => {
    const left = rectangle("left", 0, 0, 4, 4);
    const right = rectangle("right", 10, 0, 4, 4);
    const source = profile(left, right);
    const reversed = { ...source, segments: [...source.segments].reverse() };
    expect(cadSketchRegions(reversed).map((region) => region.id)).toEqual(cadSketchRegions(source).map((region) => region.id));
  });

  it("filters disjoint regions by ID", () => {
    const source = profile(
      rectangle("left", 0, 0, 4, 4),
      rectangle("right", 10, 0, 4, 4),
    );
    const regions = cadSketchRegions(source);
    const left = regions.find((region) => region.id.includes("left-s0"));
    expect(left).toBeDefined();
    expect(selectedCadSketchRegions(source, [left!.id])).toEqual([left]);
    expect(cadSketchProfileForRegions(source, [left!.id]).segments.every((segment) => segment.id.startsWith("left-"))).toBe(true);
  });

  it("retains hole boundaries when filtering a region", () => {
    const source = profile(
      rectangle("outer", 0, 0, 20, 20),
      rectangle("hole", 5, 5, 4, 4),
      rectangle("other", 30, 0, 5, 5),
    );
    const outer = cadSketchRegions(source).find((region) => region.id.includes("outer-s0"));
    expect(outer).toBeDefined();
    const filtered = cadSketchProfileForRegions(source, [outer!.id]);
    expect(filtered.segments.some((segment) => segment.id.startsWith("outer-"))).toBe(true);
    expect(filtered.segments.some((segment) => segment.id.startsWith("hole-"))).toBe(true);
    expect(filtered.segments.some((segment) => segment.id.startsWith("other-"))).toBe(false);
  });

  it("keeps nested islands as independently selectable regions", () => {
    const source = profile(
      rectangle("outer", 0, 0, 40, 40),
      rectangle("hole", 5, 5, 30, 30),
      rectangle("island", 12, 12, 16, 16),
    );
    const regions = cadSketchRegions(source);
    const outer = regions.find((region) => region.id.includes("outer-s0"));
    const island = regions.find((region) => region.id.includes("island-s0"));
    expect(outer).toBeDefined();
    expect(island).toBeDefined();
    const outerProfile = cadSketchProfileForRegions(source, [outer!.id]);
    expect(outerProfile.segments.some((segment) => segment.id.startsWith("hole-"))).toBe(true);
    expect(outerProfile.segments.some((segment) => segment.id.startsWith("island-"))).toBe(false);
    expect(cadSketchProfileForRegions(source, [island!.id]).segments.every((segment) => segment.id.startsWith("island-"))).toBe(true);
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
