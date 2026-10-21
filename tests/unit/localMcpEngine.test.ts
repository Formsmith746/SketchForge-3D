import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const server = path.join(root, "packages/sketchforge-client/mcp/server.mjs");
const temporaryDirectories: string[] = [];

function callMcp(projectsDir: string, id: number, name: string, args: Record<string, unknown>, extraEnvironment: Record<string, string> = {}) {
  const input = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
    JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
  ].join("\n") + "\n";
  const run = spawnSync(process.execPath, [server], {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...process.env, SKETCHFORGE_PROJECTS_DIR: projectsDir, SKETCHFORGE_API_TOKEN: "", SKETCHFORGE_URL: "http://127.0.0.1:1", ...extraEnvironment },
    timeout: 30_000,
  });
  expect(run.status, run.stderr).toBe(0);
  return run.stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

function listMcpTools(projectsDir: string) {
  const input = [
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }),
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  ].join("\n") + "\n";
  const run = spawnSync(process.execPath, [server], {
    cwd: root,
    input,
    encoding: "utf8",
    env: { ...process.env, SKETCHFORGE_PROJECTS_DIR: projectsDir, SKETCHFORGE_API_TOKEN: "", SKETCHFORGE_URL: "" },
    timeout: 30_000,
  });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout.trim().split(/\r?\n/)[1]).result.tools;
}

describe("local MCP engine mode", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it("lists projects from the configured local directory", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "case.json"), JSON.stringify({ name: "Local case", createdAt: 1, revision: 1 }));
    fs.writeFileSync(path.join(projectsDir, "other.json"), JSON.stringify({ name: "Other project", createdAt: 2, revision: 3 }));

    const tools = listMcpTools(projectsDir);
    expect(tools.some((tool: { name: string }) => tool.name === "sketchforge_list_projects")).toBe(true);
    const response = callMcp(projectsDir, 2, "sketchforge_list_projects", {});
    expect(response[1].result.isError).toBeUndefined();
    expect(JSON.parse(response[1].result.content[0].text).projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "case", name: "Local case" }),
      expect.objectContaining({ id: "other", name: "Other project" }),
    ]));

    const created = callMcp(projectsDir, 3, "sketchforge_create_project", { name: "Fresh project" });
    expect(created[1].result.isError).toBeUndefined();
    expect(JSON.parse(created[1].result.content[0].text)).toMatchObject({ name: "Fresh project", shapeCount: 0, revision: 1 });
  });

  it("lists and runs per-shape properties locally with geometry provenance", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "case.json"), JSON.stringify({ name: "Local case", createdAt: 1, revision: 1 }));
    const tool = listMcpTools(projectsDir).find((candidate: { name: string }) => candidate.name === "sketchforge_shape_properties");
    expect(tool.inputSchema.required).toEqual(["projectId", "shapeId"]);
    const created = callMcp(projectsDir, 2, "sketchforge_create_shape", { projectId: "case", kind: "box", width: 4, depth: 5, height: 6 });
    const shapeId = JSON.parse(created[1].result.content[0].text).shapes[0].id;
    const read = callMcp(projectsDir, 3, "sketchforge_shape_properties", { projectId: "case", shapeId });
    expect(read[1].result.isError).toBeUndefined();
    expect(JSON.parse(read[1].result.content[0].text)).toMatchObject({ volume: 120, area: 148, provenance: { source: "parametric", precision: "exact" } });
  }, 60_000);

  it("checks exact interference locally without returning geometry arrays", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "case.json"), JSON.stringify({ name: "Local case", createdAt: 1, revision: 1 }));
    const first = callMcp(projectsDir, 2, "sketchforge_create_shape", { projectId: "case", kind: "box", name: "A", width: 2, depth: 2, height: 2 });
    const second = callMcp(projectsDir, 3, "sketchforge_create_shape", { projectId: "case", kind: "box", name: "B", width: 2, depth: 2, height: 2, x: 3 });
    const ids = [first, second].map((result) => JSON.parse(result[1].result.content[0].text).shapes[0].id);
    const report = callMcp(projectsDir, 4, "sketchforge_check_interference", { projectId: "case", ids, clearance: 1 });
    expect(report[1].result.isError).toBeUndefined();
    expect(JSON.parse(report[1].result.content[0].text).pairs).toEqual([
      { a: { id: ids[0], name: "A" }, b: { id: ids[1], name: "B" }, gap: 1, overlapVolume: 0, precision: "exact" },
    ]);
  }, 60_000);

  it("imports an SKF package as a new local project", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "source.json"), JSON.stringify({ name: "Source", createdAt: 1, revision: 1 }));
    const created = callMcp(projectsDir, 2, "sketchforge_create_shape", { projectId: "source", kind: "box", name: "Imported box", width: 12, depth: 8, height: 4 });
    const shapeId = JSON.parse(created[1].result.content[0].text).shapes[0].id;
    const packagePath = path.join(projectsDir, "source.skf");
    const exported = callMcp(projectsDir, 2, "sketchforge_export_scene", { projectId: "source", format: "skf", outputPath: packagePath });
    expect(JSON.parse(exported[1].result.content[0].text).shapeCount).toBe(1);

    const imported = callMcp(projectsDir, 2, "sketchforge_import_project", { filePath: packagePath, name: "Imported copy" });
    expect(imported[1].result.isError).toBeUndefined();
    const importedProject = JSON.parse(imported[1].result.content[0].text);
    expect(importedProject).toMatchObject({ name: "Imported copy", shapeCount: 1 });
    expect(importedProject.projectId).not.toBe("source");
    const scene = callMcp(projectsDir, 2, "sketchforge_read_scene", { projectId: importedProject.projectId });
    expect(JSON.parse(scene[1].result.content[0].text).objects).toEqual([expect.objectContaining({ id: shapeId, name: "Imported box" })]);
  });

  it("creates and reads a project directly from its directory without a server", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "case.json"), JSON.stringify({ name: "Local case", createdAt: 1, revision: 1 }));

    const created = callMcp(projectsDir, 2, "sketchforge_create_shape", {
      projectId: "case", kind: "box", name: "Mounting plate", width: 80, depth: 56, height: 3,
    });
    expect(created[1].result.isError).toBeUndefined();
    const plate = JSON.parse(created[1].result.content[0].text).shapes[0];
    const reference = callMcp(projectsDir, 2, "sketchforge_create_shape", {
      projectId: "case", kind: "box", name: "Reference mesh placeholder", width: 10, depth: 8, height: 1,
    });
    const referenceShape = JSON.parse(reference[1].result.content[0].text).shapes[0];

    const read = callMcp(projectsDir, 2, "sketchforge_read_scene", {
      projectId: "case", excludeShapeIds: [referenceShape.id], includeRawShapes: false,
    });
    const scene = JSON.parse(read[1].result.content[0].text);
    expect(scene.name).toBe("Local case");
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0]).toMatchObject({ id: plate.id, name: "Mounting plate", width: 80, depth: 56, height: 3 });
    expect(scene).not.toHaveProperty("rawShapes");

    const outputPath = path.join(projectsDir, "Local case.skf");
    const exported = callMcp(projectsDir, 2, "sketchforge_export_scene", { projectId: "case", format: "skf", outputPath });
    const artifact = JSON.parse(exported[1].result.content[0].text);
    expect(artifact).toMatchObject({ filename: "Local case.skf", savedTo: outputPath, shapeCount: 2 });
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);

    const mirrored = callMcp(projectsDir, 2, "sketchforge_mirror_objects", { projectId: "case", ids: [plate.id], axis: "x" });
    expect(JSON.parse(mirrored[1].result.content[0].text)).toMatchObject({ moved: 1, axis: "x" });

    const baked = callMcp(projectsDir, 2, "sketchforge_mirror_baked", { projectId: "case", ids: [plate.id], axis: "y" });
    expect(baked[1].result.isError).toBeUndefined();
    expect(JSON.parse(baked[1].result.content[0].text)).toMatchObject({
      moved: 1,
      axis: "y",
      shapes: [expect.objectContaining({ id: plate.id, hasCadBrep: true, kind: "mesh" })],
    });

    const validation = callMcp(projectsDir, 2, "sketchforge_validate_scene", { projectId: "case" });
    expect(JSON.parse(validation[1].result.content[0].text)).toMatchObject({
      objectsChecked: 2,
      intersections: [{ fromId: plate.id, toId: referenceShape.id, intersects: true }],
    });

    const capture = callMcp(projectsDir, 2, "sketchforge_capture_image", { projectId: "case", face: "top" });
    const image = capture[1].result.content.find((item: { type: string }) => item.type === "image");
    expect(image?.mimeType).toBe("image/png");
    expect(Buffer.from(image.data, "base64").subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(JSON.parse(capture[1].result.content[0].text)).toMatchObject({ face: "top", view: "top" });

    const drawing = callMcp(projectsDir, 2, "sketchforge_project_view", { projectId: "case" });
    expect(drawing[1].result.isError, JSON.stringify(drawing[1].result.content)).toBeUndefined();
    const projected = JSON.parse(drawing[1].result.content[0].text);
    expect(projected).toMatchObject({ view: "multiview", mimeType: "image/svg+xml", shapeCount: 2 });
    expect(projected.svg.startsWith("<svg")).toBe(true);
    for (const label of ["Front", "Top", "Right", "Iso"]) expect(projected.svg).toContain(`>${label}</text>`);

    const drawingPath = path.join(projectsDir, "Local case.svg");
    const singleView = callMcp(projectsDir, 2, "sketchforge_project_view", { projectId: "case", view: "front", shapeIds: [plate.id], outputPath: drawingPath });
    expect(JSON.parse(singleView[1].result.content[0].text)).toMatchObject({ view: "front", savedTo: drawingPath, shapeCount: 1 });
    expect(fs.readFileSync(drawingPath, "utf8")).not.toContain(">Front</text>");

    const section = callMcp(projectsDir, 2, "sketchforge_section_view", { projectId: "case", plane: "xy", offset: 1.5, shapeIds: [plate.id] });
    expect(section[1].result.isError, JSON.stringify(section[1].result.content)).toBeUndefined();
    const sectionDrawing = JSON.parse(section[1].result.content[0].text);
    expect(sectionDrawing).toMatchObject({ plane: "xy", offset: 1.5, mimeType: "image/svg+xml", shapeCount: 1 });
    expect(sectionDrawing.svg).toContain('data-plane="xy"');
    expect(sectionDrawing.svg).toContain("<path");

    for (const format of ["stl", "obj", "3mf", "svg"]) {
      const target = path.join(projectsDir, `Local case.${format}`);
      const result = callMcp(projectsDir, 2, "sketchforge_export_scene", { projectId: "case", format, shapeIds: [plate.id], outputPath: target });
      expect(JSON.parse(result[1].result.content[0].text)).toMatchObject({ savedTo: target, shapeCount: 1 });
      expect(fs.statSync(target).size).toBeGreaterThan(0);
      if (format === "3mf") {
        const archive = unzipSync(fs.readFileSync(target));
        expect(Object.keys(archive).sort()).toEqual(["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"]);
        expect(strFromU8(archive["3D/3dmodel.model"])).toContain("<triangle");
      }
    }

    const dxfPath = path.join(projectsDir, "Local case.dxf");
    const dxf = callMcp(projectsDir, 2, "sketchforge_export_scene", {
      projectId: "case", format: "dxf", section: { plane: "xy", offset: 1.5 }, shapeIds: [plate.id], outputPath: dxfPath,
    });
    expect(dxf[1].result.isError, JSON.stringify(dxf[1].result.content)).toBeUndefined();
    expect(JSON.parse(dxf[1].result.content[0].text)).toMatchObject({ savedTo: dxfPath, shapeCount: 1 });
    expect(fs.readFileSync(dxfPath, "utf8")).toContain("LWPOLYLINE");

    const macroDirectory = path.join(projectsDir, "macros");
    fs.mkdirSync(macroDirectory);
    const macroName = "bolt-plate.macro.mjs";
    fs.copyFileSync(path.join(root, "packages/sketchforge-client/examples", macroName), path.join(macroDirectory, macroName));
    const macro = callMcp(projectsDir, 2, "sketchforge_run_macro", { macro: macroName, params: { holes: 3 } }, { SKETCHFORGE_MACRO_DIR: macroDirectory });
    expect(macro[1].result.isError, JSON.stringify(macro[1].result.content)).toBeUndefined();
    expect(JSON.parse(macro[1].result.content[0].text)).toMatchObject({ report: { projectCreated: true, shapeCount: 4, result: { holes: 3 } } });

    const cadMacroName = "filleted-box.macro.mjs";
    fs.copyFileSync(path.join(root, "packages/sketchforge-client/examples", cadMacroName), path.join(macroDirectory, cadMacroName));
    const cadMacro = callMcp(projectsDir, 2, "sketchforge_run_macro", { macro: cadMacroName, params: { width: 30, depth: 24, height: 12, radius: 2 } }, { SKETCHFORGE_MACRO_DIR: macroDirectory });
    expect(cadMacro[1].result.isError, JSON.stringify(cadMacro[1].result.content)).toBeUndefined();
    expect(JSON.parse(cadMacro[1].result.content[0].text)).toMatchObject({ report: { projectCreated: true, shapeCount: 1, result: { rounded: expect.any(Number), triangles: expect.any(Number) } } });
  }, 60_000);

  it("keeps imported mesh coordinates out of mutation results unless raw scene data is requested", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);
    fs.writeFileSync(path.join(projectsDir, "case.json"), JSON.stringify({ name: "Local case", createdAt: 1, revision: 1 }));
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];

    const imported = callMcp(projectsDir, 2, "sketchforge_import_mesh", {
      projectId: "case", name: "Triangle", positions, normals,
    });
    expect(imported[1].result.isError).toBeUndefined();
    const mutation = JSON.parse(imported[1].result.content[0].text);
    expect(mutation.shape).toMatchObject({ name: "Triangle", kind: "mesh", importedMesh: { triangleCount: 1 } });
    expect(mutation.shape.importedMesh).not.toHaveProperty("positions");
    expect(mutation.shape.importedMesh).not.toHaveProperty("normals");
    expect(mutation.shape.importedMesh).toMatchObject({ triangleCount: 1, positionCount: 9, normalCount: 9 });
    expect(mutation.shape).not.toHaveProperty("cadBrep");
    expect(mutation.shape).not.toHaveProperty("cadDisplayEdges");

    const patterned = callMcp(projectsDir, 3, "sketchforge_pattern_objects", {
      projectId: "case", ids: [mutation.shape.id], count: 2, stepX: 2,
    });
    const patternResult = JSON.parse(patterned[1].result.content[0].text);
    expect(patternResult).toMatchObject({ shapes: expect.arrayContaining([expect.objectContaining({ name: "Triangle" })]), revision: expect.any(Number) });
    expect(patternResult.shapes[0].importedMesh).not.toHaveProperty("positions");

    const boxCall = callMcp(projectsDir, 4, "sketchforge_create_shape", {
      projectId: "case", kind: "box", name: "Treated box", width: 10, depth: 8, height: 4,
    });
    const box = JSON.parse(boxCall[1].result.content[0].text).shapes[0];
    const treatedCall = callMcp(projectsDir, 5, "sketchforge_apply_edge_treatment", {
      projectId: "case", id: box.id, kind: "chamfer", amount: 0.2, allEdges: true,
    });
    const treatedResult = JSON.parse(treatedCall[1].result.content[0].text);
    expect(treatedResult.shape).toMatchObject({ id: box.id, hasCadBrep: true });
    expect(treatedResult.shape).not.toHaveProperty("cadBrep");
    expect(treatedResult.shape).not.toHaveProperty("cadDisplayEdges");

    const raw = callMcp(projectsDir, 6, "sketchforge_read_scene", {
      projectId: "case", includeRawShapeIds: [mutation.shape.id],
    });
    const scene = JSON.parse(raw[1].result.content[0].text);
    expect(scene.rawShapes[0].importedMesh.positions).toEqual([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0]);
  });

  it("advertises an optional URL and uses it to opt into a remote editor", () => {
    const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sketchforge-local-mcp-"));
    temporaryDirectories.push(projectsDir);

    const tools = listMcpTools(projectsDir);
    const listEditors = tools.find((tool: { name: string }) => tool.name === "sketchforge_list_editors");
    expect(tools.find((tool: { name: string }) => tool.name === "sketchforge_export_scene").inputSchema.properties.format.enum).toContain("svg");
    expect(tools.find((tool: { name: string }) => tool.name === "sketchforge_explode_step_assembly").inputSchema.required).toContain("shapeId");
    const projectView = tools.find((tool: { name: string }) => tool.name === "sketchforge_project_view");
    expect(projectView.inputSchema.properties.view.enum).toEqual(["multiview", "front", "back", "top", "bottom", "left", "right", "iso"]);
    const sectionView = tools.find((tool: { name: string }) => tool.name === "sketchforge_section_view");
    expect(sectionView.inputSchema.properties.plane.enum).toEqual(["xy", "xz", "yz"]);
    expect(sectionView.inputSchema.required).toEqual(["projectId", "plane", "offset"]);
    expect(listEditors.inputSchema.properties.url).toMatchObject({ type: "string" });
    for (const tool of tools.filter((candidate: { name: string }) => candidate.name !== "sketchforge_list_macros")) {
      expect(tool.inputSchema.properties.url).toMatchObject({ type: "string" });
    }

    const remote = callMcp(projectsDir, 2, "sketchforge_list_editors", { url: "http://127.0.0.1:1" }, { SKETCHFORGE_URL: "" });
    const message = remote[1].result.content[0].text;
    expect(remote[1].result.isError).toBe(true);
    expect(message).not.toContain("needs an open SketchForge editor");
    expect(message).toMatch(/fetch failed|ECONNREFUSED/i);
  });
});
