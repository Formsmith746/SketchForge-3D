import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export const SKF_MEDIA_TYPE = "application/vnd.sketchforge.project+zip";
export const SKF_SCHEMA_ID = "com.sketchforge.project";
export const SKF_FORMAT_VERSION = 1;

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_PROJECT_JSON_BYTES = 32 * 1024 * 1024;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 4096;

export type SkfValidationResult = { valid: true } | { valid: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeArchivePath(path: string) {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.startsWith("\\")
    && !/^[a-z]:/i.test(path)
    && !path.includes("\\")
    && path.split("/").every((part) => part && part !== "." && part !== "..");
}

function inspectZip(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) return "INVALID_ARCHIVE_SIZE";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOfDirectory = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOfDirectory = offset;
      break;
    }
  }
  if (endOfDirectory < 0) return "ZIP_DIRECTORY_MISSING";
  const entryCount = view.getUint16(endOfDirectory + 10, true);
  const centralSize = view.getUint32(endOfDirectory + 12, true);
  const centralOffset = view.getUint32(endOfDirectory + 16, true);
  if (entryCount === 0 || entryCount > MAX_ENTRIES) return "INVALID_ENTRY_COUNT";
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) return "ZIP64_NOT_SUPPORTED";
  if (centralOffset + centralSize > bytes.byteLength) return "ZIP_DIRECTORY_TRUNCATED";

  const decoder = new TextDecoder();
  const names = new Set<string>();
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) return "ZIP_DIRECTORY_INVALID";
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const expanded = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.byteLength) return "ZIP_ENTRY_TRUNCATED";
    if ((flags & 1) !== 0) return "ENCRYPTED_ARCHIVE_NOT_SUPPORTED";
    if (method !== 0 && method !== 8) return "UNSUPPORTED_COMPRESSION";
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (!safeArchivePath(name) || names.has(name)) return "UNSAFE_OR_DUPLICATE_PATH";
    const entryLimit = name === "project.json" ? MAX_PROJECT_JSON_BYTES : MAX_ASSET_BYTES;
    if (expanded > entryLimit) return "ENTRY_TOO_LARGE";
    expandedBytes += expanded;
    if (expandedBytes > MAX_EXPANDED_BYTES) return "EXPANDED_ARCHIVE_TOO_LARGE";
    names.add(name);
    offset = end;
  }
  return names.has("project.json") ? null : "PROJECT_JSON_MISSING";
}

async function sha256Hex(bytes: Uint8Array) {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function validateSkfProject(bytes: Uint8Array): Promise<SkfValidationResult> {
  const zipError = inspectZip(bytes);
  if (zipError) return { valid: false, reason: zipError };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { valid: false, reason: "ZIP_EXPANSION_FAILED" };
  }
  const projectBytes = files["project.json"];
  if (!projectBytes || projectBytes.byteLength > MAX_PROJECT_JSON_BYTES) return { valid: false, reason: "PROJECT_JSON_INVALID" };
  let document: unknown;
  try {
    document = JSON.parse(strFromU8(projectBytes));
  } catch {
    return { valid: false, reason: "PROJECT_JSON_MALFORMED" };
  }
  if (!isRecord(document) || document.schema !== SKF_SCHEMA_ID || document.formatVersion !== SKF_FORMAT_VERSION) {
    return { valid: false, reason: "UNSUPPORTED_PROJECT_FORMAT" };
  }
  if (!Number.isInteger(document.minimumReaderVersion) || Number(document.minimumReaderVersion) > SKF_FORMAT_VERSION) {
    return { valid: false, reason: "UNSUPPORTED_READER_VERSION" };
  }
  if (!isRecord(document.metadata) || typeof document.metadata.projectName !== "string") return { valid: false, reason: "INVALID_METADATA" };
  if (!Array.isArray(document.states) || document.states.length < 1 || document.states.length > 5001) return { valid: false, reason: "INVALID_STATES" };
  if (!isRecord(document.history) || !Array.isArray(document.history.entries) || document.history.entries.length < 1) return { valid: false, reason: "INVALID_HISTORY" };
  if (!Number.isInteger(document.history.index) || Number(document.history.index) < 0 || Number(document.history.index) >= document.history.entries.length) {
    return { valid: false, reason: "INVALID_HISTORY_INDEX" };
  }
  const stateIds = new Set<string>();
  for (const state of document.states) {
    if (!isRecord(state) || typeof state.id !== "string" || stateIds.has(state.id) || !Array.isArray(state.nodes) || !Array.isArray(state.rootNodeIds)) {
      return { valid: false, reason: "INVALID_STATE" };
    }
    stateIds.add(state.id);
  }
  if (typeof document.sceneStateId !== "string" || !stateIds.has(document.sceneStateId)) return { valid: false, reason: "INVALID_SCENE_STATE" };
  for (const entry of document.history.entries) {
    if (!isRecord(entry) || typeof entry.stateId !== "string" || !stateIds.has(entry.stateId) || !Array.isArray(entry.selectedObjectIds)) {
      return { valid: false, reason: "INVALID_HISTORY_ENTRY" };
    }
  }
  if (!Array.isArray(document.assets)) return { valid: false, reason: "INVALID_ASSETS" };
  const expectedFiles = new Set(["project.json"]);
  const assetIds = new Set<string>();
  for (const asset of document.assets) {
    if (!isRecord(asset)
      || typeof asset.id !== "string"
      || typeof asset.path !== "string"
      || typeof asset.sha256 !== "string"
      || !Number.isSafeInteger(asset.byteLength)
      || assetIds.has(asset.id)
      || !safeArchivePath(asset.path)
      || !asset.path.startsWith("assets/")) return { valid: false, reason: "INVALID_ASSET_RECORD" };
    const assetBytes = files[asset.path];
    if (!assetBytes || assetBytes.byteLength !== Number(asset.byteLength)) return { valid: false, reason: "ASSET_LENGTH_MISMATCH" };
    if (await sha256Hex(assetBytes) !== asset.sha256.toLowerCase()) return { valid: false, reason: "ASSET_HASH_MISMATCH" };
    assetIds.add(asset.id);
    expectedFiles.add(asset.path);
  }
  if (Object.keys(files).some((path) => !expectedFiles.has(path))) return { valid: false, reason: "UNDECLARED_ARCHIVE_ENTRY" };
  return { valid: true };
}

export function createEmptySkfProject(projectId: string, projectName: string, createdAtSeconds: number) {
  const createdAt = new Date(createdAtSeconds * 1000).toISOString();
  const document = {
    schema: SKF_SCHEMA_ID,
    formatVersion: SKF_FORMAT_VERSION,
    minimumReaderVersion: SKF_FORMAT_VERSION,
    createdWithVersion: "0.6.0",
    metadata: { projectId, projectName, units: "Metric (Default)", createdAt, modifiedAt: createdAt },
    assets: [],
    sceneStateId: "state-1",
    states: [{ id: "state-1", rootNodeIds: [], nodes: [] }],
    history: { entries: [{ stateId: "state-1", selectedObjectIds: [] }], index: 0 },
    sketches: [],
    features: [],
    groups: [],
    workplanes: [{ id: "workplane-base", kind: "base", elevation: 0 }],
    exactCad: [],
    editor: {
      workspace: {
        width: 200,
        depth: 200,
        sizePreset: "200 x 200 mm",
        gridBlockSize: 5,
        gridBlockPreset: "5 mm",
        background: "#f8fbfc",
        showShadows: true,
        showGrid: true,
        cruiseShapes: true,
        zoomSpeed: 5,
        units: "Metric (Default)",
        scale: "1:1 (millimeters)",
        accuracy: 2,
      },
      snapGrid: "1.0 mm",
      selectedWorkplaneId: "workplane-base",
      placementElevation: 0,
    },
  };
  return zipSync({ "project.json": strToU8(`${JSON.stringify(document, null, 2)}\n`) }, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
}

