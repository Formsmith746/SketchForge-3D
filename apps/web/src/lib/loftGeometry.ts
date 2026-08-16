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

type LoftAngleAnchor = { aBottom: number; aTop: number; aKey: number };

function circularAngleDistance(a: number, b: number) {
  const TWO_PI = 2 * Math.PI;
  const d = Math.abs(a - b) % TWO_PI;
  return d > Math.PI ? TWO_PI - d : d;
}

// Best non-crossing correspondence between the two ends' corners: tries every rotational
// offset and picks the one minimizing total angular mismatch (DP over a circular subsequence
// alignment), so a bottom corner lands on the *nearest* top corner instead of wherever the same
// lab-frame angle happens to fall -- otherwise two same-cornered shapes at different rotations
// (e.g. two rectangles 25° apart) get walls that twist/bulge instead of connecting corner to
// corner. Corners that can't be paired (unequal corner counts) fall back via fallbackSmallAngle
// below. Ported from hbehrensj/loftmorph (commit d91b3df), with that fallback and buildAngles'
// per-segment wraparound (below) made independent-per-stream -- see their own comments for why.
function bestMatching(bottomCorners: number[], topCorners: number[]): LoftAngleAnchor[] {
  const swap = bottomCorners.length > topCorners.length;
  const small = swap ? topCorners : bottomCorners;
  const large = swap ? bottomCorners : topCorners;
  const m = small.length;
  const M = large.length;
  if (M === 0) return [];

  let bestCost = Infinity;
  let bestMatchOf: number[] = new Array(M).fill(-1);

  for (let r = 0; r < M; r += 1) {
    const largeR = Array.from({ length: M }, (_, k) => large[(r + k) % M]);
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(M + 1).fill(Infinity));
    const choice: number[][] = Array.from({ length: m + 1 }, () => new Array(M + 1).fill(0));
    for (let j = 0; j <= M; j += 1) dp[0][j] = 0;
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= M; j += 1) {
        let val = dp[i][j - 1];
        let c = 0;
        const distance = circularAngleDistance(small[i - 1], largeR[j - 1]);
        const matched = dp[i - 1][j - 1] + distance * distance;
        if (matched < val) {
          val = matched;
          c = 1;
        }
        dp[i][j] = val;
        choice[i][j] = c;
      }
    }
    const cost = dp[m][M];
    if (cost < bestCost) {
      const matchOfR = new Array(M).fill(-1);
      let i = m;
      let j = M;
      while (i > 0 && j > 0) {
        if (choice[i][j] === 1) {
          matchOfR[j - 1] = i - 1;
          i -= 1;
          j -= 1;
        } else {
          j -= 1;
        }
      }
      const matchOf = new Array(M).fill(-1);
      for (let k = 0; k < M; k += 1) matchOf[(r + k) % M] = matchOfR[k];
      bestCost = cost;
      bestMatchOf = matchOf;
    }
  }

  const smallAngleFor = fallbackSmallAngle(bestMatchOf, small, large);

  const anchors: LoftAngleAnchor[] = [];
  for (let k = 0; k < M; k += 1) {
    const largeAngle = large[k];
    const smallAngle = smallAngleFor(k);
    anchors.push(
      swap
        ? { aBottom: largeAngle, aTop: smallAngle, aKey: largeAngle }
        : { aBottom: smallAngle, aTop: largeAngle, aKey: largeAngle },
    );
  }
  return anchors;
}

// For a large-side corner with no match (matchOf[k] === -1, only possible when the two ends
// have different corner counts), reference implementations fall back to the large corner's own
// angle -- but copying a value from the *other* end's independent rotation frame verbatim can
// land far outside the angular range of its matched neighbors, breaking the monotonic ordering
// ringAt relies on and producing a self-crossing (non-manifold) ring. Interpolating circularly
// between the nearest matched neighbors keeps the fallback inside that range; when nothing is
// matched at all (one end has zero corners, e.g. an Oval) there are no neighbors to interpolate
// from, so every corner keeps the literal large-angle fallback, unchanged from the reference.
function fallbackSmallAngle(matchOf: number[], small: number[], large: number[]): (k: number) => number {
  const M = large.length;
  const matchedIndices: number[] = [];
  for (let k = 0; k < M; k += 1) if (matchOf[k] !== -1) matchedIndices.push(k);
  if (matchedIndices.length === 0) return (k) => large[k];

  const TWO_PI = 2 * Math.PI;
  const circularLerp = (a: number, b: number, t: number) => {
    let delta = ((b - a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    return a + delta * t;
  };

  return (k: number) => {
    if (matchOf[k] !== -1) return small[matchOf[k]];
    let prevK = -1;
    for (let step = 1; step <= M; step += 1) {
      const idx = (k - step + M) % M;
      if (matchOf[idx] !== -1) { prevK = idx; break; }
    }
    let nextK = -1;
    for (let step = 1; step <= M; step += 1) {
      const idx = (k + step) % M;
      if (matchOf[idx] !== -1) { nextK = idx; break; }
    }
    if (prevK === -1 || nextK === -1 || prevK === nextK) return small[matchOf[prevK !== -1 ? prevK : nextK]];
    const largeSpan = ((large[nextK] - large[prevK]) % TWO_PI + TWO_PI) % TWO_PI || TWO_PI;
    const largeOffset = ((large[k] - large[prevK]) % TWO_PI + TWO_PI) % TWO_PI;
    const t = largeOffset / largeSpan;
    return circularLerp(small[matchOf[prevK]], small[matchOf[nextK]], t);
  };
}

function normalizeCorners(corners: number[]): number[] {
  const TWO_PI = 2 * Math.PI;
  const sorted = corners.map((c) => ((c % TWO_PI) + TWO_PI) % TWO_PI).sort((a, b) => a - b);
  const eps = 1e-6;
  const out: number[] = [];
  for (const a of sorted) {
    if (!out.length || Math.abs(a - out[out.length - 1]) > eps) out.push(a);
  }
  if (out.length >= 2 && Math.abs(out[0] + TWO_PI - out[out.length - 1]) < eps) out.pop();
  return out;
}

// Merges both ends' corners into matched anchors (see bestMatching above), then spreads the
// remaining segments across the arcs between them (largest-remainder rounding) so every corner
// lands on a ring vertex. Each anchor -- and each interpolated in-between angle -- carries an
// independent aBottom/aTop pair, so ringAt below samples each end's own shape function at its own
// matched angle rather than a single shared lab-frame angle.
function buildAngles(bottomCorners: number[], topCorners: number[], segments: number): LoftAngleAnchor[] {
  const TWO_PI = 2 * Math.PI;
  const bc = normalizeCorners(bottomCorners);
  const tc = normalizeCorners(topCorners);
  const anchors = bestMatching(bc, tc);

  if (!anchors.length) {
    const n = Math.max(3, Math.round(segments));
    const angles: LoftAngleAnchor[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = (TWO_PI * i) / n;
      angles.push({ aBottom: a, aTop: a, aKey: a });
    }
    return angles;
  }

  const m = anchors.length;
  const total = Math.max(Math.round(segments), m);
  const fill = total - m;
  const arcs: number[] = [];
  let arcSum = 0;
  for (let i = 0; i < m; i += 1) {
    const lo = anchors[i].aKey;
    const hi = i === m - 1 ? anchors[0].aKey + TWO_PI : anchors[i + 1].aKey;
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

  // aKey (whichever of aBottom/aTop is the pre-sorted "large" side) only ever wraps at the
  // m-1 -> 0 seam, by construction. The *other* stream is an independently-matched sequence and
  // can have its own forward wrap anywhere in 0..m-1 -- e.g. the corner nearest the seam may
  // match its best partner just on the far side of 2pi. Advancing each stream by its own forward
  // (always-increasing) angular delta, per segment, keeps both streams monotonic regardless of
  // where each one's wrap actually falls, instead of assuming they share the aKey seam.
  const forwardDelta = (from: number, to: number) => (((to - from) % TWO_PI) + TWO_PI) % TWO_PI;

  const angles: LoftAngleAnchor[] = [];
  for (let i = 0; i < m; i += 1) {
    const current = anchors[i];
    const next = anchors[(i + 1) % m];
    const loB = current.aBottom;
    const hiB = loB + forwardDelta(loB, next.aBottom);
    const loT = current.aTop;
    const hiT = loT + forwardDelta(loT, next.aTop);
    angles.push({ aBottom: loB, aTop: loT, aKey: current.aKey });
    for (let k = 1; k <= base[i]; k += 1) {
      angles.push({
        aBottom: loB + ((hiB - loB) * k) / (base[i] + 1),
        aTop: loT + ((hiT - loT) * k) / (base[i] + 1),
        aKey: current.aKey,
      });
    }
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
      const [bx, bz] = shapePoint(bottomShape, angle.aBottom, bX, bY, bottomRotation);
      const [tx, tz] = shapePoint(topShape, angle.aTop, tX, tY, topRotation);
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
