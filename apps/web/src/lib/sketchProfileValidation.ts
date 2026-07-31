export type SketchOutlinePoint = Readonly<{ x: number; y: number }>;

export type SketchOutlineIntersection = {
  outlineA: number;
  edgeA: number;
  outlineB: number;
  edgeB: number;
};

function distanceSquared(a: SketchOutlinePoint, b: SketchOutlinePoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalizedOutline(points: readonly SketchOutlinePoint[], epsilon: number) {
  const epsilonSquared = epsilon * epsilon;
  const result: SketchOutlinePoint[] = [];
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (!result.length || distanceSquared(result[result.length - 1], point) > epsilonSquared) result.push(point);
  });
  if (result.length > 1 && distanceSquared(result[0], result[result.length - 1]) <= epsilonSquared) result.pop();
  return result;
}

function orientation(a: SketchOutlinePoint, b: SketchOutlinePoint, c: SketchOutlinePoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: SketchOutlinePoint, start: SketchOutlinePoint, end: SketchOutlinePoint, epsilon: number) {
  if (Math.abs(orientation(start, end, point)) > epsilon) return false;
  return point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function segmentsIntersect(
  a: SketchOutlinePoint,
  b: SketchOutlinePoint,
  c: SketchOutlinePoint,
  d: SketchOutlinePoint,
  epsilon: number,
) {
  if (Math.max(a.x, b.x) + epsilon < Math.min(c.x, d.x)
    || Math.max(c.x, d.x) + epsilon < Math.min(a.x, b.x)
    || Math.max(a.y, b.y) + epsilon < Math.min(c.y, d.y)
    || Math.max(c.y, d.y) + epsilon < Math.min(a.y, b.y)) {
    return false;
  }

  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const crossesAB = (abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon);
  const crossesCD = (cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon);
  if (crossesAB && crossesCD) return true;

  return (Math.abs(abC) <= epsilon && pointOnSegment(c, a, b, epsilon))
    || (Math.abs(abD) <= epsilon && pointOnSegment(d, a, b, epsilon))
    || (Math.abs(cdA) <= epsilon && pointOnSegment(a, c, d, epsilon))
    || (Math.abs(cdB) <= epsilon && pointOnSegment(b, c, d, epsilon));
}

function outlineEpsilon(outlines: readonly (readonly SketchOutlinePoint[])[]) {
  const points = outlines.flatMap((outline) => [...outline]);
  if (!points.length) return 1e-8;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return Math.max(1e-8, Math.hypot(maxX - minX, maxY - minY) * 1e-8);
}

function adjacentEdges(first: number, second: number, edgeCount: number) {
  return first === second
    || Math.abs(first - second) === 1
    || (first === 0 && second === edgeCount - 1)
    || (second === 0 && first === edgeCount - 1);
}

/**
 * Finds crossings that make closed sketch contours unsafe to triangulate.
 * Adjacent edges may share their intended endpoint; all other touching,
 * crossing, or overlapping edges are rejected.
 */
export function findSketchOutlineIntersection(outlines: readonly (readonly SketchOutlinePoint[])[]): SketchOutlineIntersection | null {
  const epsilon = outlineEpsilon(outlines);
  const clean = outlines.map((outline) => normalizedOutline(outline, epsilon));

  for (let outlineA = 0; outlineA < clean.length; outlineA += 1) {
    const a = clean[outlineA];
    if (a.length < 3) continue;
    for (let edgeA = 0; edgeA < a.length; edgeA += 1) {
      const aStart = a[edgeA];
      const aEnd = a[(edgeA + 1) % a.length];
      for (let outlineB = outlineA; outlineB < clean.length; outlineB += 1) {
        const b = clean[outlineB];
        if (b.length < 3) continue;
        const firstEdgeB = outlineA === outlineB ? edgeA + 1 : 0;
        for (let edgeB = firstEdgeB; edgeB < b.length; edgeB += 1) {
          if (outlineA === outlineB && adjacentEdges(edgeA, edgeB, a.length)) continue;
          const bStart = b[edgeB];
          const bEnd = b[(edgeB + 1) % b.length];
          if (segmentsIntersect(aStart, aEnd, bStart, bEnd, epsilon)) {
            return { outlineA, edgeA, outlineB, edgeB };
          }
        }
      }
    }
  }
  return null;
}
