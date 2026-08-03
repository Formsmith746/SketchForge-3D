import { describe, expect, it } from "vitest";
import { regularPolygonFootprintScale } from "@/lib/regularPolygonFootprint";

function scaledFootprintBounds(width: number, depth: number, sides: number) {
  const count = Math.max(3, Math.round(sides));
  const scale = regularPolygonFootprintScale(width, depth, count);
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: Math.sin(angle) * scale.x + scale.offsetX,
      z: Math.cos(angle) * scale.z + scale.offsetZ,
    };
  });

  const xValues = points.map((point) => point.x);
  const zValues = points.map((point) => point.z);
  return {
    width: Math.max(...xValues) - Math.min(...xValues),
    depth: Math.max(...zValues) - Math.min(...zValues),
    centerX: (Math.max(...xValues) + Math.min(...xValues)) / 2,
    centerZ: (Math.max(...zValues) + Math.min(...zValues)) / 2,
  };
}

describe("regular polygon footprint scaling", () => {
  it.each([3, 5, 6, 7, 12])(
    "fits a %i-sided pyramid base to the requested dimensions",
    (sides) => {
      const bounds = scaledFootprintBounds(20, 30, sides);
      expect(bounds.width).toBeCloseTo(20, 8);
      expect(bounds.depth).toBeCloseTo(30, 8);
      expect(bounds.centerX).toBeCloseTo(0, 8);
      expect(bounds.centerZ).toBeCloseTo(0, 8);
    },
  );

  it("supports fractional inputs by using the same rounded side count as the geometry", () => {
    const bounds = scaledFootprintBounds(18, 24, 4.6);
    expect(bounds.width).toBeCloseTo(18, 8);
    expect(bounds.depth).toBeCloseTo(24, 8);
    expect(bounds.centerX).toBeCloseTo(0, 8);
    expect(bounds.centerZ).toBeCloseTo(0, 8);
  });
});
