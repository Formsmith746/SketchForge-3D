import { describe, expect, it } from "vitest";
import { CAD_TEST_TIMEOUT_MS } from "./support/cadTestTimeout";
import { withCadKernel } from "@constructorfleet/sketchforge-engine/serverCadKernel";
import { importedShapeFromStepOnKernel } from "@constructorfleet/sketchforge-engine/stepImportKernel";
import { explodeStepAssembly } from "@constructorfleet/sketchforge-engine/serverStepExplode";
import { shapeProperties } from "@constructorfleet/sketchforge-engine/serverCadProperties";
import { createEngine, type EngineResult } from "@constructorfleet/sketchforge-engine";
import type { ProjectDocument, ProjectStore } from "@constructorfleet/sketchforge-engine/projectStore";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@constructorfleet/sketchforge-engine/workplaneSettings";
import { horizontalPlacementWorkplane } from "@constructorfleet/sketchforge-engine/placementWorkplane";
import type { ProjectAsset } from "@constructorfleet/sketchforge-engine/domain/sketchforge";

describe("STEP assembly explosion", { timeout: CAD_TEST_TIMEOUT_MS }, () => {
  it("returns separately positioned solids with exact BREP geometry", async () => {
    const step = await withCadKernel((cad) => {
      const first = cad.makeBox(10, 8, 6);
      const second = cad.translate(cad.makeBox(5, 4, 3), 20, 0, 0);
      return cad.exportStep(cad.makeCompound([first, second]));
    });
    const bytes = new TextEncoder().encode(step);
    const source: ProjectAsset = { id: "source", name: "assembly.step", mediaType: "model/step", sourceFormat: "step", bytes, byteLength: bytes.byteLength, sha256: "test" };
    const imported = await importedShapeFromStepOnKernel(source.name, step);
    imported.shape.importedMesh!.assetId = source.id;

    const parts = await explodeStepAssembly(imported.shape, source);

    expect(parts).toHaveLength(2);
    expect(parts.every((part) => part.importedMesh?.brepStep && !part.importedMesh.assetId)).toBe(true);
    const properties = await Promise.all(parts.map(shapeProperties));
    expect(properties.map((entry) => entry.volume).sort((a, b) => a - b)).toEqual([60, 480]);
    expect(properties.map((entry) => entry.centerOfMass.x).sort((a, b) => a - b)).toEqual([-7.5, 10]);
  });

  it("replaces the imported assembly in one project write", async () => {
    const step = await withCadKernel((cad) => cad.exportStep(cad.makeCompound([
      cad.makeBox(10, 8, 6), cad.translate(cad.makeBox(5, 4, 3), 20, 0, 0),
    ])));
    const bytes = new TextEncoder().encode(step);
    const source: ProjectAsset = { id: "asset", name: "case.step", mediaType: "model/step", sourceFormat: "step", bytes, byteLength: bytes.byteLength, sha256: "test" };
    const original = await importedShapeFromStepOnKernel(source.name, step);
    original.shape.importedMesh!.assetId = source.id;
    const document: ProjectDocument = {
      metadata: { revision: 0 }, projectName: "test", createdAt: 0, shapes: [original.shape], history: [], historyIndex: -1,
      assets: [source], workspace: DEFAULT_WORKPLANE_WORKSPACE, snapGrid: DEFAULT_SNAP_GRID, placementElevation: 0,
      placementWorkplane: horizontalPlacementWorkplane(), sketchPlacementWorkplane: horizontalPlacementWorkplane(),
    };
    let writes = 0;
    const store: ProjectStore = {
      read: async () => document,
      write: async (_id, _previous, shapes) => { writes += 1; document.shapes = shapes; return { revision: writes }; },
      withLock: async <T>(_id: string, work: () => Promise<T>) => ({ busy: false as const, result: await work() }),
      list: async () => [],
    };

    const outcome = await createEngine(store).explode("p1", original.shape.id);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.shapes).toHaveLength(2);
    expect(writes).toBe(1);
    expect(document.shapes).toHaveLength(2);
  });
});
