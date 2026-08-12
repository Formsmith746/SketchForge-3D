import { describe, expect, it } from "vitest";
import {
  createLoftGeometry,
  isPolygonLoftShape,
  loftSettings,
  normalizeLoftLayers,
  normalizeLoftRotation,
  normalizeLoftSegments,
  normalizeLoftShape,
  normalizeLoftTopSize,
} from "@/lib/loftGeometry";
import type { LoftProfileShape } from "@/types/sketchforge";

function edgeUseCounts(position: { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number }) {
  const uses = new Map<string, number>();
  const keyForPoint = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
    .map((value) => value.toFixed(5))
    .join(",");
  for (let index = 0; index + 2 < position.count; index += 3) {
    const triangle = [keyForPoint(index), keyForPoint(index + 1), keyForPoint(index + 2)];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

function signedVolume(position: { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number }) {
  let volume = 0;
  for (let index = 0; index + 2 < position.count; index += 3) {
    const ax = position.getX(index), ay = position.getY(index), az = position.getZ(index);
    const bx = position.getX(index + 1), by = position.getY(index + 1), bz = position.getZ(index + 1);
    const cx = position.getX(index + 2), cy = position.getY(index + 2), cz = position.getZ(index + 2);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

const PROFILE_SHAPES: LoftProfileShape[] = ["Oval", "Rectangle", "Triangle", "Pentagon", "Hexagon"];

describe("loft geometry", () => {
  it.each<[LoftProfileShape, LoftProfileShape]>([
    ["Rectangle", "Oval"],
    ["Oval", "Triangle"],
    ["Triangle", "Pentagon"],
    ["Pentagon", "Hexagon"],
    ["Hexagon", "Rectangle"],
  ])("creates a closed, outward-facing solid morphing from %s to %s", (bottomShape, topShape) => {
    const geometry = createLoftGeometry({
      width: 28,
      depth: 22,
      height: 18,
      bottomShape,
      topShape,
      segments: 32,
      layers: 12,
    });
    const position = geometry.getAttribute("position");

    expect(geometry.getIndex()).toBeNull();
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(signedVolume(position)).toBeGreaterThan(0);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(18, 5);
  });

  it.each(PROFILE_SHAPES)("produces the expected bounding envelope for a uniform %s -> same shape loft", (kind) => {
    const geometry = createLoftGeometry({
      width: 30,
      depth: 20,
      height: 15,
      bottomShape: kind,
      topShape: kind,
      segments: 48,
      layers: 8,
    });
    const box = geometry.boundingBox!;
    const isPolygon = isPolygonLoftShape(kind);

    // Polygon ends use circumradius (derived from width only) for both axes -- depth is
    // intentionally ignored for those ends, so their Z extent tracks the X extent, not `depth`.
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(30 + 1e-6);
    expect(box.max.z - box.min.z).toBeLessThanOrEqual((isPolygon ? 30 : 20) + 1e-6);
    if (!isPolygon) {
      expect(box.max.x - box.min.x).toBeCloseTo(30, 4);
      expect(box.max.z - box.min.z).toBeCloseTo(20, 4);
    }
  });

  it("produces an exact box volume for a Rectangle -> Rectangle loft (a degenerate box)", () => {
    const geometry = createLoftGeometry({
      width: 20,
      depth: 30,
      height: 10,
      bottomShape: "Rectangle",
      topShape: "Rectangle",
      segments: 4,
      layers: 1,
    });
    const position = geometry.getAttribute("position");

    expect(signedVolume(position)).toBeCloseTo(20 * 30 * 10, 2);
  });

  it.each<[LoftProfileShape, number]>([["Triangle", 120], ["Pentagon", 72], ["Hexagon", 60]])(
    "rotates a regular %s end about its own true center (a %s-degree turn matches its rotational symmetry, so it must reproduce the exact same mesh)",
    (kind, periodDegrees) => {
      // This is the real correctness bar for rotation, not bounding-box symmetry: a regular
      // n-gon's *bounding box* is legitimately off-center from its own circumcenter (a triangle's
      // apex sits farther from center than its base -- same as a real triangle), but rotating by
      // one full symmetry period must land the shape exactly back on itself, unshifted, because
      // the origin is that shape's true rotational center.
      const unrotated = createLoftGeometry({
        width: 30, depth: 30, height: 20, bottomShape: kind, topShape: kind, segments: 48, layers: 4,
      });
      const rotatedByPeriod = createLoftGeometry({
        width: 30, depth: 30, height: 20, bottomShape: kind, topShape: kind,
        bottomRotation: periodDegrees, topRotation: periodDegrees, segments: 48, layers: 4,
      });
      const a = unrotated.getAttribute("position").array;
      const b = rotatedByPeriod.getAttribute("position").array;
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i += 1) {
        expect(b[i]).toBeCloseTo(a[i], 3);
      }
    },
  );

  it("omits the Y scale for polygon ends", () => {
    expect(isPolygonLoftShape("Triangle")).toBe(true);
    expect(isPolygonLoftShape("Pentagon")).toBe(true);
    expect(isPolygonLoftShape("Hexagon")).toBe(true);
    expect(isPolygonLoftShape("Oval")).toBe(false);
    expect(isPolygonLoftShape("Rectangle")).toBe(false);
  });

  it("keeps the top end's own width/depth independent of the bottom (like a cone's top radius)", () => {
    const wideBottomNarrowTop = createLoftGeometry({
      width: 40,
      depth: 40,
      height: 20,
      bottomShape: "Rectangle",
      topShape: "Rectangle",
      topWidth: 10,
      topDepth: 10,
      segments: 4,
      layers: 1,
    });
    const box = wideBottomNarrowTop.boundingBox!;

    // A 40x40 base tapering straight down to a centered 10x10 top -- bounding box still
    // spans the (wider) base, and the shape stays centered since both ends share a center.
    expect(box.max.x - box.min.x).toBeCloseTo(40, 4);
    expect(box.max.z - box.min.z).toBeCloseTo(40, 4);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(20, 5);

    // Omitting topWidth/topDepth falls back to the bottom's own size (a uniform loft).
    expect(normalizeLoftTopSize(undefined, 40)).toBe(40);
    expect(normalizeLoftTopSize(10, 40)).toBe(10);
    expect(normalizeLoftTopSize(-5, 40)).toBe(0.01);
  });

  it("normalizes editable loft settings to supported values", () => {
    expect(normalizeLoftShape("Hexagon")).toBe("Hexagon");
    expect(normalizeLoftShape("nonsense")).toBe("Rectangle");
    expect(normalizeLoftRotation(400)).toBe(40);
    expect(normalizeLoftSegments(4)).toBe(8);
    expect(normalizeLoftSegments(999)).toBe(128);
    expect(normalizeLoftLayers(1)).toBe(2);
    expect(normalizeLoftLayers(999)).toBe(80);

    expect(loftSettings({
      loftBottomShape: "Triangle",
      loftTopShape: "Hexagon",
      loftBottomRotation: 15,
      loftTopRotation: 45,
      loftSegments: 60,
      loftLayers: 30,
    })).toEqual({
      bottomShape: "Triangle",
      topShape: "Hexagon",
      bottomRotation: 15,
      topRotation: 45,
      segments: 60,
      layers: 30,
    });
  });
});
