/// <reference lib="webworker" />

import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { orderedCadSketchPaths, selectedCadSketchRegions, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import type { SketchCadBuildRequest, SketchCadBuildResponse } from "@/lib/sketchCadTypes";

let kernelPromise: Promise<OcctKernel> | null = null;

function kernel() {
  const moduleUrl = "/occt/occt-wasm.js";
  kernelPromise ??= import(/* webpackIgnore: true */ moduleUrl)
    .then((imported: { default: (options?: { locateFile?: (path: string) => string }) => Promise<unknown> }) => imported.default({
      locateFile: (path) => path.endsWith(".wasm") ? "/occt/occt-wasm.wasm" : path,
    }))
    .then((module) => {
      const KernelConstructor = OcctKernel as unknown as new (rawModule: unknown) => OcctKernel;
      return new KernelConstructor(module);
    });
  return kernelPromise;
}

function post(message: SketchCadBuildResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

function pathWire(cad: OcctKernel, path: OrderedCadSketchPath) {
  const edges = path.steps.map(({ segment, from, to }) => {
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      return cad.makeBezierEdge([
        { x: from.x, y: 0, z: from.z },
        { x: first.x, y: 0, z: first.z },
        { x: second.x, y: 0, z: second.z },
        { x: to.x, y: 0, z: to.z },
      ]);
    }
    return cad.makeLineEdge({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z });
  });
  return cad.makeWire(edges);
}

self.onmessage = async (event: MessageEvent<SketchCadBuildRequest>) => {
  const request = event.data;
  let cad: OcctKernel | null = null;
  try {
    cad = await kernel();
    cad.releaseAll();
    const regions = selectedCadSketchRegions(request.profile, request.regionIds);
    if (regions.length === 0) throw new Error(request.regionIds ? "Select at least one closed profile to extrude." : "No closed profile found. Draw at least one closed loop and ensure it has no degenerate (zero-area) geometry.");
    const sourcePaths = orderedCadSketchPaths(request.profile).filter((path) => path.closed);
    const sourcePathById = new Map(sourcePaths.map((path) => [path.id, path]));
    const sourceSolidById = new Map<string, ShapeHandle>();
    const sourceSolid = (id: string) => {
      const cached = sourceSolidById.get(id);
      if (cached) return cached;
      const path = sourcePathById.get(id);
      if (!path) throw new Error("A selected overlap profile no longer matches the sketch geometry.");
      const solid = cad!.extrude(cad!.makeFace(pathWire(cad!, path)), 0, request.height, 0);
      sourceSolidById.set(id, solid);
      return solid;
    };
    const solids: ShapeHandle[] = regions.map((region) => {
      // Unique overlap faces can retain exact source curves through booleans.
      // Faces divided by open geometry fall back to their sampled boundary.
      if (region.sourcePathIds?.length) {
        const included = new Set(region.sourcePathIds);
        const sourceSolids = region.sourcePathIds.map(sourceSolid);
        let solid = sourceSolids.slice(1).reduce((result, tool) => cad!.common(result, tool), sourceSolids[0]);
        const excluded = sourcePaths.filter((path) => !included.has(path.id)).map((path) => sourceSolid(path.id));
        if (excluded.length > 0) solid = cad!.cutAll(solid, excluded);
        return solid;
      }
      let face = cad!.makeFace(pathWire(cad!, region.outer));
      if (region.holes.length > 0) face = cad!.addHolesInFace(face, region.holes.map((hole) => pathWire(cad!, hole)));
      return cad!.extrude(face, 0, request.height, 0);
    });
    const result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
    if (!cad.isValid(result)) throw new Error("OpenCascade produced invalid sketch topology");
    const mesh = cad.tessellate(result, { linearDeflection: 0.05, angularDeflection: 0.16 });
    const positions = new Float32Array(mesh.positions);
    const normals = new Float32Array(mesh.normals);
    const indices = new Uint32Array(mesh.indices);
    const brep = cad.toBREP(result);
    post({ type: "built", requestId: request.requestId, positions, normals, indices, triangleCount: mesh.triangleCount, brep }, [positions.buffer, normals.buffer, indices.buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "The CAD kernel could not build this sketch");
    post({ type: "error", requestId: request.requestId, message });
    if (/memory|WebAssembly|abort/i.test(message)) kernelPromise = null;
  } finally {
    try {
      cad?.releaseAll();
    } catch {
      // The arena may already have reset after a kernel error.
    }
  }
};

export {};
