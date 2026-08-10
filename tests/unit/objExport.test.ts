import { describe, expect, it } from "vitest";
import { exportMeshesToObj, type ObjExportMesh } from "@/lib/objExport";

function duplicatedTetrahedron(): ObjExportMesh {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [10, 0, 0];
  const c: [number, number, number] = [0, 10, 0];
  const d: [number, number, number] = [0, 0, 10];
  return {
    name: "closed_tetrahedron",
    vertices: [a, c, b, a, b, d, b, c, d, c, a, d],
    faces: [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]],
  };
}

describe("OBJ export", () => {
  it("preserves OBJ's conventional Y-up coordinates", () => {
    const obj = exportMeshesToObj([duplicatedTetrahedron()]);
    const vertices = obj.split("\n").filter((line) => line.startsWith("v "));

    expect(vertices).toContain("v 0 0 10");
    expect(vertices).toContain("v 0 10 0");
  });

  it("welds coincident triangle vertices so a closed mesh has no boundary edges", () => {
    const obj = exportMeshesToObj([duplicatedTetrahedron()]);
    const vertices = obj.split("\n").filter((line) => line.startsWith("v "));
    const faces = obj.split("\n").filter((line) => line.startsWith("f "));
    const edgeUse = new Map<string, number>();

    faces.forEach((line) => {
      const [a, b, c] = line.slice(2).trim().split(/\s+/).map(Number);
      [[a, b], [b, c], [c, a]].forEach(([start, end]) => {
        const key = start < end ? `${start}:${end}` : `${end}:${start}`;
        edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      });
    });

    expect(vertices).toHaveLength(4);
    expect(faces).toHaveLength(4);
    expect([...edgeUse.values()].every((count) => count === 2)).toBe(true);
  });
});
