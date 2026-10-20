import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type SketchSegmentPlacement = {
  point: { x: number; z: number };
  amount: number;
};

type IdFactory = (prefix: string) => string;

type SplitResult = {
  profile: SketchProfile;
  pointId: string;
  inserted: boolean;
};

const ENDPOINT_EPSILON = 1e-7;
const POINT_EPSILON = 1e-6;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerpPoint(a: { x: number; z: number }, b: { x: number; z: number }, amount: number) {
  return {
    x: a.x + (b.x - a.x) * amount,
    z: a.z + (b.z - a.z) * amount,
  };
}

function cubicPoint(
  start: { x: number; z: number },
  first: { x: number; z: number },
  second: { x: number; z: number },
  end: { x: number; z: number },
  amount: number,
) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function distanceSquared(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function isStraightSegment(segment: SketchSegment) {
  return !segment.kind || segment.kind === "line";
}

export function closestPointOnSketchSegment(
  segment: SketchSegment,
  start: SketchPoint,
  end: SketchPoint,
  target: { x: number; z: number },
): SketchSegmentPlacement {
  const first = start.handleOut;
  const second = end.handleIn;
  if (isStraightSegment(segment) || !first || !second) {
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const amount = lengthSquared > ENDPOINT_EPSILON
      ? clamp01(((target.x - start.x) * dx + (target.z - start.z) * dz) / lengthSquared)
      : 0;
    return { point: lerpPoint(start, end, amount), amount };
  }

  const samples = 64;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= samples; index += 1) {
    const amount = index / samples;
    const point = cubicPoint(start, first, second, end, amount);
    const distance = distanceSquared(point, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  let left = Math.max(0, (bestIndex - 1) / samples);
  let right = Math.min(1, (bestIndex + 1) / samples);
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const third = (right - left) / 3;
    const firstAmount = left + third;
    const secondAmount = right - third;
    const firstDistance = distanceSquared(cubicPoint(start, first, second, end, firstAmount), target);
    const secondDistance = distanceSquared(cubicPoint(start, first, second, end, secondAmount), target);
    if (firstDistance <= secondDistance) right = secondAmount;
    else left = firstAmount;
  }
  const amount = clamp01((left + right) / 2);
  return { point: cubicPoint(start, first, second, end, amount), amount };
}

export function splitSketchSegment(
  profile: SketchProfile,
  segmentId: string,
  amountValue: number,
  createId: IdFactory,
): SplitResult {
  const segment = profile.segments.find((entry) => entry.id === segmentId);
  if (!segment) return { profile, pointId: "", inserted: false };
  const start = profile.points.find((entry) => entry.id === segment.startId);
  const end = profile.points.find((entry) => entry.id === segment.endId);
  if (!start || !end) return { profile, pointId: "", inserted: false };

  const amount = clamp01(amountValue);
  if (amount <= ENDPOINT_EPSILON) return { profile, pointId: start.id, inserted: false };
  if (amount >= 1 - ENDPOINT_EPSILON) return { profile, pointId: end.id, inserted: false };

  const first = start.handleOut;
  const second = end.handleIn;
  const newPointId = createId("sketch-point");
  let point: SketchPoint;
  let nextPoints = profile.points;

  if (!isStraightSegment(segment) && first && second) {
    const a = lerpPoint(start, first, amount);
    const b = lerpPoint(first, second, amount);
    const c = lerpPoint(second, end, amount);
    const d = lerpPoint(a, b, amount);
    const e = lerpPoint(b, c, amount);
    const position = lerpPoint(d, e, amount);
    point = {
      id: newPointId,
      ...position,
      handleIn: d,
      handleOut: e,
      mode: "smooth",
    };
    nextPoints = profile.points.map((entry) => {
      if (entry.id === start.id) return { ...entry, handleOut: a };
      if (entry.id === end.id) return { ...entry, handleIn: c };
      return entry;
    });
  } else {
    point = { id: newPointId, ...lerpPoint(start, end, amount), mode: "corner" };
  }

  const secondSegmentId = createId("sketch-segment");
  return {
    profile: {
      ...profile,
      points: [...nextPoints, point],
      segments: profile.segments.flatMap((entry) => entry.id === segmentId ? [
        { ...entry, endId: point.id },
        { ...entry, id: secondSegmentId, startId: point.id },
      ] : [entry]),
    },
    pointId: point.id,
    inserted: true,
  };
}

type SegmentSplit = { amount: number; pointId: string };

function cross(ax: number, az: number, bx: number, bz: number) {
  return ax * bz - az * bx;
}

export function addLineIntersectionPoints(profile: SketchProfile, createId: IdFactory) {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const lines = profile.segments.filter((segment) => isStraightSegment(segment) && pointById.has(segment.startId) && pointById.has(segment.endId));
  const splits = new Map<string, SegmentSplit[]>();
  const addedPoints: SketchPoint[] = [];

  const pointNear = (position: { x: number; z: number }) => {
    for (const point of [...profile.points, ...addedPoints]) {
      if (Math.hypot(point.x - position.x, point.z - position.z) <= POINT_EPSILON) return point;
    }
    return null;
  };

  const addSplit = (segment: SketchSegment, amount: number, pointId: string) => {
    if (amount <= ENDPOINT_EPSILON || amount >= 1 - ENDPOINT_EPSILON) return;
    const current = splits.get(segment.id) ?? [];
    if (!current.some((entry) => entry.pointId === pointId || Math.abs(entry.amount - amount) <= ENDPOINT_EPSILON)) {
      current.push({ amount, pointId });
      splits.set(segment.id, current);
    }
  };

  for (let firstIndex = 0; firstIndex < lines.length; firstIndex += 1) {
    const firstSegment = lines[firstIndex];
    const a = pointById.get(firstSegment.startId)!;
    const b = pointById.get(firstSegment.endId)!;
    const rx = b.x - a.x;
    const rz = b.z - a.z;
    for (let secondIndex = firstIndex + 1; secondIndex < lines.length; secondIndex += 1) {
      const secondSegment = lines[secondIndex];
      if (
        firstSegment.startId === secondSegment.startId ||
        firstSegment.startId === secondSegment.endId ||
        firstSegment.endId === secondSegment.startId ||
        firstSegment.endId === secondSegment.endId
      ) continue;

      const c = pointById.get(secondSegment.startId)!;
      const d = pointById.get(secondSegment.endId)!;
      const sx = d.x - c.x;
      const sz = d.z - c.z;
      const denominator = cross(rx, rz, sx, sz);
      const denominatorTolerance = ENDPOINT_EPSILON * Math.max(1, Math.hypot(rx, rz) * Math.hypot(sx, sz));
      if (Math.abs(denominator) <= denominatorTolerance) continue;

      const qpx = c.x - a.x;
      const qpz = c.z - a.z;
      const firstAmount = cross(qpx, qpz, sx, sz) / denominator;
      const secondAmount = cross(qpx, qpz, rx, rz) / denominator;
      if (
        firstAmount < -ENDPOINT_EPSILON || firstAmount > 1 + ENDPOINT_EPSILON ||
        secondAmount < -ENDPOINT_EPSILON || secondAmount > 1 + ENDPOINT_EPSILON
      ) continue;

      const clampedFirst = clamp01(firstAmount);
      const clampedSecond = clamp01(secondAmount);
      const position = lerpPoint(a, b, clampedFirst);
      const firstEndpoint = clampedFirst <= ENDPOINT_EPSILON ? a : clampedFirst >= 1 - ENDPOINT_EPSILON ? b : null;
      const secondEndpoint = clampedSecond <= ENDPOINT_EPSILON ? c : clampedSecond >= 1 - ENDPOINT_EPSILON ? d : null;
      if (firstEndpoint && secondEndpoint) continue;

      let intersectionPoint = firstEndpoint ?? secondEndpoint ?? pointNear(position);
      if (!intersectionPoint) {
        intersectionPoint = { id: createId("sketch-point"), ...position, mode: "corner" };
        addedPoints.push(intersectionPoint);
      }
      addSplit(firstSegment, clampedFirst, intersectionPoint.id);
      addSplit(secondSegment, clampedSecond, intersectionPoint.id);
    }
  }

  if (!splits.size) return profile;

  const segments = profile.segments.flatMap((segment) => {
    const segmentSplits = splits.get(segment.id);
    if (!segmentSplits?.length) return [segment];
    const ordered = [...segmentSplits].sort((left, right) => left.amount - right.amount);
    const pointIds = [segment.startId, ...ordered.map((entry) => entry.pointId), segment.endId];
    return pointIds.slice(0, -1).map((startId, index) => ({
      ...segment,
      id: index === 0 ? segment.id : createId("sketch-segment"),
      startId,
      endId: pointIds[index + 1],
    }));
  });

  return {
    ...profile,
    points: [...profile.points, ...addedPoints],
    segments,
  };
}
