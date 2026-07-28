import { describe, expect, it } from "vitest";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { compactProjectShapeState, hydrateProjectShapeState } from "@/lib/projectShapePersistence";
import type { WorkplaneShape } from "@/types/sketchforge";

function importedShape(): WorkplaneShape {
  return {
    id: "mesh-1",
    name: "Imported mesh",
    kind: "mesh",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 10,
    width: 10,
    depth: 10,
    height: 10,
    rotation: 0,
    importedMesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat: "stl",
    },
  };
}

describe("project shape persistence resources", () => {
  it("stores one immutable mesh resource across current shapes and history", () => {
    const mesh = importedShape();
    const group: WorkplaneShape = {
      ...mesh,
      id: "group-1",
      name: "Group",
      importedMesh: undefined,
      groupedShapes: [mesh],
      groupedBaseWidth: 10,
      groupedBaseDepth: 10,
      groupedBaseHeight: 10,
      groupOperation: "group",
    };
    const history = [
      editorHistoryEntry([{ ...group, x: 0 }], []),
      editorHistoryEntry([{ ...group, x: 5 }], [group.id]),
    ];

    const compact = compactProjectShapeState([{ ...group, x: 5 }], history);
    const currentStub = compact.shapes[0].groupedShapes?.[0].importedMesh;
    const historyStub = compact.history[0].shapes[0].groupedShapes?.[0].importedMesh;

    expect(compact.resources.size).toBe(1);
    expect(currentStub?.positions).toEqual([]);
    expect(currentStub?.normals).toBeUndefined();
    expect(currentStub?.storageResourceId).toBeTruthy();
    expect(historyStub?.storageResourceId).toBe(currentStub?.storageResourceId);

    const hydrated = hydrateProjectShapeState(compact.shapes, compact.history, compact.resources);
    const currentMesh = hydrated.shapes[0].groupedShapes?.[0].importedMesh;
    const historyMesh = hydrated.history?.[0].shapes[0].groupedShapes?.[0].importedMesh;

    expect(currentMesh?.positions).toEqual(mesh.importedMesh?.positions);
    expect(currentMesh?.normals).toEqual(mesh.importedMesh?.normals);
    expect(currentMesh?.storageResourceId).toBeUndefined();
    expect(historyMesh).toBe(currentMesh);
  });
});
