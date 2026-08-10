import { describe, expect, it } from "vitest";
import { importedShapeFromStl } from "@/lib/stlImport";

function boxStl(width: number, ySize: number, zSize: number, name = "box") {
  const vertices = [
    [0, 0, 0], [width, 0, 0], [width, ySize, 0], [0, ySize, 0],
    [0, 0, zSize], [width, 0, zSize], [width, ySize, zSize], [0, ySize, zSize],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  const facets = faces.map(([a, b, c]) => `facet normal 0 0 0
  outer loop
    vertex ${vertices[a].join(" ")}
    vertex ${vertices[b].join(" ")}
    vertex ${vertices[c].join(" ")}
  endloop
endfacet`).join("\n");
  const source = `solid ${name}\n${facets}\nendsolid ${name}`;
  return new TextEncoder().encode(source).buffer;
}

describe("STL import orientation", () => {
  it("maps a clearly Z-up slicer model to SketchForge Y-up", () => {
    const shape = importedShapeFromStl("z-up-box.stl", boxStl(80, 60, 20));

    expect(shape.importedMesh?.baseWidth).toBeCloseTo(80);
    expect(shape.importedMesh?.baseHeight).toBeCloseTo(20);
    expect(shape.importedMesh?.baseDepth).toBeCloseTo(60);
  });

  it("preserves an unmistakably flat Y-up legacy model", () => {
    const shape = importedShapeFromStl("raspberry-pi-like.stl", boxStl(89, 20, 58));

    expect(shape.importedMesh?.baseWidth).toBeCloseTo(89);
    expect(shape.importedMesh?.baseHeight).toBeCloseTo(20);
    expect(shape.importedMesh?.baseDepth).toBeCloseTo(58);
  });

  it("preserves previous SketchForge STL exports regardless of proportions", () => {
    const shape = importedShapeFromStl("legacy-sketchforge.stl", boxStl(20, 80, 10, "sketchforge_design"));

    expect(shape.importedMesh?.baseHeight).toBeCloseTo(80);
    expect(shape.importedMesh?.baseDepth).toBeCloseTo(10);
  });
});
