/**
 * Shapes described as plain data (upstream issue #55).
 *
 * The REST API and the MCP bridge both take a shape as a bag of parameters --
 * `{ kind: "cylinder", width: 20, sides: 6 }` -- and both need the same
 * answers for what a missing field means and what an out-of-range one becomes.
 * Keeping that in one pure place means a script driving the API gets the same
 * shape the editor would have built, and it can be tested without either.
 */

import {
  DEFAULT_GEAR_CENTER_HOLE_SIZE,
  DEFAULT_GEAR_HELIX_ANGLE,
  DEFAULT_GEAR_TEETH,
  DEFAULT_GEAR_TOOTH_SIZE,
  DEFAULT_GEAR_TYPE,
  normalizeGearCenterHoleSize,
  normalizeGearHelixAngle,
  normalizeGearTeeth,
  normalizeGearToothSize,
  normalizeGearToothWidth,
  normalizeGearType,
} from "./gearProfile.js";
import {
  DEFAULT_LOFT_BOTTOM_SHAPE,
  DEFAULT_LOFT_LAYERS,
  DEFAULT_LOFT_SEGMENTS,
  DEFAULT_LOFT_TOP_SHAPE,
  normalizeLoftLayers,
  normalizeLoftRotation,
  normalizeLoftSegments,
  normalizeLoftShape,
  normalizeLoftTopSize,
} from "./loftProfile.js";
import { sceneShape } from "./shapeCatalog.js";
import { canonicalizeShape, shapeDepth, shapeWidth } from "./workplaneShapes.js";
import type { ShapeKind, WorkplaneShape } from "./domain/sketchforge.js";

export const MIN_REQUESTED_DIMENSION = 0.01;
export const MAX_REQUESTED_DIMENSION = 10_000;

/**
 * The kinds that can be built from parameters alone, with no OCCT and no
 * browser.
 *
 * `cube` is not a kind of its own -- it is a box whose sides match -- but it is
 * accepted because it is what a caller means. Left out: `mesh`, `sketch`, and
 * `scribble`, which need geometry or a drawn profile rather than numbers.
 */
export const REQUESTABLE_SHAPE_KINDS = [
  "box", "cube", "cylinder", "cone", "sphere", "halfSphere", "torus",
  "tube", "ring", "polygon", "pyramid", "roof", "roundRoof", "wedge",
  "icosahedron", "text", "loft", "gear",
] as const;

export type RequestableShapeKind = (typeof REQUESTABLE_SHAPE_KINDS)[number];

export function isRequestableShapeKind(value: unknown): value is RequestableShapeKind {
  return typeof value === "string" && (REQUESTABLE_SHAPE_KINDS as readonly string[]).includes(value);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function dimension(value: unknown, fallback: number) {
  const requested = finiteNumber(value, fallback);
  return Math.min(MAX_REQUESTED_DIMENSION, Math.max(MIN_REQUESTED_DIMENSION, requested));
}

function integerAtLeast(value: unknown, floor: number, fallback: number) {
  return Math.max(floor, Math.floor(finiteNumber(value, fallback)));
}

function atLeast(value: unknown, floor: number, fallback: number) {
  return Math.max(floor, finiteNumber(value, fallback));
}

/**
 * What a parameter needs to know about the shape it is being read for.
 *
 * A loft's top size is measured against the base it sits on and a gear's tooth
 * size against the blank it is cut from, so the dimensions travel with the
 * value; `kind` is here because `bevel` is a wall thickness on a tube and a
 * rounded edge on text, with different floors.
 */
export type ShapeParameterContext = {
  kind: ShapeKind;
  width: number;
  depth: number;
  teeth?: number;
  toothSize?: number;
  text?: string;
  font?: string;
};

export function shapeParameterContext(shape: WorkplaneShape): ShapeParameterContext {
  return {
    kind: shape.kind,
    width: shapeWidth(shape),
    depth: shapeDepth(shape),
    teeth: shape.teeth,
    toothSize: shape.toothSize,
    text: shape.text,
    font: shape.font,
  };
}

function onKinds(...kinds: readonly ShapeKind[]) {
  return (kind: ShapeKind) => kinds.includes(kind);
}

type ShapeParameter<Key extends ShapeParameterName> = {
  /** Whether a shape of that kind is built from this parameter at all. */
  appliesTo: (kind: ShapeKind) => boolean;
  read: (value: unknown, context: ShapeParameterContext, fallback: WorkplaneShape[Key]) => NonNullable<WorkplaneShape[Key]>;
};

export type ShapeParameterName =
  | "steps" | "sides" | "bevel" | "segments" | "topRadius" | "baseRadius"
  | "taperTopWidth" | "taperTopDepth" | "taperBottomWidth" | "taperBottomDepth"
  | "teeth" | "toothSize" | "toothWidth" | "centerHoleSize" | "gearType" | "helixAngle"
  | "loftBottomShape" | "loftTopShape" | "loftTopWidth" | "loftTopDepth"
  | "loftBottomRotation" | "loftTopRotation" | "loftSegments" | "loftLayers"
  | "text" | "font";

/**
 * Every parameter a shape carries beyond its placement and its size, and which
 * kinds are built from it.
 *
 * One table rather than a branch per kind in each caller, because three places
 * need the same answer: what to build from a request, what to report when a
 * shape is read back, and whether a change names something the shape's kind has
 * any use for. Split across those three, a field added to one is a field
 * silently lost by the other two -- which is what the summary and `PATCH` did
 * to all of these.
 *
 * Taper is on every kind but `gear`, whose teeth are cut from a flat blank.
 */
export const SHAPE_PARAMETERS: { [Key in ShapeParameterName]: ShapeParameter<Key> } = {
  steps: { appliesTo: onKinds("sphere", "halfSphere"), read: (value, _context, fallback) => integerAtLeast(value, 4, fallback ?? 32) },
  sides: { appliesTo: onKinds("cylinder", "cone", "pyramid", "roundRoof"), read: (value, _context, fallback) => integerAtLeast(value, 3, fallback ?? 96) },
  bevel: {
    appliesTo: onKinds("tube", "ring", "text"),
    read: (value, context, fallback) => atLeast(value, context.kind === "text" ? 0 : 0.1, fallback ?? (context.kind === "text" ? 0 : 4)),
  },
  segments: { appliesTo: onKinds("text"), read: (value, _context, fallback) => integerAtLeast(value, 1, fallback ?? 2) },
  topRadius: { appliesTo: onKinds("cone"), read: (value, _context, fallback) => atLeast(value, 0, fallback ?? 0) },
  baseRadius: { appliesTo: onKinds("cone"), read: (value, context, fallback) => atLeast(value, MIN_REQUESTED_DIMENSION, fallback ?? context.width / 2) },
  taperTopWidth: { appliesTo: (kind) => kind !== "gear", read: (value, context, fallback) => dimension(value, fallback ?? context.width) },
  taperTopDepth: { appliesTo: (kind) => kind !== "gear", read: (value, context, fallback) => dimension(value, fallback ?? context.depth) },
  taperBottomWidth: { appliesTo: (kind) => kind !== "gear", read: (value, context, fallback) => dimension(value, fallback ?? context.width) },
  taperBottomDepth: { appliesTo: (kind) => kind !== "gear", read: (value, context, fallback) => dimension(value, fallback ?? context.depth) },
  // A gear's parameters are clamped by the editor's own normalizers rather than
  // by bare floors, because the project format accepts only what they produce:
  // a four-toothed gear or a gear with no type is a package that cannot be read
  // back at all.
  teeth: { appliesTo: onKinds("gear"), read: (value, _context, fallback) => normalizeGearTeeth(finiteNumber(value, fallback ?? DEFAULT_GEAR_TEETH)) },
  toothSize: {
    appliesTo: onKinds("gear"),
    read: (value, context, fallback) => normalizeGearToothSize(finiteNumber(value, fallback ?? DEFAULT_GEAR_TOOTH_SIZE), context.width, context.depth),
  },
  toothWidth: {
    appliesTo: onKinds("gear"),
    read: (value, context, fallback) =>
      normalizeGearToothWidth(typeof value === "number" ? value : fallback, context.width, context.depth, context.teeth),
  },
  centerHoleSize: {
    appliesTo: onKinds("gear"),
    read: (value, context, fallback) =>
      normalizeGearCenterHoleSize(finiteNumber(value, fallback ?? DEFAULT_GEAR_CENTER_HOLE_SIZE), context.width, context.depth, context.toothSize),
  },
  gearType: { appliesTo: onKinds("gear"), read: (value, _context, fallback) => normalizeGearType(nonEmptyString(value, fallback ?? DEFAULT_GEAR_TYPE)) },
  helixAngle: {
    appliesTo: onKinds("gear"),
    read: (value, _context, fallback) => normalizeGearHelixAngle(finiteNumber(value, fallback ?? DEFAULT_GEAR_HELIX_ANGLE)),
  },
  loftBottomShape: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftShape(nonEmptyString(value, fallback ?? DEFAULT_LOFT_BOTTOM_SHAPE), fallback ?? DEFAULT_LOFT_BOTTOM_SHAPE) },
  loftTopShape: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftShape(nonEmptyString(value, fallback ?? DEFAULT_LOFT_TOP_SHAPE), fallback ?? DEFAULT_LOFT_TOP_SHAPE) },
  loftTopWidth: { appliesTo: onKinds("loft"), read: (value, context, fallback) => normalizeLoftTopSize(finiteNumber(value, fallback ?? context.width), context.width) },
  loftTopDepth: { appliesTo: onKinds("loft"), read: (value, context, fallback) => normalizeLoftTopSize(finiteNumber(value, fallback ?? context.depth), context.depth) },
  loftBottomRotation: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftRotation(finiteNumber(value, fallback ?? 0)) },
  loftTopRotation: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftRotation(finiteNumber(value, fallback ?? 0)) },
  loftSegments: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftSegments(finiteNumber(value, fallback ?? DEFAULT_LOFT_SEGMENTS)) },
  loftLayers: { appliesTo: onKinds("loft"), read: (value, _context, fallback) => normalizeLoftLayers(finiteNumber(value, fallback ?? DEFAULT_LOFT_LAYERS)) },
  text: { appliesTo: onKinds("text"), read: (value, _context, fallback) => nonEmptyString(value, fallback ?? "TEXT") },
  font: { appliesTo: onKinds("text"), read: (value, _context, fallback) => nonEmptyString(value, fallback ?? "Multilanguage") },
};

export const SHAPE_PARAMETER_NAMES = Object.keys(SHAPE_PARAMETERS) as ShapeParameterName[];

export function isShapeParameterName(value: string): value is ShapeParameterName {
  return value in SHAPE_PARAMETERS;
}

/** The parameters a shape of that kind is built from, in table order. */
export function shapeParameterNamesFor(kind: ShapeKind) {
  return SHAPE_PARAMETER_NAMES.filter((name) => SHAPE_PARAMETERS[name].appliesTo(kind));
}

function readShapeParameter<Key extends ShapeParameterName>(
  name: Key,
  value: unknown,
  context: ShapeParameterContext,
  fallback: WorkplaneShape[Key],
) {
  return SHAPE_PARAMETERS[name].read(value, context, fallback);
}

function defaultColorFor(kind: RequestableShapeKind) {
  if (kind === "cylinder" || kind === "tube" || kind === "ring") return "#d97813";
  if (kind === "loft") return "#5b5ce2";
  return "#d41721";
}

const KIND_NAMES: Partial<Record<RequestableShapeKind, string>> = {
  cube: "Cube",
  halfSphere: "Half sphere",
  roundRoof: "Round roof",
  text: "Text",
};

function defaultNameFor(kind: RequestableShapeKind) {
  return KIND_NAMES[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

export type ShapeRequest = Record<string, unknown>;

/**
 * The dimensions a request asks for.
 *
 * `size` stands in for any of the three, and a cube takes its width for all of
 * them, so `{ kind: "cube", size: 10 }` and `{ kind: "cube", width: 10 }` mean
 * the same thing.
 */
export function requestedDimensions(request: ShapeRequest) {
  const width = dimension(request.width ?? request.size, 20);
  const isCube = request.kind === "cube";
  return {
    width,
    depth: dimension(request.depth ?? request.size, isCube ? width : 20),
    height: dimension(request.height ?? request.size, isCube ? width : 20),
  };
}

/**
 * A shape built from a request, or null when the kind cannot be built this way.
 *
 * Sketch extrusions are the notable absence: their geometry comes from OCCT,
 * which only runs in the editor's worker.
 */
export function shapeFromRequest(request: ShapeRequest, defaults: { elevation?: number } = {}): WorkplaneShape | null {
  const requestedKind = nonEmptyString(request.kind, "box");
  if (!isRequestableShapeKind(requestedKind)) return null;
  // "cube" is a box whose sides match; it is not a kind of its own.
  const kind = requestedKind === "cube" ? "box" : requestedKind;
  const { width, depth, height } = requestedDimensions({ ...request, kind: requestedKind });

  const base = {
    name: nonEmptyString(request.name, defaultNameFor(requestedKind)),
    kind,
    color: nonEmptyString(request.color, defaultColorFor(requestedKind)),
    x: finiteNumber(request.x, 0),
    z: finiteNumber(request.z, 0),
    elevation: finiteNumber(request.elevation, defaults.elevation ?? 0),
    width,
    depth,
    height,
    size: Math.max(width, depth),
    rotation: finiteNumber(request.rotation, 0),
    rotationX: finiteNumber(request.rotationX, 0),
    rotationZ: finiteNumber(request.rotationZ, 0),
    hole: request.hole === true,
  } as const;

  const context: ShapeParameterContext = { kind, width, depth };
  /**
   * A parameter the kind is built from whether the request mentioned it or not.
   *
   * These are the ones with no sensible absence: a tube with no wall thickness
   * is a cylinder, and text with no string has nothing to extrude.
   */
  const always = <Key extends ShapeParameterName>(name: Key, fallback?: WorkplaneShape[Key]) =>
    ({ [name]: readShapeParameter(name, request[name], context, fallback) }) as Pick<WorkplaneShape, Key>;
  /** A parameter left unset when the request is silent, so the editor's own default stands. */
  const given = <Key extends ShapeParameterName>(name: Key) =>
    (request[name] === undefined ? {} : always(name)) as Partial<Pick<WorkplaneShape, Key>>;

  /**
   * Every parameter this kind is built from that the request actually named.
   *
   * The branches below name the parameters a kind cannot do without, which is
   * right for a parameter with no sensible absence and wrong for one the caller
   * asked for: `POST { kind: "box", taperTopWidth: 2 }` built a straight box
   * and answered 201, because no branch mentions taper even though the table
   * says all four taper fields apply to every kind but `gear`. `PATCH` applied
   * them all along, by looping over this same table -- so create and patch
   * disagreed about what a box is, and the only way to find out was to create
   * one and then patch it.
   *
   * Driven by the table so a parameter added there works on create without
   * anyone remembering to touch a branch.
   */
  const requested = () => {
    const applied: Partial<WorkplaneShape> = {};
    for (const name of shapeParameterNamesFor(kind)) {
      if (request[name] === undefined) continue;
      Object.assign(applied, always(name));
    }
    return applied;
  };

  /**
   * `extras` last: a kind's mandatory parameters keep their defaults when the
   * request is silent, and read the same value as `requested` when it is not.
   */
  const build = (extras: Partial<WorkplaneShape> = {}) =>
    canonicalizeShape(sceneShape({ ...base, ...requested(), ...extras }));

  if (kind === "cylinder") {
    return build(always("sides"));
  }

  if (kind === "pyramid" || kind === "polygon") {
    // A pyramid takes a facet count the way a cylinder does; `polygon` is
    // always the editor's six-sided prism, so its count is not a parameter.
    return build(kind === "pyramid" ? always("sides", 4) : {});
  }

  if (kind === "tube" || kind === "ring") {
    // `bevel` carries the wall thickness for these two.
    return build(always("bevel"));
  }

  if (kind === "cone") {
    // The base radius is written out rather than left to the geometry's own
    // half-the-width fallback, so a cone read back says what it is standing on.
    return build({ ...always("topRadius"), ...always("baseRadius"), ...given("sides") });
  }

  if (kind === "gear") {
    // Every one of these is written out rather than left to the editor's
    // defaults: the project format requires a gear to carry its tooth count,
    // tooth size and type, and a tooth's width is measured against the count.
    const teeth = readShapeParameter("teeth", request.teeth, context, undefined);
    const toothSize = readShapeParameter("toothSize", request.toothSize, { ...context, teeth }, undefined);
    const gearContext = { ...context, teeth, toothSize };
    return build({
            teeth,
      toothSize,
      toothWidth: readShapeParameter("toothWidth", request.toothWidth, gearContext, undefined),
      centerHoleSize: readShapeParameter("centerHoleSize", request.centerHoleSize, gearContext, undefined),
      gearType: readShapeParameter("gearType", request.gearType, gearContext, undefined),
      helixAngle: readShapeParameter("helixAngle", request.helixAngle, gearContext, undefined),
    });
  }

  if (kind === "halfSphere" || kind === "sphere") {
    return build(given("steps"));
  }

  if (kind === "text") {
    return build({
            ...always("text"),
      ...always("font"),
      ...always("bevel"),
      ...always("segments"),
    });
  }

  if (kind === "loft") {
    return build({
            ...always("loftBottomShape"),
      ...always("loftTopShape"),
      ...always("loftTopWidth"),
      ...always("loftTopDepth"),
      ...always("loftBottomRotation"),
      ...always("loftTopRotation"),
      ...always("loftSegments"),
      ...always("loftLayers"),
    });
  }

  return build();
}

/**
 * The fields a change may name that belong to the shape rather than to its kind.
 *
 * `size` stands in for all three dimensions, as it does on creation.
 */
export const SHAPE_CHANGE_FIELDS = [
  "name", "color", "faceColors", "x", "z", "elevation", "width", "depth", "height", "size",
  "rotation", "rotationX", "rotationZ", "mirrorX", "mirrorY", "mirrorZ", "hole", "locked", "hidden",
] as const;

/**
 * The summary's own fields, which describe a shape rather than set anything on it.
 *
 * Accepted and ignored rather than refused, because reading a shape and sending
 * the whole thing back with one number changed is the obvious way to use this
 * API, and refusing a shape's own id for being unsettable would make that an
 * error.
 */
export const SHAPE_DESCRIPTION_FIELDS = ["id", "kind", "requestKind", "sketchOperation", "groupedCount"] as const;

export type ShapeChangeResult =
  | { ok: true; shape: WorkplaneShape }
  | { ok: false; unapplicable: string[] };

/**
 * An existing shape with the requested changes applied, or the fields that
 * cannot be applied to it.
 *
 * A field is refused rather than ignored when the shape's kind is not built
 * from it -- `sides` on a box, `pitch` on anything that is not a revolve -- and
 * so is a field this version has never heard of. Silence was the previous
 * answer to all of them, and silence is indistinguishable from success: a
 * script that set a thread's pitch and read back the old one had no way to tell
 * whether the write or its own arithmetic was wrong.
 */
export function shapeWithRequestedChanges(shape: WorkplaneShape, request: ShapeRequest): ShapeChangeResult {
  const unapplicable = Object.keys(request).filter((field) => {
    if ((SHAPE_CHANGE_FIELDS as readonly string[]).includes(field)) return false;
    if ((SHAPE_DESCRIPTION_FIELDS as readonly string[]).includes(field)) return false;
    return !isShapeParameterName(field) || !SHAPE_PARAMETERS[field].appliesTo(shape.kind);
  });
  if (unapplicable.length > 0) return { ok: false, unapplicable };

  const next: WorkplaneShape = { ...shape };
  if (request.faceColors !== undefined) {
    if (shape.groupedShapes?.length || shape.importedMesh && !shape.importedMesh.brepStep && !shape.cadBrep) {
      return { ok: false, unapplicable: ["faceColors"] };
    }
    if (!request.faceColors || typeof request.faceColors !== "object" || Array.isArray(request.faceColors)) {
      return { ok: false, unapplicable: ["faceColors"] };
    }
    const entries = Object.entries(request.faceColors);
    if (entries.some(([index, color]) => !/^\d+$/.test(index) || !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(String(color)))) {
      return { ok: false, unapplicable: ["faceColors"] };
    }
    next.faceColors = Object.fromEntries(entries.map(([index, color]) => [Number(index), color as string]));
  }
  if (request.name !== undefined) next.name = nonEmptyString(request.name, shape.name);
  if (request.color !== undefined) next.color = nonEmptyString(request.color, shape.color);
  if (request.x !== undefined) next.x = finiteNumber(request.x, shape.x);
  if (request.z !== undefined) next.z = finiteNumber(request.z, shape.z);
  if (request.elevation !== undefined) next.elevation = finiteNumber(request.elevation, shape.elevation ?? 0);
  if (request.size !== undefined) {
    const size = dimension(request.size, shape.size);
    next.width = size;
    next.depth = size;
    next.height = size;
  }
  if (request.width !== undefined) next.width = dimension(request.width, shape.width ?? 20);
  if (request.depth !== undefined) next.depth = dimension(request.depth, shape.depth ?? 20);
  if (request.height !== undefined) next.height = dimension(request.height, shape.height);
  if (request.rotation !== undefined) next.rotation = finiteNumber(request.rotation, shape.rotation);
  if (request.rotationX !== undefined) next.rotationX = finiteNumber(request.rotationX, shape.rotationX ?? 0);
  if (request.rotationZ !== undefined) next.rotationZ = finiteNumber(request.rotationZ, shape.rotationZ ?? 0);
  if (request.mirrorX !== undefined) next.mirrorX = request.mirrorX === true;
  if (request.mirrorY !== undefined) next.mirrorY = request.mirrorY === true;
  if (request.mirrorZ !== undefined) next.mirrorZ = request.mirrorZ === true;
  if (request.hole !== undefined) next.hole = request.hole === true;
  if (request.locked !== undefined) next.locked = request.locked === true;
  if (request.hidden !== undefined) next.hidden = request.hidden === true;
  if (next.width !== shape.width || next.depth !== shape.depth) {
    next.size = Math.max(next.width ?? 20, next.depth ?? 20);
  }

  // Read against the shape as the change is leaving it, not as it arrived:
  // widening a loft and naming its top width in one request measures the top
  // against the new base, and a gear's tooth width against its new tooth count.
  for (const name of shapeParameterNamesFor(shape.kind)) {
    if (request[name] === undefined) continue;
    Object.assign(next, { [name]: readShapeParameter(name, request[name], shapeParameterContext(next), shape[name]) });
  }

  const geometryFields = ["width", "depth", "height", "size", ...Object.keys(SHAPE_PARAMETERS)];
  const nextFields = next as unknown as Record<string, unknown>;
  const previousFields = shape as unknown as Record<string, unknown>;
  if (geometryFields.some((field) => request[field] !== undefined && JSON.stringify(nextFields[field]) !== JSON.stringify(previousFields[field]))) {
    delete next.faceColors;
  }

  return { ok: true, shape: canonicalizeShape(next) };
}
