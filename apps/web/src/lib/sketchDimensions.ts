import type { SketchDimensionAnchor, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type SketchDimensionAnchorCandidate = {
  id: string;
  anchor: SketchDimensionAnchor;
  kind: SketchDimensionAnchor["kind"];
  label: string;
  x: number;
  z: number;
};

function pointById(profile: SketchProfile, id: string) {
  return profile.points.find((point) => point.id === id) ?? null;
}

function cubicPoint(start: SketchPoint, first: { x: number; z: number }, second: { x: number; z: number }, end: SketchPoint, amount: number) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function segmentSamples(profile: SketchProfile, segment: SketchSegment, divisions = 24) {
  const start = pointById(profile, segment.startId);
  const end = pointById(profile, segment.endId);
  if (!start || !end) return [];
  const first = start.handleOut;
  const second = end.handleIn;
  if (segment.kind === "line" || !first || !second) return [start, end];
  return Array.from({ length: divisions + 1 }, (_, index) => cubicPoint(start, first, second, end, index / divisions));
}

function segmentMidpoint(profile: SketchProfile, segment: SketchSegment) {
  const start = pointById(profile, segment.startId);
  const end = pointById(profile, segment.endId);
  if (!start || !end) return null;
  const first = start.handleOut;
  const second = end.handleIn;
  return segment.kind !== "line" && first && second
    ? cubicPoint(start, first, second, end, 0.5)
    : { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
}

function lineIntersection(
  firstStart: { x: number; z: number },
  firstEnd: { x: number; z: number },
  secondStart: { x: number; z: number },
  secondEnd: { x: number; z: number },
) {
  const firstX = firstEnd.x - firstStart.x;
  const firstZ = firstEnd.z - firstStart.z;
  const secondX = secondEnd.x - secondStart.x;
  const secondZ = secondEnd.z - secondStart.z;
  const denominator = firstX * secondZ - firstZ * secondX;
  if (Math.abs(denominator) <= 1e-10) return null;
  const offsetX = secondStart.x - firstStart.x;
  const offsetZ = secondStart.z - firstStart.z;
  const firstAmount = (offsetX * secondZ - offsetZ * secondX) / denominator;
  const secondAmount = (offsetX * firstZ - offsetZ * firstX) / denominator;
  if (firstAmount < -1e-8 || firstAmount > 1 + 1e-8 || secondAmount < -1e-8 || secondAmount > 1 + 1e-8) return null;
  return { x: firstStart.x + firstX * firstAmount, z: firstStart.z + firstZ * firstAmount };
}

export function sketchSegmentIntersections(profile: SketchProfile, firstSegmentId: string, secondSegmentId: string) {
  const first = profile.segments.find((segment) => segment.id === firstSegmentId);
  const second = profile.segments.find((segment) => segment.id === secondSegmentId);
  if (!first || !second || first.id === second.id) return [];
  const firstSamples = segmentSamples(profile, first);
  const secondSamples = segmentSamples(profile, second);
  const intersections: Array<{ x: number; z: number }> = [];
  for (let firstIndex = 0; firstIndex < firstSamples.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < secondSamples.length - 1; secondIndex += 1) {
      const point = lineIntersection(firstSamples[firstIndex], firstSamples[firstIndex + 1], secondSamples[secondIndex], secondSamples[secondIndex + 1]);
      if (point && !intersections.some((entry) => Math.hypot(entry.x - point.x, entry.z - point.z) <= 1e-5)) intersections.push(point);
    }
  }
  return intersections.sort((a, b) => a.x - b.x || a.z - b.z);
}

export function sketchDimensionAnchorKey(anchor: SketchDimensionAnchor) {
  if (anchor.kind === "point") return `point:${anchor.pointId}`;
  if (anchor.kind === "midpoint") return `midpoint:${anchor.segmentId}`;
  const segmentIds = [anchor.firstSegmentId, anchor.secondSegmentId].sort();
  return `intersection:${segmentIds[0]}:${segmentIds[1]}:${anchor.index}`;
}

export function sketchDimensionAnchorPoint(profile: SketchProfile, anchor: SketchDimensionAnchor) {
  if (anchor.kind === "point") {
    const point = pointById(profile, anchor.pointId);
    return point ? { x: point.x, z: point.z } : null;
  }
  if (anchor.kind === "midpoint") {
    const segment = profile.segments.find((entry) => entry.id === anchor.segmentId);
    return segment ? segmentMidpoint(profile, segment) : null;
  }
  return sketchSegmentIntersections(profile, anchor.firstSegmentId, anchor.secondSegmentId)[anchor.index] ?? null;
}

export function sketchDimensionAnchorCandidates(profile: SketchProfile): SketchDimensionAnchorCandidate[] {
  const points: SketchDimensionAnchorCandidate[] = profile.points.map((point) => ({
    id: `point:${point.id}`,
    anchor: { kind: "point", pointId: point.id },
    kind: "point",
    label: "Endpoint",
    x: point.x,
    z: point.z,
  }));
  const midpoints: SketchDimensionAnchorCandidate[] = [];
  profile.segments.forEach((segment) => {
    const midpoint = segmentMidpoint(profile, segment);
    if (midpoint) midpoints.push({
      id: `midpoint:${segment.id}`,
      anchor: { kind: "midpoint", segmentId: segment.id },
      kind: "midpoint",
      label: "Midpoint",
      ...midpoint,
    });
  });
  const intersections: SketchDimensionAnchorCandidate[] = [];
  for (let firstIndex = 0; firstIndex < profile.segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < profile.segments.length; secondIndex += 1) {
      const first = profile.segments[firstIndex];
      const second = profile.segments[secondIndex];
      const segmentIds = [first.id, second.id].sort();
      sketchSegmentIntersections(profile, segmentIds[0], segmentIds[1]).forEach((point, index) => intersections.push({
        id: `intersection:${segmentIds[0]}:${segmentIds[1]}:${index}`,
        anchor: { kind: "intersection", firstSegmentId: segmentIds[0], secondSegmentId: segmentIds[1], index },
        kind: "intersection",
        label: "Intersection",
        ...point,
      }));
    }
  }
  const candidates = [...points, ...intersections, ...midpoints];
  return candidates.filter((candidate, index) => !candidates.some((earlier, earlierIndex) => earlierIndex < index
    && Math.hypot(earlier.x - candidate.x, earlier.z - candidate.z) <= 1e-6));
}

export function sketchDistanceDimensionValue(profile: SketchProfile, start: SketchDimensionAnchor, end: SketchDimensionAnchor) {
  const first = sketchDimensionAnchorPoint(profile, start);
  const second = sketchDimensionAnchorPoint(profile, end);
  return first && second ? Math.hypot(second.x - first.x, second.z - first.z) : null;
}
