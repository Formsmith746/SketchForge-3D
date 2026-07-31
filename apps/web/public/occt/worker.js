/**
 * Off-main-thread OCCT kernel via Web Workers.
 *
 * @example
 * ```ts
 * import { OcctWorker } from 'occt-wasm/worker';
 *
 * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
 * const box = await worker.makeBox(10, 20, 30);
 * const mesh = await worker.tessellate(box);
 * console.log(mesh.triangleCount);
 * worker.terminate();
 * ```
 *
 * @module
 */
import * as Comlink from "comlink";
/**
 * Web Worker wrapper for OcctKernel. Provides the same API surface
 * but every operation runs off the main thread.
 */
export class OcctWorker {
    #worker;
    #proxy;
    constructor(worker, proxy) {
        this.#worker = worker;
        this.#proxy = proxy;
    }
    /**
     * Spawn a new Web Worker running an OcctKernel instance.
     *
     * @param options.wasm - URL or path to the .wasm file (passed to `OcctKernel.init`)
     * @param options.worker - Optional pre-created Worker instance. If omitted,
     *   a new Worker is created from the built-in worker entry point.
     *
     * @example
     * ```ts
     * const worker = await OcctWorker.spawn({ wasm: '/occt-wasm.wasm' });
     * const box = await worker.makeBox(10, 20, 30);
     * worker.terminate();
     * ```
     */
    static async spawn(options) {
        const worker = options?.worker ?? new Worker(new URL("./worker-entry.js", import.meta.url), { type: "module" });
        const remote = Comlink.wrap(worker);
        // Initialize the kernel inside the worker
        await remote.init(options ? { wasm: options.wasm, wasmUrl: options.wasmUrl, wasmPath: options.wasmPath } : undefined);
        const proxy = await remote.kernel;
        return new OcctWorker(worker, proxy);
    }
    /** Access the proxied kernel methods. */
    get kernel() {
        return this.#proxy;
    }
    // Delegate commonly used methods directly for convenience
    makeBox(dx, dy, dz) { return this.#proxy.makeBox(dx, dy, dz); }
    makeCylinder(radius, height) { return this.#proxy.makeCylinder(radius, height); }
    makeSphere(radius) { return this.#proxy.makeSphere(radius); }
    fuse(a, b) { return this.#proxy.fuse(a, b); }
    cut(a, b) { return this.#proxy.cut(a, b); }
    common(a, b) { return this.#proxy.common(a, b); }
    extrude(shape, dx, dy, dz) { return this.#proxy.extrude(shape, dx, dy, dz); }
    fillet(solid, edges, radius) { return this.#proxy.fillet(solid, edges, radius); }
    tessellate(shape, options) { return this.#proxy.tessellate(shape, options); }
    meshShape(shape, options) { return this.#proxy.meshShape(shape, options); }
    meshBatch(shapes, options) { return this.#proxy.meshBatch(shapes, options); }
    wireframe(shape, deflection) { return this.#proxy.wireframe(shape, deflection); }
    translate(shape, dx, dy, dz) { return this.#proxy.translate(shape, dx, dy, dz); }
    rotate(shape, axis, angleRad) { return this.#proxy.rotate(shape, axis, angleRad); }
    importStep(data) { return this.#proxy.importStep(data); }
    exportStep(shape) { return this.#proxy.exportStep(shape); }
    cacheStep(data) { return this.#proxy.cacheStep(data); }
    loadCached(brep) { return this.#proxy.loadCached(brep); }
    getBoundingBox(shape, useTriangulation) { return this.#proxy.getBoundingBox(shape, useTriangulation); }
    getVolume(shape) { return this.#proxy.getVolume(shape); }
    getSurfaceArea(shape) { return this.#proxy.getSurfaceArea(shape); }
    getShapeType(shape) { return this.#proxy.getShapeType(shape); }
    release(shape) { return this.#proxy.release(shape); }
    releaseAll() { return this.#proxy.releaseAll(); }
    queryBatch(shapes) { return this.#proxy.queryBatch(shapes); }
    filletBatch(ops) { return this.#proxy.filletBatch(ops); }
    transformBatch(shapes, matrices) { return this.#proxy.transformBatch(shapes, matrices); }
    rotateBatch(shapes, params) { return this.#proxy.rotateBatch(shapes, params); }
    scaleBatch(shapes, params) { return this.#proxy.scaleBatch(shapes, params); }
    mirrorBatch(shapes, params) { return this.#proxy.mirrorBatch(shapes, params); }
    /** Terminate the underlying Web Worker. */
    terminate() {
        this.#worker.terminate();
    }
}
//# sourceMappingURL=worker.js.map