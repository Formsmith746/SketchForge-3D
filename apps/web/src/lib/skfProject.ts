import { strFromU8, strToU8, unzip, zip, type AsyncZippable } from "fflate";
import { editorHistoryEntry, hydrateEditorHistoryState, type EditorHistoryEntry } from "@/lib/editorHistory";
import { normalizePlacementWorkplane, placementWorkplaneIsBase, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { importedShapeFromObj } from "@/lib/objImport";
import { normalizeProjectAsset, sha256Hex } from "@/lib/projectAssets";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import { importedShapeFromStl } from "@/lib/stlImport";
import { importedShapeFromSvg } from "@/lib/svgImport";
import { normalizeSnapGrid, normalizeWorkspaceSettings } from "@/lib/workplaneSettings";
import type { GridSize, ProjectAsset, ProjectAssetSourceFormat, SketchOperation, SketchRevolveSettings, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

export const SKF_SCHEMA_ID = "com.sketchforge.project";
export const SKF_FORMAT_VERSION = 1;
export const SKF_MINIMUM_READER_VERSION = 1;
export const SKF_CREATED_WITH_VERSION = "1.0.9";
export const SKF_MEDIA_TYPE = "application/vnd.sketchforge.project+zip";

export const SKF_LIMITS = {
  archiveBytes: 512 * 1024 * 1024,
  expandedBytes: 1024 * 1024 * 1024,
  projectJsonBytes: 64 * 1024 * 1024,
  assetBytes: 256 * 1024 * 1024,
  entries: 4096,
  states: 5001,
  objectsPerState: 100_000,
  features: 300_000,
  meshNumbers: 30_000_000,
} as const;

const SHAPE_KINDS = new Set([
  "box", "cylinder", "sphere", "sketch", "scribble", "cone", "pyramid", "roof", "text", "roundRoof",
  "halfSphere", "torus", "tube", "gear", "ring", "wedge", "polygon", "icosahedron", "mesh",
]);

const FEATURE_TYPES = new Set([
  "group", "boolean-subtraction", "boolean-intersection", "mirror", "sketch-extrusion", "sketch-revolve", "fillet", "chamfer",
]);

type SkfAssetKind = "source" | "derived-mesh" | "brep" | "image";

export type SkfAssetRecordV1 = {
  id: string;
  kind: SkfAssetKind;
  path: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  fileName?: string;
  sourceFormat?: ProjectAssetSourceFormat;
};

export type SkfImportedMeshReferenceV1 = {
  sourceAssetId?: string;
  meshAssetId?: string;
  brepStepAssetId?: string;
  baseWidth: number;
  baseDepth: number;
  baseHeight: number;
  triangleCount: number;
  sourceFormat: NonNullable<WorkplaneShape["importedMesh"]>["sourceFormat"];
};

export type SkfShapeNodeV1 = {
  nodeId: string;
  objectId: string;
  objectType: "native" | "imported" | "group" | "sketch";
  workplaneId: string;
  definition: Record<string, unknown>;
  importedMesh?: SkfImportedMeshReferenceV1;
  groupedShapeNodeIds?: string[];
  edgeTreatmentHistory?: Array<{
    id: string;
    createdAt: number;
    feature: Record<string, unknown>;
    appliedFrame?: Record<string, unknown>;
    beforeNodeId: string;
  }>;
  cadBrepAssetId?: string;
};

export type SkfStateV1 = {
  id: string;
  rootNodeIds: string[];
  nodes: SkfShapeNodeV1[];
};

export type SkfFeatureV1 = {
  id: string;
  type: string;
  outputObjectId: string;
  inputObjectIds: string[];
  dependsOnFeatureIds: string[];
  parameters?: Record<string, unknown>;
};

export type SkfProjectDocumentV1 = {
  schema: typeof SKF_SCHEMA_ID;
  formatVersion: 1;
  minimumReaderVersion: number;
  createdWithVersion: string;
  metadata: {
    projectId?: string;
    projectName: string;
    units: string;
    createdAt: string;
    modifiedAt: string;
  };
  assets: SkfAssetRecordV1[];
  sceneStateId: string;
  states: SkfStateV1[];
  history: {
    entries: Array<{ stateId: string; selectedObjectIds: string[] }>;
    index: number;
  };
  sketches: Array<{ id: string; nodeId: string; objectId: string; operation?: SketchOperation; extrusionDepth: number; revolve?: SketchRevolveSettings }>;
  features: SkfFeatureV1[];
  groups: Array<{ id: string; nodeId: string; objectId: string; memberNodeIds: string[]; operation: string }>;
  workplanes: Array<{ id: string; kind: "base" | "offset"; elevation: number }>;
  exactCad: Array<{ nodeId: string; objectId: string; brepAssetId?: string; importedStepAssetId?: string }>;
  editor: {
    workspace: WorkplaneWorkspaceSettings;
    snapGrid: GridSize;
    selectedWorkplaneId: string;
    placementElevation: number;
    placementWorkplane?: PlacementWorkplane;
    sketchPlacementWorkplane?: PlacementWorkplane;
  };
};

export type SkfProjectExportInput = {
  projectId?: string | null;
  projectName: string;
  createdAt: number;
  modifiedAt: number;
  shapes: WorkplaneShape[];
  history: EditorHistoryEntry[];
  historyIndex: number;
  assets: ProjectAsset[];
  workspace: WorkplaneWorkspaceSettings;
  snapGrid: GridSize;
  placementElevation: number;
  placementWorkplane?: PlacementWorkplane;
  sketchPlacementWorkplane?: PlacementWorkplane;
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
};

export type SkfRestoredProject = {
  sourceProjectId?: string;
  projectName: string;
  createdAt: number;
  modifiedAt: number;
  shapes: WorkplaneShape[];
  history: EditorHistoryEntry[];
  historyIndex: number;
  assets: ProjectAsset[];
  workspace: WorkplaneWorkspaceSettings;
  snapGrid: GridSize;
  placementElevation: number;
  placementWorkplane: PlacementWorkplane;
  sketchPlacementWorkplane: PlacementWorkplane;
  migratedFromVersion?: number;
};

export type SkfProjectPackageSummary = {
  projectName: string;
  createdAt: number;
  modifiedAt: number;
  formatVersion: number;
};

export type SkfSourceImporter = (asset: ProjectAsset) => Promise<NonNullable<WorkplaneShape["importedMesh"]>>;

export type ImportSkfOptions = {
  sourceImporter?: SkfSourceImporter;
};

type ArchiveFiles = Record<string, Uint8Array>;

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`);
  return value;
}

function safeTimestamp(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeIsoTimestamp(value: number, fallback: number) {
  return new Date(safeTimestamp(value, fallback)).toISOString();
}

function parseIsoTimestamp(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} is missing`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function safeNodeToken(value: string) {
  return encodeURIComponent(value).replace(/%/g, "~");
}

function safeArchivePath(path: string) {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.startsWith("\\")
    && !/^[a-z]:/i.test(path)
    && !path.includes("\\")
    && path.split("/").every((part) => part && part !== "." && part !== "..");
}

function extensionForAsset(kind: SkfAssetKind, mediaType: string, sourceFormat?: ProjectAssetSourceFormat) {
  if (kind === "source" && sourceFormat) return sourceFormat === "step" ? "step" : sourceFormat;
  if (kind === "derived-mesh") return "skfmesh";
  if (kind === "brep") return "brep";
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("jpeg")) return "jpg";
  if (mediaType.includes("webp")) return "webp";
  if (mediaType.includes("svg")) return "svg";
  if (mediaType.includes("gif")) return "gif";
  return "bin";
}

function encodeMeshCache(mesh: NonNullable<WorkplaneShape["importedMesh"]>) {
  if (mesh.positions.length > SKF_LIMITS.meshNumbers || (mesh.normals?.length ?? 0) > SKF_LIMITS.meshNumbers) {
    throw new Error("Imported mesh is too large for a SketchForge project file");
  }
  const normalLength = mesh.normals?.length ?? 0;
  const bytes = new Uint8Array(16 + (mesh.positions.length + normalLength) * 8);
  bytes.set(strToU8("SKFMSH1\0"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, mesh.positions.length, true);
  view.setUint32(12, normalLength, true);
  let offset = 16;
  for (const value of mesh.positions) {
    if (!Number.isFinite(value)) throw new Error("Imported mesh contains an invalid coordinate");
    view.setFloat64(offset, value, true);
    offset += 8;
  }
  for (const value of mesh.normals ?? []) {
    if (!Number.isFinite(value)) throw new Error("Imported mesh contains an invalid normal");
    view.setFloat64(offset, value, true);
    offset += 8;
  }
  return bytes;
}

function decodeMeshCache(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || strFromU8(bytes.subarray(0, 8)) !== "SKFMSH1\0") {
    throw new Error("A derived mesh asset has an invalid header");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positionLength = view.getUint32(8, true);
  const normalLength = view.getUint32(12, true);
  if (positionLength > SKF_LIMITS.meshNumbers || normalLength > SKF_LIMITS.meshNumbers) {
    throw new Error("A derived mesh asset exceeds the supported coordinate limit");
  }
  const expected = 16 + (positionLength + normalLength) * 8;
  if (expected !== bytes.byteLength) throw new Error("A derived mesh asset is truncated or malformed");
  const positions = new Array<number>(positionLength);
  const normals = normalLength ? new Array<number>(normalLength) : undefined;
  let offset = 16;
  for (let index = 0; index < positionLength; index += 1) {
    positions[index] = view.getFloat64(offset, true);
    offset += 8;
  }
  for (let index = 0; index < normalLength; index += 1) {
    (normals as number[])[index] = view.getFloat64(offset, true);
    offset += 8;
  }
  return { positions, normals };
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("Embedded image has an invalid data URL");
  const mediaType = match[1] || "application/octet-stream";
  if (match[2]) {
    const binary = globalThis.atob(match[3].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { mediaType, bytes };
  }
  return { mediaType, bytes: strToU8(decodeURIComponent(match[3])) };
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return `data:${mediaType};base64,${globalThis.btoa(binary)}`;
}

class SkfArchiveBuilder {
  readonly files: ArchiveFiles = {};
  readonly assets: SkfAssetRecordV1[] = [];
  readonly sourceIdMap = new Map<string, string>();
  private readonly recordByKindAndHash = new Map<string, SkfAssetRecordV1>();
  private readonly derivedMeshByResource = new WeakMap<object, Promise<SkfAssetRecordV1>>();

  async addAsset(
    kind: SkfAssetKind,
    bytes: Uint8Array,
    mediaType: string,
    options: { fileName?: string; sourceFormat?: ProjectAssetSourceFormat } = {},
  ) {
    if (bytes.byteLength > SKF_LIMITS.assetBytes) throw new Error(`${options.fileName ?? kind} exceeds the per-asset size limit`);
    const sha256 = await sha256Hex(bytes);
    const key = `${kind}:${sha256}`;
    const existing = this.recordByKindAndHash.get(key);
    if (existing) return existing;
    const extension = extensionForAsset(kind, mediaType, options.sourceFormat);
    const id = `${kind}-${sha256.slice(0, 32)}`;
    const path = `assets/${kind}/${sha256}.${extension}`;
    const record: SkfAssetRecordV1 = {
      id,
      kind,
      path,
      mediaType,
      byteLength: bytes.byteLength,
      sha256,
      ...(options.fileName ? { fileName: options.fileName } : {}),
      ...(options.sourceFormat ? { sourceFormat: options.sourceFormat } : {}),
    };
    this.files[path] = bytes;
    this.assets.push(record);
    this.recordByKindAndHash.set(key, record);
    return record;
  }

  async addSources(assets: ProjectAsset[], referencedIds: Set<string>) {
    const normalized = assets
      .filter((asset) => referencedIds.has(asset.id))
      .map(normalizeProjectAsset)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const asset of normalized) {
      const record = await this.addAsset("source", asset.bytes, asset.mediaType, {
        fileName: asset.name,
        sourceFormat: asset.sourceFormat,
      });
      this.sourceIdMap.set(asset.id, record.id);
    }
  }

  addDerivedMesh(mesh: NonNullable<WorkplaneShape["importedMesh"]>) {
    const cached = this.derivedMeshByResource.get(mesh);
    if (cached) return cached;
    const pending = this.addAsset("derived-mesh", encodeMeshCache(mesh), "application/vnd.sketchforge.mesh");
    this.derivedMeshByResource.set(mesh, pending);
    return pending;
  }
}

function assertUniqueRuntimeObjectIds(shapes: WorkplaneShape[], stateLabel: string) {
  const ids = new Set<string>();
  const visit = (shape: WorkplaneShape) => {
    if (!shape.id || ids.has(shape.id)) throw new Error(`${stateLabel} contains duplicate object ID '${shape.id || "(empty)"}'`);
    ids.add(shape.id);
    shape.groupedShapes?.forEach(visit);
  };
  shapes.forEach(visit);
}

function repairDuplicateGroupedObjectIds(shapes: WorkplaneShape[]) {
  const rootIds = new Set<string>();
  for (const shape of shapes) {
    if (!shape.id || rootIds.has(shape.id)) {
      throw new Error(`Project state contains duplicate root object ID '${shape.id || "(empty)"}'`);
    }
    rootIds.add(shape.id);
  }

  const reservedIds = new Set<string>();
  const collectIds = (shape: WorkplaneShape) => {
    if (shape.id) reservedIds.add(shape.id);
    shape.groupedShapes?.forEach(collectIds);
  };
  shapes.forEach(collectIds);

  const seenIds = new Set(rootIds);
  let repairedIndex = 0;
  const freshRepairId = (shape: WorkplaneShape) => {
    let candidate = "";
    do {
      repairedIndex += 1;
      candidate = `${shape.kind || "object"}-repaired-${repairedIndex}`;
    } while (reservedIds.has(candidate) || seenIds.has(candidate));
    reservedIds.add(candidate);
    return candidate;
  };

  const repairChild = (shape: WorkplaneShape): WorkplaneShape => {
    const id = shape.id && !seenIds.has(shape.id) ? shape.id : freshRepairId(shape);
    seenIds.add(id);
    const groupedShapes = shape.groupedShapes?.map(repairChild);
    const childrenChanged = groupedShapes?.some((child, index) => child !== shape.groupedShapes?.[index]) ?? false;
    if (id === shape.id && !childrenChanged) {
      return shape;
    }
    return { ...shape, id, ...(groupedShapes ? { groupedShapes } : {}) };
  };

  return shapes.map((shape) => {
    const groupedShapes = shape.groupedShapes?.map(repairChild);
    const childrenChanged = groupedShapes?.some((child, index) => child !== shape.groupedShapes?.[index]) ?? false;
    return childrenChanged ? { ...shape, groupedShapes } : shape;
  });
}

function referencedSourceAssetIds(states: WorkplaneShape[][]) {
  const ids = new Set<string>();
  const visit = (shape: WorkplaneShape) => {
    if (shape.importedMesh?.assetId) ids.add(shape.importedMesh.assetId);
    shape.groupedShapes?.forEach(visit);
    shape.edgeTreatmentHistory?.forEach((entry) => visit(entry.before));
  };
  states.flat().forEach(visit);
  return ids;
}

async function serializeShapeNode(
  shape: WorkplaneShape,
  nodeId: string,
  nodes: SkfShapeNodeV1[],
  builder: SkfArchiveBuilder,
  sourceAssetsByArchiveId: Map<string, SkfAssetRecordV1>,
): Promise<string> {
  const {
    importedMesh,
    groupedShapes,
    edgeTreatmentHistory,
    cadBrep,
    imagePlate,
    sketchProfile,
    ...baseDefinition
  } = canonicalizeShape(shape);
  const definition: Record<string, unknown> = { ...baseDefinition };

  if (imagePlate) {
    const { dataUrl, ...plateDefinition } = imagePlate;
    const decoded = decodeDataUrl(dataUrl);
    const asset = await builder.addAsset("image", decoded.bytes, decoded.mediaType, { fileName: `${shape.name}-image` });
    definition.imagePlate = { ...plateDefinition, assetId: asset.id };
  }

  if (sketchProfile) {
    const images = await Promise.all((sketchProfile.images ?? []).map(async (image) => {
      const { dataUrl, ...imageDefinition } = image;
      const decoded = decodeDataUrl(dataUrl);
      const asset = await builder.addAsset("image", decoded.bytes, decoded.mediaType, { fileName: image.name });
      return { ...imageDefinition, assetId: asset.id };
    }));
    definition.sketchProfile = {
      points: sketchProfile.points,
      segments: sketchProfile.segments,
      ...(images.length ? { images } : {}),
    };
  }

  let importedReference: SkfImportedMeshReferenceV1 | undefined;
  if (importedMesh) {
    const archiveSourceId = importedMesh.assetId ? builder.sourceIdMap.get(importedMesh.assetId) : undefined;
    const archiveSource = archiveSourceId ? sourceAssetsByArchiveId.get(archiveSourceId) : undefined;
    const canRegenerate = Boolean(
      archiveSource
      && importedMesh.sourceFormat !== "json"
      && archiveSource?.sourceFormat === importedMesh.sourceFormat,
    );
    let meshAssetId: string | undefined;
    let brepStepAssetId: string | undefined;
    if (!canRegenerate) {
      meshAssetId = (await builder.addDerivedMesh(importedMesh)).id;
      if (importedMesh.brepStep) {
        brepStepAssetId = (await builder.addAsset("brep", strToU8(importedMesh.brepStep), "application/step")).id;
      }
    }
    importedReference = {
      ...(canRegenerate && archiveSourceId ? { sourceAssetId: archiveSourceId } : {}),
      ...(meshAssetId ? { meshAssetId } : {}),
      ...(brepStepAssetId ? { brepStepAssetId } : {}),
      baseWidth: importedMesh.baseWidth,
      baseDepth: importedMesh.baseDepth,
      baseHeight: importedMesh.baseHeight,
      triangleCount: importedMesh.triangleCount,
      sourceFormat: importedMesh.sourceFormat,
    };
  }

  let cadBrepAssetId: string | undefined;
  if (cadBrep) cadBrepAssetId = (await builder.addAsset("brep", strToU8(cadBrep), "application/vnd.sketchforge.brep")).id;

  const groupedShapeNodeIds: string[] = [];
  for (const child of groupedShapes ?? []) {
    const childNodeId = `${nodeId}/group/${safeNodeToken(child.id)}`;
    groupedShapeNodeIds.push(await serializeShapeNode(child, childNodeId, nodes, builder, sourceAssetsByArchiveId));
  }

  const serializedEdgeHistory: NonNullable<SkfShapeNodeV1["edgeTreatmentHistory"]> = [];
  for (const entry of edgeTreatmentHistory ?? []) {
    const beforeNodeId = `${nodeId}/edge/${safeNodeToken(entry.id)}/before`;
    await serializeShapeNode(entry.before, beforeNodeId, nodes, builder, sourceAssetsByArchiveId);
    serializedEdgeHistory.push({
      id: entry.id,
      createdAt: entry.createdAt,
      feature: { ...entry.feature },
      ...(entry.appliedFrame ? { appliedFrame: { ...entry.appliedFrame } } : {}),
      beforeNodeId,
    });
  }

  const objectType = groupedShapeNodeIds.length
    ? "group"
    : sketchProfile
      ? "sketch"
    : importedReference
      ? "imported"
      : shape.kind === "sketch"
        ? "sketch"
        : "native";
  nodes.push({
    nodeId,
    objectId: shape.id,
    objectType,
    workplaneId: "base",
    definition,
    ...(importedReference ? { importedMesh: importedReference } : {}),
    ...(groupedShapeNodeIds.length ? { groupedShapeNodeIds } : {}),
    ...(serializedEdgeHistory.length ? { edgeTreatmentHistory: serializedEdgeHistory } : {}),
    ...(cadBrepAssetId ? { cadBrepAssetId } : {}),
  });
  return nodeId;
}

async function serializeState(
  id: string,
  shapes: WorkplaneShape[],
  builder: SkfArchiveBuilder,
  sourceAssetsByArchiveId: Map<string, SkfAssetRecordV1>,
): Promise<SkfStateV1> {
  assertUniqueRuntimeObjectIds(shapes, id);
  const nodes: SkfShapeNodeV1[] = [];
  const rootNodeIds: string[] = [];
  for (const shape of shapes) {
    const nodeId = `${id}/object/${safeNodeToken(shape.id)}`;
    rootNodeIds.push(await serializeShapeNode(shape, nodeId, nodes, builder, sourceAssetsByArchiveId));
  }
  nodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  return { id, rootNodeIds, nodes };
}

function nodeGroupOperation(node: SkfShapeNodeV1, nodeById: Map<string, SkfShapeNodeV1>) {
  if (node.definition.groupOperation === "intersection") return "boolean-intersection";
  const children = (node.groupedShapeNodeIds ?? []).map((id) => nodeById.get(id)).filter(Boolean) as SkfShapeNodeV1[];
  const hasHole = children.some((child) => child.definition.hole === true);
  const hasSolid = children.some((child) => child.definition.hole !== true);
  return hasHole && hasSolid ? "boolean-subtraction" : "group";
}

function activeProjectIndexes(state: SkfStateV1) {
  const nodeById = new Map(state.nodes.map((node) => [node.nodeId, node]));
  const features: SkfFeatureV1[] = [];
  const groups: SkfProjectDocumentV1["groups"] = [];
  const sketches: SkfProjectDocumentV1["sketches"] = [];
  const exactCad: SkfProjectDocumentV1["exactCad"] = [];
  const lastFeatureByNode = new Map<string, string>();
  const visited = new Set<string>();

  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return;
    (node.groupedShapeNodeIds ?? []).forEach(visit);
    let previous: string | undefined;
    if (node.definition.sketchProfile) {
      const operation = node.definition.sketchOperation === "revolve" ? "revolve" : "extrude";
      const featureType = operation === "revolve" ? "sketch-revolve" : "sketch-extrusion";
      const featureId = `feature/${safeNodeToken(node.nodeId)}/${featureType}`;
      features.push({
        id: featureId,
        type: featureType,
        outputObjectId: node.objectId,
        inputObjectIds: [],
        dependsOnFeatureIds: [],
        parameters: operation === "revolve"
          ? { ...(node.definition.sketchRevolve as Record<string, unknown> | undefined), axis: "vertical-sketch-axis", mode: "create" }
          : { depth: node.definition.height, direction: "positive-y", mode: "create" },
      });
      sketches.push({
        id: `sketch/${safeNodeToken(node.objectId)}`,
        nodeId: node.nodeId,
        objectId: node.objectId,
        operation,
        extrusionDepth: operation === "extrude" ? Number(node.definition.height) : 0,
        ...(operation === "revolve" && node.definition.sketchRevolve ? { revolve: node.definition.sketchRevolve as SketchRevolveSettings } : {}),
      });
      previous = featureId;
    }
    if (node.groupedShapeNodeIds?.length) {
      const operation = nodeGroupOperation(node, nodeById);
      const featureId = `feature/${safeNodeToken(node.nodeId)}/${operation}`;
      const dependencies = node.groupedShapeNodeIds.flatMap((childId) => {
        const dependency = lastFeatureByNode.get(childId);
        return dependency ? [dependency] : [];
      });
      features.push({
        id: featureId,
        type: operation,
        outputObjectId: node.objectId,
        inputObjectIds: node.groupedShapeNodeIds.map((childId) => nodeById.get(childId)?.objectId ?? ""),
        dependsOnFeatureIds: dependencies,
      });
      groups.push({
        id: `group/${safeNodeToken(node.objectId)}`,
        nodeId: node.nodeId,
        objectId: node.objectId,
        memberNodeIds: [...node.groupedShapeNodeIds],
        operation,
      });
      previous = featureId;
    }
    const treatments = Array.isArray(node.definition.edgeTreatments) ? node.definition.edgeTreatments as Array<Record<string, unknown>> : [];
    treatments.forEach((treatment, index) => {
      const type = treatment.kind === "fillet" ? "fillet" : "chamfer";
      const featureId = `feature/${safeNodeToken(node.nodeId)}/${type}/${index}`;
      features.push({
        id: featureId,
        type,
        outputObjectId: node.objectId,
        inputObjectIds: [node.objectId],
        dependsOnFeatureIds: previous ? [previous] : [],
        parameters: { ...treatment },
      });
      previous = featureId;
    });
    if (node.definition.mirrorX || node.definition.mirrorY || node.definition.mirrorZ) {
      const featureId = `feature/${safeNodeToken(node.nodeId)}/mirror`;
      features.push({
        id: featureId,
        type: "mirror",
        outputObjectId: node.objectId,
        inputObjectIds: [node.objectId],
        dependsOnFeatureIds: previous ? [previous] : [],
        parameters: { x: Boolean(node.definition.mirrorX), y: Boolean(node.definition.mirrorY), z: Boolean(node.definition.mirrorZ) },
      });
      previous = featureId;
    }
    if (previous) lastFeatureByNode.set(node.nodeId, previous);
    if (node.cadBrepAssetId || node.importedMesh?.sourceAssetId && node.importedMesh.sourceFormat === "step") {
      exactCad.push({
        nodeId: node.nodeId,
        objectId: node.objectId,
        ...(node.cadBrepAssetId ? { brepAssetId: node.cadBrepAssetId } : {}),
        ...(node.importedMesh?.sourceAssetId && node.importedMesh.sourceFormat === "step" ? { importedStepAssetId: node.importedMesh.sourceAssetId } : {}),
      });
    }
  };
  state.rootNodeIds.forEach(visit);
  return { features, groups, sketches, exactCad };
}

function zipAsync(files: AsyncZippable, level: NonNullable<SkfProjectExportInput["compressionLevel"]> = 6) {
  return new Promise<Uint8Array>((resolve, reject) => {
    // fflate encodes the ZIP entry mtime as a DOS date using local-time getters and
    // rejects years outside 1980-2099. A UTC-pinned "1980-01-01T00:00:00Z" rolls back
    // to 1979 in any timezone west of UTC, so build the epoch from local components to
    // keep the year at exactly 1980 everywhere.
    zip(files, { level, mtime: new Date(1980, 0, 1) }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzipAsync(bytes: Uint8Array) {
  return new Promise<ArchiveFiles>((resolve, reject) => {
    unzip(bytes, (error, files) => {
      if (error) reject(error);
      else resolve(files);
    });
  });
}

export async function exportSkfProject(input: SkfProjectExportInput) {
  const hydrated = hydrateEditorHistoryState(input.shapes, input.history, input.historyIndex);
  if (hydrated.entries.length > SKF_LIMITS.states) throw new Error("Project has too many undo states for the .skf format");
  const exportEntries = hydrated.entries.map((entry) =>
    editorHistoryEntry(repairDuplicateGroupedObjectIds(entry.shapes), entry.selectedIds));
  const builder = new SkfArchiveBuilder();
  const stateShapes = exportEntries.map((entry) => entry.shapes);
  await builder.addSources(input.assets, referencedSourceAssetIds(stateShapes));
  const sourceAssetsByArchiveId = new Map(builder.assets.filter((asset) => asset.kind === "source").map((asset) => [asset.id, asset]));
  const states: SkfStateV1[] = [];
  const stateIdByFingerprint = new Map<string, string>();
  const historyEntries: SkfProjectDocumentV1["history"]["entries"] = [];

  for (const entry of exportEntries) {
    let stateId = stateIdByFingerprint.get(entry.fingerprint);
    if (!stateId) {
      stateId = `state-${states.length + 1}`;
      states.push(await serializeState(stateId, entry.shapes, builder, sourceAssetsByArchiveId));
      stateIdByFingerprint.set(entry.fingerprint, stateId);
    }
    historyEntries.push({ stateId, selectedObjectIds: [...entry.selectedIds] });
  }

  const sceneStateId = historyEntries[hydrated.index]?.stateId;
  const activeState = states.find((state) => state.id === sceneStateId);
  if (!activeState) throw new Error("Could not identify the active project state");
  const indexes = activeProjectIndexes(activeState);
  const now = Date.now();
  const placementElevation = Number.isFinite(input.placementElevation) ? input.placementElevation : 0;
  const placementWorkplane = normalizePlacementWorkplane(input.placementWorkplane, placementElevation);
  const sketchPlacementWorkplane = normalizePlacementWorkplane(input.sketchPlacementWorkplane);
  const selectedWorkplaneId = placementWorkplaneIsBase(placementWorkplane) ? "workplane-base" : "workplane-active";
  const document: SkfProjectDocumentV1 = {
    schema: SKF_SCHEMA_ID,
    formatVersion: SKF_FORMAT_VERSION,
    minimumReaderVersion: SKF_MINIMUM_READER_VERSION,
    createdWithVersion: SKF_CREATED_WITH_VERSION,
    metadata: {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      projectName: input.projectName.trim() || "SketchForge design",
      units: normalizeWorkspaceSettings(input.workspace).units,
      createdAt: safeIsoTimestamp(input.createdAt, now),
      modifiedAt: safeIsoTimestamp(input.modifiedAt, now),
    },
    assets: builder.assets.sort((a, b) => a.id.localeCompare(b.id)),
    sceneStateId,
    states,
    history: { entries: historyEntries, index: hydrated.index },
    sketches: indexes.sketches,
    features: indexes.features,
    groups: indexes.groups,
    workplanes: [
      { id: "workplane-base", kind: "base", elevation: 0 },
      ...(selectedWorkplaneId === "workplane-active" ? [{ id: "workplane-active" as const, kind: "offset" as const, elevation: placementElevation }] : []),
    ],
    exactCad: indexes.exactCad,
    editor: {
      workspace: normalizeWorkspaceSettings(input.workspace),
      snapGrid: normalizeSnapGrid(input.snapGrid),
      selectedWorkplaneId,
      placementElevation,
      placementWorkplane,
      sketchPlacementWorkplane,
    },
  };
  const projectJson = strToU8(JSON.stringify(document));
  if (projectJson.byteLength > SKF_LIMITS.projectJsonBytes) {
    throw new Error("Project data exceeds the 64 MB .skf limit. Export with fewer history steps or simplify the project.");
  }
  builder.files["project.json"] = projectJson;
  return zipAsync(Object.fromEntries(Object.entries(builder.files).sort(([a], [b]) => a.localeCompare(b))), input.compressionLevel);
}

function inspectZipBeforeExpansion(bytes: Uint8Array) {
  if (bytes.byteLength > SKF_LIMITS.archiveBytes) throw new Error(".skf file exceeds the 512 MB archive limit");
  if (bytes.byteLength < 22) throw new Error(".skf file is not a valid package");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error(".skf package is missing its ZIP directory");
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 .skf packages are not supported");
  }
  if (entryCount === 0 || entryCount > SKF_LIMITS.entries) throw new Error(".skf package has an invalid number of files");
  if (centralOffset + centralSize > bytes.byteLength) throw new Error(".skf package directory is truncated");
  let offset = centralOffset;
  let expandedBytes = 0;
  let hasProject = false;
  const names = new Set<string>();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error(".skf package directory is malformed");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) throw new Error(".skf package directory entry is truncated");
    if (flags & 1) throw new Error("Encrypted .skf packages are not supported");
    if (method !== 0 && method !== 8) throw new Error(".skf package uses an unsupported compression method");
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeArchivePath(name) || names.has(name)) throw new Error(".skf package contains an unsafe or duplicate file path");
    names.add(name);
    if (expanded > SKF_LIMITS.assetBytes && name !== "project.json") throw new Error(`Asset '${name}' exceeds the expansion limit`);
    if (name === "project.json") {
      hasProject = true;
      if (expanded > SKF_LIMITS.projectJsonBytes) throw new Error("project.json exceeds the supported size limit");
    }
    expandedBytes += expanded;
    if (expandedBytes > SKF_LIMITS.expandedBytes) throw new Error(".skf package expands beyond the 1 GB safety limit");
    offset = end;
  }
  if (!hasProject) throw new Error(".skf package is missing project.json");
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) throw new Error(`${label} must be a string array`);
  return value as string[];
}

function validateSketchProfile(value: unknown, label: string) {
  const profile = objectRecord(value, label);
  if (!Array.isArray(profile.points) || !Array.isArray(profile.segments)) throw new Error(`${label} is missing points or segments`);
  const pointIds = new Set<string>();
  profile.points.forEach((rawPoint, index) => {
    const point = objectRecord(rawPoint, `${label}.points[${index}]`);
    const id = stringValue(point.id, `${label}.points[${index}].id`);
    if (pointIds.has(id)) throw new Error(`${label} contains duplicate point ID '${id}'`);
    pointIds.add(id);
    finiteNumber(point.x, `${label}.points[${index}].x`);
    finiteNumber(point.z, `${label}.points[${index}].z`);
  });
  const segmentIds = new Set<string>();
  profile.segments.forEach((rawSegment, index) => {
    const segment = objectRecord(rawSegment, `${label}.segments[${index}]`);
    const id = stringValue(segment.id, `${label}.segments[${index}].id`);
    if (segmentIds.has(id)) throw new Error(`${label} contains duplicate segment ID '${id}'`);
    segmentIds.add(id);
    const startId = stringValue(segment.startId, `${label}.segments[${index}].startId`);
    const endId = stringValue(segment.endId, `${label}.segments[${index}].endId`);
    if (!pointIds.has(startId) || !pointIds.has(endId)) throw new Error(`${label} contains a segment with a missing point reference`);
  });
}

function validateShapeDefinition(definition: Record<string, unknown>, label: string) {
  const id = stringValue(definition.id, `${label}.id`);
  stringValue(definition.name, `${label}.name`);
  const kind = stringValue(definition.kind, `${label}.kind`);
  if (!SHAPE_KINDS.has(kind)) throw new Error(`${label} has unknown shape type '${kind}'`);
  stringValue(definition.color, `${label}.color`);
  ["x", "z", "size", "width", "depth", "height", "rotation"].forEach((field) => finiteNumber(definition[field], `${label}.${field}`));
  if ((definition.width as number) <= 0 || (definition.depth as number) <= 0 || (definition.height as number) <= 0) {
    throw new Error(`${label} has non-positive dimensions`);
  }
  if ([definition.width, definition.depth, definition.height].some((value) => Math.abs(value as number) > 1e9)) {
    throw new Error(`${label} dimensions exceed the supported range`);
  }
  if (definition.importedMesh || definition.groupedShapes || definition.edgeTreatmentHistory || definition.cadBrep) {
    throw new Error(`${label} contains inline package-only geometry fields`);
  }
  if (definition.sketchProfile) validateSketchProfile(definition.sketchProfile, `${label}.sketchProfile`);
  if (definition.sketchOperation !== undefined && definition.sketchOperation !== "extrude" && definition.sketchOperation !== "revolve") {
    throw new Error(`${label}.sketchOperation is invalid`);
  }
  if (definition.sketchRevolve !== undefined) {
    const settings = objectRecord(definition.sketchRevolve, `${label}.sketchRevolve`);
    ["startAngle", "sweepAngle", "sides", "quality"].forEach((field) => finiteNumber(settings[field], `${label}.sketchRevolve.${field}`));
  }
  if (kind === "gear") {
    const teeth = finiteNumber(definition.teeth, `${label}.teeth`);
    if (!Number.isInteger(teeth) || teeth < 6 || teeth > 64) throw new Error(`${label}.teeth is outside the supported range`);
    const toothSize = finiteNumber(definition.toothSize, `${label}.toothSize`);
    if (toothSize <= 0) throw new Error(`${label}.toothSize must be positive`);
    if (definition.toothWidth !== undefined) {
      const toothWidth = finiteNumber(definition.toothWidth, `${label}.toothWidth`);
      if (toothWidth <= 0) throw new Error(`${label}.toothWidth must be positive`);
    }
    if (definition.centerHoleSize !== undefined) {
      const centerHoleSize = finiteNumber(definition.centerHoleSize, `${label}.centerHoleSize`);
      if (centerHoleSize < 0) throw new Error(`${label}.centerHoleSize cannot be negative`);
    }
    if (!["spur", "helical", "bevel"].includes(definition.gearType as string)) throw new Error(`${label}.gearType is invalid`);
    if (definition.helixAngle !== undefined) {
      const helixAngle = finiteNumber(definition.helixAngle, `${label}.helixAngle`);
      if (helixAngle < -45 || helixAngle > 45) throw new Error(`${label}.helixAngle is outside the supported range`);
    }
    if (definition.helixQuality !== undefined) {
      const helixQuality = finiteNumber(definition.helixQuality, `${label}.helixQuality`);
      if (!Number.isInteger(helixQuality) || helixQuality < 4 || helixQuality > 32) {
        throw new Error(`${label}.helixQuality is outside the supported range`);
      }
    }
  }
  return id;
}

function validateFeatureGraph(features: unknown, activeObjectIds: Set<string>) {
  if (!Array.isArray(features) || features.length > SKF_LIMITS.features) throw new Error("features is invalid or too large");
  const byId = new Map<string, Record<string, unknown>>();
  features.forEach((rawFeature, index) => {
    const feature = objectRecord(rawFeature, `features[${index}]`);
    const id = stringValue(feature.id, `features[${index}].id`);
    if (byId.has(id)) throw new Error(`Duplicate feature ID '${id}'`);
    const type = stringValue(feature.type, `features[${index}].type`);
    if (!FEATURE_TYPES.has(type)) throw new Error(`Unknown operation type '${type}'`);
    const output = stringValue(feature.outputObjectId, `features[${index}].outputObjectId`);
    if (!activeObjectIds.has(output)) throw new Error(`Feature '${id}' references missing output object '${output}'`);
    stringArray(feature.inputObjectIds, `features[${index}].inputObjectIds`).forEach((input) => {
      if (!activeObjectIds.has(input)) throw new Error(`Feature '${id}' references missing input object '${input}'`);
    });
    stringArray(feature.dependsOnFeatureIds, `features[${index}].dependsOnFeatureIds`);
    byId.set(id, feature);
  });
  byId.forEach((feature, id) => {
    (feature.dependsOnFeatureIds as string[]).forEach((dependency) => {
      if (!byId.has(dependency)) throw new Error(`Feature '${id}' references missing dependency '${dependency}'`);
    });
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Cyclic feature dependency detected at '${id}'`);
    if (visited.has(id)) return;
    visiting.add(id);
    ((byId.get(id)?.dependsOnFeatureIds as string[] | undefined) ?? []).forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  byId.forEach((_feature, id) => visit(id));
}

async function validateDocumentAndAssets(raw: unknown, files: ArchiveFiles) {
  const document = objectRecord(raw, "project.json") as unknown as SkfProjectDocumentV1;
  if (document.schema !== SKF_SCHEMA_ID) throw new Error("This file is not a SketchForge project");
  if (!Number.isInteger(document.formatVersion)) throw new Error("SketchForge formatVersion is missing");
  if (document.formatVersion > SKF_FORMAT_VERSION) {
    throw new Error(`This project uses .skf format ${document.formatVersion}, which requires a newer SketchForge version`);
  }
  if (document.formatVersion < SKF_FORMAT_VERSION) throw new Error(`Packaged .skf format ${document.formatVersion} requires migration support that is not available`);
  if (!Number.isInteger(document.minimumReaderVersion) || document.minimumReaderVersion > SKF_FORMAT_VERSION) {
    throw new Error("This project requires a newer SketchForge reader and was not opened");
  }
  const metadata = objectRecord(document.metadata, "metadata");
  stringValue(metadata.projectName, "metadata.projectName");
  parseIsoTimestamp(metadata.createdAt, "metadata.createdAt");
  parseIsoTimestamp(metadata.modifiedAt, "metadata.modifiedAt");
  if (!Array.isArray(document.assets) || !Array.isArray(document.states) || !Array.isArray(document.history?.entries)) {
    throw new Error("project.json is missing assets, states, or history");
  }
  if (document.states.length === 0 || document.states.length > SKF_LIMITS.states) throw new Error("Project contains an invalid number of states");

  const assetById = new Map<string, SkfAssetRecordV1>();
  const assetPaths = new Set<string>();
  for (let index = 0; index < document.assets.length; index += 1) {
    const asset = document.assets[index];
    const id = stringValue(asset?.id, `assets[${index}].id`);
    if (assetById.has(id)) throw new Error(`Duplicate asset ID '${id}'`);
    if (!asset || !["source", "derived-mesh", "brep", "image"].includes(asset.kind)) throw new Error(`Asset '${id}' has an unknown type`);
    if (!safeArchivePath(asset.path) || assetPaths.has(asset.path)) throw new Error(`Asset '${id}' has an unsafe or duplicate path`);
    assetPaths.add(asset.path);
    const bytes = files[asset.path];
    if (!bytes) throw new Error(`Missing asset '${asset.path}'`);
    if (bytes.byteLength !== asset.byteLength) throw new Error(`Asset '${asset.path}' has an invalid size`);
    const hash = await sha256Hex(bytes);
    if (hash !== asset.sha256) throw new Error(`Asset '${asset.path}' failed its integrity check`);
    if (asset.kind === "source" && !["stl", "obj", "svg", "step"].includes(asset.sourceFormat ?? "")) {
      throw new Error(`Source asset '${id}' has an unknown source format`);
    }
    assetById.set(id, asset);
  }

  const stateById = new Map<string, SkfStateV1>();
  const activeObjectIds = new Set<string>();
  for (let stateIndex = 0; stateIndex < document.states.length; stateIndex += 1) {
    const state = document.states[stateIndex];
    const stateId = stringValue(state?.id, `states[${stateIndex}].id`);
    if (stateById.has(stateId)) throw new Error(`Duplicate state ID '${stateId}'`);
    if (!Array.isArray(state.nodes) || state.nodes.length > SKF_LIMITS.objectsPerState) throw new Error(`State '${stateId}' has too many objects`);
    const nodeById = new Map<string, SkfShapeNodeV1>();
    state.nodes.forEach((node, nodeIndex) => {
      const nodeId = stringValue(node?.nodeId, `states[${stateIndex}].nodes[${nodeIndex}].nodeId`);
      if (nodeById.has(nodeId)) throw new Error(`State '${stateId}' contains duplicate node ID '${nodeId}'`);
      const definition = objectRecord(node.definition, `node '${nodeId}'.definition`);
      const objectId = validateShapeDefinition(definition, `node '${nodeId}'`);
      if (node.objectId !== objectId) throw new Error(`Node '${nodeId}' objectId does not match its shape definition`);
      if (node.importedMesh) {
        const source = node.importedMesh.sourceAssetId ? assetById.get(node.importedMesh.sourceAssetId) : undefined;
        const mesh = node.importedMesh.meshAssetId ? assetById.get(node.importedMesh.meshAssetId) : undefined;
        if (!source && !mesh) throw new Error(`Imported object '${objectId}' is missing its source or mesh asset`);
        if (source && source.kind !== "source" || mesh && mesh.kind !== "derived-mesh") throw new Error(`Imported object '${objectId}' has an invalid asset reference`);
        if (node.importedMesh.brepStepAssetId && assetById.get(node.importedMesh.brepStepAssetId)?.kind !== "brep") throw new Error(`Imported object '${objectId}' has a missing STEP B-Rep asset`);
        ["baseWidth", "baseDepth", "baseHeight", "triangleCount"].forEach((field) => finiteNumber(node.importedMesh?.[field as keyof SkfImportedMeshReferenceV1], `object '${objectId}'.${field}`));
      }
      if (node.cadBrepAssetId && assetById.get(node.cadBrepAssetId)?.kind !== "brep") throw new Error(`Object '${objectId}' has a missing exact B-Rep asset`);
      nodeById.set(nodeId, node);
    });
    const roots = stringArray(state.rootNodeIds, `state '${stateId}'.rootNodeIds`);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const primaryObjectIds = new Set<string>();
    const walk = (nodeId: string, primary: boolean) => {
      if (visiting.has(nodeId)) throw new Error(`Cyclic group or history reference detected at '${nodeId}'`);
      if (visited.has(`${primary ? "primary" : "history"}:${nodeId}`)) return;
      const node = nodeById.get(nodeId);
      if (!node) throw new Error(`State '${stateId}' references missing node '${nodeId}'`);
      visiting.add(nodeId);
      if (primary) {
        if (primaryObjectIds.has(node.objectId)) throw new Error(`State '${stateId}' contains duplicate object ID '${node.objectId}'`);
        primaryObjectIds.add(node.objectId);
      }
      (node.groupedShapeNodeIds ?? []).forEach((child) => walk(child, primary));
      (node.edgeTreatmentHistory ?? []).forEach((entry) => walk(entry.beforeNodeId, false));
      visiting.delete(nodeId);
      visited.add(`${primary ? "primary" : "history"}:${nodeId}`);
    };
    roots.forEach((root) => walk(root, true));
    if (stateId === document.sceneStateId) primaryObjectIds.forEach((id) => activeObjectIds.add(id));
    stateById.set(stateId, state);
  }
  if (!stateById.has(document.sceneStateId)) throw new Error("Active scene state is missing");
  if (!Number.isInteger(document.history.index) || document.history.index < 0 || document.history.index >= document.history.entries.length) {
    throw new Error("Undo history index is invalid");
  }
  document.history.entries.forEach((entry, index) => {
    if (!stateById.has(entry.stateId)) throw new Error(`History entry ${index} references missing state '${entry.stateId}'`);
    stringArray(entry.selectedObjectIds, `history.entries[${index}].selectedObjectIds`);
  });
  if (document.history.entries[document.history.index]?.stateId !== document.sceneStateId) throw new Error("Active scene and undo history index do not match");
  validateFeatureGraph(document.features, activeObjectIds);
  const editor = objectRecord(document.editor, "editor");
  finiteNumber(editor.placementElevation, "editor.placementElevation");
  for (const fieldName of ["placementWorkplane", "sketchPlacementWorkplane"] as const) {
    if (editor[fieldName] === undefined) continue;
    const workplane = objectRecord(editor[fieldName], `editor.${fieldName}`);
    for (const field of ["origin", "normal", "xAxis", "zAxis"] as const) {
      const coordinates = objectRecord(workplane[field], `editor.${fieldName}.${field}`);
      finiteNumber(coordinates.x, `editor.${fieldName}.${field}.x`);
      finiteNumber(coordinates.y, `editor.${fieldName}.${field}.y`);
      finiteNumber(coordinates.z, `editor.${fieldName}.${field}.z`);
    }
  }
  return { document, assetById, stateById };
}

async function defaultSourceImporter(asset: ProjectAsset) {
  if (asset.sourceFormat === "stl") return importedShapeFromStl(asset.name, exactArrayBuffer(asset.bytes)).importedMesh as NonNullable<WorkplaneShape["importedMesh"]>;
  if (asset.sourceFormat === "obj") return importedShapeFromObj(asset.name, strFromU8(asset.bytes)).importedMesh as NonNullable<WorkplaneShape["importedMesh"]>;
  if (asset.sourceFormat === "svg") return importedShapeFromSvg(asset.name, strFromU8(asset.bytes)).importedMesh as NonNullable<WorkplaneShape["importedMesh"]>;
  if (asset.sourceFormat === "step") {
    const { importedShapeFromStep } = await import("@/lib/stepImport");
    return (await importedShapeFromStep(asset.name, exactArrayBuffer(asset.bytes))).importedMesh as NonNullable<WorkplaneShape["importedMesh"]>;
  }
  throw new Error("SketchForge cannot reconstruct this source asset format");
}

async function restoreShapeFromNode(
  nodeId: string,
  nodeById: Map<string, SkfShapeNodeV1>,
  assetById: Map<string, SkfAssetRecordV1>,
  files: ArchiveFiles,
  runtimeAssetByArchiveId: Map<string, ProjectAsset>,
  sourceMeshCache: Map<string, Promise<NonNullable<WorkplaneShape["importedMesh"]>>>,
  derivedMeshCache: Map<string, ReturnType<typeof decodeMeshCache>>,
  sourceImporter: SkfSourceImporter,
  restoring = new Set<string>(),
): Promise<WorkplaneShape> {
  if (restoring.has(nodeId)) throw new Error(`Cyclic shape dependency detected at '${nodeId}'`);
  const node = nodeById.get(nodeId);
  if (!node) throw new Error(`Missing shape node '${nodeId}'`);
  restoring.add(nodeId);
  const definition = { ...node.definition } as Record<string, unknown>;
  const serializedPlate = definition.imagePlate as (Record<string, unknown> & { assetId?: string }) | undefined;
  if (serializedPlate?.assetId) {
    const record = assetById.get(serializedPlate.assetId);
    if (!record || record.kind !== "image") throw new Error(`Object '${node.objectId}' has a missing image asset`);
    const { assetId: _assetId, ...plate } = serializedPlate;
    definition.imagePlate = { ...plate, dataUrl: bytesToDataUrl(files[record.path], record.mediaType) };
  }
  const serializedProfile = definition.sketchProfile as (Record<string, unknown> & { images?: Array<Record<string, unknown> & { assetId?: string }> }) | undefined;
  if (serializedProfile?.images) {
    definition.sketchProfile = {
      ...serializedProfile,
      images: serializedProfile.images.map((image) => {
        const record = image.assetId ? assetById.get(image.assetId) : undefined;
        if (!record || record.kind !== "image") throw new Error(`Sketch '${node.objectId}' has a missing image asset`);
        const { assetId: _assetId, ...rest } = image;
        return { ...rest, dataUrl: bytesToDataUrl(files[record.path], record.mediaType) };
      }),
    };
  }

  let importedMesh: WorkplaneShape["importedMesh"];
  if (node.importedMesh?.sourceAssetId) {
    const sourceAsset = runtimeAssetByArchiveId.get(node.importedMesh.sourceAssetId);
    if (!sourceAsset) throw new Error(`Object '${node.objectId}' is missing its imported source asset`);
    let promise = sourceMeshCache.get(sourceAsset.id);
    if (!promise) {
      promise = sourceImporter(sourceAsset);
      sourceMeshCache.set(sourceAsset.id, promise);
    }
    const regenerated = await promise;
    importedMesh = { ...regenerated, assetId: sourceAsset.id };
  } else if (node.importedMesh?.meshAssetId) {
    const meshRecord = assetById.get(node.importedMesh.meshAssetId);
    if (!meshRecord) throw new Error(`Object '${node.objectId}' is missing its derived mesh`);
    let decoded = derivedMeshCache.get(meshRecord.id);
    if (!decoded) {
      decoded = decodeMeshCache(files[meshRecord.path]);
      derivedMeshCache.set(meshRecord.id, decoded);
    }
    const brepRecord = node.importedMesh.brepStepAssetId ? assetById.get(node.importedMesh.brepStepAssetId) : undefined;
    importedMesh = {
      ...decoded,
      baseWidth: node.importedMesh.baseWidth,
      baseDepth: node.importedMesh.baseDepth,
      baseHeight: node.importedMesh.baseHeight,
      triangleCount: node.importedMesh.triangleCount,
      sourceFormat: node.importedMesh.sourceFormat,
      ...(brepRecord ? { brepStep: strFromU8(files[brepRecord.path]) } : {}),
    };
  }

  const groupedShapes = node.groupedShapeNodeIds?.length
    ? await Promise.all(node.groupedShapeNodeIds.map((childId) => restoreShapeFromNode(childId, nodeById, assetById, files, runtimeAssetByArchiveId, sourceMeshCache, derivedMeshCache, sourceImporter, new Set(restoring))))
    : undefined;
  const edgeTreatmentHistory = node.edgeTreatmentHistory?.length
    ? await Promise.all(node.edgeTreatmentHistory.map(async (entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        feature: entry.feature as NonNullable<WorkplaneShape["edgeTreatmentHistory"]>[number]["feature"],
        before: await restoreShapeFromNode(entry.beforeNodeId, nodeById, assetById, files, runtimeAssetByArchiveId, sourceMeshCache, derivedMeshCache, sourceImporter, new Set(restoring)),
        ...(entry.appliedFrame ? { appliedFrame: entry.appliedFrame as NonNullable<WorkplaneShape["edgeTreatmentHistory"]>[number]["appliedFrame"] } : {}),
      })))
    : undefined;
  const cadBrepRecord = node.cadBrepAssetId ? assetById.get(node.cadBrepAssetId) : undefined;
  restoring.delete(nodeId);
  return canonicalizeShape({
    ...(definition as WorkplaneShape),
    ...(importedMesh ? { importedMesh } : {}),
    ...(groupedShapes ? { groupedShapes } : {}),
    ...(edgeTreatmentHistory ? { edgeTreatmentHistory } : {}),
    ...(cadBrepRecord ? { cadBrep: strFromU8(files[cadBrepRecord.path]) } : {}),
  });
}

async function restoreV1(document: SkfProjectDocumentV1, assetById: Map<string, SkfAssetRecordV1>, stateById: Map<string, SkfStateV1>, files: ArchiveFiles, options: ImportSkfOptions) {
  const runtimeAssetByArchiveId = new Map<string, ProjectAsset>();
  for (const record of document.assets.filter((asset) => asset.kind === "source")) {
    const bytes = new Uint8Array(files[record.path]);
    const asset: ProjectAsset = normalizeProjectAsset({
      id: record.id,
      name: record.fileName ?? `Imported ${record.sourceFormat?.toUpperCase() ?? "asset"}`,
      mediaType: record.mediaType,
      sourceFormat: record.sourceFormat as ProjectAssetSourceFormat,
      bytes,
      byteLength: bytes.byteLength,
      sha256: record.sha256,
    });
    runtimeAssetByArchiveId.set(record.id, asset);
  }
  const sourceMeshCache = new Map<string, Promise<NonNullable<WorkplaneShape["importedMesh"]>>>();
  const derivedMeshCache = new Map<string, ReturnType<typeof decodeMeshCache>>();
  const sourceImporter = options.sourceImporter ?? defaultSourceImporter;
  const restoredStates = new Map<string, WorkplaneShape[]>();
  for (const state of document.states) {
    const nodeById = new Map(state.nodes.map((node) => [node.nodeId, node]));
    const shapes = await Promise.all(state.rootNodeIds.map((nodeId) => restoreShapeFromNode(
      nodeId,
      nodeById,
      assetById,
      files,
      runtimeAssetByArchiveId,
      sourceMeshCache,
      derivedMeshCache,
      sourceImporter,
    )));
    restoredStates.set(state.id, shapes);
  }
  const history = document.history.entries.map((entry) => editorHistoryEntry(restoredStates.get(entry.stateId) ?? [], entry.selectedObjectIds));
  const shapes = restoredStates.get(document.sceneStateId) ?? [];
  const hydrated = hydrateEditorHistoryState(shapes, history, document.history.index);
  if (hydrated.entries.length !== history.length || hydrated.index !== document.history.index) throw new Error("Undo history could not be restored without data loss");
  return {
    sourceProjectId: document.metadata.projectId,
    projectName: document.metadata.projectName,
    createdAt: parseIsoTimestamp(document.metadata.createdAt, "metadata.createdAt"),
    modifiedAt: parseIsoTimestamp(document.metadata.modifiedAt, "metadata.modifiedAt"),
    shapes: hydrated.entries[hydrated.index]?.shapes ?? shapes,
    history: hydrated.entries,
    historyIndex: hydrated.index,
    assets: [...runtimeAssetByArchiveId.values()],
    workspace: normalizeWorkspaceSettings(document.editor.workspace),
    snapGrid: normalizeSnapGrid(document.editor.snapGrid),
    placementElevation: document.editor.placementElevation,
    placementWorkplane: normalizePlacementWorkplane(document.editor.placementWorkplane, document.editor.placementElevation),
    sketchPlacementWorkplane: normalizePlacementWorkplane(document.editor.sketchPlacementWorkplane),
  } satisfies SkfRestoredProject;
}

function migrateV0(raw: Record<string, unknown>): SkfRestoredProject {
  const project = objectRecord(raw.project, "project");
  const shapes = Array.isArray(raw.shapes) ? raw.shapes as WorkplaneShape[] : [];
  assertUniqueRuntimeObjectIds(shapes, "Legacy project");
  shapes.forEach((shape, index) => validateLegacyRuntimeShape(shape, `shapes[${index}]`));
  const historyRaw = Array.isArray(raw.history) ? raw.history as EditorHistoryEntry[] : undefined;
  const requestedIndex = typeof raw.historyIndex === "number" ? raw.historyIndex : undefined;
  const hydrated = hydrateEditorHistoryState(shapes.map(canonicalizeShape), historyRaw, requestedIndex);
  const now = Date.now();
  return {
    sourceProjectId: typeof project.id === "string" ? project.id : undefined,
    projectName: typeof project.name === "string" && project.name.trim() ? project.name : "Imported SketchForge project",
    createdAt: safeTimestamp(typeof project.createdAt === "number" ? project.createdAt : now, now),
    modifiedAt: safeTimestamp(typeof project.modifiedAt === "number" ? project.modifiedAt : now, now),
    shapes: hydrated.entries[hydrated.index]?.shapes ?? shapes,
    history: hydrated.entries,
    historyIndex: hydrated.index,
    assets: [],
    workspace: normalizeWorkspaceSettings(raw.workspace),
    snapGrid: normalizeSnapGrid(raw.snapGrid),
    placementElevation: typeof raw.placementElevation === "number" && Number.isFinite(raw.placementElevation) ? raw.placementElevation : 0,
    placementWorkplane: normalizePlacementWorkplane(
      raw.placementWorkplane,
      typeof raw.placementElevation === "number" && Number.isFinite(raw.placementElevation) ? raw.placementElevation : 0,
    ),
    sketchPlacementWorkplane: normalizePlacementWorkplane(raw.sketchPlacementWorkplane),
    migratedFromVersion: 0,
  };
}

function validateLegacyRuntimeShape(shape: WorkplaneShape, label: string) {
  const definition = { ...shape } as Record<string, unknown>;
  const importedMesh = definition.importedMesh;
  const groupedShapes = definition.groupedShapes;
  const edgeHistory = definition.edgeTreatmentHistory;
  const cadBrep = definition.cadBrep;
  delete definition.importedMesh;
  delete definition.groupedShapes;
  delete definition.edgeTreatmentHistory;
  delete definition.cadBrep;
  validateShapeDefinition(definition, label);
  if (importedMesh) {
    const mesh = objectRecord(importedMesh, `${label}.importedMesh`);
    if (!Array.isArray(mesh.positions) || mesh.positions.length > SKF_LIMITS.meshNumbers || mesh.positions.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`${label}.importedMesh has invalid positions`);
    }
  }
  if (Array.isArray(groupedShapes)) groupedShapes.forEach((child, index) => validateLegacyRuntimeShape(child as WorkplaneShape, `${label}.groupedShapes[${index}]`));
  if (Array.isArray(edgeHistory)) edgeHistory.forEach((entry, index) => validateLegacyRuntimeShape((entry as { before: WorkplaneShape }).before, `${label}.edgeTreatmentHistory[${index}].before`));
  if (cadBrep !== undefined && typeof cadBrep !== "string") throw new Error(`${label}.cadBrep is invalid`);
}

function skfInputBytes(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input.slice(0));
  if (!bytes.byteLength) throw new Error(".skf file is empty");
  return bytes;
}

async function readPackagedSkf(bytes: Uint8Array) {
  inspectZipBeforeExpansion(bytes);
  let files: ArchiveFiles;
  try {
    files = await unzipAsync(bytes);
  } catch (error) {
    throw new Error(`Could not expand .skf package: ${error instanceof Error ? error.message : "corrupt ZIP data"}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(files["project.json"]));
  } catch {
    throw new Error("project.json is malformed");
  }
  return { files, validated: await validateDocumentAndAssets(raw, files) };
}

export async function inspectSkfProjectPackage(input: ArrayBuffer | Uint8Array): Promise<SkfProjectPackageSummary> {
  const bytes = skfInputBytes(input);
  const prefix = strFromU8(bytes.subarray(0, Math.min(bytes.length, 64))).trimStart();
  if (prefix.startsWith("{")) throw new Error("Shared storage accepts packaged .skf files, not legacy JSON projects");
  const { validated } = await readPackagedSkf(bytes);
  return {
    projectName: validated.document.metadata.projectName,
    createdAt: Date.parse(validated.document.metadata.createdAt),
    modifiedAt: Date.parse(validated.document.metadata.modifiedAt),
    formatVersion: validated.document.formatVersion,
  };
}

export async function importSkfProject(input: ArrayBuffer | Uint8Array, options: ImportSkfOptions = {}): Promise<SkfRestoredProject> {
  const bytes = skfInputBytes(input);
  const prefix = strFromU8(bytes.subarray(0, Math.min(bytes.length, 64))).trimStart();
  if (prefix.startsWith("{")) {
    if (bytes.byteLength > SKF_LIMITS.projectJsonBytes) throw new Error("Legacy .skf JSON exceeds the supported size limit");
    let raw: unknown;
    try {
      raw = JSON.parse(strFromU8(bytes));
    } catch {
      throw new Error("Legacy .skf JSON is malformed");
    }
    const document = objectRecord(raw, "Legacy .skf project");
    if (document.schema !== SKF_SCHEMA_ID) throw new Error("This file is not a SketchForge project");
    if (document.formatVersion === 0) return migrateV0(document);
    if (typeof document.formatVersion === "number" && document.formatVersion > SKF_FORMAT_VERSION) {
      throw new Error(`This project uses .skf format ${document.formatVersion}, which requires a newer SketchForge version`);
    }
    throw new Error("This legacy .skf version is not supported");
  }

  const { files, validated } = await readPackagedSkf(bytes);
  return restoreV1(validated.document, validated.assetById, validated.stateById, files, options);
}
