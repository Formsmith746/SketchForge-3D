import { canonicalizeShape, serializeShapesForSync } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

export const MAX_PERSISTED_HISTORY_ENTRIES = 50;

export type ProjectHistoryState = {
  entries: WorkplaneShape[][];
  index: number;
};

function canonicalizeSnapshot(shapes: WorkplaneShape[]) {
  return shapes.map(canonicalizeShape);
}

export function normalizeProjectHistory(
  currentShapes: WorkplaneShape[],
  history: WorkplaneShape[][] | null | undefined,
  historyIndex: number | null | undefined,
): ProjectHistoryState {
  const canonicalCurrent = canonicalizeSnapshot(currentShapes);
  let entries = history?.length
    ? history.map(canonicalizeSnapshot)
    : [canonicalCurrent];
  let index = Number.isSafeInteger(historyIndex)
    ? Math.max(0, Math.min(Number(historyIndex), entries.length - 1))
    : entries.length - 1;

  if (serializeShapesForSync(entries[index] ?? []) !== serializeShapesForSync(canonicalCurrent)) {
    entries = [...entries.slice(0, index + 1), canonicalCurrent];
    index = entries.length - 1;
  }

  if (entries.length > MAX_PERSISTED_HISTORY_ENTRIES) {
    const maxStart = entries.length - MAX_PERSISTED_HISTORY_ENTRIES;
    const start = Math.max(0, Math.min(maxStart, index - Math.floor(MAX_PERSISTED_HISTORY_ENTRIES / 2)));
    entries = entries.slice(start, start + MAX_PERSISTED_HISTORY_ENTRIES);
    index -= start;
  }

  return { entries, index };
}

export function appendProjectHistory(
  history: ProjectHistoryState,
  nextShapes: WorkplaneShape[],
): ProjectHistoryState {
  const canonicalNext = canonicalizeSnapshot(nextShapes);
  let entries = [...history.entries.slice(0, history.index + 1), canonicalNext];
  if (entries.length > MAX_PERSISTED_HISTORY_ENTRIES) {
    entries = entries.slice(entries.length - MAX_PERSISTED_HISTORY_ENTRIES);
  }
  return { entries, index: entries.length - 1 };
}
