import { describe, expect, it } from "vitest";
import { appendEditorHistorySnapshot, boundedEditorHistory, editorHistoryEntry, editorHistoryForExport, hydrateEditorHistoryState, projectShapesFingerprint } from "@/lib/editorHistory";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
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

describe("editor history snapshots", () => {
  it("seeds history with the real loaded scene and valid selection", () => {
    const shape = box();
    const entry = editorHistoryEntry([shape], [shape.id, "missing", shape.id]);

    expect(entry.shapes).toHaveLength(1);
    expect(entry.shapes[0].id).toBe(shape.id);
    expect(entry.selectedIds).toEqual([shape.id]);
  });

  it("detects persistence-relevant fields that the old fingerprint omitted", () => {
    const shape = box({ kind: "cylinder", sides: 32 });
    const baseline = projectShapesFingerprint([shape]);

    expect(projectShapesFingerprint([{ ...shape, locked: true }])).not.toBe(baseline);
    expect(projectShapesFingerprint([{ ...shape, hidden: true }])).not.toBe(baseline);
    expect(projectShapesFingerprint([{ ...shape, sides: 64 }])).not.toBe(baseline);
  });

  it("detects mesh coordinate changes even when array lengths are unchanged", () => {
    const shape = box({
      kind: "mesh",
      importedMesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        baseWidth: 1,
        baseDepth: 1,
        baseHeight: 1,
        triangleCount: 1,
        sourceFormat: "json",
      },
    });
    const changed = {
      ...shape,
      importedMesh: { ...shape.importedMesh!, positions: [0, 0, 0, 2, 0, 0, 0, 1, 0] },
    };

    expect(projectShapesFingerprint([changed])).not.toBe(projectShapesFingerprint([shape]));
  });

  it("reuses an immutable mesh signature for transform-only history snapshots", () => {
    let coordinateReads = 0;
    const positions = new Proxy([0, 0, 0, 1, 0, 0, 0, 1, 0], {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) coordinateReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    const shape = box({
      kind: "mesh",
      importedMesh: {
        positions,
        baseWidth: 1,
        baseDepth: 1,
        baseHeight: 1,
        triangleCount: 1,
        sourceFormat: "stl",
      },
    });

    const baseline = projectShapesFingerprint([shape]);
    expect(coordinateReads).toBeGreaterThan(0);
    coordinateReads = 0;

    expect(projectShapesFingerprint([{ ...shape, x: 25 }])).not.toBe(baseline);
    expect(coordinateReads).toBe(0);
    expect(projectShapesFingerprint([{
      ...shape,
      importedMesh: { ...shape.importedMesh!, positions: [...positions] },
    }])).toBe(baseline);
  });

  it("keeps unlimited history and applies preset or custom action limits", () => {
    const entries = Array.from({ length: 140 }, (_, index) => ({
      ...editorHistoryEntry([box({ id: `box-${index}`, x: index })], []),
      estimatedBytes: 2 * 1024 * 1024,
    }));
    const unlimited = boundedEditorHistory(entries);
    const lastThirty = boundedEditorHistory(entries, 30);
    const custom = boundedEditorHistory(entries, 7);

    expect(unlimited).toHaveLength(140);
    expect(lastThirty).toHaveLength(31);
    expect(lastThirty[0].shapes[0].id).toBe("box-109");
    expect(custom).toHaveLength(8);
    expect(custom.at(-1)?.shapes[0].id).toBe("box-139");
  });

  it("trims redo only for a real new edit and preserves it for a no-op", () => {
    const entries = [0, 1, 2].map((x) => editorHistoryEntry([box({ x })], []));
    const noOp = appendEditorHistorySnapshot(entries, 1, editorHistoryEntry([box({ x: 1 })], ["box-1"]));

    expect(noOp.changed).toBe(false);
    expect(noOp.entries).toHaveLength(3);
    expect(noOp.entries[1].selectedIds).toEqual(["box-1"]);

    const branch = appendEditorHistorySnapshot(noOp.entries, 1, editorHistoryEntry([box({ x: 5 })], []));
    expect(branch.changed).toBe(true);
    expect(branch.entries).toHaveLength(3);
    expect(branch.entries.at(-1)?.shapes[0].x).toBe(5);
  });

  it("restores a persisted undo and redo stack at its saved index", () => {
    const entries = [0, 5, 10].map((x) => editorHistoryEntry([box({ x })], []));
    const restored = hydrateEditorHistoryState([box({ x: 5 })], entries, 1);

    expect(restored.index).toBe(1);
    expect(restored.entries).toHaveLength(3);
    expect(restored.entries[restored.index].shapes[0].x).toBe(5);
    expect(restored.entries[0].shapes[0].x).toBe(0);
    expect(restored.entries[2].shapes[0].x).toBe(10);
  });

  it("restores only the configured number of saved actions without losing the active state", () => {
    const entries = Array.from({ length: 80 }, (_, x) => editorHistoryEntry([box({ x })], []));
    const restored = hydrateEditorHistoryState([box({ x: 60 })], entries, 60, 30);

    expect(restored.entries).toHaveLength(31);
    expect(restored.index).toBe(30);
    expect(restored.entries[0].shapes[0].x).toBe(30);
    expect(restored.entries[restored.index].shapes[0].x).toBe(60);
  });

  it("falls back to the loaded scene when persisted history is stale", () => {
    const stale = [editorHistoryEntry([box({ x: 1 })], [])];
    const restored = hydrateEditorHistoryState([box({ x: 9 })], stale, 0);

    expect(restored.index).toBe(0);
    expect(restored.entries).toHaveLength(1);
    expect(restored.entries[0].shapes[0].x).toBe(9);
  });

  it("selects all history or the requested number of recent undo actions for project export", () => {
    const entries = Array.from({ length: 140 }, (_, x) => editorHistoryEntry([box({ x })], []));

    const unlimited = editorHistoryForExport(entries, 120, "unlimited");
    expect(unlimited.entries).toBe(entries);
    expect(unlimited.index).toBe(120);

    const lastThirty = editorHistoryForExport(entries, 120, 30);
    expect(lastThirty.entries).toHaveLength(31);
    expect(lastThirty.index).toBe(30);
    expect(lastThirty.entries[0].shapes[0].x).toBe(90);
    expect(lastThirty.entries[30].shapes[0].x).toBe(120);
  });
});
