import { expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { exportSkfProject, importSkfProject, type SkfProjectDocumentV1, type SkfProjectExportInput } from "@/lib/skfProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/sketchforge";

it("benchmarks autosave after loading a large project with duplicated V1 edges", async () => {
  const points = Array.from({ length: 30_006 }, (_, index) => Math.sin(index) * 20);
  const shape: WorkplaneShape = {
    id: "large-mesh", name: "Large mesh", kind: "mesh", color: "#123456",
    x: 0, z: 0, size: 40, width: 40, depth: 40, height: 40, rotation: 0,
    cadDisplayEdges: [{ points }], cadDisplayEdgesVersion: 2,
    cadBrep: "Synthetic exact CAD payload\n".repeat(20_000),
    importedMesh: { positions: points, baseWidth: 40, baseDepth: 40, baseHeight: 40, triangleCount: points.length / 9, sourceFormat: "json" },
  };
  const history = Array.from({ length: 80 }, (_, x) => editorHistoryEntry([{ ...shape, x }], [shape.id]));
  const input: SkfProjectExportInput = {
    projectName: "Large history benchmark", createdAt: 1_700_000_000_000, modifiedAt: 1_700_000_100_000,
    shapes: history[79].shapes, history, historyIndex: 79, assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE, snapGrid: DEFAULT_SNAP_GRID, placementElevation: 0, compressionLevel: 1,
  };
  const files = unzipSync(await exportSkfProject(input));
  const document = JSON.parse(strFromU8(files["project.json"])) as SkfProjectDocumentV1;
  document.formatVersion = 1;
  document.minimumReaderVersion = 1;
  document.assets = document.assets.filter((asset) => asset.kind !== "display-edges");
  for (const state of document.states) for (const node of state.nodes) {
    node.cadDisplayEdgesAssetId = undefined;
    node.definition.cadDisplayEdges = shape.cadDisplayEdges;
  }
  files["project.json"] = strToU8(JSON.stringify(document));
  const legacyJsonBytes = files["project.json"].length;
  const legacy = zipSync(files, { level: 1 });
  const rows: Array<Record<string, string | number>> = [];
  async function measure<T>(step: string, work: () => Promise<T>) {
    const start = performance.now();
    let lastTick = start;
    let maxTaskGapMs = 0;
    const tick = () => {
      const now = performance.now();
      maxTaskGapMs = Math.max(maxTaskGapMs, now - lastTick);
      lastTick = now;
    };
    const timer = setInterval(tick, 1);
    try {
      const result = await work();
      tick();
      rows.push({ step, elapsedMs: Math.round(performance.now() - start), maxTaskGapMs: Math.round(maxTaskGapMs) });
      return result;
    } finally {
      clearInterval(timer);
    }
  }
  const loaded = await measure("Import legacy V1", () => importSkfProject(legacy));
  const saveInput = { ...input, shapes: loaded.shapes, history: loaded.history };
  const saved = await measure("Autosave after import", () => exportSkfProject(saveInput));
  await measure("Repeated autosave", () => exportSkfProject(saveInput));
  await measure("Reopen compact V2", () => importSkfProject(saved));
  const savedFiles = unzipSync(saved);
  rows.push({ step: "V1 sizes", jsonBytes: legacyJsonBytes, archiveBytes: legacy.length });
  rows.push({ step: "V2 sizes", jsonBytes: savedFiles["project.json"].length, archiveBytes: saved.length });
  console.table(rows);
  expect(savedFiles["project.json"].length).toBeLessThan(legacyJsonBytes / 100);
  expect(loaded.history).toHaveLength(80);
});
