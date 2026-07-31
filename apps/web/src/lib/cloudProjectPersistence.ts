import type { WorkplaneShape } from "@/types/sketchforge";

export const SAVED_GEOMETRY_REFERENCE_KEY = "reuseSavedGeometry";

export type CompactedProjectDocument = Record<string, unknown> & {
  shapes: Array<Record<string, unknown>>;
  history?: Array<Array<Record<string, unknown>>>;
};

type ProjectWithShapes = {
  shapes: WorkplaneShape[];
  history?: WorkplaneShape[][];
};

function indexBaselineShape(
  shape: WorkplaneShape,
  path: string,
  sources: WeakMap<object, string>,
) {
  if (shape.importedMesh && !sources.has(shape.importedMesh)) {
    sources.set(shape.importedMesh, path);
  }
  shape.groupedShapes?.forEach((child, index) => {
    indexBaselineShape(child, `${path}/groupedShapes/${index}`, sources);
  });
  shape.edgeTreatmentHistory?.forEach((entry, index) => {
    indexBaselineShape(entry.before, `${path}/edgeTreatmentHistory/${index}/before`, sources);
  });
}

function indexBaselineGeometry(
  document: ProjectWithShapes,
  sources: WeakMap<object, string>,
) {
  document.shapes.forEach((shape, index) => {
    indexBaselineShape(shape, `shapes/${index}`, sources);
  });
  document.history?.forEach((snapshot, historyIndex) => {
    snapshot.forEach((shape, shapeIndex) => {
      indexBaselineShape(shape, `history/${historyIndex}/${shapeIndex}`, sources);
    });
  });
}

function compactShape(
  current: WorkplaneShape,
  baselineGeometrySources: WeakMap<object, string>,
  onReuse: () => void,
): Record<string, unknown> {
  const compacted: Record<string, unknown> = { ...current };

  const sourceGeometryPath = current.importedMesh
    ? baselineGeometrySources.get(current.importedMesh)
    : undefined;
  if (current.importedMesh && sourceGeometryPath) {
    compacted.importedMesh = {
      [SAVED_GEOMETRY_REFERENCE_KEY]: true,
      sourceGeometryPath,
    };
    onReuse();
  }

  if (current.groupedShapes) {
    compacted.groupedShapes = current.groupedShapes.map((shape) =>
      compactShape(shape, baselineGeometrySources, onReuse));
  }

  if (current.edgeTreatmentHistory) {
    compacted.edgeTreatmentHistory = current.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: compactShape(entry.before, baselineGeometrySources, onReuse),
    }));
  }

  return compacted;
}

/**
 * Replaces unchanged imported meshes with a server-resolved marker. Object identity
 * is intentional: editor transform updates preserve importedMesh references, while
 * geometry-changing operations create a new importedMesh object and send it in full.
 */
export function compactProjectGeometry<T extends ProjectWithShapes>(document: T, baseline: T | null) {
  let reusedMeshCount = 0;
  const baselineGeometrySources = new WeakMap<object, string>();
  if (baseline) indexBaselineGeometry(baseline, baselineGeometrySources);
  const compacted: CompactedProjectDocument = {
    ...document,
    shapes: document.shapes.map((shape) => compactShape(
      shape,
      baselineGeometrySources,
      () => { reusedMeshCount += 1; },
    )),
  };
  if (document.history) {
    compacted.history = document.history.map((snapshot) => snapshot.map((shape) => compactShape(
      shape,
      baselineGeometrySources,
      () => { reusedMeshCount += 1; },
    )));
  }
  return { document: compacted, reusedMeshCount };
}
