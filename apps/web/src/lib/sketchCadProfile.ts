import type { SketchDimensionAnchor, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type OrderedCadSketchStep = { segment: SketchSegment; from: SketchPoint; to: SketchPoint };
export type OrderedCadSketchPath = { id: string; points: SketchPoint[]; steps: OrderedCadSketchStep[]; closed: boolean };
export type CadSketchRegion = {
  id: string;
  outer: OrderedCadSketchPath;
  holes: OrderedCadSketchPath[];
  sourcePathIds?: string[];
  coverage?: number;
};

function pathId(steps: OrderedCadSketchStep[]) {
  return steps.map((step) => step.segment.id).sort().join("|");
}

export function orderedCadSketchPaths(profile: SketchProfile): OrderedCadSketchPath[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchSegment }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const valid = profile.segments.filter((segment) => {
    if (segment.startId === segment.endId || !pointById.has(segment.startId) || !pointById.has(segment.endId)) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(valid.map((segment) => segment.id));
  const paths: OrderedCadSketchPath[] = [];

  while (unvisited.size > 0) {
    const seedId = unvisited.values().next().value as string;
    const seed = valid.find((segment) => segment.id === seedId);
    if (!seed) break;
    const component = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length > 0) {
      const id = queue.pop();
      if (!id || component.has(id)) continue;
      component.add(id);
      adjacency.get(id)?.forEach((edge) => queue.push(edge.pointId));
    }
    const startId = [...component].find((id) => (adjacency.get(id)?.filter((edge) => unvisited.has(edge.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) {
      unvisited.delete(seed.id);
      continue;
    }
    const points = [first];
    const steps: OrderedCadSketchStep[] = [];
    let currentId = startId;
    for (let guard = 0; guard <= valid.length; guard += 1) {
      const edge = adjacency.get(currentId)?.find((candidate) => unvisited.has(candidate.segment.id));
      if (!edge) break;
      const from = pointById.get(currentId);
      const to = pointById.get(edge.pointId);
      if (!from || !to) break;
      unvisited.delete(edge.segment.id);
      steps.push({ segment: edge.segment, from, to });
      currentId = to.id;
      if (currentId === startId) break;
      points.push(to);
    }
    paths.push({ id: pathId(steps), points, steps, closed: currentId === startId && steps.length >= 3 });
  }
  return paths;
}

function sampledPath(path: OrderedCadSketchPath) {
  const samples: Array<{ x: number; z: number }> = [];
  path.steps.forEach(({ segment, from, to }, stepIndex) => {
    if (stepIndex === 0) samples.push({ x: from.x, z: from.z });
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind === "line" || !first || !second) {
      samples.push({ x: to.x, z: to.z });
      return;
    }
    for (let index = 1; index <= 16; index += 1) {
      const amount = index / 16;
      const inverse = 1 - amount;
      samples.push({
        x: inverse ** 3 * from.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * to.x,
        z: inverse ** 3 * from.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * to.z,
      });
    }
  });
  return samples;
}

function signedArea(points: Array<{ x: number; z: number }>) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

function pointInPolygon(point: { x: number; z: number }, polygon: Array<{ x: number; z: number }>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const before = polygon[previous];
    if ((current.z > point.z) !== (before.z > point.z)
      && point.x < ((before.x - current.x) * (point.z - current.z)) / (before.z - current.z) + current.x) inside = !inside;
  }
  return inside;
}

type ArrangementEdge = {
  pathIndex: number;
  pathId: string;
  edgeIndex: number;
  edgeCount: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  splits: Set<number>;
};

function cross2d(a: { x: number; z: number }, b: { x: number; z: number }) {
  return a.x * b.z - a.z * b.x;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function edgeIntersections(first: ArrangementEdge, second: ArrangementEdge, epsilon: number) {
  const r = { x: first.end.x - first.start.x, z: first.end.z - first.start.z };
  const s = { x: second.end.x - second.start.x, z: second.end.z - second.start.z };
  const offset = { x: second.start.x - first.start.x, z: second.start.z - first.start.z };
  const denominator = cross2d(r, s);
  const denominatorTolerance = epsilon * Math.max(1, Math.hypot(r.x, r.z), Math.hypot(s.x, s.z));
  if (Math.abs(denominator) > denominatorTolerance) {
    const firstAmount = cross2d(offset, s) / denominator;
    const secondAmount = cross2d(offset, r) / denominator;
    if (firstAmount < -epsilon || firstAmount > 1 + epsilon || secondAmount < -epsilon || secondAmount > 1 + epsilon) return null;
    return {
      first: [clampUnit(firstAmount)],
      second: [clampUnit(secondAmount)],
      changesTopology: firstAmount > epsilon && firstAmount < 1 - epsilon || secondAmount > epsilon && secondAmount < 1 - epsilon,
    };
  }
  if (Math.abs(cross2d(offset, r)) > denominatorTolerance) return null;
  const rLengthSquared = r.x * r.x + r.z * r.z;
  const sLengthSquared = s.x * s.x + s.z * s.z;
  if (rLengthSquared <= epsilon * epsilon || sLengthSquared <= epsilon * epsilon) return null;
  const firstStart = (offset.x * r.x + offset.z * r.z) / rLengthSquared;
  const firstEnd = firstStart + (s.x * r.x + s.z * r.z) / rLengthSquared;
  const overlapStart = Math.max(0, Math.min(firstStart, firstEnd));
  const overlapEnd = Math.min(1, Math.max(firstStart, firstEnd));
  if (overlapEnd < overlapStart - epsilon) return null;
  const pointAt = (amount: number) => ({ x: first.start.x + r.x * amount, z: first.start.z + r.z * amount });
  const overlapPoints = [pointAt(clampUnit(overlapStart)), pointAt(clampUnit(overlapEnd))];
  const secondAmounts = overlapPoints.map((point) => clampUnit(((point.x - second.start.x) * s.x + (point.z - second.start.z) * s.z) / sLengthSquared));
  return {
    first: [clampUnit(overlapStart), clampUnit(overlapEnd)],
    second: secondAmounts,
    changesTopology: overlapEnd - overlapStart > epsilon,
  };
}

function arrangementPath(points: Array<{ x: number; z: number }>, id: string): OrderedCadSketchPath {
  const sketchPoints = points.map((point, index) => ({ id: `${id}:p${index}`, x: point.x, z: point.z }));
  const steps = sketchPoints.map((from, index) => {
    const to = sketchPoints[(index + 1) % sketchPoints.length];
    return {
      segment: { id: `${id}:s${index}`, kind: "line" as const, startId: from.id, endId: to.id },
      from,
      to,
    };
  });
  return { id, points: sketchPoints, steps, closed: true };
}

// Split sampled edges at crossings, then walk the planar half-edge graph to
// produce one boundary per bounded face. Non-intersecting sketches keep their
// original curve paths and bypass this approximation entirely.
function arrangementRegions(profile: SketchProfile): CadSketchRegion[] | null {
  const paths = orderedCadSketchPaths(profile).filter((path) => path.steps.length > 0);
  if (paths.length === 0) return null;
  const polylines = paths.map((path) => {
    const sampled = sampledPath(path);
    if (path.closed && sampled.length > 1 && Math.hypot(sampled[0].x - sampled[sampled.length - 1].x, sampled[0].z - sampled[sampled.length - 1].z) <= 1e-10) sampled.pop();
    return sampled;
  });
  const allPoints = polylines.flat();
  if (allPoints.length < 3) return null;
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minZ = Math.min(...allPoints.map((point) => point.z));
  const maxZ = Math.max(...allPoints.map((point) => point.z));
  const scale = Math.max(1, Math.hypot(maxX - minX, maxZ - minZ));
  const epsilon = scale * 1e-8;
  const edges: ArrangementEdge[] = [];
  polylines.forEach((points, pathIndex) => {
    const edgeCount = paths[pathIndex].closed ? points.length : Math.max(0, points.length - 1);
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      const start = points[edgeIndex];
      const end = points[(edgeIndex + 1) % points.length];
      if (Math.hypot(end.x - start.x, end.z - start.z) <= epsilon) continue;
      edges.push({ pathIndex, pathId: paths[pathIndex].id, edgeIndex, edgeCount, start, end, splits: new Set([0, 1]) });
    }
  });
  let topologyChanged = false;
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
    const first = edges[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
      const second = edges[secondIndex];
      if (first.pathIndex === second.pathIndex) {
        const distance = Math.abs(first.edgeIndex - second.edgeIndex);
        if (distance <= 1 || distance === first.edgeCount - 1) continue;
      }
      if (Math.max(first.start.x, first.end.x) + epsilon < Math.min(second.start.x, second.end.x)
        || Math.max(second.start.x, second.end.x) + epsilon < Math.min(first.start.x, first.end.x)
        || Math.max(first.start.z, first.end.z) + epsilon < Math.min(second.start.z, second.end.z)
        || Math.max(second.start.z, second.end.z) + epsilon < Math.min(first.start.z, first.end.z)) continue;
      const intersection = edgeIntersections(first, second, epsilon);
      if (!intersection) continue;
      intersection.first.forEach((amount) => first.splits.add(amount));
      intersection.second.forEach((amount) => second.splits.add(amount));
      topologyChanged ||= intersection.changesTopology;
    }
  }
  if (!topologyChanged) return null;

  const vertices: Array<{ x: number; z: number }> = [];
  const buckets = new Map<string, number[]>();
  const snap = epsilon * 4;
  const intern = (point: { x: number; z: number }) => {
    const gridX = Math.round(point.x / snap);
    const gridZ = Math.round(point.z / snap);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const candidates = buckets.get(`${gridX + offsetX}:${gridZ + offsetZ}`) ?? [];
        const match = candidates.find((index) => Math.hypot(vertices[index].x - point.x, vertices[index].z - point.z) <= snap);
        if (match !== undefined) return match;
      }
    }
    const index = vertices.length;
    vertices.push(point);
    const key = `${gridX}:${gridZ}`;
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
    return index;
  };
  const adjacency = new Map<number, Set<number>>();
  const edgeSources = new Map<string, Set<string>>();
  const graphEdgeKey = (first: number, second: number) => first < second ? `${first}:${second}` : `${second}:${first}`;
  edges.forEach((edge) => {
    const amounts = [...edge.splits].sort((a, b) => a - b);
    for (let index = 0; index < amounts.length - 1; index += 1) {
      const firstAmount = amounts[index];
      const secondAmount = amounts[index + 1];
      if (secondAmount - firstAmount <= 1e-10) continue;
      const first = intern({ x: edge.start.x + (edge.end.x - edge.start.x) * firstAmount, z: edge.start.z + (edge.end.z - edge.start.z) * firstAmount });
      const second = intern({ x: edge.start.x + (edge.end.x - edge.start.x) * secondAmount, z: edge.start.z + (edge.end.z - edge.start.z) * secondAmount });
      if (first === second) continue;
      adjacency.set(first, new Set([...(adjacency.get(first) ?? []), second]));
      adjacency.set(second, new Set([...(adjacency.get(second) ?? []), first]));
      const key = graphEdgeKey(first, second);
      edgeSources.set(key, new Set([...(edgeSources.get(key) ?? []), edge.pathId]));
    }
  });
  const sortedNeighbors = new Map([...adjacency].map(([vertex, neighbors]) => [
    vertex,
    [...neighbors].sort((a, b) => Math.atan2(vertices[a].z - vertices[vertex].z, vertices[a].x - vertices[vertex].x)
      - Math.atan2(vertices[b].z - vertices[vertex].z, vertices[b].x - vertices[vertex].x)),
  ]));
  const visited = new Set<string>();
  const directedKey = (first: number, second: number) => `${first}>${second}`;
  const cycles: Array<{ points: Array<{ x: number; z: number }>; area: number; sources: string[] }> = [];
  sortedNeighbors.forEach((neighbors, start) => neighbors.forEach((firstNext) => {
    if (visited.has(directedKey(start, firstNext))) return;
    const vertexIds: number[] = [];
    const sources = new Set<string>();
    let current = start;
    let next = firstNext;
    let closed = false;
    for (let guard = 0; guard <= edges.length * 4; guard += 1) {
      const key = directedKey(current, next);
      if (visited.has(key)) break;
      visited.add(key);
      vertexIds.push(current);
      edgeSources.get(graphEdgeKey(current, next))?.forEach((source) => sources.add(source));
      const options = sortedNeighbors.get(next) ?? [];
      const reverseIndex = options.indexOf(current);
      if (reverseIndex < 0 || options.length === 0) break;
      const following = options[(reverseIndex - 1 + options.length) % options.length];
      current = next;
      next = following;
      if (current === start && next === firstNext) {
        closed = true;
        break;
      }
    }
    if (!closed || vertexIds.length < 3) return;
    const points = vertexIds.map((index) => vertices[index]);
    const area = signedArea(points);
    if (area > scale * scale * 1e-10) cycles.push({ points, area, sources: [...sources].sort() });
  }));
  if (cycles.length === 0) return [];

  const closedPolygons = paths.flatMap((path, index) => path.closed && polylines[index].length >= 3 ? [{ id: path.id, points: polylines[index] }] : []);
  const insideSamples = cycles.map((cycle) => {
    const first = cycle.points[0];
    const second = cycle.points[1];
    const deltaX = second.x - first.x;
    const deltaZ = second.z - first.z;
    const length = Math.max(epsilon, Math.hypot(deltaX, deltaZ));
    return {
      x: (first.x + second.x) / 2 - deltaZ / length * epsilon * 8,
      z: (first.z + second.z) / 2 + deltaX / length * epsilon * 8,
    };
  });
  const signatures = insideSamples.map((sample) => closedPolygons.filter((polygon) => pointInPolygon(sample, polygon.points)).map((polygon) => polygon.id).sort());
  const parentIndexes = cycles.map((cycle, index) => {
    let parent = -1;
    for (let candidate = 0; candidate < cycles.length; candidate += 1) {
      if (candidate === index || cycles[candidate].area <= cycle.area || !pointInPolygon(insideSamples[index], cycles[candidate].points)) continue;
      if (parent < 0 || cycles[candidate].area < cycles[parent].area) parent = candidate;
    }
    return parent;
  });
  const orderedIndexes = cycles.map((_, index) => index).sort((a, b) => {
    const signatureCompare = signatures[a].join("&").localeCompare(signatures[b].join("&"));
    if (signatureCompare) return signatureCompare;
    const aMinX = Math.min(...cycles[a].points.map((point) => point.x));
    const bMinX = Math.min(...cycles[b].points.map((point) => point.x));
    if (aMinX !== bMinX) return aMinX - bMinX;
    return Math.min(...cycles[a].points.map((point) => point.z)) - Math.min(...cycles[b].points.map((point) => point.z));
  });
  const baseIds = cycles.map((cycle, index) => `face:${signatures[index].length ? signatures[index].join("&") : `boundary:${cycle.sources.join("&")}`}`);
  const baseCounts = new Map<string, number>();
  baseIds.forEach((id) => baseCounts.set(id, (baseCounts.get(id) ?? 0) + 1));
  const occurrences = new Map<string, number>();
  const ids: string[] = [];
  orderedIndexes.forEach((index) => {
    const base = baseIds[index];
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    ids[index] = (baseCounts.get(base) ?? 0) > 1 ? `${base}:${occurrence}` : base;
  });
  const outlines = cycles.map((cycle, index) => arrangementPath(cycle.points, ids[index]));
  return cycles.map((cycle, index) => ({
    id: ids[index],
    outer: outlines[index],
    holes: parentIndexes.flatMap((parent, childIndex) => parent === index ? [outlines[childIndex]] : []),
    sourcePathIds: signatures[index].length > 0 && (baseCounts.get(baseIds[index]) ?? 0) === 1 ? signatures[index] : undefined,
    coverage: signatures[index].length,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function cadSketchRegionTopology(profile: SketchProfile) {
  const allPaths = orderedCadSketchPaths(profile);
  const openCount = allPaths.filter((path) => !path.closed).length;
  const records = allPaths
    .filter((path) => path.closed)
    .map((path) => {
      const polygon = sampledPath(path);
      return { path, polygon, area: Math.abs(signedArea(polygon)) };
    })
    .filter((record) => record.polygon.length >= 3 && record.area > 1e-8)
    .sort((a, b) => b.area - a.area || a.path.id.localeCompare(b.path.id));

  // Compute nesting depth: count how many larger closed paths contain each record.
  // Even depth = solid (outer boundary), odd depth = hole.
  const depths = records.map((record, index) => {
    let depth = 0;
    for (let i = 0; i < records.length; i++) {
      if (i === index) continue;
      if (records[i].area > record.area && pointInPolygon(record.polygon[0], records[i].polygon)) {
        depth++;
      }
    }
    return depth;
  });
  const parentIndexes = records.map((record, index) => {
    let parentIndex = -1;
    for (let candidateIndex = 0; candidateIndex < records.length; candidateIndex += 1) {
      if (candidateIndex === index || records[candidateIndex].area <= record.area || !pointInPolygon(record.polygon[0], records[candidateIndex].polygon)) continue;
      if (parentIndex < 0 || records[candidateIndex].area < records[parentIndex].area) parentIndex = candidateIndex;
    }
    return parentIndex;
  });

  if (records.length === 0 && openCount > 0 && allPaths.length > 0) {
    throw new Error("All profile paths are open. Close at least one loop before finishing the sketch.");
  }
  return { records, depths, parentIndexes };
}

function regionsAtDepths(profile: SketchProfile, includeDepth: (depth: number) => boolean) {
  const { records, depths, parentIndexes } = cadSketchRegionTopology(profile);
  const regions = records.flatMap((record, index) => {
    if (!includeDepth(depths[index])) return [];
    const holes = records.flatMap((candidate, candidateIndex) => parentIndexes[candidateIndex] === index ? [candidate.path] : []);
    return [{ id: record.path.id, outer: record.path, holes }];
  });
  regions.forEach((region) => region.holes.sort((a, b) => a.id.localeCompare(b.id)));
  return regions.sort((a, b) => a.id.localeCompare(b.id));
}

export function cadSketchRegions(profile: SketchProfile): CadSketchRegion[] {
  const arranged = arrangementRegions(profile);
  if (arranged) return arranged.filter((region) => (region.coverage ?? 0) % 2 === 1);
  return regionsAtDepths(profile, (depth) => depth % 2 === 0);
}

export function cadSketchSelectableRegions(profile: SketchProfile): CadSketchRegion[] {
  const arranged = arrangementRegions(profile);
  if (arranged) return arranged;
  return regionsAtDepths(profile, () => true);
}

export function selectedCadSketchRegions(profile: SketchProfile, regionIds?: readonly string[]) {
  if (regionIds === undefined) return cadSketchRegions(profile);
  const regions = cadSketchSelectableRegions(profile);
  const selected = new Set(regionIds);
  return regions.filter((region) => selected.has(region.id));
}

export function cadSketchProfileForRegions(profile: SketchProfile, regionIds?: readonly string[]): SketchProfile {
  if (regionIds === undefined) return profile;
  const regions = selectedCadSketchRegions(profile, regionIds);
  const segmentIds = new Set(regions.flatMap((region) => [region.outer, ...region.holes].flatMap((path) => path.steps.map((step) => step.segment.id))));
  const segments = profile.segments.filter((segment) => segmentIds.has(segment.id));
  const pointIds = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  const anchorIncluded = (anchor: SketchDimensionAnchor) => {
    if (anchor.kind === "point") return pointIds.has(anchor.pointId);
    if (anchor.kind === "midpoint") return segmentIds.has(anchor.segmentId);
    return segmentIds.has(anchor.firstSegmentId) && segmentIds.has(anchor.secondSegmentId);
  };
  return {
    ...profile,
    points: profile.points.filter((point) => pointIds.has(point.id)),
    segments,
    constraints: profile.constraints?.filter((constraint) => constraint.kind === "fixed" ? pointIds.has(constraint.pointId) : segmentIds.has(constraint.segmentId)),
    dimensions: profile.dimensions?.filter((dimension) => dimension.kind === "length"
      ? segmentIds.has(dimension.segmentId)
      : anchorIncluded(dimension.start) && anchorIncluded(dimension.end)),
  };
}
