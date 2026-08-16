"use client";

import { Check, Circle, CircleDot, CloudUpload, CopyPlus, Download, Eye, FolderOpen, Grid2X2, Hexagon, Pentagon, RotateCw, Route, Ruler, ScanLine, Square, Type, X } from "lucide-react";
import type manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ADDITION, Brush, Evaluator, HOLLOW_INTERSECTION, HOLLOW_SUBTRACTION, INTERSECTION, SUBTRACTION, type CSGOperation } from "three-bvh-csg";
import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import helvetikerBoldFontJson from "three/examples/fonts/helvetiker_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";
import type { AppThemePreference, ResolvedAppTheme } from "@/lib/appTheme";
import type { ChallengeTutorialId } from "@/lib/challenges";
import { manifoldModuleSource } from "@/generated/manifoldModuleSource";
import { manifoldWasmBase64 } from "@/generated/manifoldWasmBase64";
import { sphereTessellation } from "@/lib/sphereTessellation";
import { createGearGeometry } from "@/lib/gearGeometry";
import { regularPolygonFootprintScale } from "@/lib/regularPolygonFootprint";
import {
  ToolbarAlignIcon,
  ToolbarChamferIcon,
  ToolbarCaretDownIcon,
  ToolbarCopyIcon,
  ToolbarDuplicateIcon,
  ToolbarDropToWorkplaneIcon,
  ToolbarExportIcon,
  ToolbarGroupIcon,
  ToolbarHideSelectedIcon,
  ToolbarHomeIcon,
  ToolbarImportIcon,
  ToolbarIntersectionIcon,
  ToolbarFilletIcon,
  ToolbarMirrorIcon,
  ToolbarPasteIcon,
  ToolbarRedoIcon,
  ToolbarSnapGridIcon,
  ToolbarSettingsIcon,
  ToolbarShapeAddIcon,
  ToolbarTrashIcon,
  ToolbarUngroupIcon,
  ToolbarUndoIcon,
  ToolbarVectorExportIcon,
  ToolbarWorkplaneIcon,
} from "./icons";
import { WorkplaneViewport } from "./WorkplaneViewport";
import { SketchWorkspace, type SketchCircleDraft, type SketchMeasurement, type SketchPolygonDraft, type SketchRectDraft, type SketchSelection, type SketchTextDraft, type SketchTool } from "./SketchWorkspace";
import { EdgeModifierPanel } from "./workplane/EdgeModifierPanel";
import { isHexColor, UI_LABELS, VP_LABELS } from "./workplane/WorkspaceSettingsModal";
import {
  canonicalizeShape,
  cloneWorkplaneShapeTreeWithFreshIds,
  cleanNearZero,
  cleanRotationDegrees,
  fallbackSolidColor,
  meshYawDegrees,
  mirroredAxisCount,
  mirrorSign,
  normalizeDegrees,
  preservesEdgeTreatmentSize,
  resizedImportedMeshPositions,
  serializeShapesForSync,
  shapeDepth,
  shapeWidth,
  withHoleMode,
  workplaneShapesEqual,
} from "@/lib/workplaneShapes";
import { bakeCadMetadataForShapeTransform, cadBrepTransformForShape, cadModifierPrimitiveForAnalyticBox, cadModifierPrimitiveForBakedShape } from "@/lib/cadBakeMetadata";
import { hasOneToOneCadComponentMapping } from "@/lib/cadModifierGroups";
import {
  CAD_MODIFIER_MAX_SHARP_ANGLE,
  CAD_MODIFIER_REQUEST_TIMEOUT_MS,
  cadModifierPrepareTimeoutMs,
  cadModifierTimeoutMessage,
  cadModifierWorkerFailureMessage,
  defaultCadModifierTangentChain,
  selectableCadModifierEdge,
  type CadModifierRequestPhase,
} from "@/lib/cadModifierRuntime";
import { cloneWorkplaneShapeSnapshot, compactEdgeTreatmentHistory, edgeTreatmentAppliedFrame, restoreShapeBeforeEdgeTreatment } from "@/lib/edgeTreatmentHistory";
import { appendEditorHistorySnapshot, boundedEditorHistoryState, editorHistoryEntry, editorHistoryForExport, hydrateEditorHistoryState, projectShapesFingerprint, type EditorHistoryEntry, type EditorHistoryExportLimit, type EditorHistoryState } from "@/lib/editorHistory";
import { snapShapeFootprintToVisibleGrid, visibleGridStep } from "@/lib/gridSnap";
import { createLocalId } from "@/lib/localIds";
import { circleFromPoints, circleSketchGeometry } from "@/lib/sketchCircles";
import { moveConstrainedSketchPoint, pruneSketchParameters, setSketchPointFixed, setSketchSegmentConstraint, setSketchSegmentLength, solveSketchProfile } from "@/lib/sketchConstraints";
import { rectFromPoints, rectangleSketchGeometry } from "@/lib/sketchRectangles";
import { textSketchGeometry } from "@/lib/sketchTextGeometry";
import { polygonFromPoints, polygonSketchGeometry } from "@/lib/sketchPolygons";
import { offsetSketchSegments } from "@/lib/sketchOffset";
import { intersectMeshWithPlane, projectSketchProfileToPlane, type SketchProjectionResult } from "@/lib/sketchProjection";
import { buildSketchSweepGeometry } from "@/lib/sketchSweep";
import { reflectionTransform, rotationTransform, transformSketchSelection, translateSketchPoints, translationTransform, type SketchTransformSelection } from "@/lib/sketchTransforms";
import { projectExportFileName } from "@/lib/exportNames";
import {
  BASE_CONSTRUCTION_PLANE_POSE,
  angledConstructionPlanePose,
  constructionPlaneAttachmentFromWorldPose,
  constructionPlanePosesAreParallel,
  flipConstructionPlanePose,
  localPointToWorld,
  midplaneConstructionPlanePose,
  offsetConstructionPlanePose,
  poseFromWorldOriginAndNormal,
  principalPlanePose,
  reconcileShapeCenterInConstructionPlane,
  resolveConstructionPlaneAttachment,
  type ConstructionPlanePose,
  type PrincipalPlane,
} from "@/lib/constructionPlanes";
import { exportMeshesToObj } from "@/lib/objExport";
import { attachProjectAsset, dedupeProjectAssets, MAX_PROJECT_ASSET_BYTES, projectAssetFromBytes, sourceFormatForFileName } from "@/lib/projectAssets";
import { findSketchOutlineIntersection } from "@/lib/sketchProfileValidation";
import { cadSketchProfileForRegions, cadSketchRegions, cadSketchSelectableRegions, selectedCadSketchRegions } from "@/lib/sketchCadProfile";
import { sketchDimensionAnchorKey, sketchDistanceDimensionValue } from "@/lib/sketchDimensions";
import { buildSketchRevolveMesh, DEFAULT_SKETCH_REVOLVE_SETTINGS, normalizeSketchRevolveSettings, type SketchRevolveMesh } from "@/lib/sketchRevolve";
import { exportSkfProject, SKF_MEDIA_TYPE } from "@/lib/skfProject";
import { makeShapeFromAsset, sceneShape, toolbarShapeAssets, type ToolbarShapeAsset } from "@/lib/shapeCatalog";
import { importedShapeFromStl, importExtensionSupported } from "@/lib/stlImport";
import { exportMeshesToStl } from "@/lib/stlExport";
import { exportMeshesTo3mf, importedShapeFrom3mf } from "@/lib/threeMf";
import { importedShapeFromSvg, invalidSvgMeshReason } from "@/lib/svgImport";
import { toSvgProjection, type SvgProjectionLayer } from "@/lib/svgExport";
import { normalizeSnapGrid, normalizeWorkspaceSettings, workplaneSettingsFingerprint } from "@/lib/workplaneSettings";
import {
  normalizePlacementWorkplane,
  placementPatchForNewShape,
  placementWorkplaneCoordinates,
  placementWorkplaneFromSurface,
  placementWorkplaneIsBase,
  placementWorkplaneQuaternion,
  translationToWorkplane,
  type PlacementPoint,
  type PlacementWorkplane,
} from "@/lib/placementWorkplane";
import { placeSketchExtrusion } from "@/lib/sketchPlacement";
import {
  SKETCHFORGE_MCP_POLL_MS,
  SKETCHFORGE_MCP_ROUTE,
  type SketchForgeMcpCommand,
  type SketchForgeMcpSceneSummary,
  type SketchForgeMcpShapeSummary,
  type SketchForgeMcpViewFace,
} from "@/lib/sketchforgeMcpProtocol";
import type { CadModifierComponentMesh, CadModifierDisplayEdge, CadModifierEdge, CadModifierKind, CadModifierMeshPart, CadModifierPrimitivePart, CadModifierQuality, CadModifierWorkerRequest, CadModifierWorkerResponse } from "@/lib/cadModifierTypes";
import type { SketchCadBuildResponse } from "@/lib/sketchCadTypes";
import { appColorModeForThemePreset, customThemeWithDefaults, defaultThemes, THEME_PRESET_OPTIONS } from "@/lib/themes";
import type { AlignAxis, AlignHandleStatus, AlignTarget, GridSize, ProjectAsset, ShapeAsset, SketchDimensionAnchor, SketchImage, SketchOperation, SketchPoint, SketchProfile, SketchRevolveSettings, SketchSegment, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

export { importedShapeFrom3mf, importedShapeFromStl, importedShapeFromSvg };

type TopPanel = "import" | "export" | "tips" | "profile" | "settings" | null;
type ExportFormat = "stl" | "3mf" | "obj" | "step" | "svg" | "skf";
type DirectExportFormat = Exclude<ExportFormat, "step" | "skf">;
type SkfHistoryLimit = EditorHistoryExportLimit;
type SkfExportTarget = "download" | "shared";
type ToolbarMode = "geometry" | "sketch";
type SketchCommandKind = "sweep" | "project" | "offset" | "mirror" | "rectangular-pattern" | "circular-pattern";
type SketchOffsetCommandOptions = { distance: number; includeConnected: boolean };
type SketchProjectCommandOptions = { sourceShapeId: string; linked: boolean };
type SketchMirrorOptions = { axis: "x" | "z" | "segment"; segmentId?: string };
type SketchRectangularPatternOptions = { columns: number; rows: number; columnSpacing: number; rowSpacing: number; segmentId?: string };
type SketchCircularPatternOptions = { count: number; angle: number; pointId?: string };
type Vec3 = [number, number, number];
type MeshData = { name: string; vertices: Vec3[]; faces: [number, number, number][] };
type Cuboid = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type ShapeUpdatePatch = Partial<WorkplaneShape> & { bakeTransform?: boolean };
type WithoutRequestId<T> = T extends unknown ? Omit<T, "requestId"> : never;
type CadModifierWorkerPayload = WithoutRequestId<CadModifierWorkerRequest>;
type EdgeModifierSession = {
  kind: CadModifierKind;
  edges: CadModifierEdge[];
  selectedEdgeIds: number[];
  amount: number;
  sharpAngle: number;
  chamferAngle: number;
  quality: CadModifierQuality;
  tangentChain: boolean;
  preserveEdgeSize: boolean;
  busy: boolean;
  prepared: boolean;
  error: string | null;
  preview: WorkplaneShape | null;
  componentPreviews: EdgeModifierComponentPreview[];
};

type EdgeModifierComponentPreview = {
  owner: number;
  shape: WorkplaneShape;
};
type EdgeFeatureRevertOption = {
  id: string;
  entryId: string;
  path: number[];
  label: string;
  targetName: string;
  createdAt: number;
  removesNewerCount: number;
};
type ManifoldSolid = ReturnType<ManifoldToplevel["Manifold"]["cube"]>;
type DownloadResult = { mode: "browser" } | { mode: "folder"; path: string };
type GroupBuildResult = {
  group: WorkplaneShape | null;
  booleanSelection: WorkplaneShape[];
  hasSolid: boolean;
  hasHole: boolean;
  hasImportedMesh: boolean;
  consumed: boolean;
  failureNotice: string;
};
type IntersectionAttempt =
  | { status: "success"; group: WorkplaneShape }
  | { status: "empty" }
  | { status: "unsupported" };
type IntersectionBuildResult = {
  group: WorkplaneShape | null;
  empty: boolean;
  failureNotice: string;
};
type BooleanAutomationMode = "before" | "after" | "ungroup";
type BooleanAutomationResult = {
  ok: boolean;
  caseId: string;
  label: string;
  mode: BooleanAutomationMode;
  notice: string;
  shapeCount: number;
  selectedCount: number;
  triangleCount?: number;
  groupedCount?: number;
  groupId?: string;
  error?: string;
};
const DOWNLOAD_MODE_STORAGE_KEY = "sketchForge.downloadMode";
const DOWNLOAD_FOLDER_STORAGE_KEY = "sketchForge.downloadFolder";
const SHARED_CLIPBOARD_STORAGE_KEY = "sketchForge.clipboard";
const SYSTEM_CLIPBOARD_PREFIX = "SKETCHFORGE3D/1\n";
const STATIC_EXPORT_BUILD = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

declare global {
  interface Window {
    __sketchforgeBooleanTest?: BooleanAutomationResult;
    __sketchforgeBooleanTestImage?: string;
    sketchforgeCaptureCanvas?: () => string;
    sketchforgeCaptureCanvasAsync?: () => Promise<string>;
    sketchforgeCaptureView?: (face?: SketchForgeMcpViewFace) => Promise<string> | string;
  }
}

const CUTTER_PADDING = 0.05;
const POINT_TOLERANCE = 0.0001;
const CUTTER_RESIDUAL_INSET = CUTTER_PADDING * 0.4;
const MIN_SHAPE_DIMENSION = 0.01;
const MAX_SKETCH_HISTORY_ENTRIES = 100;
const BASE_CONSTRUCTION_PLANE_ID = "construction-plane-base";
const MODEL_DIMENSION_PRECISION = 3;
const IMPORTED_EXACT_BOOLEAN_TRIANGLE_LIMIT = 150000;
const COPLANAR_BOOLEAN_RESCUE_DEGREES = 0.02;
const NORMAL_SELECTION_CAD_EDGE_MIN_ANGLE = 60;
const MIN_EDGE_MODIFIER_AMOUNT = 0.001;
const SEPARATE_PARTS_VERTEX_TOLERANCE = 0.0005;
const booleanFontLoader = new FontLoader();
const booleanTextFonts: Record<string, Font> = {
  Multilanguage: booleanFontLoader.parse(helvetikerBoldFontJson as FontData),
  Sans: booleanFontLoader.parse(droidSansBoldFontJson as FontData),
  Serif: booleanFontLoader.parse(droidSerifBoldFontJson as FontData),
  Script: booleanFontLoader.parse(gentilisBoldFontJson as FontData),
  Monospace: booleanFontLoader.parse(droidMonoFontJson as FontData),
  Rounded: booleanFontLoader.parse(optimerBoldFontJson as FontData),
  Stencil: booleanFontLoader.parse(helvetikerBoldFontJson as FontData),
};
let manifoldRuntimePromise: Promise<ManifoldToplevel> | null = null;

function emptySketchProfile(): SketchProfile {
  return { points: [], segments: [], constraints: [], dimensions: [], images: [] };
}

function cloneSketchProfile(profile: SketchProfile): SketchProfile {
  return {
    points: profile.points.map((point) => ({
      ...point,
      handleIn: point.handleIn ? { ...point.handleIn } : undefined,
      handleOut: point.handleOut ? { ...point.handleOut } : undefined,
    })),
    segments: profile.segments.map((segment) => ({
      ...segment,
      dimensionLabelOffset: segment.dimensionLabelOffset ? { ...segment.dimensionLabelOffset } : undefined,
    })),
    constraints: (profile.constraints ?? []).map((constraint) => ({ ...constraint })),
    dimensions: (profile.dimensions ?? []).map((dimension) => dimension.kind === "length"
      ? { ...dimension }
      : { ...dimension, start: { ...dimension.start }, end: { ...dimension.end } }),
    images: (profile.images ?? []).map((image) => ({ ...image })),
    texts: (profile.texts ?? []).map((text) => ({ ...text })),
    projections: (profile.projections ?? []).map((projection) => ({ ...projection })),
  };
}

function sketchTransformSelection(selection: SketchSelection): SketchTransformSelection {
  if (!selection) return { pointIds: [], segmentIds: [], imageIds: [], textIds: [] };
  if (selection.kind === "point") return { pointIds: [selection.id], segmentIds: [], imageIds: [], textIds: [] };
  if (selection.kind === "segment") return { pointIds: [], segmentIds: [selection.id], imageIds: [], textIds: [] };
  if (selection.kind === "image") return { pointIds: [], segmentIds: [], imageIds: [selection.id], textIds: [] };
  if (selection.kind === "text") return { pointIds: [], segmentIds: [], imageIds: [], textIds: [selection.id] };
  return {
    pointIds: selection.pointIds,
    segmentIds: selection.segmentIds,
    imageIds: selection.imageIds ?? [],
    textIds: selection.textIds ?? [],
  };
}

function withoutSketchReferenceSegment(profile: SketchProfile, selection: SketchTransformSelection, segmentId?: string) {
  if (!segmentId) return selection;
  const reference = profile.segments.find((segment) => segment.id === segmentId);
  if (!reference) return selection;
  return {
    ...selection,
    pointIds: selection.pointIds.filter((id) => id !== reference.startId && id !== reference.endId),
    segmentIds: selection.segmentIds.filter((id) => id !== segmentId),
  };
}

function hasSketchTransformSelection(selection: SketchTransformSelection) {
  return selection.pointIds.length + selection.segmentIds.length + selection.imageIds.length + selection.textIds.length > 0;
}

function planeEulerDegrees(pose: ConstructionPlanePose) {
  const quaternion = new THREE.Quaternion(...pose.quaternion).normalize();
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    rotationX: THREE.MathUtils.radToDeg(euler.x),
    rotation: THREE.MathUtils.radToDeg(euler.y),
    rotationZ: THREE.MathUtils.radToDeg(euler.z),
  };
}

function modifiedConstructionPlanePose(pose: ConstructionPlanePose, offset = 0, angle = 0, flipped = false) {
  let resolved = offset ? offsetConstructionPlanePose(pose, offset) : pose;
  if (angle) resolved = angledConstructionPlanePose(resolved, angle);
  if (flipped) resolved = flipConstructionPlanePose(resolved);
  return resolved;
}

function referencedConstructionPlanePose(
  id: string,
  shapes: WorkplaneShape[],
  resolving: ReadonlySet<string>,
): ConstructionPlanePose | null {
  if (id === BASE_CONSTRUCTION_PLANE_ID) return BASE_CONSTRUCTION_PLANE_POSE;
  const plane = shapes.find((shape) => shape.id === id && shape.kind === "constructionPlane");
  if (!plane || resolving.has(plane.id)) return null;
  return resolvedConstructionPlanePose(plane, shapes, resolving) ?? plane.constructionPlane?.pose ?? null;
}

function resolvedConstructionPlanePose(
  plane: WorkplaneShape,
  shapes: WorkplaneShape[],
  resolving: ReadonlySet<string> = new Set(),
): ConstructionPlanePose | null {
  const definition = plane.constructionPlane;
  if (!definition) return null;
  if (resolving.has(plane.id)) return null;
  const nextResolving = new Set(resolving).add(plane.id);
  if (definition.kind === "principal") {
    return principalPlanePose(definition.principal, definition.offset, definition.angle ?? 0, definition.flipped ?? false);
  }
  if (definition.kind === "face") {
    const source = shapes.find((shape) => shape.id === definition.sourceShapeId);
    return source
      ? resolveConstructionPlaneAttachment(definition.attachment, source, definition.offset ?? 0, definition.angle ?? 0, definition.flipped ?? false)
      : definition.pose;
  }
  if (definition.kind === "angle") {
    const reference = referencedConstructionPlanePose(definition.referencePlaneId, shapes, nextResolving);
    return reference
      ? modifiedConstructionPlanePose(reference, definition.offset ?? 0, definition.angle, definition.flipped ?? false)
      : definition.pose;
  }
  const first = referencedConstructionPlanePose(definition.firstPlaneId, shapes, nextResolving);
  const second = referencedConstructionPlanePose(definition.secondPlaneId, shapes, nextResolving);
  return first && second && constructionPlanePosesAreParallel(first, second)
    ? midplaneConstructionPlanePose(first, second, definition.offset ?? 0)
    : definition.pose;
}

function constructionPlanePoseById(id: string, shapes: WorkplaneShape[], fallback = BASE_CONSTRUCTION_PLANE_POSE) {
  return referencedConstructionPlanePose(id, shapes, new Set()) ?? fallback;
}

function placementWorkplaneForConstructionPlanePose(pose: ConstructionPlanePose) {
  const quaternion = new THREE.Quaternion(...pose.quaternion).normalize();
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  return placementWorkplaneFromSurface(
    { x: pose.origin[0], y: pose.origin[1], z: pose.origin[2] },
    { x: normal.x, y: normal.y, z: normal.z },
    { x: xAxis.x, y: xAxis.y, z: xAxis.z },
  );
}

function constructionPlanePoseForPlacementWorkplane(workplane: PlacementWorkplane): ConstructionPlanePose {
  const quaternion = placementWorkplaneQuaternion(workplane);
  return {
    origin: [workplane.origin.x, workplane.origin.y, workplane.origin.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  };
}

function constructionPlaneShapeWithPose(shape: WorkplaneShape, pose: ConstructionPlanePose): WorkplaneShape {
  const rotation = planeEulerDegrees(pose);
  return canonicalizeShape({
    ...shape,
    x: pose.origin[0],
    z: pose.origin[2],
    elevation: pose.origin[1] - shape.height / 2,
    ...rotation,
    constructionPlane: shape.constructionPlane ? { ...shape.constructionPlane, pose } : undefined,
  });
}

function createConstructionPlaneShape(name: string, definition: NonNullable<WorkplaneShape["constructionPlane"]>, width: number, depth: number) {
  return constructionPlaneShapeWithPose({
    id: createLocalId("construction-plane"),
    name,
    kind: "constructionPlane",
    color: "#20a8d8",
    x: definition.pose.origin[0],
    z: definition.pose.origin[2],
    elevation: definition.pose.origin[1] - 0.05,
    size: Math.max(width, depth),
    width,
    depth,
    height: 0.1,
    rotation: 0,
    locked: true,
    constructionPlane: definition,
  }, definition.pose);
}

function sketchShapeWithPlanePose(shape: WorkplaneShape, constructionPlaneId: string, pose: ConstructionPlanePose, localCenter?: [number, number, number]) {
  const center = localCenter ?? [shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z];
  const worldCenter = localPointToWorld(pose, center);
  const rotation = planeEulerDegrees(pose);
  return canonicalizeShape({
    ...shape,
    x: worldCenter[0],
    z: worldCenter[2],
    elevation: worldCenter[1] - shape.height / 2,
    ...rotation,
    sketchPlane: { constructionPlaneId, pose, localCenter: [...center] },
  });
}

function refreshConstructionPlaneShapes(shapes: WorkplaneShape[], previousShapes: WorkplaneShape[] = []) {
  const withUpdatedSketchCenters = shapes.map((shape) => {
    if (!shape.sketchPlane) return shape;
    const previous = previousShapes.find((candidate) => candidate.id === shape.id);
    const pose = constructionPlanePoseById(shape.sketchPlane.constructionPlaneId, shapes, shape.sketchPlane.pose);
    const localCenter = reconcileShapeCenterInConstructionPlane(shape, previous, pose, shape.sketchPlane.localCenter);
    if (localCenter.every((value, index) => value === shape.sketchPlane?.localCenter[index])) return shape;
    return { ...shape, sketchPlane: { ...shape.sketchPlane, pose, localCenter } };
  });
  const refreshPlanes = (entries: WorkplaneShape[]) => entries.map((shape) => {
    if (shape.kind !== "constructionPlane") return shape;
    const pose = resolvedConstructionPlanePose(shape, entries);
    return pose ? constructionPlaneShapeWithPose(shape, pose) : shape;
  });
  const applySketchPlanes = (entries: WorkplaneShape[]) => entries.map((shape) => {
    if (!shape.sketchPlane) return shape;
    const plane = entries.find((candidate) => candidate.id === shape.sketchPlane?.constructionPlaneId);
    const pose = plane ? resolvedConstructionPlanePose(plane, entries) : shape.sketchPlane.pose;
    return pose ? sketchShapeWithPlanePose(shape, shape.sketchPlane.constructionPlaneId, pose, shape.sketchPlane.localCenter) : shape;
  });
  const firstAttachmentPass = applySketchPlanes(refreshPlanes(withUpdatedSketchCenters));
  return applySketchPlanes(refreshPlanes(firstAttachmentPass));
}

type OrderedSketchStep = { segment: SketchProfile["segments"][number]; from: SketchPoint; to: SketchPoint };
type OrderedSketchPath = { points: SketchPoint[]; steps: OrderedSketchStep[]; closed: boolean };

function orderedSketchPaths(profile: SketchProfile): OrderedSketchPath[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchProfile["segments"][number] }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const validSegments = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId) || segment.startId === segment.endId) return;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(validSegments.map((segment) => segment.id));
  const paths: OrderedSketchPath[] = [];
  while (unvisited.size > 0) {
    const seedId = unvisited.values().next().value as string | undefined;
    const seed = validSegments.find((segment) => segment.id === seedId);
    if (!seed) break;
    const componentIds = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length > 0) {
      const id = queue.pop();
      if (!id || componentIds.has(id)) continue;
      componentIds.add(id);
      adjacency.get(id)?.forEach((entry) => queue.push(entry.pointId));
    }
    const startId = [...componentIds].find((id) => (adjacency.get(id)?.filter((entry) => unvisited.has(entry.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) {
      unvisited.delete(seed.id);
      continue;
    }
    const points = [first];
    const steps: OrderedSketchStep[] = [];
    let currentId = startId;
    for (let guard = 0; guard <= validSegments.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((entry) => unvisited.has(entry.segment.id));
      if (!edge) break;
      const from = pointById.get(currentId);
      const to = pointById.get(edge.pointId);
      if (!from || !to) break;
      unvisited.delete(edge.segment.id);
      steps.push({ segment: edge.segment, from, to });
      currentId = to.id;
      if (currentId === startId) break;
      points.push(to);
    }
    paths.push({ points, steps, closed: currentId === startId && steps.length >= 3 });
  }
  return paths;
}

function withSmoothSketchHandles(profile: SketchProfile) {
  const next = cloneSketchProfile(profile);
  const points = new Map(next.points.map((point) => [point.id, point]));
  orderedSketchPaths(next).forEach((path) => {
    path.points.forEach((sourcePoint, index) => {
      const point = points.get(sourcePoint.id);
      if (!point) return;
      const previous = path.closed ? path.points[(index - 1 + path.points.length) % path.points.length] : path.points[Math.max(0, index - 1)];
      const following = path.closed ? path.points[(index + 1) % path.points.length] : path.points[Math.min(path.points.length - 1, index + 1)];
      const tangentX = (following.x - previous.x) / 6;
      const tangentZ = (following.z - previous.z) / 6;
      point.handleIn = { x: point.x - tangentX, z: point.z - tangentZ };
      point.handleOut = { x: point.x + tangentX, z: point.z + tangentZ };
      point.mode = "smooth";
    });
  });
  return next;
}

async function shapeFromResolvedSketchProfile(
  profile: SketchProfile,
  polygons: Array<Array<[number, number]>>,
  height: number,
  centerX: number,
  centerZ: number,
  existing?: WorkplaneShape | null,
) {
  const runtime = await getManifoldRuntime();
  const disposable: unknown[] = [];
  try {
    const section = new runtime.CrossSection(polygons, "EvenOdd");
    disposable.push(section);
    const coordinateScale = polygons.reduce(
      (largest, polygon) => polygon.reduce((polygonLargest, point) => Math.max(polygonLargest, Math.abs(point[0]), Math.abs(point[1])), largest),
      1,
    );
    const simplified = section.simplify(Math.max(1e-7, coordinateScale * 1e-8));
    disposable.push(simplified);
    if (simplified.toPolygons().length === 0) throw new Error("The sketch has no filled area after resolving its crossings");

    const solid = simplified.extrude(height);
    disposable.push(solid);
    if (solid.status() !== "NoError" || solid.numTri() < 1) {
      throw new Error("The crossing sketch could not be converted into a valid solid");
    }

    const manifoldPositions = manifoldMeshToPositions(solid.getMesh());
    const positions = new Array<number>(manifoldPositions.length);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index + 2 < manifoldPositions.length; index += 3) {
      const x = manifoldPositions[index];
      const y = manifoldPositions[index + 2];
      const z = -manifoldPositions[index + 1];
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const localCenterX = (minX + maxX) / 2;
    const localCenterZ = (minZ + maxZ) / 2;
    for (let index = 0; index + 2 < positions.length; index += 3) {
      positions[index] -= localCenterX;
      positions[index + 2] -= localCenterZ;
    }
    const meshWidth = Math.max(0.01, maxX - minX);
    const meshDepth = Math.max(0.01, maxZ - minZ);
    return canonicalizeShape({
      id: existing?.id ?? createLocalId("sketch-extrusion"),
      name: existing?.name ?? "Sketch extrusion",
      kind: "mesh",
      color: existing?.color ?? "#d41721",
      hole: existing?.hole,
      x: centerX + localCenterX,
      z: centerZ + localCenterZ,
      elevation: 0,
      size: Math.max(meshWidth, meshDepth),
      width: meshWidth,
      depth: meshDepth,
      height,
      rotation: 0,
      importedMesh: {
        positions,
        baseWidth: meshWidth,
        baseDepth: meshDepth,
        baseHeight: height,
        triangleCount: Math.floor(positions.length / 9),
        sourceFormat: "json",
      },
      sketchProfile: cloneSketchProfile(profile),
      sketchOperation: "extrude",
    } satisfies WorkplaneShape);
  } finally {
    [...new Set(disposable)].reverse().forEach(disposeManifold);
  }
}

async function shapeFromSketchProfile(profile: SketchProfile, height: number, existing?: WorkplaneShape | null, regionIds?: readonly string[]) {
  const geometryProfile = cadSketchProfileForRegions(profile, regionIds);
  const regions = selectedCadSketchRegions(profile, regionIds);
  if (regions.length === 0) return null;
  const closedPaths = [...new Map(
    regions.flatMap((region) => [region.outer, ...region.holes]).map((path) => [path.id, path] as const),
  ).values()];
  const profilePoints = closedPaths.flatMap((path) => path.points);
  const minX = Math.min(...profilePoints.map((point) => point.x));
  const maxX = Math.max(...profilePoints.map((point) => point.x));
  const minZ = Math.min(...profilePoints.map((point) => point.z));
  const maxZ = Math.max(...profilePoints.map((point) => point.z));
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(0.01, maxX - minX);
  const depth = Math.max(0.01, maxZ - minZ);
  const safeHeight = Math.max(0.01, height);
  const outlineRecords = closedPaths.map((path) => {
    const outline = new THREE.Shape();
    const first = path.points[0];
    outline.moveTo(first.x - centerX, -(first.z - centerZ));
    path.steps.forEach(({ segment, from, to }) => {
      const forward = segment.startId === from.id;
      const control1 = forward ? from.handleOut : from.handleIn;
      const control2 = forward ? to.handleIn : to.handleOut;
      if (segment.kind !== "line" && control1 && control2) {
        outline.bezierCurveTo(
          control1.x - centerX,
          -(control1.z - centerZ),
          control2.x - centerX,
          -(control2.z - centerZ),
          to.x - centerX,
          -(to.z - centerZ),
        );
      } else {
        outline.lineTo(to.x - centerX, -(to.z - centerZ));
      }
    });
    outline.closePath();
    const polygon = outline.extractPoints(16).shape;
    return { id: path.id, outline, polygon };
  });
  const hasCurves = geometryProfile.segments.some((segment) => segment.kind === "bezier" || segment.kind === "smooth");
  const longestHandle = geometryProfile.points.reduce((longest, point) => Math.max(
    longest,
    point.handleIn ? Math.hypot(point.handleIn.x - point.x, point.handleIn.z - point.z) : 0,
    point.handleOut ? Math.hypot(point.handleOut.x - point.x, point.handleOut.z - point.z) : 0,
  ), 0);
  const curveScale = Math.max(width, depth, longestHandle * 2);
  const curveSegments = hasCurves ? Math.min(256, Math.max(32, Math.ceil(curveScale * 1.25))) : 1;
  const sampledPolygons = outlineRecords.map((record) => record.outline.extractPoints(curveSegments).shape);
  if (findSketchOutlineIntersection(sampledPolygons)) {
    return shapeFromResolvedSketchProfile(
      profile,
      sampledPolygons.map((polygon) => polygon.map((point) => [point.x, point.y] as [number, number])),
      safeHeight,
      centerX,
      centerZ,
      existing,
    );
  }
  const outlineById = new Map(outlineRecords.map((record) => [record.id, record.outline]));
  const outlines = regions.flatMap((region) => {
    const outline = outlineById.get(region.outer.id);
    if (!outline) return [];
    outline.holes.push(...region.holes.flatMap((hole) => {
      const holeOutline = outlineById.get(hole.id);
      return holeOutline ? [holeOutline] : [];
    }));
    return [outline];
  });
  const geometry = new THREE.ExtrudeGeometry(outlines, { depth: safeHeight, bevelEnabled: false, steps: 1, curveSegments });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const geometryBox = geometry.boundingBox;
  const meshWidth = Math.max(0.01, geometryBox ? geometryBox.max.x - geometryBox.min.x : width);
  const meshDepth = Math.max(0.01, geometryBox ? geometryBox.max.z - geometryBox.min.z : depth);
  const meshCenterX = centerX + (geometryBox ? (geometryBox.min.x + geometryBox.max.x) / 2 : 0);
  const meshCenterZ = centerZ + (geometryBox ? (geometryBox.min.z + geometryBox.max.z) / 2 : 0);
  const meshGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = meshGeometry.getAttribute("position");
  const normal = meshGeometry.getAttribute("normal");
  const positions = Array.from(position.array as ArrayLike<number>);
  const normals = normal ? Array.from(normal.array as ArrayLike<number>) : undefined;
  if (meshGeometry !== geometry) meshGeometry.dispose();
  geometry.dispose();
  return canonicalizeShape({
    id: existing?.id ?? createLocalId("sketch-extrusion"),
    name: existing?.name ?? "Sketch extrusion",
    kind: "mesh",
    color: existing?.color ?? "#d41721",
    hole: existing?.hole,
    x: meshCenterX,
    z: meshCenterZ,
    elevation: 0,
    size: Math.max(meshWidth, meshDepth),
    width: meshWidth,
    depth: meshDepth,
    height: safeHeight,
    rotation: 0,
    importedMesh: {
      positions,
      normals,
      baseWidth: meshWidth,
      baseDepth: meshDepth,
      baseHeight: safeHeight,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "extrude",
  } satisfies WorkplaneShape);
}

async function shapeFromRevolvedSketchProfile(
  profile: SketchProfile,
  settings: Partial<SketchRevolveSettings>,
  existing?: WorkplaneShape | null,
) {
  try {
    return await cadShapeFromSketchRevolveProfile(profile, settings, existing);
  } catch {
    const runtime = await getManifoldRuntime();
    const normalizedSettings = normalizeSketchRevolveSettings(settings);
    const mesh = buildSketchRevolveMesh(runtime, profile, normalizedSettings);
    return canonicalizeShape({
      id: existing?.id ?? createLocalId("sketch-revolve"),
      name: existing?.name ?? "Sketch revolve",
      kind: "mesh",
      color: existing?.color ?? "#78b96b",
      hole: existing?.hole,
      x: existing?.x ?? 0,
      z: existing?.z ?? 0,
      elevation: existing?.elevation ?? 0,
      size: Math.max(mesh.width, mesh.depth),
      width: mesh.width,
      depth: mesh.depth,
      height: mesh.height,
      rotation: existing?.rotation ?? 0,
      rotationX: existing?.rotationX ?? 0,
      rotationZ: existing?.rotationZ ?? 0,
      mirrorX: existing?.mirrorX,
      mirrorY: existing?.mirrorY,
      mirrorZ: existing?.mirrorZ,
      importedMesh: {
        positions: mesh.positions,
        baseWidth: mesh.width,
        baseDepth: mesh.depth,
        baseHeight: mesh.height,
        triangleCount: mesh.triangleCount,
        sourceFormat: "json",
      },
      sketchProfile: cloneSketchProfile(profile),
      sketchOperation: "revolve",
      sketchRevolve: normalizedSettings,
      sketchPlane: existing?.sketchPlane,
      locked: existing?.locked ?? false,
      hidden: existing?.hidden ?? false,
    } satisfies WorkplaneShape);
  }
}

function shapeFromSketchSweep(profile: SketchProfile, selectedSegmentIds: readonly string[], existing?: WorkplaneShape | null) {
  const { geometry, section, path } = buildSketchSweepGeometry(profile, selectedSegmentIds);
  try {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error("The sweep did not produce any geometry");
    const centerX = (bounds.min.x + bounds.max.x) / 2;
    const centerZ = (bounds.min.z + bounds.max.z) / 2;
    const minY = bounds.min.y;
    const rawWidth = Math.max(MIN_SHAPE_DIMENSION, bounds.max.x - bounds.min.x);
    const rawDepth = Math.max(MIN_SHAPE_DIMENSION, bounds.max.z - bounds.min.z);
    const rawHeight = Math.max(MIN_SHAPE_DIMENSION, bounds.max.y - bounds.min.y);
    const meshGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
    try {
      const position = meshGeometry.getAttribute("position");
      const normal = meshGeometry.getAttribute("normal");
      if (!position || position.count < 3) throw new Error("The sweep did not produce any triangles");
      const positions = Array.from(position.array as ArrayLike<number>);
      for (let index = 0; index + 2 < positions.length; index += 3) {
        positions[index] -= centerX;
        positions[index + 1] -= minY;
        positions[index + 2] -= centerZ;
      }
      const normals = normal ? Array.from(normal.array as ArrayLike<number>) : undefined;
      const width = cleanModelDimension(rawWidth);
      const depth = cleanModelDimension(rawDepth);
      const height = cleanModelDimension(rawHeight);
      return canonicalizeShape({
        ...(existing ?? {
          id: createLocalId("sketch-sweep"),
          name: "Sketch sweep",
          color: "#d41721",
          hole: false,
        }),
        kind: "mesh",
        x: cleanNearZero(centerX, 0.0005),
        z: cleanNearZero(centerZ, 0.0005),
        elevation: cleanNearZero(minY, 0.0005),
        size: Math.max(width, depth),
        width,
        depth,
        height,
        rotation: 0,
        rotationX: 0,
        rotationZ: 0,
        mirrorX: undefined,
        mirrorY: undefined,
        mirrorZ: undefined,
        importedMesh: {
          positions,
          normals: normals?.length === positions.length ? normals : undefined,
          baseWidth: rawWidth,
          baseDepth: rawDepth,
          baseHeight: rawHeight,
          triangleCount: Math.floor(positions.length / 9),
          sourceFormat: "json",
        },
        imagePlate: undefined,
        sketchProfile: cloneSketchProfile(profile),
        sketchFeature: {
          kind: "sweep",
          sectionSegmentIds: section.steps.map((step) => step.segment.id),
          pathSegmentIds: path.steps.map((step) => step.segment.id),
        },
        edgeTreatments: undefined,
        edgeTreatmentHistory: undefined,
        cadDisplayEdges: undefined,
        cadDisplayEdgesVersion: undefined,
        cadBrep: undefined,
        cadBrepFrame: undefined,
        cadPrimitiveFrame: undefined,
      } satisfies WorkplaneShape);
    } finally {
      if (meshGeometry !== geometry) meshGeometry.dispose();
    }
  } finally {
    geometry.dispose();
  }
}

let sketchCadWorker: Worker | null = null;
let sketchCadRequestId = 0;
const sketchCadPending = new Map<number, {
  resolve: (response: SketchCadBuildResponse) => void;
  reject: (error: Error) => void;
  timer: number;
}>();

function ensureSketchCadWorker(): Worker {
  if (sketchCadWorker) return sketchCadWorker;
  const worker = new Worker(new URL("../workers/sketchCad.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SketchCadBuildResponse>) => {
    const pending = sketchCadPending.get(event.data.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    sketchCadPending.delete(event.data.requestId);
    pending.resolve(event.data);
  };
  worker.onerror = () => {
    sketchCadPending.forEach((pending) => {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("The OpenCascade sketch worker failed to start"));
    });
    sketchCadPending.clear();
    worker.terminate();
    sketchCadWorker = null;
  };
  sketchCadWorker = worker;
  return worker;
}

async function cadShapeFromSketchProfile(profile: SketchProfile, height: number, existing?: WorkplaneShape | null, regionIds?: readonly string[]) {
  const safeHeight = Math.max(MIN_SHAPE_DIMENSION, height);
  const worker = ensureSketchCadWorker();
  const requestId = ++sketchCadRequestId;
  const response = await new Promise<SketchCadBuildResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sketchCadPending.delete(requestId);
      reject(new Error("OpenCascade timed out while building the sketch"));
    }, 30_000);
    sketchCadPending.set(requestId, { resolve, reject, timer });
    worker.postMessage({ type: "build", requestId, profile: cloneSketchProfile(profile), regionIds: regionIds ? [...regionIds] : undefined, height: safeHeight });
  });
  if (response.type === "error") throw new Error(response.message);
  const source = canonicalizeShape({
    ...(existing ?? {
      id: createLocalId("sketch-extrusion"),
      name: "Sketch extrusion",
      kind: "mesh" as const,
      color: "#d41721",
      x: 0,
      z: 0,
      size: 1,
      width: 1,
      depth: 1,
      height: safeHeight,
      rotation: 0,
    }),
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "extrude",
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
  });
  const shape = shapeFromCadMesh(source, response.positions, response.normals, response.indices, response.brep);
  if (!shape) throw new Error("OpenCascade returned an empty sketch solid");
  return { ...shape, sketchProfile: cloneSketchProfile(profile), sketchOperation: "extrude" as const };
}

async function cadShapeFromSketchRevolveProfile(
  profile: SketchProfile,
  settings: Partial<SketchRevolveSettings>,
  existing?: WorkplaneShape | null,
) {
  const normalizedSettings = normalizeSketchRevolveSettings(settings);
  const worker = ensureSketchCadWorker();
  const requestId = ++sketchCadRequestId;
  const response = await new Promise<SketchCadBuildResponse>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      sketchCadPending.delete(requestId);
      reject(new Error("OpenCascade timed out while revolving the sketch"));
    }, 30_000);
    sketchCadPending.set(requestId, { resolve, reject, timer });
    worker.postMessage({ type: "revolve", requestId, profile: cloneSketchProfile(profile), settings: normalizedSettings });
  });
  if (response.type === "error") throw new Error(response.message);
  const source = canonicalizeShape({
    ...(existing ?? {
      id: createLocalId("sketch-revolve"),
      name: "Sketch revolve",
      kind: "mesh" as const,
      color: "#78b96b",
      x: 0,
      z: 0,
      size: 1,
      width: 1,
      depth: 1,
      height: 1,
      rotation: 0,
    }),
    sketchProfile: cloneSketchProfile(profile),
    sketchOperation: "revolve",
    sketchRevolve: normalizedSettings,
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
  });
  const shape = shapeFromCadMesh(source, response.positions, response.normals, response.indices, response.brep);
  if (!shape) throw new Error("OpenCascade returned an empty revolve solid");
  return { ...shape, sketchProfile: cloneSketchProfile(profile), sketchOperation: "revolve" as const, sketchRevolve: normalizedSettings };
}

function cleanModelDimension(value: number) {
  return Math.max(MIN_SHAPE_DIMENSION, Number(value.toFixed(MODEL_DIMENSION_PRECISION)));
}

function parseClipboardShapes(serialized: string) {
  try {
    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((shape: Partial<WorkplaneShape>) => {
      const { name, kind, color } = shape;
      if (typeof name !== "string" || typeof kind !== "string" || typeof color !== "string") {
        return [];
      }
      return [canonicalizeShape(sceneShape({ ...shape, name, kind, color }))];
    });
  } catch {
    return [];
  }
}

function readSharedClipboard() {
  if (typeof window === "undefined") {
    return [];
  }
  return parseClipboardShapes(window.localStorage.getItem(SHARED_CLIPBOARD_STORAGE_KEY) ?? "[]");
}

async function readSystemClipboard() {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return [];
  }
  try {
    const value = await navigator.clipboard.readText();
    return value.startsWith(SYSTEM_CLIPBOARD_PREFIX)
      ? parseClipboardShapes(value.slice(SYSTEM_CLIPBOARD_PREFIX.length))
      : [];
  } catch {
    return [];
  }
}

function copyTextWithSelectionFallback(value: string) {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return;
  }
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {
    // The modern Clipboard API below may still succeed.
  }
  textarea.remove();
  previousFocus?.focus({ preventScroll: true });
}

function writeSharedClipboard(shapes: WorkplaneShape[]) {
  if (typeof window === "undefined") {
    return;
  }
  const serialized = serializeShapesForSync(shapes);
  try {
    window.localStorage.setItem(SHARED_CLIPBOARD_STORAGE_KEY, serialized);
  } catch {
    // The system clipboard can still carry large models if local storage is full.
  }
  const systemPayload = `${SYSTEM_CLIPBOARD_PREFIX}${serialized}`;
  copyTextWithSelectionFallback(systemPayload);
  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(systemPayload).catch(() => {
      // Same-origin tabs still have the local-storage fallback.
    });
  }
}

function base64ToUint8Array(value: string) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importBundledManifoldModule() {
  const blobUrl = URL.createObjectURL(new Blob([manifoldModuleSource], { type: "text/javascript" }));
  try {
    return (await import(/* webpackIgnore: true */ blobUrl)) as { default: typeof manifoldModule };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function getManifoldRuntime() {
  const assetBase = typeof window === "undefined" ? "/" : new URL(".", window.location.href).href;
  const isFileBuild = typeof window !== "undefined" && window.location.protocol === "file:";
  const manifoldScriptUrl = new URL("manifold.js", assetBase).href;
  const runtimeModule = isFileBuild
    ? importBundledManifoldModule().then((module) => module.default)
    : import(/* webpackIgnore: true */ manifoldScriptUrl).then((module) => (module as { default: typeof manifoldModule }).default);
  manifoldRuntimePromise ??= runtimeModule
    .then((module) => {
      if (isFileBuild) {
        return (module as unknown as (config: { wasmBinary: Uint8Array }) => Promise<ManifoldToplevel>)({
          wasmBinary: base64ToUint8Array(manifoldWasmBase64),
        });
      }
      return module({
        locateFile: ((file: string) => (file.endsWith(".wasm") ? new URL("manifold.wasm", assetBase).href : new URL(file, assetBase).href)) as () => string,
      });
    })
    .then((runtime) => {
      runtime.setup();
      return runtime;
    });
  return manifoldRuntimePromise;
}
function stlBoxTrianglePositions(width: number, depth: number, height: number) {
  const x = width / 2;
  const z = depth / 2;
  const vertices: Vec3[] = [
    [-x, 0, -z],
    [x, 0, -z],
    [x, 0, z],
    [-x, 0, z],
    [-x, height, -z],
    [x, height, -z],
    [x, height, z],
    [-x, height, z],
  ];
  const faces: [number, number, number][] = [
    [0, 1, 2],
    [0, 2, 3],
    [4, 6, 5],
    [4, 7, 6],
    [0, 5, 1],
    [0, 4, 5],
    [1, 6, 2],
    [1, 5, 6],
    [2, 7, 3],
    [2, 6, 7],
    [3, 4, 0],
    [3, 7, 4],
  ];
  return faces.flatMap((face) => face.flatMap((index) => vertices[index]));
}

function automationSolidBox(overrides: Partial<WorkplaneShape> = {}) {
  return sceneShape({
    id: "solid-cube",
    name: "Solid cube",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    width: 28,
    depth: 28,
    height: 28,
    ...overrides,
  });
}

function automationHoleBox(overrides: Partial<WorkplaneShape> = {}) {
  return sceneShape({
    id: "hole-cube",
    name: "Hole cube",
    kind: "box",
    color: "#b8c2cc",
    hole: true,
    x: 0,
    z: 0,
    elevation: -4,
    width: 13,
    depth: 40,
    height: 36,
    ...overrides,
  });
}

function automationImportedStlBox(overrides: Partial<WorkplaneShape> = {}) {
  const width = overrides.width ?? 28;
  const depth = overrides.depth ?? 28;
  const height = overrides.height ?? 28;
  return sceneShape({
    id: "imported-stl-cube",
    name: "Imported STL cube",
    kind: "mesh",
    color: "#0098c7",
    x: 0,
    z: 0,
    width,
    depth,
    height,
    importedMesh: {
      positions: stlBoxTrianglePositions(width, depth, height),
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: 12,
      sourceFormat: "stl",
    },
    ...overrides,
  });
}

function automationHoleStlBox(overrides: Partial<WorkplaneShape> = {}) {
  return automationImportedStlBox({
    id: "hole-stl",
    name: "Hole STL",
    color: "#b8c2cc",
    hole: true,
    elevation: -4,
    width: 13,
    depth: 40,
    height: 38,
    ...overrides,
  });
}

function automationImportedStlFromShapes(id: string, name: string, color: string, parts: WorkplaneShape[], overrides: Partial<WorkplaneShape> = {}) {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  parts.forEach((part) => appendMeshData(vertices, faces, meshForShape(part)));
  const bounds = boundsForCuboids([{ minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }, ...parts.map(meshAabb)]);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const positions: number[] = [];
  faces.forEach(([ai, bi, ci]) => {
    [vertices[ai], vertices[bi], vertices[ci]].forEach(([x, y, z]) => {
      positions.push(x - centerX, y - bounds.minY, z - centerZ);
    });
  });

  return sceneShape({
    id,
    name,
    kind: "mesh",
    color,
    x: centerX,
    z: centerZ,
    elevation: bounds.minY,
    width,
    depth,
    height,
    importedMesh: {
      positions,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: faces.length,
      sourceFormat: "stl",
    },
    ...overrides,
  });
}

function automationRaspberryPiStl(overrides: Partial<WorkplaneShape> = {}) {
  const parts: WorkplaneShape[] = [
    sceneShape({ id: "raspi-board", name: "Board", kind: "box", color: "#1f9f5f", width: 70, depth: 48, height: 3, elevation: 0 }),
    sceneShape({ id: "raspi-soc", name: "Main chip", kind: "box", color: "#30343b", x: -8, z: 0, width: 15, depth: 15, height: 3.2, elevation: 3 }),
    sceneShape({ id: "raspi-memory", name: "Memory chip", kind: "box", color: "#2b2e34", x: 10, z: 1, width: 11, depth: 13, height: 2.8, elevation: 3 }),
    sceneShape({ id: "raspi-usb-a", name: "USB block", kind: "box", color: "#b9c1c9", x: 23, z: -13, width: 17, depth: 11, height: 9, elevation: 3 }),
    sceneShape({ id: "raspi-usb-b", name: "USB block", kind: "box", color: "#b9c1c9", x: 23, z: 4, width: 17, depth: 11, height: 9, elevation: 3 }),
    sceneShape({ id: "raspi-ethernet", name: "Ethernet jack", kind: "box", color: "#c4c9ce", x: 23, z: 18, width: 18, depth: 13, height: 11, elevation: 3 }),
    sceneShape({ id: "raspi-hdmi", name: "HDMI", kind: "box", color: "#c9c0b2", x: -15, z: -22, width: 16, depth: 5, height: 4, elevation: 3 }),
    sceneShape({ id: "raspi-camera", name: "Camera connector", kind: "box", color: "#2b2e34", x: -28, z: 4, width: 5, depth: 20, height: 3, elevation: 3 }),
    sceneShape({ id: "raspi-mount-a", name: "Mount", kind: "cylinder", color: "#1f9f5f", x: -29, z: -17, width: 6, depth: 6, height: 3.4, elevation: 0, sides: 32 }),
    sceneShape({ id: "raspi-mount-b", name: "Mount", kind: "cylinder", color: "#1f9f5f", x: 29, z: -17, width: 6, depth: 6, height: 3.4, elevation: 0, sides: 32 }),
    sceneShape({ id: "raspi-mount-c", name: "Mount", kind: "cylinder", color: "#1f9f5f", x: -29, z: 17, width: 6, depth: 6, height: 3.4, elevation: 0, sides: 32 }),
    sceneShape({ id: "raspi-mount-d", name: "Mount", kind: "cylinder", color: "#1f9f5f", x: 29, z: 17, width: 6, depth: 6, height: 3.4, elevation: 0, sides: 32 }),
    ...Array.from({ length: 14 }, (_, index) =>
      sceneShape({
        id: `raspi-pin-${index}`,
        name: "GPIO pin",
        kind: "box",
        color: "#e2b94f",
        x: -29 + index * 4,
        z: 23,
        width: 1.6,
        depth: 2.6,
        height: 6,
        elevation: 3,
      }),
    ),
  ];
  return automationImportedStlFromShapes("raspberry-pi-stl", "Raspberry Pi-like STL", "#0098c7", parts, overrides);
}

const booleanAutomationShapeConfigs: Record<
  string,
  {
    name: string;
    kind: WorkplaneShape["kind"];
    color: string;
    width?: number;
    depth?: number;
    height?: number;
    props?: Partial<WorkplaneShape>;
  }
> = {
  cube: { name: "Cube", kind: "box", color: "#d41721" },
  cylinder: { name: "Cylinder", kind: "cylinder", color: "#d97813", props: { sides: 96, segments: 1 } },
  sphere: { name: "Sphere", kind: "sphere", color: "#0098c7", props: { steps: 28, sides: 56 } },
  cone: { name: "Cone", kind: "cone", color: "#6e2786", props: { sides: 96, topRadius: 0, baseRadius: 14 } },
  pyramid: { name: "Pyramid", kind: "pyramid", color: "#f2cf10", props: { sides: 4 } },
  wedge: { name: "Wedge", kind: "wedge", color: "#33983d" },
  text: { name: "Text", kind: "text", color: "#cf101b", width: 34, depth: 18, height: 28, props: { text: "T", font: "Sans" } },
  "round-roof": { name: "Round Roof", kind: "roundRoof", color: "#67c4ce", props: { sides: 64 } },
  "half-sphere": { name: "Half Sphere", kind: "halfSphere", color: "#c9009a", props: { steps: 32 } },
  torus: { name: "Torus", kind: "torus", color: "#0098c7", width: 34, depth: 34, height: 8, props: { sides: 96 } },
  tube: { name: "Tube", kind: "tube", color: "#ce7013", width: 34, depth: 34, height: 28, props: { bevel: 6, sides: 96 } },
};

function automationShape(key: string, overrides: Partial<WorkplaneShape> = {}) {
  const config = booleanAutomationShapeConfigs[key];
  if (!config) {
    return null;
  }

  const width = overrides.width ?? config.width ?? 28;
  const depth = overrides.depth ?? config.depth ?? 28;
  const height = overrides.height ?? config.height ?? 28;
  return sceneShape({
    id: `${overrides.hole ? "hole" : "solid"}-${key}`,
    name: config.name,
    kind: config.kind,
    color: config.color,
    x: 0,
    z: 0,
    width,
    depth,
    height,
    size: Math.max(width, depth),
    ...config.props,
    ...overrides,
  });
}

function automationHoleShape(key: string, overrides: Partial<WorkplaneShape> = {}) {
  const shape = automationShape(key, {
    hole: true,
    color: "#b8c2cc",
    elevation: key === "torus" ? 18 : -3,
    rotation: 27,
    width: key === "text" ? 32 : key === "torus" || key === "tube" ? 34 : 24,
    depth: key === "text" ? 17 : key === "torus" || key === "tube" ? 34 : 24,
    height: key === "torus" ? 12 : 34,
    ...overrides,
  });
  return shape ? withHoleMode(shape, true) : null;
}

function automationNormalGroupedObject(overrides: Partial<WorkplaneShape> = {}) {
  const cube = automationShape("cube", { id: "normal-group-cube", x: -9, width: 18, depth: 24, height: 26 });
  const cylinder = automationShape("cylinder", { id: "normal-group-cylinder", x: 10, width: 20, depth: 20, height: 28 });
  if (!cube || !cylinder) {
    return null;
  }
  const group = groupedShape([cube, cylinder]);
  return group ? { ...group, id: "normal-group", name: "Normal grouped object", ...overrides } : null;
}

function automationSelectionOutlineRegressionShape() {
  const geometries: THREE.BufferGeometry[] = [
    new RoundedBoxGeometry(30, 20, 20, 8, 4).translate(-15, 10, 0),
    new THREE.BoxGeometry(16, 20, 20).translate(18, 10, 0),
  ];
  const positions: number[] = [];
  const normals: number[] = [];

  geometries.forEach((geometry) => {
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    nonIndexed.computeVertexNormals();
    positions.push(...Array.from(nonIndexed.getAttribute("position").array as ArrayLike<number>));
    normals.push(...Array.from(nonIndexed.getAttribute("normal").array as ArrayLike<number>));
    if (nonIndexed !== geometry) {
      nonIndexed.dispose();
    }
    geometry.dispose();
  });

  return canonicalizeShape(
    sceneShape({
      id: "selection-outline-regression",
      name: "Selection outline regression",
      kind: "mesh",
      color: "#d41721",
      x: 0,
      z: 0,
      width: 56,
      depth: 20,
      height: 20,
      size: 56,
      importedMesh: {
        positions,
        normals,
        baseWidth: 56,
        baseDepth: 20,
        baseHeight: 20,
        triangleCount: Math.floor(positions.length / 9),
        sourceFormat: "json",
      },
      groupedShapes: [
        sceneShape({ id: "rounded-child", name: "Rounded child", kind: "box", color: "#d41721", x: -15, width: 30, depth: 20, height: 20, radius: 4 }),
        sceneShape({ id: "box-child", name: "Box child", kind: "box", color: "#d41721", x: 18, width: 16, depth: 20, height: 20 }),
      ],
    }),
  );
}

function booleanAutomationDynamicScene(caseId: string): { label: string; shapes: WorkplaneShape[] } | null {
  const requestedKeys = Object.keys(booleanAutomationShapeConfigs).filter((key) => key !== "cube" && key !== "cylinder");
  const allNormalKeys = Object.keys(booleanAutomationShapeConfigs);

  for (const key of requestedKeys) {
    if (caseId === `${key}-rot-hole`) {
      const solid = automationShape(key);
      return solid
        ? {
            label: `${solid.name} + rotated hole cube`,
            shapes: [solid, automationHoleBox({ rotation: 32 })],
          }
        : null;
    }

    if (caseId === `${key}-hole-cube`) {
      const hole = automationHoleShape(key);
      return hole
        ? {
            label: `${hole.name} hole + solid cube`,
            shapes: [automationSolidBox({ width: 36, depth: 36, height: 30 }), hole],
          }
        : null;
    }

    if (caseId === `${key}-hole-stl`) {
      const hole = automationHoleShape(key);
      return hole
        ? {
            label: `${hole.name} hole + imported STL`,
            shapes: [automationImportedStlBox({ width: 36, depth: 36, height: 30 }), hole],
          }
        : null;
    }
  }

  for (const key of allNormalKeys) {
    if (caseId === `hole-stl-${key}`) {
      const solid = automationShape(key, { width: key === "text" ? 42 : undefined, depth: key === "text" ? 20 : undefined });
      return solid
        ? {
            label: `rotated hole STL + ${solid.name}`,
            shapes: [
              solid,
              automationHoleStlBox({
                id: `hole-stl-${key}`,
                rotation: 29,
                rotationZ: 8,
              }),
            ],
          }
        : null;
    }

    if (caseId === `straight-hole-stl-${key}`) {
      const solid = automationShape(key, { width: key === "text" ? 42 : undefined, depth: key === "text" ? 20 : undefined });
      return solid
        ? {
            label: `non-rotated hole STL + ${solid.name}`,
            shapes: [
              solid,
              automationHoleStlBox({
                id: `straight-hole-stl-${key}`,
                rotation: 0,
                rotationZ: 0,
              }),
            ],
          }
        : null;
    }
  }

  return null;
}

function booleanAutomationScene(caseId: string): { label: string; shapes: WorkplaneShape[] } | null {
  const rotatedHole = () => automationHoleBox({ rotation: 32 });
  if (caseId === "selection-outline-regression") {
    return {
      label: "segmented rounded mesh selection outline",
      shapes: [automationSelectionOutlineRegressionShape()],
    };
  }
  if (caseId === "locked-align-pair") {
    return {
      label: "locked alignment reference pair",
      shapes: [
        sceneShape({ id: "locked-anchor", name: "Locked cube", kind: "box", color: "#d41721", x: 24, z: 10, width: 20, depth: 20, height: 20, locked: true }),
        sceneShape({ id: "moving-cube", name: "Moving cube", kind: "box", color: "#ef7f1a", x: -24, z: -18, width: 12, depth: 12, height: 12 }),
      ],
    };
  }
  if (caseId === "normal-group") {
    const group = groupedShape([
      sceneShape({ id: "modifier-base", name: "Base", kind: "box", color: "#d41721", width: 54, depth: 38, height: 7 }),
      sceneShape({ id: "modifier-upright", name: "Upright", kind: "box", color: "#d41721", x: 8, width: 14, depth: 14, height: 40, elevation: 4 }),
      sceneShape({ id: "modifier-rail", name: "Rail", kind: "box", color: "#d41721", x: -7, z: 5, width: 32, depth: 10, height: 13, elevation: 4 }),
    ]);
    return group ? { label: "overlapping normal solid group", shapes: [group] } : null;
  }
  if (caseId === "straight-hole-stl-group") {
    const group = automationNormalGroupedObject();
    return group
      ? {
          label: "normal grouped object + non-rotated hole STL",
          shapes: [group, automationHoleStlBox({ id: "straight-hole-stl-group", width: 24, depth: 42 })],
        }
      : null;
  }
  if (caseId === "straight-hole-stl-mixed-group") {
    const group = automationNormalGroupedObject({ x: 12 });
    const cube = automationShape("cube", { id: "mixed-solid-cube", x: -14, width: 24, depth: 26, height: 28 });
    return group && cube
      ? {
          label: "cube + normal grouped object + non-rotated hole STL",
          shapes: [cube, group, automationHoleStlBox({ id: "straight-hole-stl-mixed-group", width: 48, depth: 42 })],
        }
      : null;
  }
  if (caseId === "raspi-stl-hole") {
    return {
      label: "Raspberry Pi-like STL + non-rotated hole cube",
      shapes: [
        automationRaspberryPiStl(),
        automationHoleBox({ id: "raspi-hole-cube", x: -2, z: 2, width: 18, depth: 56, height: 20, elevation: -2, rotation: 0, rotationZ: 0 }),
      ],
    };
  }
  if (caseId === "raspi-stl-rot-hole") {
    return {
      label: "Raspberry Pi-like STL + rotated hole cube",
      shapes: [
        automationRaspberryPiStl(),
        automationHoleBox({ id: "raspi-rot-hole-cube", x: -2, z: 2, width: 18, depth: 56, height: 20, elevation: -2, rotation: 28, rotationZ: 8 }),
      ],
    };
  }
  if (caseId === "raspi-stl-hole-stl") {
    return {
      label: "Raspberry Pi-like STL + non-rotated hole STL",
      shapes: [
        automationRaspberryPiStl(),
        automationHoleStlBox({ id: "raspi-hole-stl", x: -2, z: 2, width: 18, depth: 56, height: 20, elevation: -2, rotation: 0, rotationZ: 0 }),
      ],
    };
  }
  if (caseId === "raspi-stl-rot-hole-stl") {
    return {
      label: "Raspberry Pi-like STL + rotated hole STL",
      shapes: [
        automationRaspberryPiStl(),
        automationHoleStlBox({ id: "raspi-rot-hole-stl", x: -2, z: 2, width: 18, depth: 56, height: 20, elevation: -2, rotation: 28, rotationZ: 8 }),
      ],
    };
  }
  const cases: Record<string, { label: string; shapes: WorkplaneShape[] }> = {
    "cube-hole": {
      label: "solid cube + non-rotated hole cube",
      shapes: [automationSolidBox(), automationHoleBox()],
    },
    "cube-rot-hole": {
      label: "solid cube + rotated hole cube",
      shapes: [automationSolidBox(), rotatedHole()],
    },
    "stl-hole": {
      label: "STL + non-rotated hole cube",
      shapes: [automationImportedStlBox(), automationHoleBox()],
    },
    "stl-rot-hole": {
      label: "STL + rotated hole cube",
      shapes: [automationImportedStlBox(), rotatedHole()],
    },
    "rot-stl-hole": {
      label: "rotated STL + hole cube",
      shapes: [automationImportedStlBox({ rotation: 28, rotationZ: 8 }), automationHoleBox()],
    },
    "rot-stl-rot-hole": {
      label: "rotated STL + rotated hole cube",
      shapes: [automationImportedStlBox({ rotation: 28, rotationZ: 8 }), rotatedHole()],
    },
    "cylinder-rot-hole": {
      label: "cylinder + rotated hole cube",
      shapes: [automationSolidBox({ id: "solid-cylinder", name: "Cylinder", kind: "cylinder", color: "#d97813", sides: 48 }), rotatedHole()],
    },
    "sphere-rot-hole": {
      label: "sphere + rotated hole cube",
      shapes: [automationSolidBox({ id: "solid-sphere", name: "Sphere", kind: "sphere", color: "#0098c7", sides: 48 }), rotatedHole()],
    },
    "cone-rot-hole": {
      label: "cone + rotated hole cube",
      shapes: [
        automationSolidBox({ id: "solid-cone", name: "Cone", kind: "cone", color: "#6e2786", sides: 64, topRadius: 0, baseRadius: 14 }),
        rotatedHole(),
      ],
    },
    "pyramid-rot-hole": {
      label: "pyramid + rotated hole cube",
      shapes: [automationSolidBox({ id: "solid-pyramid", name: "Pyramid", kind: "pyramid", color: "#f2cf10", sides: 4 }), rotatedHole()],
    },
  };
  return cases[caseId] ?? booleanAutomationDynamicScene(caseId);
}

function makeHouseScene(): WorkplaneShape[] {
  return [
    sceneShape({ name: "Grass base", kind: "box", color: "#4f9b58", x: 0, z: 0, width: 118, depth: 92, height: 1 }),
    sceneShape({ name: "House body", kind: "box", color: "#e7c49a", x: 0, z: 2, width: 52, depth: 42, height: 34, elevation: 1 }),
    sceneShape({ name: "Gable roof", kind: "roof", color: "#a83c32", x: 0, z: 2, width: 66, depth: 54, height: 23, elevation: 35 }),
    sceneShape({ name: "Chimney", kind: "box", color: "#7f3328", x: 17, z: -9, width: 8, depth: 8, height: 18, elevation: 45 }),
    sceneShape({ name: "Front door", kind: "box", color: "#6d4427", x: 0, z: -20.4, width: 12, depth: 1.4, height: 19, elevation: 1.5 }),
    sceneShape({ name: "Door knob", kind: "sphere", color: "#e0b23f", x: 4.2, z: -21.6, width: 2.2, depth: 2.2, height: 2.2, elevation: 11 }),
    sceneShape({ name: "Left front window", kind: "box", color: "#6fc8e8", x: -16, z: -20.7, width: 10, depth: 1.2, height: 8, elevation: 18 }),
    sceneShape({ name: "Right front window", kind: "box", color: "#6fc8e8", x: 16, z: -20.7, width: 10, depth: 1.2, height: 8, elevation: 18 }),
    sceneShape({ name: "Left side window", kind: "box", color: "#6fc8e8", x: -26.2, z: 8, width: 10, depth: 1.2, height: 8, elevation: 18, rotation: 90 }),
    sceneShape({ name: "Right side window", kind: "box", color: "#6fc8e8", x: 26.2, z: 8, width: 10, depth: 1.2, height: 8, elevation: 18, rotation: 90 }),
    sceneShape({ name: "Porch step", kind: "box", color: "#9d9b91", x: 0, z: -28, width: 24, depth: 10, height: 2, elevation: 1 }),
    sceneShape({ name: "Walkway", kind: "box", color: "#b8b4a8", x: 0, z: -50, width: 12, depth: 36, height: 0.8, elevation: 0.2 }),
    sceneShape({ name: "Tree trunk", kind: "cylinder", color: "#7b4a2b", x: -42, z: 22, width: 7, depth: 7, height: 18, elevation: 1, sides: 18 }),
    sceneShape({ name: "Tree crown", kind: "sphere", color: "#2f8e45", x: -42, z: 22, width: 24, depth: 24, height: 22, elevation: 18 }),
    sceneShape({ name: "Mailbox post", kind: "box", color: "#5a4b3d", x: 32, z: -42, width: 3, depth: 3, height: 12, elevation: 1 }),
    sceneShape({ name: "Mailbox", kind: "roundRoof", color: "#2e6ca8", x: 32, z: -42, width: 13, depth: 8, height: 7, elevation: 13, rotation: 90 }),
  ];
}

function makeBlockPerfScene(count = 500): WorkplaneShape[] {
  const safeCount = Math.max(1, Math.min(5000, Math.floor(count)));
  const columns = Math.ceil(Math.sqrt(safeCount));
  const spacing = 7;
  const offset = ((columns - 1) * spacing) / 2;
  const colors = ["#d41721", "#d97813", "#f2cf10", "#33983d", "#0098c7", "#294c93"];

  return Array.from({ length: safeCount }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return sceneShape({
      id: `perf-block-${index + 1}`,
      name: `Perf block ${index + 1}`,
      kind: "box",
      color: colors[index % colors.length],
      x: column * spacing - offset,
      z: row * spacing - offset,
      width: 5,
      depth: 5,
      height: 5,
    });
  });
}

function sanitizeName(name: string) {
  return name.replace(/[^a-z0-9_-]+/gi, "_") || "shape";
}

function meshDataToCadTransfer(mesh: MeshData) {
  const positions = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach((vertex, index) => positions.set(vertex, index * 3));
  const indices = new Uint32Array(mesh.faces.length * 3);
  mesh.faces.forEach((face, index) => indices.set(face, index * 3));
  return { positions, indices };
}

function shapeFromCadMesh(
  source: WorkplaneShape,
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array,
  brep: string,
): WorkplaneShape | null {
  if (positions.length < 9 || indices.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const flattenedPositions: number[] = [];
  const flattenedNormals: number[] = [];
  for (let index = 0; index < indices.length; index += 1) {
    const vertex = indices[index] * 3;
    flattenedPositions.push(positions[vertex] - centerX, positions[vertex + 1] - minY, positions[vertex + 2] - centerZ);
    if (normals.length >= vertex + 3) flattenedNormals.push(normals[vertex], normals[vertex + 1], normals[vertex + 2]);
  }
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  return canonicalizeShape({
    ...source,
    kind: "mesh",
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(minY, 0.0005),
    width,
    depth,
    height,
    size: Math.max(width, depth),
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    radius: undefined,
    importedMesh: {
      positions: flattenedPositions,
      normals: flattenedNormals.length === flattenedPositions.length ? flattenedNormals : undefined,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(indices.length / 3),
      sourceFormat: "json",
    },
    imagePlate: undefined,
    cadBrep: brep,
    cadBrepFrame: {
      x: cleanNearZero(centerX, 0.0005),
      z: cleanNearZero(centerZ, 0.0005),
      elevation: cleanNearZero(minY, 0.0005),
      width,
      depth,
      height,
    },
    cadPrimitiveFrame: undefined,
  });
}

function cadEdgeEndpoint(edge: CadModifierEdge, end: "start" | "end") {
  const offset = end === "start" ? 0 : edge.points.length - 3;
  return new THREE.Vector3(edge.points[offset], edge.points[offset + 1], edge.points[offset + 2]);
}

function cadEdgeTangentAt(edge: CadModifierEdge, endpoint: THREE.Vector3) {
  const start = cadEdgeEndpoint(edge, "start");
  const end = cadEdgeEndpoint(edge, "end");
  if (endpoint.distanceToSquared(start) <= endpoint.distanceToSquared(end)) {
    const next = new THREE.Vector3(edge.points[3], edge.points[4], edge.points[5]);
    return next.sub(start).normalize();
  }
  const offset = Math.max(0, edge.points.length - 6);
  const previous = new THREE.Vector3(edge.points[offset], edge.points[offset + 1], edge.points[offset + 2]);
  return previous.sub(end).normalize();
}

function tangentCadEdgeChain(edges: CadModifierEdge[], startId: number, allowedIds: Set<number>) {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const selected = new Set<number>([startId]);
  const queue = [startId];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  edges.forEach((edge) => {
    for (let index = 0; index + 2 < edge.points.length; index += 3) {
      minX = Math.min(minX, edge.points[index]);
      minY = Math.min(minY, edge.points[index + 1]);
      minZ = Math.min(minZ, edge.points[index + 2]);
      maxX = Math.max(maxX, edge.points[index]);
      maxY = Math.max(maxY, edge.points[index + 1]);
      maxZ = Math.max(maxZ, edge.points[index + 2]);
    }
  });
  const diagonal = [minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)
    ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
    : 1;
  const tolerance = Math.max(1e-6, Math.min(0.01, diagonal * 1e-5));
  while (queue.length > 0) {
    const id = queue.shift() as number;
    const edge = edgeById.get(id);
    if (!edge) continue;
    const endpoints = [cadEdgeEndpoint(edge, "start"), cadEdgeEndpoint(edge, "end")];
    edges.forEach((candidate) => {
      if (selected.has(candidate.id) || !allowedIds.has(candidate.id)) return;
      const candidateEndpoints = [cadEdgeEndpoint(candidate, "start"), cadEdgeEndpoint(candidate, "end")];
      const shared = endpoints.find((point) => candidateEndpoints.some((other) => point.distanceTo(other) <= tolerance));
      if (!shared) return;
      const a = cadEdgeTangentAt(edge, shared);
      const b = cadEdgeTangentAt(candidate, shared);
      const deviation = (Math.acos(Math.max(-1, Math.min(1, Math.abs(a.dot(b))))) * 180) / Math.PI;
      if (deviation <= 16) {
        selected.add(candidate.id);
        queue.push(candidate.id);
      }
    });
  }
  return [...selected];
}

function cadDisplayEdgesAfterTreatment(shape: WorkplaneShape, session: EdgeModifierSession) {
  const removed = new Set(session.selectedEdgeIds);
  const elevation = shape.elevation ?? 0;
  return session.edges
    .filter((edge) => {
      const effectiveAngle = Math.min(edge.angle, 180 - edge.angle);
      return edge.manifold
        && !edge.boundary
        && effectiveAngle + 1e-3 >= Math.max(session.sharpAngle, NORMAL_SELECTION_CAD_EDGE_MIN_ANGLE)
        && !removed.has(edge.id);
    })
    .map((edge) => ({
      points: edge.points.map((value, index) => {
        if (index % 3 === 0) return value - shape.x;
        if (index % 3 === 1) return value - elevation;
        return value - shape.z;
      }),
    }));
}

function cadDisplayEdgesForShape(shape: WorkplaneShape, edges: CadModifierDisplayEdge[]) {
  const elevation = shape.elevation ?? 0;
  return edges
    .filter((edge) => edge.points.length >= 6)
    .map((edge) => ({
      points: edge.points.map((value, index) => {
        if (index % 3 === 0) return value - shape.x;
        if (index % 3 === 1) return value - elevation;
        return value - shape.z;
      }),
    }));
}

function cadModifierComponentPreviews(sourceParts: WorkplaneShape[], components: CadModifierComponentMesh[] | undefined): EdgeModifierComponentPreview[] {
  if (!components?.length) return [];
  const previews: EdgeModifierComponentPreview[] = [];
  components.forEach((component) => {
    const source = sourceParts[component.owner] ?? sourceParts[0];
    if (!source) return;
    const shape = shapeFromCadMesh(source, component.positions, component.normals, component.indices, component.brep);
    if (!shape) return;
    previews.push({
      owner: component.owner,
      shape: canonicalizeShape({
        ...shape,
        cadDisplayEdges: cadDisplayEdgesForShape(shape, component.displayEdges),
        cadDisplayEdgesVersion: 2 as const,
      }),
    });
  });
  return previews;
}

function edgeTreatmentLabel(feature: NonNullable<WorkplaneShape["edgeTreatments"]>[number]) {
  const size = `${Number(feature.amount.toFixed(2))} mm`;
  return `${feature.kind === "fillet" ? "fillet" : "chamfer"} (${size}, ${feature.edgeCount} edge${feature.edgeCount === 1 ? "" : "s"})`;
}

function shapeWithEdgeTreatmentRecord(
  shape: WorkplaneShape,
  before: WorkplaneShape,
  feature: NonNullable<WorkplaneShape["edgeTreatments"]>[number],
  preserveEdgeSize: boolean,
  createdAt: number,
) {
  return canonicalizeShape({
    ...shape,
    edgeResizeMode: preserveEdgeSize ? "preserve" : "scale",
    edgeTreatments: [
      ...(before.edgeTreatments ?? []),
      {
        ...feature,
      },
    ],
    edgeTreatmentHistory: [
      ...compactEdgeTreatmentHistory(before.edgeTreatmentHistory),
      {
        id: createLocalId("edge-history"),
        createdAt,
        feature,
        before: cloneWorkplaneShapeSnapshot(before),
        appliedFrame: edgeTreatmentAppliedFrame(shape),
      },
    ],
  });
}

function bakedEdgeTreatmentPreview(shape: WorkplaneShape, base: WorkplaneShape) {
  if (!base.groupedShapes?.length) return shape;
  return canonicalizeShape({
    ...shape,
    groupedShapes: undefined,
    groupedBaseWidth: undefined,
    groupedBaseDepth: undefined,
    groupedBaseHeight: undefined,
  });
}

function shapeCenterDistance(a: WorkplaneShape, b: WorkplaneShape) {
  const ax = a.x;
  const ay = (a.elevation ?? 0) + a.height / 2;
  const az = a.z;
  const bx = b.x;
  const by = (b.elevation ?? 0) + b.height / 2;
  const bz = b.z;
  return Math.hypot(ax - bx, ay - by, az - bz);
}

function shapeDimensionDistance(a: WorkplaneShape, b: WorkplaneShape) {
  return Math.hypot(shapeWidth(a) - shapeWidth(b), a.height - b.height, shapeDepth(a) - shapeDepth(b));
}

function matchCadComponentsToSources(sourceParts: WorkplaneShape[], componentPreviews: EdgeModifierComponentPreview[]) {
  const candidates = componentPreviews.flatMap((component, componentIndex) =>
    sourceParts.map((source, sourceIndex) => ({
      component,
      componentIndex,
      sourceIndex,
      score: shapeCenterDistance(component.shape, source) + shapeDimensionDistance(component.shape, source) * 0.25,
    })),
  );
  candidates.sort((a, b) => a.score - b.score);

  const usedComponents = new Set<number>();
  const usedSources = new Set<number>();
  const ownerToSourceIndex = new Map<number, number>();
  candidates.forEach((candidate) => {
    if (usedComponents.has(candidate.componentIndex) || usedSources.has(candidate.sourceIndex)) return;
    usedComponents.add(candidate.componentIndex);
    usedSources.add(candidate.sourceIndex);
    ownerToSourceIndex.set(candidate.component.owner, candidate.sourceIndex);
  });
  return ownerToSourceIndex;
}

function groupedShapeWithComponentEdgeTreatment(
  base: WorkplaneShape,
  preview: WorkplaneShape,
  sourceParts: WorkplaneShape[],
  session: EdgeModifierSession,
  feature: NonNullable<WorkplaneShape["edgeTreatments"]>[number],
  createdAt: number,
) {
  if (
    !base.groupedShapes?.length ||
    !hasOneToOneCadComponentMapping(sourceParts.length, session.componentPreviews.map((component) => component.owner))
  ) {
    return null;
  }

  const edgeById = new Map(session.edges.map((edge) => [edge.id, edge]));
  const ownerEdgeCounts = new Map<number, number>();
  session.selectedEdgeIds.forEach((edgeId) => {
    const owner = edgeById.get(edgeId)?.owner;
    if (typeof owner !== "number") return;
    ownerEdgeCounts.set(owner, (ownerEdgeCounts.get(owner) ?? 0) + 1);
  });
  if (ownerEdgeCounts.size === 0) {
    return null;
  }

  const ownerToSourceIndex = matchCadComponentsToSources(sourceParts, session.componentPreviews);
  if (ownerToSourceIndex.size !== sourceParts.length) {
    return null;
  }
  const componentByOwner = new Map(session.componentPreviews.map((component) => [component.owner, component]));
  const updatedSources = [...sourceParts];
  let changed = false;

  ownerEdgeCounts.forEach((edgeCount, owner) => {
    const sourceIndex = ownerToSourceIndex.get(owner);
    const component = componentByOwner.get(owner);
    if (sourceIndex === undefined || !component) return;
    const source = sourceParts[sourceIndex];
    const ownerFeature = { ...feature, edgeCount };
    const retargeted = canonicalizeShape({
      ...component.shape,
      id: source.id,
      name: source.name,
      color: source.color,
      hole: source.hole || undefined,
      locked: source.locked,
      hidden: source.hidden,
      groupedShapes: source.groupedShapes,
      groupedBaseWidth: source.groupedBaseWidth,
      groupedBaseDepth: source.groupedBaseDepth,
      groupedBaseHeight: source.groupedBaseHeight,
    });
    updatedSources[sourceIndex] = shapeWithEdgeTreatmentRecord(retargeted, source, ownerFeature, session.preserveEdgeSize, createdAt);
    changed = true;
  });

  if (!changed) {
    return null;
  }

  const elevation = preview.elevation ?? 0;
  return canonicalizeShape({
    ...preview,
    edgeResizeMode: session.preserveEdgeSize ? "preserve" : "scale",
    edgeTreatments: base.edgeTreatments,
    edgeTreatmentHistory: base.edgeTreatmentHistory?.length ? compactEdgeTreatmentHistory(base.edgeTreatmentHistory) : undefined,
    groupedBaseWidth: shapeWidth(preview),
    groupedBaseDepth: shapeDepth(preview),
    groupedBaseHeight: preview.height,
    groupedShapes: updatedSources.map((shape) => cloneAsGroupChild(shape, preview.x, preview.z, elevation)),
  });
}

function edgeTreatmentFeatureCount(shape: WorkplaneShape): number {
  return (shape.edgeTreatments?.length ?? 0) + (shape.groupedShapes?.reduce((total, child) => total + edgeTreatmentFeatureCount(child), 0) ?? 0);
}

function reversibleEdgeTreatmentCount(shape: WorkplaneShape): number {
  return (shape.edgeTreatmentHistory?.length ?? 0) + (shape.groupedShapes?.reduce((total, child) => total + reversibleEdgeTreatmentCount(child), 0) ?? 0);
}

function edgeTreatmentHistoryOptions(shape: WorkplaneShape, path: number[] = [], targetName = shape.name): EdgeFeatureRevertOption[] {
  const ownHistory = shape.edgeTreatmentHistory ?? [];
  const ownOptions = ownHistory.map((entry, index) => ({
    id: `${path.length ? path.join(".") : "root"}:${entry.id}`,
    entryId: entry.id,
    path,
    label: edgeTreatmentLabel(entry.feature),
    targetName,
    createdAt: entry.createdAt,
    removesNewerCount: Math.max(0, ownHistory.length - index - 1),
  }));
  const childOptions = (shape.groupedShapes ?? []).flatMap((child, index) =>
    edgeTreatmentHistoryOptions(child, [...path, index], `${targetName} / ${child.name}`),
  );
  return [...ownOptions, ...childOptions].sort((a, b) => b.createdAt - a.createdAt);
}

function restoreOwnLastEdgeTreatment(shape: WorkplaneShape, entry: NonNullable<WorkplaneShape["edgeTreatmentHistory"]>[number]) {
  return restoreShapeBeforeEdgeTreatment(shape, entry);
}

async function restoreEdgeTreatmentInShape(shape: WorkplaneShape, path: number[], entryId: string): Promise<{ shape: WorkplaneShape; label: string } | null> {
  if (path.length === 0) {
    const entry = (shape.edgeTreatmentHistory ?? []).find((candidate) => candidate.id === entryId);
    return entry ? { shape: restoreOwnLastEdgeTreatment(shape, entry), label: edgeTreatmentLabel(entry.feature) } : null;
  }

  if (!shape.groupedShapes?.length) {
    return null;
  }

  const [childIndex, ...restPath] = path;
  const restoredChildren = restoreGroupedChildren(shape);
  const child = restoredChildren[childIndex];
  if (!child) {
    return null;
  }
  const restoredChild = await restoreEdgeTreatmentInShape(child, restPath, entryId);
  if (!restoredChild) {
    return null;
  }

  restoredChildren[childIndex] = restoredChild.shape;
  const rebuilt = await buildGroupedShapeFromSelection(restoredChildren);
  if (!rebuilt.group) {
    return null;
  }

  return {
    shape: canonicalizeShape({
      ...rebuilt.group,
      id: shape.id,
      name: shape.name,
      color: shape.color,
      hole: shape.hole || rebuilt.group.hole,
      locked: shape.locked,
      hidden: shape.hidden,
      edgeResizeMode: shape.edgeResizeMode,
      groupOperation: shape.groupOperation,
      edgeTreatments: shape.edgeTreatments,
      edgeTreatmentHistory: shape.edgeTreatmentHistory?.length ? compactEdgeTreatmentHistory(shape.edgeTreatmentHistory) : undefined,
    }),
    label: restoredChild.label,
  };
}

function transformMesh(mesh: MeshData, shape: WorkplaneShape): MeshData {
  const centerY = shape.height / 2;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const mirrorX = mirrorSign(shape.mirrorX);
  const mirrorY = mirrorSign(shape.mirrorY);
  const mirrorZ = mirrorSign(shape.mirrorZ);
  const reversedWinding = mirroredAxisCount(shape) % 2 === 1;
  return {
    ...mesh,
    vertices: mesh.vertices.map(([x, y, z]) => {
      const vertex = new THREE.Vector3(x * mirrorX, (y - centerY) * mirrorY, z * mirrorZ).applyMatrix4(matrix);
      return [vertex.x + shape.x, vertex.y + (shape.elevation ?? 0) + centerY, vertex.z + shape.z] as Vec3;
    }),
    faces: reversedWinding ? mesh.faces.map(([a, b, c]) => [a, c, b] as [number, number, number]) : mesh.faces,
  };
}

function boxMesh(shape: WorkplaneShape): MeshData {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const x = width / 2;
  const z = depth / 2;
  return {
    name: sanitizeName(shape.name),
    vertices: [
      [-x, 0, -z],
      [x, 0, -z],
      [x, 0, z],
      [-x, 0, z],
      [-x, height, -z],
      [x, height, -z],
      [x, height, z],
      [-x, height, z],
    ],
    faces: [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ],
  };
}

function cylinderMesh(shape: WorkplaneShape, sides = 96, topRadiusScale = 1): MeshData {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const vertices: Vec3[] = [[0, 0, 0], [0, height, 0]];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    vertices.push([(Math.cos(angle) * width) / 2, 0, (Math.sin(angle) * depth) / 2]);
    vertices.push([(Math.cos(angle) * width * topRadiusScale) / 2, height, (Math.sin(angle) * depth * topRadiusScale) / 2]);
  }
  const faces: [number, number, number][] = [];
  for (let i = 0; i < sides; i += 1) {
    const next = (i + 1) % sides;
    const b0 = 2 + i * 2;
    const t0 = b0 + 1;
    const b1 = 2 + next * 2;
    const t1 = b1 + 1;
    faces.push([0, b1, b0]);
    if (topRadiusScale > 0) {
      faces.push([1, t0, t1]);
      faces.push([b0, b1, t1], [b0, t1, t0]);
    } else {
      faces.push([b0, b1, t0]);
    }
  }
  return { name: sanitizeName(shape.name), vertices, faces };
}

function sphereMesh(shape: WorkplaneShape): MeshData {
  const { widthSegments: lon, heightSegments: lat } = sphereTessellation(shape.steps);
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const vertices: Vec3[] = [];
  for (let yStep = 0; yStep <= lat; yStep += 1) {
    const theta = (yStep / lat) * Math.PI;
    const y = height / 2 + Math.cos(theta) * (height / 2);
    const ring = Math.sin(theta);
    for (let xStep = 0; xStep < lon; xStep += 1) {
      const phi = (xStep / lon) * Math.PI * 2;
      vertices.push([(Math.cos(phi) * width * ring) / 2, y, (Math.sin(phi) * depth * ring) / 2]);
    }
  }
  const faces: [number, number, number][] = [];
  for (let yStep = 0; yStep < lat; yStep += 1) {
    for (let xStep = 0; xStep < lon; xStep += 1) {
      const next = (xStep + 1) % lon;
      const a = yStep * lon + xStep;
      const b = yStep * lon + next;
      const c = (yStep + 1) * lon + next;
      const d = (yStep + 1) * lon + xStep;
      faces.push([a, d, c], [a, c, b]);
    }
  }
  return { name: sanitizeName(shape.name), vertices, faces };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function bufferGeometryToMeshData(name: string, geometry: THREE.BufferGeometry): MeshData {
  const prepared = geometry.index ? geometry.toNonIndexed() : geometry;
  prepared.computeVertexNormals();
  prepared.computeBoundingBox();
  const minY = prepared.boundingBox?.min.y ?? 0;
  if (Math.abs(minY) > 0.000001) {
    prepared.translate(0, -minY, 0);
    prepared.computeBoundingBox();
  }

  const position = prepared.getAttribute("position");
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  for (let i = 0; i < position.count; i += 1) {
    vertices.push([position.getX(i), position.getY(i), position.getZ(i)]);
  }
  for (let i = 0; i + 2 < position.count; i += 3) {
    faces.push([i, i + 1, i + 2]);
  }

  if (prepared !== geometry) {
    prepared.dispose();
  }
  geometry.dispose();
  return { name, vertices, faces };
}

function createBooleanRoofGeometry(width: number, height: number, depth: number) {
  const w = width / 2;
  const d = depth / 2;
  const vertices = new Float32Array([
    -w, 0, -d, w, 0, -d, 0, height, -d,
    -w, 0, d, w, 0, d, 0, height, d,
  ]);
  const indices = [
    0, 2, 1,
    3, 4, 5,
    0, 1, 4, 0, 4, 3,
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createBooleanWedgeGeometry(width: number, height: number, depth: number) {
  const w = width / 2;
  const d = depth / 2;
  const vertices = new Float32Array([
    -w, 0, -d, w, 0, -d, w, height, -d,
    -w, 0, d, w, 0, d, w, height, d,
  ]);
  const indices = [
    0, 2, 1,
    3, 4, 5,
    0, 1, 4, 0, 4, 3,
    1, 2, 5, 1, 5, 4,
    0, 3, 5, 0, 5, 2,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createBooleanPyramidGeometry(width: number, height: number, depth: number, sides = 4) {
  const count = Math.max(3, Math.round(sides));
  if (count !== 4) {
    const footprintScale = regularPolygonFootprintScale(width, depth, count);
    const geometry = new THREE.ConeGeometry(1, height, count);
    geometry.scale(footprintScale.x, 1, footprintScale.z);
    geometry.translate(footprintScale.offsetX, height / 2, footprintScale.offsetZ);
    return geometry;
  }

  const w = width / 2;
  const d = depth / 2;
  const vertices = new Float32Array([
    -w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d,
    0, height, 0,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createBooleanRoundRoofGeometry(width: number, height: number, depth: number, sides = 64) {
  const radius = width / 2;
  const segments = Math.max(4, Math.round(sides));
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(-radius, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: segments });
  geometry.translate(0, 0, -depth / 2);
  geometry.scale(1, height / Math.max(0.001, radius), 1);
  return geometry;
}

function createBooleanHalfSphereGeometry(width: number, height: number, depth: number, steps = 32) {
  const lon = Math.max(8, Math.round(steps) * 2);
  const lat = Math.max(4, Math.round(steps / 2));
  const rx = width / 2;
  const rz = depth / 2;
  const positions: number[] = [];
  const point = (latIndex: number, lonIndex: number): Vec3 => {
    const theta = (latIndex / lat) * (Math.PI / 2);
    const phi = ((lonIndex % lon) / lon) * Math.PI * 2;
    const ring = Math.sin(theta);
    return [Math.cos(phi) * rx * ring, Math.cos(theta) * height, Math.sin(phi) * rz * ring];
  };
  const addTri = (a: Vec3, b: Vec3, c: Vec3) => positions.push(...a, ...b, ...c);

  const top: Vec3 = [0, height, 0];
  for (let xStep = 0; xStep < lon; xStep += 1) {
    addTri(top, point(1, xStep + 1), point(1, xStep));
  }

  for (let yStep = 1; yStep < lat; yStep += 1) {
    for (let xStep = 0; xStep < lon; xStep += 1) {
      const next = xStep + 1;
      const a = point(yStep, xStep);
      const b = point(yStep, next);
      const c = point(yStep + 1, next);
      const d = point(yStep + 1, xStep);
      addTri(a, c, d);
      addTri(a, b, c);
    }
  }

  const bottomCenter: Vec3 = [0, 0, 0];
  const capPoint = (lonIndex: number): Vec3 => {
    const phi = ((lonIndex % lon) / lon) * Math.PI * 2;
    return [Math.cos(phi) * rx, 0, Math.sin(phi) * rz];
  };
  for (let xStep = 0; xStep < lon; xStep += 1) {
    addTri(bottomCenter, capPoint(xStep), capPoint(xStep + 1));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createBooleanTorusGeometry(width: number, height: number, depth: number) {
  const tubeRadius = Math.max(0.1, height / 2);
  const majorRadius = Math.max(0.2, Math.min(width, depth) / 2 - tubeRadius);
  const geometry = new THREE.TorusGeometry(majorRadius, tubeRadius, 36, 144);
  geometry.rotateX(Math.PI / 2);
  const outerDiameter = (majorRadius + tubeRadius) * 2;
  geometry.scale(width / Math.max(0.001, outerDiameter), 1, depth / Math.max(0.001, outerDiameter));
  return geometry;
}

function createBooleanHollowCylinderGeometry(width: number, height: number, depth: number, thickness: number, segments = 96) {
  const outerX = width / 2;
  const outerZ = depth / 2;
  const safeThickness = clampNumber(thickness, 0.1, Math.max(0.1, Math.min(outerX, outerZ) - 0.1));
  const innerX = Math.max(0.1, outerX - safeThickness);
  const innerZ = Math.max(0.1, outerZ - safeThickness);
  const count = Math.max(12, Math.round(segments));
  const positions: number[] = [];
  const point = (rx: number, rz: number, y: number, index: number): Vec3 => {
    const angle = (index / count) * Math.PI * 2;
    return [Math.cos(angle) * rx, y, Math.sin(angle) * rz];
  };
  const addTri = (a: Vec3, b: Vec3, c: Vec3) => positions.push(...a, ...b, ...c);
  const addQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => {
    addTri(a, b, c);
    addTri(a, c, d);
  };

  for (let index = 0; index < count; index += 1) {
    const next = index + 1;
    const ob0 = point(outerX, outerZ, 0, index);
    const ob1 = point(outerX, outerZ, 0, next);
    const ot0 = point(outerX, outerZ, height, index);
    const ot1 = point(outerX, outerZ, height, next);
    const ib0 = point(innerX, innerZ, 0, index);
    const ib1 = point(innerX, innerZ, 0, next);
    const it0 = point(innerX, innerZ, height, index);
    const it1 = point(innerX, innerZ, height, next);

    addQuad(ob0, ot0, ot1, ob1);
    addQuad(ib1, it1, it0, ib0);
    addQuad(ot0, it0, it1, ot1);
    addQuad(ob0, ob1, ib1, ib0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createBooleanTextGeometry(shape: WorkplaneShape) {
  const text = (shape.text ?? "TEXT").trim() || " ";
  const bevel = clampNumber(shape.bevel ?? 0, 0, 8);
  const fontName = shape.font ?? "Multilanguage";
  const geometry = new TextGeometry(text, {
    font: booleanTextFonts[fontName] ?? booleanTextFonts.Multilanguage,
    size: 20,
    depth: shape.height,
    curveSegments: fontName === "Stencil" ? 1 : 8,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel * 0.22,
    bevelSize: bevel * 0.16,
    bevelSegments: Math.max(1, shape.segments ?? 0),
  });

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    const textWidth = Math.max(1, box.max.x - box.min.x);
    const textDepth = Math.max(1, box.max.y - box.min.y);
    const scale = Math.min(shapeWidth(shape) / textWidth, shapeDepth(shape) / textDepth);
    geometry.scale(scale, scale, 1);
  }

  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const rotatedBox = geometry.boundingBox;
  if (rotatedBox) {
    geometry.translate(
      -(rotatedBox.min.x + rotatedBox.max.x) / 2,
      -rotatedBox.min.y,
      -(rotatedBox.min.z + rotatedBox.max.z) / 2,
    );
  }
  return geometry;
}

function geometryMeshForShape(shape: WorkplaneShape): MeshData | null {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const size = Math.min(width, depth);
  let geometry: THREE.BufferGeometry | null = null;

  switch (shape.kind) {
    case "box":
      geometry = shape.radius && shape.radius > 0
        ? new RoundedBoxGeometry(width, height, depth, Math.max(1, shape.steps ?? 10), shape.radius)
        : new THREE.BoxGeometry(width, height, depth);
      break;
    case "cylinder":
      geometry = new THREE.CylinderGeometry(1, 1, height, shape.sides ?? 96, shape.segments ?? 1);
      geometry.scale(width / 2, 1, depth / 2);
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(1, sphereTessellation(shape.steps).widthSegments, sphereTessellation(shape.steps).heightSegments);
      geometry.scale(width / 2, height / 2, depth / 2);
      break;
    case "cone": {
      const baseRadius = shape.baseRadius ?? width / 2;
      geometry = new THREE.CylinderGeometry(shape.topRadius ?? 0, baseRadius, height, shape.sides ?? 96);
      geometry.scale(1, 1, depth / Math.max(0.001, width));
      break;
    }
    case "pyramid":
      geometry = createBooleanPyramidGeometry(width, height, depth, shape.sides ?? 4);
      break;
    case "roof":
      geometry = createBooleanRoofGeometry(width, height, depth);
      break;
    case "roundRoof":
      geometry = createBooleanRoundRoofGeometry(width, height, depth, shape.sides ?? 64);
      break;
    case "halfSphere":
      geometry = createBooleanHalfSphereGeometry(width, height, depth, shape.steps ?? 32);
      break;
    case "torus":
      geometry = createBooleanTorusGeometry(width, height, depth);
      break;
    case "ring":
    case "tube":
      geometry = createBooleanHollowCylinderGeometry(width, height, depth, shape.bevel ?? 4, 144);
      break;
    case "gear":
      geometry = createGearGeometry({
        width,
        depth,
        height,
        teeth: shape.teeth,
        toothSize: shape.toothSize,
        toothWidth: shape.toothWidth,
        centerHoleSize: shape.centerHoleSize,
        gearType: shape.gearType,
        helixAngle: shape.helixAngle,
        helixQuality: shape.helixQuality,
      });
      break;
    case "wedge":
      geometry = createBooleanWedgeGeometry(width, height, depth);
      break;
    case "polygon":
      geometry = new THREE.CylinderGeometry(1, 1, height, 6);
      geometry.scale(width / 2, 1, depth / 2);
      break;
    case "icosahedron":
      geometry = new THREE.IcosahedronGeometry(size / 2, 1);
      geometry.translate(0, height / 2, 0);
      break;
    case "text":
      geometry = createBooleanTextGeometry(shape);
      break;
    case "scribble":
      geometry = new THREE.TorusKnotGeometry(size * 0.22, size * 0.055, 120, 12);
      geometry.translate(0, height / 2, 0);
      break;
    case "sketch":
    default:
      geometry = new THREE.BoxGeometry(size, Math.max(3, height * 0.35), size * 0.72);
      break;
  }

  return geometry ? bufferGeometryToMeshData(sanitizeName(shape.name), geometry) : null;
}

function meshForShape(shape: WorkplaneShape): MeshData {
  if (shape.kind === "mesh" && shape.importedMesh) {
    return importedMeshForShape(shape);
  }

  if (shape.groupedShapes?.length) {
    const vertices: Vec3[] = [];
    const faces: [number, number, number][] = [];
    shape.groupedShapes.filter((child) => !child.hidden).forEach((child) => {
      const childMesh = meshForShape(child);
      appendMeshData(vertices, faces, childMesh);
    });
    return transformMesh({ name: sanitizeName(shape.name), vertices, faces }, shape);
  }

  const raw =
    geometryMeshForShape(shape) ??
    (shape.kind === "cylinder" || shape.kind === "tube" || shape.kind === "ring" || shape.kind === "torus"
      ? cylinderMesh(shape, shape.sides ?? 96)
      : shape.kind === "cone"
        ? cylinderMesh(shape, shape.sides ?? 96, shape.baseRadius ? (shape.topRadius ?? 0) / shape.baseRadius : 0)
        : shape.kind === "sphere" || shape.kind === "halfSphere"
          ? sphereMesh(shape)
          : shape.kind === "pyramid"
            ? cylinderMesh(shape, shape.sides ?? 4, 0)
            : boxMesh(shape));
  return transformMesh(raw, shape);
}

function nativeProjectionSourceProfile(profile: SketchProfile): SketchProfile {
  const projectedPointIds = new Set(profile.points.filter((point) => point.projectionId).map((point) => point.id));
  return {
    ...profile,
    points: profile.points.filter((point) => !point.projectionId),
    segments: profile.segments.filter((segment) => !segment.projectionId && !projectedPointIds.has(segment.startId) && !projectedPointIds.has(segment.endId)),
    constraints: [],
    dimensions: [],
    images: [],
    texts: [],
    projections: [],
  };
}

function sketchProfileCenter(profile: SketchProfile) {
  if (!profile.points.length) return { x: 0, z: 0 };
  return {
    x: (Math.min(...profile.points.map((point) => point.x)) + Math.max(...profile.points.map((point) => point.x))) / 2,
    z: (Math.min(...profile.points.map((point) => point.z)) + Math.max(...profile.points.map((point) => point.z))) / 2,
  };
}

function projectShapeToSketchPlane(
  source: WorkplaneShape,
  sceneShapes: WorkplaneShape[],
  targetPose: ConstructionPlanePose,
  projectionId?: string,
): SketchProjectionResult {
  if (source.sketchProfile) {
    const profile = nativeProjectionSourceProfile(source.sketchProfile);
    const center = sketchProfileCenter(profile);
    const sourcePose = source.sketchPlane
      ? constructionPlanePoseById(source.sketchPlane.constructionPlaneId, sceneShapes, source.sketchPlane.pose)
      : BASE_CONSTRUCTION_PLANE_POSE;
    const localCenter = source.sketchPlane?.localCenter ?? [source.x, (source.elevation ?? 0) + source.height / 2, source.z];
    return projectSketchProfileToPlane(
      profile,
      sourcePose,
      targetPose,
      [localCenter[0] - center.x, localCenter[1] - source.height / 2, localCenter[2] - center.z],
      createLocalId,
      projectionId,
    );
  }
  const mesh = meshForShape(source);
  return intersectMeshWithPlane(mesh.vertices, mesh.faces, targetPose, createLocalId, projectionId);
}

function refreshLinkedSketchProjections(
  profile: SketchProfile,
  sceneShapes: WorkplaneShape[],
  constructionPlaneId: string,
  targetPose = constructionPlanePoseById(constructionPlaneId, sceneShapes),
) {
  const links = profile.projections ?? [];
  if (!links.length) return profile;
  const linkedIds = new Set(links.map((link) => link.id));
  const retainedPointIds = new Set(profile.points.filter((point) => !point.projectionId || !linkedIds.has(point.projectionId)).map((point) => point.id));
  let refreshed: SketchProfile = {
    ...profile,
    points: profile.points.filter((point) => retainedPointIds.has(point.id)),
    segments: profile.segments.filter((segment) => (!segment.projectionId || !linkedIds.has(segment.projectionId)) && retainedPointIds.has(segment.startId) && retainedPointIds.has(segment.endId)),
  };
  for (const link of links) {
    const source = sceneShapes.find((shape) => shape.id === link.sourceShapeId && shape.kind !== "constructionPlane");
    if (!source) continue;
    const projected = projectShapeToSketchPlane(source, sceneShapes, targetPose, link.id);
    refreshed = {
      ...refreshed,
      points: [...refreshed.points, ...projected.points],
      segments: [...refreshed.segments, ...projected.segments],
    };
  }
  return pruneSketchParameters(refreshed);
}

function sketchReferenceShapeOnWorkplane(shape: WorkplaneShape, workplane: PlacementWorkplane): WorkplaneShape {
  const mesh = meshForShape(shape);
  const projectedVertices = mesh.vertices.map(([x, y, z]) => {
    const local = placementWorkplaneCoordinates(workplane, { x, y, z });
    return { x: local.x, y: -local.y, z: local.z };
  });
  const minX = Math.min(...projectedVertices.map((vertex) => vertex.x));
  const maxX = Math.max(...projectedVertices.map((vertex) => vertex.x));
  const minY = Math.min(...projectedVertices.map((vertex) => vertex.y));
  const maxY = Math.max(...projectedVertices.map((vertex) => vertex.y));
  const minZ = Math.min(...projectedVertices.map((vertex) => vertex.z));
  const maxZ = Math.max(...projectedVertices.map((vertex) => vertex.z));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const positions = mesh.faces.flatMap(([a, b, c]) => [a, b, c].flatMap((index) => {
    const vertex = projectedVertices[index];
    return [vertex.x - centerX, vertex.y - centerY, vertex.z - centerZ];
  }));
  const width = Math.max(0.01, maxX - minX);
  const depth = Math.max(0.01, maxZ - minZ);
  const height = Math.max(0.01, maxY - minY);

  return canonicalizeShape({
    ...shape,
    kind: "mesh",
    x: centerX,
    z: centerZ,
    elevation: 0,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    importedMesh: {
      positions,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: mesh.faces.length,
      sourceFormat: "json",
    },
    groupedShapes: undefined,
    edgeTreatments: undefined,
    edgeTreatmentHistory: undefined,
    cadDisplayEdges: undefined,
    cadBrep: undefined,
    cadBrepFrame: undefined,
    cadPrimitiveFrame: undefined,
  });
}

function appendMeshData(vertices: Vec3[], faces: [number, number, number][], mesh: MeshData) {
  const offset = vertices.length;
  for (let i = 0; i < mesh.vertices.length; i += 1) {
    vertices.push(mesh.vertices[i]);
  }
  for (let i = 0; i < mesh.faces.length; i += 1) {
    const [a, b, c] = mesh.faces[i];
    faces.push([a + offset, b + offset, c + offset]);
  }
}

function importedMeshForShape(shape: WorkplaneShape): MeshData {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 9) {
    return transformMesh(boxMesh(shape), shape);
  }

  const resizedPositions = resizedImportedMeshPositions(shape);
  const vertices: Vec3[] = [];
  for (let i = 0; i < resizedPositions.length; i += 3) {
    vertices.push([resizedPositions[i], resizedPositions[i + 1], resizedPositions[i + 2]]);
  }

  const faces: [number, number, number][] = [];
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    faces.push([i, i + 1, i + 2]);
  }

  return transformMesh({ name: sanitizeName(shape.name), vertices, faces }, shape);
}

function shapeHasTransformToBake(shape: WorkplaneShape) {
  return (
    Math.abs(cleanRotationDegrees(shape.rotation ?? 0, 3)) > 0 ||
    Math.abs(cleanRotationDegrees(shape.rotationX ?? 0, 3)) > 0 ||
    Math.abs(cleanRotationDegrees(shape.rotationZ ?? 0, 3)) > 0 ||
    Boolean(shape.mirrorX || shape.mirrorY || shape.mirrorZ)
  );
}

function cadModifierPrimitiveForShape(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  return cadModifierPrimitiveForBakedShape(shape)
    ?? (shapeHasTransformToBake(shape) ? cadModifierPrimitiveForAnalyticBox(shape) : null);
}

function bakeShapeTransformIntoMesh(shape: WorkplaneShape): WorkplaneShape {
  // Rotation is a non-destructive transform for editable text. Baking it would
  // change the shape to `kind: "mesh"`, hiding the Text and Font controls even
  // though the user never grouped or otherwise converted the object.
  if (shape.kind === "text" || !shapeHasTransformToBake(shape)) {
    return shape;
  }

  const mesh = meshForShape(shape);
  if (mesh.vertices.length < 3 || mesh.faces.length < 1) {
    return shape;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  mesh.vertices.forEach(([x, y, z]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  });

  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return shape;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const positions: number[] = [];
  const bakedCadMetadata = bakeCadMetadataForShapeTransform(shape, { centerX, minY, centerZ, width, depth, height, yawDegrees: meshYawDegrees(shape) });

  mesh.faces.forEach(([ai, bi, ci]) => {
    [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]].forEach(([x, y, z]) => {
      positions.push(x - centerX, y - minY, z - centerZ);
    });
  });

  return {
    ...shape,
    kind: "mesh",
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(minY, 0.0005),
    width,
    depth,
    height,
    size: Math.max(width, depth),
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    importedMesh: {
      positions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: mesh.faces.length,
      sourceFormat: "json",
    },
    ...bakedCadMetadata,
    imagePlate: undefined,
    groupedShapes: undefined,
    groupedBaseWidth: undefined,
    groupedBaseDepth: undefined,
    groupedBaseHeight: undefined,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Image could not be read"));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Image could not be read")));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Image could not be decoded")));
    image.src = dataUrl;
  });
}

async function prepareImportedImage(file: File) {
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceUrl);
  const pixelWidth = image.naturalWidth || image.width;
  const pixelHeight = image.naturalHeight || image.height;

  if (!pixelWidth || !pixelHeight) {
    throw new Error("Image has no readable dimensions");
  }

  const maxTextureSide = 2048;
  const textureScale = Math.min(1, maxTextureSide / Math.max(pixelWidth, pixelHeight));
  if (textureScale >= 1) {
    return {
      dataUrl: sourceUrl,
      mimeType: file.type || "image/png",
      pixelWidth,
      pixelHeight,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(pixelWidth * textureScale));
  canvas.height = Math.max(1, Math.round(pixelHeight * textureScale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image could not be prepared");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mimeType = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png";
  return {
    dataUrl: canvas.toDataURL(mimeType, 0.92),
    mimeType,
    pixelWidth,
    pixelHeight,
  };
}

function imagePlateDimensions(pixelWidth: number, pixelHeight: number) {
  const aspect = pixelWidth / Math.max(1, pixelHeight);
  const targetMax = 72;
  const minVisibleSide = 14;
  const maxAllowedSide = 110;
  let width = aspect >= 1 ? targetMax : targetMax * aspect;
  let depth = aspect >= 1 ? targetMax / aspect : targetMax;
  const minSide = Math.min(width, depth);

  if (minSide < minVisibleSide) {
    const boost = minVisibleSide / Math.max(0.001, minSide);
    width *= boost;
    depth *= boost;
  }

  const maxSide = Math.max(width, depth);
  if (maxSide > maxAllowedSide) {
    const shrink = maxAllowedSide / maxSide;
    width *= shrink;
    depth *= shrink;
  }

  return {
    width: Number(width.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    height: 1.6,
  };
}

async function importedShapeFromImage(file: File): Promise<WorkplaneShape> {
  const imagePlate = await prepareImportedImage(file);
  const dimensions = imagePlateDimensions(imagePlate.pixelWidth, imagePlate.pixelHeight);
  return {
    id: createLocalId("uploaded-image"),
    name: file.name.replace(/\.[^.]+$/, "") || "Imported Image",
    kind: "box",
    color: "#f4f7f9",
    x: 10,
    z: -10,
    size: Math.max(dimensions.width, dimensions.depth),
    width: dimensions.width,
    depth: dimensions.depth,
    height: dimensions.height,
    elevation: 0,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    radius: 0,
    steps: 1,
    imagePlate,
    locked: false,
    hidden: false,
  };
}

async function toSvg(shapes: WorkplaneShape[], title: string) {
  const runtime = await getManifoldRuntime();
  const layers: SvgProjectionLayer[] = [];

  for (const shape of shapes) {
    const created: ManifoldSolid[] = [];
    const projectedObjects: unknown[] = [];
    try {
      const solid = shapeToManifoldSolid(runtime, shape, created);
      if (!solid || solid.status() !== "NoError" || solid.numTri() < 1) {
        throw new Error(`Could not convert ${shape.name} into a watertight SVG outline`);
      }

      const topView = solid.rotate([90, 0, 0]);
      if (topView !== solid) created.push(topView);
      const projection = topView.project();
      projectedObjects.push(projection);
      const simplified = projection.simplify(0.00001);
      if (simplified !== projection) projectedObjects.push(simplified);
      const polygons = simplified.toPolygons();
      if (!polygons.length) throw new Error(`Top view of ${shape.name} has no exportable area`);
      layers.push({ name: shape.name, color: shape.color, polygons });
    } finally {
      [...new Set([...projectedObjects, ...created])].reverse().forEach(disposeManifold);
    }
  }

  return toSvgProjection(layers, title);
}

function triggerBrowserDownload(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadTextFile(filename: string, content: string, type: string): Promise<DownloadResult> {
  const mode = window.localStorage.getItem(DOWNLOAD_MODE_STORAGE_KEY);
  const folder = window.localStorage.getItem(DOWNLOAD_FOLDER_STORAGE_KEY)?.trim() ?? "";
  if (!STATIC_EXPORT_BUILD && mode === "folder" && folder) {
    const response = await fetch("/api/local-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, filename, folder }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string; path?: string } | null;
    if (!response.ok || !payload?.path) {
      throw new Error(payload?.error ?? "Could not save export");
    }
    return { mode: "folder", path: payload.path };
  }

  triggerBrowserDownload(filename, content, type);
  return { mode: "browser" };
}

async function downloadBlobFile(filename: string, blob: Blob): Promise<DownloadResult> {
  const mode = window.localStorage.getItem(DOWNLOAD_MODE_STORAGE_KEY);
  const folder = window.localStorage.getItem(DOWNLOAD_FOLDER_STORAGE_KEY)?.trim() ?? "";
  if (!STATIC_EXPORT_BUILD && mode === "folder" && folder) {
    const formData = new FormData();
    formData.set("file", blob, filename);
    formData.set("filename", filename);
    formData.set("folder", folder);
    const response = await fetch("/api/local-download", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { error?: string; path?: string } | null;
    if (!response.ok || !payload?.path) throw new Error(payload?.error ?? "Could not save export");
    return { mode: "folder", path: payload.path };
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { mode: "browser" };
}

function shapeAabb(shape: WorkplaneShape): Cuboid {
  const halfWidth = shapeWidth(shape) / 2;
  const halfDepth = shapeDepth(shape) / 2;
  return {
    minX: shape.x - halfWidth,
    maxX: shape.x + halfWidth,
    minY: shape.elevation ?? 0,
    maxY: (shape.elevation ?? 0) + shape.height,
    minZ: shape.z - halfDepth,
    maxZ: shape.z + halfDepth,
  };
}

function boundsForShapes(shapes: WorkplaneShape[]): Cuboid {
  const bounds = shapes.map(meshAabb);
  return boundsForCuboids(bounds);
}

function boundsForCuboids(bounds: Cuboid[]): Cuboid {
  return {
    minX: Math.min(...bounds.map((box) => box.minX)),
    maxX: Math.max(...bounds.map((box) => box.maxX)),
    minY: Math.min(...bounds.map((box) => box.minY)),
    maxY: Math.max(...bounds.map((box) => box.maxY)),
    minZ: Math.min(...bounds.map((box) => box.minZ)),
    maxZ: Math.max(...bounds.map((box) => box.maxZ)),
  };
}

function dropPatchForShape(shape: WorkplaneShape, targetY: number): Partial<WorkplaneShape> {
  const bounds = meshAabb(shape);
  const delta = targetY - bounds.minY;
  const nextElevation = (shape.elevation ?? 0) + delta;
  return { elevation: Math.abs(nextElevation) < 0.0005 ? 0 : Number(nextElevation.toFixed(4)) };
}

function meshAabb(shape: WorkplaneShape): Cuboid {
  const mesh = meshForShape(shape);
  if (mesh.vertices.length === 0) {
    return shapeAabb(shape);
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  mesh.vertices.forEach(([x, y, z]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  });

  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return shapeAabb(shape);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const ALIGN_EPSILON = 0.0005;
const ALIGN_AXES: AlignAxis[] = ["x", "y", "z"];
const ALIGN_TARGETS: AlignTarget[] = ["min", "center", "max"];

function alignCoordinate(bounds: Cuboid, axis: AlignAxis, target: AlignTarget) {
  const min = axis === "x" ? bounds.minX : axis === "y" ? bounds.minY : bounds.minZ;
  const max = axis === "x" ? bounds.maxX : axis === "y" ? bounds.maxY : bounds.maxZ;
  if (target === "min") {
    return min;
  }
  if (target === "max") {
    return max;
  }
  return (min + max) / 2;
}

function alignmentLabel(axis: AlignAxis, target: AlignTarget) {
  if (axis === "x") {
    return target === "min" ? "left" : target === "max" ? "right" : "center";
  }
  if (axis === "z") {
    return target === "min" ? "front" : target === "max" ? "back" : "middle";
  }
  return target === "min" ? "bottom" : target === "max" ? "top" : "middle";
}

function alignmentStatuses(selection: WorkplaneShape[], anchorId: string | null): AlignHandleStatus[] {
  if (selection.length < 2) {
    return [];
  }

  const boundsById = new Map(selection.map((shape) => [shape.id, meshAabb(shape)]));
  const anchorBounds = anchorId ? boundsById.get(anchorId) ?? null : null;
  const referenceBounds = anchorBounds ?? boundsForCuboids(Array.from(boundsById.values()));

  return ALIGN_AXES.flatMap((axis) =>
    ALIGN_TARGETS.map((target) => {
      const targetValue = alignCoordinate(referenceBounds, axis, target);
      const aligned = selection.every((shape) => {
        const bounds = boundsById.get(shape.id);
        return bounds ? Math.abs(alignCoordinate(bounds, axis, target) - targetValue) <= ALIGN_EPSILON : true;
      });
      const wouldMove = selection.some((shape) => {
        if (shape.locked || shape.id === anchorId) {
          return false;
        }
        const bounds = boundsById.get(shape.id);
        return bounds ? Math.abs(alignCoordinate(bounds, axis, target) - targetValue) > ALIGN_EPSILON : false;
      });
      const label = alignmentLabel(axis, target);
      return {
        axis,
        target,
        aligned,
        disabled: !wouldMove,
        title: aligned ? `Already aligned ${label}` : `Align ${label}`,
      };
    }),
  );
}

function alignedShapesForSelection(
  shapes: WorkplaneShape[],
  selectedIds: string[],
  selectedShapes: WorkplaneShape[],
  anchorId: string | null,
  axis: AlignAxis,
  target: AlignTarget,
) {
  const selected = new Set(selectedIds);
  const boundsById = new Map(selectedShapes.map((shape) => [shape.id, meshAabb(shape)]));
  const anchorBounds = anchorId ? boundsById.get(anchorId) ?? null : null;
  const referenceBounds = anchorBounds ?? boundsForCuboids(Array.from(boundsById.values()));
  const targetValue = alignCoordinate(referenceBounds, axis, target);
  let moved = 0;

  const nextShapes = shapes.map((shape) => {
    if (!selected.has(shape.id) || shape.locked || shape.id === anchorId) {
      return shape;
    }
    const bounds = boundsById.get(shape.id);
    if (!bounds) {
      return shape;
    }
    const delta = targetValue - alignCoordinate(bounds, axis, target);
    if (Math.abs(delta) <= ALIGN_EPSILON) {
      return shape;
    }
    moved += 1;
    if (axis === "x") {
      return { ...shape, x: cleanNearZero(Number((shape.x + delta).toFixed(4)), ALIGN_EPSILON) };
    }
    if (axis === "z") {
      return { ...shape, z: cleanNearZero(Number((shape.z + delta).toFixed(4)), ALIGN_EPSILON) };
    }
    return { ...shape, elevation: cleanNearZero(Number(((shape.elevation ?? 0) + delta).toFixed(4)), ALIGN_EPSILON) };
  });

  return { nextShapes, moved };
}

function effectiveAlignmentAnchorId(selection: WorkplaneShape[], requestedAnchorId: string | null) {
  return selection.find((shape) => shape.locked)?.id
    ?? (requestedAnchorId && selection.some((shape) => shape.id === requestedAnchorId) ? requestedAnchorId : null);
}

function mirrorAxisLabel(axis: AlignAxis) {
  return axis === "x" ? "left-right" : axis === "z" ? "front-back" : "top-bottom";
}

function mirrorFlagPatch(shape: WorkplaneShape, axis: AlignAxis) {
  if (axis === "x") {
    return { mirrorX: !shape.mirrorX };
  }
  if (axis === "z") {
    return { mirrorZ: !shape.mirrorZ };
  }
  return { mirrorY: !shape.mirrorY };
}

function reflectionMatrixForAxis(axis: AlignAxis) {
  return new THREE.Matrix4().makeScale(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, axis === "z" ? -1 : 1);
}

function mirroredShapePatch(shape: WorkplaneShape, axis: AlignAxis, pivot: number): Partial<WorkplaneShape> {
  const centerY = (shape.elevation ?? 0) + shape.height / 2;
  const nextCenter = axis === "x" ? 2 * pivot - shape.x : axis === "z" ? 2 * pivot - shape.z : 2 * pivot - centerY;
  const worldReflection = reflectionMatrixForAxis(axis);
  const localReflection = reflectionMatrixForAxis(axis);
  const currentRotation = new THREE.Matrix4().makeRotationFromQuaternion(quaternionForShape(shape));
  const nextRotationMatrix = worldReflection.multiply(currentRotation).multiply(localReflection);
  const nextQuaternion = new THREE.Quaternion().setFromRotationMatrix(nextRotationMatrix);
  const rotationPatch = rotationFromQuaternion(nextQuaternion);
  const positionPatch =
    axis === "x"
      ? { x: cleanNearZero(Number(nextCenter.toFixed(4)), ALIGN_EPSILON) }
      : axis === "z"
        ? { z: cleanNearZero(Number(nextCenter.toFixed(4)), ALIGN_EPSILON) }
        : { elevation: cleanNearZero(Number((nextCenter - shape.height / 2).toFixed(4)), ALIGN_EPSILON) };

  return {
    ...shape,
    ...positionPatch,
    ...rotationPatch,
    ...mirrorFlagPatch(shape, axis),
  };
}

function mirroredShapesForSelection(shapes: WorkplaneShape[], selectedIds: string[], selectedShapes: WorkplaneShape[], axis: AlignAxis) {
  if (selectedShapes.length === 0) {
    return { nextShapes: shapes, moved: 0 };
  }

  const selected = new Set(selectedIds);
  const selectionBounds = boundsForShapes(selectedShapes);
  const pivot = axis === "x" ? (selectionBounds.minX + selectionBounds.maxX) / 2 : axis === "z" ? (selectionBounds.minZ + selectionBounds.maxZ) / 2 : (selectionBounds.minY + selectionBounds.maxY) / 2;
  let moved = 0;
  const nextShapes = shapes.map((shape) => {
    if (!selected.has(shape.id) || shape.locked) {
      return shape;
    }
    moved += 1;
    return {
      ...shape,
      ...mirroredShapePatch(shape, axis, pivot),
    };
  });

  return { nextShapes, moved };
}

function geometryFromMeshData(mesh: MeshData) {
  const positions: number[] = [];
  mesh.faces.forEach(([ai, bi, ci]) => {
    [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]].forEach(([x, y, z]) => {
      positions.push(x, y, z);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function positionsFromGeometryDrawRange(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  if (!position) {
    return [];
  }

  const positions: number[] = [];
  const drawStart = Math.max(0, Math.floor(geometry.drawRange.start || 0));
  if (geometry.index) {
    const index = geometry.index;
    const drawCount = Number.isFinite(geometry.drawRange.count) ? Math.max(0, Math.floor(geometry.drawRange.count)) : index.count - drawStart;
    const end = Math.min(index.count, drawStart + drawCount);
    for (let i = drawStart; i + 2 < end; i += 3) {
      for (let offset = 0; offset < 3; offset += 1) {
        const vertexIndex = index.getX(i + offset);
        positions.push(position.getX(vertexIndex), position.getY(vertexIndex), position.getZ(vertexIndex));
      }
    }
    return positions;
  }

  const drawCount = Number.isFinite(geometry.drawRange.count) ? Math.max(0, Math.floor(geometry.drawRange.count)) : position.count - drawStart;
  const end = Math.min(position.count, drawStart + drawCount);
  for (let i = drawStart; i + 2 < end; i += 3) {
    positions.push(
      position.getX(i),
      position.getY(i),
      position.getZ(i),
      position.getX(i + 1),
      position.getY(i + 1),
      position.getZ(i + 1),
      position.getX(i + 2),
      position.getY(i + 2),
      position.getZ(i + 2),
    );
  }
  return positions;
}

function boundsForPositions(positions: number[]): Cuboid | null {
  if (positions.length < 9) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return [minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite) ? { minX, maxX, minY, maxY, minZ, maxZ } : null;
}

function quantizedPointKey([x, y, z]: Vec3, tolerance: number) {
  return [x, y, z].map((value) => Math.round(value / tolerance)).join(",");
}

function triangleSignature(points: Vec3[], tolerance: number) {
  return points.map((point) => quantizedPointKey(point, tolerance)).sort().join("|");
}

function addSignature(signatures: Map<string, number>, signature: string) {
  signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
}

function meshSignatureMap(mesh: MeshData, tolerance: number) {
  const signatures = new Map<string, number>();
  mesh.faces.forEach(([ai, bi, ci]) => {
    addSignature(signatures, triangleSignature([mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]], tolerance));
  });
  return signatures;
}

function positionsSignatureMap(positions: number[], tolerance: number) {
  const signatures = new Map<string, number>();
  for (let i = 0; i + 8 < positions.length; i += 9) {
    addSignature(
      signatures,
      triangleSignature(
        [
          [positions[i], positions[i + 1], positions[i + 2]],
          [positions[i + 3], positions[i + 4], positions[i + 5]],
          [positions[i + 6], positions[i + 7], positions[i + 8]],
        ],
        tolerance,
      ),
    );
  }
  return signatures;
}

function signatureMapsDiffer(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) {
    return true;
  }
  for (const [signature, count] of a) {
    if (b.get(signature) !== count) {
      return true;
    }
  }
  return false;
}

function positionsDifferFromMeshData(positions: number[], mesh: MeshData, tolerance = 0.0005) {
  if (Math.floor(positions.length / 9) !== mesh.faces.length) {
    return true;
  }
  return signatureMapsDiffer(positionsSignatureMap(positions, tolerance), meshSignatureMap(mesh, tolerance));
}

function geometryDiffersFromMeshData(geometry: THREE.BufferGeometry, mesh: MeshData, tolerance = 0.0005) {
  return positionsDifferFromMeshData(positionsFromGeometryDrawRange(geometry), mesh, tolerance);
}

function sortedEdgeKey(a: Vec3, b: Vec3, tolerance: number) {
  const ak = quantizedPointKey(a, tolerance);
  const bk = quantizedPointKey(b, tolerance);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function edgeMidpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function addBoundaryEdge(edges: Map<string, { count: number; midpoint: Vec3 }>, a: Vec3, b: Vec3, tolerance: number) {
  const key = sortedEdgeKey(a, b, tolerance);
  const existing = edges.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    edges.set(key, { count: 1, midpoint: edgeMidpoint(a, b) });
  }
}

function positionsBoundaryEdges(positions: number[], tolerance = 0.0005) {
  const edges = new Map<string, { count: number; midpoint: Vec3 }>();
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    const b: Vec3 = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c: Vec3 = [positions[i + 6], positions[i + 7], positions[i + 8]];
    addBoundaryEdge(edges, a, b, tolerance);
    addBoundaryEdge(edges, b, c, tolerance);
    addBoundaryEdge(edges, c, a, tolerance);
  }
  return Array.from(edges.values()).filter((edge) => edge.count === 1);
}

function meshDataPositions(mesh: MeshData) {
  const positions: number[] = [];
  mesh.faces.forEach(([ai, bi, ci]) => {
    [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]].forEach(([x, y, z]) => {
      positions.push(x, y, z);
    });
  });
  return positions;
}

function meshFaceComponents(mesh: MeshData, tolerance = SEPARATE_PARTS_VERTEX_TOLERANCE) {
  if (mesh.faces.length === 0) return [];
  const keysByFace = mesh.faces.map((face) => face.map((vertexIndex) => quantizedPointKey(mesh.vertices[vertexIndex], tolerance)));
  const facesByVertex = new Map<string, number[]>();
  keysByFace.forEach((keys, faceIndex) => {
    keys.forEach((key) => {
      const current = facesByVertex.get(key);
      if (current) {
        current.push(faceIndex);
      } else {
        facesByVertex.set(key, [faceIndex]);
      }
    });
  });

  const visited = new Uint8Array(mesh.faces.length);
  const components: number[][] = [];
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex += 1) {
    if (visited[faceIndex]) continue;
    const component: number[] = [];
    const queue = [faceIndex];
    visited[faceIndex] = 1;
    while (queue.length > 0) {
      const current = queue.pop() as number;
      component.push(current);
      keysByFace[current].forEach((key) => {
        const neighbors = facesByVertex.get(key);
        if (!neighbors) return;
        facesByVertex.delete(key);
        neighbors.forEach((neighbor) => {
          if (visited[neighbor]) return;
          visited[neighbor] = 1;
          queue.push(neighbor);
        });
      });
    }
    components.push(component);
  }
  return components;
}

function meshComponentShape(source: WorkplaneShape, mesh: MeshData, faceIndices: number[], partIndex: number, totalParts: number): WorkplaneShape | null {
  const worldPositions: number[] = [];
  faceIndices.forEach((faceIndex) => {
    const face = mesh.faces[faceIndex];
    if (!face) return;
    face.forEach((vertexIndex) => {
      const vertex = mesh.vertices[vertexIndex];
      if (vertex) worldPositions.push(vertex[0], vertex[1], vertex[2]);
    });
  });

  const bounds = boundsForPositions(worldPositions);
  if (!bounds) return null;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, bounds.maxX - bounds.minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, bounds.maxY - bounds.minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, bounds.maxZ - bounds.minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const positions = worldPositions.map((value, index) => {
    if (index % 3 === 0) return value - centerX;
    if (index % 3 === 1) return value - bounds.minY;
    return value - centerZ;
  });

  return canonicalizeShape({
    id: createLocalId(`${source.id}-part`),
    name: totalParts > 1 ? `${source.name} Part ${partIndex + 1}` : source.name,
    kind: "mesh",
    color: source.color,
    hole: source.hole || undefined,
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(bounds.minY, 0.0005),
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    locked: false,
    hidden: source.hidden,
  });
}

function separateMeshParts(shape: WorkplaneShape) {
  const mesh = meshForShape(shape);
  const components = meshFaceComponents(mesh).filter((component) => component.length > 0);
  if (components.length <= 1) return [];
  return components
    .map((component, index) => meshComponentShape(shape, mesh, component, index, components.length))
    .filter((part): part is WorkplaneShape => Boolean(part));
}

function cadModifierSourceParts(shape: WorkplaneShape) {
  if (shape.kind !== "text" || shape.importedMesh || shape.cadBrep) return [shape];
  const glyphParts = separateMeshParts(shape);
  return glyphParts.length > 1 ? glyphParts : [shape];
}

function separablePartCount(shape: WorkplaneShape) {
  if (shape.locked || shape.hole) return 0;
  if (shape.groupedShapes?.length && !shape.importedMesh) return shape.groupedShapes.length;
  const mesh = meshForShape(shape);
  return meshFaceComponents(mesh).length;
}

function separateShapeParts(shape: WorkplaneShape) {
  if (shape.locked || shape.hole) return [];
  if (shape.groupedShapes?.length && !shape.importedMesh) {
    const restored = restoreGroupedChildren(shape);
    return restored.length > 1 ? restored : [];
  }
  return separateMeshParts(shape);
}

function cutBoundaryEdgeCount(positions: number[], cutters: WorkplaneShape[]) {
  if (cutters.length === 0) {
    return 0;
  }
  return positionsBoundaryEdges(positions).filter((edge) => cutters.some((cutter) => pointInsideHoleShape(edge.midpoint, cutter))).length;
}

function introducesOpenCutBoundary(resultPositions: number[], sourceMesh: MeshData, cutters: WorkplaneShape[]) {
  const resultCutBoundaries = cutBoundaryEdgeCount(resultPositions, cutters);
  if (resultCutBoundaries === 0) {
    return false;
  }

  const sourceCutBoundaries = cutBoundaryEdgeCount(meshDataPositions(sourceMesh), cutters);
  return resultCutBoundaries > sourceCutBoundaries + Math.max(4, Math.floor(sourceCutBoundaries * 0.25));
}

function cuboidFromBox3(box: THREE.Box3): Cuboid {
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    minZ: box.min.z,
    maxZ: box.max.z,
  };
}

function paddedCutterShape(shape: WorkplaneShape): WorkplaneShape {
  const width = shapeWidth(shape) + CUTTER_PADDING * 2;
  const depth = shapeDepth(shape) + CUTTER_PADDING * 2;
  const height = shape.height + CUTTER_PADDING * 2;
  return {
    ...shape,
    width,
    depth,
    height,
    size: Math.max(width, depth),
    elevation: (shape.elevation ?? 0) - CUTTER_PADDING,
    baseRadius: shape.baseRadius ? shape.baseRadius + CUTTER_PADDING : shape.baseRadius,
  };
}

function brushFromShape(shape: WorkplaneShape, cutter = false) {
  const brush = new Brush(geometryFromMeshData(meshForShape(cutter ? paddedCutterShape(shape) : shape)));
  brush.updateMatrixWorld(true);
  return brush;
}

function positiveCuboid(cuboid: Cuboid) {
  return cuboid.maxX - cuboid.minX > 0.01 && cuboid.maxY - cuboid.minY > 0.01 && cuboid.maxZ - cuboid.minZ > 0.01;
}

function subtractCuboid(source: Cuboid, cutter: Cuboid): Cuboid[] {
  const overlap = {
    minX: Math.max(source.minX, cutter.minX),
    maxX: Math.min(source.maxX, cutter.maxX),
    minY: Math.max(source.minY, cutter.minY),
    maxY: Math.min(source.maxY, cutter.maxY),
    minZ: Math.max(source.minZ, cutter.minZ),
    maxZ: Math.min(source.maxZ, cutter.maxZ),
  };

  if (!positiveCuboid(overlap)) {
    return [source];
  }

  return [
    { ...source, maxX: overlap.minX },
    { ...source, minX: overlap.maxX },
    { minX: overlap.minX, maxX: overlap.maxX, minY: source.minY, maxY: source.maxY, minZ: source.minZ, maxZ: overlap.minZ },
    { minX: overlap.minX, maxX: overlap.maxX, minY: source.minY, maxY: source.maxY, minZ: overlap.maxZ, maxZ: source.maxZ },
    { minX: overlap.minX, maxX: overlap.maxX, minY: source.minY, maxY: overlap.minY, minZ: overlap.minZ, maxZ: overlap.maxZ },
    { minX: overlap.minX, maxX: overlap.maxX, minY: overlap.maxY, maxY: source.maxY, minZ: overlap.minZ, maxZ: overlap.maxZ },
  ].filter(positiveCuboid);
}

function cuboidsOverlap(a: Cuboid, b: Cuboid) {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > 0.01 &&
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 0.01 &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 0.01
  );
}

function hasSolidHoleOverlap(solids: WorkplaneShape[], holes: WorkplaneShape[]) {
  const solidBounds = solids.map(meshAabb);
  const holeBounds = holes.map((hole) => meshAabb(paddedCutterShape(hole)));
  return solidBounds.some((solid) => holeBounds.some((hole) => cuboidsOverlap(solid, hole)));
}

function pointInsideCuboid(point: Vec3, cuboid: Cuboid, inset = -POINT_TOLERANCE) {
  const minX = cuboid.minX + inset;
  const maxX = cuboid.maxX - inset;
  const minY = cuboid.minY + inset;
  const maxY = cuboid.maxY - inset;
  const minZ = cuboid.minZ + inset;
  const maxZ = cuboid.maxZ - inset;
  return (
    minX <= maxX &&
    minY <= maxY &&
    minZ <= maxZ &&
    point[0] >= minX &&
    point[0] <= maxX &&
    point[1] >= minY &&
    point[1] <= maxY &&
    point[2] >= minZ &&
    point[2] <= maxZ
  );
}

function pointInsideHoleShape(point: Vec3, shape: WorkplaneShape, strictInterior = false) {
  if (shape.importedMesh || shape.groupedShapes?.length) {
    return pointInsideCuboid(point, meshAabb(shape), strictInterior ? CUTTER_RESIDUAL_INSET : -POINT_TOLERANCE);
  }

  const centerY = shape.height / 2;
  const inverse = new THREE.Matrix4()
    .makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(shape.rotationX ?? 0),
        THREE.MathUtils.degToRad(shape.rotation),
        THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
        "XYZ",
      ),
    )
    .invert();
  const local = new THREE.Vector3(point[0] - shape.x, point[1] - (shape.elevation ?? 0) - centerY, point[2] - shape.z).applyMatrix4(inverse);
  const localY = local.y + centerY;
  const halfWidth = shapeWidth(shape) / 2;
  const halfDepth = shapeDepth(shape) / 2;
  if (strictInterior) {
    const yInset = Math.min(CUTTER_RESIDUAL_INSET, shape.height * 0.25);
    const xInset = Math.min(CUTTER_RESIDUAL_INSET, halfWidth * 0.25);
    const zInset = Math.min(CUTTER_RESIDUAL_INSET, halfDepth * 0.25);
    const innerHalfWidth = halfWidth - xInset;
    const innerHalfDepth = halfDepth - zInset;
    if (innerHalfWidth <= 0 || innerHalfDepth <= 0 || localY <= yInset || localY >= shape.height - yInset) {
      return false;
    }

    if (shape.kind === "cylinder" || shape.kind === "sphere" || shape.kind === "halfSphere" || shape.kind === "cone" || shape.kind === "torus" || shape.kind === "tube" || shape.kind === "ring") {
      const nx = local.x / Math.max(POINT_TOLERANCE, innerHalfWidth);
      const nz = local.z / Math.max(POINT_TOLERANCE, innerHalfDepth);
      return nx * nx + nz * nz < 1;
    }

    return Math.abs(local.x) < innerHalfWidth && Math.abs(local.z) < innerHalfDepth;
  }

  const insideHeight = localY >= -POINT_TOLERANCE && localY <= shape.height + POINT_TOLERANCE;
  if (!insideHeight) {
    return false;
  }

  if (shape.kind === "cylinder" || shape.kind === "sphere" || shape.kind === "halfSphere" || shape.kind === "cone" || shape.kind === "torus" || shape.kind === "tube" || shape.kind === "ring") {
    const nx = local.x / Math.max(POINT_TOLERANCE, halfWidth);
    const nz = local.z / Math.max(POINT_TOLERANCE, halfDepth);
    return nx * nx + nz * nz <= 1.0001;
  }

  return Math.abs(local.x) <= halfWidth + POINT_TOLERANCE && Math.abs(local.z) <= halfDepth + POINT_TOLERANCE;
}

function triangleCentroid([a, b, c]: Vec3[]): Vec3 {
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}

function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function triangleAabb([a, b, c]: Vec3[]): Cuboid {
  return {
    minX: Math.min(a[0], b[0], c[0]),
    maxX: Math.max(a[0], b[0], c[0]),
    minY: Math.min(a[1], b[1], c[1]),
    maxY: Math.max(a[1], b[1], c[1]),
    minZ: Math.min(a[2], b[2], c[2]),
    maxZ: Math.max(a[2], b[2], c[2]),
  };
}

function polygonAabb(points: Vec3[]): Cuboid {
  return points.reduce<Cuboid>(
    (bounds, [x, y, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minY: Math.min(bounds.minY, y),
      maxY: Math.max(bounds.maxY, y),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function cuboidsTouch(a: Cuboid, b: Cuboid, tolerance = 0.0001) {
  return (
    Math.min(a.maxX, b.maxX) + tolerance >= Math.max(a.minX, b.minX) &&
    Math.min(a.maxY, b.maxY) + tolerance >= Math.max(a.minY, b.minY) &&
    Math.min(a.maxZ, b.maxZ) + tolerance >= Math.max(a.minZ, b.minZ)
  );
}

function triangleTouchesHoleShape(triangle: Vec3[], hole: WorkplaneShape, holeBounds: Cuboid) {
  const bounds = triangleAabb(triangle);
  if (!cuboidsTouch(bounds, holeBounds)) {
    return false;
  }

  const [a, b, c] = triangle;
  const samples = [a, b, c, triangleCentroid(triangle), midpoint(a, b), midpoint(b, c), midpoint(c, a)];
  if (samples.some((point) => pointInsideHoleShape(point, hole))) {
    return true;
  }

  // Imported STLs are often open triangle soups. A cutter can cross a small triangle
  // without catching any sampled point, so tiny overlapping triangles are clipped too.
  const triangleSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ);
  const cutterSpan = Math.max(holeBounds.maxX - holeBounds.minX, holeBounds.maxY - holeBounds.minY, holeBounds.maxZ - holeBounds.minZ);
  return triangleSpan <= cutterSpan * 0.35;
}

function cutterTouchedTriangleCount(mesh: MeshData, cutters: WorkplaneShape[]) {
  const cutterInfo = cutters.map((cutter) => ({ shape: cutter, bounds: meshAabb(cutter) }));
  return mesh.faces.reduce((total, [ai, bi, ci]) => {
    const triangle = [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]];
    return total + (cutterInfo.some((cutter) => triangleTouchesHoleShape(triangle, cutter.shape, cutter.bounds)) ? 1 : 0);
  }, 0);
}

function isAxisAlignedBoxCutter(shape: WorkplaneShape) {
  const rotation = Math.abs(normalizeDegrees(shape.rotation));
  const rotationX = Math.abs(normalizeDegrees(shape.rotationX ?? 0));
  const rotationZ = Math.abs(normalizeDegrees(shape.rotationZ ?? 0));
  const straightY = rotation < 0.001 || Math.abs(rotation - 180) < 0.001 || Math.abs(rotation - 360) < 0.001;
  const straightX = rotationX < 0.001 || Math.abs(rotationX - 180) < 0.001 || Math.abs(rotationX - 360) < 0.001;
  const straightZ = rotationZ < 0.001 || Math.abs(rotationZ - 180) < 0.001 || Math.abs(rotationZ - 360) < 0.001;
  return shape.kind === "box" && straightX && straightY && straightZ;
}

type ClipPlane = { axis: 0 | 1 | 2; value: number; keepGreater: boolean };

function clipDistance(point: Vec3, plane: ClipPlane) {
  return plane.keepGreater ? point[plane.axis] - plane.value : plane.value - point[plane.axis];
}

function interpolateVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clipPolygonByPlane(polygon: Vec3[], plane: ClipPlane, keepInside: boolean) {
  if (polygon.length < 3) {
    return [];
  }

  const clipped: Vec3[] = [];
  const isKept = (distance: number) => (keepInside ? distance >= -0.0001 : distance <= 0.0001);

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentDistance = clipDistance(current, plane);
    const nextDistance = clipDistance(next, plane);
    const currentKept = isKept(currentDistance);
    const nextKept = isKept(nextDistance);

    if (currentKept) {
      clipped.push(current);
    }

    if (currentKept !== nextKept) {
      const denom = currentDistance - nextDistance;
      const t = Math.abs(denom) > 0.000001 ? currentDistance / denom : 0;
      clipped.push(interpolateVec3(current, next, t));
    }
  }

  return clipped;
}

function subtractCuboidFromPolygon(polygon: Vec3[], cuboid: Cuboid) {
  const planes: ClipPlane[] = [
    { axis: 0, value: cuboid.minX, keepGreater: true },
    { axis: 0, value: cuboid.maxX, keepGreater: false },
    { axis: 1, value: cuboid.minY, keepGreater: true },
    { axis: 1, value: cuboid.maxY, keepGreater: false },
    { axis: 2, value: cuboid.minZ, keepGreater: true },
    { axis: 2, value: cuboid.maxZ, keepGreater: false },
  ];
  let pending = [polygon];
  const outsidePieces: Vec3[][] = [];

  for (const plane of planes) {
    const nextPending: Vec3[][] = [];
    pending.forEach((piece) => {
      const outside = clipPolygonByPlane(piece, plane, false);
      if (outside.length >= 3) {
        outsidePieces.push(outside);
      }

      const inside = clipPolygonByPlane(piece, plane, true);
      if (inside.length >= 3) {
        nextPending.push(inside);
      }
    });
    pending = nextPending;
    if (pending.length === 0) {
      break;
    }
  }

  return outsidePieces;
}

function triangulatePolygonToPositions(polygon: Vec3[], positions: number[]) {
  if (polygon.length < 3) {
    return;
  }

  const first = polygon[0];
  for (let i = 1; i < polygon.length - 1; i += 1) {
    const b = polygon[i];
    const c = polygon[i + 1];
    positions.push(first[0], first[1], first[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
}

function addQuadToPositions(positions: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  positions.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
}

type HoleWallSide = "minX" | "maxX" | "minZ" | "maxZ";
type HoleWallSegment = { a: Vec3; b: Vec3; minCross: number; maxCross: number; avgY: number; key: string };

function localCutWallBaseY(segments: HoleWallSegment[], minY: number, maxY: number) {
  const ys = segments
    .flatMap((segment) => [segment.a[1], segment.b[1], segment.avgY])
    .filter((value) => value >= minY - 0.001 && value <= maxY + 0.001)
    .sort((a, b) => a - b);
  if (ys.length < 2) {
    return minY;
  }

  let largestGap = 0;
  let gapIndex = -1;
  const minimumGap = Math.max(0.25, (maxY - minY) * 0.08);
  for (let i = 1; i < ys.length; i += 1) {
    const gap = ys[i] - ys[i - 1];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = i;
    }
  }

  if (gapIndex > 0 && largestGap > minimumGap) {
    return ys[gapIndex - 1];
  }

  return ys[Math.max(0, Math.floor(ys.length * 0.12))];
}

function clipSegmentToRect(a: Vec3, b: Vec3, crossAxis: 0 | 1 | 2, crossMin: number, crossMax: number, minY: number, maxY: number): [Vec3, Vec3] | null {
  let t0 = 0;
  let t1 = 1;
  const clipRange = (start: number, end: number, min: number, max: number) => {
    const delta = end - start;
    if (Math.abs(delta) < 0.000001) {
      return start >= min - 0.0001 && start <= max + 0.0001;
    }
    const ta = (min - start) / delta;
    const tb = (max - start) / delta;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    return t0 <= t1 + 0.0001;
  };

  if (!clipRange(a[crossAxis], b[crossAxis], crossMin, crossMax) || !clipRange(a[1], b[1], minY, maxY)) {
    return null;
  }

  const start = interpolateVec3(a, b, Math.max(0, Math.min(1, t0)));
  const end = interpolateVec3(a, b, Math.max(0, Math.min(1, t1)));
  return Math.hypot(start[0] - end[0], start[1] - end[1], start[2] - end[2]) > 0.01 ? [start, end] : null;
}

function trianglePlaneSegment(triangle: Vec3[], axis: 0 | 1 | 2, plane: number): [Vec3, Vec3] | null {
  const points: Vec3[] = [];
  const addPoint = (point: Vec3) => {
    if (!points.some((existing) => Math.hypot(existing[0] - point[0], existing[1] - point[1], existing[2] - point[2]) < 0.0001)) {
      points.push(point);
    }
  };

  for (let i = 0; i < 3; i += 1) {
    const a = triangle[i];
    const b = triangle[(i + 1) % 3];
    const da = a[axis] - plane;
    const db = b[axis] - plane;

    if (Math.abs(da) <= 0.0001) {
      addPoint(a);
    }
    if (Math.abs(db) <= 0.0001) {
      addPoint(b);
    }
    if (da * db < -0.00000001) {
      addPoint(interpolateVec3(a, b, da / (da - db)));
    }
  }

  if (points.length < 2) {
    return null;
  }

  let best: [Vec3, Vec3] = [points[0], points[1]];
  let bestDistance = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const distance = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1], points[i][2] - points[j][2]);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [points[i], points[j]];
      }
    }
  }

  return bestDistance > 0.01 ? best : null;
}

function addLocalHoleWallSegments(positions: number[], sourceMesh: MeshData, hole: Cuboid, solidBounds: Cuboid, side: HoleWallSide) {
  const axis = side === "minX" || side === "maxX" ? 0 : 2;
  const crossAxis = axis === 0 ? 2 : 0;
  const plane =
    side === "minX"
      ? Math.max(hole.minX, solidBounds.minX)
      : side === "maxX"
        ? Math.min(hole.maxX, solidBounds.maxX)
        : side === "minZ"
          ? Math.max(hole.minZ, solidBounds.minZ)
          : Math.min(hole.maxZ, solidBounds.maxZ);
  const crossMin = axis === 0 ? Math.max(hole.minZ, solidBounds.minZ) : Math.max(hole.minX, solidBounds.minX);
  const crossMax = axis === 0 ? Math.min(hole.maxZ, solidBounds.maxZ) : Math.min(hole.maxX, solidBounds.maxX);
  const minY = Math.max(hole.minY, solidBounds.minY);
  const maxY = Math.min(hole.maxY, solidBounds.maxY);
  const crossLength = crossMax - crossMin;
  if (crossLength <= 0.01 || maxY - minY <= 0.01) {
    return;
  }

  const sideTolerance = Math.max(0.0001, Math.min(hole.maxX - hole.minX, hole.maxZ - hole.minZ) * 0.0001);
  const seen = new Set<string>();
  const segmentKey = (a: Vec3, b: Vec3) => {
    const toKey = (point: Vec3) => `${Math.round(point[0] * 1000)},${Math.round(point[1] * 1000)},${Math.round(point[2] * 1000)}`;
    const ak = toKey(a);
    const bk = toKey(b);
    return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
  };
  const segments: HoleWallSegment[] = [];

  sourceMesh.faces.forEach(([ai, bi, ci]) => {
    const triangle = [sourceMesh.vertices[ai], sourceMesh.vertices[bi], sourceMesh.vertices[ci]];
    const bounds = polygonAabb(triangle);
    const minSide = axis === 0 ? bounds.minX : bounds.minZ;
    const maxSide = axis === 0 ? bounds.maxX : bounds.maxZ;
    const minCross = crossAxis === 0 ? bounds.minX : bounds.minZ;
    const maxCross = crossAxis === 0 ? bounds.maxX : bounds.maxZ;
    if (maxSide < plane - sideTolerance || minSide > plane + sideTolerance || maxCross < crossMin || minCross > crossMax || bounds.maxY < hole.minY || bounds.minY > hole.maxY) {
      return;
    }

    const rawSegment = trianglePlaneSegment(triangle, axis, plane);
    if (!rawSegment) {
      return;
    }
    const clipped = clipSegmentToRect(rawSegment[0], rawSegment[1], crossAxis, crossMin, crossMax, minY, maxY);
    if (!clipped) {
      return;
    }
    const [a, b] = clipped;
    if (Math.max(a[1], b[1]) <= minY + 0.01) {
      return;
    }
    const key = segmentKey(a, b);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    segments.push({
      a,
      b,
      minCross: Math.min(a[crossAxis], b[crossAxis]),
      maxCross: Math.max(a[crossAxis], b[crossAxis]),
      avgY: (a[1] + b[1]) / 2,
      key,
    });
  });

  const yTolerance = Math.max(0.03, (maxY - minY) * 0.01);
  const baseY = Math.max(minY, Math.min(maxY, localCutWallBaseY(segments, minY, maxY)));
  const minimumCrossSpan = Math.max(0.04, crossLength * 0.002);

  segments.forEach((segment) => {
    if (segment.maxCross - segment.minCross < minimumCrossSpan || Math.max(segment.a[1], segment.b[1]) - baseY <= yTolerance) {
      return;
    }
    const baseA: Vec3 = [segment.a[0], baseY, segment.a[2]];
    const baseB: Vec3 = [segment.b[0], baseY, segment.b[2]];
    addQuadToPositions(positions, segment.a, segment.b, baseB, baseA);
  });
}

function addBoxHoleInteriorFaces(positions: number[], hole: Cuboid, sourceMesh: MeshData, solidBounds: Cuboid) {
  const x0 = Math.max(hole.minX, solidBounds.minX);
  const x1 = Math.min(hole.maxX, solidBounds.maxX);
  const z0 = Math.max(hole.minZ, solidBounds.minZ);
  const z1 = Math.min(hole.maxZ, solidBounds.maxZ);
  if (x1 - x0 <= 0.01 || z1 - z0 <= 0.01) {
    return;
  }

  addLocalHoleWallSegments(positions, sourceMesh, hole, solidBounds, "minX");
  addLocalHoleWallSegments(positions, sourceMesh, hole, solidBounds, "maxX");
  addLocalHoleWallSegments(positions, sourceMesh, hole, solidBounds, "minZ");
  addLocalHoleWallSegments(positions, sourceMesh, hole, solidBounds, "maxZ");
}

function cuboidsToMesh(name: string, cuboids: Cuboid[], centerX: number, centerZ: number, baseY = 0): MeshData {
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];

  const uniqueSorted = (values: number[]) =>
    values
      .slice()
      .sort((a, b) => a - b)
      .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > 0.0001);

  const xs = uniqueSorted(cuboids.flatMap((cuboid) => [cuboid.minX, cuboid.maxX]));
  const ys = uniqueSorted(cuboids.flatMap((cuboid) => [cuboid.minY, cuboid.maxY]));
  const zs = uniqueSorted(cuboids.flatMap((cuboid) => [cuboid.minZ, cuboid.maxZ]));
  const filled = new Set<string>();
  const cellKey = (x: number, y: number, z: number) => `${x}:${y}:${z}`;

  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      for (let zi = 0; zi < zs.length - 1; zi += 1) {
        const cx = (xs[xi] + xs[xi + 1]) / 2;
        const cy = (ys[yi] + ys[yi + 1]) / 2;
        const cz = (zs[zi] + zs[zi + 1]) / 2;
        const inside = cuboids.some(
          (cuboid) =>
            cx > cuboid.minX + 0.0001 &&
            cx < cuboid.maxX - 0.0001 &&
            cy > cuboid.minY + 0.0001 &&
            cy < cuboid.maxY - 0.0001 &&
            cz > cuboid.minZ + 0.0001 &&
            cz < cuboid.maxZ - 0.0001,
        );
        if (inside) {
          filled.add(cellKey(xi, yi, zi));
        }
      }
    }
  }

  const isFilled = (x: number, y: number, z: number) => filled.has(cellKey(x, y, z));
  const addQuad = (points: Vec3[]) => {
    const offset = vertices.length;
    vertices.push(...points);
    faces.push([offset, offset + 1, offset + 2], [offset, offset + 2, offset + 3]);
  };

  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      for (let zi = 0; zi < zs.length - 1; zi += 1) {
        if (!isFilled(xi, yi, zi)) {
          continue;
        }

        const x0 = xs[xi] - centerX;
        const x1 = xs[xi + 1] - centerX;
        const y0 = ys[yi] - baseY;
        const y1 = ys[yi + 1] - baseY;
        const z0 = zs[zi] - centerZ;
        const z1 = zs[zi + 1] - centerZ;

        if (!isFilled(xi - 1, yi, zi)) addQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
        if (!isFilled(xi + 1, yi, zi)) addQuad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
        if (!isFilled(xi, yi - 1, zi)) addQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
        if (!isFilled(xi, yi + 1, zi)) addQuad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
        if (!isFilled(xi, yi, zi - 1)) addQuad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
        if (!isFilled(xi, yi, zi + 1)) addQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      }
    }
  }

  return { name, vertices, faces };
}

function booleanMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole);
  if (solids.length === 0 || holes.length === 0) {
    return null;
  }

  try {
    const sourceTriangleCount = solids.reduce((total, solid) => total + meshForShape(solid).faces.length, 0);
    const overlappingCut = hasSolidHoleOverlap(solids, holes);
    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ["position", "normal"];
    let result = brushFromShape(solids[0]);

    solids.slice(1).forEach((solid) => {
      result = evaluator.evaluate(result, brushFromShape(solid), ADDITION);
    });

    holes.forEach((hole) => {
      result = evaluator.evaluate(result, brushFromShape(hole, true), SUBTRACTION);
    });

    const resultPositions = positionsFromGeometryDrawRange(result.geometry);
    const groupBounds = boundsForPositions(resultPositions);
    if (!groupBounds) {
      return null;
    }

    const centerX = (groupBounds.minX + groupBounds.maxX) / 2;
    const centerZ = (groupBounds.minZ + groupBounds.maxZ) / 2;
    const minY = groupBounds.minY;
    const rawWidth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxX - groupBounds.minX);
    const rawHeight = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxY - groupBounds.minY);
    const rawDepth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxZ - groupBounds.minZ);
    const width = cleanModelDimension(rawWidth);
    const height = cleanModelDimension(rawHeight);
    const depth = cleanModelDimension(rawDepth);
    const positions: number[] = [];

    for (let i = 0; i < resultPositions.length; i += 3) {
      positions.push(resultPositions[i] - centerX, resultPositions[i + 1] - minY, resultPositions[i + 2] - centerZ);
    }

    const firstSolid = solids[0];
    const nextTriangleCount = Math.floor(positions.length / 9);
    if (overlappingCut && Math.abs(nextTriangleCount - sourceTriangleCount) <= 1) {
      return null;
    }

    return {
      id: createLocalId("grouped-boolean"),
      name: "Group",
      kind: "mesh",
      color: firstSolid.color,
      x: centerX,
      z: centerZ,
      elevation: minY,
      size: Math.max(width, depth),
      width,
      depth,
      height,
      rotation: 0,
      importedMesh: {
        positions,
        baseWidth: rawWidth,
        baseDepth: rawDepth,
        baseHeight: rawHeight,
        triangleCount: nextTriangleCount,
        sourceFormat: "json",
      },
      groupedBaseWidth: width,
      groupedBaseDepth: depth,
      groupedBaseHeight: height,
      groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
      locked: false,
      hidden: false,
    };
  } catch {
    return null;
  }
}

function resultGeometryToMeshShape(
  selection: WorkplaneShape[],
  solids: WorkplaneShape[],
  geometry: THREE.BufferGeometry,
  idPrefix: string,
): WorkplaneShape | null {
  const resultPositions = positionsFromGeometryDrawRange(geometry);
  const groupBounds = boundsForPositions(resultPositions);
  if (!groupBounds) {
    return null;
  }

  const centerX = (groupBounds.minX + groupBounds.maxX) / 2;
  const centerZ = (groupBounds.minZ + groupBounds.maxZ) / 2;
  const minY = groupBounds.minY;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxX - groupBounds.minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxY - groupBounds.minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxZ - groupBounds.minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const positions: number[] = [];

  for (let i = 0; i < resultPositions.length; i += 3) {
    positions.push(resultPositions[i] - centerX, resultPositions[i + 1] - minY, resultPositions[i + 2] - centerZ);
  }

  const firstSolid = solids[0];

  return {
    id: createLocalId(idPrefix),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function isUsableBooleanGroup(group: WorkplaneShape | null, sourceTriangleCount = 0, enforceMinimumTriangles = true) {
  if (!group?.importedMesh) {
    return false;
  }

  const positions = group.importedMesh.positions;
  const triangleCount = group.importedMesh.triangleCount;
  const dimensions = [group.width, group.height, group.depth, group.size, group.x, group.z, group.elevation ?? 0];
  if (positions.length < 9 || triangleCount < 1 || positions.some((value) => !Number.isFinite(value)) || dimensions.some((value) => !Number.isFinite(value))) {
    return false;
  }

  const minTriangles = enforceMinimumTriangles && sourceTriangleCount > 0 ? Math.max(2, Math.min(48, Math.floor(sourceTriangleCount * 0.004))) : 2;
  return triangleCount >= minTriangles && group.width > 0.01 && group.height > 0.01 && group.depth > 0.01;
}

function looksLikeUnchangedBooleanResult(group: WorkplaneShape | null, sourceTriangleCount: number, requireChanged = true) {
  if (!group?.importedMesh) {
    return true;
  }

  if (!requireChanged) {
    return false;
  }

  const sameTriangles = Math.abs(group.importedMesh.triangleCount - sourceTriangleCount) <= 1;
  return sameTriangles;
}

function shapeContainsImportedMesh(shape: WorkplaneShape): boolean {
  return Boolean(shape.importedMesh) || Boolean(shape.groupedShapes?.some(shapeContainsImportedMesh));
}

function shapeIsImportedHole(shape: WorkplaneShape): boolean {
  return Boolean(shape.hole) && shapeContainsImportedMesh(shape);
}

function coplanarRescueCutterShape(shape: WorkplaneShape): WorkplaneShape {
  if (!shapeIsImportedHole(shape) || hasNonZeroRotation(shape)) {
    return shape;
  }
  return {
    ...shape,
    rotation: shape.rotation + COPLANAR_BOOLEAN_RESCUE_DEGREES,
    rotationZ: (shape.rotationZ ?? 0) + COPLANAR_BOOLEAN_RESCUE_DEGREES,
  };
}

function cloneAsGroupChild(shape: WorkplaneShape, centerX: number, centerZ: number, minY: number): WorkplaneShape {
  return {
    ...shape,
    id: createLocalId(`${shape.id}-group-child`),
    x: shape.x - centerX,
    z: shape.z - centerZ,
    elevation: (shape.elevation ?? 0) - minY,
  };
}

function mergedSolidMeshData(solids: WorkplaneShape[]) {
  const mergedSolidMesh: MeshData = { name: "ImportedBooleanSource", vertices: [], faces: [] };

  solids.forEach((solid) => {
    appendMeshData(mergedSolidMesh.vertices, mergedSolidMesh.faces, meshForShape(solid));
  });

  return mergedSolidMesh;
}

function meshDataToManifoldMesh(runtime: ManifoldToplevel, mesh: MeshData) {
  const vertProperties = new Float32Array(mesh.vertices.length * 3);
  mesh.vertices.forEach(([x, y, z], index) => {
    vertProperties[index * 3] = x;
    vertProperties[index * 3 + 1] = y;
    vertProperties[index * 3 + 2] = z;
  });

  const triVerts = new Uint32Array(mesh.faces.length * 3);
  mesh.faces.forEach(([a, b, c], index) => {
    triVerts[index * 3] = a;
    triVerts[index * 3 + 1] = b;
    triVerts[index * 3 + 2] = c;
  });

  const manifoldMesh = new runtime.Mesh({
    numProp: 3,
    vertProperties,
    triVerts,
    tolerance: 0.0001,
  });
  manifoldMesh.merge();
  return manifoldMesh;
}

function boxBoundsToManifold(runtime: ManifoldToplevel, bounds: Cuboid, created: ManifoldSolid[]) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const depth = bounds.maxZ - bounds.minZ;
  if (width <= 0.0001 || height <= 0.0001 || depth <= 0.0001) {
    return null;
  }

  const box = runtime.Manifold.cube([width, height, depth]);
  created.push(box);
  const moved = box.translate([bounds.minX, bounds.minY, bounds.minZ]);
  if (moved !== box && moved) {
    created.push(moved);
  }
  return moved;
}

function trackManifold<T extends ManifoldSolid | null>(created: ManifoldSolid[], value: T): T {
  if (value) {
    created.push(value);
  }
  return value;
}

function manifoldTransformFromMatrix(matrix: THREE.Matrix4) {
  return matrix.elements as unknown as Parameters<ManifoldSolid["transform"]>[0];
}

function shapeRotationQuaternion(shape: WorkplaneShape) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
}

function primitiveTransformMatrix(shape: WorkplaneShape, scale: THREE.Vector3, alignRotation?: THREE.Euler) {
  const center = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
  const matrix = new THREE.Matrix4().compose(center, shapeRotationQuaternion(shape), new THREE.Vector3(1, 1, 1));
  if (alignRotation) {
    matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(alignRotation));
  }
  matrix.multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
  return matrix;
}

function transformedPrimitiveManifold(runtime: ManifoldToplevel, primitive: ManifoldSolid, matrix: THREE.Matrix4, created: ManifoldSolid[]) {
  trackManifold(created, primitive);
  return trackManifold(created, primitive.transform(manifoldTransformFromMatrix(matrix)));
}

function primitiveManifoldForShape(runtime: ManifoldToplevel, shape: WorkplaneShape, created: ManifoldSolid[]) {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  if (width <= 0.0001 || depth <= 0.0001 || height <= 0.0001) {
    return null;
  }

  if (shape.kind === "box") {
    return transformedPrimitiveManifold(runtime, runtime.Manifold.cube(1, true), primitiveTransformMatrix(shape, new THREE.Vector3(width, height, depth)), created);
  }

  if (shape.kind === "sphere") {
    const { widthSegments } = sphereTessellation(shape.steps);
    return transformedPrimitiveManifold(
      runtime,
      runtime.Manifold.sphere(1, widthSegments),
      primitiveTransformMatrix(shape, new THREE.Vector3(width / 2, height / 2, depth / 2)),
      created,
    );
  }

  if (shape.kind === "cylinder" || shape.kind === "cone") {
    const sides = shape.sides ?? 96;
    const topRadiusScale =
      shape.kind === "cone"
        ? shape.baseRadius
          ? (shape.topRadius ?? 0) / shape.baseRadius
          : 0
        : 1;
    return transformedPrimitiveManifold(
      runtime,
      runtime.Manifold.cylinder(1, 1, topRadiusScale, sides, true),
      primitiveTransformMatrix(shape, new THREE.Vector3(width / 2, depth / 2, height), new THREE.Euler(-Math.PI / 2, 0, 0, "XYZ")),
      created,
    );
  }

  return null;
}

function shapeToManifoldSolid(runtime: ManifoldToplevel, shape: WorkplaneShape, created: ManifoldSolid[], useBoxPrimitive = false) {
  if (useBoxPrimitive && isAxisAlignedBoxCutter(shape)) {
    return primitiveManifoldForShape(runtime, shape, created) ?? boxBoundsToManifold(runtime, meshAabb(shape), created);
  }

  const primitive = primitiveManifoldForShape(runtime, shape, created);
  if (primitive) {
    return primitive;
  }

  const mesh = meshDataToManifoldMesh(runtime, meshForShape(shape));
  try {
    return runtime.Manifold.ofMesh(mesh);
  } finally {
    disposeManifold(mesh);
  }
}

function shapesToManifoldUnion(runtime: ManifoldToplevel, shapes: WorkplaneShape[], created: ManifoldSolid[], useBoxPrimitive = false) {
  const parts: ManifoldSolid[] = [];
  for (const shape of shapes) {
    const part = shapeToManifoldSolid(runtime, shape, created, useBoxPrimitive);
    if (!part || part.status() !== "NoError" || part.numTri() < 1) {
      disposeManifold(part);
      return null;
    }
    parts.push(part);
    created.push(part);
  }

  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const union = runtime.Manifold.union(parts);
  created.push(union);
  return union.status() === "NoError" && union.numTri() > 0 ? union : null;
}

function manifoldMeshToPositions(mesh: InstanceType<ManifoldToplevel["Mesh"]>) {
  const positions: number[] = [];
  const numProp = mesh.numProp;
  for (let i = 0; i < mesh.triVerts.length; i += 1) {
    const vertexIndex = mesh.triVerts[i];
    const offset = vertexIndex * numProp;
    positions.push(mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]);
  }
  return positions;
}

function positionsInteriorTriangleCount(positions: number[], cutters: WorkplaneShape[], strictInterior = false) {
  let count = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const centroid: Vec3 = [
      (positions[i] + positions[i + 3] + positions[i + 6]) / 3,
      (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3,
      (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3,
    ];
    if (cutters.some((cutter) => pointInsideHoleShape(centroid, cutter, strictInterior))) {
      count += 1;
    }
  }
  return count;
}

function meshPositionsToGroupShape(selection: WorkplaneShape[], solids: WorkplaneShape[], positions: number[], idPrefix: string): WorkplaneShape | null {
  if (positions.length < 9) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return null;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const normalizedPositions: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    normalizedPositions.push(positions[i] - centerX, positions[i + 1] - minY, positions[i + 2] - centerZ);
  }

  const firstSolid = solids[0];
  return {
    id: createLocalId(idPrefix),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions: normalizedPositions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(normalizedPositions.length / 9),
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function disposeManifold(value: unknown) {
  (value as { delete?: () => void } | null)?.delete?.();
}

async function manifoldBooleanMeshShape(selection: WorkplaneShape[], options: { requireImported?: boolean; idPrefix?: string } = {}): Promise<WorkplaneShape | null> {
  // GROUPING SAFETY NOTE FOR FUTURE AGENTS:
  // Imported STL + hole grouping stays on exact boolean first. Rotated cutters
  // are validated against their real oriented volume, not their broad AABB.
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole);
  if (solids.length === 0 || holes.length === 0 || (options.requireImported !== false && !selection.some((shape) => Boolean(shape.importedMesh)))) {
    return null;
  }

  const sourceMesh = mergedSolidMeshData(solids);
  const cutterTriangleCount = holes.reduce((total, hole) => total + meshForShape(hole).faces.length, 0);
  if (sourceMesh.faces.length + cutterTriangleCount > IMPORTED_EXACT_BOOLEAN_TRIANGLE_LIMIT) {
    return null;
  }
  const cutterShapes = holes.map(paddedCutterShape);
  const residualValidationShapes = holes;
  const sourceInteriorTriangles = cutterInteriorTriangleCount(sourceMesh, cutterShapes);
  const sourceTouchedTriangles = cutterTouchedTriangleCount(sourceMesh, cutterShapes);
  const sourceCutTriangles = Math.max(sourceInteriorTriangles, sourceTouchedTriangles);

  const created: ManifoldSolid[] = [];
  let result: ManifoldSolid | null = null;

  try {
    const runtime = await getManifoldRuntime();
    const solid = shapesToManifoldUnion(runtime, solids, created, true);
    const cutterSolid = shapesToManifoldUnion(runtime, holes.map(paddedCutterShape), created, true);
    if (!solid || !cutterSolid) {
      return null;
    }

    result = solid.subtract(cutterSolid);
    created.push(result);
    if (result.status() !== "NoError" || result.numTri() < 1) {
      return null;
    }

    const outputMesh = result.getMesh();
    const positions = manifoldMeshToPositions(outputMesh);
    const resultChanged = positionsDifferFromMeshData(positions, sourceMesh);
    if (!resultChanged) {
      return null;
    }
    const hasImportedOperand = selection.some((shape) => Boolean(shape.importedMesh));
    const canUseResidualInteriorValidation =
      !hasImportedOperand && holes.every((hole) => hole.kind === "box" && !hole.importedMesh && !hole.groupedShapes?.length);
    if (canUseResidualInteriorValidation) {
      const remainingInteriorTriangles = positionsInteriorTriangleCount(positions, residualValidationShapes, true);
      if (sourceCutTriangles > 0 && remainingInteriorTriangles > Math.max(12, Math.floor(sourceCutTriangles * 0.35))) {
        return null;
      }
    }

    const group = meshPositionsToGroupShape(selection, solids, positions, options.idPrefix ?? "grouped-manifold-cut");
    const usable = isUsableBooleanGroup(group, sourceMesh.faces.length);
    const changedEnough = sourceCutTriangles > 0 || !looksLikeUnchangedBooleanResult(group, sourceMesh.faces.length, true);
    if (!usable || !changedEnough) {
      return null;
    }
    return group;
  } catch {
    return null;
  } finally {
    Array.from(new Set(created)).forEach(disposeManifold);
  }
}

async function manifoldUnionMeshShape(selection: WorkplaneShape[]): Promise<WorkplaneShape | null> {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  if (solids.length < 2 || !selection.some((shape) => Boolean(shape.importedMesh))) {
    return null;
  }

  const mergedSourceMesh = mergedSolidMeshData(solids);
  if (mergedSourceMesh.faces.length > IMPORTED_EXACT_BOOLEAN_TRIANGLE_LIMIT) {
    return null;
  }

  const created: ManifoldSolid[] = [];
  let result: ManifoldSolid | null = null;
  try {
    const runtime = await getManifoldRuntime();
    result = shapesToManifoldUnion(runtime, solids, created, true);
    if (!result) {
      return null;
    }
    if (result.status() !== "NoError" || result.numTri() < 1) {
      return null;
    }

    const outputMesh = result.getMesh();
    const positions = manifoldMeshToPositions(outputMesh);
    const group = meshPositionsToGroupShape(selection, solids, positions, "grouped-manifold-union");
    return isUsableBooleanGroup(group, mergedSourceMesh.faces.length, false) ? group : null;
  } catch {
    return null;
  } finally {
    Array.from(new Set(created)).forEach(disposeManifold);
  }
}

function asIntersectionGroup(group: WorkplaneShape): WorkplaneShape {
  return {
    ...group,
    name: "Intersection",
    hole: false,
  };
}

async function manifoldIntersectionMeshShape(selection: WorkplaneShape[]): Promise<IntersectionAttempt> {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole && !shape.locked);
  if (solids.length === 0 || holes.length === 0) {
    return { status: "unsupported" };
  }

  const sourceTriangleCount = selection.reduce((total, shape) => total + meshForShape(shape).faces.length, 0);
  if (sourceTriangleCount > IMPORTED_EXACT_BOOLEAN_TRIANGLE_LIMIT) {
    return { status: "unsupported" };
  }

  const created: ManifoldSolid[] = [];
  try {
    const runtime = await getManifoldRuntime();
    const solid = shapesToManifoldUnion(runtime, solids, created, true);
    const hole = shapesToManifoldUnion(runtime, holes, created, true);
    if (!solid || !hole) {
      return { status: "unsupported" };
    }

    const result = solid.intersect(hole);
    created.push(result);
    if (result.status() !== "NoError") {
      return { status: "unsupported" };
    }
    if (result.numTri() < 1) {
      return { status: "empty" };
    }

    const outputMesh = result.getMesh();
    const positions = manifoldMeshToPositions(outputMesh);
    const group = meshPositionsToGroupShape(selection, solids, positions, "grouped-manifold-intersection");
    return group && isUsableBooleanGroup(group, sourceTriangleCount, false)
      ? { status: "success", group: asIntersectionGroup(group) }
      : { status: "unsupported" };
  } catch {
    return { status: "unsupported" };
  } finally {
    Array.from(new Set(created)).forEach(disposeManifold);
  }
}

function bvhIntersectionMeshShape(selection: WorkplaneShape[], operation: CSGOperation, idPrefix: string): IntersectionAttempt {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole && !shape.locked);
  if (solids.length === 0 || holes.length === 0) {
    return { status: "unsupported" };
  }

  try {
    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ["position", "normal"];
    (evaluator as Evaluator & { useCDTClipping: boolean }).useCDTClipping = true;

    let solidResult = brushFromShape(solids[0]);
    solids.slice(1).forEach((solid) => {
      solidResult = evaluator.evaluate(solidResult, brushFromShape(solid), ADDITION);
      solidResult.updateMatrixWorld(true);
    });

    let holeResult = brushFromShape(holes[0]);
    holes.slice(1).forEach((hole) => {
      holeResult = evaluator.evaluate(holeResult, brushFromShape(hole), ADDITION);
      holeResult.updateMatrixWorld(true);
    });

    const result = evaluator.evaluate(solidResult, holeResult, operation);
    result.updateMatrixWorld(true);
    if (positionsFromGeometryDrawRange(result.geometry).length < 9) {
      return { status: "empty" };
    }

    const sourceTriangleCount = solids.reduce((total, solid) => total + meshForShape(solid).faces.length, 0);
    const group = resultGeometryToMeshShape(selection, solids, result.geometry, idPrefix);
    return group && isUsableBooleanGroup(group, sourceTriangleCount, false)
      ? { status: "success", group: asIntersectionGroup(group) }
      : { status: "unsupported" };
  } catch {
    return { status: "unsupported" };
  }
}

async function buildIntersectionShapeFromSelection(groupable: WorkplaneShape[]): Promise<IntersectionBuildResult> {
  const booleanSelection = expandGroupsForBoolean(groupable);
  const solids = booleanSelection.filter((shape) => !shape.hole && !shape.locked);
  const holes = booleanSelection.filter((shape) => shape.hole && !shape.locked);
  if (solids.length === 0 || holes.length === 0) {
    return {
      group: null,
      empty: false,
      failureNotice: "Select at least one solid and one hole for Intersection",
    };
  }

  if (!hasSolidHoleOverlap(solids, holes)) {
    return { group: null, empty: true, failureNotice: "" };
  }

  const manifoldAttempt = await manifoldIntersectionMeshShape(booleanSelection);
  if (manifoldAttempt.status === "success") {
    return { group: manifoldAttempt.group, empty: false, failureNotice: "" };
  }
  if (manifoldAttempt.status === "empty") {
    return { group: null, empty: true, failureNotice: "" };
  }

  const exactAttempt = bvhIntersectionMeshShape(booleanSelection, INTERSECTION, "grouped-intersection");
  if (exactAttempt.status === "success") {
    return { group: exactAttempt.group, empty: false, failureNotice: "" };
  }
  const hasImportedMesh = booleanSelection.some((shape) => Boolean(shape.importedMesh));
  if (exactAttempt.status === "empty" && !hasImportedMesh) {
    return { group: null, empty: true, failureNotice: "" };
  }

  const hollowAttempt = bvhIntersectionMeshShape(booleanSelection, HOLLOW_INTERSECTION, "grouped-hollow-intersection");
  if (hollowAttempt.status === "success") {
    return { group: hollowAttempt.group, empty: false, failureNotice: "" };
  }
  if (hollowAttempt.status === "empty" || exactAttempt.status === "empty") {
    return { group: null, empty: true, failureNotice: "" };
  }

  return {
    group: null,
    empty: false,
    failureNotice: "Could not calculate this Intersection cleanly",
  };
}

function cutterInteriorTriangleCount(mesh: MeshData, cutters: WorkplaneShape[]) {
  return mesh.faces.reduce((total, [ai, bi, ci]) => {
    const centroid = triangleCentroid([mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]]);
    return total + (cutters.some((cutter) => pointInsideHoleShape(centroid, cutter)) ? 1 : 0);
  }, 0);
}

function geometryInteriorTriangleCount(geometry: THREE.BufferGeometry, cutters: WorkplaneShape[], strictInterior = false) {
  const positions = positionsFromGeometryDrawRange(geometry);
  let count = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const centroid: Vec3 = [
      (positions[i] + positions[i + 3] + positions[i + 6]) / 3,
      (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3,
      (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3,
    ];
    if (cutters.some((cutter) => pointInsideHoleShape(centroid, cutter, strictInterior))) {
      count += 1;
    }
  }
  return count;
}

function clearsImportedCutVolume(geometry: THREE.BufferGeometry, sourceInteriorTriangles: number, cutters: WorkplaneShape[]) {
  if (sourceInteriorTriangles <= 0 || cutters.length === 0) {
    return true;
  }

  const remainingInteriorTriangles = geometryInteriorTriangleCount(geometry, cutters, true);
  return remainingInteriorTriangles <= Math.max(4, Math.floor(sourceInteriorTriangles * 0.05));
}

function importedBooleanMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole);
  if (solids.length === 0 || holes.length === 0 || !selection.some((shape) => Boolean(shape.importedMesh))) {
    return null;
  }

  const mergedSolidMesh = mergedSolidMeshData(solids);
  const sourceTriangleCount = mergedSolidMesh.faces.length;
  const cutterTriangleCount = holes.reduce((total, hole) => total + meshForShape(hole).faces.length, 0);
  if (sourceTriangleCount + cutterTriangleCount > IMPORTED_EXACT_BOOLEAN_TRIANGLE_LIMIT) {
    return null;
  }

  const cutterShapes = holes.map(paddedCutterShape);
  const hasImportedHole = holes.some(shapeIsImportedHole);
  const hasStraightImportedHole = holes.some((hole) => shapeIsImportedHole(hole) && !hasNonZeroRotation(hole));
  const sourceInteriorTriangles = cutterInteriorTriangleCount(mergedSolidMesh, cutterShapes);
  const sourceTouchedTriangles = cutterTouchedTriangleCount(mergedSolidMesh, cutterShapes);
  const sourceCutTriangles = Math.max(sourceInteriorTriangles, sourceTouchedTriangles);
  const baseAttempts: Array<{ operation: CSGOperation; idPrefix: string; rescueCoplanar?: boolean }> = [
    // Imported STLs are often not watertight. Hollow subtraction still lets the hole bite into triangle meshes.
    { operation: HOLLOW_SUBTRACTION, idPrefix: "grouped-import-hollow-cut" },
    { operation: SUBTRACTION, idPrefix: "grouped-import-cut" },
  ];
  const attempts = hasStraightImportedHole
    ? [
        ...baseAttempts,
        { operation: HOLLOW_SUBTRACTION, idPrefix: "grouped-import-rescue-hollow-cut", rescueCoplanar: true },
        { operation: SUBTRACTION, idPrefix: "grouped-import-rescue-cut", rescueCoplanar: true },
      ]
    : baseAttempts;

  for (const attempt of attempts) {
    try {
      const evaluator = new Evaluator();
      evaluator.useGroups = false;
      evaluator.attributes = ["position", "normal"];
      (evaluator as Evaluator & { useCDTClipping: boolean }).useCDTClipping = true;
      let result = new Brush(geometryFromMeshData(mergedSolidMesh));
      result.updateMatrixWorld(true);

      const operationHoles = attempt.rescueCoplanar ? holes.map(coplanarRescueCutterShape) : holes;
      operationHoles.forEach((hole) => {
        result = evaluator.evaluate(result, brushFromShape(hole, true), attempt.operation);
        result.updateMatrixWorld(true);
      });

      const group = resultGeometryToMeshShape(selection, solids, result.geometry, attempt.idPrefix);
      const resultPositions = positionsFromGeometryDrawRange(result.geometry);
      const resultChanged = geometryDiffersFromMeshData(result.geometry, mergedSolidMesh);
      const hasOpenCutBoundary = hasImportedHole && introducesOpenCutBoundary(resultPositions, mergedSolidMesh, operationHoles.map(paddedCutterShape));
      if (
        isUsableBooleanGroup(group, sourceTriangleCount) &&
        (sourceCutTriangles > 0 ? resultChanged : !looksLikeUnchangedBooleanResult(group, sourceTriangleCount, true)) &&
        !hasOpenCutBoundary &&
        clearsImportedCutVolume(result.geometry, sourceCutTriangles, operationHoles)
      ) {
        return group;
      }
    } catch {
      // Try the next boolean operation before giving up.
    }
  }

  return null;
}

function boxedBooleanMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const solids = selection.filter((shape) => !shape.hole && shape.kind === "box" && !shape.locked);
  const holes = selection.filter((shape) => shape.hole && shape.kind === "box");
  if (solids.length === 0 || holes.length === 0) {
    return null;
  }

  const cutters = holes.map((hole) => shapeAabb(paddedCutterShape(hole)));
  const cuboids = solids.flatMap((solid) => cutters.reduce<Cuboid[]>((parts, cutter) => parts.flatMap((part) => subtractCuboid(part, cutter)), [shapeAabb(solid)]));
  if (cuboids.length === 0) {
    return null;
  }

  const groupBounds = boundsForCuboids(cuboids);
  const centerX = (groupBounds.minX + groupBounds.maxX) / 2;
  const centerZ = (groupBounds.minZ + groupBounds.maxZ) / 2;
  const width = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxX - groupBounds.minX);
  const minY = groupBounds.minY;
  const height = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxY - groupBounds.minY);
  const depth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxZ - groupBounds.minZ);
  const mesh = cuboidsToMesh("Group", cuboids, centerX, centerZ, minY);
  const positions = mesh.faces.flatMap(([ai, bi, ci]) => [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]]).flat();
  const firstSolid = solids[0];

  return {
    id: createLocalId("grouped-boolean"),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function aabbBooleanMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole);
  if (solids.length === 0 || holes.length === 0) {
    return null;
  }

  const solidBounds = solids.map(meshAabb);
  const cutterBounds = holes.map((hole) => meshAabb(paddedCutterShape(hole)));
  const cuboids = solidBounds.flatMap((solid) => cutterBounds.reduce<Cuboid[]>((parts, cutter) => parts.flatMap((part) => subtractCuboid(part, cutter)), [solid]));
  if (cuboids.length === 0) {
    return null;
  }

  const groupBounds = boundsForCuboids(cuboids);
  const centerX = (groupBounds.minX + groupBounds.maxX) / 2;
  const centerZ = (groupBounds.minZ + groupBounds.maxZ) / 2;
  const width = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxX - groupBounds.minX);
  const minY = groupBounds.minY;
  const height = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxY - groupBounds.minY);
  const depth = Math.max(MIN_SHAPE_DIMENSION, groupBounds.maxZ - groupBounds.minZ);
  const mesh = cuboidsToMesh("Group", cuboids, centerX, centerZ, minY);
  const positions = mesh.faces.flatMap(([ai, bi, ci]) => [mesh.vertices[ai], mesh.vertices[bi], mesh.vertices[ci]]).flat();
  const firstSolid = solids[0];

  return {
    id: createLocalId("grouped-boolean"),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function hollowClipMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection
    .filter((shape) => shape.hole)
    .map(paddedCutterShape)
    .map((shape) => ({ shape, bounds: meshAabb(shape) }));
  if (solids.length === 0 || holes.length === 0) {
    return null;
  }

  const sourceMesh = mergedSolidMeshData(solids);
  const sourceBounds = boundsForCuboids(solids.map(meshAabb));
  const canPlaneClip = holes.every((hole) => isAxisAlignedBoxCutter(hole.shape));
  const positions: number[] = [];
  let removedTriangles = 0;

  if (canPlaneClip) {
    sourceMesh.faces.forEach(([ai, bi, ci]) => {
      let fragments: Vec3[][] = [[sourceMesh.vertices[ai], sourceMesh.vertices[bi], sourceMesh.vertices[ci]]];
      holes.forEach((hole) => {
        const nextFragments: Vec3[][] = [];
        fragments.forEach((fragment) => {
          if (!cuboidsTouch(polygonAabb(fragment), hole.bounds)) {
            nextFragments.push(fragment);
            return;
          }

          const clipped = subtractCuboidFromPolygon(fragment, hole.bounds);
          if (
            clipped.length !== 1 ||
            clipped[0].length !== fragment.length ||
            clipped[0].some((point, index) => point.some((value, axis) => Math.abs(value - fragment[index][axis]) > 0.0001))
          ) {
            removedTriangles += 1;
          }
          clipped.forEach((piece) => nextFragments.push(piece));
        });
        fragments = nextFragments;
      });

      fragments.forEach((fragment) => triangulatePolygonToPositions(fragment, positions));
    });

    holes.forEach((hole) => addBoxHoleInteriorFaces(positions, hole.bounds, sourceMesh, sourceBounds));
  } else {
    sourceMesh.faces.forEach(([ai, bi, ci]) => {
      const triangle = [sourceMesh.vertices[ai], sourceMesh.vertices[bi], sourceMesh.vertices[ci]];

      if (holes.some((hole) => triangleTouchesHoleShape(triangle, hole.shape, hole.bounds))) {
        removedTriangles += 1;
        return;
      }

      triangle.forEach(([x, y, z]) => {
        positions.push(x, y, z);
      });
    });
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  if (removedTriangles === 0 || positions.length < 9 || ![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return null;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const normalizedPositions: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    normalizedPositions.push(positions[i] - centerX, positions[i + 1] - minY, positions[i + 2] - centerZ);
  }

  const firstSolid = solids[0];
  return {
    id: createLocalId("grouped-import-clip"),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions: normalizedPositions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(normalizedPositions.length / 9),
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: selection.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function cutFullyConsumesSolids(selection: WorkplaneShape[]) {
  const solids = selection.filter((shape) => !shape.hole && !shape.locked);
  const holes = selection.filter((shape) => shape.hole).map(paddedCutterShape);
  if (solids.length === 0 || holes.length === 0) {
    return false;
  }

  const sourceMesh = mergedSolidMeshData(solids);
  if (sourceMesh.faces.length === 0 || !hasSolidHoleOverlap(solids, holes)) {
    return false;
  }

  return sourceMesh.faces.every(([ai, bi, ci]) => {
    const triangle = [sourceMesh.vertices[ai], sourceMesh.vertices[bi], sourceMesh.vertices[ci]];
    const centroid: Vec3 = [
      (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3,
      (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3,
      (triangle[0][2] + triangle[1][2] + triangle[2][2]) / 3,
    ];
    return holes.some((hole) => pointInsideHoleShape(centroid, hole));
  });
}

function mergedMeshShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const groupable = selection.filter((shape) => !shape.locked);
  if (groupable.length < 2) {
    return null;
  }

  // Keep imported STL/SVG groups as a baked mesh. The viewport child-group path rescales children to a wrapper box.
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  groupable.map(meshForShape).forEach((mesh) => {
    appendMeshData(vertices, faces, mesh);
  });

  if (vertices.length < 3 || faces.length < 1) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  vertices.forEach(([x, y, z]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  });

  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    return null;
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const width = cleanModelDimension(rawWidth);
  const height = cleanModelDimension(rawHeight);
  const depth = cleanModelDimension(rawDepth);
  const positions: number[] = [];

  faces.forEach(([ai, bi, ci]) => {
    [vertices[ai], vertices[bi], vertices[ci]].forEach(([x, y, z]) => {
      positions.push(x - centerX, y - minY, z - centerZ);
    });
  });

  const firstSolid = groupable.find((shape) => !shape.hole) ?? groupable[0];
  const holeOnly = groupable.every((shape) => shape.hole);

  return {
    id: createLocalId("grouped-mesh"),
    name: "Group",
    kind: "mesh",
    color: holeOnly ? "#b8c2cc" : firstSolid.color,
    hole: holeOnly,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    importedMesh: {
      positions,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: faces.length,
      sourceFormat: "json",
    },
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: groupable.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function groupedShape(selection: WorkplaneShape[]): WorkplaneShape | null {
  const groupable = selection.filter((shape) => !shape.locked);
  if (groupable.length < 2) {
    return null;
  }

  const groupBounds = boundsForShapes(groupable);
  const minX = groupBounds.minX;
  const maxX = groupBounds.maxX;
  const minY = groupBounds.minY;
  const maxY = groupBounds.maxY;
  const minZ = groupBounds.minZ;
  const maxZ = groupBounds.maxZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = cleanModelDimension(Math.max(MIN_SHAPE_DIMENSION, maxX - minX));
  const depth = cleanModelDimension(Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ));
  const height = cleanModelDimension(Math.max(MIN_SHAPE_DIMENSION, maxY - minY));
  const firstSolid = groupable.find((shape) => !shape.hole) ?? groupable[0];
  const holeOnly = groupable.every((shape) => shape.hole);

  return {
    id: createLocalId("group"),
    name: "Group",
    kind: "mesh",
    color: firstSolid.color,
    hole: holeOnly,
    x: centerX,
    z: centerZ,
    elevation: minY,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    groupedBaseWidth: width,
    groupedBaseDepth: depth,
    groupedBaseHeight: height,
    groupedShapes: groupable.map((shape) => cloneAsGroupChild(shape, centerX, centerZ, minY)),
    locked: false,
    hidden: false,
  };
}

function localGroupBounds(children: WorkplaneShape[]): Cuboid {
  return boundsForShapes(children);
}

function quaternionForShape(shape: WorkplaneShape) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(shape.rotation),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
}

function rotationFromQuaternion(quaternion: THREE.Quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    rotationX: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.x)),
    rotation: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.y)),
    rotationZ: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.z)),
  };
}

function cleanShapePatch(patch: ShapeUpdatePatch): Partial<WorkplaneShape> {
  const { bakeTransform: _bakeTransform, ...rest } = patch;
  const next = { ...rest };
  if (typeof next.rotation === "number") {
    next.rotation = cleanRotationDegrees(next.rotation, 1);
  }
  if (typeof next.rotationX === "number") {
    next.rotationX = cleanRotationDegrees(next.rotationX, 1);
  }
  if (typeof next.rotationZ === "number") {
    next.rotationZ = cleanRotationDegrees(next.rotationZ, 1);
  }
  return next;
}

function restoreGroupedChildren(group: WorkplaneShape): WorkplaneShape[] {
  const children = group.groupedShapes ?? [];
  if (children.length === 0) {
    return [];
  }

  const bounds = localGroupBounds(children);
  const baseWidth = group.groupedBaseWidth ?? Math.max(0.001, bounds.maxX - bounds.minX);
  const baseHeight = group.groupedBaseHeight ?? Math.max(0.001, bounds.maxY - bounds.minY);
  const baseDepth = group.groupedBaseDepth ?? Math.max(0.001, bounds.maxZ - bounds.minZ);
  const sx = shapeWidth(group) / Math.max(0.001, baseWidth);
  const sy = group.height / Math.max(0.001, baseHeight);
  const sz = shapeDepth(group) / Math.max(0.001, baseDepth);
  const groupQuaternion = quaternionForShape(group);
  const groupReflection = new THREE.Matrix4().makeScale(mirrorSign(group.mirrorX), mirrorSign(group.mirrorY), mirrorSign(group.mirrorZ));
  const groupCenter = new THREE.Vector3(group.x, (group.elevation ?? 0) + group.height / 2, group.z);

  return children.map((child) => {
    const width = shapeWidth(child) * sx;
    const depth = shapeDepth(child) * sz;
    const height = child.height * sy;
    const localCenter = new THREE.Vector3(
      child.x * sx * mirrorSign(group.mirrorX),
      (((child.elevation ?? 0) + child.height / 2) * sy - group.height / 2) * mirrorSign(group.mirrorY),
      child.z * sz * mirrorSign(group.mirrorZ),
    ).applyQuaternion(groupQuaternion);
    const worldCenter = groupCenter.clone().add(localCenter);
    const childRotationMatrix = new THREE.Matrix4()
      .makeRotationFromQuaternion(groupQuaternion)
      .multiply(groupReflection)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(quaternionForShape(child)))
      .multiply(groupReflection);
    const childRotation = rotationFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(childRotationMatrix));
    const restored: WorkplaneShape = {
      ...child,
      id: createLocalId(`${child.id}-ungroup`),
      x: worldCenter.x,
      z: worldCenter.z,
      elevation: worldCenter.y - height / 2,
      width,
      depth,
      height,
      size: (width + depth) / 2,
      rotation: childRotation.rotation,
      rotationX: childRotation.rotationX,
      rotationZ: childRotation.rotationZ,
      mirrorX: Boolean(child.mirrorX) !== Boolean(group.mirrorX) || undefined,
      mirrorY: Boolean(child.mirrorY) !== Boolean(group.mirrorY) || undefined,
      mirrorZ: Boolean(child.mirrorZ) !== Boolean(group.mirrorZ) || undefined,
      hidden: group.hidden ? true : child.hidden,
    };
    return canonicalizeShape(group.hole ? withHoleMode(restored, true) : restored);
  });
}

function expandGroupsForBoolean(selection: WorkplaneShape[]): WorkplaneShape[] {
  return selection.flatMap((shape) => {
    if (shape.importedMesh) {
      return [shape];
    }
    return shape.groupedShapes?.length ? restoreGroupedChildren(shape) : [shape];
  });
}

function expandGroupsForBoxBoolean(selection: WorkplaneShape[]): WorkplaneShape[] {
  return selection.flatMap((shape) => (shape.groupedShapes?.length ? restoreGroupedChildren(shape) : [shape]));
}

function canUseBoxBoolean(selection: WorkplaneShape[]) {
  return selection.every(isAxisAlignedBoxCutter);
}

function hasNonZeroRotation(shape: WorkplaneShape) {
  const rotation = Math.abs(normalizeDegrees(shape.rotation));
  const rotationX = Math.abs(normalizeDegrees(shape.rotationX ?? 0));
  const rotationZ = Math.abs(normalizeDegrees(shape.rotationZ ?? 0));
  return [rotation, rotationX, rotationZ].some((value) => value > 0.001 && Math.abs(value - 360) > 0.001);
}

async function buildGroupedShapeFromSelection(groupable: WorkplaneShape[]): Promise<GroupBuildResult> {
  const booleanSelection = expandGroupsForBoolean(groupable);
  const hasSolid = booleanSelection.some((shape) => !shape.hole);
  const hasHole = booleanSelection.some((shape) => shape.hole);
  const hasImportedMesh = booleanSelection.some((shape) => Boolean(shape.importedMesh));
  const boxBooleanSelection = hasSolid && hasHole ? expandGroupsForBoxBoolean(groupable) : [];
  const cleanBoxGroup = canUseBoxBoolean(boxBooleanSelection) ? boxedBooleanMeshShape(boxBooleanSelection) : null;
  const manifoldCutGroup = hasSolid && hasHole ? await manifoldBooleanMeshShape(booleanSelection, { requireImported: false }) : null;
  const manifoldImportedMerge = hasImportedMesh && hasSolid && !hasHole ? await manifoldUnionMeshShape(booleanSelection) : null;
  const exactImportedGroup = hasImportedMesh && hasSolid && hasHole ? manifoldCutGroup ?? importedBooleanMeshShape(booleanSelection) : null;
  const bakedImportedMerge = hasImportedMesh && !(hasSolid && hasHole) ? manifoldImportedMerge ?? mergedMeshShape(booleanSelection) : null;
  const group = hasSolid && hasHole
    ? cleanBoxGroup ??
      exactImportedGroup ??
      (hasImportedMesh
        ? null
        : manifoldCutGroup ?? booleanMeshShape(booleanSelection))
    : hasImportedMesh
      ? bakedImportedMerge ?? groupedShape(groupable)
      : groupedShape(groupable);
  const consumed = !group && hasSolid && hasHole && cutFullyConsumesSolids(booleanSelection);
  return {
    group,
    booleanSelection,
    hasSolid,
    hasHole,
    hasImportedMesh,
    consumed,
    failureNotice: hasImportedMesh && hasSolid && hasHole ? "Could not cut this imported mesh cleanly" : hasSolid && hasHole ? "Could not cut this selection" : "Could not group this selection",
  };
}

function debugShapeSummary(shape: WorkplaneShape): Record<string, unknown> {
  return {
    id: shape.id,
    name: shape.name,
    kind: shape.kind,
    hole: Boolean(shape.hole),
    x: Number(shape.x.toFixed(3)),
    z: Number(shape.z.toFixed(3)),
    elevation: Number((shape.elevation ?? 0).toFixed(3)),
    width: Number(shapeWidth(shape).toFixed(3)),
    depth: Number(shapeDepth(shape).toFixed(3)),
    height: Number(shape.height.toFixed(3)),
    rotation: Number(shape.rotation.toFixed(3)),
    rotationX: Number((shape.rotationX ?? 0).toFixed(3)),
    rotationZ: Number((shape.rotationZ ?? 0).toFixed(3)),
    mirrorX: Boolean(shape.mirrorX),
    mirrorY: Boolean(shape.mirrorY),
    mirrorZ: Boolean(shape.mirrorZ),
    importedTriangles: shape.importedMesh?.triangleCount ?? 0,
    imagePlate: shape.imagePlate ? `${shape.imagePlate.pixelWidth}x${shape.imagePlate.pixelHeight}` : null,
    edgeTreatments: shape.edgeTreatments ?? [],
    cadDisplayEdgeCount: shape.cadDisplayEdges?.length ?? null,
    cadDisplayEdgesVersion: shape.cadDisplayEdgesVersion ?? null,
    edgeResizeMode: shape.edgeResizeMode ?? "scale",
    cadBrepLength: shape.cadBrep?.length ?? 0,
    cadPrimitiveKind: shape.cadPrimitiveFrame?.kind ?? null,
    groupedCount: shape.groupedShapes?.length ?? 0,
    children: shape.groupedShapes?.map(debugShapeSummary) ?? [],
  };
}

function compactShapeSummary(shape: WorkplaneShape, index: number) {
  const childSummary = shape.groupedShapes
    ?.map((child) => `${child.kind}${child.hole ? "H" : "S"}${child.importedMesh ? "I" : ""}`)
    .join("+");
  return [
    `${index}:${shape.kind}${shape.hole ? "H" : "S"}${shape.importedMesh ? "I" : ""}${shape.imagePlate ? "P" : ""}`,
    `g${shape.groupedShapes?.length ?? 0}`,
    `tri${shape.importedMesh?.triangleCount ?? 0}`,
    `edge${shape.edgeTreatments?.map((feature) => `${feature.kind}:${feature.amount}:${feature.edgeCount}:${feature.chamferAngle ?? ""}`).join("|") ?? ""}`,
    `viewEdges${shape.cadDisplayEdges?.length ?? "auto"}v${shape.cadDisplayEdgesVersion ?? 0}`,
    `edgeResize${shape.edgeResizeMode ?? "scale"}`,
    `brep${shape.cadBrep?.length ?? 0}`,
    `prim${shape.cadPrimitiveFrame ? `${shape.cadPrimitiveFrame.kind}:${shape.cadPrimitiveFrame.width}:${shape.cadPrimitiveFrame.depth}:${shape.cadPrimitiveFrame.height}` : ""}`,
    `p${Number(shape.x.toFixed(2))},${Number(shape.z.toFixed(2))},${Number((shape.elevation ?? 0).toFixed(2))}`,
    `d${Number(shapeWidth(shape).toFixed(2))}x${Number(shapeDepth(shape).toFixed(2))}x${Number(shape.height.toFixed(2))}`,
    `r${Number((shape.rotationX ?? 0).toFixed(1))},${Number(shape.rotation.toFixed(1))},${Number((shape.rotationZ ?? 0).toFixed(1))}`,
    `m${shape.mirrorX ? "x" : ""}${shape.mirrorY ? "y" : ""}${shape.mirrorZ ? "z" : ""}`,
    childSummary ? `c[${childSummary}]` : "c[]",
  ].join(",");
}

function mcpShapeSummary(shape: WorkplaneShape): SketchForgeMcpShapeSummary {
  return {
    id: shape.id,
    name: shape.name,
    kind: shape.kind,
    color: shape.color,
    hole: Boolean(shape.hole),
    locked: Boolean(shape.locked),
    hidden: Boolean(shape.hidden),
    position: {
      x: shape.x,
      z: shape.z,
      elevation: shape.elevation ?? 0,
    },
    dimensions: {
      width: shapeWidth(shape),
      depth: shapeDepth(shape),
      height: shape.height,
      size: shape.size,
    },
    rotation: {
      x: shape.rotationX ?? 0,
      y: shape.rotation,
      z: shape.rotationZ ?? 0,
    },
    mirror: {
      x: Boolean(shape.mirrorX),
      y: Boolean(shape.mirrorY),
      z: Boolean(shape.mirrorZ),
    },
    edgeTreatments: shape.edgeTreatments ?? [],
    groupedCount: shape.groupedShapes?.length ?? 0,
    importedTriangles: shape.importedMesh?.triangleCount ?? 0,
    cadDisplayEdgeCount: shape.cadDisplayEdges?.length ?? null,
    sketchPointCount: shape.sketchProfile?.points.length ?? 0,
    sketchSegmentCount: shape.sketchProfile?.segments.length ?? 0,
    children: shape.groupedShapes?.map(mcpShapeSummary),
  };
}

function defaultMcpSketchProfile(width: number, depth: number): SketchProfile {
  const halfWidth = Math.max(0.01, width) / 2;
  const halfDepth = Math.max(0.01, depth) / 2;
  const pointIds = ["mcp-sketch-a", "mcp-sketch-b", "mcp-sketch-c", "mcp-sketch-d"].map((prefix) => createLocalId(prefix));
  return {
    points: [
      { id: pointIds[0], x: -halfWidth, z: -halfDepth, mode: "corner" },
      { id: pointIds[1], x: halfWidth, z: -halfDepth, mode: "corner" },
      { id: pointIds[2], x: halfWidth, z: halfDepth, mode: "corner" },
      { id: pointIds[3], x: -halfWidth, z: halfDepth, mode: "corner" },
    ],
    segments: [
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[0], endId: pointIds[1], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[1], endId: pointIds[2], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[2], endId: pointIds[3], kind: "line" },
      { id: createLocalId("mcp-sketch-segment"), startId: pointIds[3], endId: pointIds[0], kind: "line" },
    ],
    images: [],
  };
}

function mcpNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mcpString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function mcpStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function mcpNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry)) : [];
}

function mcpFiniteNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function readMcpEditorIdentity() {
  const storageKey = "sketchforge.mcp.editorIdentity";
  try {
    const existing = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as { editorId?: unknown; editorNumber?: unknown } | null;
    if (typeof existing?.editorId === "string" && typeof existing.editorNumber === "number") {
      return { editorId: existing.editorId, editorNumber: existing.editorNumber };
    }
  } catch {
    // Session identity is best-effort; fall through and create a new one.
  }

  const randomValues = new Uint32Array(1);
  window.crypto?.getRandomValues?.(randomValues);
  const editorNumber = 10000 + ((randomValues[0] || Math.floor(Math.random() * 90000)) % 90000);
  const editorId = window.crypto?.randomUUID?.() ?? `sketchforge-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const identity = { editorId, editorNumber };
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(identity));
  } catch {
    // Private browsing can block sessionStorage; the in-memory identity is enough for this tab.
  }
  return identity;
}

export function SketchForgeEditor({
  initialAssets = [],
  initialShapes = [],
  initialHistory,
  initialHistoryIndex,
  initialSnap,
  initialWorkspace,
  initialPlacementElevation = 0,
  initialPlacementWorkplane,
  onHome,
  onOpenSkfProjectFile,
  onSaveSharedProject,
  onProjectShapesChange,
  onProjectSnapshot,
  onProjectWorkspaceChange,
  projectId,
  projectName = "SketchForge design",
  projectCreatedAt = Date.now(),
  projectModifiedAt = Date.now(),
  projectRevision = 0,
  sharedProjectsEnabled = false,
  challengeTutorial = null,
  onChallengeTutorialFinish,
  resolvedTheme = "light",
  onThemePreferenceChange,
}: {
  initialAssets?: ProjectAsset[];
  initialShapes?: WorkplaneShape[];
  initialHistory?: EditorHistoryEntry[];
  initialHistoryIndex?: number;
  initialSnap?: GridSize;
  initialWorkspace?: WorkplaneWorkspaceSettings;
  initialPlacementElevation?: number;
  initialPlacementWorkplane?: PlacementWorkplane;
  onHome?: () => void;
  onOpenSkfProjectFile?: (file: File) => Promise<{ ok: boolean; message: string } | void> | { ok: boolean; message: string } | void;
  onSaveSharedProject?: (request: { exportName: string; bytes: Uint8Array }) => Promise<string>;
  onProjectShapesChange?: (snapshot: {
    projectId: string;
    shapes: WorkplaneShape[];
    history: EditorHistoryEntry[];
    historyIndex: number;
    assets: ProjectAsset[];
    projectName: string;
    projectCreatedAt: number;
    workspace: WorkplaneWorkspaceSettings;
    snapGrid: GridSize;
    placementElevation: number;
    placementWorkplane: PlacementWorkplane;
    sketchPlacementWorkplane: PlacementWorkplane;
  }) => void;
  onProjectSnapshot?: (snapshot: { image: string; projectId: string; shapes: number }) => void;
  onProjectWorkspaceChange?: (snapshot: {
    projectId: string;
    workspace: WorkplaneWorkspaceSettings;
    snap: GridSize;
    placementElevation?: number;
    placementWorkplane?: PlacementWorkplane;
    sketchPlacementWorkplane?: PlacementWorkplane;
  }) => void;
  projectId?: string | null;
  projectName?: string;
  projectCreatedAt?: number;
  projectModifiedAt?: number;
  projectRevision?: number;
  sharedProjectsEnabled?: boolean;
  challengeTutorial?: ChallengeTutorialId | null;
  onChallengeTutorialFinish?: () => void;
  resolvedTheme?: ResolvedAppTheme;
  onThemePreferenceChange?: (preference: AppThemePreference) => void;
} = {}) {
  const initialSceneRef = useRef<WorkplaneShape[] | null>(null);
  if (initialSceneRef.current === null) {
    initialSceneRef.current = refreshConstructionPlaneShapes(initialShapes.map(canonicalizeShape));
  }
  const initialHistoryStateRef = useRef<EditorHistoryState | null>(null);
  if (initialHistoryStateRef.current === null) {
    initialHistoryStateRef.current = hydrateEditorHistoryState(
      initialSceneRef.current,
      initialHistory,
      initialHistoryIndex,
      normalizeWorkspaceSettings(initialWorkspace).historyLimit,
    );
  }
  const [shapes, setShapes] = useState<WorkplaneShape[]>(() => initialSceneRef.current as WorkplaneShape[]);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>(() => dedupeProjectAssets(initialAssets));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<WorkplaneShape[]>([]);
  const [systemClipboardSupported, setSystemClipboardSupported] = useState(false);
  const [history, setHistory] = useState<EditorHistoryEntry[]>(() => (initialHistoryStateRef.current as EditorHistoryState).entries);
  const [historyIndex, setHistoryIndex] = useState(() => (initialHistoryStateRef.current as EditorHistoryState).index);
  const [placementElevation, setPlacementElevation] = useState(() => Number.isFinite(initialPlacementElevation) ? initialPlacementElevation : 0);
  const [activeConstructionPlaneId, setActiveConstructionPlaneId] = useState(BASE_CONSTRUCTION_PLANE_ID);
  const [constructionPlanePanelOpen, setConstructionPlanePanelOpen] = useState(false);
  const [placementWorkplane, setPlacementWorkplane] = useState<PlacementWorkplane>(
    () => normalizePlacementWorkplane(initialPlacementWorkplane, initialPlacementElevation),
  );
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkplaneWorkspaceSettings>(() => normalizeWorkspaceSettings(initialWorkspace));
  const [snapGrid, setSnapGrid] = useState<GridSize>(() => normalizeSnapGrid(initialSnap));
  const [workplaneMode, setWorkplaneMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [topPanel, setTopPanel] = useState<TopPanel>(null);
  const [stepExporting, setStepExporting] = useState(false);
  const [skfExporting, setSkfExporting] = useState(false);
  const [alignMode, setAlignMode] = useState(false);
  const [alignAnchorId, setAlignAnchorId] = useState<string | null>(null);
  const [alignPreview, setAlignPreview] = useState<{ axis: AlignAxis; target: AlignTarget } | null>(null);
  const [mirrorMode, setMirrorMode] = useState(false);
  const [mirrorPreviewAxis, setMirrorPreviewAxis] = useState<AlignAxis | null>(null);
  const [activeMode, setActiveMode] = useState("3D Design");
  const [notice, setNotice] = useState("Ready");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const sketchImageInputRef = useRef<HTMLInputElement | null>(null);
  const booleanAutomationRunRef = useRef<string | null>(null);
  const projectHydratingRef = useRef(false);

  const activeTheme = useMemo(() => {
    if (workspaceSettings.themeId === "custom" && workspaceSettings.customTheme) {
      return customThemeWithDefaults(workspaceSettings.customTheme);
    }
    return defaultThemes[workspaceSettings.themeId || "light"] || defaultThemes.light;
  }, [workspaceSettings.themeId, workspaceSettings.customTheme]);

  useEffect(() => {
    onThemePreferenceChange?.(appColorModeForThemePreset(activeTheme.id));
  }, [activeTheme.id, onThemePreferenceChange]);

  const themeStyles = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, val] of Object.entries(activeTheme.ui)) {
      const kebab = key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
      vars[`--${kebab}`] = val;
    }
    return vars;
  }, [activeTheme]);

  // Persist theme selection to localStorage so new projects inherit it
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "sketchForge.defaultTheme",
        JSON.stringify({
          themeId: workspaceSettings.themeId || "light",
          customTheme: workspaceSettings.customTheme || null,
        })
      );
    } catch {}
  }, [workspaceSettings.themeId, workspaceSettings.customTheme]);
  const projectInteractionActiveRef = useRef(false);
  const pendingProjectShapesRef = useRef<WorkplaneShape[] | null>(null);
  const projectSyncTimerRef = useRef<number | null>(null);
  const lastProjectShapesSyncRef = useRef("");
  const lastProjectShapesEchoRef = useRef<string | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);
  const projectSnapshotRunRef = useRef(0);
  const shapesRef = useRef(shapes);
  const projectAssetsRef = useRef(projectAssets);
  const selectedIdsRef = useRef(selectedIds);
  const workspaceSettingsRef = useRef(workspaceSettings);
  const snapGridRef = useRef(snapGrid);
  const placementElevationRef = useRef(placementElevation);
  const placementWorkplaneRef = useRef(placementWorkplane);
  const noticeRef = useRef(notice);
  const projectInfoRef = useRef({ projectId: projectId ?? null, projectName, projectCreatedAt });
  const historyIndexRef = useRef(historyIndex);
  const historyRef = useRef(history);
  const historyLimitRef = useRef(workspaceSettings.historyLimit);
  const interactionHistoryStartRef = useRef("");
  const interactionHistoryChangedRef = useRef(false);
  const interactionHistoryTimerRef = useRef<number | null>(null);
  const [projectInteractionActive, setProjectInteractionActive] = useState(false);
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("geometry");
  const [sketchActive, setSketchActive] = useState(false);
  const [activeSketchWorkplane, setActiveSketchWorkplane] = useState<PlacementWorkplane>(
    () => normalizePlacementWorkplane(initialPlacementWorkplane, initialPlacementElevation),
  );
  const [sketchOperation, setSketchOperation] = useState<SketchOperation>("extrude");
  const [sketchRevolveSettings, setSketchRevolveSettings] = useState<SketchRevolveSettings>(() => ({ ...DEFAULT_SKETCH_REVOLVE_SETTINGS }));
  const [sketchRevolvePreview, setSketchRevolvePreview] = useState<SketchRevolveMesh | null>(null);
  const sketchRevolvePreviewRequestRef = useRef(0);
  const sketchRevolveUpdateRequestRef = useRef(new Map<string, number>());
  const sketchRevolveUpdateTimerRef = useRef(new Map<string, number>());
  const [sketchTool, setSketchTool] = useState<SketchTool>("line");
  const [sketchProfile, setSketchProfile] = useState<SketchProfile>(() => emptySketchProfile());
  const [sketchHistory, setSketchHistory] = useState<SketchProfile[]>([emptySketchProfile()]);
  const [sketchHistoryIndex, setSketchHistoryIndex] = useState(0);
  const sketchHistoryRef = useRef(sketchHistory);
  const sketchHistoryIndexRef = useRef(sketchHistoryIndex);
  const [sketchActivePointId, setSketchActivePointId] = useState<string | null>(null);
  const [sketchSelection, setSketchSelection] = useState<SketchSelection>(null);
  const [sketchExtrusionRegionIds, setSketchExtrusionRegionIds] = useState<string[] | null>(null);
  const [sketchMeasureStart, setSketchMeasureStart] = useState<SketchPoint | null>(null);
  const [sketchMeasurement, setSketchMeasurement] = useState<SketchMeasurement>(null);
  const [sketchCircleDraft, setSketchCircleDraft] = useState<SketchCircleDraft | null>(null);
  const [sketchRectDraft, setSketchRectDraft] = useState<SketchRectDraft | null>(null);
  const [sketchPolygonDraft, setSketchPolygonDraft] = useState<SketchPolygonDraft | null>(null);
  const [sketchPolygonSides, setSketchPolygonSides] = useState(6);
  const [sketchTextDraft, setSketchTextDraft] = useState<SketchTextDraft | null>(null);
  const [sketchCommand, setSketchCommand] = useState<SketchCommandKind | null>(null);
  const [sketchConstructionPlaneId, setSketchConstructionPlaneId] = useState(BASE_CONSTRUCTION_PLANE_ID);
  const [editingSketchShapeId, setEditingSketchShapeId] = useState<string | null>(null);
  const [edgeModifier, setEdgeModifier] = useState<EdgeModifierSession | null>(null);
  const edgeModifierRef = useRef<EdgeModifierSession | null>(null);
  const cadModifierWorkerRef = useRef<Worker | null>(null);
  const cadModifierPendingRef = useRef(new Map<number, {
    resolve: (message: CadModifierWorkerResponse) => void;
    reject: (error: Error) => void;
    timer: number;
  }>());
  const cadModifierRequestRef = useRef(0);
  const cadModifierPrepareRef = useRef(0);
  const cadModifierLatestPreviewRef = useRef(0);
  const cadModifierBaseShapeRef = useRef<WorkplaneShape | null>(null);
  const cadModifierBaseFingerprintRef = useRef("");
  const cadModifierSourcePartsRef = useRef<WorkplaneShape[]>([]);
  const cadModifierWatchdogRef = useRef<{ requestId: number; phase: CadModifierRequestPhase; timer: number } | null>(null);
  const cadModifierWorkerRestartRef = useRef<() => Worker | null>(() => null);
  const lastMcpErrorRef = useRef<string | null>(null);
  const executeMcpCommandRef = useRef<((command: SketchForgeMcpCommand) => Promise<unknown>) | null>(null);
  const sketchCadRegions = useMemo(() => {
    if (!sketchActive || sketchOperation !== "extrude") return [];
    try {
      return cadSketchSelectableRegions(sketchProfile);
    } catch {
      return [];
    }
  }, [sketchActive, sketchOperation, sketchProfile]);
  const sketchCadRegionIds = useMemo(() => sketchCadRegions.map((region) => region.id), [sketchCadRegions]);
  const defaultSketchRegionIds = useMemo(() => {
    if (!sketchActive || sketchOperation !== "extrude") return [];
    try {
      return cadSketchRegions(sketchProfile).map((region) => region.id);
    } catch {
      return [];
    }
  }, [sketchActive, sketchOperation, sketchProfile]);
  const selectedSketchRegionIds = useMemo(() => {
    if (sketchExtrusionRegionIds === null) return defaultSketchRegionIds;
    const available = new Set(sketchCadRegionIds);
    return sketchExtrusionRegionIds.filter((id) => available.has(id));
  }, [defaultSketchRegionIds, sketchCadRegionIds, sketchExtrusionRegionIds]);

  const clearCadModifierWatchdog = useCallback((requestId?: number) => {
    const active = cadModifierWatchdogRef.current;
    if (!active || (requestId !== undefined && active.requestId !== requestId)) return;
    window.clearTimeout(active.timer);
    cadModifierWatchdogRef.current = null;
  }, []);

  const armCadModifierWatchdog = useCallback((requestId: number, phase: CadModifierRequestPhase, timeoutMs = CAD_MODIFIER_REQUEST_TIMEOUT_MS) => {
    clearCadModifierWatchdog();
    const timer = window.setTimeout(() => {
      const active = cadModifierWatchdogRef.current;
      if (!active || active.requestId !== requestId) return;
      cadModifierWatchdogRef.current = null;
      cadModifierWorkerRef.current?.terminate();
      cadModifierWorkerRef.current = null;
      cadModifierWorkerRestartRef.current();
      const message = cadModifierTimeoutMessage(phase);
      setEdgeModifier((current) => current ? {
        ...current,
        busy: false,
        prepared: false,
        preview: null,
        error: message,
      } : current);
      setNotice(message);
    }, timeoutMs);
    cadModifierWatchdogRef.current = { requestId, phase, timer };
  }, [clearCadModifierWatchdog]);

  useEffect(() => {
    let disposed = false;
    const rejectPendingRequests = (message: string) => {
      cadModifierPendingRef.current.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error(message));
      });
      cadModifierPendingRef.current.clear();
    };
    const reportWorkerFailure = (worker: Worker | null) => {
      if (worker && cadModifierWorkerRef.current !== worker) return;
      clearCadModifierWatchdog();
      worker?.terminate();
      cadModifierWorkerRef.current = null;
      rejectPendingRequests("The CAD worker could not start");
      const requestId = cadModifierRequestRef.current + 1;
      cadModifierRequestRef.current = requestId;
      cadModifierPrepareRef.current = requestId;
      cadModifierLatestPreviewRef.current = requestId;
      if (cadModifierBaseShapeRef.current) {
        const message = cadModifierWorkerFailureMessage();
        setEdgeModifier((current) => current ? { ...current, busy: false, prepared: false, preview: null, error: message } : current);
        setNotice(message);
      }
    };
    const createWorker = () => {
      if (disposed) return null;
      cadModifierWorkerRef.current?.terminate();
      try {
        const worker = new Worker(new URL("../workers/cadModifier.worker.ts", import.meta.url), { type: "module" });
        cadModifierWorkerRef.current = worker;
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (event) => {
          event.preventDefault();
          reportWorkerFailure(worker);
        };
        worker.onmessageerror = () => reportWorkerFailure(worker);
        return worker;
      } catch {
        reportWorkerFailure(null);
        return null;
      }
    };
    function handleWorkerMessage(event: MessageEvent<CadModifierWorkerResponse>) {
      const message = event.data;
      clearCadModifierWatchdog(message.requestId);
      const pending = cadModifierPendingRef.current.get(message.requestId);
      if (pending) {
        window.clearTimeout(pending.timer);
        cadModifierPendingRef.current.delete(message.requestId);
        if (message.type === "error") {
          pending.reject(new Error(message.message));
        } else {
          pending.resolve(message);
        }
        return;
      }
      if (message.type === "ready") {
        if (message.requestId !== cadModifierPrepareRef.current) return;
        setEdgeModifier((current) => current ? {
          ...current,
          edges: message.edges,
          selectedEdgeIds: [],
          busy: false,
          prepared: true,
          preview: null,
          componentPreviews: [],
          error: message.selectableEdgeIds.length ? null : "No sharp manifold edges were found at this threshold",
        } : current);
        if (message.selectableEdgeIds.length) setNotice("Select highlighted edges, then adjust the preview");
        return;
      }
      if (message.type === "preview") {
        if (message.requestId !== cadModifierLatestPreviewRef.current) return;
        const base = cadModifierBaseShapeRef.current;
        const sourceParts = cadModifierSourcePartsRef.current.length ? cadModifierSourcePartsRef.current : (base ? [base] : []);
        const rawPreview = base ? shapeFromCadMesh(base, message.positions, message.normals, message.indices, message.brep) : null;
        const preview = rawPreview ? {
          ...rawPreview,
          cadDisplayEdges: cadDisplayEdgesForShape(rawPreview, message.displayEdges),
          cadDisplayEdgesVersion: 2 as const,
        } : null;
        const componentPreviews = cadModifierComponentPreviews(sourceParts, message.components);
        setEdgeModifier((current) => current ? {
          ...current,
          preview,
          componentPreviews,
          busy: false,
          error: preview ? null : "The CAD kernel returned an empty edge treatment",
        } : current);
        if (preview) setNotice("Edge treatment preview ready");
        return;
      }
      if (message.type === "error") {
        if (message.requestId < cadModifierLatestPreviewRef.current) return;
        if (message.resetSession) {
          const requestId = cadModifierRequestRef.current + 1;
          cadModifierRequestRef.current = requestId;
          cadModifierLatestPreviewRef.current = requestId;
          cadModifierPrepareRef.current = requestId;
          cadModifierBaseShapeRef.current = null;
          cadModifierBaseFingerprintRef.current = "";
          cadModifierSourcePartsRef.current = [];
          setEdgeModifier(null);
          setNotice(message.message);
          return;
        }
        setEdgeModifier((current) => current ? { ...current, busy: false, preview: null, error: message.message } : current);
        setNotice("Edge treatment needs adjustment");
      }
    }
    cadModifierWorkerRestartRef.current = createWorker;
    createWorker();
    return () => {
      disposed = true;
      clearCadModifierWatchdog();
      cadModifierWorkerRestartRef.current = () => null;
      rejectPendingRequests("The CAD worker was closed");
      cadModifierWorkerRef.current?.terminate();
      cadModifierWorkerRef.current = null;
    };
  }, [clearCadModifierWatchdog]);

  const invalidateCadModifierSession = useCallback(() => {
    const wasActive = cadModifierBaseShapeRef.current !== null;
    if (!wasActive) return false;
    const hadInFlightRequest = cadModifierWatchdogRef.current !== null;
    clearCadModifierWatchdog();
    const requestId = cadModifierRequestRef.current + 1;
    cadModifierRequestRef.current = requestId;
    cadModifierLatestPreviewRef.current = requestId;
    cadModifierPrepareRef.current = requestId;
    if (hadInFlightRequest) {
      cadModifierWorkerRef.current?.terminate();
      cadModifierWorkerRef.current = null;
      cadModifierWorkerRestartRef.current();
    } else {
      cadModifierWorkerRef.current?.postMessage({ type: "dispose", requestId } satisfies CadModifierWorkerRequest);
    }
    cadModifierBaseShapeRef.current = null;
    cadModifierBaseFingerprintRef.current = "";
    cadModifierSourcePartsRef.current = [];
    setEdgeModifier(null);
    return true;
  }, [clearCadModifierWatchdog]);

  useEffect(() => {
    const warmBooleanRuntime = () => {
      void getManifoldRuntime().catch(() => {
        // Allow a real grouping action to retry if an idle preload was interrupted.
        manifoldRuntimePromise = null;
      });
    };
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmBooleanRuntime, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = globalThis.setTimeout(warmBooleanRuntime, 250);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const applyTitles = () => {
      document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (button.title) {
          return;
        }
        const label = button.getAttribute("aria-label") ?? button.textContent?.trim();
        if (label) {
          button.title = label.replace(/\s+/g, " ");
        }
      });
    };

    applyTitles();
    const observer = new MutationObserver(applyTitles);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSystemClipboardSupported(Boolean(navigator.clipboard));
    setClipboard(readSharedClipboard());
    const onStorage = (event: StorageEvent) => {
      if (event.key === SHARED_CLIPBOARD_STORAGE_KEY) {
        setClipboard(readSharedClipboard());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    projectAssetsRef.current = projectAssets;
  }, [projectAssets]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    const currentHistory = historyRef.current;
    const currentIndex = Math.min(historyIndexRef.current, Math.max(0, currentHistory.length - 1));
    const currentEntry = currentHistory[currentIndex];
    if (currentEntry && currentEntry.selectedIds.join("\0") !== selectedIds.join("\0")) {
      const updated = currentHistory.map((entry, index) => index === currentIndex ? { ...entry, selectedIds: [...selectedIds] } : entry);
      historyRef.current = updated;
      setHistory(updated);
    }
  }, [selectedIds]);

  useEffect(() => {
    workspaceSettingsRef.current = workspaceSettings;
  }, [workspaceSettings]);

  useEffect(() => {
    snapGridRef.current = snapGrid;
  }, [snapGrid]);

  useEffect(() => {
    placementElevationRef.current = placementElevation;
  }, [placementElevation]);

  useEffect(() => {
    placementWorkplaneRef.current = placementWorkplane;
  }, [placementWorkplane]);

  useEffect(() => {
    noticeRef.current = notice;
  }, [notice]);

  useEffect(() => {
    projectInfoRef.current = { projectId: projectId ?? null, projectName, projectCreatedAt };
  }, [projectCreatedAt, projectId, projectName]);

  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    sketchHistoryRef.current = sketchHistory;
  }, [sketchHistory]);

  useEffect(() => {
    sketchHistoryIndexRef.current = sketchHistoryIndex;
  }, [sketchHistoryIndex]);

  useEffect(() => {
    edgeModifierRef.current = edgeModifier;
  }, [edgeModifier]);

  useEffect(() => {
    const requestId = sketchRevolvePreviewRequestRef.current + 1;
    sketchRevolvePreviewRequestRef.current = requestId;
    if (!sketchActive || sketchOperation !== "revolve" || sketchProfile.segments.length === 0) {
      setSketchRevolvePreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void getManifoldRuntime()
        .then((runtime) => buildSketchRevolveMesh(runtime, sketchProfile, sketchRevolveSettings))
        .then((mesh) => {
          if (sketchRevolvePreviewRequestRef.current === requestId) setSketchRevolvePreview(mesh);
        })
        .catch(() => {
          if (sketchRevolvePreviewRequestRef.current === requestId) setSketchRevolvePreview(null);
        });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [sketchActive, sketchOperation, sketchProfile, sketchRevolveSettings]);

  useEffect(() => {
    const nextWorkspace = normalizeWorkspaceSettings(initialWorkspace);
    workspaceSettingsRef.current = nextWorkspace;
    setWorkspaceSettings((current) => (
      workplaneSettingsFingerprint(current, snapGridRef.current) === workplaneSettingsFingerprint(nextWorkspace, snapGridRef.current)
        ? current
        : nextWorkspace
    ));
  }, [initialWorkspace]);

  useEffect(() => {
    const nextSnap = normalizeSnapGrid(initialSnap);
    snapGridRef.current = nextSnap;
    setSnapGrid((current) => (current === nextSnap ? current : nextSnap));
  }, [initialSnap]);

  const selectedShapes = useMemo(() => shapes.filter((shape) => selectedIds.includes(shape.id)), [selectedIds, shapes]);
  const selectedShape = selectedShapes.at(-1) ?? null;
  const hasSelection = selectedShapes.length > 0;
  const constructionPlanes = useMemo(() => shapes.filter((shape) => shape.kind === "constructionPlane" && shape.constructionPlane), [shapes]);
  const activeConstructionPlane = useMemo(
    () => constructionPlanes.find((plane) => plane.id === activeConstructionPlaneId) ?? null,
    [activeConstructionPlaneId, constructionPlanes],
  );
  useEffect(() => {
    if (activeConstructionPlaneId !== BASE_CONSTRUCTION_PLANE_ID && !activeConstructionPlane) {
      setActiveConstructionPlaneId(BASE_CONSTRUCTION_PLANE_ID);
    }
  }, [activeConstructionPlane, activeConstructionPlaneId]);
  const modifierAvailableEdgeIds = useMemo(
    () => edgeModifier ? edgeModifier.edges.filter((edge) => selectableCadModifierEdge(edge, edgeModifier.sharpAngle)).map((edge) => edge.id) : [],
    [edgeModifier?.edges, edgeModifier?.sharpAngle],
  );
  const edgeModifierMaxAmount = useMemo(() => {
    const source = cadModifierBaseShapeRef.current ?? selectedShape;
    if (!source) return 10;
    const smallestDimension = Math.min(shapeWidth(source), shapeDepth(source), source.height);
    return Math.max(MIN_EDGE_MODIFIER_AMOUNT, smallestDimension * 0.99);
  }, [edgeModifier, selectedShape]);
  const selectedEdgeFeatureCount = useMemo(() => selectedShape ? edgeTreatmentFeatureCount(selectedShape) : 0, [selectedShape]);
  const selectedReversibleEdgeFeatureCount = useMemo(() => selectedShape ? reversibleEdgeTreatmentCount(selectedShape) : 0, [selectedShape]);
  const selectedEdgeHistoryOptions = useMemo(() => selectedShape ? edgeTreatmentHistoryOptions(selectedShape) : [], [selectedShape]);
  const canSeparateSelectedParts = useMemo(
    () => selectedShapes.length === 1 && Boolean(selectedShape && separablePartCount(selectedShape) > 1),
    [selectedShape, selectedShapes.length],
  );
  const toggleModifierEdge = useCallback((id: number, singleEdge = false) => {
    setEdgeModifier((current) => {
      if (!current || current.busy) return current;
      const allowed = new Set(current.edges.filter((edge) => selectableCadModifierEdge(edge, current.sharpAngle)).map((edge) => edge.id));
      if (!allowed.has(id)) return current;
      const ids = current.tangentChain && !singleEdge ? tangentCadEdgeChain(current.edges, id, allowed) : [id];
      const next = new Set(current.selectedEdgeIds);
      const remove = ids.every((edgeId) => next.has(edgeId));
      ids.forEach((edgeId) => remove ? next.delete(edgeId) : next.add(edgeId));
      return { ...current, selectedEdgeIds: [...next], preview: null, busy: next.size > 0, error: next.size ? null : "Select at least one highlighted edge" };
    });
  }, []);
  const exportableShapeCount = useMemo(() => (hasSelection ? selectedShapes : shapes).filter((shape) => !shape.hole && shape.kind !== "constructionPlane").length, [hasSelection, selectedShapes, shapes]);
  const exportScopeLabel = hasSelection ? "selected" : "total";
  const effectiveAlignAnchorId = useMemo(
    () => effectiveAlignmentAnchorId(selectedShapes, alignAnchorId),
    [alignAnchorId, selectedShapes],
  );
  const alignHandleStatuses = useMemo(() => (alignMode ? alignmentStatuses(selectedShapes, effectiveAlignAnchorId) : []), [alignMode, effectiveAlignAnchorId, selectedShapes]);
  const viewportShapes = useMemo(
    () =>
      edgeModifier?.preview && cadModifierBaseShapeRef.current
        ? shapes.map((shape) => shape.id === cadModifierBaseShapeRef.current?.id ? edgeModifier.preview as WorkplaneShape : shape)
        : alignMode && alignPreview
        ? alignedShapesForSelection(shapes, selectedIds, selectedShapes, effectiveAlignAnchorId, alignPreview.axis, alignPreview.target).nextShapes
        : mirrorMode && mirrorPreviewAxis
          ? mirroredShapesForSelection(shapes, selectedIds, selectedShapes, mirrorPreviewAxis).nextShapes
          : shapes,
    [alignMode, alignPreview, edgeModifier?.preview, effectiveAlignAnchorId, mirrorMode, mirrorPreviewAxis, selectedIds, selectedShapes, shapes],
  );
  const sketchReferenceShapes = useMemo(
    () => sketchOperation === "revolve" || placementWorkplaneIsBase(activeSketchWorkplane)
      ? shapes
      : shapes.map((shape) => shape.hidden || shape.id === editingSketchShapeId
        ? shape
        : sketchReferenceShapeOnWorkplane(shape, activeSketchWorkplane)),
    [activeSketchWorkplane, editingSketchShapeId, shapes, sketchOperation],
  );
  const debugState = useMemo(
    () =>
      JSON.stringify({
        notice,
        selectedIds,
        shapeCount: shapes.length,
        shapes: shapes.map(debugShapeSummary),
      }),
    [notice, selectedIds, shapes],
  );
  const compactDebugState = useMemo(
    () => `notice=${notice};selected=${selectedIds.length};count=${shapes.length};${shapes.map(compactShapeSummary).join(";")}`,
    [notice, selectedIds, shapes],
  );

  useEffect(() => {
    if (!projectId || !onProjectSnapshot || typeof window === "undefined") {
      return;
    }
    if (projectInteractionActive) {
      return;
    }

    const runId = projectSnapshotRunRef.current + 1;
    projectSnapshotRunRef.current = runId;
    const capture = async () => {
      if (projectSnapshotRunRef.current !== runId) {
        return true;
      }
      const image = window.sketchforgeCaptureCanvasAsync
        ? await window.sketchforgeCaptureCanvasAsync()
        : window.sketchforgeCaptureCanvas?.() ?? "";
      if (projectSnapshotRunRef.current !== runId) {
        return true;
      }
      if (image && image.length > 100) {
        onProjectSnapshot({ image, projectId, shapes: shapes.length });
        return true;
      }
      return false;
    };

    let idleId: number | null = null;
    let retryTimer: number | null = null;
    const runCapture = () => {
      void capture().then((captured) => {
        if (!captured) {
          retryTimer = window.setTimeout(() => void capture(), 650);
        }
      });
    };
    const captureTimer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(runCapture, { timeout: 1200 });
      } else {
        runCapture();
      }
    }, 850);
    return () => {
      window.clearTimeout(captureTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (idleId !== null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
    };
  }, [onProjectSnapshot, projectId, projectInteractionActive, shapes]);

  useEffect(() => {
    if (selectedShapes.length < 2) {
      setAlignMode(false);
      setAlignAnchorId(null);
      setAlignPreview(null);
    }
    if (alignAnchorId && !selectedIds.includes(alignAnchorId)) {
      setAlignAnchorId(null);
      setAlignPreview(null);
    }
    if (selectedShapes.length === 0) {
      setMirrorMode(false);
      setMirrorPreviewAxis(null);
    }
  }, [alignAnchorId, selectedIds, selectedShapes.length]);

  const syncProjectShapes = useCallback(
    (nextShapes: WorkplaneShape[], force = false) => {
      if (!projectId || !onProjectShapesChange) {
        return;
      }
      if (projectInteractionActiveRef.current) {
        pendingProjectShapesRef.current = nextShapes.map(canonicalizeShape);
        if (projectSyncTimerRef.current !== null) {
          window.clearTimeout(projectSyncTimerRef.current);
          projectSyncTimerRef.current = null;
        }
        return;
      }
      const canonicalNext = nextShapes.map(canonicalizeShape);
      const serialized = projectShapesFingerprint(canonicalNext);
      if (!force && lastProjectShapesSyncRef.current === serialized) {
        return;
      }
      if (projectSyncTimerRef.current !== null) {
        window.clearTimeout(projectSyncTimerRef.current);
      }
      projectSyncTimerRef.current = window.setTimeout(() => {
        lastProjectShapesSyncRef.current = serialized;
        lastProjectShapesEchoRef.current = serialized;
        onProjectShapesChange({
          projectId,
          shapes: canonicalNext,
          history: historyRef.current,
          historyIndex: historyIndexRef.current,
          assets: projectAssetsRef.current,
          projectName: projectInfoRef.current.projectName,
          projectCreatedAt: projectInfoRef.current.projectCreatedAt,
          workspace: workspaceSettingsRef.current,
          snapGrid: snapGridRef.current,
          placementElevation: placementElevationRef.current,
          placementWorkplane: placementWorkplaneRef.current,
          sketchPlacementWorkplane: placementWorkplaneRef.current,
        });
        projectSyncTimerRef.current = null;
      }, 120);
    },
    [onProjectShapesChange, projectId],
  );

  useEffect(() => {
    const limitChanged = historyLimitRef.current !== workspaceSettings.historyLimit;
    historyLimitRef.current = workspaceSettings.historyLimit;
    const bounded = boundedEditorHistoryState(
      historyRef.current,
      historyIndexRef.current,
      workspaceSettings.historyLimit,
    );
    if (bounded.entries !== historyRef.current || bounded.index !== historyIndexRef.current) {
      historyRef.current = bounded.entries;
      historyIndexRef.current = bounded.index;
      setHistory(bounded.entries);
      setHistoryIndex(bounded.index);
    }
    if (limitChanged) syncProjectShapes(shapesRef.current, true);
  }, [syncProjectShapes, workspaceSettings.historyLimit]);

  const appendHistoryEntry = useCallback((entry: EditorHistoryEntry) => {
    const result = appendEditorHistorySnapshot(
      historyRef.current,
      historyIndexRef.current,
      entry,
      workspaceSettingsRef.current.historyLimit,
    );
    if (result.entries !== historyRef.current) {
      historyRef.current = result.entries;
      setHistory(result.entries);
    }
    historyIndexRef.current = result.index;
    setHistoryIndex(result.index);
    return result.changed;
  }, []);

  const appendHistorySnapshot = useCallback(
    (nextShapes: WorkplaneShape[], nextSelection: string[]) =>
      appendHistoryEntry(editorHistoryEntry(nextShapes, nextSelection)),
    [appendHistoryEntry],
  );

  const finalizeInteractionHistory = useCallback(() => {
    const startFingerprint = interactionHistoryStartRef.current;
    const hadChanges = interactionHistoryChangedRef.current;
    interactionHistoryStartRef.current = "";
    interactionHistoryChangedRef.current = false;
    if (!hadChanges) {
      return;
    }

    const entry = editorHistoryEntry(shapesRef.current, selectedIdsRef.current);
    if (!startFingerprint || startFingerprint === entry.fingerprint) {
      return;
    }

    appendHistoryEntry(entry);
  }, [appendHistoryEntry]);

  useEffect(() => {
    if (projectInteractionActive || !pendingProjectShapesRef.current) {
      return;
    }
    pendingProjectShapesRef.current = null;
    const timer = window.setTimeout(() => syncProjectShapes(shapesRef.current), 180);
    return () => window.clearTimeout(timer);
  }, [projectInteractionActive, syncProjectShapes]);

  const updateProjectInteractionActive = useCallback(
    (active: boolean) => {
      if (active) {
        if (interactionHistoryTimerRef.current !== null) {
          window.clearTimeout(interactionHistoryTimerRef.current);
          interactionHistoryTimerRef.current = null;
          finalizeInteractionHistory();
        }
        if (!projectInteractionActiveRef.current) {
          interactionHistoryStartRef.current = projectShapesFingerprint(shapesRef.current);
          interactionHistoryChangedRef.current = false;
        }
        projectInteractionActiveRef.current = true;
        setProjectInteractionActive((current) => (current ? current : true));
        return;
      }

      projectInteractionActiveRef.current = false;
      setProjectInteractionActive((current) => (current ? false : current));
      if (interactionHistoryTimerRef.current !== null) {
        window.clearTimeout(interactionHistoryTimerRef.current);
      }
      interactionHistoryTimerRef.current = window.setTimeout(() => {
        interactionHistoryTimerRef.current = null;
        finalizeInteractionHistory();
      }, 0);
    },
    [finalizeInteractionHistory],
  );

  const updateProjectWorkspaceSettings = useCallback(
    (settings: { workspace: WorkplaneWorkspaceSettings; snap: GridSize }) => {
      const nextWorkspace = normalizeWorkspaceSettings(settings.workspace);
      workspaceSettingsRef.current = nextWorkspace;
      snapGridRef.current = settings.snap;
      setWorkspaceSettings((current) => (
        workplaneSettingsFingerprint(current, settings.snap) === workplaneSettingsFingerprint(nextWorkspace, settings.snap)
          ? current
          : nextWorkspace
      ));
      setSnapGrid(settings.snap);
      if (!projectId || !onProjectWorkspaceChange) {
        return;
      }
      onProjectWorkspaceChange({
        projectId,
        workspace: nextWorkspace,
        snap: settings.snap,
        placementElevation,
        placementWorkplane: placementWorkplaneRef.current,
        sketchPlacementWorkplane: placementWorkplaneRef.current,
      });
    },
    [onProjectWorkspaceChange, placementElevation, projectId],
  );

  useEffect(() => {
    if (!projectId || !onProjectWorkspaceChange) return;
    onProjectWorkspaceChange({
      projectId,
      workspace: workspaceSettingsRef.current,
      snap: snapGrid,
      placementElevation,
      placementWorkplane,
      sketchPlacementWorkplane: placementWorkplane,
    });
  }, [onProjectWorkspaceChange, placementElevation, placementWorkplane, projectId, snapGrid]);

  const commitShapes = useCallback(
    (next: WorkplaneShape[], nextSelection: string | string[] | null = selectedIds, message?: string) => {
      const canonicalNext = refreshConstructionPlaneShapes(next.map(canonicalizeShape), shapesRef.current);
      const requestedSelection = Array.isArray(nextSelection) ? nextSelection : nextSelection ? [nextSelection] : [];
      const validSelection = requestedSelection.filter((id, index) => requestedSelection.indexOf(id) === index && canonicalNext.some((shape) => shape.id === id));
      shapesRef.current = canonicalNext;
      selectedIdsRef.current = validSelection;
      setShapes(canonicalNext);
      setSelectedIds(validSelection);
      const changed = appendHistorySnapshot(canonicalNext, validSelection);
      if (message) {
        setNotice(message);
      }
      if (changed) {
        syncProjectShapes(canonicalNext);
      }
    },
    [appendHistorySnapshot, selectedIds, syncProjectShapes],
  );

  const createPrincipalConstructionPlane = useCallback((principal: PrincipalPlane, offset: number, angle: number = 0, flipped: boolean = false) => {
    const safeOffset = Number.isFinite(offset) ? Math.max(-1000, Math.min(1000, offset)) : 0;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const pose = principalPlanePose(principal, safeOffset, safeAngle, flipped);
    const label = principal.toUpperCase();
    const plane = createConstructionPlaneShape(
      `${label} plane${Math.abs(safeOffset) > 0.0001 ? ` (${safeOffset} mm)` : ""}`,
      { kind: "principal", principal, offset: safeOffset, angle: safeAngle, flipped, pose },
      workspaceSettings.width,
      workspaceSettings.depth,
    );
    commitShapes([...shapes, plane], [], `${label} construction plane created and activated`);
    setActiveConstructionPlaneId(plane.id);
    setConstructionPlanePanelOpen(false);
  }, [commitShapes, shapes, workspaceSettings.depth, workspaceSettings.width]);

  const createAngleConstructionPlane = useCallback((referencePlaneId: string, angle: number, offset: number = 0, flipped: boolean = false) => {
    const referencePlane = referencePlaneId === BASE_CONSTRUCTION_PLANE_ID
      ? null
      : shapes.find((shape) => shape.id === referencePlaneId && shape.kind === "constructionPlane" && shape.constructionPlane);
    if (referencePlaneId !== BASE_CONSTRUCTION_PLANE_ID && !referencePlane) {
      setNotice("The reference plane is no longer available");
      return;
    }
    const safeOffset = Number.isFinite(offset) ? Math.max(-1000, Math.min(1000, offset)) : 0;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const pose = modifiedConstructionPlanePose(
      constructionPlanePoseById(referencePlaneId, shapes),
      safeOffset,
      safeAngle,
      flipped,
    );
    const referenceName = referencePlane?.name ?? "Base XZ plane";
    const plane = createConstructionPlaneShape(
      `${referenceName} angle plane (${Number(safeAngle.toFixed(2))} deg)`,
      { kind: "angle", referencePlaneId, angle: safeAngle, offset: safeOffset, flipped, pose },
      workspaceSettings.width,
      workspaceSettings.depth,
    );
    commitShapes([...shapes, plane], [], `Angle construction plane created from ${referenceName}`);
    setActiveConstructionPlaneId(plane.id);
    setConstructionPlanePanelOpen(false);
  }, [commitShapes, shapes, workspaceSettings.depth, workspaceSettings.width]);

  const createMidplaneConstructionPlane = useCallback((firstPlaneId: string, secondPlaneId: string, offset: number = 0) => {
    if (firstPlaneId === secondPlaneId) {
      setNotice("Choose two different source planes");
      return;
    }
    const planeForId = (id: string) => id === BASE_CONSTRUCTION_PLANE_ID
      ? null
      : shapes.find((shape) => shape.id === id && shape.kind === "constructionPlane" && shape.constructionPlane);
    const firstPlane = planeForId(firstPlaneId);
    const secondPlane = planeForId(secondPlaneId);
    if ((firstPlaneId !== BASE_CONSTRUCTION_PLANE_ID && !firstPlane) || (secondPlaneId !== BASE_CONSTRUCTION_PLANE_ID && !secondPlane)) {
      setNotice("One of the source planes is no longer available");
      return;
    }
    const firstPose = constructionPlanePoseById(firstPlaneId, shapes);
    const secondPose = constructionPlanePoseById(secondPlaneId, shapes);
    if (!constructionPlanePosesAreParallel(firstPose, secondPose)) {
      setNotice("Midplanes require two parallel source planes");
      return;
    }
    const safeOffset = Number.isFinite(offset) ? Math.max(-1000, Math.min(1000, offset)) : 0;
    const pose = midplaneConstructionPlanePose(firstPose, secondPose, safeOffset);
    const firstName = firstPlane?.name ?? "Base XZ plane";
    const secondName = secondPlane?.name ?? "Base XZ plane";
    const plane = createConstructionPlaneShape(
      `Midplane: ${firstName} / ${secondName}`,
      { kind: "midplane", firstPlaneId, secondPlaneId, offset: safeOffset, pose },
      workspaceSettings.width,
      workspaceSettings.depth,
    );
    commitShapes([...shapes, plane], [], `Midplane created between ${firstName} and ${secondName}`);
    setActiveConstructionPlaneId(plane.id);
    setConstructionPlanePanelOpen(false);
  }, [commitShapes, shapes, workspaceSettings.depth, workspaceSettings.width]);

  const createFaceConstructionPlane = useCallback((input: { sourceShapeId: string; origin: [number, number, number]; normal: [number, number, number]; preferredXAxis: [number, number, number] }) => {
    const source = shapes.find((shape) => shape.id === input.sourceShapeId && shape.kind !== "constructionPlane");
    if (!source) {
      setNotice("The selected face is no longer available");
      return;
    }
    const pose = poseFromWorldOriginAndNormal(input.origin, input.normal, input.preferredXAxis);
    const attachment = constructionPlaneAttachmentFromWorldPose(pose, source);
    const plane = createConstructionPlaneShape(
      `${source.name} face plane`,
      { kind: "face", sourceShapeId: source.id, attachment, pose },
      Math.max(20, Math.min(workspaceSettings.width, shapeWidth(source) * 1.6)),
      Math.max(20, Math.min(workspaceSettings.depth, Math.max(source.height, shapeDepth(source)) * 1.6)),
    );
    commitShapes([...shapes, plane], source.id, `Associative plane created from ${source.name}`);
    setActiveConstructionPlaneId(plane.id);
    setWorkplaneMode(false);
  }, [commitShapes, shapes, workspaceSettings.depth, workspaceSettings.width]);

  const removeEdgeTreatment = useCallback(async (optionId: string) => {
    if (!selectedShape) {
      setNotice("Select a shape with an edge feature first");
      return;
    }
    if (selectedShape.locked) {
      setNotice("Unlock the shape before removing an edge feature");
      return;
    }
    const option = selectedEdgeHistoryOptions.find((candidate) => candidate.id === optionId);
    if (!option) {
      setNotice("Choose an edge feature to remove");
      return;
    }
    const sourceFingerprint = projectShapesFingerprint([selectedShape]);
    const sourceProjectId = projectInfoRef.current.projectId;
    const restored = await restoreEdgeTreatmentInShape(selectedShape, option.path, option.entryId);
    if (!restored) {
      setNotice(selectedEdgeFeatureCount > 0 ? "This edge feature has no stored undo history" : "No edge feature to remove");
      return;
    }
    const currentTarget = shapesRef.current.find((shape) => shape.id === selectedShape.id);
    if (projectInfoRef.current.projectId !== sourceProjectId || !currentTarget || projectShapesFingerprint([currentTarget]) !== sourceFingerprint) {
      setNotice("The object changed while removing the edge feature; try again");
      return;
    }
    invalidateCadModifierSession();
    commitShapes(
      shapesRef.current.map((shape) => shape.id === selectedShape.id ? restored.shape : shape),
      restored.shape.id,
      `Removed ${restored.label}`,
    );
    setNotice(`Removed ${restored.label}`);
  }, [commitShapes, invalidateCadModifierSession, selectedEdgeFeatureCount, selectedEdgeHistoryOptions, selectedShape]);

  const commitSketchProfile = useCallback(
    (next: SketchProfile, message?: string) => {
      const snapshot = cloneSketchProfile(solveSketchProfile(next).profile);
      const current = sketchHistoryRef.current;
      const currentIndex = Math.min(sketchHistoryIndexRef.current, Math.max(0, current.length - 1));
      const trimmed = current.slice(0, currentIndex + 1);
      const latest = trimmed.at(-1);
      setSketchProfile(snapshot);
      if (latest && JSON.stringify(latest) === JSON.stringify(snapshot)) {
        return;
      }
      const nextHistory = [...trimmed, cloneSketchProfile(snapshot)].slice(-MAX_SKETCH_HISTORY_ENTRIES);
      sketchHistoryRef.current = nextHistory;
      sketchHistoryIndexRef.current = nextHistory.length - 1;
      setSketchHistory(nextHistory);
      setSketchHistoryIndex(sketchHistoryIndexRef.current);
      if (message) setNotice(message);
    },
    [],
  );

  const beginSketch = useCallback((
    operation: SketchOperation,
    profile?: SketchProfile,
    editingId: string | null = null,
    revolveSettings?: Partial<SketchRevolveSettings>,
    constructionPlaneId = activeConstructionPlaneId,
    workplaneOverride?: PlacementWorkplane,
  ) => {
    const constructionPose = constructionPlaneId === BASE_CONSTRUCTION_PLANE_ID
      ? null
      : constructionPlanePoseById(constructionPlaneId, shapes);
    const sketchWorkplane = normalizePlacementWorkplane(
      workplaneOverride
        ?? (constructionPose ? placementWorkplaneForConstructionPlanePose(constructionPose) : placementWorkplaneRef.current),
    );
    const projectionPose = constructionPose ?? constructionPlanePoseForPlacementWorkplane(sketchWorkplane);
    const refreshed = profile ? refreshLinkedSketchProjections(profile, shapes, constructionPlaneId, projectionPose) : emptySketchProfile();
    const initial = cloneSketchProfile(solveSketchProfile(refreshed).profile);
    setWorkplaneMode(false);
    setActiveSketchWorkplane(sketchWorkplane);
    setToolbarMode("sketch");
    setSketchActive(true);
    setSketchOperation(operation);
    setSketchRevolveSettings(normalizeSketchRevolveSettings(revolveSettings));
    setSketchRevolvePreview(null);
    setSketchTool(profile?.segments.length ? "select" : "line");
    setSketchProfile(initial);
    const initialHistory = [cloneSketchProfile(initial)];
    sketchHistoryRef.current = initialHistory;
    sketchHistoryIndexRef.current = 0;
    setSketchHistory(initialHistory);
    setSketchHistoryIndex(0);
    setSketchActivePointId(null);
    setSketchSelection(null);
    const editingFeature = editingId ? shapes.find((shape) => shape.id === editingId)?.sketchFeature : undefined;
    const storedRegionIds = editingFeature?.kind === "extrusion" ? editingFeature.regionIds : undefined;
    let initialRegionIds: string[] | null = storedRegionIds ? [...storedRegionIds] : null;
    if (storedRegionIds) {
      try {
        const availableIds = cadSketchRegions(initial).map((region) => region.id);
        if (storedRegionIds.length === availableIds.length && availableIds.every((id) => storedRegionIds.includes(id))) initialRegionIds = null;
      } catch {
        initialRegionIds = [...storedRegionIds];
      }
    }
    setSketchExtrusionRegionIds(operation === "extrude" ? initialRegionIds : null);
    setSketchMeasureStart(null);
    setSketchMeasurement(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchCommand(null);
    setSketchConstructionPlaneId(constructionPlaneId);
    setEditingSketchShapeId(editingId);
    const planeName = constructionPlaneId === BASE_CONSTRUCTION_PLANE_ID
      ? placementWorkplaneIsBase(sketchWorkplane) ? "base plane" : "placement workplane"
      : constructionPlanes.find((plane) => plane.id === constructionPlaneId)?.name ?? "construction plane";
    const operationName = operation === "revolve" ? "revolve sketch" : "sketch";
    setNotice(editingId ? `Editing ${operationName} on ${planeName}` : operation === "revolve" ? `Revolve sketch started on ${planeName}: draw on the left side of the axis` : `Sketch started on ${planeName}: place the first point`);
  }, [activeConstructionPlaneId, constructionPlanes, shapes]);

  const beginSketchEdit = useCallback(() => {
    if (selectedShapes.length !== 1 || !selectedShape?.sketchProfile) {
      setNotice("Select one shape created from a sketch to edit it");
      return;
    }
    const operation = selectedShape.sketchOperation ?? (selectedShape.sketchRevolve ? "revolve" : "extrude");
    const constructionPlaneId = selectedShape.sketchPlane?.constructionPlaneId ?? BASE_CONSTRUCTION_PLANE_ID;
    let editWorkplane: PlacementWorkplane | undefined;
    if (operation === "extrude") {
      const quaternion = quaternionForShape(selectedShape);
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
      const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
      const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
      const points = selectedShape.sketchProfile.points;
      const profileCenterX = points.length
        ? (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2
        : 0;
      const profileCenterZ = points.length
        ? (Math.min(...points.map((point) => point.z)) + Math.max(...points.map((point) => point.z))) / 2
        : 0;
      const origin = new THREE.Vector3(
        selectedShape.x,
        (selectedShape.elevation ?? 0) + selectedShape.height / 2,
        selectedShape.z,
      )
        .addScaledVector(normal, -selectedShape.height / 2)
        .addScaledVector(xAxis, -profileCenterX)
        .addScaledVector(zAxis, -profileCenterZ);
      editWorkplane = placementWorkplaneFromSurface(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: normal.x, y: normal.y, z: normal.z },
        { x: xAxis.x, y: xAxis.y, z: xAxis.z },
      );
    }
    beginSketch(operation, selectedShape.sketchProfile, selectedShape.id, selectedShape.sketchRevolve, constructionPlaneId, editWorkplane);
  }, [beginSketch, selectedShape, selectedShapes.length]);

  const cancelSketch = useCallback(() => {
    setSketchActive(false);
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchExtrusionRegionIds(null);
    setSketchMeasureStart(null);
    setSketchMeasurement(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchCommand(null);
    setEditingSketchShapeId(null);
    setSketchRevolvePreview(null);
    setNotice("Sketch cancelled");
  }, []);

  const sketchUndo = useCallback(() => {
    const currentHistory = sketchHistoryRef.current;
    const currentIndex = sketchHistoryIndexRef.current;
    if (currentIndex <= 0) {
      setNotice("Nothing to undo in this sketch");
      return;
    }
    const nextIndex = currentIndex - 1;
    sketchHistoryIndexRef.current = nextIndex;
    setSketchHistoryIndex(nextIndex);
    setSketchProfile(cloneSketchProfile(currentHistory[nextIndex] ?? emptySketchProfile()));
    setSketchActivePointId(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchSelection(null);
    setNotice("Sketch undo");
  }, []);

  const sketchRedo = useCallback(() => {
    const currentHistory = sketchHistoryRef.current;
    const currentIndex = sketchHistoryIndexRef.current;
    if (currentIndex >= currentHistory.length - 1) {
      setNotice("Nothing to redo in this sketch");
      return;
    }
    const nextIndex = currentIndex + 1;
    sketchHistoryIndexRef.current = nextIndex;
    setSketchHistoryIndex(nextIndex);
    setSketchProfile(cloneSketchProfile(currentHistory[nextIndex] ?? emptySketchProfile()));
    setSketchActivePointId(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchSelection(null);
    setNotice("Sketch redo");
  }, []);

  const setActiveSketchTool = useCallback((tool: SketchTool) => {
    setSketchTool(tool);
    setSketchActivePointId(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchSelection(null);
    if (tool !== "measure") {
      setSketchMeasureStart(null);
      setSketchMeasurement(null);
    }
    const messages: Record<SketchTool, string> = {
      line: "Line: click points to draw straight segments",
      bezier: "Bézier: click and drag points to pull curve handles",
      smooth: "Smooth curve: click points to build a flowing path",
      "circle-center": "Center circle: choose the center, then a radius point",
      "circle-diameter": "Two-point circle: choose opposite points on the diameter",
      "rect-corner": "Rectangle: click one corner, then the opposite corner",
      "rect-center": "Center rectangle: click the center, then a corner",
      "poly-inscribed": "Inscribed polygon: click center, then a vertex",
      "poly-circumscribed": "Circumscribed polygon: click center, then an edge midpoint",
      "poly-edge": "Edge polygon: click two adjacent vertices",
      text: "Text: click to place a text annotation on the sketch",
      select: "Select: edit sketch geometry or place and scale reference images",
      refine: "Refine: click a segment to add a point, or a point to remove it",
      erase: "Erase: click a point or segment to remove it",
      dimension: "Dimension: choose a line, then type its driving length",
      measure: "Measure: choose two points",
    };
    setNotice(messages[tool]);
  }, []);

  const measureSketchPoint = useCallback(
    (point: SketchPoint) => {
      if (!sketchMeasureStart) {
        setSketchMeasureStart({ ...point });
        setSketchMeasurement(null);
        setNotice("Choose the second measurement point");
        return;
      }
      const measurement = { start: { ...sketchMeasureStart }, end: { ...point } };
      setSketchMeasurement(measurement);
      setSketchMeasureStart(null);
      setNotice(`Measured ${Number(Math.hypot(measurement.end.x - measurement.start.x, measurement.end.z - measurement.start.z).toFixed(2))} mm`);
    },
    [sketchMeasureStart],
  );

  const clearSketchMeasurement = useCallback(() => {
    setSketchMeasureStart(null);
    setSketchMeasurement(null);
    setNotice("Sketch measurement removed");
  }, []);

  const connectSketchPoint = useCallback(
    (pointId: string, profile = sketchProfile) => {
      if (!["line", "bezier", "smooth"].includes(sketchTool)) return profile;
      const curveKind = sketchTool as NonNullable<SketchSegment["kind"]>;
      if (!sketchActivePointId) {
        setSketchActivePointId(pointId);
        setSketchSelection({ kind: "point", id: pointId });
        return profile;
      }
      if (sketchActivePointId === pointId) return profile;
      const duplicate = profile.segments.some(
        (segment) =>
          (segment.startId === sketchActivePointId && segment.endId === pointId) ||
          (segment.startId === pointId && segment.endId === sketchActivePointId),
      );
      const next = duplicate
        ? profile
        : {
            ...profile,
            segments: [...profile.segments, { id: createLocalId("sketch-segment"), startId: sketchActivePointId, endId: pointId, kind: curveKind }],
          };
      const smoothed = sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
      const closed = orderedSketchPaths(smoothed).some((path) => path.closed && path.steps.some((step) => step.segment.startId === sketchActivePointId || step.segment.endId === sketchActivePointId));
      if (!duplicate) commitSketchProfile(smoothed, closed ? "Profile closed—edit the path or finish the sketch" : "Sketch segment added");
      setSketchActivePointId(closed ? null : pointId);
      setSketchSelection({ kind: "point", id: pointId });
      if (closed) setSketchTool("select");
      return smoothed;
    },
    [commitSketchProfile, sketchActivePointId, sketchProfile, sketchTool],
  );

  const addSketchPlanePoint = useCallback(
    (position: { x: number; z: number }, handles?: { handleIn: { x: number; z: number }; handleOut: { x: number; z: number } }) => {
      if (sketchTool === "measure") {
        measureSketchPoint({ id: "measure", ...position });
        return;
      }
      if (sketchTool === "circle-center" || sketchTool === "circle-diameter") {
        if (!sketchCircleDraft || sketchCircleDraft.tool !== sketchTool) {
          setSketchCircleDraft({ tool: sketchTool, first: position });
          setSketchSelection(null);
          setNotice(sketchTool === "circle-center" ? "Choose a point on the circle" : "Choose the opposite diameter point");
          return;
        }
        const { center, radius } = circleFromPoints(
          sketchTool === "circle-center" ? "center-radius" : "diameter",
          sketchCircleDraft.first,
          position,
        );
        if (radius < 0.0001) {
          setNotice("Circle radius must be greater than zero");
          return;
        }
        const circle = circleSketchGeometry(center, radius);
        const next: SketchProfile = {
          ...sketchProfile,
          points: [...sketchProfile.points, ...circle.points],
          segments: [...sketchProfile.segments, ...circle.segments],
        };
        commitSketchProfile(next, sketchTool === "circle-center" ? "Center circle added" : "Two-point circle added");
        setSketchCircleDraft(null);
        setSketchSelection({
          kind: "multiple",
          pointIds: circle.points.map((point) => point.id),
          segmentIds: circle.segments.map((segment) => segment.id),
        });
        return;
      }
      if (sketchTool === "rect-corner" || sketchTool === "rect-center") {
        if (!sketchRectDraft || sketchRectDraft.tool !== sketchTool) {
          setSketchRectDraft({ tool: sketchTool, first: position });
          setSketchSelection(null);
          setNotice(sketchTool === "rect-corner" ? "Choose the opposite corner" : "Choose a corner point");
          return;
        }
        const bounds = rectFromPoints(
          sketchTool === "rect-corner" ? "corner" : "center",
          sketchRectDraft.first,
          position,
        );
        if (bounds.width < 0.0001 || bounds.height < 0.0001) {
          setNotice("Rectangle must have non-zero width and height");
          return;
        }
        const rect = rectangleSketchGeometry(bounds);
        const next: SketchProfile = {
          ...sketchProfile,
          points: [...sketchProfile.points, ...rect.points],
          segments: [...sketchProfile.segments, ...rect.segments],
          constraints: [
            ...(sketchProfile.constraints ?? []),
            ...rect.segments.map((segment, index) => ({
              id: createLocalId(index % 2 === 0 ? "sketch-horizontal" : "sketch-vertical"),
              kind: index % 2 === 0 ? "horizontal" as const : "vertical" as const,
              segmentId: segment.id,
            })),
          ],
        };
        commitSketchProfile(next, "Rectangle added");
        setSketchRectDraft(null);
        setSketchSelection({
          kind: "multiple",
          pointIds: rect.points.map((point) => point.id),
          segmentIds: rect.segments.map((segment) => segment.id),
        });
        return;
      }
      if (sketchTool === "poly-inscribed" || sketchTool === "poly-circumscribed" || sketchTool === "poly-edge") {
        if (!sketchPolygonDraft || sketchPolygonDraft.tool !== sketchTool) {
          setSketchPolygonDraft({ tool: sketchTool, first: position, sides: sketchPolygonSides });
          setSketchSelection(null);
          setNotice(sketchTool === "poly-edge" ? "Choose the second vertex" : "Choose a defining point");
          return;
        }
        const mode = sketchTool === "poly-inscribed" ? "inscribed" : sketchTool === "poly-circumscribed" ? "circumscribed" : "edge";
        const { center, circumR, startAngle } = polygonFromPoints(mode, sketchPolygonDraft.sides, sketchPolygonDraft.first, position);
        if (circumR < 0.0001) {
          setNotice("Polygon radius must be greater than zero");
          return;
        }
        const polygon = polygonSketchGeometry(center, circumR, startAngle, sketchPolygonDraft.sides);
        const next: SketchProfile = {
          ...sketchProfile,
          points: [...sketchProfile.points, ...polygon.points],
          segments: [...sketchProfile.segments, ...polygon.segments],
        };
        commitSketchProfile(next, `${sketchPolygonDraft.sides}-sided polygon added`);
        setSketchPolygonDraft(null);
        setSketchSelection({
          kind: "multiple",
          pointIds: polygon.points.map((point) => point.id),
          segmentIds: polygon.segments.map((segment) => segment.id),
        });
        return;
      }
      if (sketchTool === "text") {
        setSketchTextDraft({ tool: "text", position });
        setNotice("Type text and press Enter to confirm");
        return;
      }
      if (!["line", "bezier", "smooth"].includes(sketchTool)) return;
      const curveKind = sketchTool as NonNullable<SketchSegment["kind"]>;
      const existing = sketchProfile.points.find((point) => Math.hypot(point.x - position.x, point.z - position.z) < 0.0001);
      if (existing) {
        connectSketchPoint(existing.id);
        return;
      }
      const point: SketchPoint = {
        id: createLocalId("sketch-point"),
        ...position,
        ...(handles ?? {}),
        mode: sketchTool === "line" ? "corner" : sketchTool === "smooth" ? "smooth" : handles ? "smooth" : "corner",
      };
      const next: SketchProfile = { ...sketchProfile, points: [...sketchProfile.points, point] };
      if (sketchActivePointId) {
        next.segments = [...next.segments, { id: createLocalId("sketch-segment"), startId: sketchActivePointId, endId: point.id, kind: curveKind }];
      }
      const prepared = sketchTool === "smooth" ? withSmoothSketchHandles(next) : next;
      commitSketchProfile(prepared, sketchActivePointId ? "Sketch point and segment added" : "Sketch point added");
      setSketchActivePointId(point.id);
      setSketchSelection({ kind: "point", id: point.id });
    },
    [commitSketchProfile, connectSketchPoint, measureSketchPoint, sketchActivePointId, sketchCircleDraft, sketchPolygonDraft, sketchPolygonSides, sketchProfile, sketchRectDraft, sketchTool],
  );

  const pressSketchPoint = useCallback(
    (id: string) => {
      const point = sketchProfile.points.find((entry) => entry.id === id);
      if (!point) return;
      if (sketchTool === "measure") {
        measureSketchPoint(point);
        setSketchSelection({ kind: "point", id });
        return;
      }
      if (sketchTool === "select") {
        setSketchSelection({ kind: "point", id });
        setSketchActivePointId(null);
        return;
      }
      if (["circle-center", "circle-diameter", "rect-corner", "rect-center", "poly-inscribed", "poly-circumscribed", "poly-edge", "text"].includes(sketchTool)) {
        addSketchPlanePoint({ x: point.x, z: point.z });
        return;
      }
      connectSketchPoint(id);
    },
    [addSketchPlanePoint, connectSketchPoint, measureSketchPoint, sketchProfile.points, sketchTool],
  );

  const deleteSketchPoint = useCallback(
    (id: string) => {
      const connected = sketchProfile.segments.filter((segment) => segment.startId === id || segment.endId === id);
      const neighboringIds = connected.map((segment) => segment.startId === id ? segment.endId : segment.startId);
      const remainingSegments = sketchProfile.segments.filter((segment) => segment.startId !== id && segment.endId !== id);
      if (neighboringIds.length === 2 && neighboringIds[0] !== neighboringIds[1]) {
        const duplicate = remainingSegments.some((segment) =>
          (segment.startId === neighboringIds[0] && segment.endId === neighboringIds[1]) ||
          (segment.startId === neighboringIds[1] && segment.endId === neighboringIds[0]),
        );
        if (!duplicate) {
          remainingSegments.push({
            id: createLocalId("sketch-segment"),
            startId: neighboringIds[0],
            endId: neighboringIds[1],
            kind: connected.every((segment) => segment.kind === "line") ? "line" : connected.some((segment) => segment.kind === "smooth") ? "smooth" : "bezier",
          });
        }
      }
      const next = pruneSketchParameters({
        ...sketchProfile,
        points: sketchProfile.points.filter((point) => point.id !== id),
        segments: remainingSegments,
      });
      commitSketchProfile(next.segments.some((segment) => segment.kind === "smooth") ? withSmoothSketchHandles(next) : next, "Sketch point removed");
      if (sketchActivePointId === id) setSketchActivePointId(null);
      setSketchSelection(null);
    },
    [commitSketchProfile, sketchActivePointId, sketchProfile],
  );

  const deleteSketchSegment = useCallback(
    (id: string) => {
      commitSketchProfile(pruneSketchParameters({ ...sketchProfile, segments: sketchProfile.segments.filter((segment) => segment.id !== id) }), "Sketch line removed");
      setSketchActivePointId(null);
      setSketchSelection(null);
    },
    [commitSketchProfile, sketchProfile],
  );

  const updateSketchImage = useCallback((id: string, patch: Partial<SketchImage>, message = "Sketch image updated") => {
    const image = (sketchProfile.images ?? []).find((entry) => entry.id === id);
    if (!image) return;
    commitSketchProfile({
      ...sketchProfile,
      images: (sketchProfile.images ?? []).map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
    }, message);
    setSketchSelection({ kind: "image", id });
    setSketchActivePointId(null);
  }, [commitSketchProfile, sketchProfile]);

  const deleteSketchImage = useCallback((id: string) => {
    if (!(sketchProfile.images ?? []).some((image) => image.id === id)) return;
    commitSketchProfile({
      ...sketchProfile,
      images: (sketchProfile.images ?? []).filter((image) => image.id !== id),
    }, "Sketch image removed");
    setSketchSelection(null);
  }, [commitSketchProfile, sketchProfile]);

  const addSketchImageFile = useCallback(async (file: File) => {
    if (!sketchActive || sketchTool !== "select") {
      setNotice("Choose Select before adding a sketch image");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setNotice("Choose a PNG, JPG, WebP, GIF, or other image file");
      return;
    }
    try {
      const prepared = await prepareImportedImage(file);
      const dimensions = imagePlateDimensions(prepared.pixelWidth, prepared.pixelHeight);
      const image: SketchImage = {
        id: createLocalId("sketch-image"),
        name: file.name.replace(/\.[^.]+$/, "") || "Sketch image",
        ...prepared,
        x: 0,
        z: 0,
        width: dimensions.width,
        depth: dimensions.depth,
        opacity: 0.55,
        lockAspect: true,
      };
      commitSketchProfile({ ...sketchProfile, images: [...(sketchProfile.images ?? []), image] }, `Added ${file.name} to the sketch`);
      setSketchSelection({ kind: "image", id: image.id });
      setSketchActivePointId(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The sketch image could not be added");
    }
  }, [commitSketchProfile, sketchActive, sketchProfile, sketchTool]);

  const deleteSelectedSketchEntity = useCallback(() => {
    if (!sketchSelection) {
      setNotice("Select a sketch point or segment to remove it");
      return;
    }
    if (sketchSelection.kind === "point") deleteSketchPoint(sketchSelection.id);
    else if (sketchSelection.kind === "segment") deleteSketchSegment(sketchSelection.id);
    else if (sketchSelection.kind === "image") deleteSketchImage(sketchSelection.id);
    else if (sketchSelection.kind === "text") {
      commitSketchProfile({
        ...sketchProfile,
        texts: (sketchProfile.texts ?? []).filter((t) => t.id !== sketchSelection.id),
      }, "Selected text removed");
      setSketchActivePointId(null);
      setSketchSelection(null);
    } else {
      const pointIds = new Set(sketchSelection.pointIds);
      const segmentIds = new Set(sketchSelection.segmentIds);
      const imageIds = new Set(sketchSelection.imageIds ?? []);
      const textIds = new Set(sketchSelection.textIds ?? []);
      commitSketchProfile(pruneSketchParameters({
        ...sketchProfile,
        points: sketchProfile.points.filter((point) => !pointIds.has(point.id)),
        segments: sketchProfile.segments.filter((segment) => !segmentIds.has(segment.id) && !pointIds.has(segment.startId) && !pointIds.has(segment.endId)),
        images: (sketchProfile.images ?? []).filter((image) => !imageIds.has(image.id)),
        texts: (sketchProfile.texts ?? []).filter((text) => !textIds.has(text.id)),
      }), "Selected sketch geometry removed");
      setSketchActivePointId(null);
      setSketchSelection(null);
    }
  }, [commitSketchProfile, deleteSketchImage, deleteSketchPoint, deleteSketchSegment, sketchProfile, sketchSelection]);

  const moveSketchPoint = useCallback((id: string, position: { x: number; z: number }) => {
    if ((sketchProfile.constraints ?? []).some((constraint) => constraint.kind === "fixed" && constraint.pointId === id)) {
      setNotice("Fixed points cannot be moved");
      return;
    }
    const result = moveConstrainedSketchPoint(sketchProfile, id, position);
    commitSketchProfile(result.profile, result.conflicts.length ? "Point moved with constraint conflicts" : "Sketch point moved");
  }, [commitSketchProfile, sketchProfile]);

  const moveSketchPoints = useCallback((ids: string[], delta: { x: number; z: number }) => {
    const pointIds = new Set(ids);
    if (sketchProfile.points.some((point) => pointIds.has(point.id) && point.projectionId)) {
      setNotice("Projected profiles cannot be moved");
      return;
    }
    if ((sketchProfile.constraints ?? []).some((constraint) => constraint.kind === "fixed" && pointIds.has(constraint.pointId))) {
      setNotice("Profiles with fixed points cannot be moved");
      return;
    }
    commitSketchProfile(translateSketchPoints(sketchProfile, ids, delta), "Sketch profile moved");
  }, [commitSketchProfile, sketchProfile]);

  const moveSketchDimension = useCallback((segmentId: string, offset: { x: number; z: number }) => {
    if (!sketchProfile.segments.some((segment) => segment.id === segmentId)) return;
    commitSketchProfile({
      ...sketchProfile,
      segments: sketchProfile.segments.map((segment) => segment.id === segmentId
        ? { ...segment, dimensionLabelOffset: { ...offset } }
        : segment),
    }, "Dimension moved");
    setSketchSelection({ kind: "segment", id: segmentId });
  }, [commitSketchProfile, sketchProfile]);

  const toggleSketchPointFixed = useCallback((id: string) => {
    const fixed = (sketchProfile.constraints ?? []).some((constraint) => constraint.kind === "fixed" && constraint.pointId === id);
    const result = setSketchPointFixed(sketchProfile, id, !fixed, createLocalId);
    commitSketchProfile(result.profile, fixed ? "Point released" : "Point fixed");
    setSketchSelection({ kind: "point", id });
  }, [commitSketchProfile, sketchProfile]);

  const toggleSketchSegmentConstraint = useCallback((id: string, kind: "horizontal" | "vertical") => {
    const enabled = !(sketchProfile.constraints ?? []).some((constraint) => constraint.kind === kind && constraint.segmentId === id);
    const result = setSketchSegmentConstraint(sketchProfile, id, kind, enabled, createLocalId);
    commitSketchProfile(result.profile, `${kind === "horizontal" ? "Horizontal" : "Vertical"} constraint ${enabled ? "added" : "removed"}`);
    setSketchSelection({ kind: "segment", id });
  }, [commitSketchProfile, sketchProfile]);

  const updateSketchSegmentLength = useCallback((id: string, value: number | null) => {
    const result = setSketchSegmentLength(sketchProfile, id, value, createLocalId);
    commitSketchProfile(result.profile, value === null ? "Driving length removed" : result.conflicts.length ? "Length updated with constraint conflicts" : "Driving length updated");
    setSketchSelection({ kind: "segment", id });
  }, [commitSketchProfile, sketchProfile]);

  const addSketchDistanceDimension = useCallback((start: SketchDimensionAnchor, end: SketchDimensionAnchor) => {
    const value = sketchDistanceDimensionValue(sketchProfile, start, end);
    if (value === null || value < 0.0001) {
      setNotice("Choose two different dimension anchors");
      return;
    }
    const key = [sketchDimensionAnchorKey(start), sketchDimensionAnchorKey(end)].sort().join("|");
    const duplicate = (sketchProfile.dimensions ?? []).some((dimension) => dimension.kind === "distance"
      && [sketchDimensionAnchorKey(dimension.start), sketchDimensionAnchorKey(dimension.end)].sort().join("|") === key);
    if (duplicate) {
      setNotice("That reference dimension already exists");
      return;
    }
    commitSketchProfile({
      ...sketchProfile,
      dimensions: [...(sketchProfile.dimensions ?? []), { id: createLocalId("sketch-distance"), kind: "distance", start, end }],
    }, "Reference dimension added");
    setSketchSelection(null);
  }, [commitSketchProfile, sketchProfile]);

  const deleteSketchDimension = useCallback((id: string) => {
    if (!(sketchProfile.dimensions ?? []).some((dimension) => dimension.id === id)) return;
    commitSketchProfile({ ...sketchProfile, dimensions: (sketchProfile.dimensions ?? []).filter((dimension) => dimension.id !== id) }, "Dimension removed");
  }, [commitSketchProfile, sketchProfile]);

  const moveSketchHandle = useCallback((id: string, handle: "in" | "out", position: { x: number; z: number }) => {
    const next = cloneSketchProfile(sketchProfile);
    const point = next.points.find((entry) => entry.id === id);
    if (!point) return;
    if (handle === "in") point.handleIn = { ...position };
    else point.handleOut = { ...position };
    if (point.mode === "smooth") {
      const opposite = { x: point.x * 2 - position.x, z: point.z * 2 - position.z };
      if (handle === "in") point.handleOut = opposite;
      else point.handleIn = opposite;
    }
    commitSketchProfile(next, "Curve handle adjusted");
  }, [commitSketchProfile, sketchProfile]);

  const setSketchPointMode = useCallback((id: string, mode: "corner" | "smooth" | "split") => {
    let next = cloneSketchProfile(sketchProfile);
    const point = next.points.find((entry) => entry.id === id);
    if (!point) return;
    point.mode = mode;
    if (mode === "corner") {
      point.handleIn = undefined;
      point.handleOut = undefined;
      next.segments = next.segments.map((segment) => segment.startId === id || segment.endId === id ? { ...segment, kind: "line" } : segment);
    } else {
      next.segments = next.segments.map((segment) => segment.startId === id || segment.endId === id ? { ...segment, kind: "bezier" } : segment);
      if (!point.handleIn || !point.handleOut) next = withSmoothSketchHandles(next);
      const updated = next.points.find((entry) => entry.id === id);
      if (updated) updated.mode = mode;
    }
    commitSketchProfile(next, mode === "corner" ? "Made corner" : mode === "smooth" ? "Made smooth" : "Curve handles split");
  }, [commitSketchProfile, sketchProfile]);

  const insertSketchPoint = useCallback((segmentId: string, position: { x: number; z: number }) => {
    const segment = sketchProfile.segments.find((entry) => entry.id === segmentId);
    if (!segment) return;
    const point: SketchPoint = { id: createLocalId("sketch-point"), ...position, mode: segment.kind === "line" ? "corner" : "smooth" };
    let next: SketchProfile = pruneSketchParameters({
      ...sketchProfile,
      points: [...sketchProfile.points, point],
      segments: sketchProfile.segments.flatMap((entry) => entry.id === segmentId ? [
        { ...entry, id: createLocalId("sketch-segment"), endId: point.id },
        { ...entry, id: createLocalId("sketch-segment"), startId: point.id },
      ] : [entry]),
    });
    if (segment.kind === "smooth") next = withSmoothSketchHandles(next);
    commitSketchProfile(next, "Point added to path");
    setSketchSelection({ kind: "point", id: point.id });
    setSketchTool("select");
  }, [commitSketchProfile, sketchProfile]);

  const openSketchCommand = useCallback((command: SketchCommandKind) => {
    if (command === "project") {
      setSketchTool("select");
      setSketchActivePointId(null);
      setSketchCircleDraft(null);
      setSketchRectDraft(null);
      setSketchPolygonDraft(null);
      setSketchTextDraft(null);
      setSketchCommand(command);
      return;
    }
    if (sketchTool !== "select") {
      setNotice("Choose Select and select sketch geometry first");
      return;
    }
    if (!sketchSelection) {
      setNotice(command === "sweep" ? "Select one closed profile and one open path first" : "Select sketch geometry first");
      return;
    }
    setSketchCommand(command);
  }, [sketchSelection, sketchTool]);

  const selectGeneratedSketchEntities = useCallback((selection: SketchTransformSelection) => {
    setSketchSelection({ kind: "multiple", ...selection });
    setSketchActivePointId(null);
  }, []);

  const applySketchProject = useCallback((options: SketchProjectCommandOptions) => {
    const source = shapes.find((shape) => shape.id === options.sourceShapeId && shape.kind !== "constructionPlane" && shape.id !== editingSketchShapeId);
    if (!source) {
      setNotice("Choose an available sketch or shape to project");
      return;
    }
    if (options.linked && (sketchProfile.projections ?? []).some((projection) => projection.sourceShapeId === source.id)) {
      setNotice(`${source.name} is already linked to this sketch`);
      return;
    }
    const projectionId = options.linked ? createLocalId("sketch-projection") : undefined;
    let projected: SketchProjectionResult;
    try {
      projected = projectShapeToSketchPlane(
        source,
        shapes,
        constructionPlanePoseById(sketchConstructionPlaneId, shapes),
        projectionId,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The source could not be projected into this sketch");
      return;
    }
    if (!projected.segments.length) {
      setNotice(source.sketchProfile ? "The source sketch collapses in this projection" : "The shape does not intersect the active sketch plane");
      return;
    }
    const next: SketchProfile = {
      ...sketchProfile,
      points: [...sketchProfile.points, ...projected.points],
      segments: [...sketchProfile.segments, ...projected.segments],
      projections: projectionId ? [
        ...(sketchProfile.projections ?? []),
        { id: projectionId, sourceShapeId: source.id, sourceName: source.name, sourceKind: source.sketchProfile ? "sketch" : "intersection" },
      ] : sketchProfile.projections,
    };
    commitSketchProfile(next, `${options.linked ? "Linked" : "Copied"} projection from ${source.name}`);
    if (options.linked) setSketchSelection(null);
    else selectGeneratedSketchEntities({
      pointIds: projected.points.map((point) => point.id),
      segmentIds: projected.segments.map((segment) => segment.id),
      imageIds: [],
      textIds: [],
    });
    setSketchCommand(null);
  }, [commitSketchProfile, editingSketchShapeId, selectGeneratedSketchEntities, shapes, sketchConstructionPlaneId, sketchProfile]);

  const applySketchOffset = useCallback((options: SketchOffsetCommandOptions) => {
    const source = sketchTransformSelection(sketchSelection);
    if (!source.segmentIds.length) {
      setNotice("Select at least one sketch segment to offset");
      return;
    }
    let result: ReturnType<typeof offsetSketchSegments>;
    try {
      result = offsetSketchSegments(sketchProfile, source.segmentIds, options.distance, { includeConnected: options.includeConnected });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The selected sketch path cannot be offset");
      return;
    }
    commitSketchProfile(result.profile, `Created ${options.distance} mm sketch offset`);
    selectGeneratedSketchEntities({ pointIds: result.pointIds, segmentIds: result.segmentIds, imageIds: [], textIds: [] });
    setSketchCommand(null);
  }, [commitSketchProfile, selectGeneratedSketchEntities, sketchProfile, sketchSelection]);

  const applySketchMirror = useCallback((options: SketchMirrorOptions) => {
    let source = sketchTransformSelection(sketchSelection);
    let lineStart = { x: 0, z: 0 };
    let lineEnd = options.axis === "x" ? { x: 1, z: 0 } : { x: 0, z: 1 };
    if (options.axis === "segment") {
      const reference = sketchProfile.segments.find((segment) => segment.id === options.segmentId);
      const start = reference ? sketchProfile.points.find((point) => point.id === reference.startId) : null;
      const end = reference ? sketchProfile.points.find((point) => point.id === reference.endId) : null;
      if (!reference || !start || !end) {
        setNotice("Choose a selected line as the mirror axis");
        return;
      }
      source = withoutSketchReferenceSegment(sketchProfile, source, reference.id);
      lineStart = start;
      lineEnd = end;
    }
    if (!hasSketchTransformSelection(source)) {
      setNotice("Select geometry in addition to the mirror axis");
      return;
    }
    const result = transformSketchSelection(sketchProfile, source, [reflectionTransform(lineStart, lineEnd)]);
    commitSketchProfile(result.profile, "Mirrored sketch geometry");
    selectGeneratedSketchEntities(result.selection);
    setSketchCommand(null);
  }, [commitSketchProfile, selectGeneratedSketchEntities, sketchProfile, sketchSelection]);

  const applySketchRectangularPattern = useCallback((options: SketchRectangularPatternOptions) => {
    const columns = Math.max(1, Math.min(20, Math.round(options.columns)));
    const rows = Math.max(1, Math.min(20, Math.round(options.rows)));
    if (columns * rows < 2) {
      setNotice("A rectangular pattern needs at least two instances");
      return;
    }
    let source = sketchTransformSelection(sketchSelection);
    let columnX = 1;
    let columnZ = 0;
    if (options.segmentId) {
      const reference = sketchProfile.segments.find((segment) => segment.id === options.segmentId);
      const start = reference ? sketchProfile.points.find((point) => point.id === reference.startId) : null;
      const end = reference ? sketchProfile.points.find((point) => point.id === reference.endId) : null;
      if (!reference || !start || !end) {
        setNotice("Choose a selected line for the pattern direction");
        return;
      }
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < 0.0001) {
        setNotice("The pattern direction line is too short");
        return;
      }
      source = withoutSketchReferenceSegment(sketchProfile, source, reference.id);
      columnX = (end.x - start.x) / length;
      columnZ = (end.z - start.z) / length;
    }
    if (!hasSketchTransformSelection(source)) {
      setNotice("Select geometry in addition to the direction line");
      return;
    }
    const rowX = -columnZ;
    const rowZ = columnX;
    const transforms = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (row === 0 && column === 0) continue;
        transforms.push(translationTransform(
          column * options.columnSpacing * columnX + row * options.rowSpacing * rowX,
          column * options.columnSpacing * columnZ + row * options.rowSpacing * rowZ,
        ));
      }
    }
    const result = transformSketchSelection(sketchProfile, source, transforms);
    commitSketchProfile(result.profile, `Created ${columns} × ${rows} rectangular pattern`);
    selectGeneratedSketchEntities(result.selection);
    setSketchCommand(null);
  }, [commitSketchProfile, selectGeneratedSketchEntities, sketchProfile, sketchSelection]);

  const applySketchCircularPattern = useCallback((options: SketchCircularPatternOptions) => {
    const count = Math.max(2, Math.min(40, Math.round(options.count)));
    const angle = Math.max(-360, Math.min(360, options.angle));
    if (Math.abs(angle) < 0.001) {
      setNotice("The circular pattern angle must be non-zero");
      return;
    }
    let source = sketchTransformSelection(sketchSelection);
    let center = { x: 0, z: 0 };
    if (options.pointId) {
      const point = sketchProfile.points.find((candidate) => candidate.id === options.pointId);
      if (!point) {
        setNotice("Choose a selected point as the pattern center");
        return;
      }
      center = point;
      source = { ...source, pointIds: source.pointIds.filter((id) => id !== point.id) };
    }
    if (!hasSketchTransformSelection(source)) {
      setNotice("Select geometry in addition to the center point");
      return;
    }
    const fullCircle = Math.abs(Math.abs(angle) - 360) < 0.001;
    const step = (angle * Math.PI / 180) / (fullCircle ? count : count - 1);
    const transforms = Array.from({ length: count - 1 }, (_, index) => rotationTransform(step * (index + 1), center));
    const result = transformSketchSelection(sketchProfile, source, transforms);
    commitSketchProfile(result.profile, `Created ${count}-instance circular pattern`);
    selectGeneratedSketchEntities(result.selection);
    setSketchCommand(null);
  }, [commitSketchProfile, selectGeneratedSketchEntities, sketchProfile, sketchSelection]);

  const createSketchSweep = useCallback(() => {
    const source = sketchTransformSelection(sketchSelection);
    const existing = editingSketchShapeId ? shapes.find((shape) => shape.id === editingSketchShapeId) ?? null : null;
    setNotice("Building sketch sweep…");
    let swept: WorkplaneShape;
    try {
      swept = shapeFromSketchSweep(sketchProfile, source.segmentIds, existing);
      swept = sketchShapeWithPlanePose(swept, sketchConstructionPlaneId, constructionPlanePoseById(sketchConstructionPlaneId, shapes, existing?.sketchPlane?.pose), existing?.sketchPlane?.localCenter);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The selected geometry cannot be swept");
      return;
    }
    const nextShapes = existing ? shapes.map((shape) => shape.id === existing.id ? swept : shape) : [...shapes, swept];
    commitShapes(nextShapes, swept.id, existing ? "Sketch sweep updated" : "Sketch sweep created");
    setSketchCommand(null);
    setSketchActive(false);
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setEditingSketchShapeId(null);
    setToolbarMode("geometry");
  }, [commitShapes, editingSketchShapeId, shapes, sketchConstructionPlaneId, sketchProfile, sketchSelection]);

  const finishSketch = useCallback(async () => {
    const existing = editingSketchShapeId ? shapes.find((shape) => shape.id === editingSketchShapeId) ?? null : null;
    const projectionPose = sketchConstructionPlaneId === BASE_CONSTRUCTION_PLANE_ID && !placementWorkplaneIsBase(activeSketchWorkplane)
      ? constructionPlanePoseForPlacementWorkplane(activeSketchWorkplane)
      : undefined;
    const refreshedProfile = refreshLinkedSketchProjections(sketchProfile, shapes, sketchConstructionPlaneId, projectionPose);
    if (existing?.sketchFeature?.kind === "sweep") {
      setNotice("Rebuilding sketch sweep…");
      let swept: WorkplaneShape;
      try {
        swept = shapeFromSketchSweep(
          refreshedProfile,
          [...existing.sketchFeature.sectionSegmentIds, ...existing.sketchFeature.pathSegmentIds],
          existing,
        );
        swept = sketchShapeWithPlanePose(swept, sketchConstructionPlaneId, constructionPlanePoseById(sketchConstructionPlaneId, shapes, existing.sketchPlane?.pose), existing.sketchPlane?.localCenter);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The sweep profile cannot be converted to 3D");
        return;
      }
      commitShapes(shapes.map((shape) => shape.id === existing.id ? swept : shape), swept.id, "Sketch sweep updated");
      setSketchActive(false);
      setSketchCommand(null);
      setEditingSketchShapeId(null);
      setToolbarMode("geometry");
      return;
    }
    const height = existing?.height ?? 10;
    let resolved: WorkplaneShape | null = null;
    let exact = false;
    if (sketchOperation === "revolve") {
      setNotice("Building revolved sketch geometry…");
      try {
        resolved = await shapeFromRevolvedSketchProfile(refreshedProfile, sketchRevolveSettings, existing);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The sketch profile cannot be revolved to 3D");
        return;
      }
    } else {
      if (selectedSketchRegionIds.length === 0) {
        setNotice("Select at least one closed profile to extrude");
        return;
      }
      setNotice("Building exact sketch geometry…");
      exact = true;
      try {
        resolved = await cadShapeFromSketchProfile(refreshedProfile, height, existing, selectedSketchRegionIds);
      } catch (error) {
        exact = false;
        try {
          resolved = await shapeFromSketchProfile(refreshedProfile, height, existing, selectedSketchRegionIds);
        } catch (fallbackError) {
          setNotice(fallbackError instanceof Error ? fallbackError.message : error instanceof Error ? error.message : "The sketch profile cannot be converted to 3D");
          return;
        }
      }
    }
    if (!resolved) {
      setNotice("Close at least one profile before finishing the sketch");
      return;
    }
    const usesConstructionPlane = sketchConstructionPlaneId !== BASE_CONSTRUCTION_PLANE_ID
      || Boolean(existing?.sketchPlane)
      || placementWorkplaneIsBase(activeSketchWorkplane);
    if (usesConstructionPlane) {
      resolved = sketchShapeWithPlanePose(resolved, sketchConstructionPlaneId, constructionPlanePoseById(sketchConstructionPlaneId, shapes, existing?.sketchPlane?.pose), existing?.sketchPlane?.localCenter);
    } else if (sketchOperation === "extrude") {
      resolved = placeSketchExtrusion(resolved, activeSketchWorkplane, existing);
    }
    resolved = canonicalizeShape({
      ...resolved,
      sketchProfile: cloneSketchProfile(refreshedProfile),
      sketchFeature: sketchOperation === "extrude" ? { kind: "extrusion", regionIds: [...selectedSketchRegionIds] } : undefined,
      sketchOperation,
      sketchRevolve: sketchOperation === "revolve" ? normalizeSketchRevolveSettings(sketchRevolveSettings) : undefined,
    });
    const nextShapes = existing ? shapes.map((shape) => (shape.id === existing.id ? resolved : shape)) : [...shapes, resolved];
    const action = sketchOperation === "revolve" ? "Revolve sketch" : "Sketch";
    commitShapes(nextShapes, resolved.id, sketchOperation === "revolve" ? existing ? `${action} updated` : "Revolved sketch created" : exact ? existing ? "Sketch updated with exact CAD geometry" : "Exact sketch created at 10 mm height" : existing ? "Sketch updated" : "Sketch created at 10 mm height");
    setSketchActive(false);
    setSketchActivePointId(null);
    setSketchSelection(null);
    setSketchExtrusionRegionIds(null);
    setSketchMeasureStart(null);
    setSketchMeasurement(null);
    setSketchCircleDraft(null);
    setSketchRectDraft(null);
    setSketchPolygonDraft(null);
    setSketchTextDraft(null);
    setSketchCommand(null);
    setSketchRevolvePreview(null);
    setEditingSketchShapeId(null);
    setToolbarMode("geometry");
  }, [activeSketchWorkplane, commitShapes, editingSketchShapeId, selectedSketchRegionIds, shapes, sketchConstructionPlaneId, sketchOperation, sketchProfile, sketchRevolveSettings]);

  useEffect(() => {
    if (!projectId) {
      lastProjectIdRef.current = null;
      lastProjectShapesSyncRef.current = "";
      lastProjectShapesEchoRef.current = null;
      return;
    }
    if (projectInteractionActiveRef.current) {
      return;
    }
    const projectChanged = lastProjectIdRef.current !== projectId;
    if (projectChanged) {
      lastProjectIdRef.current = projectId;
      lastProjectShapesSyncRef.current = "";
      lastProjectShapesEchoRef.current = null;
      const nextAssets = dedupeProjectAssets(initialAssets);
      projectAssetsRef.current = nextAssets;
      setProjectAssets(nextAssets);
      const nextPlacementElevation = Number.isFinite(initialPlacementElevation) ? initialPlacementElevation : 0;
      setPlacementElevation(nextPlacementElevation);
      setPlacementWorkplane(normalizePlacementWorkplane(initialPlacementWorkplane, nextPlacementElevation));
    }
    const incoming = refreshConstructionPlaneShapes(initialShapes.map(canonicalizeShape));
    const incomingSerialized = projectShapesFingerprint(incoming);
    // The parent echoes shapes after a local save; rehydrating that echo can reset active transform state.
    if (!projectChanged && lastProjectShapesEchoRef.current !== null && incomingSerialized === lastProjectShapesEchoRef.current) {
      lastProjectShapesSyncRef.current = incomingSerialized;
      return;
    }
    lastProjectShapesSyncRef.current = incomingSerialized;
    if (projectSyncTimerRef.current !== null) {
      window.clearTimeout(projectSyncTimerRef.current);
      projectSyncTimerRef.current = null;
    }
    if (!projectChanged && incomingSerialized === projectShapesFingerprint(shapes)) {
      return;
    }
    const hydratedHistory = hydrateEditorHistoryState(
      incoming,
      initialHistory,
      initialHistoryIndex,
      normalizeWorkspaceSettings(initialWorkspace).historyLimit,
    );
    projectHydratingRef.current = true;
    shapesRef.current = incoming;
    selectedIdsRef.current = [];
    historyRef.current = hydratedHistory.entries;
    historyIndexRef.current = hydratedHistory.index;
    setShapes(incoming);
    setSelectedIds([]);
    setHistory(hydratedHistory.entries);
    setHistoryIndex(hydratedHistory.index);
    setNotice("Ready");
  }, [initialAssets, initialHistory, initialHistoryIndex, initialPlacementElevation, initialPlacementWorkplane, initialShapes, projectId, projectRevision]);

  useEffect(() => {
    if (!projectId || !onProjectShapesChange) {
      return;
    }
    if (projectHydratingRef.current) {
      projectHydratingRef.current = false;
      return;
    }
    syncProjectShapes(shapes);
  }, [onProjectShapesChange, projectId, shapes, syncProjectShapes]);

  useEffect(() => {
    return () => {
      if (projectSyncTimerRef.current !== null) {
        window.clearTimeout(projectSyncTimerRef.current);
      }
      if (interactionHistoryTimerRef.current !== null) {
        window.clearTimeout(interactionHistoryTimerRef.current);
      }
      sketchRevolveUpdateTimerRef.current.forEach((timer) => window.clearTimeout(timer));
      sketchRevolveUpdateTimerRef.current.clear();
    };
  }, []);

  const addShape = useCallback(
    (asset: ShapeAsset, point?: PlacementPoint) => {
      const shape = makeShapeFromAsset(asset);
      const nextShape = {
        ...shape,
        ...placementPatchForNewShape(shape, placementWorkplane, point ?? placementWorkplane.origin),
      };
      commitShapes([...shapes, nextShape], nextShape.id, `${asset.name} added`);
    },
    [commitShapes, placementWorkplane, shapes],
  );

  const scheduleRevolveShapeUpdate = useCallback((id: string, settings: SketchRevolveSettings) => {
    const previousTimer = sketchRevolveUpdateTimerRef.current.get(id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const requestId = (sketchRevolveUpdateRequestRef.current.get(id) ?? 0) + 1;
    sketchRevolveUpdateRequestRef.current.set(id, requestId);
    const timer = window.setTimeout(() => {
      sketchRevolveUpdateTimerRef.current.delete(id);
      const source = shapesRef.current.find((shape) => shape.id === id);
      if (!source?.sketchProfile || source.sketchOperation !== "revolve") return;
      setNotice("Updating revolve preview…");
      void shapeFromRevolvedSketchProfile(source.sketchProfile, settings, source)
        .then((generated) => {
          if (sketchRevolveUpdateRequestRef.current.get(id) !== requestId) return;
          const current = shapesRef.current.find((shape) => shape.id === id);
          if (!current?.importedMesh || current.sketchOperation !== "revolve") return;
          const widthScale = current.width / Math.max(0.001, current.importedMesh.baseWidth);
          const depthScale = current.depth / Math.max(0.001, current.importedMesh.baseDepth);
          const heightScale = current.height / Math.max(0.001, current.importedMesh.baseHeight);
          const width = generated.width * widthScale;
          const depth = generated.depth * depthScale;
          const height = generated.height * heightScale;
          const updated = canonicalizeShape({
            ...generated,
            id: current.id,
            name: current.name,
            color: current.color,
            hole: current.hole,
            x: current.x,
            z: current.z,
            elevation: current.elevation,
            width,
            depth,
            height,
            size: Math.max(width, depth),
            rotation: current.rotation,
            rotationX: current.rotationX,
            rotationZ: current.rotationZ,
            mirrorX: current.mirrorX,
            mirrorY: current.mirrorY,
            mirrorZ: current.mirrorZ,
            locked: current.locked,
            hidden: current.hidden,
            sketchRevolve: settings,
          });
          commitShapes(shapesRef.current.map((shape) => shape.id === id ? updated : shape), selectedIdsRef.current, "Revolve updated");
        })
        .catch((error) => {
          if (sketchRevolveUpdateRequestRef.current.get(id) === requestId) {
            setNotice(error instanceof Error ? error.message : "The revolve settings could not be applied");
          }
        });
    }, 120);
    sketchRevolveUpdateTimerRef.current.set(id, timer);
  }, [commitShapes]);

  const updateShape = useCallback(
    (id: string, patch: ShapeUpdatePatch) => {
      const bakeTransform = Boolean(patch.bakeTransform);
      const cleanedPatch = cleanShapePatch(patch);
      if (cleanedPatch.sketchRevolve) {
        const source = shapesRef.current.find((shape) => shape.id === id);
        if (source?.sketchOperation === "revolve" && source.sketchProfile) {
          scheduleRevolveShapeUpdate(id, normalizeSketchRevolveSettings(cleanedPatch.sketchRevolve));
          return;
        }
      }
      const applyPatch = (current: WorkplaneShape[]) => {
        let changed = false;
        const next = current.map((shape) => {
          if (shape.id !== id) {
            return shape;
          }

          const patched = { ...shape, ...cleanedPatch };
          const canonicalBase = canonicalizeShape("hole" in cleanedPatch ? withHoleMode(patched, Boolean(cleanedPatch.hole), cleanedPatch.color) : patched);
          const canonical = bakeTransform ? canonicalizeShape(bakeShapeTransformIntoMesh(canonicalBase)) : canonicalBase;
          if (workplaneShapesEqual(shape, canonical)) {
            return shape;
          }
          changed = true;
          return canonical;
        });
        return { changed, next };
      };

      if (projectInteractionActiveRef.current) {
        setShapes((current) => {
          const { changed, next } = applyPatch(current);
          if (!changed) {
            return current;
          }
          interactionHistoryChangedRef.current = true;
          const refreshed = refreshConstructionPlaneShapes(next, current);
          shapesRef.current = refreshed;
          return refreshed;
        });
        return;
      }

      const { changed, next } = applyPatch(shapes);
      if (changed) {
        commitShapes(next, selectedIds);
      }
    },
    [commitShapes, scheduleRevolveShapeUpdate, selectedIds, shapes],
  );

  const deleteSelected = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    commitShapes(
      shapes.filter((shape) => !selected.has(shape.id)),
      [],
      `Deleted ${selected.size} selected shape${selected.size === 1 ? "" : "s"}`,
    );
  }, [commitShapes, hasSelection, selectedIds, shapes]);

  const duplicateSelected = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const duplicates = selectedShapes.map((shape) => {
      const duplicate = cloneWorkplaneShapeTreeWithFreshIds(shape, "copy");
      return {
        ...duplicate,
        x: Math.min(110, shape.x + 8),
        z: Math.min(110, shape.z + 8),
      };
    });
    commitShapes([...shapes, ...duplicates], duplicates.map((shape) => shape.id), `Duplicated ${duplicates.length} shape${duplicates.length === 1 ? "" : "s"}`);
  }, [commitShapes, hasSelection, selectedShapes, shapes]);

  const copySelected = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    setClipboard(selectedShapes);
    writeSharedClipboard(selectedShapes);
    setNotice(`Copied ${selectedShapes.length} shape${selectedShapes.length === 1 ? "" : "s"}`);
  }, [hasSelection, selectedShapes]);

  const pasteShape = useCallback(async () => {
    const sourceProjectId = projectInfoRef.current.projectId;
    const systemClipboard = await readSystemClipboard();
    const sharedClipboard = readSharedClipboard();
    const sourceClipboard = systemClipboard.length > 0 ? systemClipboard : sharedClipboard.length > 0 ? sharedClipboard : clipboard;
    if (sourceClipboard.length === 0) {
      setNotice("SketchForge clipboard is empty");
      return;
    }
    if (projectInfoRef.current.projectId !== sourceProjectId) {
      setNotice("Paste cancelled because the project changed");
      return;
    }
    if (serializeShapesForSync(sourceClipboard) !== serializeShapesForSync(clipboard)) {
      setClipboard(sourceClipboard);
    }
    const pasted = sourceClipboard.map((shape) => {
      const pastedShape = cloneWorkplaneShapeTreeWithFreshIds(shape, "paste");
      return {
        ...pastedShape,
        x: Math.min(110, shape.x + 12),
        z: Math.min(110, shape.z + 12),
      };
    });
    commitShapes([...shapesRef.current, ...pasted], pasted.map((shape) => shape.id), `Pasted ${pasted.length} shape${pasted.length === 1 ? "" : "s"}`);
  }, [clipboard, commitShapes]);

  const undo = useCallback(() => {
    if (projectInteractionActiveRef.current) {
      setNotice("Finish the current drag or transform before undoing");
      return;
    }
    const modifierCancelled = invalidateCadModifierSession();
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (currentIndex <= 0) {
      setNotice(modifierCancelled ? "Edge modifier cancelled" : "Nothing to undo");
      return;
    }
    const nextIndex = currentIndex - 1;
    const entry = currentHistory[nextIndex];
    const nextShapes = (entry?.shapes ?? []).map(canonicalizeShape);
    const nextSelection = (entry?.selectedIds ?? []).filter((id) => nextShapes.some((shape) => shape.id === id));
    historyIndexRef.current = nextIndex;
    shapesRef.current = nextShapes;
    selectedIdsRef.current = nextSelection;
    setHistoryIndex(nextIndex);
    setShapes(nextShapes);
    setSelectedIds(nextSelection);
    syncProjectShapes(nextShapes);
    setNotice(modifierCancelled ? "Edge modifier cancelled · Undo" : "Undo");
  }, [invalidateCadModifierSession, syncProjectShapes]);

  const redo = useCallback(() => {
    if (projectInteractionActiveRef.current) {
      setNotice("Finish the current drag or transform before redoing");
      return;
    }
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (currentIndex >= currentHistory.length - 1) {
      setNotice("Nothing to redo");
      return;
    }
    const modifierCancelled = invalidateCadModifierSession();
    const nextIndex = currentIndex + 1;
    const entry = currentHistory[nextIndex];
    const nextShapes = (entry?.shapes ?? []).map(canonicalizeShape);
    const nextSelection = (entry?.selectedIds ?? []).filter((id) => nextShapes.some((shape) => shape.id === id));
    historyIndexRef.current = nextIndex;
    shapesRef.current = nextShapes;
    selectedIdsRef.current = nextSelection;
    setHistoryIndex(nextIndex);
    setShapes(nextShapes);
    setSelectedIds(nextSelection);
    syncProjectShapes(nextShapes);
    setNotice(modifierCancelled ? "Edge modifier cancelled · Redo" : "Redo");
  }, [invalidateCadModifierSession, syncProjectShapes]);

  const toggleAlignMode = useCallback(() => {
    if (selectedShapes.length < 2) {
      setNotice("Select at least two shapes to align");
      return;
    }
    setAlignMode((active) => {
      const next = !active;
      setAlignPreview(null);
      if (next) {
        setMirrorMode(false);
        setMirrorPreviewAxis(null);
      }
      setNotice(next ? "Align: choose a dot, or click a selected shape to anchor it" : "Align cancelled");
      return next;
    });
  }, [selectedShapes.length]);

  const chooseAlignAnchor = useCallback(
    (id: string) => {
      if (!selectedIds.includes(id)) {
        return;
      }
      const shape = shapes.find((entry) => entry.id === id);
      const lockedAnchor = selectedShapes.find((entry) => entry.locked);
      if (lockedAnchor && lockedAnchor.id !== id) {
        setNotice(`Align anchor: ${lockedAnchor.name} (locked)`);
        return;
      }
      setAlignAnchorId(id);
      setAlignPreview(null);
      setNotice(shape ? `Align anchor: ${shape.name}` : "Align anchor set");
    },
    [selectedIds, selectedShapes, shapes],
  );

  const alignSelectionTo = useCallback(
    (axis: AlignAxis, target: AlignTarget) => {
      if (selectedShapes.length < 2) {
        setNotice("Select at least two shapes to align");
        return;
      }

      const { nextShapes, moved } = alignedShapesForSelection(shapes, selectedIds, selectedShapes, effectiveAlignAnchorId, axis, target);
      setAlignPreview(null);

      if (moved === 0) {
        setNotice("Already aligned");
        return;
      }

      commitShapes(nextShapes, selectedIds, `Aligned ${moved} shape${moved === 1 ? "" : "s"} ${alignmentLabel(axis, target)}`);
    },
    [commitShapes, effectiveAlignAnchorId, selectedIds, selectedShapes, shapes],
  );

  const previewAlignSelection = useCallback((axis: AlignAxis, target: AlignTarget) => {
    setAlignPreview({ axis, target });
  }, []);

  const clearAlignPreview = useCallback(() => {
    setAlignPreview(null);
  }, []);

  const toggleMirrorMode = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    setMirrorMode((active) => {
      const next = !active;
      setMirrorPreviewAxis(null);
      if (next) {
        setAlignMode(false);
        setAlignAnchorId(null);
        setAlignPreview(null);
      }
      setNotice(next ? "Mirror: choose an axis arrow" : "Mirror cancelled");
      return next;
    });
  }, [hasSelection]);

  const mirrorSelectionAcross = useCallback(
    (axis: AlignAxis) => {
      if (!hasSelection) {
        setNotice("Select a shape first");
        return;
      }
      const { nextShapes, moved } = mirroredShapesForSelection(shapes, selectedIds, selectedShapes, axis);
      setMirrorPreviewAxis(null);
      if (moved === 0) {
        setNotice("Nothing to mirror");
        return;
      }
      commitShapes(nextShapes, selectedIds, `Mirrored ${moved} shape${moved === 1 ? "" : "s"} ${mirrorAxisLabel(axis)}`);
    },
    [commitShapes, hasSelection, selectedIds, selectedShapes, shapes],
  );

  const previewMirrorSelection = useCallback((axis: AlignAxis) => {
    setMirrorPreviewAxis(axis);
  }, []);

  const clearMirrorPreview = useCallback(() => {
    setMirrorPreviewAxis(null);
  }, []);

  const postCadModifierRequest = useCallback((request: CadModifierWorkerPayload, transfer: Transferable[] = []) => {
    const worker = cadModifierWorkerRef.current ?? cadModifierWorkerRestartRef.current();
    if (!worker) return null;
    const requestId = cadModifierRequestRef.current + 1;
    cadModifierRequestRef.current = requestId;
    try {
      worker.postMessage({ ...request, requestId } as CadModifierWorkerRequest, transfer);
    } catch {
      worker.terminate();
      if (cadModifierWorkerRef.current === worker) cadModifierWorkerRef.current = null;
      return null;
    }
    return requestId;
  }, []);

  const postCadModifierRequestAsync = useCallback((request: CadModifierWorkerPayload, transfer: Transferable[] = [], timeoutMs = 20000) => {
    const worker = cadModifierWorkerRef.current ?? cadModifierWorkerRestartRef.current();
    if (!worker) {
      return Promise.reject(new Error("The CAD worker is not ready"));
    }
    const requestId = cadModifierRequestRef.current + 1;
    cadModifierRequestRef.current = requestId;
    return new Promise<CadModifierWorkerResponse>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!cadModifierPendingRef.current.has(requestId)) return;
        const pendingRequests = [...cadModifierPendingRef.current.values()];
        cadModifierPendingRef.current.clear();
        pendingRequests.forEach((pending) => window.clearTimeout(pending.timer));
        cadModifierWorkerRef.current?.terminate();
        cadModifierWorkerRef.current = null;
        const invalidationId = cadModifierRequestRef.current + 1;
        cadModifierRequestRef.current = invalidationId;
        cadModifierLatestPreviewRef.current = invalidationId;
        cadModifierPrepareRef.current = invalidationId;
        cadModifierBaseShapeRef.current = null;
        cadModifierBaseFingerprintRef.current = "";
        cadModifierSourcePartsRef.current = [];
        setEdgeModifier(null);
        cadModifierWorkerRestartRef.current();
        pendingRequests.forEach((pending) => pending.reject(new Error("Timed out waiting for the CAD worker; the worker was restarted")));
      }, timeoutMs);
      cadModifierPendingRef.current.set(requestId, { resolve, reject, timer });
      try {
        worker.postMessage({ ...request, requestId } as CadModifierWorkerRequest, transfer);
      } catch (error) {
        window.clearTimeout(timer);
        cadModifierPendingRef.current.delete(requestId);
        reject(error instanceof Error ? error : new Error("The CAD worker rejected the request"));
      }
    });
  }, []);

  const cancelEdgeModifier = useCallback(() => {
    invalidateCadModifierSession();
    setNotice("Edge modifier cancelled");
  }, [invalidateCadModifierSession]);

  const startEdgeModifier = useCallback((kind: CadModifierKind) => {
    if (selectedShapes.length !== 1 || !selectedShape || selectedShape.locked || selectedShape.hole) {
      setNotice(`Select one unlocked solid to ${kind}`);
      return;
    }
    invalidateCadModifierSession();
    const appliedEdgeTreatmentCount = edgeTreatmentFeatureCount(selectedShape);
    const hasAppliedEdgeTreatment = Boolean(selectedShape.importedMesh && selectedShape.edgeTreatments?.length);
    const sourceParts = (selectedShape.groupedShapes?.length && !hasAppliedEdgeTreatment
      ? restoreGroupedChildren(selectedShape)
      : [selectedShape]).flatMap(cadModifierSourceParts);
    const partInputs: Array<{ shape: WorkplaneShape; mesh?: MeshData; brep?: string; brepTransform?: number[]; primitive?: CadModifierPrimitivePart }> = sourceParts.map((shape) => {
      const frame = shape.cadBrepFrame;
      const preserveNeedsRetessellation = preservesEdgeTreatmentSize(shape) && Boolean(frame) && (
        Math.abs(shapeWidth(shape) - (frame?.width ?? shapeWidth(shape))) > 1e-6 ||
        Math.abs(shapeDepth(shape) - (frame?.depth ?? shapeDepth(shape))) > 1e-6 ||
        Math.abs(shape.height - (frame?.height ?? shape.height)) > 1e-6
      );
      const primitive = cadModifierPrimitiveForShape(shape);
      if (primitive) return { shape, primitive };
      return shape.cadBrep && frame && !preserveNeedsRetessellation
        ? { shape, brep: shape.cadBrep, brepTransform: cadBrepTransformForShape(shape) }
        : { shape, mesh: meshForShape(shape) };
    });
    const triangleCount = partInputs.reduce((total, part) => total + (part.mesh?.faces.length ?? 0), 0);
    if (triangleCount === 0 && partInputs.every((part) => !part.brep && !part.primitive)) {
      setNotice("The selected object has no printable surface");
      return;
    }
    if (triangleCount > 180_000) {
      setNotice("This mesh is too dense for interactive edge treatment. Simplify it below 180,000 triangles first.");
      return;
    }
    const amount = Math.max(MIN_EDGE_MODIFIER_AMOUNT, Math.min(1, shapeWidth(selectedShape) / 6, shapeDepth(selectedShape) / 6, selectedShape.height / 6));
    cadModifierBaseShapeRef.current = selectedShape;
    cadModifierBaseFingerprintRef.current = projectShapesFingerprint([selectedShape]);
    cadModifierSourcePartsRef.current = sourceParts;
    setAlignMode(false);
    setMirrorMode(false);
    setEdgeModifier({
      kind,
      edges: [],
      selectedEdgeIds: [],
      amount,
      sharpAngle: 25,
      chamferAngle: 45,
      quality: "standard",
      tangentChain: defaultCadModifierTangentChain(appliedEdgeTreatmentCount),
      preserveEdgeSize: selectedShape.edgeResizeMode === "preserve",
      busy: true,
      prepared: false,
      error: null,
      preview: null,
      componentPreviews: [],
    });
    setNotice(`Preparing ${kind} edges in the CAD worker`);
    const parts: CadModifierMeshPart[] = partInputs.map((part) => {
      if (part.brep) return { brep: part.brep, brepTransform: part.brepTransform, hole: Boolean(part.shape.hole) };
      if (part.primitive) return { primitive: part.primitive, hole: Boolean(part.shape.hole) };
      return { ...meshDataToCadTransfer(part.mesh as MeshData), hole: Boolean(part.shape.hole) };
    });
    const prepareRequestId = postCadModifierRequest({
      type: "prepare",
      parts,
      sharpAngle: 25,
      suppressTreatmentDetailEdges: appliedEdgeTreatmentCount > 0,
    }, parts.flatMap((part) => part.positions && part.indices ? [part.positions.buffer, part.indices.buffer] : []));
    if (prepareRequestId === null) {
      const message = cadModifierWorkerFailureMessage();
      setEdgeModifier((current) => current ? { ...current, busy: false, prepared: false, error: message } : current);
      setNotice(message);
      return;
    }
    cadModifierPrepareRef.current = prepareRequestId;
    armCadModifierWatchdog(prepareRequestId, "prepare", cadModifierPrepareTimeoutMs(triangleCount));
  }, [armCadModifierWatchdog, invalidateCadModifierSession, postCadModifierRequest, selectedShape, selectedShapes.length]);

  const prepareCadModifierForMcp = useCallback(async (shape: WorkplaneShape, sharpAngle: number) => {
    if (shape.locked || shape.hole) {
      throw new Error("Select one unlocked solid object for edge treatment");
    }
    const appliedEdgeTreatmentCount = edgeTreatmentFeatureCount(shape);
    const hasAppliedEdgeTreatment = Boolean(shape.importedMesh && shape.edgeTreatments?.length);
    const sourceParts = (shape.groupedShapes?.length && !hasAppliedEdgeTreatment
      ? restoreGroupedChildren(shape)
      : [shape]).flatMap(cadModifierSourceParts);
    const partInputs: Array<{ shape: WorkplaneShape; mesh?: MeshData; brep?: string; brepTransform?: number[]; primitive?: CadModifierPrimitivePart }> = sourceParts.map((partShape) => {
      const frame = partShape.cadBrepFrame;
      const preserveNeedsRetessellation = preservesEdgeTreatmentSize(partShape) && Boolean(frame) && (
        Math.abs(shapeWidth(partShape) - (frame?.width ?? shapeWidth(partShape))) > 1e-6 ||
        Math.abs(shapeDepth(partShape) - (frame?.depth ?? shapeDepth(partShape))) > 1e-6 ||
        Math.abs(partShape.height - (frame?.height ?? partShape.height)) > 1e-6
      );
      const primitive = cadModifierPrimitiveForShape(partShape);
      if (primitive) return { shape: partShape, primitive };
      return partShape.cadBrep && frame && !preserveNeedsRetessellation
        ? { shape: partShape, brep: partShape.cadBrep, brepTransform: cadBrepTransformForShape(partShape) }
        : { shape: partShape, mesh: meshForShape(partShape) };
    });
    const triangleCount = partInputs.reduce((total, part) => total + (part.mesh?.faces.length ?? 0), 0);
    if (triangleCount === 0 && partInputs.every((part) => !part.brep && !part.primitive)) {
      throw new Error("The selected object has no printable surface");
    }
    if (triangleCount > 180_000) {
      throw new Error("This mesh is too dense for interactive edge treatment. Simplify it below 180,000 triangles first.");
    }
    const parts: CadModifierMeshPart[] = partInputs.map((part) => {
      if (part.brep) return { brep: part.brep, brepTransform: part.brepTransform, hole: Boolean(part.shape.hole) };
      if (part.primitive) return { primitive: part.primitive, hole: Boolean(part.shape.hole) };
      return { ...meshDataToCadTransfer(part.mesh as MeshData), hole: Boolean(part.shape.hole) };
    });
    const transfer = parts.flatMap((part) => part.positions && part.indices ? [part.positions.buffer as Transferable, part.indices.buffer as Transferable] : []);
    const response = await postCadModifierRequestAsync({
      type: "prepare",
      parts,
      sharpAngle,
      suppressTreatmentDetailEdges: appliedEdgeTreatmentCount > 0,
    }, transfer, cadModifierPrepareTimeoutMs(triangleCount));
    if (response.type !== "ready") {
      throw new Error("The CAD worker did not return an edge list");
    }
    return { response, sourceParts };
  }, [postCadModifierRequestAsync]);

  const applyCadModifierForMcp = useCallback(async (
    shape: WorkplaneShape,
    params: Record<string, unknown>,
  ) => {
    invalidateCadModifierSession();
    const sourceFingerprint = projectShapesFingerprint([shape]);
    const sourceProjectId = projectInfoRef.current.projectId;
    const kind: CadModifierKind = params.kind === "fillet" ? "fillet" : "chamfer";
    const sharpAngle = Math.max(1, Math.min(CAD_MODIFIER_MAX_SHARP_ANGLE, mcpNumber(params.sharpAngle, 25)));
    const amount = Math.max(MIN_EDGE_MODIFIER_AMOUNT, mcpNumber(params.amount, 1));
    const chamferAngle = Math.max(5, Math.min(85, mcpNumber(params.chamferAngle, 45)));
    const quality: CadModifierQuality = params.quality === "draft" || params.quality === "fine" ? params.quality : "standard";
    const preserveEdgeSize = typeof params.preserveEdgeSize === "boolean" ? params.preserveEdgeSize : shape.edgeResizeMode === "preserve";
    const { response, sourceParts } = await prepareCadModifierForMcp(shape, sharpAngle);
    const selectableIds = response.edges.filter((edge) => selectableCadModifierEdge(edge, sharpAngle)).map((edge) => edge.id);
    const requestedIds = mcpNumberArray(params.edgeIds);
    const selectedEdgeIds = params.edgeIds === "all" || params.allEdges === true ? selectableIds : requestedIds.filter((edgeId) => selectableIds.includes(edgeId));
    const missingIds = requestedIds.filter((edgeId) => !selectableIds.includes(edgeId));
    if (selectedEdgeIds.length === 0) {
      throw new Error("Select at least one valid highlighted edge ID");
    }
    if (missingIds.length > 0) {
      throw new Error(`These edge IDs are not selectable at the current threshold: ${missingIds.join(", ")}`);
    }
    const previewResponse = await postCadModifierRequestAsync({
      type: "preview",
      kind,
      edgeIds: selectedEdgeIds,
      amount,
      quality,
      chamferAngle,
    }, [], 30000);
    if (previewResponse.type !== "preview") {
      throw new Error("The CAD worker did not return an edge preview");
    }
    const rawPreview = shapeFromCadMesh(shape, previewResponse.positions, previewResponse.normals, previewResponse.indices, previewResponse.brep);
    if (!rawPreview) {
      throw new Error("The CAD kernel returned an empty edge treatment");
    }
    const preview = canonicalizeShape({
      ...rawPreview,
      cadDisplayEdges: cadDisplayEdgesForShape(rawPreview, previewResponse.displayEdges),
      cadDisplayEdgesVersion: 2 as const,
    });
    const feature = {
      kind,
      amount,
      edgeCount: selectedEdgeIds.length,
      ...(kind === "chamfer" ? { chamferAngle } : {}),
    } satisfies NonNullable<WorkplaneShape["edgeTreatments"]>[number];
    const session: EdgeModifierSession = {
      kind,
      edges: response.edges,
      selectedEdgeIds,
      amount,
      sharpAngle,
      chamferAngle,
      quality,
      tangentChain: false,
      preserveEdgeSize,
      busy: false,
      prepared: true,
      error: null,
      preview,
      componentPreviews: cadModifierComponentPreviews(sourceParts, previewResponse.components),
    };
    const createdAt = Date.now();
    const groupedModifiedShape = groupedShapeWithComponentEdgeTreatment(shape, preview, sourceParts, session, feature, createdAt);
    const modifiedShape = groupedModifiedShape ?? shapeWithEdgeTreatmentRecord(
      bakedEdgeTreatmentPreview(preview, shape),
      shape,
      feature,
      preserveEdgeSize,
      createdAt,
    );
    const currentTarget = shapesRef.current.find((candidate) => candidate.id === shape.id);
    if (
      projectInfoRef.current.projectId !== sourceProjectId ||
      !currentTarget ||
      projectShapesFingerprint([currentTarget]) !== sourceFingerprint
    ) {
      throw new Error("The target object or project changed while the edge treatment was running; try again");
    }
    commitShapes(
      shapesRef.current.map((candidate) => candidate.id === shape.id ? modifiedShape : candidate),
      modifiedShape.id,
      `${kind === "fillet" ? "Filleted" : "Chamfered"} ${selectedEdgeIds.length} edge${selectedEdgeIds.length === 1 ? "" : "s"} by MCP`,
    );
    return {
      object: mcpShapeSummary(modifiedShape),
      selectedEdgeIds,
      selectableEdgeIds: selectableIds,
    };
  }, [commitShapes, invalidateCadModifierSession, prepareCadModifierForMcp, postCadModifierRequestAsync]);

  useEffect(() => {
    const base = cadModifierBaseShapeRef.current;
    if (!edgeModifier || !base) return;
    const current = shapes.find((shape) => shape.id === base.id);
    if (current && projectShapesFingerprint([current]) === cadModifierBaseFingerprintRef.current) return;
    invalidateCadModifierSession();
    setNotice("Edge modifier cancelled because the object changed");
  }, [edgeModifier, invalidateCadModifierSession, shapes]);

  const applyEdgeModifier = useCallback(() => {
    const base = cadModifierBaseShapeRef.current;
    if (!edgeModifier?.preview || !base) {
      setNotice("Wait for a valid edge preview before applying");
      return;
    }
    const label = edgeModifier.kind === "fillet" ? "Filleted" : "Chamfered";
    const feature = {
      kind: edgeModifier.kind,
      amount: edgeModifier.amount,
      edgeCount: edgeModifier.selectedEdgeIds.length,
      ...(edgeModifier.kind === "chamfer" ? { chamferAngle: edgeModifier.chamferAngle } : {}),
    } satisfies NonNullable<WorkplaneShape["edgeTreatments"]>[number];
    const createdAt = Date.now();
    const previewShape = canonicalizeShape({
      ...edgeModifier.preview,
      cadDisplayEdges: edgeModifier.preview.cadDisplayEdges?.length
        ? edgeModifier.preview.cadDisplayEdges
        : cadDisplayEdgesAfterTreatment(edgeModifier.preview, edgeModifier),
      cadDisplayEdgesVersion: 2,
    });
    const groupedModifiedShape = groupedShapeWithComponentEdgeTreatment(
      base,
      previewShape,
      cadModifierSourcePartsRef.current,
      edgeModifier,
      feature,
      createdAt,
    );
    const modifiedShape: WorkplaneShape = groupedModifiedShape ?? shapeWithEdgeTreatmentRecord(
      bakedEdgeTreatmentPreview(previewShape, base),
      base,
      feature,
      edgeModifier.preserveEdgeSize,
      createdAt,
    );
    commitShapes(
      shapes.map((shape) => shape.id === base.id ? modifiedShape : shape),
      base.id,
      `${label} ${edgeModifier.selectedEdgeIds.length} edge${edgeModifier.selectedEdgeIds.length === 1 ? "" : "s"}`,
    );
    invalidateCadModifierSession();
  }, [commitShapes, edgeModifier, invalidateCadModifierSession, shapes]);

  useEffect(() => {
    if (!edgeModifier) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdgeModifier();
      } else if (event.key === "Enter" && edgeModifier.preview && edgeModifier.selectedEdgeIds.length > 0 && !edgeModifier.busy && !edgeModifier.error) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("input, select, textarea, button, [contenteditable='true']")) return;
        event.preventDefault();
        applyEdgeModifier();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyEdgeModifier, cancelEdgeModifier, edgeModifier]);

  useEffect(() => {
    if (!edgeModifier?.prepared || edgeModifier.selectedEdgeIds.length === 0) return;
    const timer = window.setTimeout(() => {
      const requestId = postCadModifierRequest({
        type: "preview",
        kind: edgeModifier.kind,
        edgeIds: edgeModifier.selectedEdgeIds,
        amount: edgeModifier.amount,
        quality: edgeModifier.quality,
        chamferAngle: edgeModifier.chamferAngle,
      });
      if (requestId === null) {
        const message = cadModifierWorkerFailureMessage();
        setEdgeModifier((current) => current ? { ...current, busy: false, prepared: false, preview: null, error: message } : current);
        setNotice(message);
        return;
      }
      cadModifierLatestPreviewRef.current = requestId;
      armCadModifierWatchdog(requestId, "preview");
      setEdgeModifier((current) => current ? { ...current, busy: true, error: null } : current);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [armCadModifierWatchdog, edgeModifier?.amount, edgeModifier?.chamferAngle, edgeModifier?.kind, edgeModifier?.prepared, edgeModifier?.quality, edgeModifier?.selectedEdgeIds, postCadModifierRequest]);

  const snapSelected = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    const grid = visibleGridStep(workspaceSettings);
    commitShapes(
      shapes.map((shape) =>
        selected.has(shape.id) && !shape.locked
          ? snapShapeFootprintToVisibleGrid(shape, meshAabb(shape), workspaceSettings)
          : shape,
      ),
      selectedIds,
      `Snapped ${selectedShapes.length} shape${selectedShapes.length === 1 ? "" : "s"} to ${grid} mm visible grid`,
    );
  }, [commitShapes, hasSelection, selectedIds, selectedShapes.length, shapes, workspaceSettings]);

  const toggleHidden = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    const shouldHide = selectedShapes.some((shape) => !shape.hidden);
    commitShapes(
      shapes.map((shape) => (selected.has(shape.id) && !shape.locked ? { ...shape, hidden: shouldHide } : shape)),
      selectedIds,
      shouldHide ? "Selection hidden" : "Selection visible",
    );
  }, [commitShapes, hasSelection, selectedIds, selectedShapes, shapes]);

  const showHidden = useCallback(() => {
    const hiddenCount = shapes.filter((shape) => shape.hidden).length;
    if (hiddenCount === 0) {
      setNotice("No hidden shapes");
      return;
    }
    commitShapes(
      shapes.map((shape) => ({ ...shape, hidden: false })),
      selectedIds,
      `Showed ${hiddenCount} hidden shape${hiddenCount === 1 ? "" : "s"}`,
    );
  }, [commitShapes, selectedIds, shapes]);

  const toggleLocked = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    const shouldLock = selectedShapes.some((shape) => !shape.locked);
    commitShapes(
      shapes.map((shape) => (selected.has(shape.id) ? { ...shape, locked: shouldLock } : shape)),
      selectedIds,
      shouldLock ? "Selection locked" : "Selection unlocked",
    );
  }, [commitShapes, hasSelection, selectedIds, selectedShapes, shapes]);

  const setSelectionHoleMode = useCallback(
    (hole: boolean) => {
      if (!hasSelection) {
        setNotice("Select a shape first");
        return;
      }
      const selected = new Set(selectedIds);
      commitShapes(
        shapes.map((shape) =>
          selected.has(shape.id) && !shape.locked
            ? withHoleMode(shape, hole)
            : shape,
        ),
        selectedIds,
        hole ? "Changed selection to hole" : "Changed selection to solid",
      );
    },
    [commitShapes, hasSelection, selectedIds, shapes],
  );

  const cutSelected = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    setClipboard(selectedShapes);
    writeSharedClipboard(selectedShapes);
    commitShapes(
      shapes.filter((shape) => !selected.has(shape.id)),
      [],
      `Cut ${selectedShapes.length} shape${selectedShapes.length === 1 ? "" : "s"}`,
    );
  }, [commitShapes, hasSelection, selectedIds, selectedShapes, shapes]);

  const raiseSelected = useCallback(
    (delta: number) => {
      if (!hasSelection) {
        return;
      }
      const selected = new Set(selectedIds);
      const normal = placementWorkplane.normal;
      commitShapes(
        shapes.map((shape) =>
          selected.has(shape.id) && !shape.locked
            ? {
                ...shape,
                x: cleanNearZero(shape.x + normal.x * delta),
                z: cleanNearZero(shape.z + normal.z * delta),
                elevation: cleanNearZero((shape.elevation ?? 0) + normal.y * delta),
              }
            : shape,
        ),
        selectedIds,
        delta > 0 ? "Moved selection up" : "Moved selection down",
      );
    },
    [commitShapes, hasSelection, placementWorkplane, selectedIds, shapes],
  );

  const dropSelectedToWorkplane = useCallback(() => {
    if (!hasSelection) {
      setNotice("Select a shape first");
      return;
    }
    const selected = new Set(selectedIds);
    commitShapes(
      shapes.map((shape) => {
        if (!selected.has(shape.id) || shape.locked) return shape;
        const translation = translationToWorkplane(
          placementWorkplane,
          meshForShape(shape).vertices.map(([x, y, z]) => ({ x, y, z })),
        );
        return {
          ...shape,
          x: cleanNearZero(shape.x + translation.x),
          z: cleanNearZero(shape.z + translation.z),
          elevation: cleanNearZero((shape.elevation ?? 0) + translation.y),
        };
      }),
      selectedIds,
      "Dropped selection to the workplane",
    );
  }, [commitShapes, hasSelection, placementWorkplane, selectedIds, shapes]);

  const activateConstructionPlaneTool = useCallback(() => {
    setConstructionPlanePanelOpen((open) => !open);
    setWorkplaneMode(false);
    setNotice("Choose a principal plane or create one from a model face");
  }, []);

  const activateWorkplaneTool = useCallback(() => {
    setConstructionPlanePanelOpen(false);
    setWorkplaneMode((active) => {
      const next = !active;
      setNotice(next ? "Workplane tool: click a face or empty grid; hold Shift to reverse" : "Workplane tool cancelled");
      return next;
    });
  }, []);

  const setActivePlacementWorkplane = useCallback((next: PlacementWorkplane, source: "shape" | "base") => {
    placementWorkplaneRef.current = next;
    setPlacementWorkplane(next);
    const horizontalElevation = Math.abs(next.normal.x) < 1e-6
      && Math.abs(next.normal.y - 1) < 1e-6
      && Math.abs(next.normal.z) < 1e-6
      ? next.origin.y
      : 0;
    setPlacementElevation(horizontalElevation);
    setNotice(source === "shape"
      ? "Workplane set to selected face"
      : placementWorkplaneIsBase(next) ? "Workplane reset to base" : "Workplane updated");
  }, []);

  const setViewportPlacementWorkplane = useCallback((next: PlacementWorkplane, source: "shape" | "base") => {
    setActivePlacementWorkplane(next, source);
  }, [setActivePlacementWorkplane]);

  const closeViewportWorkplaneMode = useCallback((active: boolean) => {
    setWorkplaneMode(active);
  }, []);

  const groupSelected = useCallback(async () => {
    if (selectedShapes.length < 2) {
      setNotice("Select at least two shapes to group");
      return;
    }

    if (selectedShapes.some((shape) => shape.locked)) {
      setNotice("Unlock every selected shape before grouping");
      return;
    }

    const sourceFingerprint = projectShapesFingerprint(shapesRef.current);
    const sourceProjectId = projectInfoRef.current.projectId;
    const result = await buildGroupedShapeFromSelection(selectedShapes);
    if (projectInfoRef.current.projectId !== sourceProjectId || projectShapesFingerprint(shapesRef.current) !== sourceFingerprint) {
      setNotice("The scene changed while grouping; select the objects and try again");
      return;
    }
    const { group } = result;
    if (!group) {
      if (result.consumed) {
        const selected = new Set(selectedIds);
        commitShapes(shapesRef.current.filter((shape) => !selected.has(shape.id)), null, "Grouped: hole consumed solid");
        return;
      }
      setNotice(result.failureNotice);
      return;
    }
    const selected = new Set(selectedIds);
    const editableGroup = canonicalizeShape({ ...group, groupOperation: "group" });
    commitShapes([...shapesRef.current.filter((shape) => !selected.has(shape.id)), editableGroup], editableGroup.id, `Grouped ${selectedShapes.length} shapes`);
  }, [commitShapes, selectedIds, selectedShapes]);

  const intersectSelected = useCallback(async () => {
    const groupable = selectedShapes.filter((shape) => !shape.locked);
    const hasSolid = groupable.some((shape) => !shape.hole);
    const hasHole = groupable.some((shape) => shape.hole);
    if (!hasSolid || !hasHole) {
      setNotice("Select at least one solid and one hole for Intersection");
      return;
    }

    const sourceFingerprint = projectShapesFingerprint(shapesRef.current);
    const sourceProjectId = projectInfoRef.current.projectId;
    const result = await buildIntersectionShapeFromSelection(groupable);
    if (projectInfoRef.current.projectId !== sourceProjectId || projectShapesFingerprint(shapesRef.current) !== sourceFingerprint) {
      setNotice("The scene changed while intersecting; select the objects and try again");
      return;
    }
    if (!result.group && !result.empty) {
      setNotice(result.failureNotice);
      return;
    }

    const operandIds = new Set(groupable.map((shape) => shape.id));
    const remainingShapes = shapesRef.current.filter((shape) => !operandIds.has(shape.id));
    if (result.empty) {
      commitShapes(remainingShapes, null, "Intersection is empty");
      return;
    }

    const intersection = result.group ? canonicalizeShape({ ...result.group, groupOperation: "intersection" }) : null;
    if (!intersection) {
      return;
    }
    commitShapes([...remainingShapes, intersection], intersection.id, `Intersected ${groupable.length} shapes`);
  }, [commitShapes, selectedShapes]);

  const ungroupSelected = useCallback(() => {
    const groups = selectedShapes.filter((shape) => shape.groupedShapes?.length);
    if (groups.length === 0) {
      setNotice("Select a group first");
      return;
    }
    const groupIds = new Set(groups.map((shape) => shape.id));
    const restored = groups.flatMap(restoreGroupedChildren);
    commitShapes([...shapes.filter((shape) => !groupIds.has(shape.id)), ...restored], restored.map((shape) => shape.id), `Ungrouped ${groups.length} group${groups.length === 1 ? "" : "s"}`);
  }, [commitShapes, selectedShapes, shapes]);

  const separateSelectedParts = useCallback(() => {
    if (selectedShapes.length !== 1 || !selectedShape) {
      setNotice("Select one object to separate");
      return;
    }
    if (selectedShape.locked) {
      setNotice("Unlock the object before separating parts");
      return;
    }
    const parts = separateShapeParts(selectedShape);
    if (parts.length <= 1) {
      setNotice("The selected object has only one connected part");
      return;
    }
    commitShapes(
      [...shapes.filter((shape) => shape.id !== selectedShape.id), ...parts],
      parts.map((shape) => shape.id),
      `Separated ${parts.length} parts`,
    );
  }, [commitShapes, selectedShape, selectedShapes.length, shapes]);

  const mcpSceneSnapshot = useCallback((includeRawShapes = false): SketchForgeMcpSceneSummary & { rawShapes?: WorkplaneShape[] } => {
    const projectInfo = projectInfoRef.current;
    const currentShapes = shapesRef.current;
    return {
      projectId: projectInfo.projectId,
      projectName: projectInfo.projectName,
      notice: noticeRef.current,
      selectedIds: selectedIdsRef.current,
      shapeCount: currentShapes.length,
      workspace: workspaceSettingsRef.current,
      snap: initialSnap ?? null,
      shapes: currentShapes.map(mcpShapeSummary),
      ...(includeRawShapes ? { rawShapes: currentShapes.map((shape) => canonicalizeShape(shape)) } : {}),
    };
  }, [initialSnap]);

  const executeMcpCommand = useCallback(async (command: SketchForgeMcpCommand): Promise<unknown> => {
    const params = command.params ?? {};
    const currentShapes = () => shapesRef.current;
    const findShape = (id: unknown) => (typeof id === "string" ? currentShapes().find((shape) => shape.id === id) ?? null : null);

    try {
      lastMcpErrorRef.current = null;
      if (command.action === "get_scene") {
        return mcpSceneSnapshot(params.includeRawShapes === true);
      }

      if (command.action === "list_objects") {
        return { objects: currentShapes().map(mcpShapeSummary) };
      }

      if (command.action === "select_objects") {
        const requestedIds = mcpStringArray(params.ids ?? params.id);
        const validIds = requestedIds.filter((id) => currentShapes().some((shape) => shape.id === id));
        setSelectedIds(validIds);
        selectedIdsRef.current = validIds;
        setNotice(validIds.length ? `MCP selected ${validIds.length} object${validIds.length === 1 ? "" : "s"}` : "MCP cleared selection");
        return { selectedIds: validIds, objects: currentShapes().filter((shape) => validIds.includes(shape.id)).map(mcpShapeSummary) };
      }

      if (command.action === "delete_objects") {
        const requestedIds = mcpStringArray(params.ids ?? params.id);
        const ids = requestedIds.length ? new Set(requestedIds) : new Set(selectedIdsRef.current);
        const deleted = currentShapes().filter((shape) => ids.has(shape.id));
        if (deleted.length === 0) throw new Error("No matching objects to delete");
        commitShapes(currentShapes().filter((shape) => !ids.has(shape.id)), [], `MCP deleted ${deleted.length} object${deleted.length === 1 ? "" : "s"}`);
        selectedIdsRef.current = [];
        return { deletedIds: deleted.map((shape) => shape.id), deletedCount: deleted.length };
      }

      if (command.action === "create_shape") {
        const rawKind = mcpString(params.kind, "box");
        const kind = rawKind === "cube" ? "box" : rawKind;
        const width = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.width ?? params.size, 20));
        const depth = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.depth ?? params.size, rawKind === "cube" ? width : 20));
        const height = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.height ?? params.size, rawKind === "cube" ? width : 20));
        const x = mcpNumber(params.x, 0);
        const z = mcpNumber(params.z, 0);
        const elevation = mcpNumber(params.elevation, placementElevation);
        const color = mcpString(params.color, kind === "cylinder" ? "#d97813" : "#d41721");
        const name = mcpString(params.name, kind === "cylinder" ? "Cylinder" : kind === "sketch" ? "Sketch extrusion" : rawKind === "cube" ? "Cube" : "Box");
        let shape: WorkplaneShape;
        if (kind === "sketch") {
          const profile = defaultMcpSketchProfile(width, depth);
          const extruded = await cadShapeFromSketchProfile(profile, height);
          shape = canonicalizeShape({
            ...extruded,
            name,
            color,
            x,
            z,
            elevation,
            rotation: mcpNumber(params.rotation, 0),
            rotationX: mcpNumber(params.rotationX, 0),
            rotationZ: mcpNumber(params.rotationZ, 0),
          });
        } else if (kind === "box" || kind === "cylinder" || kind === "text") {
          shape = sceneShape({
            name,
            kind,
            color,
            x,
            z,
            elevation,
            width,
            depth,
            height,
            size: Math.max(width, depth),
            rotation: mcpNumber(params.rotation, 0),
            rotationX: mcpNumber(params.rotationX, 0),
            rotationZ: mcpNumber(params.rotationZ, 0),
            sides: kind === "cylinder" ? Math.max(3, Math.floor(mcpNumber(params.sides, 96))) : undefined,
            text: kind === "text" ? mcpString(params.text, "TEXT") : undefined,
            font: kind === "text" ? mcpString(params.font, "Multilanguage") : undefined,
            bevel: kind === "text" ? Math.max(0, mcpNumber(params.bevel, 0)) : undefined,
            segments: kind === "text" ? Math.max(1, Math.floor(mcpNumber(params.segments, 2))) : undefined,
          });
        } else {
          throw new Error("MCP create_shape currently supports box, cube, cylinder, text, and sketch");
        }
        const committedShape = canonicalizeShape(bakeShapeTransformIntoMesh(shape));
        commitShapes([...currentShapes(), committedShape], committedShape.id, `${committedShape.name} added by MCP`);
        return { object: mcpShapeSummary(committedShape) };
      }

      if (command.action === "import_mesh") {
        const positions = mcpFiniteNumberArray(params.positions);
        const normals = mcpFiniteNumberArray(params.normals);
        if (positions.length < 9 || positions.length % 9 !== 0) {
          throw new Error("import_mesh requires positions as triangle xyz values");
        }
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;
        for (let index = 0; index < positions.length; index += 3) {
          const x = positions[index];
          const y = positions[index + 1];
          const z = positions[index + 2];
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
        const width = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.width, maxX - minX));
        const depth = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.depth, maxZ - minZ));
        const height = Math.max(MIN_SHAPE_DIMENSION, mcpNumber(params.height, maxY - minY));
        const shape = canonicalizeShape({
          id: createLocalId("mcp-imported-mesh"),
          name: mcpString(params.name, "Imported mesh"),
          kind: "mesh",
          color: mcpString(params.color, "#9bd7f0"),
          x: mcpNumber(params.x, 0),
          z: mcpNumber(params.z, 0),
          elevation: mcpNumber(params.elevation, 0),
          size: Math.max(width, depth),
          width,
          depth,
          height,
          rotation: mcpNumber(params.rotation, 0),
          rotationX: mcpNumber(params.rotationX, 0),
          rotationZ: mcpNumber(params.rotationZ, 0),
          importedMesh: {
            positions,
            normals: normals.length === positions.length ? normals : undefined,
            baseWidth: width,
            baseDepth: depth,
            baseHeight: height,
            triangleCount: Math.floor(positions.length / 9),
            sourceFormat: "json",
          },
          locked: false,
          hidden: false,
        } satisfies WorkplaneShape);
        commitShapes([...currentShapes(), shape], shape.id, `${shape.name} imported by MCP`);
        return { object: mcpShapeSummary(shape) };
      }

      if (command.action === "update_object") {
        const target = findShape(params.id);
        if (!target) throw new Error("Object not found");
        if (target.locked) throw new Error("Unlock the object before updating it");
        const patch: ShapeUpdatePatch = {};
        const rotationWasRequested = [params.rotation, params.rotationX, params.rotationZ].some(
          (value) => typeof value === "number" && Number.isFinite(value),
        );
        (["x", "z", "elevation", "width", "depth", "height", "size", "rotation", "rotationX", "rotationZ"] as const).forEach((key) => {
          if (typeof params[key] === "number" && Number.isFinite(params[key])) {
            patch[key] = params[key];
          }
        });
        if (typeof params.color === "string") patch.color = params.color;
        if (typeof params.name === "string") patch.name = params.name;
        if (typeof params.hole === "boolean") patch.hole = params.hole;
        if (typeof params.text === "string") patch.text = params.text;
        if (typeof params.font === "string") patch.font = params.font;
        if (typeof params.bevel === "number" && Number.isFinite(params.bevel)) patch.bevel = Math.max(0, params.bevel);
        const nextShapes = currentShapes().map((shape) => {
          if (shape.id !== target.id) return shape;
          const patched = { ...shape, ...cleanShapePatch(patch) };
          const width = shapeWidth(patched);
          const depth = shapeDepth(patched);
          const canonical = canonicalizeShape({ ...patched, size: Math.max(width, depth) });
          return rotationWasRequested ? canonicalizeShape(bakeShapeTransformIntoMesh(canonical)) : canonical;
        });
        const updated = nextShapes.find((shape) => shape.id === target.id) as WorkplaneShape;
        commitShapes(nextShapes, target.id, `${updated.name} updated by MCP`);
        return { object: mcpShapeSummary(updated) };
      }

      if (command.action === "align_objects") {
        const axis = params.axis === "x" || params.axis === "y" || params.axis === "z" ? params.axis : null;
        const target = params.target === "min" || params.target === "center" || params.target === "max" ? params.target : null;
        if (!axis || !target) throw new Error("align_objects requires axis x/y/z and target min/center/max");
        const requestedIds = mcpStringArray(params.ids);
        const ids = requestedIds.length ? requestedIds : selectedIdsRef.current;
        const selectedForAlign = currentShapes().filter((shape) => ids.includes(shape.id));
        if (selectedForAlign.length < 2) throw new Error("Select at least two objects to align");
        const validIds = selectedForAlign.map((shape) => shape.id);
        const requestedAnchorId = typeof params.anchorId === "string" ? params.anchorId : null;
        const anchorId = effectiveAlignmentAnchorId(selectedForAlign, requestedAnchorId);
        const { nextShapes, moved } = alignedShapesForSelection(currentShapes(), validIds, selectedForAlign, anchorId, axis, target);
        if (moved === 0) {
          setSelectedIds(validIds);
          selectedIdsRef.current = validIds;
          setNotice(`MCP alignment already ${alignmentLabel(axis, target)}`);
          return {
            moved,
            selectedIds: validIds,
            anchorId,
            objects: selectedForAlign.map(mcpShapeSummary),
          };
        }
        commitShapes(nextShapes, validIds, `MCP aligned ${moved} object${moved === 1 ? "" : "s"} ${alignmentLabel(axis, target)}`);
        return {
          moved,
          selectedIds: validIds,
          anchorId,
          objects: nextShapes.filter((shape) => validIds.includes(shape.id)).map(mcpShapeSummary),
        };
      }

      if (command.action === "group_objects") {
        const ids = new Set(mcpStringArray(params.ids));
        const groupable = currentShapes().filter((shape) => ids.has(shape.id));
        if (groupable.length < 2) throw new Error("Select at least two objects to group");
        if (groupable.some((shape) => shape.locked)) throw new Error("Unlock every selected object before grouping");
        const sourceFingerprint = projectShapesFingerprint(currentShapes());
        const sourceProjectId = projectInfoRef.current.projectId;
        const result = await buildGroupedShapeFromSelection(groupable);
        if (projectInfoRef.current.projectId !== sourceProjectId || projectShapesFingerprint(currentShapes()) !== sourceFingerprint) {
          throw new Error("The scene changed while grouping; run the command again");
        }
        if (!result.group) {
          if (result.consumed) {
            commitShapes(currentShapes().filter((shape) => !ids.has(shape.id)), null, "MCP group consumed solid");
            return { consumed: true, objects: currentShapes().filter((shape) => !ids.has(shape.id)).map(mcpShapeSummary) };
          }
          throw new Error(result.failureNotice);
        }
        const editableGroup = canonicalizeShape({ ...result.group, groupOperation: "group" });
        commitShapes([...currentShapes().filter((shape) => !ids.has(shape.id)), editableGroup], editableGroup.id, `MCP grouped ${groupable.length} objects`);
        return { object: mcpShapeSummary(editableGroup) };
      }

      if (command.action === "ungroup_objects") {
        const requestedIds = mcpStringArray(params.ids ?? params.id);
        const ids = requestedIds.length ? new Set(requestedIds) : new Set(selectedIdsRef.current);
        const groups = currentShapes().filter((shape) => ids.has(shape.id) && shape.groupedShapes?.length);
        if (groups.length === 0) throw new Error("Select at least one group to ungroup");
        const groupIds = new Set(groups.map((shape) => shape.id));
        const restored = groups.flatMap(restoreGroupedChildren);
        commitShapes([...currentShapes().filter((shape) => !groupIds.has(shape.id)), ...restored], restored.map((shape) => shape.id), `MCP ungrouped ${groups.length} group${groups.length === 1 ? "" : "s"}`);
        return { objects: restored.map(mcpShapeSummary) };
      }

      if (command.action === "boolean_cut") {
        const solidIds = new Set(mcpStringArray(params.solidIds ?? params.solids));
        const holeIds = new Set(mcpStringArray(params.holeIds ?? params.holes));
        const operandIds = new Set([...solidIds, ...holeIds]);
        const operands = currentShapes()
          .filter((shape) => operandIds.has(shape.id))
          .map((shape) => holeIds.has(shape.id) ? withHoleMode(shape, true) : withHoleMode(shape, false));
        if (!operands.some((shape) => !shape.hole) || !operands.some((shape) => shape.hole)) {
          throw new Error("Provide at least one solidId and one holeId for boolean_cut");
        }
        if (operands.some((shape) => shape.locked)) {
          throw new Error("Unlock every boolean operand before cutting");
        }
        const sourceFingerprint = projectShapesFingerprint(currentShapes());
        const sourceProjectId = projectInfoRef.current.projectId;
        const result = await buildGroupedShapeFromSelection(operands);
        if (projectInfoRef.current.projectId !== sourceProjectId || projectShapesFingerprint(currentShapes()) !== sourceFingerprint) {
          throw new Error("The scene changed while cutting; run the command again");
        }
        const remainingShapes = currentShapes().filter((shape) => !operandIds.has(shape.id));
        if (result.consumed) {
          commitShapes(remainingShapes, null, "MCP cut consumed solid");
          return { consumed: true };
        }
        if (!result.group) {
          throw new Error(result.failureNotice);
        }
        const editableGroup = canonicalizeShape({ ...result.group, groupOperation: "group" });
        commitShapes([...remainingShapes, editableGroup], editableGroup.id, "MCP boolean cut complete");
        return { object: mcpShapeSummary(editableGroup) };
      }

      if (command.action === "separate_parts") {
        const target = findShape(params.id) ?? (selectedIdsRef.current.length === 1 ? findShape(selectedIdsRef.current[0]) : null);
        if (!target) throw new Error("Select one object to separate");
        if (target.locked) throw new Error("Unlock the object before separating parts");
        const parts = separateShapeParts(target);
        if (parts.length <= 1) throw new Error("The selected object has only one connected part");
        commitShapes([...currentShapes().filter((shape) => shape.id !== target.id), ...parts], parts.map((shape) => shape.id), `MCP separated ${parts.length} parts`);
        return { objects: parts.map(mcpShapeSummary) };
      }

      if (command.action === "list_edges") {
        const target = findShape(params.id);
        if (!target) throw new Error("Object not found");
        invalidateCadModifierSession();
        const sharpAngle = Math.max(1, Math.min(CAD_MODIFIER_MAX_SHARP_ANGLE, mcpNumber(params.sharpAngle, 25)));
        const { response } = await prepareCadModifierForMcp(target, sharpAngle);
        const selectableEdgeIds = response.edges.filter((edge) => selectableCadModifierEdge(edge, sharpAngle)).map((edge) => edge.id);
        return { object: mcpShapeSummary(target), sharpAngle, selectableEdgeIds, edges: response.edges };
      }

      if (command.action === "apply_edge_treatment") {
        const target = findShape(params.id);
        if (!target) throw new Error("Object not found");
        return applyCadModifierForMcp(target, params);
      }

      if (command.action === "inspect_errors") {
        return {
          notice: noticeRef.current,
          edgeModifierError: edgeModifierRef.current?.error ?? null,
          lastMcpError: lastMcpErrorRef.current,
        };
      }

      if (command.action === "capture_image") {
        const face = mcpString(params.face, "current") as SketchForgeMcpViewFace;
        const image = await (window.sketchforgeCaptureView?.(face) ?? window.sketchforgeCaptureCanvas?.() ?? "");
        if (!image || image.length < 100) {
          throw new Error("The SketchForge viewport did not return an image");
        }
        return { face, dataUrl: image, bytesApprox: Math.floor(image.length * 0.75) };
      }

      throw new Error(`Unknown MCP command: ${command.action}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastMcpErrorRef.current = message;
      setNotice(message);
      throw error;
    }
  }, [
    applyCadModifierForMcp,
    commitShapes,
    initialSnap,
    invalidateCadModifierSession,
    mcpSceneSnapshot,
    placementElevation,
    prepareCadModifierForMcp,
  ]);

  useEffect(() => {
    executeMcpCommandRef.current = executeMcpCommand;
  }, [executeMcpCommand]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }
    if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      return;
    }

    const identity = readMcpEditorIdentity();
    let stopped = false;
    let polling = false;

    const heartbeat = () => {
      const projectInfo = projectInfoRef.current;
      const currentShapes = shapesRef.current;
      void fetch(SKETCHFORGE_MCP_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "heartbeat",
          editor: {
            ...identity,
            projectId: projectInfo.projectId,
            projectName: projectInfo.projectName,
            url: window.location.href,
            focused: document.visibilityState === "visible" && document.hasFocus(),
            shapeCount: currentShapes.length,
            selectedCount: selectedIdsRef.current.length,
            notice: noticeRef.current,
            lastError: edgeModifierRef.current?.error ?? lastMcpErrorRef.current,
          },
        }),
      }).catch(() => undefined);
    };

    const submitResult = (commandId: string, ok: boolean, data?: unknown, error?: string) => {
      void fetch(SKETCHFORGE_MCP_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "result",
          editorId: identity.editorId,
          result: { commandId, ok, data, error, completedAt: Date.now() },
        }),
      }).catch(() => undefined);
    };

    const poll = async () => {
      if (polling || stopped) return;
      polling = true;
      try {
        const response = await fetch(SKETCHFORGE_MCP_ROUTE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "poll", editorId: identity.editorId }),
        });
        const payload = (await response.json().catch(() => null)) as { command?: SketchForgeMcpCommand | null } | null;
        const command = payload?.command;
        if (command) {
          try {
            const data = await executeMcpCommandRef.current?.(command);
            submitResult(command.id, true, data);
          } catch (error) {
            submitResult(command.id, false, undefined, error instanceof Error ? error.message : String(error));
          }
        }
      } catch {
        // The local bridge may not exist while static builds or tests render the editor.
      } finally {
        polling = false;
      }
    };

    heartbeat();
    void poll();
    const heartbeatTimer = window.setInterval(heartbeat, 1000);
    const pollTimer = window.setInterval(() => void poll(), SKETCHFORGE_MCP_POLL_MS);
    window.addEventListener("focus", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      stopped = true;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(pollTimer);
      window.removeEventListener("focus", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") {
      return;
    }
    if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const caseId = params.get("codexBooleanCase");
    if (!caseId) {
      return;
    }

    const modeParam = params.get("codexBooleanMode");
    const mode: BooleanAutomationMode = modeParam === "before" || modeParam === "ungroup" ? modeParam : "after";
    const runKey = `${caseId}:${mode}`;
    if (booleanAutomationRunRef.current === runKey) {
      return;
    }
    booleanAutomationRunRef.current = runKey;
    document.body.dataset.codexBooleanTestDone = "running";
    delete document.body.dataset.codexBooleanTestResult;
    delete document.body.dataset.codexBooleanTestImageReady;
    delete document.body.dataset.codexBooleanTestScreenshotPath;

    const finish = (detail: BooleanAutomationResult) => {
      window.__sketchforgeBooleanTest = detail;
      const captureCanvas = () => {
        try {
          const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
          const image = window.sketchforgeCaptureCanvas?.() ?? canvas?.toDataURL("image/png") ?? "";
          if (image.length > 100) {
            window.__sketchforgeBooleanTestImage = image;
            document.body.dataset.codexBooleanTestImageReady = "true";
            void fetch("/api/codex-screenshot", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `boolean-${detail.caseId}-${detail.mode}.png`, dataUrl: image }),
            })
              .then((response) => (response.ok ? response.json() : null))
              .then((payload: { path?: string } | null) => {
                if (payload?.path) {
                  document.body.dataset.codexBooleanTestScreenshotPath = payload.path;
                }
              })
              .catch(() => {
                document.body.dataset.codexBooleanTestImageReady = "false";
              });
          }
        } catch {
          document.body.dataset.codexBooleanTestImageReady = "false";
        }
      };
      const publish = () => {
        document.body.dataset.codexBooleanTestDone = detail.ok ? "true" : "false";
        document.body.dataset.codexBooleanTestResult = JSON.stringify(detail);
        window.dispatchEvent(new CustomEvent("sketchforge:boolean-test-done", { detail }));
      };
      publish();
      window.setTimeout(publish, 100);
      window.setTimeout(captureCanvas, 1000);
      window.setTimeout(captureCanvas, 1800);
    };

    const run = async () => {
      const testCase = booleanAutomationScene(caseId);
      if (!testCase) {
        finish({
          ok: false,
          caseId,
          label: "Unknown boolean test",
          mode,
          notice: "Unknown boolean automation case",
          shapeCount: 0,
          selectedCount: 0,
          error: `Unknown boolean automation case: ${caseId}`,
        });
        return;
      }

      const ids = testCase.shapes.map((shape) => shape.id);
      if (mode === "before") {
        const noticeText = `Boolean test before: ${testCase.label}`;
        commitShapes(testCase.shapes, ids, noticeText);
        finish({
          ok: true,
          caseId,
          label: testCase.label,
          mode,
          notice: noticeText,
          shapeCount: testCase.shapes.length,
          selectedCount: ids.length,
        });
        return;
      }

      const result = await buildGroupedShapeFromSelection(testCase.shapes);
      if (!result.group) {
        const noticeText = result.consumed ? "Grouped: hole consumed solid" : result.failureNotice;
        commitShapes(result.consumed ? [] : testCase.shapes, result.consumed ? [] : ids, noticeText);
        finish({
          ok: result.consumed,
          caseId,
          label: testCase.label,
          mode,
          notice: noticeText,
          shapeCount: result.consumed ? 0 : testCase.shapes.length,
          selectedCount: result.consumed ? 0 : ids.length,
          error: result.consumed ? undefined : result.failureNotice,
        });
        return;
      }

      const triangleCount = result.group.importedMesh?.triangleCount ?? meshForShape(result.group).faces.length;
      const groupedCount = result.group.groupedShapes?.length ?? 0;
      if (mode === "ungroup") {
        const restored = restoreGroupedChildren(result.group);
        const noticeText = `Boolean test ungrouped: ${testCase.label}`;
        commitShapes(restored, restored.map((shape) => shape.id), noticeText);
        finish({
          ok: restored.length === groupedCount,
          caseId,
          label: testCase.label,
          mode,
          notice: noticeText,
          shapeCount: restored.length,
          selectedCount: restored.length,
          triangleCount,
          groupedCount,
          groupId: result.group.id,
        });
        return;
      }

      const noticeText = `Boolean test after: ${testCase.label}`;
      commitShapes([result.group], result.group.id, noticeText);
      finish({
        ok: true,
        caseId,
        label: testCase.label,
        mode,
        notice: noticeText,
        shapeCount: 1,
        selectedCount: 1,
        triangleCount,
        groupedCount,
        groupId: result.group.id,
      });
    };

    void run();
  }, [commitShapes]);

  const exportDesign = useCallback((format: DirectExportFormat, exportName: string) => {
    const sourceShapes = hasSelection ? selectedShapes : shapes;
    const exportable = sourceShapes.filter((shape) => !shape.hole && shape.kind !== "constructionPlane");
    if (exportable.length === 0) {
      setNotice(hasSelection ? "Select at least one solid shape before exporting" : "Add a solid shape before exporting");
      return;
    }
    const invalidSvg = exportable.map(invalidSvgMeshReason).find((reason): reason is string => Boolean(reason));
    if (invalidSvg) {
      setNotice(`${invalidSvg}. Re-import the source SVG after fixing its contours`);
      return;
    }
    const selectedNotice = `Exported ${exportable.length} selected shape${exportable.length === 1 ? "" : "s"}`;
    const finishNotice = (label: string, result: DownloadResult) => {
      if (result.mode === "folder") {
        setNotice(`Saved ${label} to ${result.path}`);
        return;
      }
      setNotice(hasSelection ? `${selectedNotice} as ${label}` : `Exported ${label}`);
    };
    const failNotice = (label: string, error: unknown) => {
      setNotice(error instanceof Error ? error.message : `Could not export ${label}`);
    };
    if (format === "svg") {
      setNotice("Building SVG top-view projection…");
      void toSvg(exportable, exportName.trim() || projectName)
        .then((content) => downloadTextFile(projectExportFileName(exportName, "svg"), content, "image/svg+xml;charset=utf-8"))
        .then((result) => finishNotice("SVG", result))
        .catch((error: unknown) => failNotice("SVG", error));
      return;
    }
    const meshes = exportable.map(meshForShape);
    if (format === "3mf") {
      void Promise.resolve()
        .then(() => {
          const bytes = exportMeshesTo3mf(exportable.map((shape, index) => ({ ...meshes[index], color: shape.color })), exportName.trim() || projectName);
          const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
          return downloadBlobFile(projectExportFileName(exportName, "3mf"), new Blob([buffer], { type: "model/3mf" }));
        })
        .then((result) => finishNotice("3MF", result))
        .catch((error: unknown) => failNotice("3MF", error));
      return;
    }
    if (format === "stl") {
      void downloadTextFile(projectExportFileName(exportName, "stl"), exportMeshesToStl(meshes), "model/stl")
        .then((result) => finishNotice("STL", result))
        .catch((error: unknown) => failNotice("STL", error));
      return;
    }
    void downloadTextFile(projectExportFileName(exportName, "obj"), exportMeshesToObj(meshes), "text/plain")
      .then((result) => finishNotice("OBJ", result))
      .catch((error: unknown) => failNotice("OBJ", error));
  }, [hasSelection, projectName, selectedShapes, shapes]);

  const exportStepDesign = useCallback(async (exportName: string) => {
    if (stepExporting) {
      return;
    }
    const sourceShapes = (hasSelection ? selectedShapes : shapes).filter((shape) => shape.kind !== "constructionPlane");
    if (sourceShapes.some((shape) => shape.hole) && !sourceShapes.some((shape) => !shape.hole)) {
      setNotice("Select at least one solid shape before exporting STEP");
      return;
    }
    setStepExporting(true);
    setNotice("Building B-Rep… first STEP export loads the OpenCascade kernel (~22 MB), one time per session");
    try {
      const { exportShapesToStep } = await import("@/lib/stepExport");
      const { blob, exportedCount, skipped } = await exportShapesToStep(sourceShapes);
      const text = await blob.text();
      const result = await downloadTextFile(projectExportFileName(exportName, "step"), text, "application/step");
      const skipNote = skipped.length > 0 ? `; skipped ${skipped.length} non-primitive shape${skipped.length === 1 ? "" : "s"}` : "";
      if (result.mode === "folder") {
        setNotice(`Saved STEP (${exportedCount} bod${exportedCount === 1 ? "y" : "ies"}) to ${result.path}${skipNote}`);
      } else {
        setNotice(`Exported STEP B-Rep with ${exportedCount} bod${exportedCount === 1 ? "y" : "ies"}${skipNote}`);
      }
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "Could not export STEP");
    } finally {
      setStepExporting(false);
    }
  }, [hasSelection, projectName, selectedShapes, shapes, stepExporting]);

  const exportSkfDesign = useCallback(async (exportName: string, historyLimit: SkfHistoryLimit, target: SkfExportTarget = "download") => {
    if (skfExporting) return;
    if (target === "shared" && !onSaveSharedProject) {
      setNotice("Shared project storage is not available in this deployment");
      return;
    }
    if (projectInteractionActiveRef.current) {
      setNotice("Finish the current drag or transform before saving the project file");
      return;
    }
    setSkfExporting(true);
    setNotice(target === "shared" ? "Packaging project for Docker shared storage…" : "Packaging editable project, history, and deduplicated assets…");
    try {
      const exportedHistory = editorHistoryForExport(historyRef.current, historyIndexRef.current, historyLimit);
      const bytes = await exportSkfProject({
        projectId: projectInfoRef.current.projectId,
        projectName: exportName.trim() || projectName,
        createdAt: projectCreatedAt,
        modifiedAt: projectModifiedAt,
        shapes: shapesRef.current,
        history: exportedHistory.entries,
        historyIndex: exportedHistory.index,
        assets: projectAssetsRef.current,
        workspace: workspaceSettingsRef.current,
        snapGrid,
        placementElevation,
        placementWorkplane,
        sketchPlacementWorkplane: placementWorkplane,
      });
      if (target === "shared" && onSaveSharedProject) {
        setNotice(await onSaveSharedProject({ exportName: exportName.trim() || projectName, bytes }));
      } else {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        const result = await downloadBlobFile(projectExportFileName(exportName, "skf"), new Blob([buffer], { type: SKF_MEDIA_TYPE }));
        setNotice(result.mode === "folder" ? `Saved editable SketchForge project to ${result.path}` : "Saved editable SketchForge project (.skf)");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save SketchForge project");
    } finally {
      setSkfExporting(false);
    }
  }, [onSaveSharedProject, placementElevation, placementWorkplane, projectCreatedAt, projectModifiedAt, projectName, skfExporting, snapGrid]);

  const clearDesign = useCallback(() => {
    commitShapes([], [], "New empty design");
    setClipboard([]);
    setMenuOpen(false);
    setTopPanel(null);
  }, [commitShapes]);

  const createHouseScene = useCallback(
    (replace = true) => {
      const house = makeHouseScene();
      const next = replace ? house : [...shapes, ...house];
      commitShapes(next, house.map((shape) => shape.id), "House scene created");
      setMenuOpen(false);
      setTopPanel(null);
      return house;
    },
    [commitShapes, shapes],
  );

  const createPerfScene = useCallback(
    (count = 500) => {
      const scene = makeBlockPerfScene(count);
      commitShapes(scene, [], `Performance scene: ${scene.length} blocks`);
      setMenuOpen(false);
      setTopPanel(null);
      return scene;
    },
    [commitShapes],
  );

  const saveDesign = useCallback(() => {
    setNotice(`Saved design with ${shapes.length} shape${shapes.length === 1 ? "" : "s"}`);
    setMenuOpen(false);
  }, [shapes.length]);

  const makeCopy = useCallback(() => {
    if (shapes.length === 0) {
      setNotice("Nothing to copy yet");
      setMenuOpen(false);
      return;
    }
    const copies = shapes.map((shape) => ({
      ...shape,
      id: createLocalId(`${shape.id}-copy`),
      x: Math.min(110, shape.x + 12),
      z: Math.min(110, shape.z + 12),
    }));
    commitShapes([...shapes, ...copies], copies.map((shape) => shape.id), "Made a copy of the design");
    setMenuOpen(false);
  }, [commitShapes, shapes]);

  const importFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const projectFiles = files.filter((file) => /\.skf$/i.test(file.name));
    if (projectFiles.length) {
      if (files.length !== 1) {
        setNotice("Open one .skf project at a time; import 3MF, STL, STEP, and SVG geometry separately");
        return;
      }
      if (!onOpenSkfProjectFile) {
        setNotice("Opening SketchForge project files is unavailable here");
        return;
      }
      setNotice(`Validating ${projectFiles[0].name} before opening it as a new project`);
      const result = await onOpenSkfProjectFile(projectFiles[0]);
      if (result?.message) setNotice(result.message);
      if (result?.ok !== false) setTopPanel(null);
      return;
    }
    const sourceProjectId = projectInfoRef.current.projectId;
    const importedShapes: WorkplaneShape[] = [];
    const importedAssets: ProjectAsset[] = [];
    const failures: Array<{ fileName: string; reason: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (projectInfoRef.current.projectId !== sourceProjectId) {
        setNotice(`Import of ${files.length} files cancelled because the project changed`);
        return;
      }

      const sourceFormat = sourceFormatForFileName(file.name) ?? (file.type === "model/3mf" ? "3mf" : file.type === "image/svg+xml" ? "svg" : null);
      const isThreeMf = sourceFormat === "3mf";
      const isStep = sourceFormat === "step";
      const isSvg = sourceFormat === "svg";
      if (!sourceFormat || sourceFormat === "obj" || (!isThreeMf && !isStep && !isSvg && !importExtensionSupported(file.name))) {
        failures.push({ fileName: file.name, reason: "Unsupported file type" });
        continue;
      }
      if (isThreeMf && file.size > MAX_PROJECT_ASSET_BYTES) {
        failures.push({ fileName: file.name, reason: "3MF file exceeds the 256 MB archive limit" });
        continue;
      }

      setNotice(`Importing ${index + 1} of ${files.length}: ${file.name}${isStep ? "… first STEP import loads the OpenCascade kernel (~22 MB)" : ""}`);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let nextShape: WorkplaneShape;
        if (isStep) {
          const { importedShapeFromStep } = await import("@/lib/stepImport");
          nextShape = await importedShapeFromStep(file.name, buffer);
        } else if (isSvg) {
          nextShape = importedShapeFromSvg(file.name, new TextDecoder().decode(bytes));
        } else if (isThreeMf) {
          nextShape = importedShapeFrom3mf(file.name, buffer);
        } else {
          nextShape = importedShapeFromStl(file.name, buffer);
        }
        const asset = await projectAssetFromBytes(file.name, sourceFormat, bytes, file.type);
        importedShapes.push(attachProjectAsset(nextShape, asset.id));
        importedAssets.push(asset);
      } catch (error) {
        failures.push({
          fileName: file.name,
          reason: error instanceof Error ? error.message : "Could not read file",
        });
      }
    }

    if (projectInfoRef.current.projectId !== sourceProjectId) {
      setNotice(`Import of ${files.length} files cancelled because the project changed`);
      return;
    }

    const failureDetails = failures
      .slice(0, 3)
      .map((failure) => `${failure.fileName}: ${failure.reason}`)
      .join("; ");
    const remainingFailureCount = Math.max(0, failures.length - 3);
    const failureSummary = failures.length
      ? ` Failed: ${failureDetails}${remainingFailureCount ? `; plus ${remainingFailureCount} more` : ""}`
      : "";

    if (!importedShapes.length) {
      setNotice(files.length === 1 && failures[0] ? failures[0].reason : `Could not import any of the ${files.length} selected files.${failureSummary}`);
      return;
    }

    const successSummary = importedShapes.length === 1 && files.length === 1
      ? `Imported ${files[0].name}`
      : `Imported ${importedShapes.length} of ${files.length} files`;
    const nextAssets = dedupeProjectAssets([...projectAssetsRef.current, ...importedAssets]);
    projectAssetsRef.current = nextAssets;
    setProjectAssets(nextAssets);
    commitShapes(
      [...shapesRef.current, ...importedShapes],
      importedShapes.map((shape) => shape.id),
      `${successSummary}.${failureSummary}`.trim(),
    );
    setTopPanel(null);
  }, [commitShapes, onOpenSkfProjectFile]);

  const selectFiles = useCallback(
    (files: FileList | File[]) => {
      const selectedFiles = Array.from(files);
      if (selectedFiles.length) void importFiles(selectedFiles);
    },
    [importFiles],
  );

  const selectShape = useCallback((id: string | string[] | null, mode: "replace" | "toggle" = "replace") => {
    const activatedId = Array.isArray(id) ? id.at(-1) : id;
    const activatedPlane = activatedId ? shapesRef.current.find((shape) => shape.id === activatedId && shape.kind === "constructionPlane") : null;
    if (activatedPlane) {
      setActiveConstructionPlaneId(activatedPlane.id);
      setNotice(`${activatedPlane.name} is now the active sketch plane`);
    }
    setSelectedIds((current) => {
      if (Array.isArray(id)) {
        const unique = id.filter((entry, index) => id.indexOf(entry) === index);
        return mode === "toggle" ? unique.reduce((next, entry) => (next.includes(entry) ? next.filter((selected) => selected !== entry) : [...next, entry]), current) : unique;
      }
      if (!id) {
        return mode === "toggle" ? current : [];
      }
      if (mode === "toggle") {
        return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
      }
      return [id];
    });
  }, []);

  const nudgeSelected = useCallback(
    (deltaX: number, deltaZ: number) => {
      if (!hasSelection) {
        return;
      }
      const selected = new Set(selectedIds);
      const translation = {
        x: placementWorkplane.xAxis.x * deltaX + placementWorkplane.zAxis.x * deltaZ,
        y: placementWorkplane.xAxis.y * deltaX + placementWorkplane.zAxis.y * deltaZ,
        z: placementWorkplane.xAxis.z * deltaX + placementWorkplane.zAxis.z * deltaZ,
      };
      commitShapes(
        shapes.map((shape) =>
          selected.has(shape.id) && !shape.locked
            ? {
                ...shape,
                x: cleanNearZero(shape.x + translation.x),
                z: cleanNearZero(shape.z + translation.z),
                elevation: cleanNearZero((shape.elevation ?? 0) + translation.y),
              }
            : shape,
        ),
        selectedIds,
        `Moved ${selectedShapes.length} shape${selectedShapes.length === 1 ? "" : "s"}`,
      );
    },
    [commitShapes, hasSelection, placementWorkplane, selectedIds, selectedShapes.length, shapes],
  );

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const shortcut = event.ctrlKey || event.metaKey;

      if (sketchActive && toolbarMode === "sketch") {
        if (event.key === "Escape") {
          event.preventDefault();
          setSketchActivePointId(null);
          setSketchCircleDraft(null);
          setSketchRectDraft(null);
          setSketchPolygonDraft(null);
          setSketchTextDraft(null);
          setSketchSelection(null);
          setNotice("Current sketch chain cleared");
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          if (sketchSelection) deleteSelectedSketchEntity();
          else if (sketchMeasurement) clearSketchMeasurement();
          else deleteSelectedSketchEntity();
        } else if (shortcut && key === "z") {
          event.preventDefault();
          if (event.shiftKey) sketchRedo();
          else sketchUndo();
        } else if (shortcut && key === "y") {
          event.preventDefault();
          sketchRedo();
        }
        return;
      }

      if (event.key === "Escape") {
        setSelectedIds([]);
        setNotice("Selection cleared");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (shortcut && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (shortcut && key === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (shortcut && key === "c") {
        event.preventDefault();
        copySelected();
        return;
      }

      if (shortcut && key === "x") {
        event.preventDefault();
        cutSelected();
        return;
      }

      if (shortcut && key === "v") {
        event.preventDefault();
        pasteShape();
        return;
      }

      if (shortcut && key === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }

      if (shortcut && key === "a") {
        event.preventDefault();
        setSelectedIds(shapes.filter((shape) => !shape.hidden).map((shape) => shape.id));
        setNotice("Selected all visible shapes");
        return;
      }

      if (shortcut && key === "g") {
        event.preventDefault();
        if (event.shiftKey) {
          ungroupSelected();
        } else {
          groupSelected();
        }
        return;
      }

      if (shortcut && key === "l") {
        event.preventDefault();
        toggleLocked();
        return;
      }

      if (shortcut && key === "h") {
        event.preventDefault();
        if (event.shiftKey) {
          showHidden();
        } else {
          toggleHidden();
        }
        return;
      }

      const step = event.shiftKey ? 5 : 1;
      if (shortcut && event.key === "ArrowUp") {
        event.preventDefault();
        raiseSelected(step);
      } else if (shortcut && event.key === "ArrowDown") {
        event.preventDefault();
        raiseSelected(-step);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeSelected(-step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeSelected(step, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeSelected(0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeSelected(0, step);
      } else if (key === "d" && hasSelection) {
        event.preventDefault();
        dropSelectedToWorkplane();
      } else if (key === "h") {
        event.preventDefault();
        setSelectionHoleMode(true);
      } else if (key === "s") {
        event.preventDefault();
        setSelectionHoleMode(false);
      } else if (key === "l") {
        event.preventDefault();
        toggleAlignMode();
      } else if (key === "m") {
        event.preventDefault();
        toggleMirrorMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    commitShapes,
    clearSketchMeasurement,
    copySelected,
    cutSelected,
    deleteSelected,
    deleteSelectedSketchEntity,
    duplicateSelected,
    dropSelectedToWorkplane,
    groupSelected,
    hasSelection,
    nudgeSelected,
    pasteShape,
    raiseSelected,
    redo,
    sketchActive,
    sketchRedo,
    sketchMeasurement,
    sketchSelection,
    sketchUndo,
    setSelectionHoleMode,
    showHidden,
    toggleAlignMode,
    toggleHidden,
    toggleMirrorMode,
    toggleLocked,
    toolbarMode,
    undo,
    ungroupSelected,
  ]);

  return (
    <div className="sketchforge-editor" style={themeStyles}>
      <SecondaryToolbar
        toolbarMode={toolbarMode}
        onToolbarModeChange={(mode) => {
          setToolbarMode(mode);
          setWorkplaneMode(false);
          setTopPanel(null);
          setMenuOpen(false);
        }}
        canUndo={!projectInteractionActive && (historyIndex > 0 || Boolean(edgeModifier))}
        canRedo={!projectInteractionActive && historyIndex < history.length - 1}
        canGroup={selectedShapes.length > 1 && selectedShapes.every((shape) => !shape.locked)}
        canIntersect={selectedShapes.some((shape) => !shape.locked && !shape.hole) && selectedShapes.some((shape) => !shape.locked && Boolean(shape.hole))}
        canUngroup={selectedShapes.some((shape) => Boolean(shape.groupedShapes?.length))}
        hasClipboard={clipboard.length > 0 || systemClipboardSupported}
        hasSelection={hasSelection}
        hiddenShapeCount={shapes.filter((shape) => shape.hidden).length}
        selectionHidden={hasSelection && selectedShapes.every((shape) => shape.hidden)}
        alignMode={alignMode}
        canAlign={selectedShapes.length > 1}
        canEdgeModify={selectedShapes.length === 1 && Boolean(selectedShape && !selectedShape.locked && !selectedShape.hole)}
        edgeModifierKind={edgeModifier?.kind ?? null}
        mirrorMode={mirrorMode}
        sketchActive={sketchActive}
        sketchOperation={sketchOperation}
        sketchTool={sketchTool}
        sketchPolygonSides={sketchPolygonSides}
        onSketchPolygonSidesChange={setSketchPolygonSides}
        sketchCanUndo={sketchHistoryIndex > 0}
        sketchCanRedo={sketchHistoryIndex < sketchHistory.length - 1}
        sketchHasSelection={Boolean(sketchSelection) && sketchTool === "select"}
        sketchHasSegmentSelection={sketchTool === "select" && sketchTransformSelection(sketchSelection).segmentIds.length > 0}
        sketchCanProject={shapes.some((shape) => shape.kind !== "constructionPlane" && shape.id !== editingSketchShapeId)}
        canEditSketch={selectedShapes.length === 1 && Boolean(selectedShape?.sketchProfile)}
        onStartSketch={(operation) => beginSketch(operation)}
        onEditSketch={beginSketchEdit}
        onSketchTool={setActiveSketchTool}
        onSketchImage={() => {
          if (sketchTool !== "select") {
            setNotice("Choose Select before adding a sketch image");
            return;
          }
          sketchImageInputRef.current?.click();
        }}
        onSketchUndo={sketchUndo}
        onSketchRedo={sketchRedo}
        onSketchFinish={finishSketch}
        onSketchCancel={cancelSketch}
        onSketchSweep={() => openSketchCommand("sweep")}
        onSketchProject={() => openSketchCommand("project")}
        onSketchOffset={() => openSketchCommand("offset")}
        onSketchMirror={() => openSketchCommand("mirror")}
        onSketchRectangularPattern={() => openSketchCommand("rectangular-pattern")}
        onSketchCircularPattern={() => openSketchCommand("circular-pattern")}
        onHome={onHome}
        onAlign={toggleAlignMode}
        onChamfer={() => edgeModifier?.kind === "chamfer" ? cancelEdgeModifier() : startEdgeModifier("chamfer")}
        onCopy={copySelected}
        onDelete={deleteSelected}
        onDuplicate={duplicateSelected}
        onDropToWorkplane={dropSelectedToWorkplane}
        onGroup={groupSelected}
        onIntersect={intersectSelected}
        onFillet={() => edgeModifier?.kind === "fillet" ? cancelEdgeModifier() : startEdgeModifier("fillet")}
        onMirror={toggleMirrorMode}
        onPaste={pasteShape}
        onRedo={redo}
        onSnap={snapSelected}
        onShowHidden={showHidden}
        onToggleHidden={toggleHidden}
        onUngroup={ungroupSelected}
        onUndo={undo}
        onWorkplaneTool={activateConstructionPlaneTool}
        workplaneMode={workplaneMode || constructionPlanePanelOpen}
        onTopPanel={(panel) => {
          setTopPanel((current) => (current === panel ? null : panel));
          setMenuOpen(false);
        }}
        onAddShape={(shape) => {
          addShape(shape);
          setTopPanel(null);
          setMenuOpen(false);
        }}
      />
      <div className="editor-body">
        {toolbarMode === "sketch" && sketchActive ? (
          <>
            <SketchWorkspace
            profile={sketchProfile}
            operation={sketchOperation}
            selectedRegionIds={selectedSketchRegionIds}
            revolvePreviewPositions={sketchRevolvePreview?.positions ?? null}
            referenceShapes={sketchReferenceShapes.filter((shape) => shape.id !== editingSketchShapeId && shape.kind !== "constructionPlane")}
            tool={sketchTool}
            activePointId={sketchActivePointId}
            selected={sketchSelection}
            measurement={sketchMeasurement}
            pendingMeasurementStart={sketchMeasureStart}
            circleDraft={sketchCircleDraft}
            rectDraft={sketchRectDraft}
            polygonDraft={sketchPolygonDraft}
            textDraft={sketchTextDraft}
            initialSnap={snapGrid}
            initialWorkspace={workspaceSettings}
            planeName={sketchConstructionPlaneId === BASE_CONSTRUCTION_PLANE_ID ? "Base XZ plane" : constructionPlanes.find((plane) => plane.id === sketchConstructionPlaneId)?.name ?? "Construction plane"}
            onPlanePoint={addSketchPlanePoint}
            onPointPress={pressSketchPoint}
            onSelectSegment={(id) => {
              const segment = sketchProfile.segments.find((entry) => entry.id === id);
              if (sketchTool === "dimension" && segment?.kind && segment.kind !== "line") {
                setNotice("Length dimensions currently apply to straight sketch lines");
                return;
              }
              setSketchSelection({ kind: "segment", id });
              setSketchActivePointId(null);
            }}
            onSelectRegion={(id) => {
              const next = selectedSketchRegionIds.includes(id)
                ? selectedSketchRegionIds.filter((regionId) => regionId !== id)
                : [...selectedSketchRegionIds, id];
              setSketchExtrusionRegionIds(next);
              setSketchSelection(null);
              setSketchActivePointId(null);
              setNotice(next.length ? `${next.length} extrusion profile${next.length === 1 ? "" : "s"} selected` : "No extrusion profiles selected");
            }}
            onSelectAllRegions={() => {
              setSketchExtrusionRegionIds([...sketchCadRegionIds]);
              setNotice(`All ${sketchCadRegionIds.length} extrusion profile${sketchCadRegionIds.length === 1 ? "" : "s"} selected`);
            }}
            onClearRegionSelection={() => {
              setSketchExtrusionRegionIds([]);
              setNotice("No extrusion profiles selected");
            }}
            onSelectMany={(pointIds, segmentIds, imageIds, textIds) => {
              setSketchSelection(pointIds.length || segmentIds.length || imageIds.length || textIds.length ? { kind: "multiple", pointIds, segmentIds, imageIds, textIds } : null);
              setSketchActivePointId(null);
              const count = pointIds.length + segmentIds.length + imageIds.length + textIds.length;
              setNotice(count ? `Selected ${count} sketch item${count === 1 ? "" : "s"}` : "Sketch selection cleared");
            }}
            onSelectImage={(id) => {
              setSketchSelection({ kind: "image", id });
              setSketchActivePointId(null);
              setNotice("Sketch image selected");
            }}
            onSelectText={(id) => {
              setSketchSelection({ kind: "text", id });
              setSketchActivePointId(null);
              setNotice("Sketch text selected");
            }}
            onUpdateImage={updateSketchImage}
            onDeleteImage={deleteSketchImage}
            onDeletePoint={deleteSketchPoint}
            onDeleteSegment={deleteSketchSegment}
            onMovePoint={moveSketchPoint}
            onMovePoints={moveSketchPoints}
            onMoveHandle={moveSketchHandle}
            onMoveDimension={moveSketchDimension}
            onInsertPoint={insertSketchPoint}
            onSetPointMode={setSketchPointMode}
            onTogglePointFixed={toggleSketchPointFixed}
            onToggleSegmentConstraint={toggleSketchSegmentConstraint}
            onSetSegmentLength={updateSketchSegmentLength}
            onAddDistanceDimension={addSketchDistanceDimension}
            onDeleteDimension={deleteSketchDimension}
            onClearMeasurement={clearSketchMeasurement}
            onTextSubmit={(text) => {
              if (!sketchTextDraft) return;
              const font = booleanTextFonts.Sans ?? booleanTextFonts.Multilanguage;
              const geometry = textSketchGeometry(text, font, 10, sketchTextDraft.position);
              const next: SketchProfile = {
                ...sketchProfile,
                points: [...sketchProfile.points, ...geometry.points],
                segments: [...sketchProfile.segments, ...geometry.segments],
              };
              commitSketchProfile(next, "Text geometry added to sketch");
              setSketchTextDraft(null);
              setSketchSelection({
                kind: "multiple",
                pointIds: geometry.points.map((p) => p.id),
                segmentIds: geometry.segments.map((s) => s.id),
              });
              setNotice("Text geometry placed on sketch");
            }}
            onTextCancel={() => {
              setSketchTextDraft(null);
              setNotice("Text cancelled");
            }}
            />
            {sketchCommand ? (
              <SketchOperationPanel
                key={sketchCommand}
                command={sketchCommand}
                profile={sketchProfile}
                selection={sketchSelection}
                projectionSources={shapes.filter((shape) => shape.kind !== "constructionPlane" && shape.id !== editingSketchShapeId)}
                onProject={applySketchProject}
                onOffset={applySketchOffset}
                onMirror={applySketchMirror}
                onRectangularPattern={applySketchRectangularPattern}
                onCircularPattern={applySketchCircularPattern}
                onSweep={createSketchSweep}
                onClose={() => setSketchCommand(null)}
              />
            ) : null}
          </>
        ) : (
          <WorkplaneViewport
            theme={activeTheme}
            externalWorkspace={workspaceSettings}
          shapes={viewportShapes}
          selectedIds={selectedIds}
          alignMode={alignMode}
          alignAnchorId={effectiveAlignAnchorId}
          alignHandles={alignHandleStatuses}
          alignReferenceShapes={shapes}
          mirrorMode={mirrorMode}
          mirrorReferenceShapes={shapes}
          placementWorkplane={placementWorkplane}
          workplaneMode={workplaneMode}
          initialSnap={snapGrid}
          initialWorkspace={workspaceSettings}
          workspaceSettingsKey={projectId ?? "local-workplane"}
          onAddShape={addShape}
          onAlignAnchorChange={chooseAlignAnchor}
          onAlignPreview={previewAlignSelection}
          onAlignPreviewClear={clearAlignPreview}
          onAlignSelection={alignSelectionTo}
          onMirrorPreview={previewMirrorSelection}
          onMirrorPreviewClear={clearMirrorPreview}
          onMirrorSelection={mirrorSelectionAcross}
          onSelectShape={selectShape}
          onCreateFaceConstructionPlane={createFaceConstructionPlane}
          onSetPlacementWorkplane={setViewportPlacementWorkplane}
          onToggleWorkplaneTool={activateWorkplaneTool}
          onInteractionActiveChange={updateProjectInteractionActive}
          onEditSketch={beginSketchEdit}
          canSeparateParts={canSeparateSelectedParts}
          onSeparateParts={separateSelectedParts}
          onUpdateShape={updateShape}
          onWorkspaceSettingsChange={updateProjectWorkspaceSettings}
          onWorkplaneModeChange={closeViewportWorkplaneMode}
          modifierActive={Boolean(edgeModifier)}
          modifierPreviewActive={Boolean(edgeModifier?.preview)}
          modifierEdges={edgeModifier?.edges.filter((edge) => modifierAvailableEdgeIds.includes(edge.id)) ?? []}
          selectedModifierEdgeIds={edgeModifier?.selectedEdgeIds ?? []}
          onModifierEdgeToggle={toggleModifierEdge}
          challengeTutorial={challengeTutorial}
          onChallengeTutorialFinish={onChallengeTutorialFinish}
          resolvedTheme={resolvedTheme}
          />
        )}
        {toolbarMode === "geometry" && constructionPlanePanelOpen ? (
          <ConstructionPlanePanel
            planes={constructionPlanes}
            activeId={activeConstructionPlaneId}
            onCreatePrincipal={createPrincipalConstructionPlane}
            onCreateAnglePlane={createAngleConstructionPlane}
            onCreateMidplane={createMidplaneConstructionPlane}
            onPickFace={() => {
              setConstructionPlanePanelOpen(false);
              setWorkplaneMode(true);
              setNotice("Click a planar model face to create an associative construction plane");
            }}
            onActivate={(id) => {
              setActiveConstructionPlaneId(id);
              setSelectedIds([]);
              if (id === BASE_CONSTRUCTION_PLANE_ID) {
                setNotice("Base XZ plane is now active for sketches");
              } else {
                setNotice(`${constructionPlanes.find((plane) => plane.id === id)?.name ?? "Construction plane"} is now active for sketches`);
              }
            }}
            onClose={() => setConstructionPlanePanelOpen(false)}
          />
        ) : null}
      </div>
      {edgeModifier ? (
        <EdgeModifierPanel
          kind={edgeModifier.kind}
          amount={edgeModifier.amount}
          maxAmount={edgeModifierMaxAmount}
          chamferAngle={edgeModifier.chamferAngle}
          quality={edgeModifier.quality}
          sharpAngle={edgeModifier.sharpAngle}
          workspace={workspaceSettings}
          tangentChain={edgeModifier.tangentChain}
          preserveEdgeSize={edgeModifier.preserveEdgeSize}
          targetName={selectedShape?.name ?? "Object"}
          groupedCount={selectedShape?.groupedShapes?.length ?? 0}
          appliedFeatureCount={selectedEdgeFeatureCount}
          reversibleFeatureCount={selectedReversibleEdgeFeatureCount}
          historyOptions={selectedEdgeHistoryOptions}
          selectedCount={edgeModifier.selectedEdgeIds.length}
          availableCount={modifierAvailableEdgeIds.length}
          busy={edgeModifier.busy}
          prepared={edgeModifier.prepared}
          error={edgeModifier.error}
          onAmountChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, amount: Math.max(MIN_EDGE_MODIFIER_AMOUNT, Math.min(edgeModifierMaxAmount, value)), preview: null, busy: true, error: null } : current)}
          onChamferAngleChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, chamferAngle: Math.max(5, Math.min(85, value)), preview: null, busy: true, error: null } : current)}
          onQualityChange={(quality) => setEdgeModifier((current) => current?.prepared ? { ...current, quality, preview: null, busy: true, error: null } : current)}
          onSharpAngleChange={(sharpAngle) => setEdgeModifier((current) => {
            if (!current?.prepared) return current;
            const nextAngle = Math.max(1, Math.min(CAD_MODIFIER_MAX_SHARP_ANGLE, sharpAngle));
            const availableIds = new Set(current.edges
              .filter((edge) => selectableCadModifierEdge(edge, nextAngle))
              .map((edge) => edge.id));
            const selectedEdgeIds = current.selectedEdgeIds.filter((edgeId) => availableIds.has(edgeId));
            return {
              ...current,
              sharpAngle: nextAngle,
              selectedEdgeIds,
              preview: null,
              busy: selectedEdgeIds.length > 0,
              error: availableIds.size === 0 ? "No sharp edges match this threshold" : selectedEdgeIds.length ? null : "Select at least one highlighted edge",
            };
          })}
          onTangentChainChange={(tangentChain) => setEdgeModifier((current) => current?.prepared ? { ...current, tangentChain } : current)}
          onPreserveEdgeSizeChange={(preserveEdgeSize) => setEdgeModifier((current) => current?.prepared ? { ...current, preserveEdgeSize } : current)}
          onSelectAll={() => setEdgeModifier((current) => current?.prepared ? { ...current, selectedEdgeIds: modifierAvailableEdgeIds, preview: null, busy: modifierAvailableEdgeIds.length > 0, error: modifierAvailableEdgeIds.length ? null : current.error } : current)}
          onClear={() => setEdgeModifier((current) => current?.prepared ? { ...current, selectedEdgeIds: [], preview: null, busy: false, error: "Select at least one highlighted edge" } : current)}
          onRemoveFeature={removeEdgeTreatment}
          onApply={applyEdgeModifier}
          onCancel={cancelEdgeModifier}
        />
      ) : null}
      {topPanel ? (
        <TopActionPanel
          panel={topPanel}
          workspace={workspaceSettings}
          onWorkspaceChange={(workspace) => updateProjectWorkspaceSettings({ workspace, snap: snapGrid })}
          projectName={projectName}
          shapeCount={exportableShapeCount}
          scopeLabel={exportScopeLabel}
          onClose={() => setTopPanel(null)}
          onExport={exportDesign}
          onExportSkf={exportSkfDesign}
          onExportStep={exportStepDesign}
          sharedProjectsEnabled={sharedProjectsEnabled}
          skfExporting={skfExporting}
          stepExporting={stepExporting}
          onImportFiles={selectFiles}
          onPickFile={() => fileInputRef.current?.click()}
          onPickProjectFile={() => projectFileInputRef.current?.click()}
          onNotice={setNotice}
        />
      ) : null}
      <input
        ref={sketchImageInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void addSketchImageFile(file);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={projectFileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".skf"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) selectFiles([file]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        accept=".3mf,.stl,.step,.stp,.svg,model/3mf,image/svg+xml"
        onChange={(event) => {
          if (event.currentTarget.files) {
            selectFiles(event.currentTarget.files);
          }
          event.currentTarget.value = "";
        }}
      />
      <div className="editor-toast" role="status">
        {notice}
      </div>
      <pre data-codex-state hidden>
        {debugState}
      </pre>
      <pre data-codex-summary hidden>
        {compactDebugState}
      </pre>
    </div>
  );
}

const sketchReferenceIcons = {
  line: "sketch-tool-line.png",
  bezier: "sketch-tool-bezier-curve.png",
  smooth: "sketch-tool-smooth-curve.png",
  select: "sketch-tool-select.png",
  image: "sketch-tool-add-image.png",
  refine: "sketch-tool-add-or-remove-points.png",
  erase: "sketch-tool-erase.png",
  measure: "sketch-tool-measure.png",
  sketchTo3d: "sketch-tool-sketch-to-3d.png",
  editSketchTo3d: "sketch-tool-edit-sketch-to-3d.png",
} as const;

type SketchReferenceIconName = keyof typeof sketchReferenceIcons;

function SketchReferenceIcon({ name }: { name: SketchReferenceIconName }) {
  return (
    <img
      aria-hidden="true"
      className="sketch-reference-icon"
      data-sketch-icon={name}
      draggable={false}
      src={`/assets/sketchforge/${sketchReferenceIcons[name]}`}
      alt=""
    />
  );
}

function ConstructionPlanePanel({
  planes,
  activeId,
  onCreatePrincipal,
  onCreateAnglePlane,
  onCreateMidplane,
  onPickFace,
  onActivate,
  onClose,
}: {
  planes: WorkplaneShape[];
  activeId: string;
  onCreatePrincipal: (principal: PrincipalPlane, offset: number, angle?: number, flipped?: boolean) => void;
  onCreateAnglePlane: (referencePlaneId: string, angle: number, offset?: number, flipped?: boolean) => void;
  onCreateMidplane: (firstId: string, secondId: string, offset?: number) => void;
  onPickFace: () => void;
  onActivate: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"principal" | "angle" | "midplane">("principal");
  const [principal, setPrincipal] = useState<PrincipalPlane>("xz");
  const [angle, setAngle] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [referencePlaneId, setReferencePlaneId] = useState(BASE_CONSTRUCTION_PLANE_ID);
  const [angleOffset, setAngleOffset] = useState(0);
  const [midFirstId, setMidFirstId] = useState(BASE_CONSTRUCTION_PLANE_ID);
  const [midSecondId, setMidSecondId] = useState(planes[0]?.id ?? "");
  const [midOffset, setMidOffset] = useState(0);
  const [offset, setOffset] = useState(0);
  const planeOptions = [
    { id: BASE_CONSTRUCTION_PLANE_ID, name: "Base XZ plane" },
    ...planes.map((plane) => ({ id: plane.id, name: plane.name })),
  ];
  return (
    <aside className="construction-plane-panel" aria-label="Construction planes" onPointerDown={(event) => event.stopPropagation()}>
      <div className="sketch-operation-header">
        <strong>Construction planes</strong>
        <button type="button" aria-label="Close construction planes" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="construction-plane-active">
        <span>Active sketch plane</span>
        <button className={activeId === BASE_CONSTRUCTION_PLANE_ID ? "active" : ""} type="button" onClick={() => onActivate(BASE_CONSTRUCTION_PLANE_ID)}>Base XZ plane</button>
        {planes.map((plane) => (
          <button className={activeId === plane.id ? "active" : ""} key={plane.id} type="button" onClick={() => onActivate(plane.id)}>{plane.name}</button>
        ))}
      </div>
      <div className="construction-plane-modes" aria-label="Plane creation mode">
        <button className={mode === "principal" ? "active" : ""} type="button" aria-pressed={mode === "principal"} onClick={() => setMode("principal")}>Offset</button>
        <button className={mode === "angle" ? "active" : ""} type="button" aria-pressed={mode === "angle"} onClick={() => setMode("angle")}>Angle</button>
        <button className={mode === "midplane" ? "active" : ""} type="button" aria-pressed={mode === "midplane"} onClick={() => setMode("midplane")}>Mid-plane</button>
      </div>
      {mode === "principal" ? (
        <div className="construction-plane-create">
          <label>Principal plane<select value={principal} onChange={(event) => setPrincipal(event.target.value as PrincipalPlane)}>
            <option value="xz">XZ (top)</option>
            <option value="xy">XY (front)</option>
            <option value="yz">YZ (side)</option>
          </select></label>
          <label>Normal offset<input type="number" step="0.1" value={offset} onChange={(event) => setOffset(event.currentTarget.valueAsNumber || 0)} /></label>
          <label>Angle about local X (deg)<input type="number" step="1" value={angle} onChange={(event) => setAngle(event.currentTarget.valueAsNumber || 0)} /></label>
          <label className="construction-plane-check"><input type="checkbox" checked={flipped} onChange={(event) => setFlipped(event.currentTarget.checked)} /> Flip normal</label>
          <button className="primary" type="button" onClick={() => onCreatePrincipal(principal, offset, angle, flipped)}>Create principal plane</button>
        </div>
      ) : null}
      {mode === "angle" ? (
        <div className="construction-plane-create">
          <label>Reference plane<select value={referencePlaneId} onChange={(event) => setReferencePlaneId(event.target.value)}>
            {planeOptions.map((plane) => <option key={plane.id} value={plane.id}>{plane.name}</option>)}
          </select></label>
          <label>Angle about local X (deg)<input type="number" step="1" value={angle} onChange={(event) => setAngle(event.currentTarget.valueAsNumber || 0)} /></label>
          <label>Normal offset<input type="number" step="0.1" value={angleOffset} onChange={(event) => setAngleOffset(event.currentTarget.valueAsNumber || 0)} /></label>
          <label className="construction-plane-check"><input type="checkbox" checked={flipped} onChange={(event) => setFlipped(event.currentTarget.checked)} /> Flip normal</label>
          <button className="primary" type="button" onClick={() => onCreateAnglePlane(referencePlaneId, angle, angleOffset, flipped)}>Create angle plane</button>
        </div>
      ) : null}
      {mode === "midplane" ? (
        <div className="construction-plane-midplane">
          <label>First plane<select value={midFirstId} onChange={(event) => setMidFirstId(event.target.value)}>
            {planeOptions.map((plane) => <option key={plane.id} value={plane.id} disabled={plane.id === midSecondId}>{plane.name}</option>)}
          </select></label>
          <label>Second plane<select value={midSecondId} onChange={(event) => setMidSecondId(event.target.value)}>
            <option value="">Select a plane...</option>
            {planeOptions.map((plane) => <option key={plane.id} value={plane.id} disabled={plane.id === midFirstId}>{plane.name}</option>)}
          </select></label>
          <label>Normal offset<input type="number" step="0.1" value={midOffset} onChange={(event) => setMidOffset(event.currentTarget.valueAsNumber || 0)} /></label>
          <small>Source planes must be parallel.</small>
          <button className="primary" type="button" disabled={!midSecondId || midFirstId === midSecondId} onClick={() => onCreateMidplane(midFirstId, midSecondId, midOffset)}>Create midplane</button>
        </div>
      ) : null}
      <div className="construction-plane-face">
        <span>Associative face plane</span>
        <button type="button" onClick={onPickFace}>Pick a planar model face</button>
        <small>The plane follows the source object when it moves, rotates, or resizes.</small>
      </div>
    </aside>
  );
}

function SketchOperationPanel({
  command,
  profile,
  selection,
  projectionSources,
  onProject,
  onOffset,
  onMirror,
  onRectangularPattern,
  onCircularPattern,
  onSweep,
  onClose,
}: {
  command: SketchCommandKind;
  profile: SketchProfile;
  selection: SketchSelection;
  projectionSources: WorkplaneShape[];
  onProject: (options: SketchProjectCommandOptions) => void;
  onOffset: (options: SketchOffsetCommandOptions) => void;
  onMirror: (options: SketchMirrorOptions) => void;
  onRectangularPattern: (options: SketchRectangularPatternOptions) => void;
  onCircularPattern: (options: SketchCircularPatternOptions) => void;
  onSweep: () => void;
  onClose: () => void;
}) {
  const selected = sketchTransformSelection(selection);
  const selectedSegments = profile.segments.filter((segment) => selected.segmentIds.includes(segment.id));
  const selectedPoints = profile.points.filter((point) => selected.pointIds.includes(point.id));
  const [mirrorAxis, setMirrorAxis] = useState<"x" | "z" | "segment">("x");
  const [mirrorSegmentId, setMirrorSegmentId] = useState(selectedSegments[0]?.id ?? "");
  const [columns, setColumns] = useState(2);
  const [rows, setRows] = useState(1);
  const [columnSpacing, setColumnSpacing] = useState(10);
  const [rowSpacing, setRowSpacing] = useState(10);
  const [directionSegmentId, setDirectionSegmentId] = useState("");
  const [circularCount, setCircularCount] = useState(4);
  const [circularAngle, setCircularAngle] = useState(360);
  const [centerPointId, setCenterPointId] = useState("");
  const [offsetDistance, setOffsetDistance] = useState(2);
  const [offsetConnected, setOffsetConnected] = useState(true);
  const [projectionSourceId, setProjectionSourceId] = useState(projectionSources[0]?.id ?? "");
  const [projectionLinked, setProjectionLinked] = useState(true);
  const title = command === "sweep"
    ? "Sweep"
    : command === "project"
      ? "Project geometry"
      : command === "offset"
        ? "Offset"
        : command === "mirror"
          ? "Mirror"
          : command === "rectangular-pattern"
            ? "Rectangular pattern"
            : "Circular pattern";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (command === "sweep") onSweep();
    else if (command === "project") onProject({ sourceShapeId: projectionSourceId, linked: projectionLinked });
    else if (command === "offset") onOffset({ distance: offsetDistance, includeConnected: offsetConnected });
    else if (command === "mirror") onMirror({ axis: mirrorAxis, segmentId: mirrorAxis === "segment" ? mirrorSegmentId : undefined });
    else if (command === "rectangular-pattern") onRectangularPattern({ columns, rows, columnSpacing, rowSpacing, segmentId: directionSegmentId || undefined });
    else onCircularPattern({ count: circularCount, angle: circularAngle, pointId: centerPointId || undefined });
  };

  return (
    <form className="sketch-operation-panel" aria-label={title} onSubmit={submit} onPointerDown={(event) => event.stopPropagation()}>
      <div className="sketch-operation-header">
        <strong>{title}</strong>
        <button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={16} /></button>
      </div>
      {command === "sweep" ? (
        <div className="sketch-operation-copy">
          <p>Create a 3D body from one selected closed profile and one selected open path.</p>
          <span>{selected.segmentIds.length} selected segments</span>
        </div>
      ) : null}
      {command === "project" ? (
        <div className="sketch-offset-fields">
          <label>Source<select value={projectionSourceId} onChange={(event) => setProjectionSourceId(event.target.value)}>
            {projectionSources.map((shape) => <option key={shape.id} value={shape.id}>{shape.sketchProfile ? "Sketch" : "Shape"}: {shape.name}</option>)}
          </select></label>
          <label>Result<select value={projectionLinked ? "linked" : "editable"} onChange={(event) => setProjectionLinked(event.target.value === "linked")}>
            <option value="linked">Linked reference</option>
            <option value="editable">Editable copy</option>
          </select></label>
          <p>{projectionLinked ? "Linked geometry is fixed and refreshes from its source when the sketch is opened or rebuilt." : "Editable geometry is copied once and can be changed independently."}</p>
        </div>
      ) : null}
      {command === "offset" ? (
        <div className="sketch-offset-fields">
          <label>Distance<input type="number" step="0.1" value={offsetDistance} onChange={(event) => setOffsetDistance(event.currentTarget.valueAsNumber || 0)} /></label>
          <label className="sketch-operation-checkbox"><input type="checkbox" checked={offsetConnected} onChange={(event) => setOffsetConnected(event.currentTarget.checked)} /><span>Include connected path</span></label>
          <p>Positive offsets closed paths outward and open paths to the left. Use a negative distance for the opposite side.</p>
        </div>
      ) : null}
      {command === "mirror" ? (
        <label>
          Mirror axis
          <select value={mirrorAxis === "segment" ? `segment:${mirrorSegmentId}` : mirrorAxis} onChange={(event) => {
            if (event.target.value.startsWith("segment:")) {
              setMirrorAxis("segment");
              setMirrorSegmentId(event.target.value.slice(8));
            } else setMirrorAxis(event.target.value as "x" | "z");
          }}>
            <option value="x">Origin X axis</option>
            <option value="z">Origin Z axis</option>
            {selectedSegments.map((segment, index) => <option key={segment.id} value={`segment:${segment.id}`}>Selected segment {index + 1}</option>)}
          </select>
        </label>
      ) : null}
      {command === "rectangular-pattern" ? (
        <div className="sketch-operation-fields">
          <label>Columns<input type="number" min={1} max={20} step={1} value={columns} onChange={(event) => setColumns(event.currentTarget.valueAsNumber || 1)} /></label>
          <label>Rows<input type="number" min={1} max={20} step={1} value={rows} onChange={(event) => setRows(event.currentTarget.valueAsNumber || 1)} /></label>
          <label>Column spacing<input type="number" step="0.1" value={columnSpacing} onChange={(event) => setColumnSpacing(event.currentTarget.valueAsNumber || 0)} /></label>
          <label>Row spacing<input type="number" step="0.1" value={rowSpacing} onChange={(event) => setRowSpacing(event.currentTarget.valueAsNumber || 0)} /></label>
          <label className="wide">Direction<select value={directionSegmentId} onChange={(event) => setDirectionSegmentId(event.target.value)}>
            <option value="">Global X / Z</option>
            {selectedSegments.map((segment, index) => <option key={segment.id} value={segment.id}>Selected segment {index + 1}</option>)}
          </select></label>
        </div>
      ) : null}
      {command === "circular-pattern" ? (
        <div className="sketch-operation-fields">
          <label>Instances<input type="number" min={2} max={40} step={1} value={circularCount} onChange={(event) => setCircularCount(event.currentTarget.valueAsNumber || 2)} /></label>
          <label>Total angle<input type="number" min={-360} max={360} step="1" value={circularAngle} onChange={(event) => setCircularAngle(event.currentTarget.valueAsNumber || 0)} /></label>
          <label className="wide">Center<select value={centerPointId} onChange={(event) => setCenterPointId(event.target.value)}>
            <option value="">Sketch origin</option>
            {selectedPoints.map((point, index) => <option key={point.id} value={point.id}>Selected point {index + 1}</option>)}
          </select></label>
        </div>
      ) : null}
      <div className="sketch-operation-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button className="primary" type="submit" disabled={command === "project" && !projectionSourceId}>{command === "sweep" ? "Create sweep" : command === "project" ? "Project" : "Apply"}</button>
      </div>
    </form>
  );
}

function SecondaryToolbar({
  toolbarMode,
  onToolbarModeChange,
  alignMode,
  canAlign,
  canEdgeModify,
  edgeModifierKind,
  canGroup,
  canIntersect,
  canRedo,
  canUngroup,
  canUndo,
  hasClipboard,
  hasSelection,
  hiddenShapeCount,
  selectionHidden,
  mirrorMode,
  sketchActive,
  sketchOperation,
  sketchTool,
  sketchPolygonSides,
  onSketchPolygonSidesChange,
  sketchCanUndo,
  sketchCanRedo,
  sketchHasSelection,
  sketchHasSegmentSelection,
  sketchCanProject,
  canEditSketch,
  onStartSketch,
  onEditSketch,
  onSketchTool,
  onSketchImage,
  onSketchUndo,
  onSketchRedo,
  onSketchFinish,
  onSketchCancel,
  onSketchSweep,
  onSketchProject,
  onSketchOffset,
  onSketchMirror,
  onSketchRectangularPattern,
  onSketchCircularPattern,
  onHome,
  onAlign,
  onChamfer,
  onCopy,
  onDelete,
  onDuplicate,
  onDropToWorkplane,
  onGroup,
  onIntersect,
  onFillet,
  onMirror,
  onPaste,
  onRedo,
  onSnap,
  onShowHidden,
  onToggleHidden,
  onUngroup,
  onUndo,
  onWorkplaneTool,
  workplaneMode,
  onTopPanel,
  onAddShape,
}: {
  toolbarMode: ToolbarMode;
  onToolbarModeChange: (mode: ToolbarMode) => void;
  alignMode: boolean;
  canAlign: boolean;
  canEdgeModify: boolean;
  edgeModifierKind: CadModifierKind | null;
  canGroup: boolean;
  canIntersect: boolean;
  canRedo: boolean;
  canUngroup: boolean;
  canUndo: boolean;
  hasClipboard: boolean;
  hasSelection: boolean;
  hiddenShapeCount: number;
  selectionHidden: boolean;
  mirrorMode: boolean;
  sketchActive: boolean;
  sketchOperation: SketchOperation;
  sketchTool: SketchTool;
  sketchPolygonSides: number;
  onSketchPolygonSidesChange: (sides: number) => void;
  sketchCanUndo: boolean;
  sketchCanRedo: boolean;
  sketchHasSelection: boolean;
  sketchHasSegmentSelection: boolean;
  sketchCanProject: boolean;
  canEditSketch: boolean;
  onStartSketch: (operation: SketchOperation) => void;
  onEditSketch: () => void;
  onSketchTool: (tool: SketchTool) => void;
  onSketchImage: () => void;
  onSketchUndo: () => void;
  onSketchRedo: () => void;
  onSketchFinish: () => void;
  onSketchCancel: () => void;
  onSketchSweep: () => void;
  onSketchProject: () => void;
  onSketchOffset: () => void;
  onSketchMirror: () => void;
  onSketchRectangularPattern: () => void;
  onSketchCircularPattern: () => void;
  onHome?: () => void;
  onAlign: () => void;
  onChamfer: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDropToWorkplane: () => void;
  onGroup: () => void;
  onIntersect: () => void;
  onFillet: () => void;
  onMirror: () => void;
  onPaste: () => void;
  onRedo: () => void;
  onSnap: () => void;
  onShowHidden: () => void;
  onToggleHidden: () => void;
  onUngroup: () => void;
  onUndo: () => void;
  onWorkplaneTool: () => void;
  workplaneMode: boolean;
  onTopPanel: (panel: TopPanel) => void;
  onAddShape: (shape: ShapeAsset) => void;
}) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [sketchCreateOpen, setSketchCreateOpen] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilityMenuPosition, setVisibilityMenuPosition] = useState({ top: 0, left: 0 });
  const sketchCreateMenuRef = useRef<HTMLDivElement>(null);
  const visibilityMenuRef = useRef<HTMLDivElement>(null);
  const touchShapeStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressNextShapeClickRef = useRef(false);
  const selectToolbarMode = (mode: "geometry" | "sketch") => {
    setShapesOpen(false);
    setSketchCreateOpen(false);
    setVisibilityOpen(false);
    onTopPanel(null);
    onToolbarModeChange(mode);
  };
  const addShapeFromMenu = (shape: ShapeAsset) => {
    onAddShape(shape);
    setShapesOpen(false);
  };
  const startSketch = (operation: SketchOperation) => {
    setSketchCreateOpen(false);
    onStartSketch(operation);
  };
  useEffect(() => {
    if (!sketchCreateOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!sketchCreateMenuRef.current?.contains(event.target as Node)) setSketchCreateOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSketchCreateOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sketchCreateOpen]);
  useEffect(() => {
    if (sketchActive) setSketchCreateOpen(false);
  }, [sketchActive]);
  useEffect(() => {
    if (!visibilityOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!visibilityMenuRef.current?.contains(event.target as Node)) setVisibilityOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVisibilityOpen(false);
    };
    const closeOnViewportChange = () => setVisibilityOpen(false);
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [visibilityOpen]);
  const toggleVisibilityMenu = () => {
    if (visibilityOpen) {
      setVisibilityOpen(false);
      return;
    }
    const triggerBounds = visibilityMenuRef.current?.getBoundingClientRect();
    if (triggerBounds) {
      const viewportGutter = 12;
      const menuWidth = Math.min(276, Math.max(0, window.innerWidth - viewportGutter * 2));
      setVisibilityMenuPosition({
        top: triggerBounds.bottom + 8,
        left: Math.max(
          viewportGutter,
          Math.min(
            triggerBounds.left + triggerBounds.width / 2 - menuWidth / 2,
            window.innerWidth - menuWidth - viewportGutter,
          ),
        ),
      });
    }
    setShapesOpen(false);
    setSketchCreateOpen(false);
    onTopPanel(null);
    setVisibilityOpen(true);
  };
  const leftTools = [
    { label: "Copy", icon: ToolbarCopyIcon, action: onCopy, enabled: hasSelection },
    { label: "Paste", icon: ToolbarPasteIcon, action: onPaste, enabled: hasClipboard },
    { label: "Duplicate", icon: ToolbarDuplicateIcon, action: onDuplicate, enabled: hasSelection },
    { label: "Delete", icon: ToolbarTrashIcon, action: onDelete, enabled: hasSelection },
    { label: "Undo", icon: ToolbarUndoIcon, action: onUndo, enabled: canUndo },
    { label: "Redo", icon: ToolbarRedoIcon, action: onRedo, enabled: canRedo },
  ];
  const visibilityTools = [
    {
      label: selectionHidden ? "Show selected" : "Hide selected",
      icon: ToolbarHideSelectedIcon,
      action: () => {
        setVisibilityOpen(false);
        onToggleHidden();
      },
      enabled: hasSelection,
    },
  ];
  const combineTools = [
    { label: "Group", icon: ToolbarGroupIcon, action: onGroup, enabled: canGroup },
    { label: "Ungroup", icon: ToolbarUngroupIcon, action: onUngroup, enabled: canUngroup },
    { label: "Boolean Intersection", icon: ToolbarIntersectionIcon, action: onIntersect, enabled: canIntersect },
  ];
  const modifyTools = [
    { label: "Align", icon: ToolbarAlignIcon, action: onAlign, enabled: canAlign, active: alignMode },
    { label: "Mirror", icon: ToolbarMirrorIcon, action: onMirror, enabled: hasSelection, active: mirrorMode },
    { label: "Snap to grid", icon: ToolbarSnapGridIcon, action: onSnap, enabled: hasSelection },
    { label: "Chamfer", icon: ToolbarChamferIcon, action: onChamfer, enabled: canEdgeModify, active: edgeModifierKind === "chamfer" },
    { label: "Fillet", icon: ToolbarFilletIcon, action: onFillet, enabled: canEdgeModify, active: edgeModifierKind === "fillet" },
  ];
  const arrangeTools = [
    { label: "Workplane", icon: ToolbarWorkplaneIcon, action: onWorkplaneTool, enabled: true, active: workplaneMode },
    { label: "Drop to workplane", icon: ToolbarDropToWorkplaneIcon, action: onDropToWorkplane, enabled: hasSelection },
  ];
  const renderToolButton = (tool: (typeof leftTools)[number] | (typeof visibilityTools)[number] | (typeof combineTools)[number] | (typeof modifyTools)[number] | (typeof arrangeTools)[number]) => {
    const { icon: Icon, action, enabled, label } = tool;
    const active = "active" in tool && Boolean(tool.active);
    return (
      <button
        className={`toolbar-icon ${enabled ? "" : "disabled"} ${active ? "active" : ""}`}
        key={label}
        data-sketchforge-tool={label === "Fillet" ? "fillet" : undefined}
        aria-label={label}
        title={label}
        onClick={action}
        disabled={!enabled}
      >
        <Icon />
      </button>
    );
  };

  return (
    <div className="secondary-toolbar">
      <div className={`toolbar-mode-content ${toolbarMode}`}>
        {toolbarMode === "geometry" ? (
          <>
      {onHome ? (
        <div className="tool-group editor-nav-group">
          <div className="toolbar-section toolbar-home-section">
            <div className="toolbar-section-label">Home</div>
            <div className="toolbar-section-tools">
              <button className="toolbar-icon editor-home-control" aria-label="Home dashboard" title="Home dashboard" onClick={onHome}>
                <ToolbarHomeIcon />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="tool-group left">
        <div className="toolbar-section">
          <div className="toolbar-section-label">Clipboard</div>
          <div className="toolbar-section-tools">{leftTools.slice(0, 4).map(renderToolButton)}</div>
        </div>
        <div className="toolbar-section">
          <div className="toolbar-section-label">History</div>
          <div className="toolbar-section-tools">{leftTools.slice(4).map(renderToolButton)}</div>
        </div>
        <div className="toolbar-section toolbar-shapes-section">
          <div className="toolbar-section-label">Shapes</div>
          <div className="toolbar-section-tools">
            <button
              className={`shape-menu-trigger ${shapesOpen ? "active" : ""}`}
              aria-label="Add shape"
              aria-expanded={shapesOpen}
              onClick={() => {
                setVisibilityOpen(false);
                setShapesOpen((value) => !value);
              }}
            >
              <ToolbarShapeAddIcon />
            </button>
          </div>
          {shapesOpen ? (
            <div className="shape-menu-dropdown">
              <div className="shape-menu-title">Basic Shapes</div>
              <div className="shape-menu-list">
                {toolbarShapeAssets.map((shape) => (
                  <button
                    className="shape-menu-item"
                    key={shape.id}
                    type="button"
                    draggable={false}
                    onClick={() => {
                      if (suppressNextShapeClickRef.current) {
                        suppressNextShapeClickRef.current = false;
                        return;
                      }
                      addShapeFromMenu(shape);
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType === "touch") {
                        touchShapeStartRef.current = { id: shape.id, x: event.clientX, y: event.clientY };
                      }
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "touch") {
                        return;
                      }
                      const start = touchShapeStartRef.current;
                      touchShapeStartRef.current = null;
                      if (!start || start.id !== shape.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
                        return;
                      }
                      event.preventDefault();
                      suppressNextShapeClickRef.current = true;
                      window.setTimeout(() => {
                        suppressNextShapeClickRef.current = false;
                      }, 350);
                      addShapeFromMenu(shape);
                    }}
                    onTouchStart={(event) => {
                      const touch = event.changedTouches[0];
                      if (touch) {
                        touchShapeStartRef.current = { id: shape.id, x: touch.clientX, y: touch.clientY };
                      }
                    }}
                    onTouchEnd={(event) => {
                      const touch = event.changedTouches[0];
                      const start = touchShapeStartRef.current;
                      touchShapeStartRef.current = null;
                      if (!touch || !start || start.id !== shape.id || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) {
                        return;
                      }
                      event.preventDefault();
                      suppressNextShapeClickRef.current = true;
                      window.setTimeout(() => {
                        suppressNextShapeClickRef.current = false;
                      }, 350);
                      addShapeFromMenu(shape);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("application/x-sketchforge-shape", JSON.stringify(shape));
                    }}
                  >
                    <img src={shape.menuIcon} alt="" draggable={false} />
                    <span>{shape.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="toolbar-spacer" />
      <div className="tool-group right">
        <div className="toolbar-section compact toolbar-visibility-section" ref={visibilityMenuRef}>
          <div className="toolbar-section-label">Visibility</div>
          <div className="toolbar-section-tools">
            {visibilityTools.map(renderToolButton)}
            <button
              className={`toolbar-icon visibility-menu-trigger ${visibilityOpen ? "active" : ""}`}
              type="button"
              aria-label="Visibility options"
              title="Visibility options"
              aria-haspopup="menu"
              aria-expanded={visibilityOpen}
              onClick={toggleVisibilityMenu}
            >
              <ToolbarCaretDownIcon />
            </button>
          </div>
          {visibilityOpen ? (
            <div
              className="visibility-dropdown"
              role="menu"
              aria-label="Visibility options"
              style={visibilityMenuPosition}
            >
              <button
                className="visibility-dropdown-action"
                type="button"
                role="menuitem"
                disabled={hiddenShapeCount === 0}
                onClick={() => {
                  setVisibilityOpen(false);
                  onShowHidden();
                }}
              >
                <Eye size={20} aria-hidden="true" />
                <strong>{hiddenShapeCount === 0 ? "Nothing hidden" : `Show all hidden (${hiddenShapeCount})`}</strong>
              </button>
              <div className="visibility-dropdown-help">
                <span>Eye again: selected</span>
                <span aria-hidden="true">·</span>
                <span><kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>: all</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="toolbar-section">
          <div className="toolbar-section-label">Combine</div>
          <div className="toolbar-section-tools">{combineTools.map(renderToolButton)}</div>
        </div>
        <div className="toolbar-section">
          <div className="toolbar-section-label">Modify</div>
          <div className="toolbar-section-tools">{modifyTools.map(renderToolButton)}</div>
        </div>
        <div className="toolbar-section">
          <div className="toolbar-section-label">Arrange</div>
          <div className="toolbar-section-tools">{arrangeTools.map(renderToolButton)}</div>
        </div>
      </div>
      <div className="toolbar-section toolbar-actions-section">
        <div className="toolbar-section-label">Manage</div>
        <div className="action-buttons">
          <button className="action-icon-button" aria-label="Import" title="Import" onClick={() => onTopPanel("import")}>
            <ToolbarImportIcon />
          </button>
          <button className="action-icon-button" aria-label="Export" title="Export" onClick={() => onTopPanel("export")}>
            <ToolbarVectorExportIcon />
          </button>
          <button className="action-icon-button" aria-label="Workspace settings" title="Workspace settings" onClick={() => window.dispatchEvent(new Event("sketchforge:open-workspace-settings"))}>
            <ToolbarSettingsIcon />
          </button>
        </div>
      </div>
          </>
        ) : (
          <div className="sketch-toolbar-ribbon" aria-label="Sketch toolbar">
            {sketchActive ? (
              <>
                <div className="toolbar-section sketch-create-section">
                  <div className="toolbar-section-label">Draw</div>
                  <div className="toolbar-section-tools">
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "line" ? "active" : ""}`} type="button" aria-label="Line" title="Line" onClick={() => onSketchTool("line")}>
                      <SketchReferenceIcon name="line" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "bezier" ? "active" : ""}`} type="button" aria-label="Bezier Curve" title="Bezier Curve" onClick={() => onSketchTool("bezier")}>
                      <SketchReferenceIcon name="bezier" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "smooth" ? "active" : ""}`} type="button" aria-label="Smooth Curve" title="Smooth Curve" onClick={() => onSketchTool("smooth")}>
                      <SketchReferenceIcon name="smooth" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "circle-center" ? "active" : ""}`} type="button" aria-label="Center Point Circle" title="Center Point Circle" onClick={() => onSketchTool("circle-center")}>
                      <CircleDot aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "circle-diameter" ? "active" : ""}`} type="button" aria-label="Two Point Circle" title="Two Point Circle" onClick={() => onSketchTool("circle-diameter")}>
                      <Circle aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "rect-corner" ? "active" : ""}`} type="button" aria-label="Corner Rectangle" title="Corner Rectangle" onClick={() => onSketchTool("rect-corner")}>
                      <Square aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "rect-center" ? "active" : ""}`} type="button" aria-label="Center Rectangle" title="Center Rectangle" onClick={() => onSketchTool("rect-center")}>
                      <Square aria-hidden="true" style={{ opacity: 0.6 }} />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "poly-inscribed" || sketchTool === "poly-circumscribed" || sketchTool === "poly-edge" ? "active" : ""}`} type="button" aria-label="Polygon" title="Polygon" onClick={() => onSketchTool("poly-inscribed")}>
                      <Hexagon aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "text" ? "active" : ""}`} type="button" aria-label="Text" title="Text" onClick={() => onSketchTool("text")}>
                      <Type aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {sketchTool === "poly-inscribed" || sketchTool === "poly-circumscribed" || sketchTool === "poly-edge" ? (
                  <div className="toolbar-section">
                    <div className="toolbar-section-label">Sides</div>
                    <div className="toolbar-section-tools" style={{ alignItems: "center", gap: 4 }}>
                      <button type="button" className="toolbar-icon sketch-tool-icon" onClick={() => onSketchPolygonSidesChange(Math.max(3, sketchPolygonSides - 1))} title="Fewer sides">-</button>
                      <span style={{ fontSize: 12, minWidth: 20, textAlign: "center" }}>{sketchPolygonSides}</span>
                      <button type="button" className="toolbar-icon sketch-tool-icon" onClick={() => onSketchPolygonSidesChange(Math.min(24, sketchPolygonSides + 1))} title="More sides">+</button>
                    </div>
                  </div>
                ) : null}
                <div className="toolbar-section sketch-edit-section">
                  <div className="toolbar-section-label">Select</div>
                  <div className="toolbar-section-tools">
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "select" ? "active" : ""}`} type="button" aria-label="Select" title="Select" onClick={() => onSketchTool("select")}>
                      <SketchReferenceIcon name="select" />
                    </button>
                    <button
                      className={`toolbar-icon sketch-tool-icon ${sketchTool === "select" ? "" : "disabled"}`}
                      type="button"
                      aria-label="Add Image"
                      title={sketchTool === "select" ? "Add image" : "Choose Select to add an image"}
                      onClick={onSketchImage}
                      disabled={sketchTool !== "select"}
                    >
                      <SketchReferenceIcon name="image" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "refine" ? "active" : ""}`} type="button" aria-label="Add or Remove Points" title="Add or Remove Points" onClick={() => onSketchTool("refine")}>
                      <SketchReferenceIcon name="refine" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "erase" ? "active" : ""}`} type="button" aria-label="Erase" title="Erase" onClick={() => onSketchTool("erase")}>
                      <SketchReferenceIcon name="erase" />
                    </button>
                  </div>
                </div>
                <div className="toolbar-section sketch-transform-section">
                  <div className="toolbar-section-label">Create / Transform</div>
                  <div className="toolbar-section-tools">
                    <button className={`toolbar-icon sketch-tool-icon ${sketchCanProject ? "" : "disabled"}`} type="button" aria-label="Project previous sketch or shape" title="Project" onClick={onSketchProject} disabled={!sketchCanProject}>
                      <ScanLine aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchHasSelection ? "" : "disabled"}`} type="button" aria-label="Sweep" title="Sweep selected profile along selected path" onClick={onSketchSweep} disabled={!sketchHasSelection}>
                      <Route aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchHasSegmentSelection ? "" : "disabled"}`} type="button" aria-label="Offset sketch path" title="Offset" onClick={onSketchOffset} disabled={!sketchHasSegmentSelection}>
                      <CopyPlus aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchHasSelection ? "" : "disabled"}`} type="button" aria-label="Mirror sketch geometry" title="Mirror" onClick={onSketchMirror} disabled={!sketchHasSelection}>
                      <ToolbarMirrorIcon />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchHasSelection ? "" : "disabled"}`} type="button" aria-label="Rectangular pattern" title="Rectangular pattern" onClick={onSketchRectangularPattern} disabled={!sketchHasSelection}>
                      <Grid2X2 aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchHasSelection ? "" : "disabled"}`} type="button" aria-label="Circular pattern" title="Circular pattern" onClick={onSketchCircularPattern} disabled={!sketchHasSelection}>
                      <RotateCw aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="toolbar-section sketch-history-section">
                  <div className="toolbar-section-label">History</div>
                  <div className="toolbar-section-tools">
                    <button className={`toolbar-icon ${sketchCanUndo ? "" : "disabled"}`} type="button" aria-label="Sketch undo" title="Undo" onClick={onSketchUndo} disabled={!sketchCanUndo}>
                      <ToolbarUndoIcon />
                    </button>
                    <button className={`toolbar-icon ${sketchCanRedo ? "" : "disabled"}`} type="button" aria-label="Sketch redo" title="Redo" onClick={onSketchRedo} disabled={!sketchCanRedo}>
                      <ToolbarRedoIcon />
                    </button>
                  </div>
                </div>
                <div className="toolbar-section sketch-measure-section">
                  <div className="toolbar-section-label">Inspect</div>
                  <div className="toolbar-section-tools">
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "dimension" ? "active" : ""}`} type="button" aria-label="Dimension" title="Add driving dimension" onClick={() => onSketchTool("dimension")}>
                      <Ruler aria-hidden="true" />
                    </button>
                    <button className={`toolbar-icon sketch-tool-icon ${sketchTool === "measure" ? "active" : ""}`} type="button" aria-label="Measure" title="Measure" onClick={() => onSketchTool("measure")}>
                      <SketchReferenceIcon name="measure" />
                    </button>
                  </div>
                </div>
                <div className="toolbar-spacer" />
                <div className="toolbar-section sketch-finish-section">
                  <div className="toolbar-section-label">Finish</div>
                  <div className="toolbar-section-tools">
                    <button className="sketch-command-button primary" type="button" onClick={onSketchFinish}>
                      <Check />
                      <span>{sketchOperation === "revolve" ? "Finish revolve" : "Finish sketch"}</span>
                    </button>
                    <button className="sketch-command-button cancel" type="button" onClick={onSketchCancel}>
                      <X />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="toolbar-section sketch-start-section">
                <div className="toolbar-section-label">Create</div>
                <div className="toolbar-section-tools">
                  <div className="sketch-create-menu" ref={sketchCreateMenuRef}>
                    <button
                      className={`sketch-command-button primary sketch-create-menu-trigger ${sketchCreateOpen ? "active" : ""}`}
                      type="button"
                      aria-label="Sketch to 3D options"
                      aria-haspopup="menu"
                      aria-expanded={sketchCreateOpen}
                      onClick={() => setSketchCreateOpen((open) => !open)}
                    >
                      <SketchReferenceIcon name="sketchTo3d" />
                      <span>Sketch to 3D</span>
                      <ToolbarCaretDownIcon className="sketch-create-menu-chevron" />
                    </button>
                    {sketchCreateOpen ? (
                      <div className="sketch-create-dropdown" role="menu" aria-label="Sketch to 3D method">
                        <button type="button" role="menuitem" onClick={() => startSketch("extrude")}>
                          <strong>Extrude sketch</strong>
                          <span>Raise the profile into a 3D shape</span>
                        </button>
                        <button type="button" role="menuitem" onClick={() => startSketch("revolve")}>
                          <strong>Revolve sketch</strong>
                          <span>Rotate the profile around an axis</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button className={`sketch-command-button ${canEditSketch ? "" : "disabled"}`} type="button" aria-label="Edit Sketch to 3D" title="Edit Sketch to 3D" onClick={onEditSketch} disabled={!canEditSketch}>
                    <SketchReferenceIcon name="editSketchTo3d" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="toolbar-workspace-tabs" role="tablist" aria-label="Editor mode">
        <button
          className={toolbarMode === "geometry" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={toolbarMode === "geometry"}
          onClick={() => selectToolbarMode("geometry")}
        >
          Geometry
        </button>
        <button
          className={toolbarMode === "sketch" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={toolbarMode === "sketch"}
          onClick={() => selectToolbarMode("sketch")}
        >
          Sketch
        </button>
      </div>
    </div>
  );
}

function TopActionPanel({
  panel,
  workspace,
  onWorkspaceChange,
  projectName,
  shapeCount,
  scopeLabel,
  onClose,
  onExport,
  onExportSkf,
  onExportStep,
  sharedProjectsEnabled,
  skfExporting,
  stepExporting,
  onImportFiles,
  onPickFile,
  onPickProjectFile,
  onNotice,
}: {
  panel: Exclude<TopPanel, null>;
  projectName: string;
  shapeCount: number;
  scopeLabel: "selected" | "total";
  onClose: () => void;
  onExport: (format: DirectExportFormat, exportName: string) => void;
  onExportSkf: (exportName: string, historyLimit: SkfHistoryLimit, target?: SkfExportTarget) => void;
  onExportStep: (exportName: string) => void;
  sharedProjectsEnabled: boolean;
  skfExporting: boolean;
  stepExporting: boolean;
  onImportFiles: (files: FileList | File[]) => void;
  onPickFile: () => void;
  onPickProjectFile: () => void;
  onNotice: (message: string) => void;
  workspace: WorkplaneWorkspaceSettings;
  onWorkspaceChange: (w: WorkplaneWorkspaceSettings) => void;
}) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("stl");
  const [exportName, setExportName] = useState(projectName);
  const [skfHistoryLimit, setSkfHistoryLimit] = useState<SkfHistoryLimit>("unlimited");
  const skfHistoryLimits: readonly SkfHistoryLimit[] = ["unlimited", 100, 50, 30];
  const skfHistoryLimitIndex = skfHistoryLimits.indexOf(skfHistoryLimit);
  const title =
    panel === "profile"
      ? "Profile"
      : panel === "settings"
        ? "Settings"
        : panel === "tips"
          ? "Tips"
          : panel === "export"
            ? "Export"
            : "Import";
  const customTheme = customThemeWithDefaults(workspace.customTheme);

  const exportDetails: Record<ExportFormat, { label: string; description: string; note: string }> = {
    stl: {
      label: "STL",
      description: "3D print mesh",
      note: "Best for slicers and 3D printing. Geometry is exported as a triangulated mesh.",
    },
    "3mf": {
      label: "3MF",
      description: "3D print package",
      note: "A modern 3D printing format with millimeter units, object names, and display colors.",
    },
    obj: {
      label: "OBJ",
      description: "Universal 3D mesh",
      note: "A broadly compatible mesh format for modeling, rendering, and interchange.",
    },
    step: {
      label: "STEP",
      description: "CAD / B-Rep",
      note: "Keeps supported boxes, cylinders, spheres, and cones as precise CAD geometry.",
    },
    svg: {
      label: "SVG",
      description: "Top-view vector",
      note: "Exports a clean top-view silhouette in millimeters, including holes and curved contours.",
    },
    skf: {
      label: "SKF",
      description: "Editable project",
      note: "Preserves the editable project, undo/redo history, sketches, groups, CAD data, and imported sources.",
    },
  };
  const selectedExport = exportDetails[exportFormat];
  const runSelectedExport = () => {
    if (exportFormat === "step") onExportStep(exportName);
    else if (exportFormat === "skf") onExportSkf(exportName, skfHistoryLimit);
    else onExport(exportFormat, exportName);
  };

  return (
    <div
      className={`top-action-panel ${panel === "export" ? "export-action-panel" : panel === "import" ? "import-action-panel" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <header>
        <div className="top-action-heading">
          <strong>{title}</strong>
        </div>
        <button aria-label={`Close ${title}`} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {panel === "import" ? (
        <div className="top-action-body">
          <button className="open-skf-project-button" type="button" onClick={onPickProjectFile}>
            <span className="open-skf-project-icon"><FolderOpen size={18} /></span>
            <span>
              <strong>Open SketchForge Project</strong>
              <small>Restore an editable .skf file as a new local project</small>
            </span>
          </button>
          <div className="import-kind-divider"><span>or add geometry</span></div>
          <button
            className="import-drop-zone"
            onClick={onPickFile}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) {
                onImportFiles(event.dataTransfer.files);
              }
            }}
          >
            <ToolbarImportIcon />
            <strong>Drop 3MF, STL, STEP, or SVG files</strong>
            <span>or click to choose from your computer</span>
          </button>
        </div>
      ) : null}
      {panel === "export" ? (
        <div className="export-dialog-body">
          <section className="export-setting-section export-file-section">
            <label htmlFor="export-file-name">File name</label>
            <div className="export-file-input-wrap">
              <input
                id="export-file-name"
                className="export-file-input"
                value={exportName}
                maxLength={120}
                spellCheck={false}
                onChange={(event) => setExportName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (shapeCount > 0 || exportFormat === "skf") && !stepExporting && !skfExporting) runSelectedExport();
                }}
              />
              <span>.{exportFormat}</span>
            </div>
          </section>

          <section className="export-setting-section">
            <div className="export-section-heading">
              <div>
                <strong>Format</strong>
              </div>
              <span className="export-scope-badge">{exportFormat === "skf" ? "Full project" : `${shapeCount} ${scopeLabel}`}</span>
            </div>
            <div className="export-format-slider" data-format={exportFormat} role="radiogroup" aria-label="Export format">
              {(["stl", "3mf", "obj", "step", "svg", "skf"] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  role="radio"
                  aria-checked={exportFormat === format}
                  aria-label={`${exportDetails[format].label}: ${exportDetails[format].description}`}
                  onClick={() => setExportFormat(format)}
                >
                  {exportDetails[format].label}
                </button>
              ))}
            </div>
          </section>

          {exportFormat === "skf" ? (
            <section className="export-setting-section skf-history-section">
              <div className="export-section-heading">
                <div>
                  <strong>Saved action history</strong>
                  <span>Choose how many recent undo actions travel with the project</span>
                </div>
              </div>
              <div className="skf-history-range-control" data-limit={String(skfHistoryLimit)}>
                <input
                  className="skf-history-range"
                  type="range"
                  min={0}
                  max={skfHistoryLimits.length - 1}
                  step={1}
                  value={skfHistoryLimitIndex}
                  aria-label="Saved SKF action history"
                  aria-valuetext={skfHistoryLimit === "unlimited" ? "Unlimited" : `${skfHistoryLimit} actions`}
                  onChange={(event) => setSkfHistoryLimit(skfHistoryLimits[Number(event.currentTarget.value)] ?? "unlimited")}
                />
              </div>
              <div className="skf-history-range-labels" aria-hidden="true">
                {skfHistoryLimits.map((limit) => (
                  <span key={limit} className={skfHistoryLimit === limit ? "active" : undefined}>
                    {limit === "unlimited" ? "Unlimited" : limit}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="export-format-summary">
            <div>
              <strong>{selectedExport.label}</strong>
              <span>{selectedExport.description}</span>
            </div>
            <p>{selectedExport.note}</p>
          </div>

          <footer className="export-dialog-footer">
            <div>
              {exportFormat === "skf" && sharedProjectsEnabled ? (
                <button
                  className="export-shared-button"
                  type="button"
                  onClick={() => onExportSkf(exportName, skfHistoryLimit, "shared")}
                  disabled={skfExporting || stepExporting}
                >
                  <CloudUpload />
                  <span>Save to shared</span>
                </button>
              ) : null}
              <button className="export-primary-button" onClick={runSelectedExport} disabled={(shapeCount === 0 && exportFormat !== "skf") || stepExporting || skfExporting}>
                <Download />
                {exportFormat === "skf" ? (skfExporting ? "Saving project…" : "Save SketchForge Project") : null}
                <span hidden={exportFormat === "skf"}>
                {stepExporting && exportFormat === "step" ? "Building STEP…" : `Export ${selectedExport.label}`}
                </span>
              </button>
            </div>
          </footer>
        </div>
      ) : null}
      {panel === "settings" ? (
        <div className="top-action-body">
          <p>Workspace preferences</p>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--tile)", borderRadius: "6px" }}>
            <label htmlFor="theme-select" style={{ fontSize: "14px", fontWeight: 600 }}>Theme preset:</label>
            <select
              id="theme-select"
              value={workspace.themeId || "light"}
              onChange={(event) => {
                const themeId = event.currentTarget.value;
                onWorkspaceChange({ ...workspace, themeId });
              }}
              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            >
              {THEME_PRESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {workspace.themeId === "custom" && (
            <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", alignContent: "start", gap: "10px", height: "400px", maxHeight: "60vh", overflowY: "auto", padding: "16px", background: "var(--tile)", borderRadius: "8px", border: "2px solid var(--primary)" }}>
              <p style={{ gridColumn: "1 / -1", fontWeight: 600, margin: "0 0 8px 0", fontSize: "12px" }}>UI Colors</p>
              {Object.entries(customTheme.ui)
                .filter(([, val]) => isHexColor(val as string))
                .map(([key, val]) => (
                <label key={`ui-${key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", padding: "2px 0" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{UI_LABELS[key] || key}</span>
                  <input
                    type="color"
                    value={val as string}
                    onChange={(e) => {
                      onWorkspaceChange({
                        ...workspace,
                        customTheme: {
                          ...customTheme,
                          ui: { ...customTheme.ui, [key]: e.target.value }
                        }
                      });
                    }}
                    style={{ width: "32px", height: "32px", padding: 0, border: "2px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}
                  />
                </label>
              ))}
              <p style={{ gridColumn: "1 / -1", fontWeight: 600, margin: "12px 0 8px 0", fontSize: "12px" }}>3D Viewport Colors</p>
              {Object.entries(customTheme.viewport)
                .filter(([, val]) => isHexColor(val as string))
                .map(([key, val]) => (
                <label key={`vp-${key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", padding: "2px 0" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{VP_LABELS[key] || key}</span>
                  <input
                    type="color"
                    value={val as string}
                    onChange={(e) => {
                      onWorkspaceChange({
                        ...workspace,
                        customTheme: {
                          ...customTheme,
                          viewport: { ...customTheme.viewport, [key]: e.target.value }
                        }
                      });
                    }}
                    style={{ width: "32px", height: "32px", padding: 0, border: "2px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}
                  />
                </label>
              ))}
            </div>
          )}
          <button onClick={() => onNotice("Grid display is controlled from the bottom-right Settings dialog")}>Grid and snapping</button>
          <button onClick={() => onNotice("Units are set to millimeters")}>Units: Millimeters</button>
          <button onClick={() => onNotice("Shadows and ray-traced lighting are enabled")}>Lighting and shadows</button>
        </div>
      ) : null}
      {panel === "profile" ? (
        <div className="top-action-body">
          <button onClick={() => onNotice("Account menu opened")}>Account</button>
          <button onClick={() => onNotice("Dashboard opened")}>Dashboard</button>
          <button onClick={() => onNotice("Sign out selected")}>Sign out</button>
        </div>
      ) : null}
    </div>
  );
}
