import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  MAX_SVG_GEOMETRY_ELEMENTS,
  analyzeTriangleSoup,
  buildSvgExtrusionFromPaths,
  normalizeSvgDocumentType,
  normalizeSvgUseReferences,
  validateClosedSolidTriangleSoup,
  validateSvgSourcePreflight,
} from "@/lib/svgImport";

function shapePath(points: Array<[number, number]>, options: { closed?: boolean; fill?: string; fillOpacity?: number; opacity?: number; stroke?: string; strokeOpacity?: number; strokeWidth?: number } = {}) {
  const path = new THREE.ShapePath();
  path.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) path.lineTo(x, y);
  if (options.closed !== false) path.currentPath!.autoClose = true;
  (path as THREE.ShapePath & { userData: unknown }).userData = {
    style: {
      fill: options.fill ?? "#000",
      fillOpacity: options.fillOpacity ?? 1,
      opacity: options.opacity ?? 1,
      stroke: options.stroke,
      strokeOpacity: options.strokeOpacity ?? 1,
      strokeWidth: options.strokeWidth ?? 1,
      visibility: "visible",
    },
  };
  return path;
}

function rectangle(x: number, y: number, width: number, height: number, options?: Parameters<typeof shapePath>[1]) {
  return shapePath(
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    options,
  );
}

function geometryPositions(geometry: THREE.BufferGeometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const attribute = nonIndexed.getAttribute("position");
  const positions: number[] = [];
  for (let index = 0; index < attribute.count; index += 1) {
    positions.push(attribute.getX(index), attribute.getY(index), attribute.getZ(index));
  }
  if (nonIndexed !== geometry) nonIndexed.dispose();
  geometry.dispose();
  return positions;
}

describe("SVG source preflight", () => {
  it("accepts and removes the standard SVG 1.1 document type", () => {
    const source = `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
  "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"/>`;
    expect(() => validateSvgSourcePreflight(source)).not.toThrow();
    expect(normalizeSvgDocumentType(source)).not.toMatch(/<!DOCTYPE/i);
  });

  it("continues to reject XML entities, non-SVG doctypes, and external references", () => {
    expect(() => validateSvgSourcePreflight('<!DOCTYPE svg [<!ENTITY x "bad">]><svg/>')).toThrow(/entities/i);
    expect(() => validateSvgSourcePreflight('<!DOCTYPE html><svg/>')).toThrow(/only the standard SVG 1\.1 document type/i);
    expect(() => validateSvgSourcePreflight('<svg><use href="https://example.com/art.svg#part"/></svg>')).toThrow(/external references/i);
  });

  it("reports malformed Tinkercad cross-section geometry", () => {
    expect(() => validateSvgSourcePreflight('<svg width="NaNmm" viewBox="NaN NaN NaN NaN"><path d="z"/></svg>')).toThrow(/workplane intersects the model/i);
  });

  it("rejects excessive geometry before SVGLoader runs", () => {
    const source = `<svg>${"<rect width='1' height='1'/>".repeat(MAX_SVG_GEOMETRY_ELEMENTS + 1)}</svg>`;
    expect(() => validateSvgSourcePreflight(source)).toThrow(/too many geometry elements/i);
  });

  it("normalizes modern local use href attributes for SVGLoader", () => {
    const normalized = normalizeSvgUseReferences('<svg><defs><path id="p" d="M0 0L1 0L1 1Z"/></defs><use href="#p"/></svg>');
    expect(normalized).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(normalized).toContain('xlink:href="#p"');
  });
});

describe("SVG path extrusion", () => {
  it("creates a watertight solid with real, unclamped dimensions", () => {
    const result = buildSvgExtrusionFromPaths([rectangle(0, 0, 0.25, 0.5)]);
    expect(result.analysis.width).toBeCloseTo(0.25);
    expect(result.analysis.height).toBeCloseTo(4);
    expect(result.analysis.depth).toBeCloseTo(0.5);
    expect(result.analysis.volume).toBeCloseTo(0.5);
    expect(result.analysis.boundaryEdges).toBe(0);
    expect(result.analysis.nonManifoldEdges).toBe(0);
  });

  it("treats a separately defined contained contour as a hole", () => {
    const result = buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10), rectangle(3, 3, 4, 4)]);
    expect(result.analysis.volume).toBeCloseTo((100 - 16) * 4, 5);
    expect(result.analysis.boundaryEdges).toBe(0);
  });

  it("ignores non-filled and fully transparent paths", () => {
    expect(() => buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10, { fill: "none" })])).toThrow(/no readable visible/i);
    expect(() => buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10, { opacity: 0 })])).toThrow(/no readable visible/i);
    expect(() => buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10, { fillOpacity: 0 })])).toThrow(/no readable visible/i);
    expect(() => buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10, { fill: "#00000000" })])).toThrow(/no readable visible/i);
  });

  it("imports a closed Tinkercad-style stroke as an extrusion profile", () => {
    const tinkercadOutline = shapePath([[0, 0], [10, 0], [10, 6], [0, 6], [0, 0]], {
      closed: false,
      fill: "none",
      stroke: "rgb(255,0,0)",
      strokeWidth: 0.001,
    });
    const result = buildSvgExtrusionFromPaths([tinkercadOutline]);
    expect(result.analysis.width).toBeCloseTo(10);
    expect(result.analysis.depth).toBeCloseTo(6);
    expect(result.analysis.volume).toBeCloseTo(240);
  });

  it("explains how to fix an open stroke-only SVG", () => {
    const openStroke = shapePath([[0, 0], [10, 0], [5, 5]], { closed: false, fill: "none", stroke: "#000", strokeWidth: 1 });
    expect(() => buildSvgExtrusionFromPaths([openStroke])).toThrow(/only open strokes/i);
  });

  it("imports open filled contours when they enclose usable area and skips lines", () => {
    const result = buildSvgExtrusionFromPaths([shapePath([[0, 0], [10, 0], [5, 5]], { closed: false })]);
    expect(result.analysis.volume).toBeCloseTo(100);
    expect(() => buildSvgExtrusionFromPaths([shapePath([[0, 0], [10, 0]], { closed: false })])).toThrow(/no (?:readable )?filled (?:paths|contours)/i);
  });

  it("skips closed collinear paths", () => {
    expect(() => buildSvgExtrusionFromPaths([shapePath([[0, 0], [5, 0], [10, 0]])])).toThrow(/no readable filled paths/i);
  });

  it("imports overlapping contours as separate valid components", () => {
    const result = buildSvgExtrusionFromPaths([rectangle(0, 0, 10, 10), rectangle(5, 5, 10, 10)]);
    expect(result.analysis.volume).toBeCloseTo(800);
  });
});

describe("triangle-soup solid validation", () => {
  it("accepts a closed box", () => {
    const positions = geometryPositions(new THREE.BoxGeometry(2, 3, 4));
    const analysis = validateClosedSolidTriangleSoup(positions);
    expect(analysis.volume).toBeCloseTo(24);
    expect(analysis.boundaryEdges).toBe(0);
    expect(analysis.nonManifoldEdges).toBe(0);
  });

  it("rejects an open box shell", () => {
    const positions = geometryPositions(new THREE.BoxGeometry(2, 3, 4)).slice(9);
    expect(analyzeTriangleSoup(positions).boundaryEdges).toBeGreaterThan(0);
    expect(() => validateClosedSolidTriangleSoup(positions)).toThrow(/not a watertight manifold/i);
  });

  it("rejects a topologically closed zero-volume shell", () => {
    const positions = [
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      0, 0, 0, 0, 1, 0, 1, 0, 0,
    ];
    const analysis = analyzeTriangleSoup(positions);
    expect(analysis.boundaryEdges).toBe(0);
    expect(analysis.volume).toBe(0);
    expect(() => validateClosedSolidTriangleSoup(positions)).toThrow(/non-zero volume/i);
  });
});
