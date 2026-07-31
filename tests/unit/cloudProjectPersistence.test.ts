import { describe, expect, it } from "vitest";
import {
  compactProjectGeometry,
  SAVED_GEOMETRY_REFERENCE_KEY,
} from "@/lib/cloudProjectPersistence";
import type { WorkplaneShape } from "@/types/sketchforge";

function importedShape(id = "mesh-1"): WorkplaneShape {
  return {
    id,
    name: "Imported STL",
    kind: "mesh",
    color: "#009fe3",
    x: 0,
    z: 0,
    size: 10,
    width: 10,
    depth: 10,
    height: 10,
    rotation: 0,
    importedMesh: {
      positions: Array.from({ length: 900 }, (_, index) => index / 10),
      baseWidth: 10,
      baseDepth: 10,
      baseHeight: 10,
      triangleCount: 100,
      sourceFormat: "stl",
    },
  };
}

function project(shapes: WorkplaneShape[]) {
  return { formatVersion: 1 as const, shapes, workspace: null, snap: null };
}

describe("cloud project geometry compaction", () => {
  it("omits unchanged imported geometry after a transform-only edit", () => {
    const original = importedShape();
    const baseline = project([original]);
    const moved = project([{ ...original, x: 25, rotation: 45 }]);

    const compacted = compactProjectGeometry(moved, baseline);

    expect(compacted.reusedMeshCount).toBe(1);
    expect(compacted.document.shapes[0].importedMesh).toEqual({
      [SAVED_GEOMETRY_REFERENCE_KEY]: true,
      sourceGeometryPath: "shapes/0",
    });
    expect(JSON.stringify(compacted.document).length).toBeLessThan(JSON.stringify(moved).length / 4);
  });

  it("sends a changed mesh in full", () => {
    const original = importedShape();
    const baseline = project([original]);
    const changedMesh = { ...original.importedMesh!, positions: [...original.importedMesh!.positions, 0, 0, 0, 1, 0, 0, 0, 1, 0] };
    const changed = project([{ ...original, importedMesh: changedMesh }]);

    const compacted = compactProjectGeometry(changed, baseline);

    expect(compacted.reusedMeshCount).toBe(0);
    expect(compacted.document.shapes[0].importedMesh).toBe(changedMesh);
  });

  it("reuses unchanged meshes even when shapes are reordered", () => {
    const first = importedShape("first");
    const second = importedShape("second");
    const group = { ...importedShape("group"), importedMesh: undefined, groupedShapes: [first, second] };
    const baseline = project([group]);
    const movedGroup = project([{ ...group, x: 5, groupedShapes: [{ ...first, z: 9 }, second] }]);
    const reordered = project([{ ...group, groupedShapes: [second, first] }]);

    expect(compactProjectGeometry(movedGroup, baseline).reusedMeshCount).toBe(2);
    expect(compactProjectGeometry(reordered, baseline).reusedMeshCount).toBe(2);
  });

  it("uploads a new boolean result but not a second copy of its original STL operand", () => {
    const original = importedShape("original-stl");
    const hole: WorkplaneShape = {
      ...importedShape("hole"),
      kind: "box",
      importedMesh: undefined,
      hole: true,
      x: 4,
    };
    const baseline = project([original, hole]);
    const booleanResult = importedShape("boolean-result");
    booleanResult.importedMesh = {
      ...booleanResult.importedMesh!,
      positions: booleanResult.importedMesh!.positions.map((value) => value + 0.25),
      sourceFormat: "json",
    };
    booleanResult.groupedShapes = [
      { ...original, id: "original-stl-group-child", x: -3 },
      { ...hole, id: "hole-group-child", x: 1 },
    ];

    const compacted = compactProjectGeometry(project([booleanResult]), baseline);
    const compactedResult = compacted.document.shapes[0];
    const children = compactedResult.groupedShapes as Array<Record<string, unknown>>;

    expect(compacted.reusedMeshCount).toBe(1);
    expect(compactedResult.importedMesh).toBe(booleanResult.importedMesh);
    expect(children[0].importedMesh).toEqual({
      [SAVED_GEOMETRY_REFERENCE_KEY]: true,
      sourceGeometryPath: "shapes/0",
    });
  });

  it("compacts persistent undo snapshots against their saved geometry paths", () => {
    const original = importedShape("mesh");
    const moved = { ...original, x: 8 };
    const baseline = { ...project([moved]), history: [[original], [moved]], historyIndex: 1 };
    const rotated = { ...moved, rotation: 45 };
    const document = { ...project([rotated]), history: [[original], [moved], [rotated]], historyIndex: 2 };

    const compacted = compactProjectGeometry(document, baseline);

    expect(compacted.reusedMeshCount).toBe(4);
    expect(compacted.document.shapes[0].importedMesh).toEqual({
      [SAVED_GEOMETRY_REFERENCE_KEY]: true,
      sourceGeometryPath: "shapes/0",
    });
    expect(compacted.document.history?.[0][0].importedMesh).toEqual({
      [SAVED_GEOMETRY_REFERENCE_KEY]: true,
      sourceGeometryPath: "shapes/0",
    });
  });
});
