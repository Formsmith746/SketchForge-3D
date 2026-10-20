import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type OrderedCadSketchStep = { segment: SketchSegment; from: SketchPoint; to: SketchPoint };
export type OrderedCadSketchPath = { id: string; points: SketchPoint[]; steps: OrderedCadSketchStep[]; closed: boolean };
export type CadSketchRegion = { outer: OrderedCadSketchPath; holes: OrderedCadSketchPath[] };

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
    paths.push({ id: seed.id, points, steps, closed: currentId === startId && steps.length >= 3 });
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

export function cadSketchRegions(profile: SketchProfile): CadSketchRegion[] {
  const allPaths = orderedCadSketchPaths(profile);
  const openCount = allPaths.filter((path) => !path.closed).length;
  const records = allPaths
    .filter((path) => path.closed)
    .map((path) => {
      const polygon = sampledPath(path);
      return { path, polygon, area: Math.abs(signedArea(polygon)) };
    })
    .filter((record) => record.polygon.length >= 3 && record.area > 1e-8)
    .sort((a, b) => b.area - a.area);

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

  const regions: CadSketchRegion[] = [];
  records.forEach((record, index) => {
    const depth = depths[index];
    if (depth % 2 === 0) {
      regions.push({ outer: record.path, holes: [] });
    } else {
      // Odd depth: find the nearest even-depth ancestor (smallest containing solid)
      let bestParent: (typeof records)[number] | null = null;
      for (let i = 0; i < records.length; i++) {
        if (i === index) continue;
        if (depths[i] % 2 === 0 && depths[i] < depth && records[i].area > record.area && pointInPolygon(record.polygon[0], records[i].polygon)) {
          if (!bestParent || records[i].area < bestParent.area) {
            bestParent = records[i];
          }
        }
      }
      if (bestParent) {
        const region = regions.find((r) => r.outer === bestParent!.path);
        if (region) region.holes.push(record.path);
      }
    }
  });

  if (regions.length === 0 && openCount > 0 && allPaths.length > 0) {
    throw new Error("All profile paths are open. Close at least one loop before finishing the sketch.");
  }
  return regions;
}
