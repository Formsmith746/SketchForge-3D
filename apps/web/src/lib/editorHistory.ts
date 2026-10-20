import type { WorkplaneShape } from "@/types/sketchforge";
import { canonicalizeShape } from "@/lib/workplaneShapes";

export const MAX_EDITOR_HISTORY_ENTRIES = 5000;
export type EditorHistoryExportLimit = "unlimited" | number;

export type EditorHistoryEntry = {
  shapes: WorkplaneShape[];
  selectedIds: string[];
  fingerprint: string;
  estimatedBytes: number;
};

export type EditorHistoryState = {
  entries: EditorHistoryEntry[];
  index: number;
};

type ResourceSignature = {
  fingerprint: string;
  estimatedBytes: number;
};

const resourceSignatureCache = new WeakMap<object, ResourceSignature>();
const resourcesBeingSigned = new WeakSet<object>();
const stringSignatureCache = new Map<string, ResourceSignature>();
const MAX_CACHED_STRING_SIGNATURES = 64;
const STREAMED_NUMERIC_ARRAY_LENGTH = 10_000;
const STREAMED_NUMERIC_ARRAY_MARKER = "$sketchforgeFloat64Array";
const COMPACT_RESOURCE_KEYS = new Set([
  "cadDisplayEdges",
  "edgeTreatmentHistory",
  "imagePlate",
  "importedMesh",
  "sketchProfile",
]);
const COMPACT_STRING_KEYS = new Set(["cadBrep"]);

function signatureFromSerialized(serialized: string): ResourceSignature {
  let hashA = 2166136261;
  let hashB = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 16777619);
    hashB = Math.imul(hashB, 33) ^ code;
  }
  return {
    fingerprint: `${serialized.length}:${hashA >>> 0}:${hashB >>> 0}`,
    estimatedBytes: serialized.length * 2,
  };
}

type StreamingHashState = {
  hashA: number;
  hashB: number;
  units: number;
  estimatedBytes: number;
};

function streamingHashState(): StreamingHashState {
  return { hashA: 2166136261, hashB: 5381, units: 0, estimatedBytes: 0 };
}

function appendHashUnit(state: StreamingHashState, unit: number) {
  state.hashA = Math.imul(state.hashA ^ unit, 16777619);
  state.hashB = Math.imul(state.hashB, 33) ^ unit;
  state.units += 1;
}

function appendHashText(state: StreamingHashState, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    appendHashUnit(state, value.charCodeAt(index));
  }
  state.estimatedBytes += value.length * 2;
}

function appendHashNumber(state: StreamingHashState, value: number, view: DataView) {
  view.setFloat64(0, value, true);
  appendHashUnit(state, view.getUint32(0, true));
  appendHashUnit(state, view.getUint32(4, true));
  state.estimatedBytes += 8;
}

function signatureFromStreamingState(state: StreamingHashState, prefix: string): ResourceSignature {
  return {
    fingerprint: `${prefix}:${state.units}:${state.hashA >>> 0}:${state.hashB >>> 0}`,
    estimatedBytes: state.estimatedBytes,
  };
}

function largeNumericArraySignature(value: unknown) {
  if (!Array.isArray(value) || value.length <= STREAMED_NUMERIC_ARRAY_LENGTH) return null;
  const state = streamingHashState();
  const view = new DataView(new ArrayBuffer(8));
  appendHashText(state, `float64-array:${value.length}:`);
  for (let index = 0; index < value.length; index += 1) {
    const number = value[index];
    if (typeof number !== "number") return null;
    appendHashNumber(state, number, view);
  }
  return signatureFromStreamingState(state, "float64-v1");
}

function signatureFromStreamedValue(resource: object) {
  const state = streamingHashState();
  const view = new DataView(new ArrayBuffer(8));
  const active = new WeakSet<object>();

  const appendValue = (value: unknown, arrayValue = false): void => {
    if (value === null || (arrayValue && (value === undefined || typeof value === "function" || typeof value === "symbol"))) {
      appendHashText(state, "null;");
      return;
    }
    if (typeof value === "string") {
      appendHashText(state, `string:${value.length}:`);
      appendHashText(state, value);
      return;
    }
    if (typeof value === "number") {
      appendHashText(state, "number:");
      appendHashNumber(state, value, view);
      return;
    }
    if (typeof value === "boolean") {
      appendHashText(state, value ? "true;" : "false;");
      return;
    }
    if (typeof value === "bigint") {
      throw new TypeError("Cannot serialize a BigInt resource");
    }
    if (value === undefined || typeof value === "function" || typeof value === "symbol") {
      appendHashText(state, "undefined;");
      return;
    }

    if (active.has(value)) throw new TypeError("Cannot fingerprint a circular resource");
    active.add(value);
    if (Array.isArray(value)) {
      appendHashText(state, `array:${value.length}:`);
      for (let index = 0; index < value.length; index += 1) appendValue(value[index], true);
    } else {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((key) => {
        const item = record[key];
        return item !== undefined && typeof item !== "function" && typeof item !== "symbol";
      });
      appendHashText(state, `object:${keys.length}:`);
      for (const key of keys) {
        appendHashText(state, `key:${key.length}:`);
        appendHashText(state, key);
        appendValue(record[key]);
      }
    }
    active.delete(value);
  };

  appendValue(resource);
  return signatureFromStreamingState(state, "stream-v1");
}

function signatureWithStreamedNumericArrays(resource: object) {
  let streamedBytes = 0;
  const countedResources = new Set<object | string>();
  const serialized = JSON.stringify(resource, (key, value: unknown) => {
    // A reversible operation embeds a before-shape, which can itself contain
    // large immutable geometry. Reuse those signatures across history wrappers.
    const nestedSignature = key && COMPACT_RESOURCE_KEYS.has(key) && value !== null && typeof value === "object"
      ? objectResourceSignature(value)
      : COMPACT_STRING_KEYS.has(key) && typeof value === "string" && value.length > 0
        ? stringResourceSignature(value)
        : undefined;
    if (nestedSignature) {
      if (!countedResources.has(value as object | string)) {
        countedResources.add(value as object | string);
        streamedBytes += nestedSignature.estimatedBytes;
      }
      return { $resource: key, fingerprint: nestedSignature.fingerprint };
    }
    const signature = largeNumericArraySignature(value);
    if (!signature) return value;
    streamedBytes += signature.estimatedBytes;
    return { [STREAMED_NUMERIC_ARRAY_MARKER]: signature.fingerprint };
  });
  const signature = signatureFromSerialized(serialized);
  return { ...signature, estimatedBytes: signature.estimatedBytes + streamedBytes };
}

function objectResourceSignature(resource: object) {
  const cached = resourceSignatureCache.get(resource);
  if (cached) return cached;
  if (resourcesBeingSigned.has(resource)) throw new TypeError("Cannot fingerprint a circular resource");
  resourcesBeingSigned.add(resource);
  let signature: ResourceSignature;
  try {
    signature = signatureWithStreamedNumericArrays(resource);
  } catch (error) {
    if (!(error instanceof RangeError) || !/string length/i.test(error.message)) throw error;
    signature = signatureFromStreamedValue(resource);
  } finally {
    resourcesBeingSigned.delete(resource);
  }
  resourceSignatureCache.set(resource, signature);
  return signature;
}

export function immutableResourceFingerprint(resource: object) {
  return objectResourceSignature(resource).fingerprint;
}

function stringResourceSignature(resource: string) {
  const cached = stringSignatureCache.get(resource);
  if (cached) {
    stringSignatureCache.delete(resource);
    stringSignatureCache.set(resource, cached);
    return cached;
  }
  const signature = signatureFromSerialized(resource);
  stringSignatureCache.set(resource, signature);
  while (stringSignatureCache.size > MAX_CACHED_STRING_SIGNATURES) {
    const oldest = stringSignatureCache.keys().next().value;
    if (oldest === undefined) break;
    stringSignatureCache.delete(oldest);
  }
  return signature;
}

export function serializedSceneSignature(shapes: WorkplaneShape[]) {
  const countedObjects = new Set<object>();
  const countedStrings = new Set<string>();
  let resourceBytes = 0;
  const serialized = JSON.stringify(shapes.map(canonicalizeShape), (key, value: unknown) => {
    if (COMPACT_RESOURCE_KEYS.has(key) && value !== null && typeof value === "object") {
      const signature = objectResourceSignature(value);
      if (!countedObjects.has(value)) {
        countedObjects.add(value);
        resourceBytes += signature.estimatedBytes;
      }
      return { $resource: key, fingerprint: signature.fingerprint };
    }
    if (COMPACT_STRING_KEYS.has(key) && typeof value === "string" && value.length > 0) {
      const signature = stringResourceSignature(value);
      if (!countedStrings.has(value)) {
        countedStrings.add(value);
        resourceBytes += signature.estimatedBytes;
      }
      return { $resource: key, fingerprint: signature.fingerprint };
    }
    return value;
  });
  const signature = signatureFromSerialized(serialized);
  return {
    fingerprint: signature.fingerprint,
    estimatedBytes: signature.estimatedBytes + resourceBytes,
  };
}

export function projectShapesFingerprint(shapes: WorkplaneShape[]) {
  return serializedSceneSignature(shapes).fingerprint;
}

export function editorHistoryEntry(shapes: WorkplaneShape[], selectedIds: string[]): EditorHistoryEntry {
  const canonicalShapes = shapes.map(canonicalizeShape);
  const validSelection = selectedIds.filter((id, index) => selectedIds.indexOf(id) === index && canonicalShapes.some((shape) => shape.id === id));
  return {
    shapes: canonicalShapes,
    selectedIds: validSelection,
    ...serializedSceneSignature(canonicalShapes),
  };
}

export function boundedEditorHistory(entries: EditorHistoryEntry[], limit: EditorHistoryExportLimit = "unlimited") {
  return boundedEditorHistoryState(entries, entries.length - 1, limit).entries;
}

export function boundedEditorHistoryState(
  entries: EditorHistoryEntry[],
  requestedIndex: number,
  limit: EditorHistoryExportLimit = "unlimited",
): EditorHistoryState {
  if (entries.length === 0) return { entries: [], index: 0 };
  const index = Math.min(Math.max(0, requestedIndex), entries.length - 1);
  const retainedActions = limit === "unlimited"
    ? MAX_EDITOR_HISTORY_ENTRIES - 1
    : Math.min(MAX_EDITOR_HISTORY_ENTRIES - 1, Math.max(1, Math.round(limit)));
  const maxEntries = retainedActions + 1;
  if (entries.length <= maxEntries) return { entries, index };
  let start = Math.max(0, index - retainedActions);
  const end = Math.min(entries.length, start + maxEntries);
  if (end - start < maxEntries) start = Math.max(0, end - maxEntries);
  const bounded = entries.slice(start, end);
  return { entries: bounded, index: index - start };
}

export function appendEditorHistorySnapshot(
  entries: EditorHistoryEntry[],
  requestedIndex: number,
  entry: EditorHistoryEntry,
  limit: EditorHistoryExportLimit = "unlimited",
) {
  const index = Math.min(Math.max(0, requestedIndex), Math.max(0, entries.length - 1));
  const current = entries[index];
  if (current?.fingerprint === entry.fingerprint) {
    const selectionChanged = current.selectedIds.join("\0") !== entry.selectedIds.join("\0");
    return {
      entries: selectionChanged ? entries.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, selectedIds: entry.selectedIds } : candidate) : entries,
      index,
      changed: false,
    };
  }

  const nextEntries = boundedEditorHistory([...entries.slice(0, index + 1), entry], limit);
  return { entries: nextEntries, index: nextEntries.length - 1, changed: true };
}

export function hydrateEditorHistoryState(
  currentShapes: WorkplaneShape[],
  storedEntries: EditorHistoryEntry[] | undefined,
  requestedIndex: number | undefined,
  limit: EditorHistoryExportLimit = "unlimited",
): EditorHistoryState {
  const fallback = editorHistoryEntry(currentShapes, []);
  if (!Array.isArray(storedEntries) || storedEntries.length === 0) {
    return { entries: [fallback], index: 0 };
  }

  try {
    const normalized = storedEntries.map((entry) =>
      editorHistoryEntry(
        Array.isArray(entry?.shapes) ? entry.shapes : [],
        Array.isArray(entry?.selectedIds) ? entry.selectedIds.filter((id): id is string => typeof id === "string") : [],
      ),
    );
    const index = Number.isInteger(requestedIndex)
      ? Math.min(Math.max(0, requestedIndex as number), normalized.length - 1)
      : normalized.length - 1;
    if (normalized[index]?.fingerprint !== fallback.fingerprint) {
      return { entries: [fallback], index: 0 };
    }

    return boundedEditorHistoryState(normalized, index, limit);
  } catch {
    return { entries: [fallback], index: 0 };
  }
}

export function editorHistoryForExport(
  entries: EditorHistoryEntry[],
  requestedIndex: number,
  limit: EditorHistoryExportLimit,
): EditorHistoryState {
  if (entries.length === 0) return { entries: [], index: 0 };
  const index = Math.min(Math.max(0, requestedIndex), entries.length - 1);
  if (limit === "unlimited") return { entries, index };
  const start = Math.max(0, index - limit);
  return {
    entries: entries.slice(start, index + 1),
    index: index - start,
  };
}
