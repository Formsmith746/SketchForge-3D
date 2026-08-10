import { describe, expect, it } from "vitest";
import { exportMeshesToStl } from "@/lib/stlExport";

describe("STL export orientation", () => {
  it("writes editor Y-up coordinates as slicer Z-up coordinates", () => {
    const stl = exportMeshesToStl([{
      vertices: [[0, 0, 0], [10, 0, 0], [0, 20, 5]],
      faces: [[0, 1, 2]],
    }]);

    expect(stl).toContain("vertex 0 -5 20");
  });
});
