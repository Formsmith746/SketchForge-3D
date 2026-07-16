import type { WorkplaneShape } from "@/types/sketchforge";
import { canonicalizeShape, serializeShapesForSync } from "@/lib/workplaneShapes";

export const MAX_EDITOR_HISTORY_ENTRIES = 100;
export const MAX_EDITOR_HISTORY_BYTES = 64 * 1024 * 1024;

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

export function serializedSceneSignature(shapes: WorkplaneShape[]) {
  const serialized = serializeShapesForSync(shapes);
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

export function boundedEditorHistory(entries: EditorHistoryEntry[]) {
  const bounded = entries.slice(-MAX_EDITOR_HISTORY_ENTRIES);
  let totalBytes = bounded.reduce((total, entry) => total + entry.estimatedBytes, 0);
  while (bounded.length > 2 && totalBytes > MAX_EDITOR_HISTORY_BYTES) {
    const removed = bounded.shift();
    totalBytes -= removed?.estimatedBytes ?? 0;
  }
  return bounded;
}

export function appendEditorHistorySnapshot(entries: EditorHistoryEntry[], requestedIndex: number, entry: EditorHistoryEntry) {
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

  const nextEntries = boundedEditorHistory([...entries.slice(0, index + 1), entry]);
  return { entries: nextEntries, index: nextEntries.length - 1, changed: true };
}

export function hydrateEditorHistoryState(
  currentShapes: WorkplaneShape[],
  storedEntries: EditorHistoryEntry[] | undefined,
  requestedIndex: number | undefined,
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

    const entries = boundedEditorHistory(normalized);
    const boundedIndex = index - (normalized.length - entries.length);
    if (boundedIndex < 0 || boundedIndex >= entries.length) {
      return { entries: [fallback], index: 0 };
    }
    return { entries, index: boundedIndex };
  } catch {
    return { entries: [fallback], index: 0 };
  }
}
