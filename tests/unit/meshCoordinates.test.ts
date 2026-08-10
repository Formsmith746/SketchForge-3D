import { describe, expect, it } from "vitest";
import { sketchForgeToZUp, zUpToSketchForge } from "@/lib/meshCoordinates";

describe("mesh coordinate conventions", () => {
  it("maps slicer Z-up coordinates to SketchForge Y-up and back", () => {
    const slicerPoint: [number, number, number] = [12, 34, 56];
    const sketchForgePoint = zUpToSketchForge(slicerPoint);

    expect(sketchForgePoint).toEqual([12, 56, -34]);
    expect(sketchForgeToZUp(sketchForgePoint)).toEqual(slicerPoint);
  });
});
