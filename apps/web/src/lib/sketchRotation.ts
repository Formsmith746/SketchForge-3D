import type { SketchPoint, SketchProfile } from "@/types/sketchforge";

export type SketchGeometrySelection = {
  pointIds: readonly string[];
  segmentIds: readonly string[];
  imageIds?: readonly string[];
};

export function selectedClosedSketchPoints(
  profile: SketchProfile,
  selection: SketchGeometrySelection,
): SketchPoint[] | null {
  if (selection.imageIds?.length) return null;

  const pointIds = new Set(selection.pointIds);
  const segmentIds = new Set(selection.segmentIds);
  if (pointIds.size < 3 || segmentIds.size !== pointIds.size) return null;

  const selectedPoints = profile.points.filter((point) => pointIds.has(point.id));
  if (selectedPoints.length !== pointIds.size) return null;

  const segmentById = new Map(profile.segments.map((segment) => [segment.id, segment]));
  const adjacency = new Map([...pointIds].map((pointId) => [pointId, new Set<string>()]));

  for (const segmentId of segmentIds) {
    const segment = segmentById.get(segmentId);
    if (
      !segment
      || segment.startId === segment.endId
      || !pointIds.has(segment.startId)
      || !pointIds.has(segment.endId)
    ) {
      return null;
    }
    adjacency.get(segment.startId)?.add(segment.endId);
    adjacency.get(segment.endId)?.add(segment.startId);
  }

  if ([...adjacency.values()].some((neighbors) => neighbors.size !== 2)) return null;

  const unvisited = new Set(pointIds);
  while (unvisited.size > 0) {
    const start = unvisited.values().next().value as string | undefined;
    if (!start) return null;
    const stack = [start];
    let componentSize = 0;
    while (stack.length > 0) {
      const pointId = stack.pop();
      if (!pointId || !unvisited.delete(pointId)) continue;
      componentSize += 1;
      adjacency.get(pointId)?.forEach((neighborId) => {
        if (unvisited.has(neighborId)) stack.push(neighborId);
      });
    }
    if (componentSize < 3) return null;
  }

  return selectedPoints;
}

export function rotateSketchPoints(points: readonly SketchPoint[], degrees = 45): SketchPoint[] {
  if (points.length === 0) return [];

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  const pivot = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatePosition = (position: { x: number; z: number }) => {
    const deltaX = position.x - pivot.x;
    const deltaZ = position.z - pivot.z;
    return {
      x: pivot.x + deltaX * cosine - deltaZ * sine,
      z: pivot.z + deltaX * sine + deltaZ * cosine,
    };
  };

  return points.map((point) => ({
    ...point,
    ...rotatePosition(point),
    handleIn: point.handleIn ? rotatePosition(point.handleIn) : undefined,
    handleOut: point.handleOut ? rotatePosition(point.handleOut) : undefined,
  }));
}
