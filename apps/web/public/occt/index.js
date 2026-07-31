/**
 * occt-wasm — OCCT compiled to WASM with clean TypeScript bindings.
 *
 * @example
 * ```ts
 * import { OcctKernel } from 'occt-wasm';
 *
 * const kernel = await OcctKernel.init();
 * const box = kernel.makeBox(10, 20, 30);
 * const mesh = kernel.tessellate(box);
 * console.log(`${mesh.triangleCount} triangles`);
 * kernel.release(box);
 * ```
 */
var _a;
export { BooleanOp, JoinType, OcctError, OcctErrorCode, SweepMode, TransitionMode, } from "./types.js";
export { XCAFDocument } from "./xcaf-document.js";
import { XCAFDocument as XCAFDocumentImpl } from "./xcaf-document.js";
export { renderMultiviewSVG, renderShapeSVG, } from "./svg.js";
import { renderMultiviewSVG as renderMultiviewSVGImpl, renderShapeSVG as renderShapeSVGImpl, } from "./svg.js";
import { JoinType, SweepMode, TransitionMode, wrap } from "./types.js";
import { SHAPE_TYPES, SHAPE_ORIENTATIONS, POINT_CLASSIFICATIONS } from "./types.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function handle(id) {
    return id;
}
// Allowed values for the closed string-union enums returned by the kernel,
// derived from the single source of truth in types.ts so they can't drift.
// (SurfaceKind/CurveKind are open unions — `string & {}` — so any string is
// valid by design and needs no check.)
const SHAPE_TYPE_VALUES = new Set(SHAPE_TYPES);
const SHAPE_ORIENTATION_VALUES = new Set(SHAPE_ORIENTATIONS);
const POINT_CLASSIFICATION_VALUES = new Set(POINT_CLASSIFICATIONS);
/**
 * Coerce a raw kernel string into a closed union, throwing if the kernel ever
 * returns an unexpected value instead of silently casting it into a lie. Called
 * inside `wrap(...)`, so the throw surfaces as a classified `OcctError`.
 */
function asEnum(value, allowed, label) {
    if (!allowed.has(value)) {
        throw new Error(`unexpected ${label} from kernel: "${value}"`);
    }
    return value;
}
/**
 * Safety net: releases the raw Embind kernel if an OcctKernel instance is
 * garbage-collected without being disposed. Prefer `using` or explicit
 * `kernel[Symbol.dispose]()` — the FinalizationRegistry is a last resort.
 */
const kernelRegistry = new FinalizationRegistry((raw) => {
    try {
        raw.releaseAll();
        raw.delete();
    }
    catch {
        // Already disposed — ignore.
    }
});
// ---------------------------------------------------------------------------
// OcctKernel
// ---------------------------------------------------------------------------
/**
 * OCCT kernel compiled to WASM. Arena-based shape management
 * with branded handle types for type safety.
 *
 * Create via `OcctKernel.init()`. Dispose via `kernel[Symbol.dispose]()` or
 * the `using` keyword. A FinalizationRegistry safety net catches leaked
 * instances, but deterministic disposal is strongly preferred.
 */
export class OcctKernel {
    #raw;
    #module;
    constructor(module) {
        this.#module = module;
        this.#raw = new module.OcctKernel();
        kernelRegistry.register(this, this.#raw, this);
    }
    /**
     * Initialize the WASM module and create a kernel instance.
     *
     * @example
     * ```ts
     * // Auto-detect (works in browser, Node.js, and Workers):
     * const kernel = await OcctKernel.init();
     *
     * // Explicit WASM location:
     * const kernel = await OcctKernel.init({ wasm: '/path/to/occt-wasm.wasm' });
     *
     * // From pre-fetched binary:
     * const binary = await fetch('/occt-wasm.wasm').then(r => r.arrayBuffer());
     * const kernel = await OcctKernel.init({ wasm: binary });
     * ```
     */
    static async init(options) {
        // @ts-expect-error -- occt-wasm.js is generated at build time, no .d.ts
        const imported = await import(/* webpackIgnore: true */ "./occt-wasm.js");
        const createModule = imported.default;
        const moduleOpts = {};
        // Resolve the WASM source: new `wasm` option > legacy `wasmUrl`/`wasmPath`
        const wasmSource = options?.wasm ?? options?.wasmUrl ?? options?.wasmPath;
        if (wasmSource instanceof ArrayBuffer || wasmSource instanceof Uint8Array) {
            // Pre-loaded binary — pass directly to Emscripten
            // For Uint8Array views with non-zero byteOffset, slice to get the correct region
            const bytes = wasmSource instanceof Uint8Array
                ? wasmSource.buffer.slice(wasmSource.byteOffset, wasmSource.byteOffset + wasmSource.byteLength)
                : wasmSource;
            moduleOpts["wasmBinary"] = bytes;
        }
        else if (wasmSource) {
            // String or URL — use locateFile
            const location = wasmSource instanceof URL ? wasmSource.href : wasmSource;
            moduleOpts["locateFile"] = (path) => {
                if (path.endsWith(".wasm"))
                    return location;
                return path;
            };
        }
        // When no source is given, Emscripten's default locateFile resolves
        // relative to the JS module URL, which works when .wasm is co-located.
        const module = await createModule(moduleOpts);
        return new _a(module);
    }
    // =======================================================================
    // Primitives
    // =======================================================================
    /** Create an axis-aligned box solid with the given dimensions (BRepPrimAPI_MakeBox).
     * @throws OcctError if dimensions are non-positive */
    makeBox(dx, dy, dz) {
        return wrap("makeBox", () => handle(this.#raw.makeBox(dx, dy, dz)));
    }
    /** Create a box solid from two opposite corner points.
     * @throws OcctError if corners are coincident */
    makeBoxFromCorners(corner1, corner2) {
        return wrap("makeBoxFromCorners", () => handle(this.#raw.makeBoxFromCorners(corner1.x, corner1.y, corner1.z, corner2.x, corner2.y, corner2.z)));
    }
    /** Create a cylinder solid centered on the Z axis (BRepPrimAPI_MakeCylinder).
     * @throws OcctError */
    makeCylinder(radius, height) {
        return wrap("makeCylinder", () => handle(this.#raw.makeCylinder(radius, height)));
    }
    /** Create a sphere solid at the origin (BRepPrimAPI_MakeSphere).
     * @throws OcctError */
    makeSphere(radius) {
        return wrap("makeSphere", () => handle(this.#raw.makeSphere(radius)));
    }
    /** Create a cone (or truncated cone) solid along the Z axis (BRepPrimAPI_MakeCone).
     * @param r1 - bottom radius
     * @param r2 - top radius (0 for a full cone)
     * @throws OcctError */
    makeCone(r1, r2, height) {
        return wrap("makeCone", () => handle(this.#raw.makeCone(r1, r2, height)));
    }
    /** Create a torus solid at the origin (BRepPrimAPI_MakeTorus).
     * @throws OcctError */
    makeTorus(majorRadius, minorRadius) {
        return wrap("makeTorus", () => handle(this.#raw.makeTorus(majorRadius, minorRadius)));
    }
    /**
     * Infinite half-space solid bounded by the plane through `origin` with the
     * given `normal`. The solid fills the side the normal points into — useful
     * as an unbounded boolean cutting tool.
     */
    halfSpace(origin, normal) {
        return wrap("halfSpace", () => handle(this.#raw.halfSpace(origin.x, origin.y, origin.z, normal.x, normal.y, normal.z)));
    }
    /** Create an ellipsoid solid at the origin by scaling a sphere.
     * @param rx - radius along X
     * @param ry - radius along Y
     * @param rz - radius along Z
     * @throws OcctError */
    makeEllipsoid(rx, ry, rz) {
        return wrap("makeEllipsoid", () => handle(this.#raw.makeEllipsoid(rx, ry, rz)));
    }
    /** Create a rectangular planar face on the XY plane at the origin.
     * @throws OcctError */
    makeRectangle(width, height) {
        return wrap("makeRectangle", () => handle(this.#raw.makeRectangle(width, height)));
    }
    // =======================================================================
    // Booleans
    // =======================================================================
    /** Boolean union (BRepAlgoAPI_Fuse). Combines two shapes into one.
     * @throws OcctError */
    fuse(a, b) {
        return wrap("fuse", () => handle(this.#raw.fuse(a, b)));
    }
    /** Boolean subtraction (BRepAlgoAPI_Cut). Removes b from a.
     * @throws OcctError */
    cut(a, b) {
        return wrap("cut", () => handle(this.#raw.cut(a, b)));
    }
    /** Boolean intersection (BRepAlgoAPI_Common). Keeps only the overlapping volume.
     * @throws OcctError */
    common(a, b) {
        return wrap("common", () => handle(this.#raw.common(a, b)));
    }
    /** Boolean intersection — alias for common (BRepAlgoAPI_Common).
     * @throws OcctError */
    intersect(a, b) {
        return wrap("intersect", () => handle(this.#raw.intersect(a, b)));
    }
    /** Compute the intersection edges/vertices of two shapes (BRepAlgoAPI_Section).
     * @returns A compound of edges/vertices at the intersection
     * @throws OcctError */
    section(a, b) {
        return wrap("section", () => handle(this.#raw.section(a, b)));
    }
    /** Fuse all shapes in the array into a single shape.
     * @throws OcctError */
    fuseAll(shapes) {
        return wrap("fuseAll", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.fuseAll(vec)));
        });
    }
    /** Subtract all tool shapes from the base shape.
     * @throws OcctError */
    cutAll(shape, tools) {
        return wrap("cutAll", () => {
            return this.#withU32(tools, (vec) => handle(this.#raw.cutAll(shape, vec)));
        });
    }
    /** Split a shape using tool shapes as splitting surfaces (BOPAlgo_Splitter).
     * @returns A compound of the split fragments
     * @throws OcctError */
    split(shape, tools) {
        return wrap("split", () => {
            return this.#withU32(tools, (vec) => handle(this.#raw.split(shape, vec)));
        });
    }
    /**
     * General-fuse cell selection: the union of all regions covered by two or
     * more of the inputs. Unlike {@link fuseAll} (which keeps every cell), this
     * keeps only the overlap regions via BOPAlgo_CellsBuilder.
     */
    intersectionCells(shapes) {
        return wrap("intersectionCells", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.intersectionCells(vec)));
        });
    }
    // =======================================================================
    // Modeling
    // =======================================================================
    /** Extrude a shape along a direction vector (BRepPrimAPI_MakePrism).
     * @param dx - extrusion vector X component
     * @param dy - extrusion vector Y component
     * @param dz - extrusion vector Z component
     * @throws OcctError */
    extrude(shape, dx, dy, dz) {
        return wrap("extrude", () => handle(this.#raw.extrude(shape, dx, dy, dz)));
    }
    /** Revolve a shape around an axis (BRepPrimAPI_MakeRevol).
     * @param axis - rotation axis defined by a point and direction
     * @param angleRad - sweep angle in radians (2*PI for full revolution)
     * @throws OcctError */
    revolve(shape, axis, angleRad) {
        return wrap("revolve", () => handle(this.#raw.revolve(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad)));
    }
    /** Apply a constant-radius fillet to edges of a solid (BRepFilletAPI_MakeFillet).
     * @throws OcctError */
    fillet(solid, edges, radius) {
        return wrap("fillet", () => {
            return this.#withU32(edges, (vec) => handle(this.#raw.fillet(solid, vec, radius)));
        });
    }
    chamfer(solid, edges, distance) {
        return wrap("chamfer", () => {
            return this.#withU32(edges, (vec) => handle(this.#raw.chamfer(solid, vec, distance)));
        });
    }
    chamferDistAngle(solid, edges, distance, angleDeg) {
        return wrap("chamferDistAngle", () => {
            return this.#withU32(edges, (vec) => handle(this.#raw.chamferDistAngle(solid, vec, distance, angleDeg)));
        });
    }
    /**
     * Hollow a solid by removing the listed faces and offsetting remaining
     * faces inward by `thickness`.
     *
     * @param tolerance - OCCT precision for the thick-solid reconstruction.
     *     Use `1e-6` for precise shells (matches brepjs default); `1e-3` is a
     *     coarser legacy value that survives more inputs but produces
     *     different topology than brepjs.
     */
    shell(solid, facesToRemove, thickness, tolerance) {
        return wrap("shell", () => {
            return this.#withU32(facesToRemove, (vec) => handle(this.#raw.shell(solid, vec, thickness, tolerance)));
        });
    }
    /**
     * Offset all faces of a solid by `distance`.
     *
     * @param tolerance - OCCT precision for the offset reconstruction. Use
     *     `1e-6` for precise offsets (matches brepjs default); `1e-3` is a
     *     coarser legacy value.
     */
    offset(solid, distance, tolerance) {
        return wrap("offset", () => handle(this.#raw.offset(solid, distance, tolerance)));
    }
    draft(shape, face, angleRad, direction) {
        return wrap("draft", () => handle(this.#raw.draft(shape, face, angleRad, direction.x, direction.y, direction.z)));
    }
    // =======================================================================
    // Sweeps
    // =======================================================================
    pipe(profile, spine) {
        return wrap("pipe", () => handle(this.#raw.pipe(profile, spine)));
    }
    simplePipe(profile, spine) {
        return wrap("simplePipe", () => handle(this.#raw.simplePipe(profile, spine)));
    }
    /**
     * Loft a solid (or shell) through a sequence of wire profiles.
     *
     * @param ruled - When `true`, sections are joined by ruled (linear)
     *     surfaces; when `false`, by smooth B-spline surfaces. The two modes
     *     produce dramatically different topology for the same input.
     */
    loft(wires, isSolid, ruled) {
        return wrap("loft", () => {
            return this.#withU32(wires, (vec) => handle(this.#raw.loft(vec, isSolid, ruled)));
        });
    }
    loftWithVertices(wires, isSolid, ruled, startVertex, endVertex) {
        return wrap("loftWithVertices", () => {
            return this.#withU32(wires, (vec) => handle(this.#raw.loftWithVertices(vec, isSolid, ruled, startVertex, endVertex)));
        });
    }
    sweep(wire, spine, transitionMode = TransitionMode.Transformed) {
        return wrap("sweep", () => handle(this.#raw.sweep(wire, spine, transitionMode)));
    }
    sweepPipeShell(profile, spine, freenet = false, smooth = true) {
        return wrap("sweepPipeShell", () => handle(this.#raw.sweepPipeShell(profile, spine, freenet, smooth)));
    }
    /**
     * Sweep a profile wire along a spine wire with explicit profile-orientation
     * control. `up` is required for {@link SweepMode.FixedUp} (the constant
     * binormal direction); `auxSpine` is required for {@link SweepMode.Auxiliary}
     * (the guide wire). Both are ignored for the other modes.
     */
    sweepOriented(profile, spine, mode = SweepMode.Fixed, up = { x: 0, y: 0, z: 1 }, auxSpine) {
        return wrap("sweepOriented", () => handle(this.#raw.sweepOriented(profile, spine, mode, up.x, up.y, up.z, auxSpine ?? 0)));
    }
    draftPrism(shape, dx, dy, dz, angleDeg) {
        return wrap("draftPrism", () => handle(this.#raw.draftPrism(shape, dx, dy, dz, angleDeg)));
    }
    // =======================================================================
    // Construction
    // =======================================================================
    makeVertex(x, y, z) {
        return wrap("makeVertex", () => handle(this.#raw.makeVertex(x, y, z)));
    }
    makeEdge(v1, v2) {
        return wrap("makeEdge", () => handle(this.#raw.makeEdge(v1, v2)));
    }
    makeLineEdge(start, end) {
        return wrap("makeLineEdge", () => handle(this.#raw.makeLineEdge(start.x, start.y, start.z, end.x, end.y, end.z)));
    }
    makeCircleEdge(center, normal, radius) {
        return wrap("makeCircleEdge", () => handle(this.#raw.makeCircleEdge(center.x, center.y, center.z, normal.x, normal.y, normal.z, radius)));
    }
    makeCircleArc(center, normal, radius, startAngle, endAngle) {
        return wrap("makeCircleArc", () => handle(this.#raw.makeCircleArc(center.x, center.y, center.z, normal.x, normal.y, normal.z, radius, startAngle, endAngle)));
    }
    makeArcEdge(start, mid, end) {
        return wrap("makeArcEdge", () => handle(this.#raw.makeArcEdge(start.x, start.y, start.z, mid.x, mid.y, mid.z, end.x, end.y, end.z)));
    }
    makeEllipseEdge(center, normal, majorRadius, minorRadius) {
        return wrap("makeEllipseEdge", () => handle(this.#raw.makeEllipseEdge(center.x, center.y, center.z, normal.x, normal.y, normal.z, majorRadius, minorRadius)));
    }
    makeEllipseArc(center, normal, majorRadius, minorRadius, startAngle, endAngle) {
        return wrap("makeEllipseArc", () => handle(this.#raw.makeEllipseArc(center.x, center.y, center.z, normal.x, normal.y, normal.z, majorRadius, minorRadius, startAngle, endAngle)));
    }
    makeBezierEdge(controlPoints) {
        return wrap("makeBezierEdge", () => {
            const flat = this.#flattenPoints(controlPoints);
            try {
                return handle(this.#raw.makeBezierEdge(flat));
            }
            finally {
                flat.delete();
            }
        });
    }
    makeBSplineEdge(poles, weights, knots, multiplicities, degree, periodic = false) {
        return wrap("makeBSplineEdge", () => this.#withF64(poles, (polesVec) => this.#withF64(weights, (weightsVec) => this.#withF64(knots, (knotsVec) => this.#withI32(multiplicities, (multsVec) => handle(this.#raw.makeBSplineEdge(polesVec, weightsVec, knotsVec, multsVec, degree, periodic)))))));
    }
    makeTangentArc(start, tangent, end) {
        return wrap("makeTangentArc", () => handle(this.#raw.makeTangentArc(start.x, start.y, start.z, tangent.x, tangent.y, tangent.z, end.x, end.y, end.z)));
    }
    makeHelixWire(origin, axis, pitch, height, radius) {
        return wrap("makeHelixWire", () => handle(this.#raw.makeHelixWire(origin.x, origin.y, origin.z, axis.x, axis.y, axis.z, pitch, height, radius)));
    }
    makeWire(edges) {
        return wrap("makeWire", () => {
            return this.#withU32(edges, (vec) => handle(this.#raw.makeWire(vec)));
        });
    }
    makeFace(wire) {
        return wrap("makeFace", () => handle(this.#raw.makeFace(wire)));
    }
    makeNonPlanarFace(wire) {
        return wrap("makeNonPlanarFace", () => handle(this.#raw.makeNonPlanarFace(wire)));
    }
    addHolesInFace(face, holeWires) {
        return wrap("addHolesInFace", () => {
            return this.#withU32(holeWires, (vec) => handle(this.#raw.addHolesInFace(face, vec)));
        });
    }
    removeHolesFromFace(face, holeIndices) {
        return wrap("removeHolesFromFace", () => {
            return this.#withI32(holeIndices, (vec) => handle(this.#raw.removeHolesFromFace(face, vec)));
        });
    }
    makeSolid(shell) {
        return wrap("makeSolid", () => handle(this.#raw.makeSolid(shell)));
    }
    sew(shapes, tolerance = 1e-6) {
        return wrap("sew", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.sew(vec, tolerance)));
        });
    }
    sewAndSolidify(faces, tolerance = 1e-6) {
        return wrap("sewAndSolidify", () => {
            return this.#withU32(faces, (vec) => handle(this.#raw.sewAndSolidify(vec, tolerance)));
        });
    }
    buildSolidFromFaces(faces, tolerance = 1e-6) {
        return wrap("buildSolidFromFaces", () => {
            return this.#withU32(faces, (vec) => handle(this.#raw.buildSolidFromFaces(vec, tolerance)));
        });
    }
    makeCompound(shapes) {
        return wrap("makeCompound", () => {
            return this.#withU32(shapes, (vec) => handle(this.#raw.makeCompound(vec)));
        });
    }
    buildTriFace(a, b, c) {
        return wrap("buildTriFace", () => handle(this.#raw.buildTriFace(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)));
    }
    makeFaceOnSurface(face, wire) {
        return wrap("makeFaceOnSurface", () => handle(this.#raw.makeFaceOnSurface(face, wire)));
    }
    makeNullShape() {
        return wrap("makeNullShape", () => handle(this.#raw.makeNullShape()));
    }
    // =======================================================================
    // Transforms
    // =======================================================================
    translate(shape, dx, dy, dz) {
        return wrap("translate", () => handle(this.#raw.translate(shape, dx, dy, dz)));
    }
    /**
     * Translate along X so the chosen bounding-box anchor lands at `target`.
     * Returns a new shape; the input is left untouched.
     */
    alignX(shape, target = 0, anchor = "center") {
        return wrap("alignX", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.xmin : anchor === "max" ? bb.xmax : (bb.xmin + bb.xmax) / 2;
            return handle(this.#raw.translate(shape, target - cur, 0, 0));
        });
    }
    /** Translate along Y so the chosen bounding-box anchor lands at `target`. */
    alignY(shape, target = 0, anchor = "center") {
        return wrap("alignY", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.ymin : anchor === "max" ? bb.ymax : (bb.ymin + bb.ymax) / 2;
            return handle(this.#raw.translate(shape, 0, target - cur, 0));
        });
    }
    /** Translate along Z so the chosen bounding-box anchor lands at `target`. */
    alignZ(shape, target = 0, anchor = "center") {
        return wrap("alignZ", () => {
            const bb = this.getBoundingBox(shape, false);
            const cur = anchor === "min" ? bb.zmin : anchor === "max" ? bb.zmax : (bb.zmin + bb.zmax) / 2;
            return handle(this.#raw.translate(shape, 0, 0, target - cur));
        });
    }
    rotate(shape, axis, angleRad) {
        return wrap("rotate", () => handle(this.#raw.rotate(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad)));
    }
    scale(shape, center, factor) {
        return wrap("scale", () => handle(this.#raw.scale(shape, center.x, center.y, center.z, factor)));
    }
    mirror(shape, point, normal) {
        return wrap("mirror", () => handle(this.#raw.mirror(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z)));
    }
    copy(shape) {
        return wrap("copy", () => handle(this.#raw.copy(shape)));
    }
    /** Apply a 3x4 row-major affine transformation matrix (12 doubles: [r00,r01,r02,tx, r10,r11,r12,ty, r20,r21,r22,tz]). */
    transform(shape, matrix) {
        return wrap("transform", () => {
            return this.#withF64(matrix, (vec) => handle(this.#raw.transform(shape, vec)));
        });
    }
    /**
     * Re-tag a shape with a `TopLoc_Location` from a 3x4 row-major affine matrix
     * (same 12-double layout as {@link transform}). Shares the underlying topology
     * instead of deep-copying it, so a pure move is O(1).
     */
    located(shape, matrix) {
        return wrap("located", () => {
            return this.#withF64(matrix, (vec) => handle(this.#raw.located(shape, vec)));
        });
    }
    /** Apply a general (possibly non-affine) 3x4 row-major transformation matrix (12 doubles). */
    generalTransform(shape, matrix) {
        return wrap("generalTransform", () => {
            return this.#withF64(matrix, (vec) => handle(this.#raw.generalTransform(shape, vec)));
        });
    }
    linearPattern(shape, direction, spacing, count) {
        return wrap("linearPattern", () => handle(this.#raw.linearPattern(shape, direction.x, direction.y, direction.z, spacing, count)));
    }
    circularPattern(shape, center, axis, angle, count) {
        return wrap("circularPattern", () => handle(this.#raw.circularPattern(shape, center.x, center.y, center.z, axis.x, axis.y, axis.z, angle, count)));
    }
    /** Compose two 3x4 row-major transformation matrices. Returns a 12-element array. */
    composeTransform(m1, m2) {
        return wrap("composeTransform", () => this.#withF64(m1, (v1) => this.#withF64(m2, (v2) => this.#drainVector(this.#raw.composeTransform(v1, v2), Float64Array))));
    }
    // =======================================================================
    // Batch Operations
    // =======================================================================
    /** Translate multiple shapes by their respective offsets in a single WASM call. */
    translateBatch(shapes, offsets) {
        return wrap("translateBatch", () => this.#withU32(shapes, (ids) => this.#withF64(offsets, (off) => this.#vecToHandles(this.#raw.translateBatch(ids, off)))));
    }
    /** Chain boolean operations in a single WASM call. */
    booleanPipeline(base, opCodes, tools) {
        return wrap("booleanPipeline", () => this.#withI32(opCodes, (ops) => this.#withU32(tools, (ids) => handle(this.#raw.booleanPipeline(base, ops, ids)))));
    }
    /** Query multiple shapes in a single WASM call: bbox, volume, area, center of mass, type, validity. */
    queryBatch(shapes) {
        return wrap("queryBatch", () => this.#withU32(shapes, (ids) => {
            const arr = this.#drainVector(this.#raw.queryBatch(ids), Float64Array);
            const STRIDE = 14;
            const results = [];
            for (let i = 0; i < shapes.length; i++) {
                const o = i * STRIDE;
                results.push({
                    volume: arr[o],
                    area: arr[o + 1],
                    bbox: { xmin: arr[o + 2], ymin: arr[o + 3], zmin: arr[o + 4], xmax: arr[o + 5], ymax: arr[o + 6], zmax: arr[o + 7] },
                    centerOfMass: { x: arr[o + 8], y: arr[o + 9], z: arr[o + 10] },
                    shapeType: SHAPE_TYPES[arr[o + 11]] ?? "shape",
                    isValid: arr[o + 12] === 1.0,
                });
            }
            return results;
        }));
    }
    /** Fillet multiple solids in a single WASM call. */
    filletBatch(ops) {
        return wrap("filletBatch", () => this.#withU32(ops.map((op) => op.solid), (solids) => this.#withI32(ops.map((op) => op.edges.length), (edgeCounts) => this.#withU32(ops.flatMap((op) => op.edges), (flatEdges) => this.#withF64(ops.map((op) => op.radius), (radii) => this.#vecToHandles(this.#raw.filletBatch(solids, edgeCounts, flatEdges, radii)))))));
    }
    /** Apply 3x4 affine transforms to multiple shapes in a single WASM call. */
    transformBatch(shapes, matrices) {
        return wrap("transformBatch", () => this.#withU32(shapes, (ids) => this.#withF64(matrices, (mats) => this.#vecToHandles(this.#raw.transformBatch(ids, mats)))));
    }
    /** Rotate multiple shapes in a single WASM call. */
    rotateBatch(shapes, params) {
        return wrap("rotateBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.rotateBatch(ids, p)))));
    }
    /** Scale multiple shapes in a single WASM call. */
    scaleBatch(shapes, params) {
        return wrap("scaleBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.scaleBatch(ids, p)))));
    }
    /** Mirror multiple shapes in a single WASM call. */
    mirrorBatch(shapes, params) {
        return wrap("mirrorBatch", () => this.#withU32(shapes, (ids) => this.#withF64(params, (p) => this.#vecToHandles(this.#raw.mirrorBatch(ids, p)))));
    }
    // =======================================================================
    // Topology
    // =======================================================================
    getShapeType(shape) {
        return wrap("getShapeType", () => asEnum(this.#raw.getShapeType(shape), SHAPE_TYPE_VALUES, "shape type"));
    }
    /** True if the shape is a compound. */
    isCompound(shape) { return this.getShapeType(shape) === "compound"; }
    /** True if the shape is a comp-solid. */
    isCompSolid(shape) { return this.getShapeType(shape) === "compsolid"; }
    /** True if the shape is a solid. */
    isSolid(shape) { return this.getShapeType(shape) === "solid"; }
    /** True if the shape is a shell. */
    isShell(shape) { return this.getShapeType(shape) === "shell"; }
    /** True if the shape is a face. */
    isFace(shape) { return this.getShapeType(shape) === "face"; }
    /** True if the shape is a wire. */
    isWire(shape) { return this.getShapeType(shape) === "wire"; }
    /** True if the shape is an edge. */
    isEdge(shape) { return this.getShapeType(shape) === "edge"; }
    /** True if the shape is a vertex. */
    isVertex(shape) { return this.getShapeType(shape) === "vertex"; }
    getSubShapes(shape, type) {
        return wrap("getSubShapes", () => this.#vecToHandles(this.#raw.getSubShapes(shape, type)));
    }
    downcast(shape, targetType) {
        return wrap("downcast", () => handle(this.#raw.downcast(shape, targetType)));
    }
    distanceBetween(a, b) {
        return wrap("distanceBetween", () => this.#raw.distanceBetween(a, b));
    }
    isSame(a, b) {
        return wrap("isSame", () => this.#raw.isSame(a, b));
    }
    isEqual(a, b) {
        return wrap("isEqual", () => this.#raw.isEqual(a, b));
    }
    isNull(shape) {
        return wrap("isNull", () => this.#raw.isNull(shape));
    }
    hashCode(shape, upperBound) {
        return wrap("hashCode", () => this.#raw.hashCode(shape, upperBound));
    }
    shapeOrientation(shape) {
        return wrap("shapeOrientation", () => asEnum(this.#raw.shapeOrientation(shape), SHAPE_ORIENTATION_VALUES, "shape orientation"));
    }
    sharedEdges(faceA, faceB) {
        return wrap("sharedEdges", () => this.#vecToHandles(this.#raw.sharedEdges(faceA, faceB)));
    }
    adjacentFaces(shape, face) {
        return wrap("adjacentFaces", () => this.#vecToHandles(this.#raw.adjacentFaces(shape, face)));
    }
    iterShapes(shape) {
        return wrap("iterShapes", () => this.#vecToHandles(this.#raw.iterShapes(shape)));
    }
    /** Returns a flat array mapping edge hashes to face hashes. */
    edgeToFaceMap(shape, hashUpperBound) {
        return wrap("edgeToFaceMap", () => {
            const vec = this.#raw.edgeToFaceMap(shape, hashUpperBound);
            return this.#drainVector(vec, Int32Array);
        });
    }
    // =======================================================================
    // Tessellation
    // =======================================================================
    /** Tessellate a shape into a triangle mesh. Returns copied data (safe to keep). */
    tessellate(shape, options) {
        return wrap("tessellate", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            const raw = options?.relative
                ? this.#raw.tessellateRelative(shape, linDefl, angDefl)
                : this.#raw.tessellate(shape, linDefl, angDefl);
            return this.#extractMesh(raw);
        });
    }
    /** Sample edges as polylines for wireframe rendering. */
    wireframe(shape, deflection = 0.1) {
        return wrap("wireframe", () => {
            const raw = this.#raw.wireframe(shape, deflection);
            try {
                const points = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPointsPtr(), raw.getPointsPtr() + raw.pointCount * 4));
                const edgeCount = raw.edgeGroupCount / 3;
                const edgeGroups = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getEdgeGroupsPtr(), raw.getEdgeGroupsPtr() + raw.edgeGroupCount * 4));
                return { points, edgeGroups, pointCount: raw.pointCount, edgeCount };
            }
            finally {
                raw.delete();
            }
        });
    }
    hasTriangulation(shape) {
        return wrap("hasTriangulation", () => this.#raw.hasTriangulation(shape));
    }
    /** Tessellate with face group data (per-face triangle ranges + hashes). */
    meshShape(shape, options) {
        return wrap("meshShape", () => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            return this.#extractMeshWithFaceGroups(this.#raw.meshShape(shape, linDefl, angDefl));
        });
    }
    /** Tessellate multiple shapes in a single WASM call. */
    meshBatch(shapes, options) {
        return wrap("meshBatch", () => this.#withU32(shapes, (ids) => {
            const linDefl = options?.linearDeflection ?? 0.1;
            const angDefl = options?.angularDeflection ?? 0.5;
            const raw = this.#raw.meshBatch(ids, linDefl, angDefl);
            try {
                const positions = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPositionsPtr(), raw.getPositionsPtr() + raw.positionCount * 4));
                const normals = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getNormalsPtr(), raw.getNormalsPtr() + raw.normalCount * 4));
                const indices = new Uint32Array(this.#module.HEAPU32.buffer.slice(raw.getIndicesPtr(), raw.getIndicesPtr() + raw.indexCount * 4));
                const shapeOffsets = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getShapeOffsetsPtr(), raw.getShapeOffsetsPtr() + raw.shapeCount * 4 * 4));
                return {
                    positions,
                    normals,
                    indices,
                    shapeOffsets,
                    shapeCount: raw.shapeCount,
                    vertexCount: raw.positionCount / 3,
                    triangleCount: raw.indexCount / 3,
                };
            }
            finally {
                raw.delete();
            }
        }));
    }
    // =======================================================================
    // I/O
    // =======================================================================
    importStep(data) {
        return wrap("importStep", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStep(str));
        });
    }
    exportStep(shape) {
        return wrap("exportStep", () => this.#raw.exportStep(shape));
    }
    importStl(data) {
        return wrap("importStl", () => {
            const str = typeof data === "string" ? data : new TextDecoder().decode(data);
            return handle(this.#raw.importStl(str));
        });
    }
    exportStl(shape, linearDeflection = 0.1, ascii = false) {
        return wrap("exportStl", () => this.#raw.exportStl(shape, linearDeflection, ascii));
    }
    toBREP(shape) {
        return wrap("toBREP", () => this.#raw.toBREP(shape));
    }
    fromBREP(data) {
        return wrap("fromBREP", () => handle(this.#raw.fromBREP(data)));
    }
    /** Serialize a shape to binary BREP (smaller/faster than the text format). */
    toBREPBinary(shape) {
        return wrap("toBREPBinary", () => {
            const path = this.#raw.exportBrepBinary(shape);
            const bytes = this.#module.FS.readFile(path);
            this.#module.FS.unlink(path);
            return bytes;
        });
    }
    /** Load a shape from binary BREP produced by {@link toBREPBinary}. */
    fromBREPBinary(data) {
        return wrap("fromBREPBinary", () => {
            const path = "/tmp/occt-import.brep.bin";
            this.#module.FS.writeFile(path, data);
            try {
                return handle(this.#raw.importBrepBinary(path));
            }
            finally {
                this.#module.FS.unlink(path);
            }
        });
    }
    cacheStep(stepData) {
        return wrap("cacheStep", () => {
            const shape = this.importStep(stepData);
            try {
                return this.toBREP(shape);
            }
            finally {
                this.release(shape);
            }
        });
    }
    loadCached(brep) {
        return wrap("loadCached", () => this.fromBREP(brep));
    }
    // =======================================================================
    // Query / Measure
    // =======================================================================
    /**
     * Compute the axis-aligned bounding box of a shape.
     *
     * Uses `BRepBndLib::AddOptimal` for surface-precise bounds independent of
     * tessellation state. The simpler `BRepBndLib::Add` falls back to BSpline
     * pole hulls when triangulation is absent, which overshoots curved
     * geometry by ~0.27·r for arcs of radius r — that was the source of the
     * uniform 1.2 mm bounds shift versus brepjs in occt-wasm 2.0.
     *
     * @param useTriangulation - If `true`, use existing triangulation as the
     *     starting bound and refine via surface analysis (faster). If `false`,
     *     do the surface analysis from scratch (slower, but doesn't depend on
     *     prior tessellation). Both modes produce tight bounds; brepjs's
     *     `BRepBndLib.Add(shape, box, true)` corresponds to `true` here.
     */
    getBoundingBox(shape, useTriangulation) {
        return wrap("getBoundingBox", () => this.#raw.getBoundingBox(shape, useTriangulation));
    }
    getVolume(shape) {
        return wrap("getVolume", () => this.#raw.getVolume(shape));
    }
    getSurfaceArea(shape) {
        return wrap("getSurfaceArea", () => this.#raw.getSurfaceArea(shape));
    }
    getLength(shape) {
        return wrap("getLength", () => this.#raw.getLength(shape));
    }
    getCenterOfMass(shape) {
        return wrap("getCenterOfMass", () => {
            const v = this.#raw.getCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }
    /**
     * Matrix of inertia about the center of mass, as a row-major 3×3 array
     * (length 9). Symmetric: `[1]==[3]`, `[2]==[6]`, `[5]==[7]`.
     */
    getInertia(shape) {
        return wrap("getInertia", () => Array.from(this.#drainVector(this.#raw.getInertia(shape), Float64Array)));
    }
    /** True if `point` lies inside (or on the boundary of) a solid. */
    containsPoint(shape, point, tolerance = 1e-7) {
        return wrap("containsPoint", () => this.#raw.containsPoint(shape, point.x, point.y, point.z, tolerance));
    }
    /**
     * Surface (area-weighted) center of mass for a face. Equivalent to
     * `BRepGProp::SurfaceProperties(face, props).CentreOfMass()`.
     *
     * Use this for face fingerprinting and finder predicates rather than a
     * tessellation-based centroid — for non-planar faces (cylinders, holed
     * planes) the two diverge.
     */
    getSurfaceCenterOfMass(face) {
        return wrap("getSurfaceCenterOfMass", () => {
            const v = this.#raw.getSurfaceCenterOfMass(face);
            return this.#vec3FromEmbind(v);
        });
    }
    getLinearCenterOfMass(shape) {
        return wrap("getLinearCenterOfMass", () => {
            const v = this.#raw.getLinearCenterOfMass(shape);
            return this.#vec3FromEmbind(v);
        });
    }
    surfaceCurvature(face, u, v) {
        return wrap("surfaceCurvature", () => this.#curvatureDataFromEmbind(this.#raw.surfaceCurvature(face, u, v)));
    }
    // =======================================================================
    // Surfaces
    // =======================================================================
    vertexPosition(vertex) {
        return wrap("vertexPosition", () => {
            const v = this.#raw.vertexPosition(vertex);
            return this.#vec3FromEmbind(v);
        });
    }
    surfaceType(face) {
        return wrap("surfaceType", () => this.#raw.surfaceType(face));
    }
    surfaceNormal(face, u, v) {
        return wrap("surfaceNormal", () => {
            const vec = this.#raw.surfaceNormal(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }
    pointOnSurface(face, u, v) {
        return wrap("pointOnSurface", () => {
            const vec = this.#raw.pointOnSurface(face, u, v);
            return this.#vec3FromEmbind(vec);
        });
    }
    outerWire(face) {
        return wrap("outerWire", () => handle(this.#raw.outerWire(face)));
    }
    uvBounds(face) {
        return wrap("uvBounds", () => this.#uvBoundsFromEmbind(this.#raw.uvBounds(face)));
    }
    /** Project a 3D point onto a face, returning [u, v]. */
    uvFromPoint(face, point) {
        return wrap("uvFromPoint", () => this.#vec2FromEmbind(this.#raw.uvFromPoint(face, point.x, point.y, point.z)));
    }
    /**
     * Extract cylinder data from a cylindrical face.
     *
     * Returns `null` when the face's underlying surface is not a cylinder,
     * otherwise `{ radius, isDirect }` where `isDirect` mirrors
     * `gp_Cylinder::Direct()` (i.e. whether U and V form a right-handed pair).
     */
    getFaceCylinderData(face) {
        return wrap("getFaceCylinderData", () => {
            const vec = this.#raw.getFaceCylinderData(face);
            try {
                if (vec.size() === 0)
                    return null;
                return { radius: vec.get(0), isDirect: vec.get(1) !== 0 };
            }
            finally {
                vec.delete();
            }
        });
    }
    /** Project a 3D point onto a face, returning the closest point as Vec3. */
    projectPointOnFace(face, point) {
        return wrap("projectPointOnFace", () => {
            const vec = this.#raw.projectPointOnFace(face, point.x, point.y, point.z);
            return this.#vec3FromEmbind(vec);
        });
    }
    /** Classify a UV point relative to a face boundary. */
    classifyPointOnFace(face, u, v) {
        return wrap("classifyPointOnFace", () => asEnum(this.#raw.classifyPointOnFace(face, u, v), POINT_CLASSIFICATION_VALUES, "point classification"));
    }
    /** Create a BSpline surface from a grid of control points. */
    bsplineSurface(controlPoints, rows, cols) {
        return wrap("bsplineSurface", () => {
            const flat = this.#flattenPoints(controlPoints);
            try {
                return handle(this.#raw.bsplineSurface(flat, rows, cols));
            }
            finally {
                flat.delete();
            }
        });
    }
    // =======================================================================
    // Curves
    // =======================================================================
    curveType(edge) {
        return wrap("curveType", () => this.#raw.curveType(edge));
    }
    curvePointAtParam(edge, param) {
        return wrap("curvePointAtParam", () => {
            const vec = this.#raw.curvePointAtParam(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }
    curveTangent(edge, param) {
        return wrap("curveTangent", () => {
            const vec = this.#raw.curveTangent(edge, param);
            return this.#vec3FromEmbind(vec);
        });
    }
    /** Returns [firstParam, lastParam]. */
    curveParameters(edge) {
        return wrap("curveParameters", () => {
            const { u: first, v: last } = this.#vec2FromEmbind(this.#raw.curveParameters(edge));
            return { first, last };
        });
    }
    curveIsClosed(edge) {
        return wrap("curveIsClosed", () => this.#raw.curveIsClosed(edge));
    }
    curveIsPeriodic(edge) {
        return wrap("curveIsPeriodic", () => this.#raw.curveIsPeriodic(edge));
    }
    curveLength(edge) {
        return wrap("curveLength", () => this.#raw.curveLength(edge));
    }
    interpolatePoints(points, periodic = false) {
        return wrap("interpolatePoints", () => {
            const flat = this.#flattenPoints(points);
            try {
                return handle(this.#raw.interpolatePoints(flat, periodic));
            }
            finally {
                flat.delete();
            }
        });
    }
    /**
     * Interpolate a cubic B-spline through the points with clamped start/end
     * tangent directions.
     */
    interpolatePointsWithTangents(points, startTangent, endTangent) {
        return wrap("interpolatePointsWithTangents", () => {
            const flat = this.#flattenPoints(points);
            try {
                return handle(this.#raw.interpolatePointsWithTangents(flat, startTangent.x, startTangent.y, startTangent.z, endTangent.x, endTangent.y, endTangent.z));
            }
            finally {
                flat.delete();
            }
        });
    }
    /** Closest point on an edge to `point`, with the curve tangent and parameter there. */
    projectPointOnEdge(edge, point) {
        return wrap("projectPointOnEdge", () => {
            const r = this.#drainVector(this.#raw.projectPointOnEdge(edge, point.x, point.y, point.z), Float64Array);
            return {
                point: { x: r[0], y: r[1], z: r[2] },
                tangent: { x: r[3], y: r[4], z: r[5] },
                parameter: r[6],
            };
        });
    }
    approximatePoints(points, tolerance = 1e-3) {
        return wrap("approximatePoints", () => {
            const flat = this.#flattenPoints(points);
            try {
                return handle(this.#raw.approximatePoints(flat, tolerance));
            }
            finally {
                flat.delete();
            }
        });
    }
    getNurbsCurveData(edge) {
        return wrap("getNurbsCurveData", () => {
            const raw = this.#raw.getNurbsCurveData(edge);
            const result = {
                degree: raw.degree,
                rational: raw.rational,
                periodic: raw.periodic,
                knots: this.#drainVector(raw.knots, Float64Array),
                multiplicities: this.#drainVector(raw.multiplicities, Int32Array),
                poles: this.#drainVector(raw.poles, Float64Array),
                weights: this.#drainVector(raw.weights, Float64Array),
            };
            return result;
        });
    }
    curveDegreeElevate(edge, elevateBy) {
        return wrap("curveDegreeElevate", () => handle(this.#raw.curveDegreeElevate(edge, elevateBy)));
    }
    curveKnotInsert(edge, knot, times) {
        return wrap("curveKnotInsert", () => handle(this.#raw.curveKnotInsert(edge, knot, times)));
    }
    curveKnotRemove(edge, knot, tolerance) {
        return wrap("curveKnotRemove", () => handle(this.#raw.curveKnotRemove(edge, knot, tolerance)));
    }
    curveSplit(edge, param) {
        return wrap("curveSplit", () => {
            const parts = this.#vecToHandles(this.#raw.curveSplit(edge, param));
            if (parts.length !== 2) {
                throw new Error(`curveSplit: expected 2 edges, got ${parts.length}`);
            }
            return [parts[0], parts[1]];
        });
    }
    liftCurve2dToPlane(points2d, planeOrigin, planeZ, planeX) {
        return wrap("liftCurve2dToPlane", () => {
            const flatArr = new Array(points2d.length * 2);
            let j = 0;
            for (const p of points2d) {
                flatArr[j++] = p.x;
                flatArr[j++] = p.y;
            }
            return this.#withF64(flatArr, (flat) => handle(this.#raw.liftCurve2dToPlane(flat, planeOrigin.x, planeOrigin.y, planeOrigin.z, planeZ.x, planeZ.y, planeZ.z, planeX.x, planeX.y, planeX.z)));
        });
    }
    // =======================================================================
    // Projection (HLR)
    // =======================================================================
    projectEdges(shape, viewOrigin, viewDirection, xAxis) {
        return wrap("projectEdges", () => {
            const hasXAxis = xAxis !== undefined;
            const xx = xAxis?.x ?? 0;
            const xy = xAxis?.y ?? 0;
            const xz = xAxis?.z ?? 0;
            const raw = this.#raw.projectEdges(shape, viewOrigin.x, viewOrigin.y, viewOrigin.z, viewDirection.x, viewDirection.y, viewDirection.z, xx, xy, xz, hasXAxis);
            return {
                visibleOutline: handle(raw.visibleOutline),
                visibleSmooth: handle(raw.visibleSmooth),
                visibleSharp: handle(raw.visibleSharp),
                hiddenOutline: handle(raw.hiddenOutline),
                hiddenSmooth: handle(raw.hiddenSmooth),
                hiddenSharp: handle(raw.hiddenSharp),
            };
        });
    }
    /**
     * Render a single named view of a shape to a standalone SVG string via
     * hidden-line removal. Visible edges are solid, hidden edges dashed.
     */
    toSVG(shape, view = "front", options = {}) {
        return wrap("toSVG", () => renderShapeSVGImpl(this, shape, view, options));
    }
    /**
     * Render a multiview grid (default Front / Top / Right / Iso) of a shape to
     * a single SVG string, with per-view gnomons and an overall size annotation.
     * Aimed at giving an automated agent a readable picture of the geometry.
     */
    toMultiviewSVG(shape, options = {}) {
        return wrap("toMultiviewSVG", () => renderMultiviewSVGImpl(this, shape, options));
    }
    // =======================================================================
    // Modifiers
    // =======================================================================
    /**
     * Thicken a face/shell into a solid (or grow a solid uniformly).
     *
     * @param tolerance - OCCT precision for the offset reconstruction. Use
     *     `1e-6` for precise thickening (matches brepjs default); `1e-3` is a
     *     coarser legacy value.
     */
    thicken(shape, thickness, tolerance) {
        return wrap("thicken", () => handle(this.#raw.thicken(shape, thickness, tolerance)));
    }
    /**
     * Remove faces from a solid by closing them off (zero-thickness shell).
     *
     * @param tolerance - OCCT precision for the reconstruction. Use `1e-6`
     *     for precise feature removal (matches brepjs default); `1e-3` is a
     *     coarser legacy value.
     */
    defeature(shape, faces, tolerance) {
        return wrap("defeature", () => {
            return this.#withU32(faces, (vec) => handle(this.#raw.defeature(shape, vec, tolerance)));
        });
    }
    reverseShape(shape) {
        return wrap("reverseShape", () => handle(this.#raw.reverseShape(shape)));
    }
    simplify(shape) {
        return wrap("simplify", () => handle(this.#raw.simplify(shape)));
    }
    filletVariable(solid, edge, startRadius, endRadius) {
        return wrap("filletVariable", () => handle(this.#raw.filletVariable(solid, edge, startRadius, endRadius)));
    }
    /** Offset a 2D wire. */
    offsetWire2D(wire, offset, joinType = JoinType.Arc) {
        return wrap("offsetWire2D", () => handle(this.#raw.offsetWire2D(wire, offset, joinType)));
    }
    // =======================================================================
    // Evolution (operations with shape history)
    // =======================================================================
    translateWithHistory(shape, dx, dy, dz, inputFaceHashes, hashUpperBound) {
        return wrap("translateWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.translateWithHistory(shape, dx, dy, dz, hashes, hashUpperBound)));
        });
    }
    fuseWithHistory(a, b, inputFaceHashes, hashUpperBound) {
        return wrap("fuseWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.fuseWithHistory(a, b, hashes, hashUpperBound)));
        });
    }
    cutWithHistory(a, b, inputFaceHashes, hashUpperBound) {
        return wrap("cutWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.cutWithHistory(a, b, hashes, hashUpperBound)));
        });
    }
    filletWithHistory(solid, edges, radius, inputFaceHashes, hashUpperBound) {
        return wrap("filletWithHistory", () => this.#withU32(edges, (edgeVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.filletWithHistory(solid, edgeVec, radius, hashes, hashUpperBound)))));
    }
    rotateWithHistory(shape, axis, angleRad, inputFaceHashes, hashUpperBound) {
        return wrap("rotateWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.rotateWithHistory(shape, axis.point.x, axis.point.y, axis.point.z, axis.direction.x, axis.direction.y, axis.direction.z, angleRad, hashes, hashUpperBound))));
    }
    mirrorWithHistory(shape, point, normal, inputFaceHashes, hashUpperBound) {
        return wrap("mirrorWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.mirrorWithHistory(shape, point.x, point.y, point.z, normal.x, normal.y, normal.z, hashes, hashUpperBound))));
    }
    scaleWithHistory(shape, center, factor, inputFaceHashes, hashUpperBound) {
        return wrap("scaleWithHistory", () => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.scaleWithHistory(shape, center.x, center.y, center.z, factor, hashes, hashUpperBound))));
    }
    intersectWithHistory(a, b, inputFaceHashes, hashUpperBound) {
        return wrap("intersectWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.intersectWithHistory(a, b, hashes, hashUpperBound)));
        });
    }
    chamferWithHistory(solid, edges, distance, inputFaceHashes, hashUpperBound) {
        return wrap("chamferWithHistory", () => this.#withU32(edges, (edgeVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.chamferWithHistory(solid, edgeVec, distance, hashes, hashUpperBound)))));
    }
    shellWithHistory(solid, faces, thickness, tolerance, inputFaceHashes, hashUpperBound) {
        return wrap("shellWithHistory", () => this.#withU32(faces, (faceVec) => this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.shellWithHistory(solid, faceVec, thickness, tolerance, hashes, hashUpperBound)))));
    }
    offsetWithHistory(solid, distance, tolerance, inputFaceHashes, hashUpperBound) {
        return wrap("offsetWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.offsetWithHistory(solid, distance, tolerance, hashes, hashUpperBound)));
        });
    }
    thickenWithHistory(shape, thickness, tolerance, inputFaceHashes, hashUpperBound) {
        return wrap("thickenWithHistory", () => {
            return this.#withI32(inputFaceHashes, (hashes) => this.#extractEvolution(this.#raw.thickenWithHistory(shape, thickness, tolerance, hashes, hashUpperBound)));
        });
    }
    // =======================================================================
    // Extrusion Law
    // =======================================================================
    buildExtrusionLaw(profile, length, endFactor) {
        return wrap("buildExtrusionLaw", () => handle(this.#raw.buildExtrusionLaw(profile, length, endFactor)));
    }
    trimLaw(law, first, last) {
        return wrap("trimLaw", () => handle(this.#raw.trimLaw(law, first, last)));
    }
    sweepWithLaw(profile, spine, law) {
        return wrap("sweepWithLaw", () => handle(this.#raw.sweepWithLaw(profile, spine, law)));
    }
    // =======================================================================
    // Healing / Repair
    // =======================================================================
    fixShape(shape) {
        return wrap("fixShape", () => handle(this.#raw.fixShape(shape)));
    }
    unifySameDomain(shape) {
        return wrap("unifySameDomain", () => handle(this.#raw.unifySameDomain(shape)));
    }
    isValid(shape) {
        return wrap("isValid", () => this.#raw.isValid(shape));
    }
    healSolid(shape, tolerance = 1e-6) {
        return wrap("healSolid", () => handle(this.#raw.healSolid(shape, tolerance)));
    }
    healFace(shape, tolerance = 1e-6) {
        return wrap("healFace", () => handle(this.#raw.healFace(shape, tolerance)));
    }
    healWire(shape, tolerance = 1e-6) {
        return wrap("healWire", () => handle(this.#raw.healWire(shape, tolerance)));
    }
    fixFaceOrientations(shape) {
        return wrap("fixFaceOrientations", () => handle(this.#raw.fixFaceOrientations(shape)));
    }
    removeDegenerateEdges(shape) {
        return wrap("removeDegenerateEdges", () => handle(this.#raw.removeDegenerateEdges(shape)));
    }
    buildCurves3d(wire) {
        wrap("buildCurves3d", () => this.#raw.buildCurves3d(wire));
    }
    fixWireOnFace(wire, face, tolerance = 1e-6) {
        return wrap("fixWireOnFace", () => handle(this.#raw.fixWireOnFace(wire, face, tolerance)));
    }
    // =======================================================================
    // XCAF Document Factories
    // =======================================================================
    /**
     * Create a new XCAF document with the Emscripten FS pre-injected.
     * This allows `doc.exportGLTF()` to work without passing FS explicitly.
     */
    createXCAFDocument() {
        return XCAFDocumentImpl.create(this.#raw, this.#module.FS);
    }
    /**
     * Import a STEP file into a new XCAF document with the Emscripten FS pre-injected.
     * Preserves colors, names, and assembly structure from the STEP file.
     */
    importXCAFFromSTEP(stepData) {
        return XCAFDocumentImpl.fromSTEP(this.#raw, stepData, this.#module.FS);
    }
    // =======================================================================
    // Memory
    // =======================================================================
    release(shape) {
        this.#raw.release(shape);
    }
    releaseAll() {
        this.#raw.releaseAll();
    }
    get shapeCount() {
        return this.#raw.getShapeCount();
    }
    // =======================================================================
    // Debugging
    // =======================================================================
    /** Return a human-readable summary of a shape for debugging. */
    describe(shape) {
        const type = this.getShapeType(shape);
        const bbox = this.getBoundingBox(shape, true);
        const dims = `[${(bbox.xmax - bbox.xmin).toFixed(2)} x ${(bbox.ymax - bbox.ymin).toFixed(2)} x ${(bbox.zmax - bbox.zmin).toFixed(2)}]`;
        const parts = [`${type} ${dims}`];
        if (type === "solid" || type === "compound" || type === "compsolid") {
            parts.push(`vol=${this.getVolume(shape).toFixed(3)}`);
            parts.push(`area=${this.getSurfaceArea(shape).toFixed(3)}`);
        }
        const faces = this.getSubShapes(shape, "face");
        const edges = this.getSubShapes(shape, "edge");
        const verts = this.getSubShapes(shape, "vertex");
        parts.push(`F:${faces.length} E:${edges.length} V:${verts.length}`);
        return parts.join(" | ");
    }
    [Symbol.dispose]() {
        kernelRegistry.unregister(this);
        try {
            this.#raw.releaseAll();
            this.#raw.delete();
        }
        catch {
            // Raw kernel was already deleted externally (e.g. by an adapter
            // following Embind teardown conventions) — ignore, matching the
            // FinalizationRegistry callback's behavior.
        }
    }
    // =======================================================================
    // Raw module / kernel access (for third-party adapters)
    // =======================================================================
    /**
     * Return the underlying Emscripten module. Intended for integrators who
     * need to hand the raw module to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`) without bypassing {@link OcctKernel.init}.
     *
     * The module is owned by this `OcctKernel` instance — disposing the
     * kernel does not invalidate the module reference, but the raw kernel
     * obtained via {@link getRawKernel} *will* be deleted.
     */
    getRawModule() {
        return this.#module;
    }
    /**
     * Return the underlying raw Embind kernel. Intended for integrators who
     * need to hand the raw kernel to a third-party adapter (e.g.
     * `brepjs.OcctWasmAdapter`).
     *
     * Lifecycle: the raw kernel is owned by this `OcctKernel`. Calling
     * `kernel[Symbol.dispose]()` (or letting the FinalizationRegistry collect
     * the wrapper) will `releaseAll()` and `delete()` the raw kernel — so the
     * adapter must not outlive the `OcctKernel` it was constructed from.
     * Do not call `delete()` or `releaseAll()` on the raw kernel directly.
     */
    getRawKernel() {
        return this.#raw;
    }
    // =======================================================================
    // Private helpers
    // =======================================================================
    // Per-element push_back()/get() each cross the JS->WASM boundary. Below this
    // element count the per-element loop still beats the bulk HEAP-copy path (a
    // malloc round-trip on the way in, a typed-array view + copy on the way out);
    // above it, the single bulk copy wins (measured ~50% of cost on point methods).
    static #BULK_THRESHOLD = 64;
    #makeVector(ctor, values) {
        const vec = new ctor();
        for (const v of values) {
            vec.push_back(v);
        }
        return vec;
    }
    // Copy an array into WASM memory in one shot, then build the vector C++-side.
    // allocBytes() may grow the heap, so the backing buffer is read after it; a
    // fresh typed-array view is layered over it at the malloc'd (aligned) offset.
    #bulkF64(values) {
        const ptr = this.#raw.allocBytes(values.length * 8);
        new Float64Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorF64FromHeap(ptr, values.length);
        }
        finally {
            this.#raw.freeBytes(ptr);
        }
    }
    #bulkU32(values) {
        const ptr = this.#raw.allocBytes(values.length * 4);
        new Uint32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorU32FromHeap(ptr, values.length);
        }
        finally {
            this.#raw.freeBytes(ptr);
        }
    }
    #bulkI32(values) {
        const ptr = this.#raw.allocBytes(values.length * 4);
        new Int32Array(this.#module.HEAPU32.buffer, ptr, values.length).set(values);
        try {
            return this.#raw.vectorI32FromHeap(ptr, values.length);
        }
        finally {
            this.#raw.freeBytes(ptr);
        }
    }
    // Reverse of the #bulk* helpers: read a returned vector into a JS array.
    // Each get() is a JS->WASM crossing, so above the threshold we fetch the
    // vector's contiguous storage pointer once and copy the whole block in one
    // shot (2 crossings total, regardless of length). heap.slice() detaches a
    // copy of those WASM bytes before the typed-array view is built, so the
    // caller can free the vector afterward with no aliasing concern.
    #readVector(vec, HeapArray, count) {
        if (count < _a.#BULK_THRESHOLD) {
            const out = new Array(count);
            for (let i = 0; i < count; i++) {
                out[i] = vec.get(i);
            }
            return out;
        }
        const ptr = vec.dataPtr();
        const heap = this.#module.HEAPU32.buffer;
        const buffer = heap.slice(ptr, ptr + count * HeapArray.BYTES_PER_ELEMENT);
        return Array.from(new HeapArray(buffer));
    }
    // Read a vector to numbers, then delete it. Every call site reads-then-frees.
    #drainVector(vec, HeapArray) {
        try {
            return this.#readVector(vec, HeapArray, vec.size());
        }
        finally {
            vec.delete();
        }
    }
    #vecToHandles(vec) {
        try {
            return this.#readVector(vec, Uint32Array, vec.size()).map((id) => handle(id));
        }
        finally {
            vec.delete();
        }
    }
    #makeVectorU32(ids) {
        if (ids.length < _a.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorUint32, ids);
        }
        return this.#bulkU32(ids);
    }
    #makeVectorF64(values) {
        if (values.length < _a.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorDouble, values);
        }
        return this.#bulkF64(values);
    }
    #makeVectorI32(values) {
        if (values.length < _a.#BULK_THRESHOLD) {
            return this.#makeVector(this.#module.VectorInt, values);
        }
        return this.#bulkI32(values);
    }
    // Scope guards: build a vector, run `fn` with it, and always delete it.
    // Replaces the make/try/finally/delete boilerplate at every vector-arg call
    // site so the cleanup can't be forgotten or mis-copied.
    #withU32(ids, fn) {
        const vec = this.#makeVectorU32(ids);
        try {
            return fn(vec);
        }
        finally {
            vec.delete();
        }
    }
    #withF64(values, fn) {
        const vec = this.#makeVectorF64(values);
        try {
            return fn(vec);
        }
        finally {
            vec.delete();
        }
    }
    #withI32(values, fn) {
        const vec = this.#makeVectorI32(values);
        try {
            return fn(vec);
        }
        finally {
            vec.delete();
        }
    }
    #flattenPoints(points) {
        if (points.length * 3 < _a.#BULK_THRESHOLD) {
            const vec = new this.#module.VectorDouble();
            for (const p of points) {
                vec.push_back(p.x);
                vec.push_back(p.y);
                vec.push_back(p.z);
            }
            return vec;
        }
        const flat = new Float64Array(points.length * 3);
        let j = 0;
        for (const p of points) {
            flat[j++] = p.x;
            flat[j++] = p.y;
            flat[j++] = p.z;
        }
        return this.#bulkF64(flat);
    }
    #vec2FromEmbind(vec) {
        const u = vec.get(0);
        const v = vec.get(1);
        vec.delete();
        return { u, v };
    }
    #uvBoundsFromEmbind(vec) {
        const result = {
            uMin: vec.get(0),
            uMax: vec.get(1),
            vMin: vec.get(2),
            vMax: vec.get(3),
        };
        vec.delete();
        return result;
    }
    #curvatureDataFromEmbind(vec) {
        const result = {
            min: vec.get(0),
            max: vec.get(1),
            gaussian: vec.get(2),
            mean: vec.get(3),
        };
        vec.delete();
        return result;
    }
    #vec3FromEmbind(vec) {
        const x = vec.get(0);
        const y = vec.get(1);
        const z = vec.get(2);
        vec.delete();
        return { x, y, z };
    }
    #extractMesh(raw) {
        try {
            return this.#extractMeshFromRaw(raw);
        }
        finally {
            raw.delete();
        }
    }
    #extractMeshFromRaw(raw) {
        const vertexCount = raw.positionCount / 3;
        const triangleCount = raw.indexCount / 3;
        const positions = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getPositionsPtr(), raw.getPositionsPtr() + raw.positionCount * 4));
        const normals = new Float32Array(this.#module.HEAPF32.buffer.slice(raw.getNormalsPtr(), raw.getNormalsPtr() + raw.normalCount * 4));
        const indices = new Uint32Array(this.#module.HEAPU32.buffer.slice(raw.getIndicesPtr(), raw.getIndicesPtr() + raw.indexCount * 4));
        return { positions, normals, indices, vertexCount, triangleCount };
    }
    #extractMeshWithFaceGroups(raw) {
        try {
            const mesh = this.#extractMeshFromRaw(raw);
            if (raw.faceGroupCount > 0) {
                mesh.faceGroups = new Int32Array(this.#module.HEAP32.buffer.slice(raw.getFaceGroupsPtr(), raw.getFaceGroupsPtr() + raw.faceGroupCount * 4));
                mesh.faceCount = raw.faceGroupCount / 3;
            }
            return mesh;
        }
        finally {
            raw.delete();
        }
    }
    #extractEvolution(raw) {
        const modified = this.#drainVector(raw.modified, Int32Array);
        const generated = this.#drainVector(raw.generated, Int32Array);
        const deleted = this.#drainVector(raw.deleted, Int32Array);
        return {
            result: handle(raw.resultId),
            modified,
            generated,
            deleted,
        };
    }
}
_a = OcctKernel;
//# sourceMappingURL=index.js.map