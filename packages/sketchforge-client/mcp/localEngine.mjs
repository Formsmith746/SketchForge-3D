import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const projectsDir = process.env.SKETCHFORGE_PROJECTS_DIR;
let backend;
let enginePackagePromise;
let selectedObjectIds = [];

async function getBackend() {
  if (!projectsDir) throw new Error("Set SKETCHFORGE_PROJECTS_DIR to a directory containing SketchForge project files.");
  if (!backend) {
    enginePackagePromise ??= import("@constructorfleet/sketchforge-engine");
    await mkdir(projectsDir, { recursive: true });
    const { createEngine, directoryProjectStore } = await enginePackagePromise;
    const store = directoryProjectStore(projectsDir);
    backend = { store, engine: createEngine(store), package: await enginePackagePromise };
  }
  return backend;
}

function requireProjectId(args) {
  if (typeof args.projectId !== "string" || !args.projectId.trim()) {
    throw new Error("projectId is required in local mode. Use a project id from the configured project directory.");
  }
  return args.projectId;
}

async function unwrap(result) {
  if (result.ok) return result.value;
  throw new Error(`Engine operation failed: ${JSON.stringify(result.failure)}`);
}

function objectSummary(shape) {
  const { id, name, kind, x, z, elevation, width, depth, height, rotation, rotationX, rotationZ, color, hole, locked, group, features } = shape;
  return { id, name, kind, x, z, elevation, width, depth, height, rotation, rotationX, rotationZ, color, hole, locked, ...(group ? { group } : {}), ...(features ? { features } : {}) };
}

function compactMutationValue(value) {
  if (Array.isArray(value)) return value.map(compactMutationValue);
  if (!value || typeof value !== "object") return value;

  const isShape = typeof value.id === "string" && typeof value.kind === "string";
  const result = {};
  for (const [key, field] of Object.entries(value)) {
    if (isShape && ["cadBrep", "cadDisplayEdges"].includes(key)) continue;
    if (isShape && key === "importedMesh" && field && typeof field === "object") {
      const { positions, normals, brepStep, ...metadata } = field;
      result.importedMesh = {
        ...compactMutationValue(metadata),
        ...(Array.isArray(positions) ? { positionCount: positions.length } : {}),
        ...(Array.isArray(normals) ? { normalCount: normals.length } : {}),
        ...(brepStep === undefined ? {} : { hasBrepStep: true }),
      };
      continue;
    }
    result[key] = compactMutationValue(field);
  }
  if (isShape) {
    if (typeof value.cadBrep === "string") result.hasCadBrep = true;
    if (Array.isArray(value.cadDisplayEdges)) result.cadDisplayEdgeCount = value.cadDisplayEdges.length;
  }
  return result;
}

const MUTATION_TOOLS = new Set([
  "sketchforge_create_shape",
  "sketchforge_import_mesh",
  "sketchforge_update_object",
  "sketchforge_delete_objects",
  "sketchforge_align_objects",
  "sketchforge_distribute_objects",
  "sketchforge_pattern_objects",
  "sketchforge_group_objects",
  "sketchforge_ungroup_objects",
  "sketchforge_boolean_cut",
  "sketchforge_separate_parts",
  "sketchforge_explode_step_assembly",
  "sketchforge_apply_edge_treatment",
  "sketchforge_hollow_shape",
  "sketchforge_mirror_objects",
  "sketchforge_mirror_baked",
]);

function stlBytesFromPositions(positions) {
  if (!Array.isArray(positions) || positions.length === 0 || positions.length % 9 !== 0 || !positions.every(Number.isFinite)) {
    throw new Error("positions must contain finite XYZ coordinates for one or more complete triangles.");
  }
  const facets = [];
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    facets.push(` facet normal ${nx / length} ${ny / length} ${nz / length}\n  outer loop\n   vertex ${ax} ${ay} ${az}\n   vertex ${bx} ${by} ${bz}\n   vertex ${cx} ${cy} ${cz}\n  endloop\n endfacet`);
  }
  return new TextEncoder().encode(`solid SketchForge MCP\n${facets.join("\n")}\nendsolid SketchForge MCP\n`);
}

async function readScene(args) {
  const id = requireProjectId(args);
  const { engine } = await getBackend();
  const project = await unwrap(await engine.project(id));
  const allow = Array.isArray(args.shapeIds) ? new Set(args.shapeIds) : null;
  const deny = new Set(Array.isArray(args.excludeShapeIds) ? args.excludeShapeIds : []);
  const shapes = project.shapes.filter((shape) => (!allow || allow.has(shape.id)) && !deny.has(shape.id));
  const rawIds = Array.isArray(args.includeRawShapeIds) ? new Set(args.includeRawShapeIds) : null;
  return {
    projectId: project.projectId,
    name: project.name,
    createdAt: project.createdAt,
    revision: project.revision,
    snapGrid: project.snapGrid,
    workspace: project.workspace,
    shapeCount: shapes.length,
    objects: shapes.map(objectSummary),
    ...(args.includeRawShapes === true || rawIds ? {
      rawShapes: shapes.filter((shape) => rawIds ? rawIds.has(shape.id) : args.includeRawShapes === true),
    } : {}),
  };
}

async function exportScene(args) {
  const id = requireProjectId(args);
  const { store, package: enginePackage } = await getBackend();
  const document = await store.read(id);
  if (!document) throw new Error(`Project not found: ${id}`);
  const requestedIds = Array.isArray(args.shapeIds) && args.shapeIds.length ? args.shapeIds : selectedObjectIds;
  const artifact = await enginePackage.exportProjectScene(document, {
    format: args.format,
    shapeIds: requestedIds.length ? requestedIds : undefined,
    name: args.name,
    ...(args.view === undefined ? {} : { view: args.view }),
    ...(args.section === undefined ? {} : { section: args.section }),
  });
  const bytes = artifact.data;
  const response = {
    format: artifact.format,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    bytes: bytes.byteLength,
    shapeCount: artifact.shapeCount,
    ...(artifact.exportedCount === undefined ? {} : { exportedCount: artifact.exportedCount }),
    ...(artifact.skipped === undefined ? {} : { skipped: artifact.skipped }),
    base64: Buffer.from(bytes).toString("base64"),
  };
  if (typeof args.outputPath === "string" && args.outputPath.trim()) {
    const destination = path.resolve(args.outputPath);
    writeFileSync(destination, bytes);
    return { ...response, base64: undefined, savedTo: destination };
  }
  return response;
}

async function validateScene(args) {
  const id = requireProjectId(args);
  const { engine, package: enginePackage } = await getBackend();
  const project = await unwrap(await engine.project(id));
  const requested = Array.isArray(args.shapeIds) && args.shapeIds.length ? new Set(args.shapeIds) : null;
  const excluded = new Set(Array.isArray(args.excludeShapeIds) ? args.excludeShapeIds : []);
  const shapes = project.shapes.filter((shape) => (!requested || requested.has(shape.id)) && !excluded.has(shape.id) && !shape.hidden && !shape.hole);
  const records = await Promise.all(shapes.map(async (shape) => {
    try {
      const [mesh] = await enginePackage.meshProjectShapes([shape]);
      if (!mesh) throw new Error("No mesh could be generated.");
      const bounds = mesh.vertices.reduce((b, [x,y,z]) => ({ minX: Math.min(b.minX,x), maxX: Math.max(b.maxX,x), minY: Math.min(b.minY,y), maxY: Math.max(b.maxY,y), minZ: Math.min(b.minZ,z), maxZ: Math.max(b.maxZ,z) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const topology = enginePackage.analyzeMeshTopology(mesh.vertices, mesh.faces);
      return { id: shape.id, name: shape.name, mesh, bounds, topology };
    } catch (error) {
      return { id: shape.id, name: shape.name, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const topology = records.map(({ id: objectId, name, topology: report, error }) => error ? { id: objectId, name, error } : { id: objectId, name, ...report });
  const validRecords = records.filter((record) => record.mesh);
  const clearances = [];
  const intersectionPairs = [];
  for (let i = 0; i < validRecords.length; i += 1) for (let j = i + 1; j < validRecords.length; j += 1) {
    const a = validRecords[i].bounds, b = validRecords[j].bounds;
    const gaps = [Math.max(0, b.minX-a.maxX, a.minX-b.maxX), Math.max(0, b.minY-a.maxY, a.minY-b.maxY), Math.max(0, b.minZ-a.maxZ, a.minZ-b.maxZ)];
    clearances.push({ fromId: validRecords[i].id, toId: validRecords[j].id, lowerBound: Math.hypot(...gaps), overlappingBounds: gaps.every((gap) => gap === 0) });
    if (gaps.every((gap) => gap === 0)) intersectionPairs.push([validRecords[i], validRecords[j]]);
  }
  const intersections = [];
  if (intersectionPairs.length) {
    const { default: manifoldModule } = await import("manifold-3d");
    const runtime = await manifoldModule();
    runtime.setup();
    const asSolid = (mesh) => {
      const meshData = new runtime.Mesh({
        numProp: 3,
        vertProperties: Float32Array.from(mesh.vertices.flat()),
        triVerts: Uint32Array.from(mesh.faces.flat()),
        tolerance: 0.0001,
      });
      meshData.merge();
      return { meshData, solid: runtime.Manifold.ofMesh(meshData) };
    };
    for (const [left, right] of intersectionPairs) {
      let a, b, overlap;
      try {
        a = asSolid(left.mesh); b = asSolid(right.mesh);
        overlap = a.solid.intersect(b.solid);
        const status = overlap.status();
        if (status !== "NoError") throw new Error(`Manifold status ${status}`);
        const volume = Math.max(0, overlap.volume());
        intersections.push({ fromId: left.id, toId: right.id, volume, intersects: volume > 1e-6 });
      } catch (error) {
        intersections.push({ fromId: left.id, toId: right.id, error: error instanceof Error ? error.message : String(error) });
      } finally {
        overlap?.delete(); a?.solid?.delete(); b?.solid?.delete();
      }
    }
  }
  return { objectsChecked: shapes.length, topology, clearances, intersections, clearanceMethod: "AABB lower bound; conservative, not exact surface distance.", intersectionMethod: "Manifold intersection volume for overlapping AABB pairs; unsupported or invalid meshes report an error per pair." };
}

/**
 * The project drawn by the engine's hidden-line projection.
 *
 * One path for the drawing tool, the SVG export and the image capture, so all
 * three show the same picture. `shapeIds` narrows it to named objects, else to
 * the local selection, else to the whole scene.
 */
async function drawProject(args, view) {
  const id = requireProjectId(args);
  const { store, package: enginePackage } = await getBackend();
  const document = await store.read(id);
  if (!document) throw new Error(`Project not found: ${id}`);
  const requestedIds = Array.isArray(args.shapeIds) && args.shapeIds.length ? args.shapeIds : selectedObjectIds;
  return enginePackage.exportProjectScene(document, {
    format: "svg",
    view,
    shapeIds: requestedIds.length ? requestedIds : undefined,
    name: args.name,
  });
}

async function projectView(args) {
  const { package: enginePackage } = await getBackend();
  const view = enginePackage.parseProjectionLayout(args.view);
  if (view === null) throw new Error(`view must be one of: ${enginePackage.PROJECTION_LAYOUTS.join(", ")}.`);
  const artifact = await drawProject(args, view);
  const svg = Buffer.from(artifact.data).toString("utf8");
  const response = { view, filename: artifact.filename, mimeType: artifact.mimeType, bytes: artifact.data.byteLength, shapeCount: artifact.shapeCount };
  if (typeof args.outputPath === "string" && args.outputPath.trim()) {
    const destination = path.resolve(args.outputPath);
    writeFileSync(destination, artifact.data);
    return { ...response, savedTo: destination };
  }
  return { ...response, svg };
}

async function sectionView(args) {
  const { package: enginePackage } = await getBackend();
  if (!enginePackage.SECTION_PLANES.includes(args.plane)) throw new Error(`plane must be one of: ${enginePackage.SECTION_PLANES.join(", ")}.`);
  if (typeof args.offset !== "number" || !Number.isFinite(args.offset) || Math.abs(args.offset) > 100_000) {
    throw new Error("offset must be a finite coordinate between -100000 and 100000.");
  }
  const id = requireProjectId(args);
  const { store } = await getBackend();
  const document = await store.read(id);
  if (!document) throw new Error(`Project not found: ${id}`);
  const requestedIds = Array.isArray(args.shapeIds) && args.shapeIds.length ? args.shapeIds : selectedObjectIds;
  const artifact = await enginePackage.exportProjectScene(document, {
    format: "svg",
    section: { plane: args.plane, offset: args.offset },
    shapeIds: requestedIds.length ? requestedIds : undefined,
    name: args.name,
  });
  const svg = Buffer.from(artifact.data).toString("utf8");
  const response = { plane: args.plane, offset: args.offset, filename: artifact.filename, mimeType: artifact.mimeType, bytes: artifact.data.byteLength, shapeCount: artifact.shapeCount };
  if (typeof args.outputPath === "string" && args.outputPath.trim()) {
    const destination = path.resolve(args.outputPath);
    writeFileSync(destination, artifact.data);
    return { ...response, savedTo: destination };
  }
  return { ...response, svg };
}

/**
 * A PNG of the project, rasterised from the same drawing.
 *
 * A named face is that one view; `home` and `current` -- the editor's
 * three-quarter look -- are the four-view grid, which is the headless answer to
 * "show me the part". This replaced a hand-written painter's algorithm that
 * depth-sorted every triangle, which is not a correct occlusion solution.
 */
async function captureScene(args) {
  const { package: enginePackage } = await getBackend();
  const face = typeof args.face === "string" ? args.face : "home";
  const view = enginePackage.projectionLayoutForCaptureFace(face);
  const artifact = await drawProject({ ...args, shapeIds: undefined }, view);
  const sharp = (await import("sharp")).default;
  const png = await sharp(Buffer.from(artifact.data)).png().toBuffer();
  return { face, view, bytesApprox: png.byteLength, dataUrl: `data:image/png;base64,${png.toString("base64")}` };
}

async function callLocalEngineToolRaw(name, args = {}) {
  if (["sketchforge_list_editors", "sketchforge_inspect_errors"].includes(name)) {
    throw new Error(`${name} needs an open SketchForge editor and is unavailable in local mode.`);
  }
  const { engine, package: enginePackage } = await getBackend();
  if (name === "sketchforge_list_projects") {
    const projects = await Promise.all((await backend.store.list()).map(async (record) => {
      const project = await unwrap(await engine.project(record.projectId));
      return {
        id: record.projectId,
        name: String(record.metadata.name ?? "Untitled design"),
        shapes: project.shapes.length,
        revision: project.revision,
        updatedAt: record.updatedAt,
        packageBytes: record.packageBytes,
      };
    }));
    return { projects };
  }
  if (name === "sketchforge_create_project") {
    const projectName = String(args.name ?? "").trim().slice(0, 80);
    if (!projectName) throw new Error("name is required to create a project.");
    const id = randomUUID();
    const now = Date.now();
    await writeFile(path.join(projectsDir, `${id}.json`), JSON.stringify({ name: projectName, createdAt: now, updatedAt: now, revision: 1 }), { flag: "wx" });
    return { projectId: id, name: projectName, shapeCount: 0, revision: 1 };
  }
  if (name === "sketchforge_import_project") {
    const sourcePath = path.resolve(String(args.filePath ?? ""));
    if (path.extname(sourcePath).toLowerCase() !== ".skf") throw new Error("filePath must point to a .skf project file.");
    const bytes = await readFile(sourcePath);
    const imported = await enginePackage.importSkfProject(bytes);
    const projectName = String(args.name ?? imported.projectName ?? "Imported design").trim().slice(0, 80);
    if (!projectName) throw new Error("name must not be empty.");
    const id = randomUUID();
    const now = Date.now();
    const packagePath = path.join(projectsDir, `${id}.skf`);
    const metadataPath = path.join(projectsDir, `${id}.json`);
    const temporaryPackage = `${packagePath}.tmp`;
    const temporaryMetadata = `${metadataPath}.tmp`;
    try {
      await writeFile(temporaryPackage, bytes, { flag: "wx" });
      await writeFile(temporaryMetadata, JSON.stringify({ name: projectName, createdAt: now, updatedAt: now, revision: 1 }), { flag: "wx" });
      await rename(temporaryPackage, packagePath);
      await rename(temporaryMetadata, metadataPath);
    } catch (error) {
      await Promise.all([unlink(temporaryPackage).catch(() => {}), unlink(temporaryMetadata).catch(() => {}), unlink(packagePath).catch(() => {})]);
      throw error;
    }
    return { projectId: id, name: projectName, shapeCount: imported.shapes.length, revision: 1 };
  }
  const id = requireProjectId(args);
  switch (name) {
    case "sketchforge_read_scene":
    case "sketchforge_list_objects":
      return readScene(args);
    case "sketchforge_create_shape":
      return unwrap(await engine.addShapes(id, [args]));
    case "sketchforge_select_objects": {
      const project = await unwrap(await engine.project(id));
      const requested = Array.isArray(args.ids) ? args.ids : args.id ? [args.id] : [];
      selectedObjectIds = requested.filter((shapeId) => project.shapes.some((shape) => shape.id === shapeId));
      return { selectedIds: selectedObjectIds, objects: project.shapes.filter((shape) => selectedObjectIds.includes(shape.id)).map(objectSummary) };
    }
    case "sketchforge_import_mesh": {
      const imported = await unwrap(await engine.importMesh(id, {
        fileName: `${args.name || "Imported mesh"}.stl`,
        bytes: stlBytesFromPositions(args.positions),
        mediaType: "model/stl",
      }));
      const changes = Object.fromEntries(["name", "color", "x", "z", "elevation"].filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
      return Object.keys(changes).length ? unwrap(await engine.changeShape(id, imported.shape.id, changes)) : imported;
    }
    case "sketchforge_update_object": {
      const { id: shapeId, projectId, ...changes } = args;
      return unwrap(await engine.changeShape(id, shapeId, changes));
    }
    case "sketchforge_delete_objects": {
      const ids = args.ids ?? (args.id ? [args.id] : selectedObjectIds);
      const removed = [];
      for (const shapeId of ids) removed.push(await unwrap(await engine.removeShape(id, shapeId)));
      return { removed };
    }
    case "sketchforge_align_objects":
      return unwrap(await engine.align(id, { ...args, ids: args.ids?.length ? args.ids : selectedObjectIds }));
    case "sketchforge_distribute_objects":
      return unwrap(await engine.distribute(id, { ...args, ids: args.ids?.length ? args.ids : selectedObjectIds }));
    case "sketchforge_pattern_objects":
      return unwrap(await engine.pattern(id, { ...args, ids: args.ids?.length ? args.ids : selectedObjectIds, kind: args.kind ?? "linear", count: args.count ?? 4 }));
    case "sketchforge_group_objects":
      return unwrap(await engine.group(id, args.ids?.length ? args.ids : selectedObjectIds));
    case "sketchforge_ungroup_objects": {
      const results = [];
      for (const shapeId of args.ids ?? (args.id ? [args.id] : selectedObjectIds)) results.push(await unwrap(await engine.ungroup(id, shapeId)));
      return { results };
    }
    case "sketchforge_boolean_cut": {
      if (args.solidIds && args.holeIds) return unwrap(await engine.cut(id, { solidIds: args.solidIds, holeIds: args.holeIds }));
      const project = await unwrap(await engine.project(id));
      const selected = project.shapes.filter((shape) => selectedObjectIds.includes(shape.id));
      return unwrap(await engine.cut(id, {
        solidIds: selected.filter((shape) => !shape.hole).map((shape) => shape.id),
        holeIds: selected.filter((shape) => shape.hole).map((shape) => shape.id),
      }));
    }
    case "sketchforge_separate_parts":
      return unwrap(await engine.separate(id, args.id ?? selectedObjectIds[0]));
    case "sketchforge_explode_step_assembly":
      return unwrap(await engine.explode(id, args.shapeId ?? args.id));
    case "sketchforge_list_edges":
      return unwrap(await engine.edges(id, args.shapeId ?? args.id));
    case "sketchforge_list_faces":
      return unwrap(await engine.faces(id, args.shapeId));
    case "sketchforge_measure_shape":
      return unwrap(await engine.measurements(id, args.shapeId));
    case "sketchforge_shape_properties":
      return unwrap(await engine.properties(id, args.shapeId));
    case "sketchforge_estimate_wall_thickness": {
      const project = await unwrap(await engine.project(id));
      const shape = project.shapes.find((entry) => entry.id === args.shapeId);
      if (!shape) throw new Error(`Shape ${args.shapeId} is not in the project.`);
      return enginePackage.wallThickness(shape);
    }
    case "sketchforge_measure_between":
      return unwrap(await engine.measureBetween(id, args.from, args.to));
    case "sketchforge_check_interference":
      return unwrap(await engine.interference(id, {
        ...(Array.isArray(args.ids) && args.ids.length ? { ids: args.ids } : {}),
        ...(args.clearance === undefined ? {} : { clearance: args.clearance }),
      }));
    case "sketchforge_apply_edge_treatment":
      return unwrap(await engine.treat(id, args.id, {
        kind: args.kind,
        amount: args.amount,
        angle: args.chamferAngle,
        edges: args.allEdges || args.edgeIds === "all" ? undefined : args.edgeIds,
      }));
    case "sketchforge_hollow_shape":
      return unwrap(await engine.shell(id, args.shapeId, { thickness: args.thickness, openFaces: args.openFaces }));
    case "sketchforge_export_scene":
      return exportScene(args);
    case "sketchforge_validate_scene":
      return validateScene(args);
    case "sketchforge_capture_image":
      return captureScene(args);
    case "sketchforge_project_view":
      return projectView(args);
    case "sketchforge_section_view":
      return sectionView(args);
    case "sketchforge_mirror_baked": {
      const ids = Array.isArray(args.ids) ? args.ids : [];
      if (!ids.length || !["x", "y", "z"].includes(args.axis)) throw new Error("mirror_baked requires object ids and axis x, y, or z.");
      return { ...await unwrap(await engine.mirrorBaked(id, ids, args.axis)), axis: args.axis };
    }
    case "sketchforge_mirror_objects": {
      const ids = Array.isArray(args.ids) && args.ids.length ? args.ids : selectedObjectIds;
      if (!ids.length || !["x", "y", "z"].includes(args.axis)) throw new Error("mirror_objects requires object ids or a local selection, and axis x, y, or z.");
      const project = await unwrap(await engine.project(id));
      const selected = project.shapes.filter((shape) => ids.includes(shape.id));
      if (!selected.length) throw new Error("No matching objects to mirror.");
      const { nextShapes, moved: count } = enginePackage.mirrorShapes(project.shapes, ids, args.axis);
      const moved = [];
      for (const shape of selected) {
        if (shape.locked) continue;
        const reflected = nextShapes.find((item) => item.id === shape.id);
        const changes = Object.fromEntries(["x", "z", "elevation", "rotation", "rotationX", "rotationZ", "mirrorX", "mirrorY", "mirrorZ"].filter((key) => reflected[key] !== shape[key]).map((key) => [key, reflected[key]]));
        moved.push(unwrap(await engine.changeShape(id, shape.id, changes)));
      }
      return { moved: count, axis: args.axis, objects: moved };
    }
    default:
      throw new Error(`${name} needs an open SketchForge editor and is unavailable in local mode.`);
  }
}

export async function callLocalEngineTool(name, args = {}) {
  const result = await callLocalEngineToolRaw(name, args);
  return MUTATION_TOOLS.has(name) ? compactMutationValue(result) : result;
}
