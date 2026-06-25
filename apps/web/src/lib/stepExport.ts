import type { WorkplaneShape } from "@/types/sketchforge";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";

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
// Cone construction is correct in the kernel (verified volume/bbox), but the
// occt-wasm multi-solid STEP writer drops a cone's lateral CONICAL_SURFACE when
// more than one solid is written to a file (both exportAssemblySTEP and a plain
// compound). A lone cone via exportSTEP is fine. Until that upstream writer bug
// is fixed, cones are reported as skipped rather than exported as a corrupt disk.
const EXACT_KINDS: ReadonlySet<WorkplaneShape["kind"]> = new Set(["box", "cylinder", "sphere"]);
const SIZE_EPS = 0.0005;

function unsupportedReason(kind: WorkplaneShape["kind"]): string {
  if (kind === "cone") {
    return "cone STEP export blocked by an upstream occt-wasm multi-solid writer bug (drops CONICAL_SURFACE)";
  }
  return "no exact B-Rep mapping";
}

// occt-wasm is staged into public/occt by scripts/copy-occt-wasm.mjs and loaded
// at runtime, deliberately outside the Next bundler — the Emscripten glue self
// loads ./occt-wasm.js relative to its own URL and does not survive bundling.
// Typed as string (not a string literal) so TypeScript treats the dynamic import
// as runtime-resolved and does not try to resolve the public/ URL as a module.
const OCCT_INDEX_URL: string = "/occt/index.js";
const OCCT_WASM_URL = "/occt/occt-wasm.wasm";

type Brep = typeof import("brepjs");
type BrepSolid = ReturnType<Brep["box"]>;
type OcctWasmModule = typeof import("occt-wasm");

let brepReady: Promise<Brep> | null = null;

async function loadBrepWithOcct(): Promise<Brep> {
  brepReady ??= (async () => {
    const brep = await import("brepjs");
    const occt = (await import(/* webpackIgnore: true */ OCCT_INDEX_URL)) as unknown as OcctWasmModule;
    const kernel = await occt.OcctKernel.init({ wasm: OCCT_WASM_URL });
    brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
    return brep;
  })();
  return brepReady;
}

// SketchForge composes rotation as a THREE Euler in "XYZ" order, so the world
// matrix is Rx·Ry·Rz. Re-applying the same rotations about world axes through
// the origin (Z, then Y, then X) reproduces that product before the shape is
// translated off-origin. Circular cylinders/cones ignore yaw, matching the
// editor's meshYawDegrees so the exported diameter is invariant.
function shapeYawDegrees(shape: WorkplaneShape): number {
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

function describe(shape: WorkplaneShape, reason: string): SkippedShape {
  return { name: shape.name, kind: shape.kind, reason };
}

type Aabb = { min: [number, number, number]; max: [number, number, number] };

// World-space AABB used to decide whether a hole actually reaches a body. A hole
// is only cut from a body when their boxes overlap, so a body far from every hole
// skips the boolean entirely — which both avoids the per-cut color loss in the
// STEP writer and keeps the export O(bodies + intersections), not O(bodies×holes).
//
// Axis-aligned shapes get a tight box. Rotated shapes fall back to the box that
// encloses the bounding sphere (rotation-invariant, never under-reports), trading
// tightness for the guarantee that a real intersection is never missed.
function worldAabb(shape: WorkplaneShape): Aabb {
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

function aabbsOverlap(a: Aabb, b: Aabb): boolean {
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
      skipped.push(describe(shape, `hole ${unsupportedReason(shape.kind)}; cut omitted`));
      continue;
    }
    const built = buildExactSolid(brep, shape);
    if ("skip" in built) {
      skipped.push(describe(shape, `hole ${built.skip}; cut omitted`));
      continue;
    }
    holes.push({ box: worldAabb(shape), solid: built.solid });
  }

  const parts: { shape: BrepSolid; name: string; color: string }[] = [];
  for (const shape of shapes.filter((s) => !s.hole)) {
    if (!EXACT_KINDS.has(shape.kind)) {
      skipped.push(describe(shape, unsupportedReason(shape.kind)));
      continue;
    }
    const built = buildExactSolid(brep, shape);
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
    throw new Error("No box/cylinder/sphere solids to export as B-Rep STEP");
  }

  const result = brep.exportAssemblySTEP(parts, { unit: "MM" });
  if (!result.ok) {
    throw new Error(`STEP export failed: ${String(result.error.message ?? result.error)}`);
  }

  return { blob: result.value, exportedCount: parts.length, skipped };
}
