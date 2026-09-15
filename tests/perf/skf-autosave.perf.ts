import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { editorHistoryEntry, type EditorHistoryEntry } from "@/lib/editorHistory";
import { exportSkfProject, importSkfProject, type SkfProjectDocumentV1, type SkfProjectExportInput } from "@/lib/skfProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { CadDisplayEdge, WorkplaneShape } from "@/types/sketchforge";

type Workload = {
  label: string;
  objects: number;
  edgesPerObject: number;
  pointsPerEdge: number;
  states: number;
};

const WORKLOADS: Workload[] = [
  { label: "cad-project", objects: 8, edgesPerObject: 120, pointsPerEdge: 16, states: 30 },
];

if (process.env.SKETCHFORGE_PERF_LARGE === "1") {
  WORKLOADS.push({ label: "cad-project-xl", objects: 24, edgesPerObject: 240, pointsPerEdge: 24, states: 60 });
}

function displayEdges(workload: Workload, seed: number): CadDisplayEdge[] {
  return Array.from({ length: workload.edgesPerObject }, (_unused, edge) => ({
    points: Array.from({ length: workload.pointsPerEdge * 3 }, (_point, index) => Number(((seed + edge * 3 + index) * 0.37).toFixed(4))),
  }));
}

function cadShape(workload: Workload, index: number): WorkplaneShape {
  return {
    id: `object-${index}`,
    name: `Bracket ${index}`,
    kind: "box",
    color: "#12a4cc",
    x: index * 3,
    z: index * 2,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 18,
    height: 16,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    cadDisplayEdges: displayEdges(workload, index * 11),
    cadDisplayEdgesVersion: 2,
  };
}

function movedShape(shape: WorkplaneShape, step: number): WorkplaneShape {
  return { ...shape, x: shape.x + step * 0.5 };
}

// A project whose undo history is a series of simple transforms: every state shares
// the display edges of the objects it did not touch, exactly as the editor does.
function transformedProject(workload: Workload) {
  const history: EditorHistoryEntry[] = [];
  let shapes = Array.from({ length: workload.objects }, (_unused, index) => cadShape(workload, index));
  for (let step = 0; step < workload.states; step += 1) {
    const moved = step % workload.objects;
    shapes = shapes.map((shape, index) => (index === moved ? movedShape(shape, step + 1) : shape));
    history.push(editorHistoryEntry(shapes, [shapes[moved].id]));
  }
  return { shapes, history };
}

function exportInput(project: ReturnType<typeof transformedProject>): SkfProjectExportInput {
  return {
    projectId: "project-perf",
    projectName: "Autosave perf",
    createdAt: 1_700_000_000_000,
    modifiedAt: 1_700_000_100_000,
    shapes: project.shapes,
    history: project.history,
    historyIndex: project.history.length - 1,
    assets: [],
    workspace: DEFAULT_WORKPLANE_WORKSPACE,
    snapGrid: DEFAULT_SNAP_GRID,
    placementElevation: 0,
    // Autosave writes with the fastest compression level.
    compressionLevel: 1,
  };
}

function inlineEdgeBytes(document: SkfProjectDocumentV1) {
  let bytes = 0;
  document.states.forEach((state) => state.nodes.forEach((node) => {
    const edges = node.definition.cadDisplayEdges;
    if (edges) bytes += JSON.stringify(edges).length;
  }));
  return bytes;
}

async function measure<T>(run: () => Promise<T>) {
  const start = performance.now();
  const value = await run();
  return { value, ms: performance.now() - start };
}

describe("autosave of a large CAD project", () => {
  WORKLOADS.forEach((workload) => {
    it(`saves ${workload.label} after a simple transform without rewriting the whole history`, async () => {
      const project = transformedProject(workload);
      const first = await measure(() => exportSkfProject(exportInput(project)));

      const moved = project.shapes.map((shape, index) => (index === 0 ? movedShape(shape, 99) : shape));
      const history = [...project.history, editorHistoryEntry(moved, [moved[0].id])];
      const transformed = { ...exportInput(project), shapes: moved, history, historyIndex: history.length - 1 };
      const second = await measure(() => exportSkfProject(transformed));
      const reopened = await measure(() => importSkfProject(second.value));

      const files = unzipSync(second.value);
      const projectJson = files["project.json"];
      const document = JSON.parse(strFromU8(projectJson)) as SkfProjectDocumentV1;
      const edgeAssets = document.assets.filter((asset) => asset.kind === "display-edges");

      console.table([
        { metric: "first save (ms)", value: Number(first.ms.toFixed(1)) },
        { metric: "save after one transform (ms)", value: Number(second.ms.toFixed(1)) },
        { metric: "reopen (ms)", value: Number(reopened.ms.toFixed(1)) },
        { metric: "archive (MB)", value: Number((second.value.byteLength / 1024 / 1024).toFixed(2)) },
        { metric: "project.json (MB)", value: Number((projectJson.byteLength / 1024 / 1024).toFixed(2)) },
        { metric: "states", value: document.states.length },
        { metric: "display edge assets", value: edgeAssets.length },
      ]);

      // Every state holds the same objects, so their edges are stored once per object
      // and project.json keeps only the node definitions.
      expect(document.states).toHaveLength(workload.states + 1);
      expect(edgeAssets).toHaveLength(workload.objects);
      expect(inlineEdgeBytes(document)).toBe(0);
      expect(projectJson.byteLength).toBeLessThan(document.states.length * workload.objects * 2048);

      const restoredEdges = reopened.value.shapes[0].cadDisplayEdges;
      expect(restoredEdges).toEqual(moved[0].cadDisplayEdges);
      reopened.value.history.forEach((entry) => expect(entry.shapes[0].cadDisplayEdges).toBe(restoredEdges));
    });
  });
});
