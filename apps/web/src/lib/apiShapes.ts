/**
 * How the REST API describes a shape (upstream issue #55).
 *
 * Deliberately the same field names the API accepts when creating one, so a
 * script can read a shape, change a number, and send it back. That promise only
 * holds if everything settable is also readable, so the per-kind parameters are
 * taken from the same table `POST` and `PATCH` are driven by rather than listed
 * again here: a parameter the API can set is a parameter it reports.
 */

import { isRevolveShape, outlineFromProfile } from "@/lib/engine/revolveRequests";
import { isRequestableShapeKind, shapeParameterNamesFor } from "@/lib/engine/shapeRequests";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * The `kind` a `POST` would need to build this shape again, when there is one.
 *
 * `kind` itself stays what the project stores, which is what the editor shows
 * and what every existing caller already reads -- a `cube` is a box whose sides
 * match, and a revolve is a mesh carrying its profile. But the stored kind
 * cannot be sent back: posting `kind: "mesh"` is refused, and a thread, an
 * imported STL and a boolean cut are all `mesh`, so a client had no way to tell
 * them apart. This says which of them can be asked for again, and how.
 *
 * A group is absent on purpose. Its geometry is the cut that made it, not a
 * parameter, so there is no request that reproduces it.
 */
export function apiShapeRequestKind(shape: WorkplaneShape) {
  if (shape.groupedShapes?.length) return undefined;
  if (isRevolveShape(shape)) return "revolve";
  return isRequestableShapeKind(shape.kind) ? shape.kind : undefined;
}

export function apiShapeSummary(shape: WorkplaneShape) {
  const requestKind = apiShapeRequestKind(shape);
  const revolve = isRevolveShape(shape) ? shape.sketchRevolve : undefined;
  const outline = shape.sketchProfile && revolve ? outlineFromProfile(shape.sketchProfile) : null;
  const parameters: Record<string, unknown> = {};
  for (const name of shapeParameterNamesFor(shape.kind)) {
    if (shape[name] !== undefined) parameters[name] = shape[name];
  }

  return {
    id: shape.id,
    name: shape.name,
    kind: shape.kind,
    ...(requestKind === undefined ? {} : { requestKind }),
    ...(shape.sketchOperation === undefined ? {} : { sketchOperation: shape.sketchOperation }),
    color: shape.color,
    ...(shape.faceColors ? { faceColors: shape.faceColors } : {}),
    hole: Boolean(shape.hole),
    locked: Boolean(shape.locked),
    hidden: Boolean(shape.hidden),
    x: shape.x,
    z: shape.z,
    elevation: shape.elevation ?? 0,
    width: shape.width ?? shape.size ?? 0,
    depth: shape.depth ?? shape.size ?? 0,
    height: shape.height,
    rotation: shape.rotation,
    rotationX: shape.rotationX ?? 0,
    rotationZ: shape.rotationZ ?? 0,
    ...parameters,
    ...(revolve ? { revolve: { ...revolve } } : {}),
    // The outline is the only part of a revolve that is not a number, and it is
    // what a fresh `POST` would have to carry, so it is reported alongside the
    // settings rather than left as the one field a round trip cannot recover.
    ...(outline ? { profile: outline } : {}),
    ...(shape.groupedShapes ? { groupedCount: shape.groupedShapes.length } : {}),
  };
}
