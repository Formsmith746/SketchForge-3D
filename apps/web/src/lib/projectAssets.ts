import type { ProjectAsset, ProjectAssetSourceFormat, WorkplaneShape } from "@/types/sketchforge";

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sha256Hex(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure hashing is unavailable in this browser");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", exactArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function sourceFormatForFileName(fileName: string): ProjectAssetSourceFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "stl" || extension === "obj" || extension === "svg") return extension;
  if (extension === "step" || extension === "stp") return "step";
  return null;
}

export function defaultMediaTypeForSource(format: ProjectAssetSourceFormat) {
  if (format === "svg") return "image/svg+xml";
  if (format === "step") return "application/step";
  if (format === "obj") return "model/obj";
  return "model/stl";
}

export async function projectAssetFromBytes(
  name: string,
  sourceFormat: ProjectAssetSourceFormat,
  bytes: Uint8Array,
  mediaType = defaultMediaTypeForSource(sourceFormat),
): Promise<ProjectAsset> {
  const stableBytes = new Uint8Array(bytes);
  const sha256 = await sha256Hex(stableBytes);
  return {
    id: `asset-${sha256.slice(0, 32)}`,
    name: name.trim() || `Imported ${sourceFormat.toUpperCase()}`,
    mediaType: mediaType.trim() || defaultMediaTypeForSource(sourceFormat),
    sourceFormat,
    bytes: stableBytes,
    byteLength: stableBytes.byteLength,
    sha256,
  };
}

export async function projectAssetFromFile(file: File, sourceFormat = sourceFormatForFileName(file.name)) {
  if (!sourceFormat) throw new Error("Unsupported project asset type");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return projectAssetFromBytes(file.name, sourceFormat, bytes, file.type);
}

export function normalizeProjectAsset(value: ProjectAsset): ProjectAsset {
  const candidate = value.bytes as Uint8Array | ArrayBuffer | number[];
  const bytes = candidate instanceof Uint8Array
    ? new Uint8Array(candidate)
    : candidate instanceof ArrayBuffer
      ? new Uint8Array(candidate.slice(0))
      : new Uint8Array(Array.isArray(candidate) ? candidate : []);
  return { ...value, bytes, byteLength: bytes.byteLength };
}

export function dedupeProjectAssets(assets: ProjectAsset[]) {
  const byHash = new Map<string, ProjectAsset>();
  assets.forEach((asset) => {
    const normalized = normalizeProjectAsset(asset);
    if (!byHash.has(normalized.sha256)) byHash.set(normalized.sha256, normalized);
  });
  return [...byHash.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function attachProjectAsset(shape: WorkplaneShape, assetId: string): WorkplaneShape {
  if (!shape.importedMesh) return shape;
  return {
    ...shape,
    importedMesh: {
      ...shape.importedMesh,
      assetId,
    },
  };
}

export function projectAssetIdsInShapes(shapes: WorkplaneShape[]) {
  const ids = new Set<string>();
  const visit = (shape: WorkplaneShape) => {
    if (shape.importedMesh?.assetId) ids.add(shape.importedMesh.assetId);
    shape.groupedShapes?.forEach(visit);
    shape.edgeTreatmentHistory?.forEach((entry) => visit(entry.before));
  };
  shapes.forEach(visit);
  return ids;
}
