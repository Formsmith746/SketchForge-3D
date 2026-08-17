/// <reference lib="webworker" />

import { OcctError, OcctKernel, type ShapeHandle } from "occt-wasm";
import type { CadModifierComponentMesh, CadModifierDisplayEdge, CadModifierEdge, CadModifierMeshPart, CadModifierPrimitivePart, CadModifierQuality, CadModifierWorkerRequest, CadModifierWorkerResponse } from "@/lib/cadModifierTypes";
import { CAD_MODIFIER_MIN_AMOUNT, CAD_MODIFIER_RUNTIME_BASE, cadModifierMeshFallbackParts, cadModifierTopologyEdgeIsSelectable, cadTransformRequiresGeneralTransform, findCadModifierCompatibleSelection, fitCadModifierAmount, isCadModifierWasmMemoryFault, serializeOptionalCadModifierBreps } from "@/lib/cadModifierRuntime";
import { closedCadSolidComponents } from "@/lib/cadModifierGroups";

const HASH_UPPER_BOUND = 2_147_483_647;
const CAD_EDGE_WIREFRAME_DEFLECTION = 0.035;
const CAD_DISPLAY_EDGE_MIN_ANGLE = 0.75;
const CURVED_SURFACE_TYPES = new Set(["cylinder", "cone", "sphere", "torus", "bspline", "bezier", "offset", "revolution", "extrusion"]);
let kernelPromise: Promise<OcctKernel> | null = null;
let baseShape: ShapeHandle | null = null;
let baseSolids: ShapeHandle[] = [];
let edgeHandles: ShapeHandle[] = [];
let edgeOwners: number[] = [];
let activeSessionId = 0;
let usedExactMeshFallback = false;

type CollectedCadEdgeGeometry = Omit<CadModifierEdge, "display" | "selectable"> & {
  curveType: string;
  surfaceTypes: string[];
  faceAreas: number[];
};
type CollectedCadEdge = CollectedCadEdgeGeometry & Pick<CadModifierEdge, "display" | "selectable">;

class CadExactMeshFallbackRequired extends Error {
  constructor() {
    super("Exact CAD restoration requires a fresh-kernel mesh fallback");
    this.name = "CadExactMeshFallbackRequired";
  }
}

function post(message: CadModifierWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

function kernel() {
  const moduleUrl = `${CAD_MODIFIER_RUNTIME_BASE}/occt-wasm.js`;
  kernelPromise ??= import(/* webpackIgnore: true */ moduleUrl).then((imported: { default: (options?: { locateFile?: (path: string) => string }) => Promise<unknown> }) => imported.default({
    locateFile: (path) => path.endsWith(".wasm") ? `${CAD_MODIFIER_RUNTIME_BASE}/occt-wasm.wasm` : path,
  })).then((module) => {
    const KernelConstructor = OcctKernel as unknown as new (rawModule: unknown) => OcctKernel;
    return new KernelConstructor(module);
  });
  return kernelPromise;
}

function releaseSession(cad: OcctKernel) {
  try {
    cad.releaseAll();
  } catch {
    // The arena may already be empty after an operation failure.
  }
  baseShape = null;
  baseSolids = [];
  edgeHandles = [];
  edgeOwners = [];
  activeSessionId = 0;
  usedExactMeshFallback = false;
}

function cadShapeIsValid(cad: OcctKernel, shape: ShapeHandle) {
  const validator = (cad as { isValid?: unknown }).isValid;
  if (typeof validator !== "function") throw new Error("isValid is not a function");
  try {
    return Boolean(validator.call(cad, shape));
  } catch {
    return false;
  }
}

function orientedFaceNormal(cad: OcctKernel, face: ShapeHandle, point: { x: number; y: number; z: number }) {
  const uv = cad.uvFromPoint(face, point);
  const normal = cad.surfaceNormal(face, uv.u, uv.v);
  if (cad.shapeOrientation(face) === "reversed") {
    normal.x *= -1;
    normal.y *= -1;
    normal.z *= -1;
  }
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
  return { x: normal.x / length, y: normal.y / length, z: normal.z / length };
}

function parseEdgeFaceMap(values: number[]) {
  const map = new Map<number, number[]>();
  for (let index = 0; index + 1 < values.length; ) {
    const edgeHash = values[index++];
    const count = values[index++];
    const faces = values.slice(index, index + count);
    index += count;
    const current = map.get(edgeHash) ?? [];
    faces.forEach((hash) => {
      if (!current.includes(hash)) current.push(hash);
    });
    map.set(edgeHash, current);
  }
  return map;
}

function edgeAngle(cad: OcctKernel, points: number[], faceHashes: number[], faceByHash: Map<number, ShapeHandle>) {
  if (faceHashes.length !== 2 || points.length < 6) return { angle: 0, boundary: faceHashes.length < 2, manifold: false };
  const offset = Math.max(0, Math.floor(points.length / 6) * 3);
  const point = { x: points[offset], y: points[offset + 1], z: points[offset + 2] };
  const faceA = faceByHash.get(faceHashes[0]);
  const faceB = faceByHash.get(faceHashes[1]);
  if (faceA === undefined || faceB === undefined) return { angle: 0, boundary: false, manifold: false };
  try {
    const a = orientedFaceNormal(cad, faceA, point);
    const b = orientedFaceNormal(cad, faceB, point);
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
    const rawAngle = (Math.acos(dot) * 180) / Math.PI;
    return { angle: Math.min(rawAngle, 180 - rawAngle), boundary: false, manifold: true };
  } catch {
    return { angle: 0, boundary: false, manifold: false };
  }
}

function meshPartToAsciiStl(part: CadModifierMeshPart) {
  if (!part.positions || !part.indices) throw new Error("The selected object has no mesh data");
  const lines = new Array<string>(part.indices.length / 3 + 2);
  lines[0] = "solid sketchforge";
  const { positions, indices } = part;
  for (let offset = 0, face = 1; offset + 2 < indices.length; offset += 3, face += 1) {
    const ai = indices[offset] * 3;
    const bi = indices[offset + 1] * 3;
    const ci = indices[offset + 2] * 3;
    const ax = positions[ai];
    const ay = positions[ai + 1];
    const az = positions[ai + 2];
    const bx = positions[bi];
    const by = positions[bi + 1];
    const bz = positions[bi + 2];
    const cx = positions[ci];
    const cy = positions[ci + 1];
    const cz = positions[ci + 2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    lines[face] = `facet normal ${nx} ${ny} ${nz}\n outer loop\n  vertex ${ax} ${ay} ${az}\n  vertex ${bx} ${by} ${bz}\n  vertex ${cx} ${cy} ${cz}\n endloop\nendfacet`;
  }
  lines[lines.length - 1] = "endsolid sketchforge";
  return lines.join("\n");
}

function isCadTransform(transform: number[] | undefined): transform is number[] {
  return Boolean(transform?.length === 12 && transform.every(Number.isFinite));
}

function isIdentityCadTransform(transform: number[]) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  return transform.every((value, index) => Math.abs(value - identity[index]) < 1e-9);
}

function applyCadTransform(cad: OcctKernel, shape: ShapeHandle, transform: number[] | undefined) {
  if (!isCadTransform(transform) || isIdentityCadTransform(transform)) return shape;
  let transformed: ShapeHandle;
  if (cadTransformRequiresGeneralTransform(transform)) {
    transformed = cad.generalTransform(shape, transform);
  } else {
    try {
      transformed = cad.transform(shape, transform);
    } catch {
      transformed = cad.generalTransform(shape, transform);
    }
  }
  if (transformed !== shape) cad.release(shape);
  return transformed;
}

function validExactCadSolid(cad: OcctKernel, shape: ShapeHandle) {
  const solids = cad.getSubShapes(shape, "solid");
  if (!cadShapeIsValid(cad, shape) || (!cad.isSolid(shape) && solids.length === 0)) {
    releaseHandles(cad, solids);
    return null;
  }
  if (solids.length === 1) {
    if (solids[0] !== shape) cad.release(shape);
    return solids[0];
  }
  releaseHandles(cad, solids);
  return shape;
}

function replaceCadShape(cad: OcctKernel, current: ShapeHandle, next: ShapeHandle) {
  if (next !== current) cad.release(current);
  return next;
}

function reconstructPrimitiveSolid(cad: OcctKernel, primitive: CadModifierPrimitivePart) {
  if (primitive.kind !== "box") {
    throw new Error(`Unsupported CAD primitive: ${primitive.kind}`);
  }
  const width = primitive.width;
  const depth = primitive.depth;
  const height = primitive.height;
  if (![width, depth, height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("The selected primitive has invalid dimensions");
  }
  const solid = cad.makeBoxFromCorners(
    { x: -width / 2, y: 0, z: -depth / 2 },
    { x: width / 2, y: height, z: depth / 2 },
  );
  const transformed = applyCadTransform(cad, solid, primitive.transform);
  if (!cad.isSolid(transformed) || !cadShapeIsValid(cad, transformed)) {
    throw new Error("The selected primitive could not be prepared as a valid CAD solid");
  }
  return transformed;
}

function reconstructSolid(cad: OcctKernel, part: CadModifierMeshPart) {
  if (part.primitive) {
    return reconstructPrimitiveSolid(cad, part.primitive);
  }
  if (part.brep || part.step) {
    let exact: ShapeHandle | null = null;
    try {
      exact = part.brep ? cad.fromBREP(part.brep) : cad.importStep(part.step as string);
      exact = applyCadTransform(cad, exact, part.brepTransform);
      const restored = validExactCadSolid(cad, exact);
      if (restored !== null) return restored;
      exact = replaceCadShape(cad, exact, cad.fixShape(exact));
      exact = replaceCadShape(cad, exact, cad.fixFaceOrientations(exact));
      if (cad.isSolid(exact)) exact = replaceCadShape(cad, exact, cad.healSolid(exact, 1e-5));
      const healed = validExactCadSolid(cad, exact);
      if (healed !== null) return healed;
      throw new Error("The stored CAD feature could not be restored as a valid solid");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      const name = error instanceof Error ? error.name : "";
      const memoryFault = isCadModifierWasmMemoryFault(message, name);
      if (exact !== null && !memoryFault) cad.release(exact);
      if (part.positions && part.indices) throw new CadExactMeshFallbackRequired();
      if (memoryFault) throw error;
      throw new Error("The stored exact CAD body could not be restored, and this object is too dense to include a mesh fallback. Simplify or reimport the object, then try again.");
    }
  }
  const imported = cad.importStl(meshPartToAsciiStl(part));
  let shape = cad.fixShape(imported);
  if (cad.isSolid(shape)) {
    try {
      shape = cad.healSolid(shape, 1e-4);
      shape = cad.fixFaceOrientations(shape);
      shape = cad.removeDegenerateEdges(shape);
      shape = cad.unifySameDomain(shape);
    } catch {
      // Fall through to face sewing when the imported solid cannot be healed directly.
    }
    if (cad.isSolid(shape) && cadShapeIsValid(cad, shape)) return shape;
  }

  const faces = cad.getSubShapes(imported, "face");
  if (faces.length === 0) throw new Error("The selected object has no closed faces");
  for (const tolerance of [1e-5, 1e-4, 1e-3, 1e-2]) {
    try {
      let candidate = cad.sewAndSolidify(faces, tolerance);
      candidate = cad.fixShape(candidate);
      if (cad.isSolid(candidate)) candidate = cad.healSolid(candidate, tolerance);
      candidate = cad.fixFaceOrientations(candidate);
      candidate = cad.removeDegenerateEdges(candidate);
      candidate = cad.unifySameDomain(candidate);
      if (cad.isSolid(candidate) && cadShapeIsValid(cad, candidate)) return candidate;
    } catch {
      // Try the next tolerance. Curved tessellations can need looser vertex sewing.
    }
  }
  throw new Error("The selected mesh is open or non-manifold. Repair it before adding edge treatments.");
}

function reconstructParts(cad: OcctKernel, parts: CadModifierMeshPart[]) {
  const solids = parts.filter((part) => !part.hole).map((part) => reconstructSolid(cad, part));
  const holes = parts.filter((part) => part.hole).map((part) => reconstructSolid(cad, part));
  if (solids.length === 0) throw new Error("The group has no solid body to modify");
  let result = solids[0];
  for (let index = 1; index < solids.length; index += 1) {
    result = cad.fuse(result, solids[index]);
    result = cad.simplify(result);
    result = cad.unifySameDomain(result);
  }
  for (const hole of holes) {
    result = cad.cut(result, hole);
    result = cad.simplify(result);
    result = cad.unifySameDomain(result);
  }
  result = cad.fixShape(result);
  result = cad.simplify(result);
  result = cad.unifySameDomain(result);
  if (!cadShapeIsValid(cad, result)) throw new Error("The grouped solid could not be repaired into valid topology");
  return result;
}

function isDisplayCadEdge(edge: CollectedCadEdgeGeometry) {
  if (!edge.manifold || edge.boundary || edge.points.length < 6) return false;
  const effectiveAngle = Math.min(edge.angle, 180 - edge.angle);
  const touchesCurvedSurface = edge.surfaceTypes.some((surfaceType) => CURVED_SURFACE_TYPES.has(surfaceType));
  const isCurvedEdge = edge.curveType !== "line";
  return effectiveAngle + 1e-3 >= CAD_DISPLAY_EDGE_MIN_ANGLE || touchesCurvedSurface || isCurvedEdge;
}

function treatmentDetailFaceAreaLimit(faceAreas: number[]) {
  const finiteAreas = faceAreas.filter((area) => Number.isFinite(area) && area > 1e-8);
  if (finiteAreas.length === 0) return 0;
  return Math.max(1e-8, Math.max(...finiteAreas) * 0.3);
}

function touchesTreatmentDetailFace(edge: CollectedCadEdgeGeometry, areaLimit: number) {
  return areaLimit > 0 && edge.faceAreas.some((area) => area > 0 && area <= areaLimit);
}

function isModifierDisplayCadEdge(edge: CollectedCadEdgeGeometry, treatmentAreaLimit: number) {
  return isDisplayCadEdge(edge) && !touchesTreatmentDetailFace(edge, treatmentAreaLimit);
}

function releaseHandles(cad: OcctKernel, handles: ShapeHandle[]) {
  handles.forEach((handle) => {
    try {
      cad.release(handle);
    } catch {
      // A failed topology operation can invalidate temporary handles.
    }
  });
}

const CAD_EDGE_OPERATION_NAMES = new Set(["fillet", "filletVariable", "chamfer", "chamferDistAngle"]);

class CadEdgeOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CadEdgeOperationError";
  }
}

function isCadEdgeOperationFailure(error: unknown) {
  return error instanceof CadEdgeOperationError || (error instanceof OcctError && CAD_EDGE_OPERATION_NAMES.has(error.operation));
}

function retryableCadEdgeOperationFailure(error: unknown) {
  if (!isCadEdgeOperationFailure(error)) return false;
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  return !isCadModifierWasmMemoryFault(message, name);
}

function uniqueEdgeOrders(cad: OcctKernel, edges: ShapeHandle[], retryOrder: boolean) {
  const orders = [edges];
  if (retryOrder && edges.length > 1) {
    orders.push([...edges].reverse());
    try {
      const lengths = new Map(edges.map((edge) => [edge, cad.getLength(edge)]));
      orders.push([...edges].sort((a, b) => (lengths.get(a) ?? 0) - (lengths.get(b) ?? 0)));
      orders.push([...edges].sort((a, b) => (lengths.get(b) ?? 0) - (lengths.get(a) ?? 0)));
    } catch {
      // Original and reversed orders still provide bounded topology retries.
    }
  }
  const seen = new Set<string>();
  return orders.filter((order) => {
    const key = order.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function modifyCadSolid(
  cad: OcctKernel,
  solid: ShapeHandle,
  edges: ShapeHandle[],
  request: Extract<CadModifierWorkerRequest, { type: "preview" }>,
  amount: number,
  retryOrder: boolean,
) {
  const orders = uniqueEdgeOrders(cad, edges, retryOrder);
  const operations = request.kind === "fillet"
    ? [
        (order: ShapeHandle[]) => cad.fillet(solid, order, amount),
        ...(edges.length === 1
          ? [(order: ShapeHandle[]) => cad.filletVariable(solid, order[0], amount, amount)]
          : []),
      ]
    : Math.abs(request.chamferAngle - 45) < 0.001
      ? [
          (order: ShapeHandle[]) => cad.chamfer(solid, order, amount),
          (order: ShapeHandle[]) => cad.chamferDistAngle(solid, order, amount, 45),
        ]
      : [(order: ShapeHandle[]) => cad.chamferDistAngle(solid, order, amount, request.chamferAngle)];
  let firstError: unknown;
  for (const operation of operations) {
    for (const order of orders) {
      let candidate: ShapeHandle | null = null;
      try {
        candidate = operation(order);
        if (cadShapeIsValid(cad, candidate)) return candidate;
        cad.release(candidate);
        candidate = null;
        throw new CadEdgeOperationError("The chosen size creates invalid or overlapping edge geometry");
      } catch (error) {
        if (candidate !== null) cad.release(candidate);
        if (!retryableCadEdgeOperationFailure(error)) throw error;
        firstError ??= error;
      }
    }
  }
  throw firstError ?? new CadEdgeOperationError("The CAD kernel could not build this edge treatment");
}

type CadComponentResult = {
  components: ShapeHandle[];
  result: ShapeHandle;
};

function releaseCadComponentResult(cad: OcctKernel, built: CadComponentResult) {
  releaseHandles(cad, built.components);
  if (built.components.length > 1) releaseHandles(cad, [built.result]);
}

function buildCadComponentResult(
  cad: OcctKernel,
  selected: Array<{ edge: ShapeHandle; owner: number }>,
  request: Extract<CadModifierWorkerRequest, { type: "preview" }>,
  amount: number,
  retryOrder: boolean,
): CadComponentResult {
  const components: ShapeHandle[] = [];
  let result: ShapeHandle | null = null;
  try {
    for (let owner = 0; owner < baseSolids.length; owner += 1) {
      const solid = baseSolids[owner];
      const componentEdges = selected.filter((entry) => entry.owner === owner).map((entry) => entry.edge);
      components.push(componentEdges.length === 0
        ? cad.copy(solid)
        : modifyCadSolid(cad, solid, componentEdges, request, amount, retryOrder));
    }
    result = components.length === 1 ? components[0] : cad.makeCompound(components);
    if (!cadShapeIsValid(cad, result)) {
      throw new CadEdgeOperationError("The chosen size creates invalid or overlapping edge geometry");
    }
    return { components, result };
  } catch (error) {
    components.forEach((component) => cad.release(component));
    if (result !== null && components.length > 1) cad.release(result);
    throw error;
  }
}

function collectEdges(cad: OcctKernel, shape: ShapeHandle, sharpAngle: number, suppressTreatmentDetailEdges = false, retainEdgeHandles = false) {
  const handles = cad.getSubShapes(shape, "edge");
  const faces = cad.getSubShapes(shape, "face");
  let keepEdgeHandles = false;
  try {
    const faceByHash = new Map(faces.map((face) => [cad.hashCode(face, HASH_UPPER_BOUND), face]));
    const faceAreaByHash = new Map<number, number>();
    faces.forEach((face) => {
      const hash = cad.hashCode(face, HASH_UPPER_BOUND);
      let area = 0;
      try {
        area = Math.abs(cad.getSurfaceArea(face));
      } catch {
        area = 0;
      }
      faceAreaByHash.set(hash, area);
    });
    const treatmentAreaLimit = suppressTreatmentDetailEdges ? treatmentDetailFaceAreaLimit([...faceAreaByHash.values()]) : 0;
    const adjacentFaces = parseEdgeFaceMap(cad.edgeToFaceMap(shape, HASH_UPPER_BOUND));
    const wire = cad.wireframe(shape, CAD_EDGE_WIREFRAME_DEFLECTION);
    const pointsByHash = new Map<number, number[]>();
    for (let index = 0; index + 2 < wire.edgeGroups.length; index += 3) {
      const start = wire.edgeGroups[index];
      const count = wire.edgeGroups[index + 1];
      const hash = wire.edgeGroups[index + 2];
      if (!pointsByHash.has(hash)) pointsByHash.set(hash, Array.from(wire.points.slice(start, start + count)));
    }

    const collectedEdges = handles.map((handle, id) => {
      const hash = cad.hashCode(handle, HASH_UPPER_BOUND);
      const faceHashes = adjacentFaces.get(hash) ?? [];
      const points = pointsByHash.get(hash) ?? [];
      const classification = edgeAngle(cad, points, faceHashes, faceByHash);
      const faceAreas = faceHashes.map((faceHash) => faceAreaByHash.get(faceHash) ?? 0);
      const surfaceTypes = faceHashes
        .map((faceHash) => faceByHash.get(faceHash))
        .filter((face): face is ShapeHandle => face !== undefined)
        .map((face) => {
          try {
            return cad.surfaceType(face);
          } catch {
            return "unknown";
          }
        });
      let curveType = "line";
      try {
        curveType = cad.curveType(handle);
      } catch {
        curveType = "unknown";
      }
      return { id, points, ...classification, curveType, surfaceTypes, faceAreas };
    }).filter((edge) => edge.points.length >= 6);
    const edges: CollectedCadEdge[] = collectedEdges.map((edge) => {
      const display = treatmentAreaLimit > 0 ? isModifierDisplayCadEdge(edge, treatmentAreaLimit) : isDisplayCadEdge(edge);
      return {
        ...edge,
        display,
        selectable: cadModifierTopologyEdgeIsSelectable(edge),
      };
    });
    const selectableEdgeIds = edges.filter((edge) => edge.selectable && edge.angle + 1e-3 >= sharpAngle).map((edge) => edge.id);
    const displayEdges = cadDisplayEdgesFromCollected(edges);
    keepEdgeHandles = retainEdgeHandles;
    return { handles, edges: edges.map(({ curveType: _curveType, surfaceTypes: _surfaceTypes, faceAreas: _faceAreas, ...edge }) => edge), selectableEdgeIds, displayEdges };
  } finally {
    releaseHandles(cad, faces);
    if (!keepEdgeHandles) releaseHandles(cad, handles);
  }
}

function cadDisplayEdgesFromCollected(edges: CollectedCadEdge[]): CadModifierDisplayEdge[] {
  return edges
    .filter((edge) => edge.display)
    .map((edge) => ({ points: edge.points }));
}

function tessellationOptions(quality: CadModifierQuality, amount: number) {
  if (quality === "draft") return { linearDeflection: Math.max(0.12, amount / 3), angularDeflection: 0.42 };
  if (quality === "fine") return { linearDeflection: Math.max(0.025, amount / 12), angularDeflection: 0.1 };
  return { linearDeflection: Math.max(0.055, amount / 7), angularDeflection: 0.2 };
}

function copyCadMesh(mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array; triangleCount: number }) {
  return {
    positions: new Float32Array(mesh.positions),
    normals: new Float32Array(mesh.normals),
    indices: new Uint32Array(mesh.indices),
    triangleCount: mesh.triangleCount,
  };
}

function isImportStlWasmFault(message: string) {
  return /importStl:.*WebAssembly\.Exception/i.test(message);
}

function isMissingValidatorFault(message: string) {
  return /isValid/i.test(message) && /null|not a function|undefined/i.test(message);
}

self.onmessage = async (event: MessageEvent<CadModifierWorkerRequest>) => {
  const request = event.data;
  let cad: OcctKernel | null = null;
  try {
    cad = await kernel();
    if (request.type === "dispose") {
      releaseSession(cad);
      post({ type: "disposed", requestId: request.requestId });
      return;
    }
    if (request.type === "prepare") {
      let activeCad = cad;
      releaseSession(activeCad);
      let reconstructed: ShapeHandle;
      try {
        reconstructed = reconstructParts(activeCad, request.parts);
      } catch (error) {
        if (!(error instanceof CadExactMeshFallbackRequired)) throw error;
        releaseSession(activeCad);
        kernelPromise = null;
        cad = await kernel();
        activeCad = cad;
        releaseSession(activeCad);
        usedExactMeshFallback = true;
        reconstructed = reconstructParts(activeCad, cadModifierMeshFallbackParts(request.parts));
      }
      baseSolids = closedCadSolidComponents(
        reconstructed,
        (shape) => activeCad.isSolid(shape),
        (shape) => activeCad.getSubShapes(shape, "solid"),
      );
      if (baseSolids.length === 0) throw new Error("The selected group contains no closed solid components");
      // OCCT wraps boolean-fused bodies in a compound even when the result is one solid.
      // Use that solid directly so overlapping grouped parts have one closed modifier body.
      baseShape = baseSolids.length === 1 ? baseSolids[0] : reconstructed;
      const collected = collectEdges(activeCad, baseShape, request.sharpAngle, Boolean(request.suppressTreatmentDetailEdges), true);
      edgeHandles = collected.handles;
      const ownerEdgeHandles = baseSolids.map((solid) => activeCad.getSubShapes(solid, "edge"));
      try {
        const ownerCandidates = new Map<number, Array<{ owner: number; edge: ShapeHandle }>>();
        ownerEdgeHandles.forEach((componentEdges, owner) => {
          componentEdges.forEach((edge) => {
            const hash = activeCad.hashCode(edge, HASH_UPPER_BOUND);
            const candidates = ownerCandidates.get(hash) ?? [];
            candidates.push({ owner, edge });
            ownerCandidates.set(hash, candidates);
          });
        });
        edgeOwners = edgeHandles.map((edge) => {
          const hash = activeCad.hashCode(edge, HASH_UPPER_BOUND);
          const candidates = ownerCandidates.get(hash) ?? [];
          const exact = candidates.find((candidate) => activeCad.isSame(edge, candidate.edge));
          if (!exact) throw new Error("A CAD edge could not be mapped to its solid component; restart the edge tool");
          return exact.owner;
        });
      } finally {
        ownerEdgeHandles.forEach((componentEdges) => releaseHandles(activeCad, componentEdges));
      }
      activeSessionId = request.requestId;
      post({
        type: "ready",
        requestId: request.requestId,
        edges: collected.edges.map((edge) => ({ ...edge, owner: edgeOwners[edge.id] ?? 0 })),
        selectableEdgeIds: collected.selectableEdgeIds,
        sourceType: activeCad.getShapeType(baseShape),
        usedMeshFallback: usedExactMeshFallback || undefined,
      });
      return;
    }
    const activeCad = cad;
    if (baseShape === null) throw new Error("Prepare an object before previewing the modifier");
    if (request.sessionId !== activeSessionId) throw new Error("The prepared edge object changed; restart the edge tool and try again");
    const selected = request.edgeIds.map((id) => ({ id, edge: edgeHandles[id], owner: edgeOwners[id] })).filter((entry): entry is { id: number; edge: ShapeHandle; owner: number } => entry.edge !== undefined);
    if (selected.length === 0) throw new Error("Select at least one highlighted edge");
    let built: CadComponentResult | null = null;
    let resetKernelAfterPreview = false;
    try {
      const fitSelection = (entries: Array<{ id: number; edge: ShapeHandle; owner: number }>) => fitCadModifierAmount(
          request.amount,
          (amount, retryOrder) => buildCadComponentResult(activeCad, entries, request, amount, retryOrder),
          (candidate) => releaseCadComponentResult(activeCad, candidate),
          retryableCadEdgeOperationFailure,
        );
      let selectedForResult = selected;
      let fitted: ReturnType<typeof fitSelection>;
      try {
        fitted = fitSelection(selectedForResult);
      } catch (error) {
        if (!retryableCadEdgeOperationFailure(error)) throw error;
        const compatible = findCadModifierCompatibleSelection(
          selected,
          (candidate) => buildCadComponentResult(activeCad, candidate, request, CAD_MODIFIER_MIN_AMOUNT, false),
          (candidate) => releaseCadComponentResult(activeCad, candidate as CadComponentResult),
          retryableCadEdgeOperationFailure,
        );
        if (!compatible) throw error;
        selectedForResult = compatible;
        fitted = fitSelection(selectedForResult);
      }
      built = fitted.value;
      const componentHandles = built.components;
      const options = tessellationOptions(request.quality, fitted.amount);
      const mesh = copyCadMesh(activeCad.tessellate(built.result, options));
      const displayEdges = collectEdges(activeCad, built.result, 0).displayEdges;
      const components: CadModifierComponentMesh[] = componentHandles.map((component, owner) => {
        const componentMesh = copyCadMesh(activeCad.tessellate(component, options));
        return {
          owner,
          positions: componentMesh.positions,
          normals: componentMesh.normals,
          indices: componentMesh.indices,
          triangleCount: componentMesh.triangleCount,
          displayEdges: collectEdges(activeCad, component, 0).displayEdges,
        };
      });
      const serialized = serializeOptionalCadModifierBreps(
        built.result,
        componentHandles,
        (shape) => activeCad.toBREP(shape),
      );
      components.forEach((component, owner) => {
        component.brep = serialized.componentBreps[owner];
      });
      const exactSerializationFailed = serialized.failed;
      resetKernelAfterPreview = serialized.failed;
      post(
        {
          type: "preview",
          requestId: request.requestId,
          positions: mesh.positions,
          normals: mesh.normals,
          indices: mesh.indices,
          triangleCount: mesh.triangleCount,
          brep: serialized.brep,
          appliedAmount: fitted.amount,
          adjustedAmount: fitted.adjusted,
          appliedEdgeIds: selectedForResult.map((entry) => entry.id),
          skippedEdgeIds: selected.filter((entry) => !selectedForResult.includes(entry)).map((entry) => entry.id),
          exactSerializationFailed: exactSerializationFailed || undefined,
          displayEdges,
          components,
        },
        [
          mesh.positions.buffer,
          mesh.normals.buffer,
          mesh.indices.buffer,
          ...components.flatMap((component) => [component.positions.buffer, component.normals.buffer, component.indices.buffer]),
        ],
      );
    } finally {
      if (built) releaseCadComponentResult(activeCad, built);
      if (resetKernelAfterPreview) {
        releaseSession(activeCad);
        kernelPromise = null;
      }
    }
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error ?? "");
    const errorName = error instanceof Error ? error.name : "";
    if (isCadModifierWasmMemoryFault(rawMessage, errorName) || isImportStlWasmFault(rawMessage) || isMissingValidatorFault(rawMessage)) {
      if (cad) releaseSession(cad);
      kernelPromise = null;
      const message = isImportStlWasmFault(rawMessage)
        ? "The selected mesh could not be converted into a closed CAD solid. The CAD kernel reset; try Separate Parts, ungrouping, or simplifying the object before adding edge features."
        : isMissingValidatorFault(rawMessage)
          ? "The CAD kernel exposed an incomplete validation function and reset. Start the edge tool again; no page refresh is needed."
        : "The CAD kernel hit a memory fault and reset. Start the edge tool again; no page refresh is needed.";
      post({
        type: "error",
        requestId: request.requestId,
        message,
        resetSession: true,
      });
      return;
    }
    const message = request.type === "preview" && isCadEdgeOperationFailure(error)
      ? `The selected edges cannot be ${request.kind === "fillet" ? "filleted" : "chamfered"} together, even after fitting a smaller size. Select fewer connected edges or simplify tight corners.`
      : rawMessage || "The CAD kernel could not complete this edge treatment";
    if (request.type === "prepare" && cad) releaseSession(cad);
    post({ type: "error", requestId: request.requestId, message });
  }
};

export {};
