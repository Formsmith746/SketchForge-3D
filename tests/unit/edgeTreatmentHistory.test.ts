import { describe, expect, it } from "vitest";
import { compactEdgeTreatmentHistory, edgeTreatmentAppliedFrame, restoreShapeBeforeEdgeTreatment } from "@/lib/edgeTreatmentHistory";
import type { EdgeTreatmentHistoryEntry, WorkplaneShape } from "@/types/sketchforge";

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function historyEntry(before: WorkplaneShape): EdgeTreatmentHistoryEntry {
  return {
    id: "history-1",
    createdAt: 1,
    feature: { kind: "chamfer", amount: 1, edgeCount: 1 },
    before,
  };
}

describe("edge treatment history restoration", () => {
  it("restores a grouped snapshot instead of retaining the treated mesh bounding box", () => {
    const before = box({
      id: "group-before",
      name: "Group",
      kind: "mesh",
      x: 8,
      width: 56,
      depth: 24,
      height: 60,
      size: 56,
      groupedBaseWidth: 56,
      groupedBaseDepth: 24,
      groupedBaseHeight: 60,
      groupedShapes: [
        box({ id: "normal-child", x: -18 }),
        box({ id: "tall-child", x: 14, width: 8, depth: 10, height: 60, size: 10 }),
      ],
    });
    const treated = box({
      id: "group-current",
      name: "Renamed group",
      kind: "mesh",
      color: "#12abef",
      x: 0,
      width: 80,
      depth: 40,
      height: 60,
      size: 80,
      importedMesh: {
        positions: [-40, 0, -20, 40, 0, -20, 40, 60, 20],
        baseWidth: 80,
        baseDepth: 40,
        baseHeight: 60,
        triangleCount: 1,
        sourceFormat: "json",
      },
      edgeTreatments: [{ kind: "chamfer", amount: 1, edgeCount: 1 }],
    });

    const restored = restoreShapeBeforeEdgeTreatment(treated, historyEntry(before));

    expect(restored).toMatchObject({
      id: "group-current",
      name: "Renamed group",
      color: "#12abef",
      kind: "mesh",
      x: 8,
      width: 56,
      depth: 24,
      height: 60,
    });
    expect(restored.importedMesh).toBeUndefined();
    expect(restored.edgeTreatments).toBeUndefined();
    expect(restored.groupedShapes?.map((child) => [child.width, child.depth, child.height])).toEqual([
      [20, 20, 20],
      [8, 10, 60],
    ]);
  });

  it("does not resize a restored child primitive to a combined component's bounds", () => {
    const before = box({ id: "thin-before", x: 18, width: 8, depth: 6, height: 50, size: 8 });
    const combinedComponent = box({
      id: "thin-current",
      kind: "mesh",
      x: 0,
      width: 54,
      depth: 30,
      height: 50,
      size: 54,
      importedMesh: {
        positions: [-27, 0, -15, 27, 0, -15, 27, 50, 15],
        baseWidth: 54,
        baseDepth: 30,
        baseHeight: 50,
        triangleCount: 1,
        sourceFormat: "json",
      },
    });

    const restored = restoreShapeBeforeEdgeTreatment(combinedComponent, historyEntry(before));

    expect(restored).toMatchObject({ kind: "box", x: 18, width: 8, depth: 6, height: 50, size: 8 });
    expect(restored.importedMesh).toBeUndefined();
  });

  it("keeps history snapshots flat instead of recursively nesting older history", () => {
    const first = historyEntry(box({ id: "before-first" }));
    const second = {
      ...historyEntry(box({ id: "before-second", edgeTreatmentHistory: [first] })),
      id: "history-2",
    };

    const compacted = compactEdgeTreatmentHistory([first, second]);

    expect(compacted).toHaveLength(2);
    expect(compacted[0].before.edgeTreatmentHistory).toBeUndefined();
    expect(compacted[1].before.edgeTreatmentHistory).toBeUndefined();
  });

  it("preserves edits made after applying a feature while restoring the pre-feature geometry", () => {
    const before = box({ x: 8, z: 3, width: 40, depth: 20, height: 30, rotation: 15 });
    const applied = box({ kind: "mesh", x: 7.5, z: 3, width: 39, depth: 20, height: 30, rotation: 0 });
    const entry: EdgeTreatmentHistoryEntry = {
      ...historyEntry(before),
      appliedFrame: edgeTreatmentAppliedFrame(applied),
    };
    const current = box({
      ...applied,
      x: 17.5,
      z: -2,
      width: 78,
      depth: 30,
      height: 45,
      rotation: 20,
      edgeTreatmentHistory: [entry],
    });

    const restored = restoreShapeBeforeEdgeTreatment(current, entry);

    expect(restored).toMatchObject({
      kind: "box",
      x: 18,
      z: -2,
      width: 80,
      depth: 30,
      height: 45,
      rotation: 35,
    });
  });
});
