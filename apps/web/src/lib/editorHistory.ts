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
const stringSignatureCache = new Map<string, ResourceSignature>();
const MAX_CACHED_STRING_SIGNATURES = 64;
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

function objectResourceSignature(resource: object) {
  const cached = resourceSignatureCache.get(resource);
  if (cached) return cached;
  const signature = signatureFromSerialized(JSON.stringify(resource));
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
