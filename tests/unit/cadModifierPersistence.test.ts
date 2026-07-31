import { describe, expect, it } from "vitest";
import { cadDisplayEdgePointsAreUsable, cadNormalsAreUsable } from "@/lib/cadModifierPersistence";

describe("CAD modifier persistence sanitization", () => {
  it("drops a non-finite normal buffer instead of creating an invalid saved shape", () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
    const normals = new Float32Array([0, 0, 1, Number.NaN, 0, 1, 0, 0, 1]);

    expect(cadNormalsAreUsable(positions, normals)).toBe(false);
    expect(cadNormalsAreUsable(positions, new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))).toBe(true);
  });

  it("drops malformed or non-finite CAD display edges", () => {
    expect(cadDisplayEdgePointsAreUsable([0, 0, 0, 1, 1, 1])).toBe(true);
    expect(cadDisplayEdgePointsAreUsable([0, 0, 0, Number.NaN, 1, 1])).toBe(false);
    expect(cadDisplayEdgePointsAreUsable([0, 0, 0, 1])).toBe(false);
  });
});
