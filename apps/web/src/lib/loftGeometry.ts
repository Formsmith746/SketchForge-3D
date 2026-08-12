import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { cleanRotationDegrees } from "@/lib/workplaneShapes";
import type { LoftProfileShape, WorkplaneShape } from "@/types/sketchforge";

export const LOFT_PROFILE_SHAPES: LoftProfileShape[] = ["Oval", "Rectangle", "Triangle", "Pentagon", "Hexagon"];
export const DEFAULT_LOFT_BOTTOM_SHAPE: LoftProfileShape = "Rectangle";
export const DEFAULT_LOFT_TOP_SHAPE: LoftProfileShape = "Oval";
export const DEFAULT_LOFT_ROTATION = 0;
export const DEFAULT_LOFT_SEGMENTS = 40;
export const DEFAULT_LOFT_LAYERS = 24;
export const MIN_LOFT_SEGMENTS = 8;
export const MAX_LOFT_SEGMENTS = 128;
export const MIN_LOFT_LAYERS = 2;
export const MAX_LOFT_LAYERS = 80;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeLoftShape(value?: string, fallback: LoftProfileShape = DEFAULT_LOFT_BOTTOM_SHAPE): LoftProfileShape {
  return (LOFT_PROFILE_SHAPES as string[]).includes(value ?? "") ? (value as LoftProfileShape) : fallback;
}

export function normalizeLoftRotation(value?: number) {
  return cleanRotationDegrees(Number.isFinite(value) ? (value as number) : DEFAULT_LOFT_ROTATION);
}

export function normalizeLoftSegments(value?: number) {
  return clamp(Math.round(Number.isFinite(value) ? (value as number) : DEFAULT_LOFT_SEGMENTS), MIN_LOFT_SEGMENTS, MAX_LOFT_SEGMENTS);
}

export function normalizeLoftLayers(value?: number) {
  return clamp(Math.round(Number.isFinite(value) ? (value as number) : DEFAULT_LOFT_LAYERS), MIN_LOFT_LAYERS, MAX_LOFT_LAYERS);
}

export function isPolygonLoftShape(kind: LoftProfileShape) {
  return kind === "Triangle" || kind === "Pentagon" || kind === "Hexagon";
}

export function normalizeLoftTopSize(value: number | undefined, fallback: number) {
  return Math.max(0.01, Number.isFinite(value) ? (value as number) : fallback);
}

export function loftSettings(shape: Pick<WorkplaneShape,
  | "loftBottomShape"
  | "loftTopShape"
  | "loftBottomRotation"
  | "loftTopRotation"
  | "loftSegments"
  | "loftLayers"
>) {
  return {
    bottomShape: normalizeLoftShape(shape.loftBottomShape, DEFAULT_LOFT_BOTTOM_SHAPE),
    topShape: normalizeLoftShape(shape.loftTopShape, DEFAULT_LOFT_TOP_SHAPE),
    bottomRotation: normalizeLoftRotation(shape.loftBottomRotation),
    topRotation: normalizeLoftRotation(shape.loftTopRotation),
    segments: normalizeLoftSegments(shape.loftSegments),
    layers: normalizeLoftLayers(shape.loftLayers),
  };
}

// Math ported from https://github.com/hbehrensj/loftmorph. This app is Y-up and the reference is
// Z-up, so in-plane (x, y) maps to (x, height, z) -- an axis swap that flips winding, so faces
// below are wound opposite the reference to keep outward normals for the Manifold CSG pipeline.
//
// Triangle/Pentagon are centered on their true circumcenter (origin), not their bounding box --
// an equilateral triangle's apex is farther from center than its base, same as a real triangle.
// Don't "fix" that by recentring the bbox: it moves the circumcenter off-origin, so rotation then
// orbits the whole shape around a point that isn't its own center instead of spinning in place.
const NGON_SIDES: Record<string, number> = { Triangle: 3, Pentagon: 5, Hexagon: 6 };

function smootherstep(t: number) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function rot2(x: number, y: number, r: number): [number, number] {
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

function basePoint(kind: LoftProfileShape, angle: number, halfX: number, halfY: number): [number, number] {
  if (kind === "Oval") return [halfX * Math.cos(angle), halfY * Math.sin(angle)];
  if (kind === "Rectangle") {
    const c = Math.cos(angle);
    const d = Math.sin(angle);
    const m = Math.max(Math.abs(c) / halfX, Math.abs(d) / halfY);
    return [c / m, d / m];
  }
  const sides = NGON_SIDES[kind];
  const radius = halfX; // halfY is intentionally unused -- polygon ends use circumradius only.
  const apothem = radius * Math.cos(Math.PI / sides);
  const step = (2 * Math.PI) / sides;
  const alpha0 = Math.PI / 2 + Math.PI / sides;
  let offset = angle - alpha0;
  offset = (((offset + Math.PI / sides) % step) + step) % step - Math.PI / sides;
  const r = apothem / Math.cos(offset);
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

function baseCorners(kind: LoftProfileShape, halfX: number, halfY: number): number[] {
  if (kind === "Oval") return [];
  if (kind === "Rectangle") {
    const a0 = Math.atan2(halfY, halfX);
    return [a0, Math.PI - a0, Math.PI + a0, 2 * Math.PI - a0];
  }
  const sides = NGON_SIDES[kind];
  const corners: number[] = [];
  for (let k = 0; k < sides; k += 1) corners.push(Math.PI / 2 + (2 * Math.PI * k) / sides);
  return corners;
}

function shapePoint(kind: LoftProfileShape, angle: number, halfX: number, halfY: number, rotation: number): [number, number] {
  const [x, y] = basePoint(kind, angle - rotation, halfX, halfY);
  return rot2(x, y, rotation);
}

function shapeCorners(kind: LoftProfileShape, halfX: number, halfY: number, rotation: number): number[] {
  return baseCorners(kind, halfX, halfY).map((c) => c + rotation);
}

// Merges both ends' corner angles into anchors, then spreads the remaining segments across the
// arcs between them (largest-remainder rounding) so every corner lands on a ring vertex.
function buildAngles(bottomCorners: number[], topCorners: number[], segments: number): number[] {
  const TWO_PI = 2 * Math.PI;
  const raw = bottomCorners
    .concat(topCorners)
    .map((c) => ((c % TWO_PI) + TWO_PI) % TWO_PI)
    .sort((a, b) => a - b);
  const eps = 1e-6;
  const anchors: number[] = [];
  for (const a of raw) {
    if (!anchors.length || Math.abs(a - anchors[anchors.length - 1]) > eps) anchors.push(a);
  }
  if (anchors.length >= 2 && Math.abs(anchors[0] + TWO_PI - anchors[anchors.length - 1]) < eps) anchors.pop();

  if (!anchors.length) {
    const n = Math.max(3, Math.round(segments));
    const angles: number[] = [];
    for (let i = 0; i < n; i += 1) angles.push((TWO_PI * i) / n);
    return angles;
  }

  const m = anchors.length;
  const total = Math.max(Math.round(segments), m);
  const fill = total - m;
  const arcs: number[] = [];
  let arcSum = 0;
  for (let i = 0; i < m; i += 1) {
    const lo = anchors[i];
    const hi = i === m - 1 ? anchors[0] + TWO_PI : anchors[i + 1];
    arcs.push(hi - lo);
    arcSum += hi - lo;
  }
  const base: number[] = [];
  const frac: number[] = [];
  let used = 0;
  for (let i = 0; i < m; i += 1) {
    const exact = (fill * arcs[i]) / arcSum;
    const floor = Math.floor(exact);
    base.push(floor);
    frac.push(exact - floor);
    used += floor;
  }
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => frac[b] - frac[a]);
  for (let i = 0; i < fill - used; i += 1) base[order[i]] += 1;

  const angles: number[] = [];
  for (let i = 0; i < m; i += 1) {
    const lo = anchors[i];
    const hi = i === m - 1 ? anchors[0] + TWO_PI : anchors[i + 1];
    angles.push(lo);
    for (let k = 1; k <= base[i]; k += 1) angles.push(lo + ((hi - lo) * k) / (base[i] + 1));
  }
  return angles;
}

type LoftGeometryOptions = {
  width: number;
  depth: number;
  height: number;
  bottomShape?: LoftProfileShape;
  topShape?: LoftProfileShape;
  topWidth?: number;
  topDepth?: number;
  bottomRotation?: number;
  topRotation?: number;
  segments?: number;
  layers?: number;
};

export function createLoftGeometry({
  width,
  depth,
  height,
  bottomShape: requestedBottomShape,
  topShape: requestedTopShape,
  topWidth: requestedTopWidth,
  topDepth: requestedTopDepth,
  bottomRotation: requestedBottomRotation,
  topRotation: requestedTopRotation,
  segments: requestedSegments,
  layers: requestedLayers,
}: LoftGeometryOptions): THREE.BufferGeometry {
  const safeWidth = Math.max(0.01, width);
  const safeDepth = Math.max(0.01, depth);
  const safeHeight = Math.max(0.01, height);
  const bottomShape = normalizeLoftShape(requestedBottomShape, DEFAULT_LOFT_BOTTOM_SHAPE);
  const topShape = normalizeLoftShape(requestedTopShape, DEFAULT_LOFT_TOP_SHAPE);
  const bottomRotation = THREE.MathUtils.degToRad(normalizeLoftRotation(requestedBottomRotation));
  const topRotation = THREE.MathUtils.degToRad(normalizeLoftRotation(requestedTopRotation));
  const segments = normalizeLoftSegments(requestedSegments);
  const layers = normalizeLoftLayers(requestedLayers);

  const bX = Math.max(0.001, safeWidth / 2);
  const bY = Math.max(0.001, safeDepth / 2);
  const tX = Math.max(0.001, normalizeLoftTopSize(requestedTopWidth, safeWidth) / 2);
  const tY = Math.max(0.001, normalizeLoftTopSize(requestedTopDepth, safeDepth) / 2);

  const bottomCorners = shapeCorners(bottomShape, bX, bY, bottomRotation);
  const topCorners = shapeCorners(topShape, tX, tY, topRotation);
  const angles = buildAngles(bottomCorners, topCorners, segments);
  const segmentCount = angles.length;

  const positions: number[] = [];
  const indices: number[] = [];
  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };

  const ringAt = (u: number) => {
    const blend = smootherstep(u);
    const y = safeHeight * u;
    const ring: number[] = [];
    for (const angle of angles) {
      const [bx, bz] = shapePoint(bottomShape, angle, bX, bY, bottomRotation);
      const [tx, tz] = shapePoint(topShape, angle, tX, tY, topRotation);
      ring.push(push(bx * (1 - blend) + tx * blend, y, bz * (1 - blend) + tz * blend));
    }
    return ring;
  };

  const grid: number[][] = [];
  for (let layer = 0; layer <= layers; layer += 1) grid.push(ringAt(layer / layers));

  for (let layer = 0; layer < layers; layer += 1) {
    for (let i = 0; i < segmentCount; i += 1) {
      const j = (i + 1) % segmentCount;
      const a = grid[layer][i];
      const b = grid[layer][j];
      const c = grid[layer + 1][j];
      const d = grid[layer + 1][i];
      indices.push(a, d, b, b, d, c);
    }
  }

  const bottomRing = ringAt(0);
  const bottomCenter = push(0, 0, 0);
  for (let i = 0; i < segmentCount; i += 1) {
    const j = (i + 1) % segmentCount;
    indices.push(bottomCenter, bottomRing[i], bottomRing[j]);
  }

  const topRing = ringAt(1);
  const topCenter = push(0, safeHeight, 0);
  for (let i = 0; i < segmentCount; i += 1) {
    const j = (i + 1) % segmentCount;
    indices.push(topCenter, topRing[j], topRing[i]);
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const geometry = toCreasedNormals(indexed, THREE.MathUtils.degToRad(15));
  indexed.dispose();
  geometry.computeBoundingBox();
  return geometry;
}
