import type { ProjectAsset, ProjectAssetSourceFormat, WorkplaneShape } from "@/types/sketchforge";

export const MAX_PROJECT_ASSET_BYTES = 256 * 1024 * 1024;

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256HexFallback(bytes: Uint8Array) {
  const state = new Uint32Array(SHA256_INITIAL_STATE);
  const words = new Uint32Array(64);

  const compress = (source: Uint8Array, offset: number) => {
    for (let index = 0; index < 16; index += 1) {
      const wordOffset = offset + index * 4;
      words[index] = (
        (source[wordOffset] << 24)
        | (source[wordOffset + 1] << 16)
        | (source[wordOffset + 2] << 8)
        | source[wordOffset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  };

  let offset = 0;
  while (offset + 64 <= bytes.byteLength) {
    compress(bytes, offset);
    offset += 64;
  }

  const remaining = bytes.byteLength - offset;
  const tailLength = remaining < 56 ? 64 : 128;
  const tail = new Uint8Array(tailLength);
  tail.set(bytes.subarray(offset));
  tail[remaining] = 0x80;
  const bitLength = bytes.byteLength * 8;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tailLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  tailView.setUint32(tailLength - 4, bitLength >>> 0, false);
  for (let tailOffset = 0; tailOffset < tailLength; tailOffset += 64) compress(tail, tailOffset);

  return Array.from(state, (value) => value.toString(16).padStart(8, "0")).join("");
}

export async function sha256Hex(bytes: Uint8Array) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256HexFallback(bytes);
  const digest = await subtle.digest("SHA-256", exactArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function sourceFormatForFileName(fileName: string): ProjectAssetSourceFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "stl" || extension === "3mf" || extension === "obj" || extension === "svg") return extension;
  if (extension === "step" || extension === "stp") return "step";
  return null;
}

export function defaultMediaTypeForSource(format: ProjectAssetSourceFormat) {
  if (format === "svg") return "image/svg+xml";
  if (format === "step") return "application/step";
  if (format === "3mf") return "model/3mf";
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
