import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as THREE from "three";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { MAX_PROJECT_ASSET_BYTES } from "@/lib/projectAssets";
import { importedShapeFromTriangleSoup } from "@/lib/stlImport";
import type { WorkplaneShape } from "@/types/sketchforge";

export type ThreeMfMesh = {
  name: string;
  color?: string;
  vertices: ReadonlyArray<readonly [number, number, number]>;
  faces: ReadonlyArray<readonly [number, number, number]>;
};

const THREE_MF_LIMITS = {
  archiveBytes: MAX_PROJECT_ASSET_BYTES,
  entries: 4096,
  expandedBytes: 128 * 1024 * 1024,
  entryBytes: 64 * 1024 * 1024,
  modelBytes: 64 * 1024 * 1024,
  modelElements: 1_500_000,
  meshNumbers: 6_000_000,
  loaderTriangles: 1_500_000,
  componentDepth: 256,
} as const;

const THREE_MF_UNIT_SCALE: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

function xmlEscape(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function modelNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("3MF mesh contains an invalid coordinate");
  return String(Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(9)));
}

function displayColor(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const short = /^#([0-9a-f]{3})$/i.exec(normalized)?.[1];
  if (short) return `#${short.split("").map((digit) => digit + digit).join("").toUpperCase()}FF`;
  const full = /^#([0-9a-f]{6})$/i.exec(normalized)?.[1];
  return `#${(full ?? "0098C7").toUpperCase()}FF`;
}

function modelXml(meshes: ReadonlyArray<ThreeMfMesh>, title: string) {
  if (!meshes.length) throw new Error("Add a solid shape before exporting 3MF");
  const materials = meshes.map((mesh, index) => `      <base name="${xmlEscape(mesh.name || `Object ${index + 1}`)}" displaycolor="${displayColor(mesh.color)}"/>`);
  const objects = meshes.map((mesh, meshIndex) => {
    if (!mesh.vertices.length || !mesh.faces.length) throw new Error(`${mesh.name || "3MF object"} has no exportable triangles`);
    const vertices = mesh.vertices.map(([x, y, z]) => (
      `          <vertex x="${modelNumber(x)}" y="${modelNumber(-z)}" z="${modelNumber(y)}"/>`
    ));
    const faces = mesh.faces.map(([v1, v2, v3]) => {
      if (![v1, v2, v3].every((index) => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length)) {
        throw new Error(`${mesh.name || "3MF object"} contains an invalid triangle`);
      }
      return `          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`;
    });
    return [
      `    <object id="${meshIndex + 2}" name="${xmlEscape(mesh.name || `Object ${meshIndex + 1}`)}" type="model" pid="1" pindex="${meshIndex}">`,
      "      <mesh>",
      "        <vertices>",
      ...vertices,
      "        </vertices>",
      "        <triangles>",
      ...faces,
      "        </triangles>",
      "      </mesh>",
      "    </object>",
    ].join("\n");
  });
  const buildItems = meshes.map((_mesh, index) => `    <item objectid="${index + 2}"/>`);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `  <metadata name="Title">${xmlEscape(title.trim() || "SketchForge design")}</metadata>`,
    '  <metadata name="Application">SketchForge</metadata>',
    "  <resources>",
    '    <basematerials id="1">',
    ...materials,
    "    </basematerials>",
    ...objects,
    "  </resources>",
    "  <build>",
    ...buildItems,
    "  </build>",
    "</model>",
    "",
  ].join("\n");
}

export function exportMeshesTo3mf(meshes: ReadonlyArray<ThreeMfMesh>, title = "SketchForge design") {
  const triangleCount = meshes.reduce((total, mesh) => total + mesh.faces.length, 0);
  if (triangleCount > Math.floor(THREE_MF_LIMITS.meshNumbers / 9)) throw new Error("3MF export exceeds the supported triangle limit");
  const model = strToU8(modelXml(meshes, title));
  if (model.byteLength > THREE_MF_LIMITS.modelBytes) throw new Error("3MF export exceeds the 64 MB model limit");
  const files = {
    "[Content_Types].xml": strToU8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
      "</Types>",
      "",
    ].join("\n")),
    "_rels/.rels": strToU8([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
      "</Relationships>",
      "",
    ].join("\n")),
    "3D/3dmodel.model": model,
  };
  return zipSync(files, { level: 6, mtime: new Date("1980-01-02T00:00:00.000Z") });
}

function safeArchivePath(path: string) {
  const filePath = path.endsWith("/") ? path.slice(0, -1) : path;
  return Boolean(filePath)
    && !filePath.startsWith("/")
    && !filePath.startsWith("\\")
    && !/^[a-z]:/i.test(filePath)
    && !filePath.includes("\\")
    && filePath.split("/").every((part) => part && part !== "." && part !== "..");
}

function inspect3mfArchive(bytes: Uint8Array) {
  if (bytes.byteLength > THREE_MF_LIMITS.archiveBytes) throw new Error("3MF file exceeds the 256 MB archive limit");
  if (bytes.byteLength < 22) throw new Error("3MF file is not a valid package");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let directoryOffset = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      directoryOffset = offset;
      break;
    }
  }
  if (directoryOffset < 0) throw new Error("3MF package is missing its ZIP directory");
  const diskNumber = view.getUint16(directoryOffset + 4, true);
  const centralDiskNumber = view.getUint16(directoryOffset + 6, true);
  const entriesOnDisk = view.getUint16(directoryOffset + 8, true);
  const entryCount = view.getUint16(directoryOffset + 10, true);
  const centralSize = view.getUint32(directoryOffset + 12, true);
  const centralOffset = view.getUint32(directoryOffset + 16, true);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount) throw new Error("Multi-disk 3MF packages are not supported");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error("ZIP64 3MF packages are not supported");
  if (entryCount === 0 || entryCount > THREE_MF_LIMITS.entries) throw new Error("3MF package has an invalid number of files");
  if (centralOffset + centralSize > bytes.byteLength) throw new Error("3MF package directory is truncated");

  let offset = centralOffset;
  let expandedBytes = 0;
  let hasModel = false;
  const names = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("3MF package directory is malformed");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error("3MF package directory entry is truncated");
    if (flags & 1) throw new Error("Encrypted 3MF packages are not supported");
    if (method !== 0 && method !== 8) throw new Error("3MF package uses an unsupported compression method");
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeArchivePath(name) || names.has(name)) throw new Error("3MF package contains an unsafe or duplicate file path");
    names.add(name);
    if (expanded > THREE_MF_LIMITS.entryBytes) throw new Error(`3MF package entry '${name}' exceeds the 64 MB expansion limit`);
    if (/^3D\/.*\.model$/i.test(name)) {
      if (/^3D\/[^/]+\.model$/i.test(name)) hasModel = true;
      if (expanded > THREE_MF_LIMITS.modelBytes) throw new Error("3MF model XML exceeds the 64 MB limit");
    }
    expandedBytes += expanded;
    if (expandedBytes > THREE_MF_LIMITS.expandedBytes) throw new Error("3MF package expands beyond the 128 MB safety limit");
    offset = end;
  }
  if (offset !== centralOffset + centralSize) throw new Error("3MF package directory size is inconsistent");
  if (!hasModel) throw new Error("3MF package is missing its root model");
}

function parseXml(source: string, label: string) {
  if (typeof DOMParser === "undefined") throw new Error("3MF import requires a browser XML parser");
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error(`${label} XML is invalid`);
  return document;
}

function modelTriangleLoad(document: XMLDocument, label: string) {
  const maxTriangles = THREE_MF_LIMITS.loaderTriangles;
  const objects = new Map<string, { triangles: number; components: string[] }>();
  document.querySelectorAll("object").forEach((object, index) => {
    const id = object.getAttribute("id")?.trim();
    if (!id) throw new Error(`${label} contains an object without an ID`);
    if (objects.has(id)) throw new Error(`${label} contains duplicate object ID '${id}'`);
    const components = Array.from(object.querySelectorAll("components component"), (component) => component.getAttribute("objectid")?.trim() ?? "");
    if (components.some((componentId) => !componentId)) throw new Error(`${label} object '${id}' contains an invalid component`);
    const triangles = object.querySelectorAll("mesh triangles triangle").length;
    if (!triangles && !components.length) throw new Error(`${label} object '${id}' has no mesh or components`);
    objects.set(id, { triangles, components });
    if (index > THREE_MF_LIMITS.modelElements) throw new Error(`${label} contains too many objects`);
  });

  const memo = new Map<string, { triangles: number; depth: number }>();
  const visiting = new Set<string>();
  const expandedTriangles = (id: string, depth = 0): number => {
    if (depth > THREE_MF_LIMITS.componentDepth) throw new Error(`${label} component nesting exceeds the supported depth`);
    const known = memo.get(id);
    if (known) {
      if (depth + known.depth > THREE_MF_LIMITS.componentDepth) throw new Error(`${label} component nesting exceeds the supported depth`);
      return known.triangles;
    }
    const object = objects.get(id);
    if (!object) throw new Error(`${label} references missing object '${id}'`);
    if (visiting.has(id)) throw new Error(`${label} contains a cyclic component graph`);
    visiting.add(id);
    let total = object.triangles;
    let subtreeDepth = 0;
    for (const componentId of object.components) {
      total += expandedTriangles(componentId, depth + 1);
      if (total > maxTriangles) throw new Error("3MF component graph exceeds the supported triangle limit");
      subtreeDepth = Math.max(subtreeDepth, (memo.get(componentId)?.depth ?? 0) + 1);
    }
    visiting.delete(id);
    memo.set(id, { triangles: total, depth: subtreeDepth });
    return total;
  };

  let loaderTriangles = 0;
  for (const id of objects.keys()) {
    loaderTriangles += expandedTriangles(id);
    if (loaderTriangles > maxTriangles) throw new Error("3MF component graph exceeds the supported triangle limit");
  }
  document.querySelectorAll("build item").forEach((item) => {
    loaderTriangles += expandedTriangles(item.getAttribute("objectid")?.trim() ?? "");
    if (loaderTriangles > maxTriangles) throw new Error("3MF build exceeds the supported triangle limit");
  });
  return loaderTriangles;
}

function preflight3mfModels(bytes: Uint8Array) {
  const files = unzipSync(bytes, { filter: (file) => /^3D\/.*\.model$/i.test(file.name) || file.name === "_rels/.rels" });
  const modelNames = Object.keys(files).filter((name) => /^3D\/.*\.model$/i.test(name));
  const fallbackRootName = modelNames.find((name) => /^3D\/[^/]+\.model$/i.test(name));
  if (!fallbackRootName) throw new Error("3MF package is missing its root model");
  if (modelNames.length > 1) throw new Error("3MF packages with multiple model parts are not supported");

  let rootModelName = fallbackRootName;
  const relationshipsSource = files["_rels/.rels"] ? strFromU8(files["_rels/.rels"]) : "";
  if (relationshipsSource) {
    const relationships = parseXml(relationshipsSource, "3MF relationships");
    const modelRelationship = Array.from(relationships.querySelectorAll("Relationship")).find((relationship) => (
      relationship.getAttribute("Type")?.toLowerCase().endsWith("/3dmodel")
    ));
    const target = modelRelationship?.getAttribute("Target")?.replace(/^\/+/, "");
    if (target && files[target]) rootModelName = target;
  }

  let modelElementCount = 0;
  let loaderTriangles = 0;
  let rootDocument: XMLDocument | undefined;
  for (const modelName of modelNames) {
    const modelSource = strFromU8(files[modelName]);
    const elementPattern = /<[a-z_][^!?/\s>]*/gi;
    while (elementPattern.exec(modelSource)) {
      modelElementCount += 1;
      if (modelElementCount > THREE_MF_LIMITS.modelElements) throw new Error("3MF model XML is too complex");
    }
    const document = parseXml(modelSource, "3MF model");
    if (document.documentElement.localName.toLowerCase() !== "model") throw new Error("3MF model XML is invalid");
    const requiredExtensions = document.documentElement.getAttribute("requiredextensions")?.trim();
    if (requiredExtensions) throw new Error(`3MF requires unsupported extensions: ${requiredExtensions}`);
    loaderTriangles += modelTriangleLoad(document, `3MF model '${modelName}'`);
    if (loaderTriangles > THREE_MF_LIMITS.loaderTriangles) throw new Error("3MF package exceeds the supported triangle limit");
    if (modelName === rootModelName) rootDocument = document;
  }
  if (!rootDocument) throw new Error("3MF root model relationship is invalid");

  const unit = (rootDocument.documentElement.getAttribute("unit") || "millimeter").toLowerCase();
  const scale = THREE_MF_UNIT_SCALE[unit];
  if (!scale) throw new Error(`3MF uses unsupported unit '${unit}'`);
  return scale;
}

function materialColor(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  for (const candidate of materials) {
    if (!("color" in candidate) || !(candidate.color instanceof THREE.Color)) continue;
    const value = `#${candidate.color.getHexString()}`;
    if (value !== "#ffffff" || candidate.name !== THREE.Loader.DEFAULT_MATERIAL_NAME) return value;
  }
  return undefined;
}

export function importedShapeFrom3mf(fileName: string, buffer: ArrayBuffer): WorkplaneShape {
  const bytes = new Uint8Array(buffer);
  inspect3mfArchive(bytes);
  const unitScale = preflight3mfModels(bytes);
  const root = new ThreeMFLoader().parse(buffer);
  root.updateMatrixWorld(true);
  const rawPositions: number[] = [];
  let color: string | undefined;
  const sourcePoint = new THREE.Vector3();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) return;
    const position = object.geometry.getAttribute("position");
    if (!position || position.itemSize !== 3) return;
    color ??= materialColor(object.material);
    const index = object.geometry.getIndex();
    const cornerCount = index?.count ?? position.count;
    const mirrored = object.matrixWorld.determinant() < 0;
    for (let corner = 0; corner + 2 < cornerCount; corner += 3) {
      if (rawPositions.length + 9 > THREE_MF_LIMITS.meshNumbers) throw new Error("3MF mesh exceeds the supported triangle limit");
      const triangle = [0, 1, 2].map((triangleCorner) => index?.getX(corner + triangleCorner) ?? corner + triangleCorner);
      if (mirrored) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      for (const vertexIndex of triangle) {
        sourcePoint.fromBufferAttribute(position, vertexIndex).applyMatrix4(object.matrixWorld);
        rawPositions.push(sourcePoint.x * unitScale, sourcePoint.z * unitScale, -sourcePoint.y * unitScale);
      }
    }
  });

  if (!rawPositions.length) throw new Error("3MF has no readable mesh triangles");
  const shape = importedShapeFromTriangleSoup(fileName, rawPositions, undefined, "3mf");
  return color ? { ...shape, color } : shape;
}
