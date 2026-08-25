import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

type Point2D = { x: number; z: number };
type IdFactory = (prefix: string) => string;

export type SketchOffsetOptions = {
  includeConnected?: boolean;
  createId?: IdFactory;
};

export type SketchOffsetResult = {
  profile: SketchProfile;
  pointIds: string[];
  segmentIds: string[];
  closed: boolean;
};

type PathStep = {
  segment: SketchSegment;
  from: SketchPoint;
  to: SketchPoint;
};

const GEOMETRY_EPSILON = 1e-9;
const MITER_LIMIT = 8;
const MAX_BEZIER_DEPTH = 14;

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function distance(left: Point2D, right: Point2D) {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function cross(left: Point2D, right: Point2D) {
  return left.x * right.z - left.z * right.x;
}

function subtract(left: Point2D, right: Point2D): Point2D {
  return { x: left.x - right.x, z: left.z - right.z };
}

function signedArea(points: readonly Point2D[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.z - next.x * points[index].z;
  }
  return area / 2;
}

function resolvePath(
  profile: SketchProfile,
  selectedSegmentIds: readonly string[],
  includeConnected: boolean,
): { steps: PathStep[]; closed: boolean } {
  if (selectedSegmentIds.length === 0) throw new Error("Select at least one sketch segment to offset");

  const pointById = new Map<string, SketchPoint>();
  for (const point of profile.points) {
    if (pointById.has(point.id)) throw new Error(`Invalid sketch topology: duplicate point ID ${point.id}`);
    pointById.set(point.id, point);
  }

  const segmentById = new Map<string, SketchSegment>();
  const allIncident = new Map<string, SketchSegment[]>();
  for (const segment of profile.segments) {
    if (segmentById.has(segment.id)) throw new Error(`Invalid sketch topology: duplicate segment ID ${segment.id}`);
    segmentById.set(segment.id, segment);
    for (const pointId of new Set([segment.startId, segment.endId])) {
      const incident = allIncident.get(pointId) ?? [];
      incident.push(segment);
      allIncident.set(pointId, incident);
    }
  }

  const selectedIds = new Set(selectedSegmentIds);
  for (const id of selectedIds) {
    if (!segmentById.has(id)) throw new Error(`Invalid sketch segment reference: ${id}`);
  }

  let pathIds = selectedIds;
  if (includeConnected) {
    pathIds = new Set<string>();
    const queue = [segmentById.get(selectedIds.values().next().value as string)!];
    while (queue.length > 0) {
      const segment = queue.pop()!;
      if (pathIds.has(segment.id)) continue;
      pathIds.add(segment.id);
      for (const pointId of [segment.startId, segment.endId]) {
        for (const connected of allIncident.get(pointId) ?? []) {
          if (!pathIds.has(connected.id)) queue.push(connected);
        }
      }
    }
    if ([...selectedIds].some((id) => !pathIds.has(id))) {
      throw new Error("Selected sketch segments are disconnected");
    }
  }

  const adjacency = new Map<string, SketchSegment[]>();
  for (const id of pathIds) {
    const segment = segmentById.get(id)!;
    const start = pointById.get(segment.startId);
    const end = pointById.get(segment.endId);
    if (!start || !end) throw new Error(`Invalid point reference in sketch segment ${segment.id}`);
    if (![start.x, start.z, end.x, end.z].every(Number.isFinite)) {
      throw new Error(`Invalid point coordinates in sketch segment ${segment.id}`);
    }
    if (segment.startId === segment.endId || distance(start, end) <= GEOMETRY_EPSILON) {
      throw new Error(`Zero-length sketch topology at segment ${segment.id}`);
    }
    adjacency.set(segment.startId, [...(adjacency.get(segment.startId) ?? []), segment]);
    adjacency.set(segment.endId, [...(adjacency.get(segment.endId) ?? []), segment]);
  }

  for (const [pointId, incident] of adjacency) {
    if (incident.length > 2) throw new Error(`Sketch offset path branches at point ${pointId}`);
  }

  const endpoints = [...adjacency].filter(([, incident]) => incident.length === 1).map(([id]) => id).sort(compareIds);
  const closed = endpoints.length === 0;
  if ((!closed && endpoints.length !== 2) || (closed && pathIds.size < 3)) {
    throw new Error("Selected sketch segments do not form one non-branching path");
  }

  const startId = closed ? [...adjacency.keys()].sort(compareIds)[0] : endpoints[0];
  const used = new Set<string>();
  const steps: PathStep[] = [];
  let currentId = startId;
  while (used.size < pathIds.size) {
    const next = (adjacency.get(currentId) ?? [])
      .filter((segment) => !used.has(segment.id))
      .sort((left, right) => compareIds(left.id, right.id))[0];
    if (!next) throw new Error("Selected sketch segments are disconnected");
    const nextId = next.startId === currentId ? next.endId : next.startId;
    steps.push({ segment: next, from: pointById.get(currentId)!, to: pointById.get(nextId)! });
    used.add(next.id);
    currentId = nextId;
  }
  if ((closed && currentId !== startId) || (!closed && currentId === startId)) {
    throw new Error("Selected sketch segments do not form one non-branching path");
  }
  return { steps, closed };
}

function pointLineDistance(point: Point2D, start: Point2D, end: Point2D) {
  const chord = subtract(end, start);
  const length = Math.hypot(chord.x, chord.z);
  if (length <= GEOMETRY_EPSILON) return distance(point, start);
  return Math.abs(cross(subtract(point, start), chord)) / length;
}

function flattenCubic(
  start: Point2D,
  first: Point2D,
  second: Point2D,
  end: Point2D,
  tolerance: number,
  result: Point2D[],
  depth = 0,
) {
  const controlLength = distance(start, first) + distance(first, second) + distance(second, end);
  const flatness = Math.max(
    pointLineDistance(first, start, end),
    pointLineDistance(second, start, end),
    controlLength - distance(start, end),
  );
  if (flatness <= tolerance || depth >= MAX_BEZIER_DEPTH) {
    result.push({ x: end.x, z: end.z });
    return;
  }

  const startFirst = { x: (start.x + first.x) / 2, z: (start.z + first.z) / 2 };
  const firstSecond = { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
  const secondEnd = { x: (second.x + end.x) / 2, z: (second.z + end.z) / 2 };
  const leftControl = { x: (startFirst.x + firstSecond.x) / 2, z: (startFirst.z + firstSecond.z) / 2 };
  const rightControl = { x: (firstSecond.x + secondEnd.x) / 2, z: (firstSecond.z + secondEnd.z) / 2 };
  const midpoint = { x: (leftControl.x + rightControl.x) / 2, z: (leftControl.z + rightControl.z) / 2 };
  flattenCubic(start, startFirst, leftControl, midpoint, tolerance, result, depth + 1);
  flattenCubic(midpoint, rightControl, secondEnd, end, tolerance, result, depth + 1);
}

function flattenPath(steps: readonly PathStep[], closed: boolean, offsetDistance: number) {
  const sourceScale = steps.reduce((scale, step) => Math.max(scale, distance(step.from, step.to)), 0);
  const tolerance = Math.max(1e-6, Math.min(Math.abs(offsetDistance) * 0.01, sourceScale * 0.001));
  const points: Point2D[] = [{ x: steps[0].from.x, z: steps[0].from.z }];

  for (const { segment, from, to } of steps) {
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      if (![first.x, first.z, second.x, second.z].every(Number.isFinite)) {
        throw new Error(`Invalid Bezier handle in sketch segment ${segment.id}`);
      }
      flattenCubic(from, first, second, to, tolerance, points);
    } else {
      points.push({ x: to.x, z: to.z });
    }
  }

  const distinct: Point2D[] = [];
  for (const point of points) {
    if (!distinct.length || distance(distinct[distinct.length - 1], point) > GEOMETRY_EPSILON) distinct.push(point);
  }
  if (closed && distinct.length > 1 && distance(distinct[0], distinct[distinct.length - 1]) <= GEOMETRY_EPSILON) distinct.pop();
  if (distinct.length < (closed ? 3 : 2)) throw new Error("Zero-length sketch topology cannot be offset");
  return distinct;
}

function shiftedPoint(point: Point2D, normal: Point2D, offsetDistance: number): Point2D {
  return { x: point.x + normal.x * offsetDistance, z: point.z + normal.z * offsetDistance };
}

function offsetPolyline(points: readonly Point2D[], closed: boolean, offsetDistance: number) {
  const edgeCount = closed ? points.length : points.length - 1;
  const directions: Point2D[] = [];
  const normals: Point2D[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distance(start, end);
    if (length <= GEOMETRY_EPSILON) throw new Error("Zero-length flattened sketch topology cannot be offset");
    const direction = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
    directions.push(direction);
    normals.push({ x: -direction.z, z: direction.x });
  }

  const result: Point2D[] = [];
  const add = (point: Point2D) => {
    if (!result.length || distance(result[result.length - 1], point) > GEOMETRY_EPSILON) result.push(point);
  };
  for (let index = 0; index < points.length; index += 1) {
    if (!closed && index === 0) {
      add(shiftedPoint(points[index], normals[0], offsetDistance));
      continue;
    }
    if (!closed && index === points.length - 1) {
      add(shiftedPoint(points[index], normals[normals.length - 1], offsetDistance));
      continue;
    }

    const previousEdge = (index - 1 + edgeCount) % edgeCount;
    const nextEdge = index % edgeCount;
    const previousShift = shiftedPoint(points[index], normals[previousEdge], offsetDistance);
    const nextShift = shiftedPoint(points[index], normals[nextEdge], offsetDistance);
    const denominator = cross(directions[previousEdge], directions[nextEdge]);
    if (Math.abs(denominator) > GEOMETRY_EPSILON) {
      const amount = cross(subtract(nextShift, previousShift), directions[nextEdge]) / denominator;
      const intersection = {
        x: previousShift.x + directions[previousEdge].x * amount,
        z: previousShift.z + directions[previousEdge].z * amount,
      };
      if (Number.isFinite(intersection.x) && Number.isFinite(intersection.z)
        && distance(points[index], intersection) <= Math.abs(offsetDistance) * MITER_LIMIT) {
        add(intersection);
        continue;
      }
    } else if (directions[previousEdge].x * directions[nextEdge].x + directions[previousEdge].z * directions[nextEdge].z > 0) {
      add({ x: (previousShift.x + nextShift.x) / 2, z: (previousShift.z + nextShift.z) / 2 });
      continue;
    }

    // A bevel is safer than an unbounded miter at cusps and nearly parallel turns.
    add(previousShift);
    add(nextShift);
  }
  if (closed && result.length > 1 && distance(result[0], result[result.length - 1]) <= GEOMETRY_EPSILON) result.pop();
  return result;
}

function orientation(first: Point2D, second: Point2D, third: Point2D) {
  return cross(subtract(second, first), subtract(third, first));
}

function onSegment(point: Point2D, start: Point2D, end: Point2D) {
  return Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON
    && point.x >= Math.min(start.x, end.x) - GEOMETRY_EPSILON
    && point.x <= Math.max(start.x, end.x) + GEOMETRY_EPSILON
    && point.z >= Math.min(start.z, end.z) - GEOMETRY_EPSILON
    && point.z <= Math.max(start.z, end.z) + GEOMETRY_EPSILON;
}

function segmentsIntersect(firstStart: Point2D, firstEnd: Point2D, secondStart: Point2D, secondEnd: Point2D) {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  if (((firstA > GEOMETRY_EPSILON && firstB < -GEOMETRY_EPSILON) || (firstA < -GEOMETRY_EPSILON && firstB > GEOMETRY_EPSILON))
    && ((secondA > GEOMETRY_EPSILON && secondB < -GEOMETRY_EPSILON) || (secondA < -GEOMETRY_EPSILON && secondB > GEOMETRY_EPSILON))) return true;
  return (Math.abs(firstA) <= GEOMETRY_EPSILON && onSegment(secondStart, firstStart, firstEnd))
    || (Math.abs(firstB) <= GEOMETRY_EPSILON && onSegment(secondEnd, firstStart, firstEnd))
    || (Math.abs(secondA) <= GEOMETRY_EPSILON && onSegment(firstStart, secondStart, secondEnd))
    || (Math.abs(secondB) <= GEOMETRY_EPSILON && onSegment(firstEnd, secondStart, secondEnd));
}

function hasSelfIntersection(points: readonly Point2D[], closed: boolean) {
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count - (closed ? 0 : 1); index += 1) {
    const previous = subtract(points[(index + 1) % points.length], points[index]);
    const next = subtract(points[(index + 2) % points.length], points[(index + 1) % points.length]);
    if (Math.abs(cross(previous, next)) <= GEOMETRY_EPSILON
      && previous.x * next.x + previous.z * next.z < 0) return true;
  }
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      if (second === first + 1 || (closed && first === 0 && second === count - 1)) continue;
      if (segmentsIntersect(
        points[first],
        points[(first + 1) % points.length],
        points[second],
        points[(second + 1) % points.length],
      )) return true;
    }
  }
  return false;
}

function freshId(createId: IdFactory, prefix: string, used: Set<string>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createId(prefix);
    if (id && !used.has(id)) {
      used.add(id);
      return id;
    }
  }
  throw new Error(`ID factory did not produce a fresh ${prefix} ID`);
}

export function offsetSketchSegments(
  profile: SketchProfile,
  selectedSegmentIds: readonly string[],
  offsetDistance: number,
  options: SketchOffsetOptions = {},
): SketchOffsetResult {
  if (!Number.isFinite(offsetDistance) || Math.abs(offsetDistance) <= GEOMETRY_EPSILON) {
    throw new Error("Sketch offset distance must be a finite non-zero value");
  }

  const { steps, closed } = resolvePath(profile, selectedSegmentIds, options.includeConnected ?? true);
  const sourcePoints = flattenPath(steps, closed, offsetDistance);
  let sideDistance = offsetDistance;
  const sourceArea = closed ? signedArea(sourcePoints) : 0;
  if (closed) {
    if (Math.abs(sourceArea) <= GEOMETRY_EPSILON) throw new Error("Closed sketch path has collapsed area");
    sideDistance = -Math.sign(sourceArea) * offsetDistance;
  }

  const offsetPoints = offsetPolyline(sourcePoints, closed, sideDistance);
  if (offsetPoints.length < (closed ? 3 : 2)) throw new Error("Sketch offset result collapsed");
  if (offsetPoints.some((point, index) => distance(point, offsetPoints[(index + 1) % offsetPoints.length]) <= GEOMETRY_EPSILON
    && (closed || index < offsetPoints.length - 1))) throw new Error("Sketch offset result collapsed");
  if (closed) {
    const resultArea = signedArea(offsetPoints);
    if (Math.abs(resultArea) <= GEOMETRY_EPSILON || Math.sign(resultArea) !== Math.sign(sourceArea)) {
      throw new Error("Closed sketch offset result collapsed");
    }
  }
  if (hasSelfIntersection(offsetPoints, closed)) throw new Error("Generated sketch offset self-intersects");

  const createId = options.createId ?? createLocalId;
  const usedIds = new Set([
    ...profile.points.map((point) => point.id),
    ...profile.segments.map((segment) => segment.id),
    ...(profile.constraints ?? []).map((constraint) => constraint.id),
    ...(profile.dimensions ?? []).map((dimension) => dimension.id),
    ...(profile.images ?? []).map((image) => image.id),
    ...(profile.texts ?? []).map((text) => text.id),
  ]);
  const pointIds = offsetPoints.map(() => freshId(createId, "sketch-point", usedIds));
  const segmentCount = closed ? pointIds.length : pointIds.length - 1;
  const segmentIds = Array.from({ length: segmentCount }, () => freshId(createId, "sketch-segment", usedIds));
  const generatedPoints: SketchPoint[] = offsetPoints.map((point, index) => ({
    id: pointIds[index],
    x: point.x,
    z: point.z,
    mode: "corner",
  }));
  const generatedSegments: SketchSegment[] = segmentIds.map((id, index) => ({
    id,
    startId: pointIds[index],
    endId: pointIds[(index + 1) % pointIds.length],
    kind: "line",
  }));

  return {
    profile: {
      ...profile,
      points: [...profile.points, ...generatedPoints],
      segments: [...profile.segments, ...generatedSegments],
    },
    pointIds,
    segmentIds,
    closed,
  };
}
