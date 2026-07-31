import type { ManifoldToplevel } from "manifold-3d";
import type { SketchPoint, SketchProfile, SketchRevolveSettings, SketchSegment } from "@/types/sketchforge";

export const DEFAULT_SKETCH_REVOLVE_SETTINGS: SketchRevolveSettings = {
  startAngle: 0,
  sweepAngle: 360,
  sides: 64,
  quality: 6,
  thickness: 1,
};

type OrderedStep = { segment: SketchSegment; from: SketchPoint; to: SketchPoint };
type OrderedPath = { steps: OrderedStep[]; closed: boolean };
type Point2 = [number, number];
type SampledPoint = { x: number; z: number };

export type SketchRevolveMesh = {
  positions: number[];
  width: number;
  depth: number;
  height: number;
  triangleCount: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSketchRevolveSettings(settings?: Partial<SketchRevolveSettings>): SketchRevolveSettings {
  const rawSweep = clamp(finiteOr(settings?.sweepAngle, DEFAULT_SKETCH_REVOLVE_SETTINGS.sweepAngle), -360, 360);
  const sweepAngle = Math.abs(rawSweep) < 1 ? (rawSweep < 0 ? -1 : 1) : rawSweep;
  return {
    startAngle: ((finiteOr(settings?.startAngle, DEFAULT_SKETCH_REVOLVE_SETTINGS.startAngle) % 360) + 360) % 360,
    sweepAngle,
    sides: Math.round(clamp(finiteOr(settings?.sides, DEFAULT_SKETCH_REVOLVE_SETTINGS.sides), 3, 128)),
    quality: Math.round(clamp(finiteOr(settings?.quality, DEFAULT_SKETCH_REVOLVE_SETTINGS.quality), 1, 10)),
    thickness: clamp(finiteOr(settings?.thickness, DEFAULT_SKETCH_REVOLVE_SETTINGS.thickness), 0.1, 20),
  };
}

function orderedPaths(profile: SketchProfile): OrderedPath[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchSegment }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const validSegments = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId)) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(validSegments.map((segment) => segment.id));
  const paths: OrderedPath[] = [];
  while (unvisited.size > 0) {
    const seed = validSegments.find((segment) => unvisited.has(segment.id));
    if (!seed) break;
    const componentIds = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length > 0) {
      const id = queue.pop();
      if (!id || componentIds.has(id)) continue;
      componentIds.add(id);
      adjacency.get(id)?.forEach((entry) => queue.push(entry.pointId));
    }
    const startId = [...componentIds].find((id) => (adjacency.get(id)?.filter((entry) => unvisited.has(entry.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const steps: OrderedStep[] = [];
    let currentId = startId;
    for (let guard = 0; guard <= validSegments.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((entry) => unvisited.has(entry.segment.id));
      if (!edge) break;
      const from = pointById.get(currentId);
      const to = pointById.get(edge.pointId);
      if (!from || !to) break;
      unvisited.delete(edge.segment.id);
      steps.push({ segment: edge.segment, from, to });
      currentId = to.id;
      if (currentId === startId) break;
    }
    if (steps.length > 0) paths.push({ steps, closed: currentId === startId && steps.length >= 3 });
  }
  return paths;
}

function cubicPoint(start: SketchPoint, first: { x: number; z: number }, second: { x: number; z: number }, end: SketchPoint, amount: number) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function samplePath(path: OrderedPath, quality: number) {
  const first = path.steps[0]?.from;
  if (!first) return [];
  const sampled = [{ x: first.x, z: first.z }];
  const curveSamples = 4 + quality * 6;
  path.steps.forEach(({ segment, from, to }) => {
    const forward = segment.startId === from.id;
    const firstControl = forward ? from.handleOut : from.handleIn;
    const secondControl = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && firstControl && secondControl) {
      for (let index = 1; index <= curveSamples; index += 1) {
        sampled.push(cubicPoint(from, firstControl, secondControl, to, index / curveSamples));
      }
    } else {
      sampled.push({ x: to.x, z: to.z });
    }
  });
  if (path.closed && sampled.length > 1) sampled.pop();
  return sampled;
}

function compactSampledPath(points: SampledPoint[]) {
  const compact: SampledPoint[] = [];
  points.forEach((point) => {
    const previous = compact[compact.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 1e-7) compact.push(point);
  });
  if (compact.length > 2) {
    const first = compact[0];
    const last = compact[compact.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) <= 1e-7) compact.pop();
  }
  return compact;
}

function axisIntersection(from: SampledPoint, to: SampledPoint): SampledPoint {
  const deltaX = to.x - from.x;
  const amount = Math.abs(deltaX) <= 1e-12 ? 0 : clamp(-from.x / deltaX, 0, 1);
  return { x: 0, z: from.z + (to.z - from.z) * amount };
}

function clipClosedPathToRevolveSide(points: SampledPoint[]) {
  if (points.length < 3) return [];
  const clipped: SampledPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const fromInside = from.x <= 0;
    const toInside = to.x <= 0;
    if (fromInside && toInside) {
      clipped.push(to);
    } else if (fromInside) {
      clipped.push(axisIntersection(from, to));
    } else if (toInside) {
      clipped.push(axisIntersection(from, to), to);
    }
  }
  return compactSampledPath(clipped);
}

function clipOpenPathToRevolveSide(points: SampledPoint[]) {
  const paths: SampledPoint[][] = [];
  let current: SampledPoint[] = [];
  const finishCurrent = () => {
    const compact = compactSampledPath(current);
    if (compact.length >= 2) paths.push(compact);
    current = [];
  };
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const fromInside = from.x <= 0;
    const toInside = to.x <= 0;
    if (fromInside && toInside) {
      if (current.length === 0) current.push(from);
      current.push(to);
    } else if (fromInside) {
      if (current.length === 0) current.push(from);
      current.push(axisIntersection(from, to));
      finishCurrent();
    } else if (toInside) {
      current = [axisIntersection(from, to), to];
    }
  }
  finishCurrent();
  return paths;
}

function distance(a: Point2, b: Point2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function compactPolygon(points: Point2[]) {
  const compact: Point2[] = [];
  points.forEach((point) => {
    if (!compact.length || distance(compact[compact.length - 1], point) > 1e-7) compact.push(point);
  });
  if (compact.length > 2 && distance(compact[0], compact[compact.length - 1]) <= 1e-7) compact.pop();
  return compact;
}

function strokeOpenPath(points: Point2[], thickness: number) {
  if (points.length < 2) return [];
  const half = thickness / 2;
  const normals: Point2[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const dx = points[index + 1][0] - points[index][0];
    const dy = points[index + 1][1] - points[index][1];
    const length = Math.hypot(dx, dy);
    normals.push(length > 1e-8 ? [-dy / length, dx / length] : [0, 0]);
  }
  const offsetAt = (index: number): Point2 => {
    const previous = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    const sumX = previous[0] + next[0];
    const sumY = previous[1] + next[1];
    const sumLength = Math.hypot(sumX, sumY);
    if (sumLength <= 1e-8) return [next[0] * half, next[1] * half];
    const unit: Point2 = [sumX / sumLength, sumY / sumLength];
    const projection = Math.abs(unit[0] * next[0] + unit[1] * next[1]);
    const miter = Math.min(half * 4, half / Math.max(0.25, projection));
    return [unit[0] * miter, unit[1] * miter];
  };
  const left: Point2[] = [];
  const right: Point2[] = [];
  points.forEach((point, index) => {
    const offset = offsetAt(index);
    left.push([point[0] + offset[0], point[1] + offset[1]]);
    right.push([point[0] - offset[0], point[1] - offset[1]]);
  });
  return compactPolygon([...left, ...right.reverse()]);
}

export function sketchProfileToRevolvePolygons(profile: SketchProfile, settings?: Partial<SketchRevolveSettings>) {
  const normalized = normalizeSketchRevolveSettings(settings);
  const paths = orderedPaths(profile).flatMap((path) => {
    const sampled = samplePath(path, normalized.quality);
    if (path.closed) {
      const clipped = clipClosedPathToRevolveSide(sampled);
      return clipped.length >= 3 ? [{ closed: true, points: clipped }] : [];
    }
    return clipOpenPathToRevolveSide(sampled).map((points) => ({ closed: false, points }));
  });
  if (paths.length === 0) return [];
  const maxZ = Math.max(...paths.flatMap((entry) => entry.points.map((point) => point.z)));
  const toSectionPoint = (point: SampledPoint): Point2 => [-point.x, maxZ - point.z];
  return paths.flatMap(({ closed, points }) => {
    const sectionPoints = compactPolygon(points.map(toSectionPoint));
    const polygon = closed ? sectionPoints : strokeOpenPath(sectionPoints, normalized.thickness).map((point) => [Math.max(0, point[0]), point[1]] as Point2);
    return polygon.length >= 3 ? [compactPolygon(polygon)] : [];
  });
}

function manifoldMeshPositions(mesh: InstanceType<ManifoldToplevel["Mesh"]>) {
  const positions: number[] = [];
  for (let index = 0; index < mesh.triVerts.length; index += 1) {
    const offset = mesh.triVerts[index] * mesh.numProp;
    positions.push(mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]);
  }
  return positions;
}

function dispose(value: unknown) {
  (value as { delete?: () => void } | null)?.delete?.();
}

export function buildSketchRevolveMesh(runtime: ManifoldToplevel, profile: SketchProfile, requestedSettings?: Partial<SketchRevolveSettings>): SketchRevolveMesh {
  const settings = normalizeSketchRevolveSettings(requestedSettings);
  const polygons = sketchProfileToRevolvePolygons(profile, settings);
  if (polygons.length === 0) throw new Error("Draw at least one connected profile on the left side of the revolve axis");
  const disposable: unknown[] = [];
  try {
    const section = new runtime.CrossSection(polygons, "EvenOdd");
    disposable.push(section);
    const scale = polygons.reduce((largest, polygon) => polygon.reduce((current, point) => Math.max(current, Math.abs(point[0]), Math.abs(point[1])), largest), 1);
    const simplified = section.simplify(Math.max(1e-7, scale * 1e-8));
    disposable.push(simplified);
    if (simplified.toPolygons().length === 0) throw new Error("The revolve profile has no filled area");
    const sweep = Math.abs(settings.sweepAngle);
    const solid = simplified.revolve(settings.sides, sweep);
    disposable.push(solid);
    const rotation = settings.sweepAngle < 0 ? settings.startAngle + settings.sweepAngle : settings.startAngle;
    const revolved = Math.abs(rotation) > 1e-8 ? solid.rotate([0, 0, rotation]) : solid;
    if (revolved !== solid) disposable.push(revolved);
    if (revolved.status() !== "NoError" || revolved.numTri() < 1) throw new Error("The profile could not be revolved into a valid solid");

    const manifoldPositions = manifoldMeshPositions(revolved.getMesh());
    const positions = new Array<number>(manifoldPositions.length);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let index = 0; index + 2 < manifoldPositions.length; index += 3) {
      const x = manifoldPositions[index];
      const y = manifoldPositions[index + 2];
      const z = -manifoldPositions[index + 1];
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    for (let index = 0; index + 2 < positions.length; index += 3) {
      positions[index] -= centerX;
      positions[index + 1] -= minY;
      positions[index + 2] -= centerZ;
    }
    return {
      positions,
      width: Math.max(0.01, maxX - minX),
      depth: Math.max(0.01, maxZ - minZ),
      height: Math.max(0.01, maxY - minY),
      triangleCount: Math.floor(positions.length / 9),
    };
  } finally {
    [...new Set(disposable)].reverse().forEach(dispose);
  }
}
