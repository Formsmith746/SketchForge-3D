import { immutableResourceFingerprint, type EditorHistoryEntry } from "@/lib/editorHistory";
import type { WorkplaneShape } from "@/types/sketchforge";

export type ImportedMeshResource = NonNullable<WorkplaneShape["importedMesh"]>;

export function reconcileLoadedProjectShapeCacheEntry<T extends { revision: number }>(
  existing: T | undefined,
  loaded: T,
  persistedRevision: number,
): T {
  if (!existing || existing.revision <= persistedRevision) {
    return loaded;
  }
  if (existing.revision >= loaded.revision) {
    return existing;
  }
  return { ...existing, revision: loaded.revision };
}

type CompactProjectShapeState = {
  shapes: WorkplaneShape[];
  history: EditorHistoryEntry[];
  resources: Map<string, ImportedMeshResource>;
};

function compactImportedMesh(resource: ImportedMeshResource, resources: Map<string, ImportedMeshResource>): ImportedMeshResource {
  const resourceId = immutableResourceFingerprint(resource);
  if (!resources.has(resourceId)) {
    resources.set(resourceId, {
      ...resource,
      storageResourceId: undefined,
    });
  }
  return {
    positions: [],
    baseWidth: resource.baseWidth,
    baseDepth: resource.baseDepth,
    baseHeight: resource.baseHeight,
    triangleCount: resource.triangleCount,
    sourceFormat: resource.sourceFormat,
    assetId: resource.assetId,
    storageResourceId: resourceId,
  };
}

function compactShape(shape: WorkplaneShape, resources: Map<string, ImportedMeshResource>): WorkplaneShape {
  const next: WorkplaneShape = {
    ...shape,
    importedMesh: shape.importedMesh ? compactImportedMesh(shape.importedMesh, resources) : undefined,
  };
  if (shape.groupedShapes) {
    next.groupedShapes = shape.groupedShapes.map((child) => compactShape(child, resources));
  }
  if (shape.edgeTreatmentHistory) {
    next.edgeTreatmentHistory = shape.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: compactShape(entry.before, resources),
    }));
  }
  return next;
}

function hydrateShape(shape: WorkplaneShape, resources: ReadonlyMap<string, ImportedMeshResource>): WorkplaneShape {
  const resourceId = shape.importedMesh?.storageResourceId;
  const resource = resourceId ? resources.get(resourceId) : undefined;
  const next: WorkplaneShape = {
    ...shape,
    importedMesh: resource ?? shape.importedMesh,
  };
  if (shape.groupedShapes) {
    next.groupedShapes = shape.groupedShapes.map((child) => hydrateShape(child, resources));
  }
  if (shape.edgeTreatmentHistory) {
    next.edgeTreatmentHistory = shape.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: hydrateShape(entry.before, resources),
    }));
  }
  return next;
}

export function compactProjectShapeState(shapes: WorkplaneShape[], history: EditorHistoryEntry[]): CompactProjectShapeState {
  const resources = new Map<string, ImportedMeshResource>();
  return {
    shapes: shapes.map((shape) => compactShape(shape, resources)),
    history: history.map((entry) => ({
      ...entry,
      shapes: entry.shapes.map((shape) => compactShape(shape, resources)),
    })),
    resources,
  };
}

export function hydrateProjectShapeState(
  shapes: WorkplaneShape[],
  history: EditorHistoryEntry[] | undefined,
  resources: ReadonlyMap<string, ImportedMeshResource>,
) {
  return {
    shapes: shapes.map((shape) => hydrateShape(shape, resources)),
    history: history?.map((entry) => ({
      ...entry,
      shapes: entry.shapes.map((shape) => hydrateShape(shape, resources)),
    })),
  };
}
