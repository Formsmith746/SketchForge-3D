/** Public API for SketchForge's project, geometry, import, export and CAD operations. */

// --- the project, as a document on disk -------------------------------------
export { directoryProjectStore, type ProjectDocument, type ProjectMetadata, type ProjectStore } from "./projectStore.js";

// --- operations, on an Engine bound to a store -------------------------------
export {
  createEngine,
  type AlignOutcome,
  type AlignRequest,
  type CutRequest,
  type DistributeOutcome,
  type DistributeRequest,
  type Engine,
  type EngineFailure,
  type EngineResult,
  type MeshImportRequest,
  type PatternKind,
  type PatternRequest,
  type ProjectRead,
  type ShapeRemoved,
  type ShapesArranged,
  type ShapeWritten,
  type ShapesWritten,
} from "./engine.js";
export type { ServerCadShapeProperties, ShapeGeometryProvenance } from "./serverCadProperties.js";
export { MAX_INTERFERENCE_CANDIDATES, MAX_INTERFERENCE_SHAPES } from "./serverCadInterference.js";
export type { InterferencePair, InterferenceReport, InterferenceRequest, InterferenceRefusal } from "./serverCadInterference.js";

// --- arranging what is already there -----------------------------------------
//
// Pure arithmetic over extents, shared by the editor and the operations above.
// The editor measures the extents off the mesh and the engine measures them off
// the parameters; the spacing rules are the same either way.
export {
  alignCoordinate,
  alignShifts,
  effectiveAlignAnchorId,
  ALIGN_EPSILON,
  type AlignAxis,
  type AlignEntry,
  type AlignShift,
  type AlignTarget,
} from "./alignShapes.js";
export {
  distributeShifts,
  widestDistributeAxis,
  type DistributeEntry,
  type DistributeShift,
  type DistributeSpacing,
} from "./distributeShapes.js";
export {
  circularPatternPlacements,
  linearPatternPlacements,
  suggestedLinearStep,
  MAX_PATTERN_COUNT,
  MIN_PATTERN_COUNT,
  type CircularPatternRequest,
  type LinearPatternRequest,
  type PatternPlacement,
} from "./patternShapes.js";
export { boundsForShapes, footprintCenter, shapeBounds, type ShapeBounds } from "./shapeBounds.js";

// --- importing a model file ---------------------------------------------------
export {
  importableMeshFormat,
  importedMeshFromFile,
  IMPORTABLE_MESH_FORMATS,
  type ImportableMeshFormat,
  type ImportedMesh,
} from "./meshImport.js";

// --- the format -------------------------------------------------------------
export {
  exportSkfProject,
  importSkfProject,
  inspectSkfProjectPackage,
  SKF_FORMAT_VERSION,
  SKF_MEDIA_TYPE,
  type SkfProjectExportInput,
  type SkfRestoredProject,
} from "./skfProject.js";

// --- shapes, from parameters -------------------------------------------------
export {
  REQUESTABLE_SHAPE_KINDS,
  shapeFromRequest,
  shapeWithRequestedChanges,
  type RequestableShapeKind,
  type ShapeChangeResult,
  type ShapeRequest,
} from "./shapeRequests.js";
export { canonicalizeShape, withHoleMode } from "./workplaneShapes.js";
export {
  parseRevolveRequest,
  resolveThreadRequest,
  revolvedShapeFromRequest,
  rebuiltRevolveShape,
  type ParsedRevolveRequest,
} from "./revolveRequests.js";

// --- geometry ---------------------------------------------------------------
//
// Section 5 asks for one `meshForShape(shape, options?)`. There is no such
// function yet: the mesh dispatch over `shape.kind` is still inside
// `WorkplaneViewport.tsx`, and only the primitive builders beneath it came out
// (in #55). Exporting the builders says what exists rather than inventing a
// dispatch in a refactor that is supposed to change nothing.
export {
  createHalfSphereGeometry,
  createHollowCylinderGeometry,
  createPyramidGeometry,
  createRoofGeometry,
  createRoundRoofGeometry,
  createTorusGeometry,
  createWedgeGeometry,
  putGeometryOnBase,
  type PrimitiveGeometryOptions,
} from "./primitiveGeometry.js";
export { exactSolidForShape, EXACT_SOLID_KINDS, UnbuildableShapeError } from "./cadSolids.js";
export {
  ServerCadError,
  type ServerCadEdge,
  type ServerCadResult,
  type ServerCadTreatment,
} from "./serverCadOperations.js";
export { FACE_DIRECTION_NAMES, type ServerCadFace, type ServerCadShellRequest } from "./serverCadShell.js";
export {
  type MeasurementEndRef,
  type MeasurementEntityKind,
  type ServerCadMeasurement,
  type ServerCadMeasurementPair,
} from "./serverCadMeasure.js";
export {
  type AngleUnavailableCode,
  type MeasurementUnavailableCode,
  type RadiusUnavailableCode,
} from "./cadMeasurements.js";
export { exportShapesToStep, type StepExportResult } from "./stepExport.js";
export { exportProjectScene, PROJECT_EXPORT_FORMATS, type ProjectExportArtifact, type ProjectExportFormat, type ProjectExportOptions } from "./sceneExport.js";
export {
  parseProjectionLayout,
  projectionLayoutForCaptureFace,
  PROJECTION_LAYOUTS,
  PROJECTION_VIEWS,
  type ProjectionLayout,
  type ProjectionView,
} from "./cadProjection.js";
export { meshProjectShapes } from "./projectMeshes.js";
export { renderSectionSvg, SECTION_PLANES, type SectionDrawing, type SectionPlane } from "./cadSection.js";
export { sectionShapesToDxf, sectionShapesToSvg, type SectionOptions } from "./serverCadSection.js";
export { renderSectionDxf } from "./cadSection.js";
export { wallThickness, type WallThicknessResult } from "./serverCadThickness.js";
export { analyzeMeshTopology, type TriangleFace } from "./meshValidation.js";
export { mirrorShapes } from "./serverShapeGroups.js";
