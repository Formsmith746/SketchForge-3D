import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { EdgeTreatmentHistoryEntry, WorkplaneShape } from "@/types/sketchforge";

export function edgeTreatmentAppliedFrame(shape: WorkplaneShape): NonNullable<EdgeTreatmentHistoryEntry["appliedFrame"]> {
  return {
    x: shape.x,
    z: shape.z,
    elevation: shape.elevation ?? 0,
    width: shape.width,
    depth: shape.depth,
    height: shape.height,
    rotation: shape.rotation ?? 0,
    rotationX: shape.rotationX ?? 0,
    rotationZ: shape.rotationZ ?? 0,
    mirrorX: Boolean(shape.mirrorX),
    mirrorY: Boolean(shape.mirrorY),
    mirrorZ: Boolean(shape.mirrorZ),
  };
}

function cloneJsonShape(shape: WorkplaneShape): WorkplaneShape {
  return JSON.parse(JSON.stringify(canonicalizeShape(shape))) as WorkplaneShape;
}

function compactSnapshotHistory(shape: WorkplaneShape, stripOwnHistory: boolean): WorkplaneShape {
  const next: WorkplaneShape = {
    ...shape,
    groupedShapes: shape.groupedShapes?.map((child) => compactSnapshotHistory(child, false)),
  };
  if (stripOwnHistory) {
    delete next.edgeTreatmentHistory;
  } else if (shape.edgeTreatmentHistory) {
    next.edgeTreatmentHistory = shape.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: compactSnapshotHistory(entry.before, true),
    }));
  }
  return next;
}

export function cloneWorkplaneShapeSnapshot(shape: WorkplaneShape): WorkplaneShape {
  return canonicalizeShape(compactSnapshotHistory(cloneJsonShape(shape), true));
}

export function compactEdgeTreatmentHistory(history: EdgeTreatmentHistoryEntry[] | undefined): EdgeTreatmentHistoryEntry[] {
  return (history ?? []).map((entry) => ({
    ...entry,
    feature: { ...entry.feature },
    before: cloneWorkplaneShapeSnapshot(entry.before),
  }));
}

export function restoreShapeBeforeEdgeTreatment(shape: WorkplaneShape, entry: EdgeTreatmentHistoryEntry) {
  const before = cloneWorkplaneShapeSnapshot(entry.before);
  const entryIndex = (shape.edgeTreatmentHistory ?? []).findIndex((candidate) => candidate.id === entry.id);
  const earlierHistory = entryIndex > 0
    ? compactEdgeTreatmentHistory(shape.edgeTreatmentHistory?.slice(0, entryIndex))
    : undefined;
  const applied = entry.appliedFrame;
  const width = applied ? before.width * shape.width / Math.max(0.001, applied.width) : before.width;
  const depth = applied ? before.depth * shape.depth / Math.max(0.001, applied.depth) : before.depth;
  const height = applied ? before.height * shape.height / Math.max(0.001, applied.height) : before.height;
  const toggleMirror = (beforeValue: boolean | undefined, currentValue: boolean | undefined, appliedValue: boolean | undefined) => (
    Boolean(beforeValue) !== (Boolean(currentValue) !== Boolean(appliedValue))
  ) || undefined;
  return canonicalizeShape({
    ...before,
    id: shape.id,
    name: shape.name,
    color: shape.color,
    hole: shape.hole || undefined,
    locked: shape.locked,
    hidden: shape.hidden,
    x: applied ? before.x + shape.x - applied.x : before.x,
    z: applied ? before.z + shape.z - applied.z : before.z,
    elevation: applied ? (before.elevation ?? 0) + (shape.elevation ?? 0) - applied.elevation : before.elevation,
    width,
    depth,
    height,
    size: Math.max(width, depth),
    rotation: applied ? (before.rotation ?? 0) + (shape.rotation ?? 0) - applied.rotation : before.rotation,
    rotationX: applied ? (before.rotationX ?? 0) + (shape.rotationX ?? 0) - applied.rotationX : before.rotationX,
    rotationZ: applied ? (before.rotationZ ?? 0) + (shape.rotationZ ?? 0) - applied.rotationZ : before.rotationZ,
    mirrorX: applied ? toggleMirror(before.mirrorX, shape.mirrorX, applied.mirrorX) : before.mirrorX,
    mirrorY: applied ? toggleMirror(before.mirrorY, shape.mirrorY, applied.mirrorY) : before.mirrorY,
    mirrorZ: applied ? toggleMirror(before.mirrorZ, shape.mirrorZ, applied.mirrorZ) : before.mirrorZ,
    edgeTreatmentHistory: earlierHistory?.length ? earlierHistory : undefined,
  });
}
