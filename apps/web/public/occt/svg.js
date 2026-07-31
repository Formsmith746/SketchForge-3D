/**
 * Multiview SVG rendering for OCCT shapes.
 *
 * Renders a shape to compact, deterministic SVG by running OCCT hidden-line
 * removal (`projectEdges`) per view, discretizing the projected edges
 * (`wireframe`), and mapping the flattened 3D points into 2D screen space.
 *
 * The default output is a 4-up Front / Top / Right / Isometric grid with
 * visible edges drawn solid and hidden edges dashed, a per-view XYZ gnomon,
 * and an overall bounding-box annotation — a layout aimed at letting an
 * automated agent reason about geometry it cannot otherwise see.
 *
 * @module
 */
const ORIGIN = { x: 0, y: 0, z: 0 };
// gp_Ax2(origin, dir, xAxis) uses Y = dir × xAxis as its vertical, so the
// screen-up axis below is computed the same way to match the HLR projection.
function basisFor(view) {
    switch (view) {
        case "front":
            return { dir: v(0, 1, 0), sx: v(1, 0, 0), sy: v(0, 0, 1) };
        case "back":
            return { dir: v(0, -1, 0), sx: v(-1, 0, 0), sy: v(0, 0, 1) };
        case "top":
            return { dir: v(0, 0, -1), sx: v(1, 0, 0), sy: v(0, 1, 0) };
        case "bottom":
            return { dir: v(0, 0, 1), sx: v(1, 0, 0), sy: v(0, -1, 0) };
        case "right":
            return { dir: v(-1, 0, 0), sx: v(0, 1, 0), sy: v(0, 0, 1) };
        case "left":
            return { dir: v(1, 0, 0), sx: v(0, -1, 0), sy: v(0, 0, 1) };
        case "iso": {
            const dir = normalize(v(-1, -1, -1));
            const sx = normalize(v(1, -1, 0));
            // Screen-up = dir × sx, oriented so world +Z reads upward.
            let sy = cross(dir, sx);
            if (sy.z < 0)
                sy = neg(sy);
            return { dir, sx, sy };
        }
    }
}
const VIEW_LABEL = {
    front: "Front",
    back: "Back",
    top: "Top",
    bottom: "Bottom",
    left: "Left",
    right: "Right",
    iso: "Iso",
};
// --- vector helpers ---------------------------------------------------------
function v(x, y, z) {
    return { x, y, z };
}
function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
function neg(a) {
    return { x: -a.x, y: -a.y, z: -a.z };
}
function normalize(a) {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}
const PROJECTION_FIELDS = [
    "visibleOutline",
    "visibleSmooth",
    "visibleSharp",
    "hiddenOutline",
    "hiddenSmooth",
    "hiddenSharp",
];
function collectEdges(kernel, shape, basis, deflection) {
    const proj = kernel.projectEdges(shape, ORIGIN, basis.dir, basis.sx);
    try {
        const toLines = (h) => {
            if (Number(h) === 0)
                return [];
            const { points, edgeGroups } = kernel.wireframe(h, deflection);
            const lines = [];
            for (let g = 0; g < edgeGroups.length; g += 3) {
                const start = edgeGroups[g];
                const count = edgeGroups[g + 1];
                const line = [];
                for (let i = 0; i < count; i += 3) {
                    const p = v(points[start + i], points[start + i + 1], points[start + i + 2]);
                    line.push(dot(p, basis.sx), dot(p, basis.sy));
                }
                if (line.length >= 4)
                    lines.push(line);
            }
            return lines;
        };
        return {
            visible: [
                ...toLines(proj.visibleOutline),
                ...toLines(proj.visibleSmooth),
                ...toLines(proj.visibleSharp),
            ],
            hidden: [
                ...toLines(proj.hiddenOutline),
                ...toLines(proj.hiddenSmooth),
                ...toLines(proj.hiddenSharp),
            ],
        };
    }
    finally {
        for (const field of PROJECTION_FIELDS) {
            const h = proj[field];
            if (Number(h) !== 0)
                kernel.release(h);
        }
    }
}
// --- SVG assembly -----------------------------------------------------------
function round(n) {
    return Math.round(n * 100) / 100;
}
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function extentOf(views) {
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const view of views) {
        for (const line of [...view.visible, ...view.hidden]) {
            for (let i = 0; i < line.length; i += 2) {
                const u = line[i];
                const vv = line[i + 1];
                if (u < minU)
                    minU = u;
                if (u > maxU)
                    maxU = u;
                if (vv < minV)
                    minV = vv;
                if (vv > maxV)
                    maxV = vv;
            }
        }
    }
    if (!Number.isFinite(minU))
        return { minU: 0, maxU: 0, minV: 0, maxV: 0 };
    return { minU, maxU, minV, maxV };
}
/**
 * Build a view→pixel mapping for one panel. All panels share `scale` (so the
 * part is the same size everywhere) but center on their own projected midpoint.
 */
function panelTransform(ext, scale, panelW, panelH, pad) {
    const midU = (ext.minU + ext.maxU) / 2;
    const midV = (ext.minV + ext.maxV) / 2;
    // Screen y is inverted (v-up → y-down); center within the panel.
    const offsetX = panelW / 2 - midU * scale;
    const offsetY = panelH / 2 + midV * scale;
    return { scale, offsetX, offsetY, inner: Math.min(panelW, panelH) - 2 * pad, panelW, panelH, pad };
}
function pathData(lines, t) {
    let d = "";
    for (const line of lines) {
        for (let i = 0; i < line.length; i += 2) {
            const x = round(line[i] * t.scale + t.offsetX);
            const y = round(-line[i + 1] * t.scale + t.offsetY);
            d += `${i === 0 ? "M" : "L"}${x} ${y}`;
        }
    }
    return d;
}
function gnomon(basis, t) {
    const len = 18;
    const ox = t.pad + len + 4;
    const oy = t.panelH - t.pad - len - 4;
    const axes = [
        [v(1, 0, 0), "#d33", "X"],
        [v(0, 1, 0), "#3a3", "Y"],
        [v(0, 0, 1), "#36c", "Z"],
    ];
    let s = "";
    for (const [axis, color, name] of axes) {
        const dx = dot(axis, basis.sx);
        const dy = -dot(axis, basis.sy);
        if (Math.hypot(dx, dy) < 0.05)
            continue; // axis points into the screen
        const ex = round(ox + dx * len);
        const ey = round(oy + dy * len);
        s += `<line x1="${round(ox)}" y1="${round(oy)}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="1.5"/>`;
        s += `<text x="${ex}" y="${ey}" font-size="9" fill="${color}" text-anchor="middle" dominant-baseline="middle">${name}</text>`;
    }
    return s;
}
function resolved(options) {
    return {
        width: options.width ?? 240,
        height: options.height ?? 240,
        padding: options.padding ?? 14,
        showHidden: options.showHidden ?? true,
        showGnomon: options.showGnomon ?? true,
        strokeWidth: options.strokeWidth ?? 1,
        background: options.background ?? "#ffffff",
        visibleColor: options.visibleColor ?? "#111111",
        hiddenColor: options.hiddenColor ?? "#9aa0a6",
    };
}
function deflectionFor(kernel, shape, options) {
    if (options.deflection !== undefined)
        return options.deflection;
    const bb = kernel.getBoundingBox(shape, false);
    const diag = Math.hypot(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin);
    return Math.max(diag * 0.002, 1e-4);
}
function panelSvg(edges, basis, t, o, label) {
    let body = `<rect x="0.5" y="0.5" width="${t.panelW - 1}" height="${t.panelH - 1}" fill="${o.background}" stroke="#e0e0e0"/>`;
    if (o.showHidden && edges.hidden.length > 0) {
        const d = pathData(edges.hidden, t);
        if (d)
            body += `<path d="${d}" fill="none" stroke="${o.hiddenColor}" stroke-width="${o.strokeWidth}" stroke-dasharray="3 2"/>`;
    }
    if (edges.visible.length > 0) {
        const d = pathData(edges.visible, t);
        if (d)
            body += `<path d="${d}" fill="none" stroke="${o.visibleColor}" stroke-width="${o.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (o.showGnomon)
        body += gnomon(basis, t);
    if (label !== null)
        body += `<text x="${t.pad}" y="${t.pad + 4}" font-size="11" fill="#333" font-family="sans-serif">${esc(label)}</text>`;
    return body;
}
/**
 * Render a single named view of `shape` to a standalone SVG string.
 */
export function renderShapeSVG(kernel, shape, view = "front", options = {}) {
    const o = resolved(options);
    const basis = basisFor(view);
    const deflection = deflectionFor(kernel, shape, options);
    const edges = collectEdges(kernel, shape, basis, deflection);
    const ext = extentOf([edges]);
    const inner = Math.min(o.width, o.height) - 2 * o.padding;
    const range = Math.max(ext.maxU - ext.minU, ext.maxV - ext.minV, 1e-9);
    const scale = inner / range;
    const t = panelTransform(ext, scale, o.width, o.height, o.padding);
    const body = panelSvg(edges, basis, t, o, null);
    return (`<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" ` +
        `viewBox="0 0 ${o.width} ${o.height}">${body}</svg>`);
}
/**
 * Render a multiview grid (default Front / Top / Right / Iso) of `shape` to a
 * single SVG string. All orthographic panels share one scale; an optional
 * footer annotates the overall X×Y×Z size.
 */
export function renderMultiviewSVG(kernel, shape, options = {}) {
    const o = resolved(options);
    const views = options.views ?? ["front", "top", "right", "iso"];
    const columns = options.columns ?? 2;
    const showLabels = options.showLabels ?? true;
    const showDimensions = options.showDimensions ?? true;
    const deflection = deflectionFor(kernel, shape, options);
    const bases = views.map(basisFor);
    const edges = bases.map((b) => collectEdges(kernel, shape, b, deflection));
    const extents = edges.map((e) => extentOf([e]));
    // One global scale so the part is sized consistently across all panels.
    const inner = Math.min(o.width, o.height) - 2 * o.padding;
    let maxRange = 1e-9;
    for (const ext of extents) {
        maxRange = Math.max(maxRange, ext.maxU - ext.minU, ext.maxV - ext.minV);
    }
    const scale = inner / maxRange;
    const rows = Math.ceil(views.length / columns);
    const footerH = showDimensions ? 22 : 0;
    const totalW = columns * o.width;
    const totalH = rows * o.height + footerH;
    let panels = "";
    for (let i = 0; i < views.length; i++) {
        const col = i % columns;
        const row = Math.floor(i / columns);
        const px = col * o.width;
        const py = row * o.height;
        const t = panelTransform(extents[i], scale, o.width, o.height, o.padding);
        const label = showLabels ? VIEW_LABEL[views[i]] : null;
        panels += `<g transform="translate(${px} ${py})">${panelSvg(edges[i], bases[i], t, o, label)}</g>`;
    }
    let footer = "";
    if (showDimensions) {
        const bb = kernel.getBoundingBox(shape, false);
        const dims = `${round(bb.xmax - bb.xmin)} × ${round(bb.ymax - bb.ymin)} × ${round(bb.zmax - bb.zmin)} (X×Y×Z)`;
        footer =
            `<text x="${totalW / 2}" y="${rows * o.height + 15}" font-size="11" fill="#444" ` +
                `font-family="sans-serif" text-anchor="middle">${esc(dims)}</text>`;
    }
    return (`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" ` +
        `viewBox="0 0 ${totalW} ${totalH}">` +
        `<rect width="${totalW}" height="${totalH}" fill="${o.background}"/>` +
        `${panels}${footer}</svg>`);
}
//# sourceMappingURL=svg.js.map