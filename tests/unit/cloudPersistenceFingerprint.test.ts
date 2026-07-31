import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { serializeShapesForSync } from "../../apps/web/src/lib/workplaneShapes";
import type { WorkplaneShape } from "../../apps/web/src/types/sketchforge";

function box(id: string): WorkplaneShape {
  return {
    id,
    name: id,
    kind: "box",
    color: "#ff0000",
    x: 1,
    z: 2,
    elevation: 0,
    size: 10,
    width: 10,
    depth: 10,
    height: 10,
    rotation: 0,
  };
}

function persistedShape(): WorkplaneShape {
  return {
    ...box("mesh-parent"),
    kind: "mesh",
    importedMesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      baseWidth: 1,
      baseDepth: 1,
      baseHeight: 1,
      triangleCount: 1,
      sourceFormat: "step",
      brepStep: "STEP-A",
    },
    cadBrep: "BREP-A",
    cadDisplayEdges: [{ points: [0, 0, 0, 1, 1, 1] }],
    groupedShapes: [{ ...box("child"), x: 4 }],
    imagePlate: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png", pixelWidth: 1, pixelHeight: 1 },
    sketchProfile: {
      points: [{ id: "point", x: 0, z: 0 }],
      segments: [],
      images: [{
        id: "image",
        name: "reference",
        dataUrl: "data:image/png;base64,BBBB",
        mimeType: "image/png",
        pixelWidth: 1,
        pixelHeight: 1,
        x: 0,
        z: 0,
        width: 1,
        depth: 1,
      }],
    },
  };
}

describe("cloud persistence fingerprint", () => {
  const projectShapesFingerprint = serializeShapesForSync;

  it("uses the exact persisted serializer in the editor sync gate", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../apps/web/src/components/SketchForgeEditor.tsx"), "utf8");
    expect(source).toMatch(/function projectShapesFingerprint\(shapes: WorkplaneShape\[\]\)[\s\S]*?return serializeShapesForSync\(shapes\);/);
    expect(source).toContain("onProjectDirty?.({ projectId })");
    expect(source).toContain("onProjectSnapshotFlushReady(flushProjectShapes)");
  });

  it("flushes pending shapes before save and binds thumbnails to the saved version", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../apps/web/src/components/cloud/CloudEditorShell.tsx"), "utf8");
    expect(source).toMatch(/projectSnapshotFlushRef\.current\?\.\(\);\s*const project = projectRef\.current;/);
    expect(source).toContain("expectedVersion: savedVersion");
    expect(source).toMatch(/dirtyRef\.current \|\| changeRevisionRef\.current !== savedRevision/);
  });

  it("detects exact mesh, B-Rep, nested, image, and sub-grid changes", () => {
    const original = persistedShape();
    const originalFingerprint = projectShapesFingerprint([original]);
    const changes: Array<(shape: WorkplaneShape) => void> = [
      (shape) => { shape.x += 0.001; },
      (shape) => { shape.importedMesh!.positions[0] = 9; },
      (shape) => { shape.importedMesh!.normals![0] = 9; },
      (shape) => { shape.importedMesh!.brepStep = "STEP-B"; },
      (shape) => { shape.cadBrep = "BREP-B"; },
      (shape) => { shape.cadDisplayEdges![0].points[0] = 9; },
      (shape) => { shape.groupedShapes![0].x = 5; },
      (shape) => { shape.imagePlate!.dataUrl = "data:image/png;base64,CCCC"; },
      (shape) => { shape.sketchProfile!.images![0].dataUrl = "data:image/png;base64,DDDD"; },
    ];

    for (const change of changes) {
      const changed = structuredClone(original);
      change(changed);
      expect(projectShapesFingerprint([changed])).not.toBe(originalFingerprint);
    }
  });

  it("is stable for the same persisted document", () => {
    const shape = persistedShape();
    expect(projectShapesFingerprint([structuredClone(shape)])).toBe(projectShapesFingerprint([shape]));
  });
});
