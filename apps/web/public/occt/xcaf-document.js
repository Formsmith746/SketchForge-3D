/**
 * Fluent XCAF document builder for assemblies with colors and names.
 *
 * @example
 * ```ts
 * const doc = XCAFDocument.create(rawKernel);
 * const root = doc.addShape(box, { name: 'housing', color: [0.8, 0.2, 0.1] });
 * doc.addChild(root, gear, {
 *   name: 'gear-1',
 *   location: { tx: 10, ty: 0, tz: 5 },
 *   color: [0.5, 0.5, 0.5],
 * });
 * const step = doc.exportSTEP();
 * const glb = doc.exportGLTF(Module);
 * doc.close();
 * ```
 */
import { OcctError, OcctErrorCode, wrap } from "./types.js";
function tag(n) {
    return n;
}
export class XCAFDocument {
    #raw;
    #docId;
    #fs;
    #closed = false;
    constructor(raw, docId, fs) {
        this.#raw = raw;
        this.#docId = docId;
        this.#fs = fs;
    }
    /** Create a new empty XCAF document. */
    static create(raw, fs) {
        const docId = wrap("xcafNewDocument", () => raw.xcafNewDocument());
        return new XCAFDocument(raw, docId, fs);
    }
    /** Import a STEP file into a new XCAF document (preserves colors/names/assemblies). */
    static fromSTEP(raw, stepData, fs) {
        const docId = wrap("xcafImportSTEP", () => raw.xcafImportSTEP(stepData));
        return new XCAFDocument(raw, docId, fs);
    }
    /** Add a shape as a root label. */
    addShape(shape, options) {
        this.#ensureOpen();
        const t = wrap("xcafAddShape", () => this.#raw.xcafAddShape(this.#docId, shape));
        this.#applyOptions(t, options);
        return tag(t);
    }
    /** Add a shape as a child component of a parent label. */
    addChild(parent, shape, options) {
        this.#ensureOpen();
        const loc = options?.location ?? {};
        const t = wrap("xcafAddComponent", () => this.#raw.xcafAddComponent(this.#docId, parent, shape, loc.tx ?? 0, loc.ty ?? 0, loc.tz ?? 0, loc.rx ?? 0, loc.ry ?? 0, loc.rz ?? 0));
        this.#applyOptions(t, options);
        return tag(t);
    }
    /** Set color on an existing label. */
    setColor(label, color) {
        this.#ensureOpen();
        const [r, g, b] = color;
        wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, label, r, g, b));
    }
    /** Set name on an existing label. */
    setName(label, name) {
        this.#ensureOpen();
        wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, label, name));
    }
    /**
     * Get info about a label.
     * If `shapeHandle` is non-null, the caller owns it and must release it.
     */
    getLabelInfo(label) {
        this.#ensureOpen();
        const raw = wrap("xcafGetLabelInfo", () => this.#raw.xcafGetLabelInfo(this.#docId, label));
        return {
            labelId: raw.labelId,
            name: raw.name,
            hasColor: raw.hasColor,
            color: [raw.r, raw.g, raw.b],
            isAssembly: raw.isAssembly,
            isComponent: raw.isComponent,
            shapeHandle: raw.shapeId > 0 ? raw.shapeId : null,
        };
    }
    /** Get child label tags of a parent. */
    getChildren(parent) {
        this.#ensureOpen();
        return this.#vecToTags(wrap("xcafGetChildLabels", () => this.#raw.xcafGetChildLabels(this.#docId, parent)));
    }
    /** Get root (free) shape label tags. */
    getRoots() {
        this.#ensureOpen();
        return this.#vecToTags(wrap("xcafGetRootLabels", () => this.#raw.xcafGetRootLabels(this.#docId)));
    }
    /** Export as STEP with colors and names preserved. */
    exportSTEP() {
        this.#ensureOpen();
        return wrap("xcafExportSTEP", () => this.#raw.xcafExportSTEP(this.#docId));
    }
    exportGLTF(fsOrOptions, maybeOptions) {
        this.#ensureOpen();
        // Resolve overloads: exportGLTF(fs, opts) vs exportGLTF(opts)
        let fs;
        let options;
        if (fsOrOptions && typeof fsOrOptions === "object" && "readFile" in fsOrOptions && "unlink" in fsOrOptions) {
            // Legacy: exportGLTF(fs, options?)
            fs = fsOrOptions;
            options = maybeOptions;
        }
        else {
            // New: exportGLTF(options?)
            const opts = fsOrOptions;
            fs = opts?.fs;
            options = opts;
        }
        fs ??= this.#fs;
        if (!fs) {
            throw new OcctError("xcafExportGLTF", "No Emscripten FS available. Either create the document via OcctKernel.createXCAFDocument(), or pass { fs } in options.");
        }
        const linDefl = options?.linearDeflection ?? 0.1;
        const angDefl = options?.angularDeflection ?? 0.5;
        const glbPath = wrap("xcafExportGLTF", () => this.#raw.xcafExportGLTF(this.#docId, linDefl, angDefl));
        const data = fs.readFile(glbPath);
        fs.unlink(glbPath);
        return data;
    }
    /** Close the document and free OCCT resources. */
    close() {
        if (!this.#closed) {
            this.#raw.xcafClose(this.#docId);
            this.#closed = true;
        }
    }
    [Symbol.dispose]() {
        this.close();
    }
    #applyOptions(labelId, options) {
        if (options?.name) {
            wrap("xcafSetName", () => this.#raw.xcafSetName(this.#docId, labelId, options.name));
        }
        if (options?.color) {
            const [r, g, b] = options.color;
            wrap("xcafSetColor", () => this.#raw.xcafSetColor(this.#docId, labelId, r, g, b));
        }
    }
    #vecToTags(vec) {
        try {
            const result = [];
            for (let i = 0; i < vec.size(); i++) {
                result.push(tag(vec.get(i)));
            }
            return result;
        }
        finally {
            vec.delete();
        }
    }
    #ensureOpen() {
        if (this.#closed) {
            throw new OcctError("XCAFDocument", "Document is closed", OcctErrorCode.DocumentClosed);
        }
    }
}
//# sourceMappingURL=xcaf-document.js.map