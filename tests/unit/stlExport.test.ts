import { describe, expect, it } from "vitest";
import { exportMeshesToStl } from "@/lib/stlExport";

function readPoint(view: DataView, offset: number) {
  return [
    view.getFloat32(offset, true),
    view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true),
  ];
}

describe("binary STL export", () => {
  it("uses the fixed binary STL record size and triangle count", () => {
    const stl = exportMeshesToStl([
      {
        vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
        faces: [[0, 1, 2]],
      },
      {
        vertices: [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
        faces: [[0, 1, 2]],
      },
    ]);
    const view = new DataView(stl);

    expect(stl.byteLength).toBe(84 + 2 * 50);
    expect(view.getUint32(80, true)).toBe(2);
  });

  it("writes editor Y-up coordinates as slicer Z-up float32 values", () => {
    const stl = exportMeshesToStl([{
      vertices: [[0, 0, 0], [10, 0, 0], [0, 20, 5]],
      faces: [[0, 1, 2]],
    }]);
    const view = new DataView(stl);

    expect(readPoint(view, 84 + 12 + 2 * 12)).toEqual([0, -5, 20]);
  });

  it("writes a unit facet normal and clears the attribute byte count", () => {
    const stl = exportMeshesToStl([{
      vertices: [[0, 0, 0], [10, 0, 0], [0, 20, 5]],
      faces: [[0, 1, 2]],
    }]);
    const view = new DataView(stl);
    const normal = readPoint(view, 84);

    expect(Math.hypot(...normal)).toBeCloseTo(1);
    expect(normal).toEqual([0, expect.closeTo(-0.9701425), expect.closeTo(-0.2425356)]);
    expect(view.getUint16(84 + 48, true)).toBe(0);
  });
});
