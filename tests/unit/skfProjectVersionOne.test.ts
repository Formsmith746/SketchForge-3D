import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importSkfProject } from "@/lib/skfProject";

// Written by the 1.0.9 exporter, which still stored display edges inline in every
// state. It guards the version 1 reading path against later format changes.
const VERSION_ONE_PACKAGE = path.resolve(__dirname, "../fixtures/version-1-project.skf");

describe("a project package written by SketchForge 1.0.9", () => {
  it("still opens and keeps its geometry, display edges, and history", async () => {
    const restored = await importSkfProject(readFileSync(VERSION_ONE_PACKAGE));
    const edges = [{ points: [0, 0, 0, 1, 2, 3] }, { points: [4, 5, 6, 7, 8, 9] }];

    expect(restored.migratedFromVersion).toBe(1);
    expect(restored.projectName).toBe("Legacy");
    expect(restored.sourceProjectId).toBe("legacy-project");
    expect(restored.history).toHaveLength(2);
    expect(restored.historyIndex).toBe(1);
    expect(restored.shapes[0].x).toBe(9);
    expect(restored.shapes[0].cadDisplayEdges).toEqual(edges);
    expect(restored.shapes[0].cadDisplayEdgesVersion).toBe(2);
    expect(restored.shapes[0].cadBrep).toBe("ISO-10303-21;");
    expect(restored.shapes[0].importedMesh?.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(restored.history[0].shapes[0].x).toBe(1);
    expect(restored.history[0].shapes[0].cadDisplayEdges).toEqual(edges);
  });
});
