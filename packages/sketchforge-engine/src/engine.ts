/**
 * The engine's operations, bound to a project store (upstream issue #55).
 *
 * `docs/ENGINE_EXTRACTION.md` section 5 names the thing this file is: the seven
 * `v1` route handlers were each re-assembling the same eight steps -- take the
 * project lock, read the document, resolve the ids, refuse a locked shape, run
 * the geometry, write the document, bump the revision, summarise the result --
 * and the geometry was one call in the middle. Two of them (`booleans` and
 * `groups`) had drifted into saying the same thing twice in different words.
 *
 * What stays out of here is HTTP. An operation reports *what happened* as a
 * tagged `EngineFailure`; the caller decides what status code and what sentence
 * that is worth. That split is what lets a macro runner reuse the orchestration
 * -- including the project lock, which a macro writing a directory needs and
 * does not have today -- without pulling `next/server` in with it.
 */

import {
  applyEdgeTreatment,
  applyBakedMirror,
  shapeEdges,
  shapeWithCadResult,
  ServerCadError,
  type ServerCadEdge,
  type ServerCadTreatment,
} from "./serverCadOperations.js";
import {
  applyShell,
  shapeFaces,
  type ServerCadFace,
  type ServerCadShellRequest,
} from "./serverCadShell.js";
import {
  measureBetween as measureBetweenEntities,
  shapeMeasurements,
  type MeasurementEndRef,
  type ServerCadMeasurement,
  type ServerCadMeasurementPair,
} from "./serverCadMeasure.js";
import { shapeProperties, type ServerCadShapeProperties } from "./serverCadProperties.js";
import { checkInterference, type InterferenceReport, type InterferenceRequest, type InterferenceRefusal } from "./serverCadInterference.js";
import { explodeStepAssembly } from "./serverStepExplode.js";
import {
  alignShifts,
  effectiveAlignAnchorId,
  ALIGN_EPSILON,
  type AlignAxis,
  type AlignEntry,
  type AlignTarget,
} from "./alignShapes.js";
import { distributeShifts, widestDistributeAxis, type DistributeSpacing } from "./distributeShapes.js";
import {
  importableMeshFormat,
  importedMeshFromFile,
  IMPORTABLE_MESH_FORMATS,
  type ImportedMesh,
} from "./meshImport.js";
import { circularPatternPlacements, linearPatternPlacements } from "./patternShapes.js";
import { dedupeProjectAssets } from "./projectAssets.js";
import {
  isRevolveShape,
  outlineFromProfile,
  parseRevolveRequest,
  rebuiltRevolveShape,
  requestedRevolveSettings,
  resolvedThreadRequest,
  revolvedShapeFromRequest,
  REVOLVE_CHANGE_FIELDS,
  REVOLVE_ONLY_FIELDS,
} from "./revolveRequests.js";
import { buildGroupFromSelection } from "./serverShapeBooleans.js";
import { boundsForShapes as boundsForMirroring, restoreGroupedChildren, separateShapeParts } from "./serverShapeGroups.js";
import { serverManifoldRuntime } from "./serverManifoldRuntime.js";
import { boundsForShapes, footprintCenter, shapeBounds } from "./shapeBounds.js";
import {
  REQUESTABLE_SHAPE_KINDS,
  shapeFromRequest,
  shapeWithRequestedChanges,
  type ShapeRequest,
} from "./shapeRequests.js";
import {
  canonicalizeShape,
  cleanNearZero,
  cleanRotationDegrees,
  cloneWorkplaneShapeTreeWithFreshIds,
  withHoleMode,
} from "./workplaneShapes.js";
import type { ProjectDocument, ProjectStore } from "./projectStore.js";
import type { ProjectAsset, WorkplaneShape } from "./domain/sketchforge.js";

/**
 * Why an operation did not happen.
 *
 * Deliberately a tag and not a status code. A status is too coarse to carry the
 * distinction -- `409` is both "the project is busy, retry" and "that shape is
 * locked, do not" -- and a sentence is the caller's to choose: the REST API
 * answers a script in English prose, and the editor would want a translated
 * `LocalizedError` for the same refusal.
 *
 * `cad_refused` is the kernel saying why, in words already fit to show a
 * caller, with the status `ServerCadError` chose. `cad_failed` is anything else
 * the kernel threw, which has no caller-facing wording -- the two read-only
 * routes and the two write routes word that case differently, and that is
 * their business, not the engine's.
 */
export type EngineFailure =
  | { reason: "project_busy" }
  | { reason: "project_not_found" }
  | { reason: "shapes_not_found"; ids: string[] }
  | { reason: "shape_locked"; ids: string[] }
  | { reason: "not_a_group" }
  | { reason: "single_body" }
  | { reason: "hole_has_no_parts" }
  | { reason: "cut_removed_nothing" }
  | { reason: "geometry_failed"; message: string; status: number }
  | { reason: "cad_refused"; message: string; status: number }
  | { reason: "cad_failed" }
  | { reason: "interference_refused"; refusal: InterferenceRefusal }
  // --- describing a shape ----------------------------------------------------
  //
  // `index` is the position in a batch, so a request adding two hundred shapes
  // says which one it choked on. Absent when the operation is about one shape.
  /** The `kind` asked for is not one that can be built from parameters. */
  | { reason: "unsupported_kind"; index: number; kinds: string[] }
  /** The request is malformed in a way only the request itself can explain. */
  | { reason: "invalid_shape_request"; message: string; index?: number }
  /** A revolve or a thread was described but could not be swept. */
  | { reason: "sweep_failed"; message: string; index?: number }
  /**
   * The change named fields this shape has no use for.
   *
   * `because` is the three different things that can mean, which the callers
   * word differently: a parameter no shape of that kind is built from, a sweep
   * field on something that has no sweep, and a sweep that cannot be rebuilt
   * because its outline was drawn rather than described.
   */
  | {
    reason: "unapplicable_fields";
    kind: string;
    fields: string[];
    because: "not_this_kind" | "no_sweep" | "outline_not_described";
  }
  // --- arranging what is already there ---------------------------------------
  /** Align needs two shapes, distribute three; one shape is already arranged. */
  | { reason: "selection_too_small"; needed: number; given: number }
  /** Every shape sits at the same place, so there is no axis to spread along. */
  | { reason: "no_distribute_axis" }
  /** A row with no step, or a ring with no sweep: every copy would land on the original. */
  | { reason: "pattern_has_no_step"; kind: PatternKind }
  // --- importing -------------------------------------------------------------
  /** Nothing here can read that file. */
  | { reason: "import_unsupported"; fileName: string; formats: string[] }
  /** The file was read and could not be understood. */
  | { reason: "import_failed"; fileName: string; message: string };

export type EngineResult<T> = { ok: true; value: T } | { ok: false; failure: EngineFailure };

/** One shape written, with the revision the write landed on. */
export type ShapeWritten = { shape: WorkplaneShape; revision: number };
/** Several shapes written, with the revision the write landed on. */
export type ShapesWritten = { shapes: WorkplaneShape[]; revision: number };

/** One shape removed, with the revision the write landed on. */
export type ShapeRemoved = { id: string; revision: number };

export type CutRequest = { solidIds: string[]; holeIds: string[] };

/**
 * A project, as much of it as a caller reading the scene needs.
 *
 * The shapes plus the little that is not a shape: the name, when it was made,
 * the revision a conditional write would quote, and the two settings that
 * decide what a coordinate *means* -- the snap grid and the workspace, which
 * carries the units. A bridge reporting dimensions in millimetres when the
 * project is in inches is reporting the wrong numbers, so the units travel with
 * the shapes rather than being asked for separately.
 */
export type ProjectRead = {
  projectId: string;
  name: string;
  createdAt: number;
  revision: number;
  shapes: WorkplaneShape[];
  snapGrid: ProjectDocument["snapGrid"];
  workspace: ProjectDocument["workspace"];
};

export type AlignRequest = {
  ids: string[];
  axis: AlignAxis;
  target: AlignTarget;
  /** The shape to keep fixed; a locked shape in the selection wins over it. */
  anchorId?: string | null;
};

/** Shapes that were moved into place, and how many of them actually moved. */
export type ShapesArranged = {
  shapes: WorkplaneShape[];
  moved: number;
  revision: number;
};

export type AlignOutcome = ShapesArranged & { anchorId: string | null };

export type DistributeRequest = {
  ids: string[];
  /** Omit to spread along whichever axis the shapes are already most spread along. */
  axis?: "x" | "z" | null;
  spacing?: DistributeSpacing;
};

export type DistributeOutcome = ShapesArranged & { axis: "x" | "z"; spacing: DistributeSpacing };

export type PatternKind = "linear" | "circular";

export type PatternRequest = {
  ids: string[];
  kind: PatternKind;
  /** Total copies including the original, so 4 adds 3. Clamped to 2-200. */
  count: number;
  /** `linear`: centre-to-centre step along each axis, in mm. A pitch, not a gap. */
  stepX?: number;
  stepZ?: number;
  /** `circular`: the point to turn about. */
  centerX?: number;
  centerZ?: number;
  /** `circular`: how far round to spread the copies, in degrees. 360 closes the ring. */
  sweepAngle?: number;
  /** `circular`: whether each copy turns to follow the ring. On unless set false. */
  rotateCopies?: boolean;
};

export type MeshImportRequest = {
  /** Chooses the importer, names the asset, and for an STL decides which way is up. */
  fileName: string;
  bytes: Uint8Array;
  /** The media type to record on the asset; the format's own default otherwise. */
  mediaType?: string;
};

export type Engine = {
  /**
   * The project's shapes and the little metadata that goes with them.
   *
   * Cheap, and on the facade rather than left to each caller because every
   * caller wanting the scene wants the same handful of fields, and three of
   * them -- the revision, the grid, the units -- are the ones most easily left
   * out by someone who only meant to list the objects.
   */
  project(projectId: string): Promise<EngineResult<ProjectRead>>;
  /**
   * Add shapes described as parameters, in one write.
   *
   * A batch rather than a shape at a time because the point of describing
   * shapes as data is parameterised work: a script computing a row of holes
   * should not need a write of the project package per hole.
   */
  addShapes(projectId: string, requests: readonly ShapeRequest[]): Promise<EngineResult<ShapesWritten>>;
  /** Change one shape, refusing the fields its kind cannot take. */
  changeShape(projectId: string, shapeId: string, changes: ShapeRequest): Promise<EngineResult<ShapeWritten>>;
  /** Remove one shape. */
  removeShape(projectId: string, shapeId: string): Promise<EngineResult<ShapeRemoved>>;
  /** Bring shapes onto one line: an edge or a centre of each on one coordinate. */
  align(projectId: string, request: AlignRequest): Promise<EngineResult<AlignOutcome>>;
  /** Spread three or more shapes evenly; the outermost two define the span and stay put. */
  distribute(projectId: string, request: DistributeRequest): Promise<EngineResult<DistributeOutcome>>;
  /** Repeat shapes in a row or around a ring, adding the copies. */
  pattern(projectId: string, request: PatternRequest): Promise<EngineResult<ShapesWritten>>;
  /** Add the shape a model file describes, keeping the file as a project asset. */
  importMesh(projectId: string, request: MeshImportRequest): Promise<EngineResult<ShapeWritten>>;
  /** Subtract `holeIds` from `solidIds`, leaving one group where the operands were. */
  cut(projectId: string, request: CutRequest): Promise<EngineResult<ShapeWritten>>;
  /** Bundle shapes into one group; a selection holding a hole comes back cut. */
  group(projectId: string, ids: string[]): Promise<EngineResult<ShapeWritten>>;
  /** Take a group apart, leaving its children where they appeared. */
  ungroup(projectId: string, shapeId: string): Promise<EngineResult<ShapesWritten>>;
  /** Split a shape into the separate bodies it is made of. */
  separate(projectId: string, shapeId: string): Promise<EngineResult<ShapesWritten>>;
  /** Split a retained STEP assembly source into exact positioned solid shapes. */
  explode(projectId: string, shapeId: string): Promise<EngineResult<ShapesWritten>>;
  /** A shape's edges, numbered as a treatment request refers to them. */
  edges(projectId: string, shapeId: string): Promise<EngineResult<ServerCadEdge[]>>;
  /** A shape's faces, numbered as a shell request refers to them. */
  faces(projectId: string, shapeId: string): Promise<EngineResult<ServerCadFace[]>>;
  /** Round or cut a shape's edges. */
  treat(projectId: string, shapeId: string, treatment: ServerCadTreatment): Promise<EngineResult<ShapeWritten>>;
  /** Reflect selected parameter-built solids across their selection bounds and bake the exact result. */
  mirrorBaked(projectId: string, ids: string[], axis: "x" | "y" | "z"): Promise<EngineResult<ShapesArranged>>;
  /** Hollow a shape out, optionally leaving faces open. */
  shell(projectId: string, shapeId: string, request: ServerCadShellRequest): Promise<EngineResult<ShapeWritten>>;
  /** Every edge and face of a shape, measured from its exact geometry. */
  measurements(projectId: string, shapeId: string): Promise<EngineResult<ServerCadMeasurement[]>>;
  /** Volume, area, center of mass, bounds and provenance for one placed shape. */
  properties(projectId: string, shapeId: string): Promise<EngineResult<ServerCadShapeProperties>>;
  /**
   * The distance between two entities, and the angle between them if both are flat faces.
   *
   * The two ends may be different shapes, which is why this takes refs rather
   * than a `shapeId` -- "how far apart are these two parts" is the measurement
   * the operation exists for.
   */
  measureBetween(
    projectId: string,
    from: MeasurementEndRef,
    to: MeasurementEndRef,
  ): Promise<EngineResult<ServerCadMeasurementPair>>;
  /** Exact, bounded gaps and overlap volumes between visible non-cutter shapes. */
  interference(projectId: string, request?: InterferenceRequest): Promise<EngineResult<InterferenceReport>>;
};

function ok<T>(value: T): EngineResult<T> {
  return { ok: true, value };
}

function failed<T>(failure: EngineFailure): EngineResult<T> {
  return { ok: false, failure };
}

/**
 * The shapes `ids` names, in **document order**, or the ids that are not there.
 *
 * Document order rather than request order: for a cut it decides which solid's
 * colour the result takes, and a project's own order is the one the editor
 * would have used. The `booleans` and `groups` handlers each resolved this
 * themselves, by different means, and only one of them said why.
 */
function shapesByIds(document: ProjectDocument, ids: readonly string[]): EngineResult<WorkplaneShape[]> {
  const wanted = new Set(ids);
  const found = document.shapes.filter((shape) => wanted.has(shape.id));
  if (found.length !== wanted.size) {
    const present = new Set(found.map((shape) => shape.id));
    return failed({ reason: "shapes_not_found", ids: ids.filter((id) => !present.has(id)) });
  }
  return ok(found);
}

function oneShape(document: ProjectDocument, shapeId: string): EngineResult<WorkplaneShape> {
  const shape = document.shapes.find((candidate) => candidate.id === shapeId);
  return shape ? ok(shape) : failed({ reason: "shapes_not_found", ids: [shapeId] });
}

/**
 * The ids of the shapes that are locked, or null when none is.
 *
 * The whole operation is refused rather than the locked members skipped: a
 * group missing one member is not the group the caller asked for.
 */
function lockedIds(shapes: readonly WorkplaneShape[]): string[] | null {
  const locked = shapes.filter((shape) => shape.locked).map((shape) => shape.id);
  return locked.length > 0 ? locked : null;
}

/**
 * The revision the project is already on.
 *
 * Reported by an operation that found nothing to do: an alignment where
 * everything was already flush writes nothing, and a caller still wants to know
 * which revision its unchanged project is at. `metadata` is a bag of JSON, so
 * the field has to be checked rather than trusted.
 */
function documentRevision(document: ProjectDocument) {
  const revision = document.metadata.revision;
  return typeof revision === "number" && Number.isFinite(revision) ? revision : 0;
}

/** A coordinate as the project stores it: four decimals, and a hair off zero is zero. */
function storedCoordinate(value: number) {
  return cleanNearZero(Number(value.toFixed(4)), ALIGN_EPSILON);
}

/**
 * A shape moved along one axis by `delta`.
 *
 * `y` is `elevation`, which is the underside of the shape rather than its
 * centre -- moving it by a delta measured between two boxes is the same
 * arithmetic either way, since both boxes are measured from the same face.
 */
function shapeMovedAlong(shape: WorkplaneShape, axis: AlignAxis, delta: number): WorkplaneShape {
  if (axis === "x") return { ...shape, x: storedCoordinate(shape.x + delta) };
  if (axis === "z") return { ...shape, z: storedCoordinate(shape.z + delta) };
  return { ...shape, elevation: storedCoordinate((shape.elevation ?? 0) + delta) };
}

/** A shape's extents along one axis, as `alignShifts` and `distributeShifts` want them. */
function alignEntry(shape: WorkplaneShape, axis: AlignAxis): AlignEntry {
  const bounds = shapeBounds(shape);
  const span = axis === "x"
    ? { min: bounds.minX, max: bounds.maxX }
    : axis === "z"
      ? { min: bounds.minZ, max: bounds.maxZ }
      : { min: bounds.minY, max: bounds.maxY };
  return { id: shape.id, ...span, locked: shape.locked };
}

/** `ServerCadError` keeps its own wording and status; anything else has none to keep. */
function cadFailure(error: unknown): EngineFailure {
  return error instanceof ServerCadError
    ? { reason: "cad_refused", message: error.message, status: error.status }
    : { reason: "cad_failed" };
}

/**
 * One shape from one request, built before any lock is taken.
 *
 * A revolve is described by an outline and a pitch rather than by dimensions,
 * and it is swept by manifold rather than assembled from parameters -- which is
 * what makes threads and springs possible here at all. Everything else comes
 * straight out of the one parameter table that `PATCH` reads as well, so a
 * parameter added there works on create without anyone remembering to.
 *
 * Outside `createEngine` because it needs no store, and built before the lock
 * because sweeping a twenty-turn thread takes longer than writing the project
 * and there is no reason to hold a project busy for it.
 */
async function builtShape(request: ShapeRequest, index: number): Promise<EngineResult<WorkplaneShape>> {
  if (request.kind === "revolve" || request.kind === "thread") {
    let revolveRequest = request;
    if (request.kind === "thread") {
      const resolved = resolvedThreadRequest(request);
      if (!resolved.request) return failed({ reason: "invalid_shape_request", index, message: resolved.error });
      revolveRequest = resolved.request;
    }
    const parsed = parseRevolveRequest(revolveRequest);
    if (!parsed.ok) return failed({ reason: "invalid_shape_request", index, message: parsed.error });
    try {
      const runtime = await serverManifoldRuntime();
      return ok(revolvedShapeFromRequest(runtime, parsed, {
        name: typeof revolveRequest.name === "string" ? revolveRequest.name : undefined,
        color: typeof request.color === "string" ? request.color : undefined,
        x: typeof request.x === "number" ? request.x : undefined,
        z: typeof request.z === "number" ? request.z : undefined,
        elevation: typeof request.elevation === "number" ? request.elevation : undefined,
        rotation: typeof request.rotation === "number" ? request.rotation : undefined,
        hole: revolveRequest.hole === true,
      }));
    } catch (error) {
      return failed({
        reason: "sweep_failed",
        index,
        message: error instanceof Error ? error.message : "the revolve could not be built",
      });
    }
  }

  const shape = shapeFromRequest(request);
  return shape
    ? ok(shape)
    : failed({ reason: "unsupported_kind", index, kinds: [...REQUESTABLE_SHAPE_KINDS, "revolve", "thread"] });
}

export function createEngine(store: ProjectStore): Engine {
  /** Read the project under its lock, run `work`, and report a busy project as a failure. */
  async function mutating<T>(
    projectId: string,
    work: (document: ProjectDocument) => Promise<EngineResult<T>>,
  ): Promise<EngineResult<T>> {
    const locked = await store.withLock(projectId, async () => {
      const document = await store.read(projectId);
      return document ? work(document) : failed<T>({ reason: "project_not_found" });
    });
    // `result` is present exactly when the lock was taken; the cast is the type
    // system's price for `withLock` reporting both outcomes in one object.
    return locked.busy ? failed({ reason: "project_busy" }) : locked.result as EngineResult<T>;
  }

  /**
   * Read the project without taking the lock.
   *
   * The read-only operations do not lock, which is how the handlers they
   * replace behaved: a reader that locked would make two concurrent `GET
   * /edges` calls fight, and reading a project mid-write is no worse than
   * reading it a millisecond earlier.
   */
  async function reading<T>(
    projectId: string,
    work: (document: ProjectDocument) => Promise<EngineResult<T>>,
  ): Promise<EngineResult<T>> {
    const document = await store.read(projectId);
    return document ? work(document) : failed({ reason: "project_not_found" });
  }

  /** The shared tail of every write: swap the shapes in and report the revision. */
  async function writeShapes(
    projectId: string,
    document: ProjectDocument,
    shapes: WorkplaneShape[],
  ): Promise<number> {
    const { revision } = await store.write(projectId, document, shapes);
    return revision;
  }

  /**
   * A group or a cut, which are the same operation.
   *
   * Grouping is how the app subtracts, so a selection carrying a shape marked
   * `hole: true` comes back cut rather than merely bundled. The only difference
   * between the two endpoints is where the hole marks come from: `groups` reads
   * them off the stored shapes, `booleans` is told which operands to treat as
   * holes. `holes` being undefined is the former.
   */
  async function combine(
    projectId: string,
    ids: string[],
    holes: Set<string> | undefined,
  ): Promise<EngineResult<ShapeWritten>> {
    return mutating(projectId, async (document) => {
      const resolved = shapesByIds(document, ids);
      if (!resolved.ok) return resolved;
      const locked = lockedIds(resolved.value);
      if (locked) return failed({ reason: "shape_locked", ids: locked });

      const operands = holes
        ? resolved.value.map((shape) => withHoleMode(shape, holes.has(shape.id)))
        : resolved.value;
      const outcome = await buildGroupFromSelection(operands);
      if ("error" in outcome) {
        return failed({ reason: "geometry_failed", message: outcome.error, status: outcome.status });
      }
      // Nothing was removed, so this is not the operation the caller asked for.
      // Refused before the project is written, and refused rather than answered
      // with the solid unchanged, which is the one reply a script cannot tell
      // from success. The editor treats the same case as a failed cut.
      if (outcome.cutRemovedNothing) return failed({ reason: "cut_removed_nothing" });

      const consumed = new Set(ids);
      const shapes = [...document.shapes.filter((shape) => !consumed.has(shape.id)), outcome.group];
      return ok({ shape: outcome.group, revision: await writeShapes(projectId, document, shapes) });
    });
  }

  /** The shared tail of `treat` and `shell`: run the kernel, store the result on the shape. */
  async function cadTreatment(
    projectId: string,
    shapeId: string,
    run: (shape: WorkplaneShape) => Promise<WorkplaneShape>,
  ): Promise<EngineResult<ShapeWritten>> {
    return mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      if (found.value.locked) return failed({ reason: "shape_locked", ids: [shapeId] });

      let changed: WorkplaneShape;
      try {
        changed = await run(found.value);
      } catch (error) {
        return failed(cadFailure(error));
      }
      const shapes = document.shapes.map((candidate) => (candidate.id === shapeId ? changed : candidate));
      return ok({ shape: changed, revision: await writeShapes(projectId, document, shapes) });
    });
  }

  /**
   * The shared body of `align` and `distribute`.
   *
   * Both resolve a selection, measure it along one axis, ask a pure function
   * which members move and how far, and write the ones that did. The only
   * things that differ are how few shapes is too few and which function
   * answers, so both are arguments.
   *
   * A selection that was already arranged writes nothing: the project is
   * unchanged, and writing it anyway would bump the revision, push an undo
   * entry and tell every open dashboard to reload, all to say nothing
   * happened. `moved: 0` says it instead.
   */
  async function arrange(
    projectId: string,
    ids: string[],
    axis: AlignAxis,
    needed: number,
    shiftsFor: (entries: AlignEntry[]) => Array<{ id: string; delta: number }>,
  ): Promise<EngineResult<ShapesArranged>> {
    return mutating(projectId, async (document) => {
      if (ids.length < needed) return failed({ reason: "selection_too_small", needed, given: ids.length });
      const resolved = shapesByIds(document, ids);
      if (!resolved.ok) return resolved;

      const selection = resolved.value;
      const shifts = shiftsFor(selection.map((shape) => alignEntry(shape, axis)));
      if (shifts.length === 0) {
        return ok({ shapes: selection, moved: 0, revision: documentRevision(document) });
      }

      const deltaById = new Map(shifts.map((shift) => [shift.id, shift.delta]));
      const shapes = document.shapes.map((shape) => {
        const delta = deltaById.get(shape.id);
        return delta === undefined ? shape : shapeMovedAlong(shape, axis, delta);
      });
      const selected = new Set(ids);
      return ok({
        shapes: shapes.filter((shape) => selected.has(shape.id)),
        moved: shifts.length,
        revision: await writeShapes(projectId, document, shapes),
      });
    });
  }

  return {
    project: (projectId) => reading(projectId, async (document) => ok({
      projectId,
      name: document.projectName,
      createdAt: document.createdAt,
      revision: documentRevision(document),
      shapes: document.shapes,
      snapGrid: document.snapGrid,
      workspace: document.workspace,
    })),

    addShapes: async (projectId, requests) => {
      const built: WorkplaneShape[] = [];
      for (const [index, request] of requests.entries()) {
        const shape = await builtShape(request, index);
        if (!shape.ok) return shape;
        built.push(shape.value);
      }
      return mutating(projectId, async (document) => ok({
        shapes: built,
        revision: await writeShapes(projectId, document, [...document.shapes, ...built]),
      }));
    },

    changeShape: (projectId, shapeId, changes) => mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      const existing = found.value;
      // A locked shape refuses every change but the one that unlocks it, which
      // may arrive in the same request as the rest: `locked: false` alongside a
      // new width is one call rather than two.
      if (existing.locked && changes.locked !== false) return failed({ reason: "shape_locked", ids: [shapeId] });

      const sweptShape = isRevolveShape(existing);
      const misplaced = REVOLVE_ONLY_FIELDS.filter((field) => changes[field] !== undefined);
      if (!sweptShape && misplaced.length > 0) {
        return failed({ reason: "unapplicable_fields", kind: existing.kind, fields: [...misplaced], because: "no_sweep" });
      }

      // A pitch, a turn count or a new outline is geometry rather than a
      // property, so the mesh is swept again here. Refusing to rebuild would
      // leave a thread's pitch readable but not writable.
      const revolveChanges = sweptShape ? REVOLVE_CHANGE_FIELDS.filter((field) => changes[field] !== undefined) : [];
      let swept = existing;
      if (revolveChanges.length > 0 && sweptShape) {
        const outline = changes.profile ?? changes.outline ?? outlineFromProfile(existing.sketchProfile!);
        if (!outline) {
          return failed({
            reason: "unapplicable_fields",
            kind: existing.kind,
            fields: [...revolveChanges],
            because: "outline_not_described",
          });
        }
        const parsed = parseRevolveRequest({ profile: outline });
        if (!parsed.ok) return failed({ reason: "invalid_shape_request", message: parsed.error });
        try {
          const runtime = await serverManifoldRuntime();
          swept = rebuiltRevolveShape(runtime, existing, {
            profile: parsed.profile,
            settings: requestedRevolveSettings(existing.sketchRevolve!, changes),
          });
        } catch (error) {
          return failed({
            reason: "sweep_failed",
            message: error instanceof Error ? error.message : "The revolve could not be rebuilt",
          });
        }
      }

      // The sweep's own fields are already applied, so they are kept out of the
      // per-kind pass -- which would refuse them, the stored kind being `mesh`.
      const sweepFields: readonly string[] = sweptShape ? REVOLVE_CHANGE_FIELDS : REVOLVE_ONLY_FIELDS;
      const changed = shapeWithRequestedChanges(swept, Object.fromEntries(
        Object.entries(changes).filter(([field]) => !sweepFields.includes(field)),
      ));
      if (!changed.ok) {
        return failed({
          reason: "unapplicable_fields",
          kind: existing.kind,
          fields: changed.unapplicable,
          because: "not_this_kind",
        });
      }

      const shapes = document.shapes.map((shape) => (shape.id === shapeId ? changed.shape : shape));
      return ok({ shape: changed.shape, revision: await writeShapes(projectId, document, shapes) });
    }),

    removeShape: (projectId, shapeId) => mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      if (found.value.locked) return failed({ reason: "shape_locked", ids: [shapeId] });

      const shapes = document.shapes.filter((shape) => shape.id !== shapeId);
      return ok({ id: shapeId, revision: await writeShapes(projectId, document, shapes) });
    }),

    align: async (projectId, request) => {
      // The anchor is decided from the selection, so it has to be resolved
      // alongside it -- and reported, because a locked shape overrides what the
      // caller asked for and the caller has no other way to learn that.
      let anchorId: string | null = null;
      const arranged = await arrange(projectId, request.ids, request.axis, 2, (entries) => {
        anchorId = effectiveAlignAnchorId(entries, request.anchorId);
        return alignShifts(entries, request.target, anchorId);
      });
      return arranged.ok ? ok({ ...arranged.value, anchorId }) : arranged;
    },

    distribute: async (projectId, request) => {
      const spacing: DistributeSpacing = request.spacing === "centers" ? "centers" : "gaps";
      // The axis has to be chosen from the shapes, which means reading the
      // project before `arrange` does. Read without the lock, as every reader
      // here does: a selection cannot be measured and then arranged atomically
      // anyway, and the alternative is a second kind of `mutating`.
      const document = await store.read(projectId);
      if (!document) return failed({ reason: "project_not_found" });
      if (request.ids.length < 3) {
        return failed({ reason: "selection_too_small", needed: 3, given: request.ids.length });
      }
      const resolved = shapesByIds(document, request.ids);
      if (!resolved.ok) return resolved;

      const axis = request.axis ?? widestDistributeAxis(resolved.value.map((shape) => ({
        x: alignEntry(shape, "x"),
        z: alignEntry(shape, "z"),
      })));
      if (!axis) return failed({ reason: "no_distribute_axis" });

      const arranged = await arrange(projectId, request.ids, axis, 3, (entries) => distributeShifts(entries, spacing));
      return arranged.ok ? ok({ ...arranged.value, axis, spacing }) : arranged;
    },

    pattern: (projectId, request) => mutating(projectId, async (document) => {
      if (request.ids.length < 1) return failed({ reason: "selection_too_small", needed: 1, given: 0 });
      const resolved = shapesByIds(document, request.ids);
      if (!resolved.ok) return resolved;

      const sources = resolved.value;
      // A ring turns about a point, and the copies keep their distance from it,
      // so what travels is the selection's own centre rather than each shape's.
      const origin = footprintCenter(boundsForShapes(sources)!);
      const placements = request.kind === "linear"
        ? linearPatternPlacements({ count: request.count, stepX: request.stepX, stepZ: request.stepZ })
        : circularPatternPlacements({
          count: request.count,
          centerX: request.centerX ?? 0,
          centerZ: request.centerZ ?? 0,
          sweepAngle: request.sweepAngle,
          rotateCopies: request.rotateCopies,
        }, origin);
      if (placements.length === 0) return failed({ reason: "pattern_has_no_step", kind: request.kind });

      const copies = placements.flatMap((placement) => sources.map((shape) => {
        const clone = cloneWorkplaneShapeTreeWithFreshIds(shape, "pattern");
        // The copy turns about the ring's centre, so its own rotation gains the
        // same angle the placement did.
        return canonicalizeShape({
          ...clone,
          x: storedCoordinate(clone.x + placement.dx),
          z: storedCoordinate(clone.z + placement.dz),
          rotation: placement.rotation === 0 ? clone.rotation : cleanRotationDegrees(clone.rotation + placement.rotation),
        });
      }));
      return ok({
        shapes: copies,
        revision: await writeShapes(projectId, document, [...document.shapes, ...copies]),
      });
    }),

    importMesh: (projectId, request) => mutating(projectId, async (document) => {
      // Checked before the bytes are touched, and apart from a parse failure:
      // "this server cannot read .3mf" and "this .stl is truncated" are
      // different answers, and only one of them is worth retrying with the
      // same file.
      if (!importableMeshFormat(request.fileName)) {
        return failed({
          reason: "import_unsupported",
          fileName: request.fileName,
          formats: [...IMPORTABLE_MESH_FORMATS],
        });
      }

      let imported: ImportedMesh;
      try {
        imported = await importedMeshFromFile(request.fileName, request.bytes, request.mediaType);
      } catch (error) {
        return failed({
          reason: "import_failed",
          fileName: request.fileName,
          message: error instanceof Error ? error.message : "The file could not be read",
        });
      }

      // The asset goes in with the shape, in the same write. The shape points
      // at the file by id and the file lives on the project, so a write that
      // carried one without the other would store an import whose source is
      // gone -- and the next save would strip the geometry out with it.
      const assets = dedupeProjectAssets([...document.assets, imported.asset]);
      const shapes = [...document.shapes, imported.shape];
      const { revision } = await store.write(projectId, { ...document, assets }, shapes);
      return ok({ shape: imported.shape, revision });
    }),

    cut: (projectId, request) => combine(
      projectId,
      [...request.solidIds, ...request.holeIds],
      new Set(request.holeIds),
    ),

    group: (projectId, ids) => combine(projectId, ids, undefined),

    ungroup: (projectId, shapeId) => mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      if (found.value.locked) return failed({ reason: "shape_locked", ids: [shapeId] });
      if (!found.value.groupedShapes?.length) return failed({ reason: "not_a_group" });

      // A group can have been moved, turned and resized since it was made, so
      // its children come back carrying all of that.
      const children = restoreGroupedChildren(found.value);
      const shapes = [...document.shapes.filter((shape) => shape.id !== shapeId), ...children];
      return ok({ shapes: children, revision: await writeShapes(projectId, document, shapes) });
    }),

    separate: (projectId, shapeId) => mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      if (found.value.locked) return failed({ reason: "shape_locked", ids: [shapeId] });
      if (found.value.hole) return failed({ reason: "hole_has_no_parts" });

      const parts = separateShapeParts(found.value);
      // A shape built from parameters is one body by construction, so this is
      // answered without meshing anything.
      if (parts.length <= 1) return failed({ reason: "single_body" });

      const shapes = [...document.shapes.filter((candidate) => candidate.id !== shapeId), ...parts];
      return ok({ shapes: parts, revision: await writeShapes(projectId, document, shapes) });
    }),

    explode: (projectId, shapeId) => mutating(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      if (found.value.locked) return failed({ reason: "shape_locked", ids: [shapeId] });
      const assetId = found.value.importedMesh?.assetId;
      const source = assetId ? document.assets.find((asset) => asset.id === assetId) : undefined;
      if (!source) return failed({ reason: "cad_refused", message: "The imported STEP source asset is no longer available.", status: 422 });
      try {
        const parts = await explodeStepAssembly(found.value, source);
        const index = document.shapes.findIndex((shape) => shape.id === shapeId);
        const shapes = [...document.shapes.slice(0, index), ...parts, ...document.shapes.slice(index + 1)];
        return ok({ shapes: parts, revision: await writeShapes(projectId, document, shapes) });
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    edges: (projectId, shapeId) => reading(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      try {
        return ok(await shapeEdges(found.value));
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    faces: (projectId, shapeId) => reading(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      try {
        return ok(await shapeFaces(found.value));
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    measurements: (projectId, shapeId) => reading(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      try {
        return ok(await shapeMeasurements(found.value));
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    properties: (projectId, shapeId) => reading(projectId, async (document) => {
      const found = oneShape(document, shapeId);
      if (!found.ok) return found;
      try {
        return ok(await shapeProperties(found.value));
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    measureBetween: (projectId, from, to) => reading(projectId, async (document) => {
      // Both ends resolve before either is measured, so a request naming one
      // shape that is not in the project is refused by id rather than half done.
      const shapes = shapesByIds(document, [from.shapeId, to.shapeId]);
      if (!shapes.ok) return shapes;
      const shapeById = (id: string) => shapes.value.find((shape) => shape.id === id) as WorkplaneShape;
      try {
        return ok(await measureBetweenEntities(
          { shape: shapeById(from.shapeId), entity: from.entity, index: from.index },
          { shape: shapeById(to.shapeId), entity: to.entity, index: to.index },
        ));
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    interference: (projectId, request = {}) => reading(projectId, async (document) => {
      const ids = request.ids;
      if (ids) {
        const found = shapesByIds(document, ids);
        if (!found.ok) return found;
      }
      try {
        const result = await checkInterference(document.shapes, request);
        return result.ok ? ok(result.value) : failed({ reason: "interference_refused", refusal: result.refusal });
      } catch (error) {
        return failed(cadFailure(error));
      }
    }),

    treat: (projectId, shapeId, treatment) => cadTreatment(projectId, shapeId, async (shape) => (
      shapeWithCadResult(shape, await applyEdgeTreatment(shape, treatment))
    )),

    mirrorBaked: (projectId, ids, axis) => mutating(projectId, async (document) => {
      if (ids.length < 1) return failed({ reason: "selection_too_small", needed: 1, given: 0 });
      const resolved = shapesByIds(document, ids);
      if (!resolved.ok) return resolved;
      const locked = lockedIds(resolved.value);
      if (locked) return failed({ reason: "shape_locked", ids: locked });

      const bounds = boundsForMirroring(resolved.value);
      const pivot = axis === "x" ? (bounds.minX + bounds.maxX) / 2
        : axis === "y" ? (bounds.minY + bounds.maxY) / 2
          : (bounds.minZ + bounds.maxZ) / 2;
      const changed: WorkplaneShape[] = [];
      try {
        for (const shape of resolved.value) changed.push(await applyBakedMirror(shape, axis, pivot));
      } catch (error) {
        return failed(cadFailure(error));
      }
      const byId = new Map(changed.map((shape) => [shape.id, shape]));
      const shapes = document.shapes.map((shape) => byId.get(shape.id) ?? shape);
      return ok({
        shapes: resolved.value.map((shape) => byId.get(shape.id) as WorkplaneShape),
        moved: changed.length,
        revision: await writeShapes(projectId, document, shapes),
      });
    }),

    shell: (projectId, shapeId, request) => cadTreatment(projectId, shapeId, async (shape) => (
      shapeWithCadResult(shape, await applyShell(shape, request))
    )),
  };
}
