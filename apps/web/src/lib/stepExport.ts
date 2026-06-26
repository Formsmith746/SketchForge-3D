import type { WorkplaneShape } from "@/types/sketchforge";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import { loadBrepWithOcct, type Brep, type BrepSolid } from "@/lib/brepKernel";

export type SkippedShape = {
  name: string;
  kind: WorkplaneShape["kind"];
  reason: string;
};

export type StepExportResult = {
  blob: Blob;
  exportedCount: number;
  skipped: SkippedShape[];
};

// Only primitives that OCCT can represent as exact analytic surfaces under a
// rigid placement are mapped to B-Rep. Everything else (swept/tessellated/text
// shapes) is reported as skipped rather than faceted into a low-fidelity STEP.
//
// Cones are exact: the multi-solid STEP writer that used to drop a cone's lateral
// CONICAL_SURFACE was fixed upstream in occt-wasm 3.6.1 (verified end-to-end —
// cone keeps its full surface and volume in a multi-solid assembly).
const EXACT_KINDS: ReadonlySet<WorkplaneShape["kind"]> = new Set(["box", "cylinder", "sphere", "cone"]);
const SIZE_EPS = 0.0005;

function unsupportedReason(): string {
  return "no exact B-Rep mapping";
}

// SketchForge composes rotation as a THREE Euler in "XYZ" order, so the world
// matrix is Rx·Ry·Rz. Re-applying the same rotations about world axes through
// the origin (Z, then Y, then X) reproduces that product before the shape is
// translated off-origin. Circular cylinders/cones ignore yaw, matching the
// editor's meshYawDegrees so the exported diameter is invariant.
export function shapeYawDegrees(shape: WorkplaneShape): number {
  const round = shape.kind === "cylinder" || shape.kind === "cone";
  const circular = Math.abs(shapeWidth(shape) - shapeDepth(shape)) < SIZE_EPS;
  return round && circular ? 0 : shape.rotation;
}

type BuildOutcome = { solid: BrepSolid } | { skip: string };

// Builds the shape in SketchForge's Y-up world frame (Y is the vertical/height
// axis). The caller converts the whole assembly to CAD Z-up afterwards.
function buildExactSolid(brep: Brep, shape: WorkplaneShape): BuildOutcome {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  if (width <= SIZE_EPS || depth <= SIZE_EPS || height <= SIZE_EPS) {
    return { skip: "degenerate dimensions" };
  }

  let solid: BrepSolid;
  switch (shape.kind) {
    case "box": {
      // brep.box maps args to (X, Y, Z); in the Y-up frame that is (width, height, depth).
      solid = brep.box(width, height, depth, { centered: true });
      break;
    }
    case "sphere": {
      const rx = width / 2;
      const ry = height / 2;
      const rz = depth / 2;
      const uniform = Math.abs(rx - ry) < SIZE_EPS && Math.abs(ry - rz) < SIZE_EPS;
      solid = uniform ? brep.sphere(rx) : brep.ellipsoid(rx, ry, rz);
      break;
    }
    case "cylinder": {
      if (Math.abs(width - depth) >= SIZE_EPS) {
        return { skip: "elliptical base is not an exact OCCT primitive" };
      }
      solid = brep.cylinder(width / 2, height, { axis: [0, 1, 0], centered: true });
      break;
    }
    case "cone": {
      if (Math.abs(width - depth) >= SIZE_EPS) {
        return { skip: "elliptical base is not an exact OCCT primitive" };
      }
      // Honor the resized footprint (width) while keeping the shape's own
      // top/base radius ratio, so a truncated cone stays truncated after resize.
      const baseRadius = width / 2;
      const topScale = shape.baseRadius ? (shape.topRadius ?? 0) / shape.baseRadius : 0;
      solid = brep.cone(baseRadius, baseRadius * topScale, height, { axis: [0, 1, 0], centered: true });
      break;
    }
    default:
      return { skip: "no exact B-Rep mapping" };
  }

  const rotZ = shape.rotationZ ?? 0;
  const rotY = shapeYawDegrees(shape);
  const rotX = shape.rotationX ?? 0;
  if (rotZ) solid = brep.rotate(solid, rotZ, { axis: [0, 0, 1] });
  if (rotY) solid = brep.rotate(solid, rotY, { axis: [0, 1, 0] });
  if (rotX) solid = brep.rotate(solid, rotX, { axis: [1, 0, 0] });

  const center: [number, number, number] = [shape.x, (shape.elevation ?? 0) + height / 2, shape.z];
  solid = brep.translate(solid, center);
  return { solid };
}

// +90° about world X maps SketchForge +Y (up) to CAD +Z (up) so the file opens
// upright in FreeCAD/SolidWorks instead of lying on its side.
function toCadZUp(brep: Brep, solid: BrepSolid): BrepSolid {
  return brep.rotate(solid, 90, { axis: [1, 0, 0] });
}

// Place a STEP-imported body (stored in its normalized local frame: x/z-centred,
// y in [0, baseHeight], Y-up) into world space, reproducing the editor's
// transformMesh exactly. Built from rigid kernel ops (rotate/translate/uniform
// scale) which preserve analytic surfaces and the original geometry losslessly;
// only genuinely non-uniform resize falls back to applyMatrix, which validly
// turns the affected primitives into B-splines. The shared toCadZUp applies the
// final Y-up→Z-up flip afterwards, as for primitives.
async function buildImportedBody(brep: Brep, shape: WorkplaneShape): Promise<BuildOutcome> {
  const mesh = shape.importedMesh;
  if (!mesh?.brepStep) {
    return { skip: "imported mesh has no B-Rep source; re-import as STEP to round-trip" };
  }
  const imported = await brep.importSTEP(new Blob([mesh.brepStep]));
  if (!imported.ok) {
    return { skip: "stored B-Rep failed to re-import" };
  }

  const h = shape.height;
  const sx = shapeWidth(shape) / Math.max(0.001, mesh.baseWidth);
  const sy = h / Math.max(0.001, mesh.baseHeight);
  const sz = shapeDepth(shape) / Math.max(0.001, mesh.baseDepth);
  let body = imported.value as unknown as BrepSolid;

  if (Math.abs(sx - sy) < 1e-6 && Math.abs(sy - sz) < 1e-6) {
    if (Math.abs(sx - 1) > 1e-6) body = brep.scale(body, sx);
  } else {
    const scaled = brep.applyMatrix(body, { linear: [sx, 0, 0, 0, sy, 0, 0, 0, sz], translation: [0, 0, 0] });
    if (!scaled.ok) {
      return { skip: `non-uniform scale failed: ${String(scaled.error.message ?? scaled.error)}` };
    }
    body = scaled.value as unknown as BrepSolid;
  }

  body = brep.translate(body, [0, -h / 2, 0]);
  if (shape.mirrorX) body = brep.mirror(body, { normal: [1, 0, 0] });
  if (shape.mirrorY) body = brep.mirror(body, { normal: [0, 1, 0] });
  if (shape.mirrorZ) body = brep.mirror(body, { normal: [0, 0, 1] });
  const rotZ = shape.rotationZ ?? 0;
  const rotY = shapeYawDegrees(shape);
  const rotX = shape.rotationX ?? 0;
  if (rotZ) body = brep.rotate(body, rotZ, { axis: [0, 0, 1] });
  if (rotY) body = brep.rotate(body, rotY, { axis: [0, 1, 0] });
  if (rotX) body = brep.rotate(body, rotX, { axis: [1, 0, 0] });
  body = brep.translate(body, [shape.x, (shape.elevation ?? 0) + h / 2, shape.z]);
  return { solid: body };
}

function describe(shape: WorkplaneShape, reason: string): SkippedShape {
  return { name: shape.name, kind: shape.kind, reason };
}

export type Aabb = { min: [number, number, number]; max: [number, number, number] };

// World-space AABB used to decide whether a hole actually reaches a body. A hole
// is only cut from a body when their boxes overlap, so a body far from every hole
// skips the boolean entirely — which both avoids the per-cut color loss in the
// STEP writer and keeps the export O(bodies + intersections), not O(bodies×holes).
//
// Axis-aligned shapes get a tight box. Rotated shapes fall back to the box that
// encloses the bounding sphere (rotation-invariant, never under-reports), trading
// tightness for the guarantee that a real intersection is never missed.
export function worldAabb(shape: WorkplaneShape): Aabb {
  const w = shapeWidth(shape);
  const d = shapeDepth(shape);
  const h = shape.height;
  const cx = shape.x;
  const cy = (shape.elevation ?? 0) + h / 2;
  const cz = shape.z;
  const rotated = (shape.rotationX ?? 0) !== 0 || (shape.rotationZ ?? 0) !== 0 || shapeYawDegrees(shape) !== 0;
  const [hx, hy, hz] = rotated
    ? (() => {
        const r = 0.5 * Math.sqrt(w * w + h * h + d * d);
        return [r, r, r];
      })()
    : [w / 2, h / 2, d / 2];
  return { min: [cx - hx, cy - hy, cz - hz], max: [cx + hx, cy + hy, cz + hz] };
}

export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

export async function exportShapesToStep(shapes: WorkplaneShape[]): Promise<StepExportResult> {
  const brep = await loadBrepWithOcct();

  const skipped: SkippedShape[] = [];
  const holes: { box: Aabb; solid: BrepSolid }[] = [];
  for (const shape of shapes.filter((s) => s.hole)) {
    if (!EXACT_KINDS.has(shape.kind)) {
      skipped.push(describe(shape, `hole ${unsupportedReason()}; cut omitted`));
      continue;
    }
    const built = buildExactSolid(brep, shape);
    if ("skip" in built) {
      skipped.push(describe(shape, `hole ${built.skip}; cut omitted`));
      continue;
    }
    holes.push({ box: worldAabb(shape), solid: built.solid });
  }

  const isImportedBody = (shape: WorkplaneShape) => shape.kind === "mesh" && Boolean(shape.importedMesh?.brepStep);

  const parts: { shape: BrepSolid; name: string; color: string }[] = [];
  for (const shape of shapes.filter((s) => !s.hole)) {
    let built: BuildOutcome;
    if (isImportedBody(shape)) {
      built = await buildImportedBody(brep, shape);
    } else if (EXACT_KINDS.has(shape.kind)) {
      built = buildExactSolid(brep, shape);
    } else {
      const reason = shape.kind === "mesh" ? "imported mesh has no B-Rep source; re-import as STEP to round-trip" : unsupportedReason();
      skipped.push(describe(shape, reason));
      continue;
    }
    if ("skip" in built) {
      skipped.push(describe(shape, built.skip));
      continue;
    }

    let solid = built.solid;
    const solidBox = worldAabb(shape);
    const overlapping = holes.filter((hole) => aabbsOverlap(solidBox, hole.box));
    if (overlapping.length > 0) {
      const cut = brep.cutAll(solid, overlapping.map((hole) => hole.solid));
      if (cut.ok) {
        solid = cut.value;
      } else {
        skipped.push(describe(shape, "hole subtraction failed; exported solid without holes"));
      }
    }

    parts.push({ shape: toCadZUp(brep, solid), name: shape.name, color: shape.color });
  }

  if (parts.length === 0) {
    throw new Error("No box/cylinder/sphere or imported STEP solids to export as B-Rep STEP");
  }

  const result = brep.exportAssemblySTEP(parts, { unit: "MM" });
  if (!result.ok) {
    throw new Error(`STEP export failed: ${String(result.error.message ?? result.error)}`);
  }

  return { blob: result.value, exportedCount: parts.length, skipped };
}
