import { zipSync, strToU8 } from "fflate";
import { meshProjectShapes } from "./projectMeshes.js";
import { exportShapesToStep } from "./stepExport.js";
import { exportSkfProject } from "./skfProject.js";
import { projectShapesToSvg } from "./serverCadProjection.js";
import { sectionShapesToSvg, type SectionOptions } from "./serverCadSection.js";
import type { ProjectionLayout } from "./cadProjection.js";
import type { ProjectDocument } from "./serverProjectDocument.js";
import type { WorkplaneShape } from "./domain/sketchforge.js";

export const PROJECT_EXPORT_FORMATS = ["stl", "obj", "3mf", "step", "skf", "zip", "svg"] as const;
export type ProjectExportFormat = (typeof PROJECT_EXPORT_FORMATS)[number];

export type ProjectExportArtifact = {
  format: ProjectExportFormat;
  filename: string;
  mimeType: string;
  data: Uint8Array;
  shapeCount: number;
  exportedCount?: number;
  skipped?: Array<{ name: string; kind: string; reason: string }>;
};

function stlBytes(meshes: Awaited<ReturnType<typeof meshProjectShapes>>) {
  const triangles = meshes.reduce((sum, mesh) => sum + mesh.faces.length, 0);
  const bytes = new Uint8Array(84 + triangles * 50);
  bytes.set(new TextEncoder().encode("SketchForge binary STL"));
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles, true);
  let offset = 84;
  for (const mesh of meshes) for (const [ia, ib, ic] of mesh.faces) {
    const points = [mesh.vertices[ia], mesh.vertices[ib], mesh.vertices[ic]]
      .map(([x, y, z]) => [x, -z, y]);
    const [a, b, c] = points;
    const u = b.map((value, i) => value - a[i]);
    const v = c.map((value, i) => value - a[i]);
    let normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal) || 1;
    normal = normal.map((value) => value / length);
    for (const value of [...normal, ...a, ...b, ...c]) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return bytes;
}

function objBytes(meshes: Awaited<ReturnType<typeof meshProjectShapes>>) {
  const lines = ["# SketchForge OBJ export"];
  let index = 1;
  for (const mesh of meshes) {
    lines.push(`o ${mesh.name.replace(/\s+/g, "_")}`);
    for (const [x, y, z] of mesh.vertices) lines.push(`v ${x} ${y} ${z}`);
    for (const [a, b, c] of mesh.faces) lines.push(`f ${a + index} ${b + index} ${c + index}`);
    index += mesh.vertices.length;
  }
  return new TextEncoder().encode(lines.join("\n"));
}

function threeMfBytes(meshes: Awaited<ReturnType<typeof meshProjectShapes>>) {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const materials = meshes.map((mesh, index) => {
    const colors = [...new Set((mesh.triangleColors ?? []).filter((color): color is string => color !== null))];
    if (!colors.length) return "";
    return `<basematerials id="${meshes.length + index + 1}">${colors.map((color) => `<base name="Face" displaycolor="${color.length === 7 ? `${color}FF` : color}"/>`).join("")}</basematerials>`;
  }).join("");
  const objects = meshes.map((mesh, index) => {
    const colors = [...new Set((mesh.triangleColors ?? []).filter((color): color is string => color !== null))];
    const materialId = meshes.length + index + 1;
    const triangles = mesh.faces.map(([a, b, c], triangleIndex) => {
      const color = mesh.triangleColors?.[triangleIndex];
      if (!color) return `<triangle v1="${a}" v2="${b}" v3="${c}"/>`;
      const colorIndex = colors.indexOf(color);
      return `<triangle v1="${a}" v2="${b}" v3="${c}" pid="${materialId}" p1="${colorIndex}" p2="${colorIndex}" p3="${colorIndex}"/>`;
    }).join("");
    return `<object id="${index + 1}" type="model" name="${escape(mesh.name)}"><mesh><vertices>${mesh.vertices.map(([x, y, z]) => `<vertex x="${x}" y="${-z}" z="${y}"/>`).join("")}</vertices><triangles>${triangles}</triangles></mesh></object>`;
  }).join("");
  const items = meshes.map((_, index) => `<item objectid="${index + 1}"/>`).join("");
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${materials}${objects}</resources><build>${items}</build></model>`;
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    "3D/3dmodel.model": strToU8(model),
  });
}

function skfBytes(document: ProjectDocument, shapes: WorkplaneShape[]) {
  return exportSkfProject({
    projectId: typeof document.metadata.id === "string" ? document.metadata.id : undefined,
    projectName: document.projectName,
    createdAt: document.createdAt,
    modifiedAt: Date.now(),
    shapes,
    history: document.history,
    historyIndex: document.historyIndex,
    assets: document.assets,
    workspace: document.workspace,
    snapGrid: document.snapGrid,
    placementElevation: document.placementElevation,
    placementWorkplane: document.placementWorkplane,
    sketchPlacementWorkplane: document.sketchPlacementWorkplane,
  });
}

export type ProjectExportOptions = {
  format: ProjectExportFormat;
  shapeIds?: string[];
  name?: string;
  /**
   * What an SVG shows: one of the kernel's named views, or the four-view grid
   * (the default). Meaningless for every other format, and the route refuses
   * it there rather than ignoring it.
   */
  view?: ProjectionLayout;
  /** Section contours for a named drawing-coordinate plane; SVG only. */
  section?: SectionOptions;
};

export async function exportProjectScene(
  document: ProjectDocument,
  options: ProjectExportOptions,
): Promise<ProjectExportArtifact> {
  const requested = options.shapeIds?.length ? new Set(options.shapeIds) : null;
  const shapes = document.shapes.filter((shape) => !requested || requested.has(shape.id));
  const baseName = (options.name?.trim() || document.projectName || "SketchForge project").replace(/[\\/:*?\"<>|]/g, "_");
  const format = options.format;
  if (options.section && format !== "svg") throw new Error("section only applies to the svg format.");
  if (options.section && options.view !== undefined) throw new Error("section and view cannot be used together.");

  if (format === "skf") {
    const data = await skfBytes(document, shapes);
    return { format, filename: `${baseName}.skf`, mimeType: "application/vnd.sketchforge.project+zip", data, shapeCount: shapes.length };
  }
  if (format === "step") {
    const result = await exportShapesToStep(shapes.filter((shape) => shape.hidden !== true));
    const data = new Uint8Array(await result.blob.arrayBuffer());
    return { format, filename: `${baseName}.step`, mimeType: "model/step", data, shapeCount: shapes.length, exportedCount: result.exportedCount, skipped: result.skipped };
  }

  const visible: WorkplaneShape[] = shapes.filter((shape) => shape.hidden !== true && shape.hole !== true);
  if (!visible.length) throw new Error("No visible solid objects to export.");
  if (format === "svg") {
    if (options.section) {
      const svg = await sectionShapesToSvg(visible, options.section);
      return { format, filename: `${baseName}.svg`, mimeType: "image/svg+xml", data: new TextEncoder().encode(svg), shapeCount: visible.length };
    }
    // Drawn from the exact solids by hidden-line removal, not from the meshes
    // below: a projected circle stays a circle.
    const svg = await projectShapesToSvg(visible, { view: options.view });
    return { format, filename: `${baseName}.svg`, mimeType: "image/svg+xml", data: new TextEncoder().encode(svg), shapeCount: visible.length };
  }
  const meshes = await meshProjectShapes(visible);
  if (!meshes.length) throw new Error("No visible solid objects could be meshed.");
  const stl = () => stlBytes(meshes);
  const data = format === "stl" ? stl()
    : format === "obj" ? objBytes(meshes)
    : format === "3mf" ? threeMfBytes(meshes)
    : zipSync({ [`${baseName}.stl`]: stl(), [`${baseName}.skf`]: await skfBytes(document, document.shapes) });
  const suffix = format === "zip" ? "zip" : format;
  const mimeType = { stl: "model/stl", obj: "text/plain", "3mf": "model/3mf", zip: "application/zip" }[format];
  return { format, filename: `${baseName}.${suffix}`, mimeType, data, shapeCount: meshes.length };
}
