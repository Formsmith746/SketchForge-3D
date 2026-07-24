import { describe, expect, it } from "vitest";
import { createGearGeometry, gearSettings, normalizeGearTeeth, normalizeGearToothSize } from "@/lib/gearGeometry";
import type { GearType } from "@/types/sketchforge";

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

describe("gear geometry", () => {
  it.each<GearType>(["spur", "helical", "bevel"])("creates a closed %s gear with the requested bounds", (gearType) => {
    const geometry = createGearGeometry({
      width: 30,
      depth: 24,
      height: 8,
      teeth: 14,
      toothSize: 2.5,
      gearType,
    });
    const position = geometry.getAttribute("position");

    expect(position.count).toBeGreaterThan(100);
    expect(geometry.getIndex()).toBeNull();
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(8, 5);
    expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeCloseTo(30, 4);
    expect((geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)).toBeCloseTo(24, 4);
  });

  it("creates a closed solid center when the center hole is zero", () => {
    const geometry = createGearGeometry({
      width: 30,
      depth: 30,
      height: 6,
      teeth: 8,
      toothSize: 4,
      centerHoleSize: 0,
      gearType: "spur",
    });
    const position = geometry.getAttribute("position");

    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeCloseTo(30, 4);
    expect((geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)).toBeCloseTo(30, 4);
  });

  it("normalizes editable gear settings to supported values", () => {
    expect(normalizeGearTeeth(2)).toBe(6);
    expect(normalizeGearTeeth(200)).toBe(64);
    expect(normalizeGearToothSize(20, 30, 20)).toBe(4.4);
    expect(gearSettings({ width: 30, depth: 30, teeth: 20, toothSize: 3, toothWidth: 2.4, centerHoleSize: 7, gearType: "bevel", helixAngle: -30, helixQuality: 24 })).toEqual({
      teeth: 20,
      toothSize: 3,
      toothWidth: 2.4,
      centerHoleSize: 7,
      gearType: "bevel",
      helixAngle: -30,
      helixQuality: 24,
    });
  });
});
