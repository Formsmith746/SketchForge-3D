import { describe, expect, it } from "vitest";
import { modelSplitPlane, splitPlaneIntersectsPoints, splitShapeFromWorldPositions } from "@/lib/modelSplit";
import type { WorkplaneShape } from "@/types/sketchforge";

const source: WorkplaneShape = {
  id: "source",
  name: "Source",
  kind: "box",
  color: "#d41721",
  x: 0,
  z: 0,
  elevation: 0,
  size: 10,
  width: 10,
  depth: 10,
  height: 10,
  rotation: 0,
};

describe("model split helpers", () => {
  it("centers and reorients the preview plane within model bounds", () => {
    const points: Array<[number, number, number]> = [[-4, 2, -6], [8, 12, 10]];
    expect(modelSplitPlane(points, "y")).toEqual({
      axis: "y",
      rotation: 0,
      normal: [0, 1, 0],
      origin: [2, 7, 2],
      position: 7,
      min: 2,
      max: 12,
      size: Math.sqrt(500) * 1.1,
    });
    expect(modelSplitPlane(points, "x", 6)?.origin).toEqual([6, 7, 2]);
  });

  it("rotates the plane normal and projection range for angled cuts", () => {
    const points: Array<[number, number, number]> = [[-4, 2, -6], [8, 12, 10]];
    const plane = modelSplitPlane(points, "y", undefined, 45);
    expect(plane?.rotation).toBe(45);
    expect(plane?.normal[0]).toBe(0);
    expect(plane?.normal[1]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(plane?.normal[2]).toBeCloseTo(Math.SQRT1_2, 8);
    expect(plane?.origin).toEqual([2, 7, 2]);
    expect(plane?.min).toBeCloseTo(-2 * Math.SQRT2, 8);
    expect(plane?.max).toBeCloseTo(11 * Math.SQRT2, 8);
  });

  it("only reports a cut when vertices exist on both sides", () => {
    const points: Array<[number, number, number]> = [[-5, 0, 0], [5, 0, 0]];
    expect(splitPlaneIntersectsPoints(points, [1, 0, 0], 0)).toBe(true);
    expect(splitPlaneIntersectsPoints(points, [1, 0, 0], -5)).toBe(false);
    expect(splitPlaneIntersectsPoints(points, [1, 0, 0], 8)).toBe(false);
  });

  it("normalizes world-space split triangles into an editable mesh shape", () => {
    const part = splitShapeFromWorldPositions(source, [
      4, 3, -2,
      8, 3, -2,
      4, 9, 6,
    ], "part-a", "Source A");
    expect(part).toMatchObject({
      id: "part-a",
      name: "Source A",
      kind: "mesh",
      x: 6,
      z: 2,
      elevation: 3,
      width: 4,
      depth: 8,
      height: 6,
    });
    expect(part?.importedMesh?.positions).toEqual([-2, 0, -4, 2, 0, -4, -2, 6, 4]);
  });
});
