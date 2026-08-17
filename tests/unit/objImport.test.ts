import { describe, expect, it } from "vitest";
import { importedShapeFromObj } from "@/lib/objImport";

describe("importedShapeFromObj", () => {
  it("imports triangulated OBJ geometry as a SketchForge mesh", () => {
    const shape = importedShapeFromObj("panel.obj", [
      "v 0 0 0",
      "v 2 0 0",
      "v 2 3 0",
      "v 0 3 0",
      "f 1 2 3 4",
    ].join("\n"));

    expect(shape.name).toBe("panel");
    expect(shape.kind).toBe("mesh");
    expect(shape.width).toBe(2);
    expect(shape.height).toBe(3);
    expect(shape.depth).toBe(1);
    expect(shape.importedMesh?.sourceFormat).toBe("obj");
    expect(shape.importedMesh?.triangleCount).toBe(2);
    expect(shape.importedMesh?.positions).toHaveLength(18);
  });

  it("triangulates concave OBJ polygons without filling their cutout", () => {
    const shape = importedShapeFromObj("concave.obj", [
      "v 0 0 0",
      "v 3 0 0",
      "v 3 3 0",
      "v 2 3 0",
      "v 2 1 0",
      "v 1 1 0",
      "v 1 3 0",
      "v 0 3 0",
      "f 1 2 3 4 5 6 7 8",
    ].join("\n"));

    const positions = shape.importedMesh?.positions ?? [];
    let triangleArea = 0;
    for (let index = 0; index < positions.length; index += 9) {
      const ax = positions[index];
      const ay = positions[index + 1];
      const bx = positions[index + 3];
      const by = positions[index + 4];
      const cx = positions[index + 6];
      const cy = positions[index + 7];
      triangleArea += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
    }

    expect(shape.importedMesh?.triangleCount).toBe(6);
    expect(triangleArea).toBeCloseTo(7, 6);
  });

  it("re-imports SketchForge Z-up OBJ exports into the editor's Y-up coordinates", () => {
    const shape = importedShapeFromObj("roundtrip.obj", [
      "# SketchForge OBJ export",
      "# Z-up triangle soup, matching SketchForge STL export",
      "v 0 0 0",
      "v 2 0 0",
      "v 0 0 3",
      "vn 0 1 0",
      "f 1//1 2//1 3//1",
    ].join("\n"));

    expect(shape.width).toBe(2);
    expect(shape.height).toBe(3);
    expect(shape.depth).toBe(1);
    expect(shape.importedMesh?.positions).toEqual([
      -1, 0, 0,
      -1, 3, 0,
      1, 0, 0,
    ]);
  });
  it("uses OBJ normals to correct reversed triangle winding", () => {
    const shape = importedShapeFromObj("reversed.obj", [
      "v 0 0 0",
      "v 2 0 0",
      "v 0 2 0",
      "vt 0 0",
      "vt 1 0",
      "vt 0 1",
      "vn 0 0 -1",
      "f 1/1/1 2/2/1 3/3/1",
    ].join("\n"));

    const positions = shape.importedMesh?.positions ?? [];
    const normals = shape.importedMesh?.normals ?? [];
    const ab = [
      positions[3] - positions[0],
      positions[4] - positions[1],
      positions[5] - positions[2],
    ];
    const ac = [
      positions[6] - positions[0],
      positions[7] - positions[1],
      positions[8] - positions[2],
    ];
    const geometricNormal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const dot = geometricNormal[0] * normals[0] + geometricNormal[1] * normals[1] + geometricNormal[2] * normals[2];

    expect(dot).toBeGreaterThan(0);
    expect(shape.importedMesh?.triangleCount).toBe(1);
  });
  it("rejects OBJ files without mesh faces", () => {
    expect(() => importedShapeFromObj("points.obj", "v 0 0 0\nv 1 1 1")).toThrow("OBJ has no readable mesh geometry");
  });
});
