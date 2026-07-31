/**
 * Worker entry point — runs inside the Web Worker.
 * Initializes an OcctKernel and exposes it via Comlink.
 * @module
 */
import * as Comlink from "comlink";
import { OcctKernel } from "./index.js";
let kernel = null;
const api = {
    async init(options) {
        if (kernel) {
            kernel.releaseAll();
        }
        kernel = await OcctKernel.init(options);
    },
    get kernel() {
        if (!kernel)
            throw new Error("OcctKernel not initialized — call init() first");
        return Comlink.proxy(kernel);
    },
};
Comlink.expose(api);
//# sourceMappingURL=worker-entry.js.map