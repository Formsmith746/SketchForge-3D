/**
 * Fillet and chamfer on the server (upstream issue #55).
 *
 * Node-only. The browser worker does this for the editor, over a much wider
 * range of inputs: it can take any shape because the editor can mesh any
 * shape. The server has no mesher, so it works from what a stored project
 * actually carries -- a box's dimensions, a previous CAD result's exact BREP,
 * or an imported model's triangles -- and refuses anything else rather than
 * approximating it.
 *
 * The worker's own reconstruction is not reused: it lives inside a file that
 * talks to `self.postMessage` and is close to upstream's, and prising it apart
 * would conflict with every upstream change to it. What is shared instead is
 * the result format, so a shape filleted here is indistinguishable in the
 * editor from one filleted there.
 */

import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { withCadKernel } from "./serverCadKernel.js";
import {
  exactSolidForShape,
  shapeIsTurned,
  unrotatedSolidForShape,
  UnbuildableShapeError,
  EXACT_SOLID_KINDS,
} from "./cadSolids.js";
import { canonicalizeShape } from "./workplaneShapes.js";
import type { WorkplaneShape } from "./domain/sketchforge.js";

export type ServerCadEdge = {
  index: number;
  length: number;
  curveType: string;
  midpoint: { x: number; y: number; z: number };
  /**
   * Whether this edge is one a fillet or chamfer can act on.
   *
   * An edge between two faces can be rounded. A seam -- where one curved
   * surface meets itself, as on a cylinder's side or around a torus -- has no
   * two faces to blend, and OCCT refuses it.
   */
  filletable: boolean;
};

export type ServerCadTreatment = {
  kind: "fillet" | "chamfer";
  amount: number;
  /** Chamfers only; 45 degrees is a symmetric chamfer. */
  angle?: number;
  /** Edge indexes from `shapeEdges`, or every edge when omitted. */
  edges?: number[];
};

export class ServerCadError extends Error {
  readonly status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "ServerCadError";
    this.status = status;
  }
}

const MESH_DEFLECTION = 0.1;
const MIN_CAD_DIMENSION = 0.01;

function meshPositionsOf(shape: WorkplaneShape) {
  const positions = shape.importedMesh?.positions;
  return positions && positions.length >= 9 ? positions : null;
}

/** An ASCII STL of a triangle soup, which is how OCCT takes an arbitrary mesh. */
function asciiStlFromPositions(positions: number[]) {
  const lines = ["solid shape"];
  for (let index = 0; index + 8 < positions.length; index += 9) {
    lines.push("facet normal 0 0 0", "outer loop");
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = index + corner * 3;
      lines.push(`vertex ${positions[offset]} ${positions[offset + 1]} ${positions[offset + 2]}`);
    }
    lines.push("endloop", "endfacet");
  }
  lines.push("endsolid shape");
  return lines.join("\n");
}

/**
 * Whether the kernel considers a shape sound.
 *
 * Deliberately does not require a single solid, which `isValidSolid` below
 * does: a cut can split one solid into several bodies -- that is what
 * `POST /parts` exists to separate -- so a compound is a legitimate result and
 * must not be refused as invalid. Same semantics as the CAD modifier worker's
 * own check, so the two paths agree about what a usable result is.
 */
export function cadResultIsValid(cad: OcctKernel, shape: ShapeHandle) {
  try {
    return Boolean(cad.isValid(shape));
  } catch {
    return false;
  }
}

function isValidSolid(cad: OcctKernel, shape: ShapeHandle) {
  try {
    return cad.isSolid(shape) && Boolean(cad.isValid(shape));
  } catch {
    return false;
  }
}

function solidFromBrep(cad: OcctKernel, brep: string) {
  let exact = cad.fromBREP(brep);
  const solids = cad.getSubShapes(exact, "solid");
  if (isValidSolid(cad, exact) || solids.length > 0) {
    return solids.length === 1 ? solids[0] : exact;
  }
  exact = cad.fixShape(exact);
  exact = cad.fixFaceOrientations(exact);
  const healed = cad.getSubShapes(exact, "solid");
  if (isValidSolid(cad, exact) || healed.length > 0) {
    return healed.length === 1 ? healed[0] : exact;
  }
  throw new ServerCadError("The stored exact geometry for that shape could not be read.");
}

/** A solid sewn from a flat list of triangle corners, which is how a stored mesh arrives. */
export function solidFromMeshPositions(cad: OcctKernel, positions: number[]) {
  const imported = cad.importStl(asciiStlFromPositions(positions));
  let shape = cad.fixShape(imported);
  if (isValidSolid(cad, shape)) return shape;
  const faces = cad.getSubShapes(imported, "face");
  if (faces.length === 0) throw new ServerCadError("That shape's mesh has no faces to work from.");
  // Loosening the sewing tolerance in steps: a tessellated curve needs more
  // slack to close than a flat-faced mesh does.
  for (const tolerance of [1e-5, 1e-4, 1e-3, 1e-2]) {
    try {
      let candidate = cad.fixShape(cad.sewAndSolidify(faces, tolerance));
      candidate = cad.fixFaceOrientations(candidate);
      if (isValidSolid(cad, candidate)) return candidate;
    } catch {
      // Try the next tolerance.
    }
  }
  throw new ServerCadError("That shape's mesh is not a closed solid, so it cannot be filleted.");
}

/**
 * Whether the shape's geometry has to be turned, or arrives already turned.
 *
 * Stored geometry -- a previous result's BREP, an imported mesh -- is kept in
 * the frame the shape's own rotation applies *to*, so the rotation lives on the
 * shape and nothing rebuilds it. A parametric shape has no stored geometry, so
 * whatever frame its solid is in is a choice made when it is built.
 *
 * This is the one predicate the two builders below and
 * `treatmentBakesRotation` all read, so they cannot disagree about which frame
 * a solid is in -- which is exactly how they came to disagree before.
 */
function rotationIsRebuilt(shape: WorkplaneShape) {
  return !shape.cadBrep && !meshPositionsOf(shape);
}

/**
 * Whether a treated result has the shape's rotation baked into its geometry.
 *
 * True exactly when `orientedSolidForShape` applied it -- which is the only
 * place it is applied on this path. A result that has it baked in must not
 * carry the rotation as well, or the shape is turned twice.
 */
export function treatmentBakesRotation(shape: WorkplaneShape) {
  return rotationIsRebuilt(shape) && shapeIsTurned(shape);
}

/**
 * The shape as an exact solid, in its own local frame -- **unrotated**.
 *
 * A parametric shape is rebuilt from its dimensions rather than its mesh, so
 * its fillet is exact rather than a rounded approximation of a tessellation.
 *
 * Local: centred in X and Z with its base at Y=0 and square to the axes, which
 * is the frame every geometry builder in the app produces. A caller that needs
 * the solid where the shape actually sits has to place it -- rotation included.
 *
 * This is what a boolean wants: `shapePlacementMatrix` carries the shape's
 * rotation, so a solid that arrived already turned would be turned twice. It
 * was, until this split: a parametric operand went through
 * `exactSolidForShape`, which bakes the rotation in, and then through the
 * placement matrix, which applies it again. A 20x20x12 wedge at yaw 90 came out
 * with its centre of mass 3.33mm away in each of X and Z -- with the correct
 * volume and, because its footprint is square, the correct bounding box too.
 */
export function localSolidForShape(cad: OcctKernel, shape: WorkplaneShape) {
  if (shape.cadBrep) return solidFromBrep(cad, shape.cadBrep);

  const positions = meshPositionsOf(shape);
  if (positions) return solidFromMeshPositions(cad, [...positions]);

  try {
    return unrotatedSolidForShape(cad, shape);
  } catch (error) {
    if (error instanceof UnbuildableShapeError) throw new ServerCadError(error.message);
    throw error;
  }
}

/**
 * The same solid, turned the way the shape sits in the project.
 *
 * What an operation that stores its result as geometry wants -- a fillet, a
 * chamfer, a hollow -- because the result is stored as a mesh with no rotation
 * of its own, so a shape treated while turned would otherwise come back
 * straightened. `treatmentBakesRotation` is the other half of that bargain and
 * reads the same predicate.
 *
 * For stored geometry this is the local solid unchanged: the rotation stays on
 * the shape, which is where it already was.
 */
export function orientedSolidForShape(cad: OcctKernel, shape: WorkplaneShape) {
  if (!rotationIsRebuilt(shape)) return localSolidForShape(cad, shape);

  try {
    return exactSolidForShape(cad, shape);
  } catch (error) {
    if (error instanceof UnbuildableShapeError) throw new ServerCadError(error.message);
    throw error;
  }
}

/** How many faces of the solid meet along this edge. A seam reports one. */
function adjacentFaceCount(cad: OcctKernel, solid: ShapeHandle, handle: ShapeHandle) {
  try {
    return cad.adjacentFaces(solid, handle).length;
  } catch {
    return 0;
  }
}

function edgeSummary(cad: OcctKernel, solid: ShapeHandle, handle: ShapeHandle, index: number): ServerCadEdge {
  const bounds = cad.getBoundingBox(handle, false);
  let curveType = "unknown";
  try {
    curveType = cad.curveType(handle);
  } catch {
    // Not every edge reports a curve type; the length and position still do.
  }
  return {
    index,
    length: cad.getLength(handle),
    curveType,
    midpoint: {
      x: (bounds.xmin + bounds.xmax) / 2,
      y: (bounds.ymin + bounds.ymax) / 2,
      z: (bounds.zmin + bounds.zmax) / 2,
    },
    filletable: adjacentFaceCount(cad, solid, handle) >= 2,
  };
}

/** The edges of a shape, in the order a treatment request refers to them by index. */
export function shapeEdges(shape: WorkplaneShape): Promise<ServerCadEdge[]> {
  return withCadKernel((cad) => {
    // Oriented, not local: the edge a caller names by index has to be the edge
    // the treatment then rounds, and a turned shape's edge midpoints are only
    // where the caller sees them once the rotation is applied.
    const solid = orientedSolidForShape(cad, shape);
    return cad.getSubShapes(solid, "edge").map((handle, index) => edgeSummary(cad, solid, handle, index));
  });
}

export type ServerCadResult = {
  brep: string;
  positions: number[];
  normals: number[] | null;
  triangleCount: number;
};

/**
 * Reflect a parameter-built solid across a world-space axis plane and store the
 * reflected result as exact BREP with a matching display mesh. Existing
 * `mirrorX/Y/Z` flags are applied to the source first, so the operation removes
 * those flags while preserving the rendered result. The mirror plane passes
 * through `pivot` on the chosen world axis; callers use the selected bounds
 * midpoint, matching the editor's object-mirror convention.
 *
 * Exact source contract: parameter-built solids only. Imported meshes, groups,
 * and already baked BREP are refused rather than silently round-tripped through
 * triangles. The output has its world position baked into its normalized local
 * BREP and resets rotation and mirror flags.
 */
export function applyBakedMirror(shape: WorkplaneShape, axis: "x" | "y" | "z", pivot: number): Promise<WorkplaneShape> {
  if (!EXACT_SOLID_KINDS.includes(shape.kind as typeof EXACT_SOLID_KINDS[number])
    || shape.importedMesh || shape.cadBrep || shape.groupedShapes?.length) {
    return Promise.reject(new ServerCadError("Baked mirror requires exact parameter geometry; imported meshes, groups, and previously treated shapes are not supported yet."));
  }
  if (!Number.isFinite(pivot)) {
    return Promise.reject(new ServerCadError("The mirror plane must have a finite coordinate.", 400));
  }

  return withCadKernel((cad) => {
    let solid: ShapeHandle;
    try {
      solid = unrotatedSolidForShape(cad, shape);
    } catch (error) {
      if (error instanceof UnbuildableShapeError) throw new ServerCadError(error.message);
      throw error;
    }

    const centerY = shape.height / 2;
    if (shape.mirrorX) solid = cad.mirror(solid, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    if (shape.mirrorY) solid = cad.mirror(solid, { x: 0, y: centerY, z: 0 }, { x: 0, y: 1, z: 0 });
    if (shape.mirrorZ) solid = cad.mirror(solid, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

    const center = { x: 0, y: centerY, z: 0 };
    const angle = (degrees: number) => degrees * Math.PI / 180;
    if (shape.rotationZ) solid = cad.rotate(solid, { point: center, direction: { x: 0, y: 0, z: 1 } }, angle(shape.rotationZ));
    if (shape.rotation) solid = cad.rotate(solid, { point: center, direction: { x: 0, y: 1, z: 0 } }, angle(shape.rotation));
    if (shape.rotationX) solid = cad.rotate(solid, { point: center, direction: { x: 1, y: 0, z: 0 } }, angle(shape.rotationX));
    solid = cad.translate(solid, shape.x, shape.elevation ?? 0, shape.z);

    const point = { x: axis === "x" ? pivot : 0, y: axis === "y" ? pivot : 0, z: axis === "z" ? pivot : 0 };
    const normal = { x: axis === "x" ? 1 : 0, y: axis === "y" ? 1 : 0, z: axis === "z" ? 1 : 0 };
    const reflected = cad.mirror(solid, point, normal);
    if (!cadResultIsValid(cad, reflected)) throw new ServerCadError("The reflected exact solid is not valid.");

    const worldMesh = cad.meshShape(reflected, { linearDeflection: MESH_DEFLECTION });
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < worldMesh.positions.length; index += 3) {
      minX = Math.min(minX, worldMesh.positions[index]);
      maxX = Math.max(maxX, worldMesh.positions[index]);
      minY = Math.min(minY, worldMesh.positions[index + 1]);
      maxY = Math.max(maxY, worldMesh.positions[index + 1]);
      minZ = Math.min(minZ, worldMesh.positions[index + 2]);
      maxZ = Math.max(maxZ, worldMesh.positions[index + 2]);
    }
    if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)) {
      throw new ServerCadError("The reflected solid produced no usable geometry.");
    }

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const localSolid = cad.translate(reflected, -centerX, -minY, -centerZ);
    const result = meshedCadResult(cad, localSolid);
    const normalized = shapeWithCadResult(shape, result);
    return canonicalizeShape({
        ...normalized,
        x: centerX,
        z: centerZ,
        elevation: minY,
        rotation: 0,
        rotationX: 0,
        rotationZ: 0,
        mirrorX: undefined,
        mirrorY: undefined,
        mirrorZ: undefined,
      });
  });
}

/**
 * Apply a fillet or chamfer and return the exact result with a mesh of it.
 *
 * Both are kept: the BREP is what STEP export and any later treatment work
 * from, and the mesh is what the viewport draws.
 */
export function applyEdgeTreatment(shape: WorkplaneShape, treatment: ServerCadTreatment): Promise<ServerCadResult> {
  if (!Number.isFinite(treatment.amount) || treatment.amount <= 0) {
    return Promise.reject(new ServerCadError("The fillet radius or chamfer distance must be greater than zero.", 400));
  }

  return withCadKernel((cad) => {
    const solid = orientedSolidForShape(cad, shape);
    const allEdges = cad.getSubShapes(solid, "edge");
    const requested = treatment.edges;
    if (requested?.some((index) => !Number.isInteger(index) || index < 0 || index >= allEdges.length)) {
      throw new ServerCadError(`Edge indexes must be between 0 and ${allEdges.length - 1}.`, 400);
    }
    // Seams cannot be rounded, and asking OCCT to try fails the whole
    // operation -- so a request for every edge means every edge that can be.
    const filletable = allEdges.filter((handle) => adjacentFaceCount(cad, solid, handle) >= 2);
    if (filletable.length === 0) {
      throw new ServerCadError(
        "That shape has no edges to round: its surface closes on itself, so there is no corner to blend.",
      );
    }
    const chosen = requested && requested.length > 0 ? requested.map((index) => allEdges[index]) : filletable;
    const edges = chosen.filter((handle) => adjacentFaceCount(cad, solid, handle) >= 2);
    if (edges.length === 0) {
      throw new ServerCadError(
        "None of those edges can be rounded: they are seams in a curved surface rather than corners. Check `filletable` in the edge listing.",
        400,
      );
    }

    let treated: ShapeHandle;
    try {
      if (treatment.kind === "fillet") {
        treated = cad.fillet(solid, edges, treatment.amount);
      } else if (treatment.angle === undefined || Math.abs(treatment.angle - 45) < 0.001) {
        treated = cad.chamfer(solid, edges, treatment.amount);
      } else {
        treated = cad.chamferDistAngle(solid, edges, treatment.amount, treatment.angle);
      }
    } catch (error) {
      // OCCT fails when the radius does not fit the geometry, which is the
      // common mistake: too large a radius for a thin wall or a short edge.
      throw new ServerCadError(
        treatment.kind === "fillet"
          ? "That radius is too large for this shape's edges. Try a smaller one."
          : "That chamfer is too large for this shape's edges. Try a smaller one.",
      );
    }
    // Both fillet and chamfer hand back a compound wrapping the result, and
    // OCCT refuses a compound as the input to another treatment -- so storing
    // that as the shape's exact geometry would make the next fillet fail for
    // no visible reason. Unwrap the single solid inside it.
    const treatedSolids = cad.getSubShapes(treated, "solid");
    const result = treatedSolids.length === 1 ? treatedSolids[0] : treated;

    return meshedCadResult(cad, result);
  });
}

/** The exact geometry and a mesh of it, which is what a shape stores after any CAD operation. */
export function meshedCadResult(cad: OcctKernel, result: ShapeHandle): ServerCadResult {
  const mesh = cad.meshShape(result, { linearDeflection: MESH_DEFLECTION });
  // The editor stores a flat triangle list, not an indexed mesh, so the
  // indices are expanded here rather than carried.
  const positions: number[] = [];
  const normals: number[] = [];
  for (const vertex of mesh.indices) {
    const offset = vertex * 3;
    positions.push(mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]);
    normals.push(mesh.normals[offset], mesh.normals[offset + 1], mesh.normals[offset + 2]);
  }
  return {
    brep: cad.toBREP(result),
    positions,
    normals: normals.length === positions.length ? normals : null,
    triangleCount: mesh.triangleCount,
  };
}


/**
 * The shape as it stands after a treatment.
 *
 * Mirrors what the editor stores for a CAD result: the shape becomes a mesh
 * carrying the triangles to draw, with the exact geometry alongside it in
 * `cadBrep` for STEP export and for the next treatment to build on. Positions
 * are centred in X and Z and measured from the bottom in Y, which is the frame
 * the viewport expects -- so the shape keeps its place on the workplane.
 */
export function shapeWithCadResult(shape: WorkplaneShape, result: ServerCadResult): WorkplaneShape {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < result.positions.length; index += 3) {
    minX = Math.min(minX, result.positions[index]);
    minY = Math.min(minY, result.positions[index + 1]);
    minZ = Math.min(minZ, result.positions[index + 2]);
    maxX = Math.max(maxX, result.positions[index]);
    maxY = Math.max(maxY, result.positions[index + 1]);
    maxZ = Math.max(maxZ, result.positions[index + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) {
    throw new ServerCadError("The treated shape produced no usable geometry.");
  }

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const width = Math.max(MIN_CAD_DIMENSION, maxX - minX);
  const height = Math.max(MIN_CAD_DIMENSION, maxY - minY);
  const depth = Math.max(MIN_CAD_DIMENSION, maxZ - minZ);
  const positions: number[] = [];
  for (let index = 0; index < result.positions.length; index += 3) {
    positions.push(
      result.positions[index] - centerX,
      result.positions[index + 1] - minY,
      result.positions[index + 2] - centerZ,
    );
  }

  // A result built from exact geometry already carries the shape's rotation, so
  // keeping it would turn the solid twice. One rebuilt from a stored mesh does
  // not, so its rotation has to stay.
  const bakedRotation = treatmentBakesRotation(shape);
  return canonicalizeShape({
    ...shape,
    faceColors: undefined,
    kind: "mesh",
    width,
    depth,
    height,
    size: Math.max(width, depth),
    // The treated geometry is already in its final form; carrying a taper
    // forward would apply it to the result a second time.
    rotation: bakedRotation ? 0 : shape.rotation,
    rotationX: bakedRotation ? 0 : shape.rotationX,
    rotationZ: bakedRotation ? 0 : shape.rotationZ,
    mirrorX: undefined,
    mirrorY: undefined,
    mirrorZ: undefined,
    radius: undefined,
    taperTopWidth: undefined,
    taperTopDepth: undefined,
    taperBottomWidth: undefined,
    taperBottomDepth: undefined,
    taperTopScale: undefined,
    taperBottomScale: undefined,
    sides: undefined,
    importedMesh: {
      positions,
      normals: result.normals?.length === positions.length ? result.normals : undefined,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: result.triangleCount,
      sourceFormat: "json",
    },
    cadBrep: result.brep,
    // The frame says where the stored B-Rep *is*, not where the shape is.
    //
    // Both readers -- STEP export and the editor's own CAD worker, through
    // `cadBrepTransformForShape` -- place the geometry by subtracting this
    // frame's centre and adding the shape's current one. So a frame carrying
    // the shape's placement, for geometry that is actually in the local frame
    // every builder here produces, cancels the placement out: a filleted,
    // chamfered or hollowed shape at x=25, z=-15, elevation=7 exported to STEP
    // at the origin instead. Nothing caught it because a shape left where it
    // was created -- which is where a test shape sits -- subtracts zero.
    //
    // These are the result's own bounds, which is what the editor's worker
    // records for exactly the same reason.
    cadBrepFrame: { x: centerX, z: centerZ, elevation: minY, width, depth, height },
    cadPrimitiveFrame: undefined,
    cadDisplayEdges: undefined,
    cadDisplayEdgesVersion: undefined,
  });
}
