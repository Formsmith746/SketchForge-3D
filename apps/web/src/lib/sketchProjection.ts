import {
  localPointToWorld,
  worldPointToLocal,
  type ConstructionPlanePose,
  type Vector3Tuple,
} from "@/lib/constructionPlanes";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type SketchProjectionIdFactory = (prefix: string) => string;
export type ProjectedSketchPoint = SketchPoint & { projectionId?: string };
export type ProjectedSketchSegment = SketchSegment & { projectionId?: string };

export type SketchProjectionResult = {
  points: ProjectedSketchPoint[];
  segments: ProjectedSketchSegment[];
};

export type TriangleFace = readonly [number, number, number];

type Point2D = { x: number; z: number };
type InternedPoint = Point2D & { index: number };
type IndexedEdge = { start: number; end: number };

const MIN_GEOMETRY_TOLERANCE = 1e-9;
const RELATIVE_GEOMETRY_TOLERANCE = 64 * Number.EPSILON;

function toleranceForCoordinates(coordinates: Iterable<number>) {
  let scale = 1;
  for (const coordinate of coordinates) scale = Math.max(scale, Math.abs(coordinate));
  return Math.max(MIN_GEOMETRY_TOLERANCE, scale * RELATIVE_GEOMETRY_TOLERANCE);
}

function distanceSquared(left: Point2D, right: Point2D) {
  const deltaX = left.x - right.x;
  const deltaZ = left.z - right.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function edgeKey(start: number, end: number) {
  return start < end ? `${start}:${end}` : `${end}:${start}`;
}

function projectionStamp(projectionId: string | undefined) {
  return projectionId === undefined ? {} : { projectionId };
}

function freshId(createId: SketchProjectionIdFactory, prefix: string, usedIds: Set<string>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = createId(prefix);
    if (id && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error(`ID factory did not produce a fresh ${prefix} ID`);
}

function createPointInterner(tolerance: number) {
  const points: InternedPoint[] = [];
  const cells = new Map<string, number[]>();
  const toleranceSquared = tolerance * tolerance;

  const cellKey = (x: number, z: number) => `${x}:${z}`;
  const intern = (point: Point2D) => {
    const cellX = Math.floor(point.x / tolerance);
    const cellZ = Math.floor(point.z / tolerance);
    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      for (let deltaZ = -1; deltaZ <= 1; deltaZ += 1) {
        for (const index of cells.get(cellKey(cellX + deltaX, cellZ + deltaZ)) ?? []) {
          if (distanceSquared(points[index], point) <= toleranceSquared) return points[index];
        }
      }
    }

    const interned = { ...point, index: points.length };
    points.push(interned);
    const key = cellKey(cellX, cellZ);
    cells.set(key, [...(cells.get(key) ?? []), interned.index]);
    return interned;
  };

  return { points, intern };
}

function farthestPair(indices: readonly number[], points: readonly Point2D[]) {
  let pair: IndexedEdge | null = null;
  let largestDistance = 0;
  for (let first = 0; first < indices.length; first += 1) {
    for (let second = first + 1; second < indices.length; second += 1) {
      const candidateDistance = distanceSquared(points[indices[first]], points[indices[second]]);
      if (candidateDistance > largestDistance) {
        largestDistance = candidateDistance;
        pair = { start: indices[first], end: indices[second] };
      }
    }
  }
  return pair;
}

/** Intersects world-space mesh triangles with the target plane's local y=0 plane. */
export function intersectMeshWithPlane(
  worldVertices: readonly (readonly [number, number, number])[],
  triangleFaces: readonly TriangleFace[],
  targetPose: ConstructionPlanePose,
  createId: SketchProjectionIdFactory,
  projectionId?: string,
): SketchProjectionResult {
  const localVertices = worldVertices.map((vertex, index) => {
    if (!vertex.every(Number.isFinite)) throw new Error(`Invalid mesh vertex coordinates at index ${index}`);
    const local = worldPointToLocal(targetPose, vertex);
    if (!local.every(Number.isFinite)) throw new Error(`Invalid transformed mesh vertex at index ${index}`);
    return local;
  });
  const tolerance = toleranceForCoordinates(localVertices.flat());
  const { points: internedPoints, intern } = createPointInterner(tolerance);
  const regularEdges = new Map<string, IndexedEdge>();
  const coplanarEdges = new Map<string, IndexedEdge & { count: number }>();

  const addRegularEdge = (start: number, end: number) => {
    if (start === end) return;
    regularEdges.set(edgeKey(start, end), { start, end });
  };
  const addCoplanarEdge = (start: number, end: number) => {
    if (start === end) return;
    const key = edgeKey(start, end);
    const existing = coplanarEdges.get(key);
    if (existing) existing.count += 1;
    else coplanarEdges.set(key, { start, end, count: 1 });
  };

  for (let faceIndex = 0; faceIndex < triangleFaces.length; faceIndex += 1) {
    const face = triangleFaces[faceIndex];
    const triangle = face.map((vertexIndex) => {
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= localVertices.length) {
        throw new Error(`Invalid vertex reference in triangle face ${faceIndex}`);
      }
      return localVertices[vertexIndex];
    }) as [Vector3Tuple, Vector3Tuple, Vector3Tuple];
    const sides = triangle.map((point) => (
      Math.abs(point[1]) <= tolerance ? 0 : Math.sign(point[1])
    ));

    if (sides.every((side) => side === 0)) {
      const indices = triangle.map((point) => intern({ x: point[0], z: point[2] }).index);
      addCoplanarEdge(indices[0], indices[1]);
      addCoplanarEdge(indices[1], indices[2]);
      addCoplanarEdge(indices[2], indices[0]);
      continue;
    }

    const intersections: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      if (sides[index] === 0) {
        const point = triangle[index];
        intersections.push(intern({ x: point[0], z: point[2] }).index);
      }
    }
    for (const [first, second] of [[0, 1], [1, 2], [2, 0]] as const) {
      if (sides[first] * sides[second] >= 0) continue;
      const start = triangle[first];
      const end = triangle[second];
      const amount = start[1] / (start[1] - end[1]);
      intersections.push(intern({
        x: start[0] + (end[0] - start[0]) * amount,
        z: start[2] + (end[2] - start[2]) * amount,
      }).index);
    }

    const uniqueIntersections = [...new Set(intersections)];
    const pair = farthestPair(uniqueIntersections, internedPoints);
    if (pair) addRegularEdge(pair.start, pair.end);
  }

  const sectionEdges = new Map(regularEdges);
  for (const [key, edge] of coplanarEdges) {
    if (edge.count === 1 && !sectionEdges.has(key)) sectionEdges.set(key, edge);
  }
  if (sectionEdges.size === 0) return { points: [], segments: [] };

  const usedPointIndices = new Set<number>();
  for (const edge of sectionEdges.values()) {
    usedPointIndices.add(edge.start);
    usedPointIndices.add(edge.end);
  }
  const usedIds = new Set<string>();
  const pointIdByIndex = new Map<number, string>();
  const points: ProjectedSketchPoint[] = [];
  for (const point of internedPoints) {
    if (!usedPointIndices.has(point.index)) continue;
    const id = freshId(createId, "sketch-point", usedIds);
    pointIdByIndex.set(point.index, id);
    points.push({ id, x: point.x, z: point.z, mode: "corner", ...projectionStamp(projectionId) });
  }
  const segments: ProjectedSketchSegment[] = [...sectionEdges.values()].map((edge) => ({
    id: freshId(createId, "sketch-segment", usedIds),
    startId: pointIdByIndex.get(edge.start)!,
    endId: pointIdByIndex.get(edge.end)!,
    kind: "line",
    ...projectionStamp(projectionId),
  }));

  return { points, segments };
}

function allProfileIds(profile: SketchProfile) {
  return new Set([
    ...profile.points.map((point) => point.id),
    ...profile.segments.map((segment) => segment.id),
    ...(profile.constraints ?? []).map((constraint) => constraint.id),
    ...(profile.dimensions ?? []).map((dimension) => dimension.id),
    ...(profile.images ?? []).map((image) => image.id),
    ...(profile.texts ?? []).map((text) => text.id),
  ]);
}

function projectLocalPoint(
  point: Point2D,
  sourcePose: ConstructionPlanePose,
  targetPose: ConstructionPlanePose,
  translation: readonly [number, number, number],
) {
  const world = localPointToWorld(sourcePose, [
    point.x + translation[0],
    translation[1],
    point.z + translation[2],
  ]);
  const target = worldPointToLocal(targetPose, world);
  return { x: target[0], z: target[2] };
}

function projectedSegmentIsDegenerate(
  segment: SketchSegment,
  start: ProjectedSketchPoint,
  end: ProjectedSketchPoint,
  toleranceSquared: number,
) {
  if (distanceSquared(start, end) > toleranceSquared) return false;
  if (segment.kind === "line" || !start.handleOut || !end.handleIn) return true;
  return distanceSquared(start, start.handleOut) <= toleranceSquared
    && distanceSquared(start, end.handleIn) <= toleranceSquared;
}

export function projectSketchProfileToPlane(
  source: SketchProfile,
  sourcePose: ConstructionPlanePose,
  targetPose: ConstructionPlanePose,
  createId: SketchProjectionIdFactory,
  projectionId?: string,
): SketchProjectionResult;
export function projectSketchProfileToPlane(
  source: SketchProfile,
  sourcePose: ConstructionPlanePose,
  targetPose: ConstructionPlanePose,
  sourceLocalTranslation: readonly [number, number, number],
  createId: SketchProjectionIdFactory,
  projectionId?: string,
): SketchProjectionResult;
/** Orthogonally projects source sketch geometry into the target plane's local x/z coordinates. */
export function projectSketchProfileToPlane(
  source: SketchProfile,
  sourcePose: ConstructionPlanePose,
  targetPose: ConstructionPlanePose,
  translationOrCreateId: readonly [number, number, number] | SketchProjectionIdFactory,
  createIdOrProjectionId?: SketchProjectionIdFactory | string,
  requestedProjectionId?: string,
): SketchProjectionResult {
  const sourceLocalTranslation: readonly [number, number, number] = typeof translationOrCreateId === "function"
    ? [0, 0, 0]
    : translationOrCreateId;
  const createId = typeof translationOrCreateId === "function"
    ? translationOrCreateId
    : createIdOrProjectionId as SketchProjectionIdFactory;
  const projectionId = typeof translationOrCreateId === "function"
    ? createIdOrProjectionId as string | undefined
    : requestedProjectionId;
  if (typeof createId !== "function") throw new Error("A sketch projection ID factory is required");
  if (!sourceLocalTranslation.every(Number.isFinite)) throw new Error("Source sketch translation must be finite");

  const usedIds = allProfileIds(source);
  const sourceIds = new Set<string>();
  const pointBySourceId = new Map<string, ProjectedSketchPoint>();
  const points: ProjectedSketchPoint[] = source.points.map((sourcePoint) => {
    if (sourceIds.has(sourcePoint.id)) throw new Error(`Invalid sketch topology: duplicate point ID ${sourcePoint.id}`);
    sourceIds.add(sourcePoint.id);
    if (![sourcePoint.x, sourcePoint.z].every(Number.isFinite)) {
      throw new Error(`Invalid sketch point coordinates at ${sourcePoint.id}`);
    }
    if (sourcePoint.handleIn && ![sourcePoint.handleIn.x, sourcePoint.handleIn.z].every(Number.isFinite)) {
      throw new Error(`Invalid incoming handle coordinates at ${sourcePoint.id}`);
    }
    if (sourcePoint.handleOut && ![sourcePoint.handleOut.x, sourcePoint.handleOut.z].every(Number.isFinite)) {
      throw new Error(`Invalid outgoing handle coordinates at ${sourcePoint.id}`);
    }

    const position = projectLocalPoint(sourcePoint, sourcePose, targetPose, sourceLocalTranslation);
    const handleIn = sourcePoint.handleIn
      ? projectLocalPoint(sourcePoint.handleIn, sourcePose, targetPose, sourceLocalTranslation)
      : undefined;
    const handleOut = sourcePoint.handleOut
      ? projectLocalPoint(sourcePoint.handleOut, sourcePose, targetPose, sourceLocalTranslation)
      : undefined;
    const projected: ProjectedSketchPoint = {
      id: freshId(createId, "sketch-point", usedIds),
      ...position,
      ...(handleIn ? { handleIn } : {}),
      ...(handleOut ? { handleOut } : {}),
      ...(sourcePoint.mode ? { mode: sourcePoint.mode } : {}),
      ...projectionStamp(projectionId),
    };
    pointBySourceId.set(sourcePoint.id, projected);
    return projected;
  });

  const coordinates = points.flatMap((point) => [
    point.x,
    point.z,
    ...(point.handleIn ? [point.handleIn.x, point.handleIn.z] : []),
    ...(point.handleOut ? [point.handleOut.x, point.handleOut.z] : []),
  ]);
  const tolerance = toleranceForCoordinates(coordinates);
  const toleranceSquared = tolerance * tolerance;
  const segments: ProjectedSketchSegment[] = [];
  for (const sourceSegment of source.segments) {
    const start = pointBySourceId.get(sourceSegment.startId);
    const end = pointBySourceId.get(sourceSegment.endId);
    if (!start || !end) throw new Error(`Invalid point reference in sketch segment ${sourceSegment.id}`);
    if (projectedSegmentIsDegenerate(sourceSegment, start, end, toleranceSquared)) continue;
    segments.push({
      id: freshId(createId, "sketch-segment", usedIds),
      startId: start.id,
      endId: end.id,
      ...(sourceSegment.kind ? { kind: sourceSegment.kind } : {}),
      ...projectionStamp(projectionId),
    });
  }

  return { points, segments };
}

export const intersectMeshWithSketchPlane = intersectMeshWithPlane;
export const projectPreviousSketchToPlane = projectSketchProfileToPlane;
