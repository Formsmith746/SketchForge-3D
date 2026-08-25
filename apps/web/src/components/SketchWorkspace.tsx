"use client";

import { ChevronUp, CornerDownRight, Home, Link, Link2Off, LockKeyhole, LockKeyholeOpen, Minus, Plus, Split, Trash2, Waves } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { SnapGridControl } from "@/components/workplane/ShapeInspector";
import { SketchRevolvePreview } from "@/components/SketchRevolvePreview";
import { parseMeasurementInput } from "@/lib/measurementUnits";
import { WORKPLANE_MAJOR_GRID_INTERVAL } from "@/lib/workplaneGrid";
import { closestPointOnSketchSegment, type SketchSegmentPlacement } from "@/lib/sketchPointRefinement";
import { mirrorSign, resizedImportedMeshPositions } from "@/lib/workplaneShapes";
import { circleFromPoints } from "@/lib/sketchCircles";
import { moveConstrainedSketchPoint } from "@/lib/sketchConstraints";
import { rectFromPoints } from "@/lib/sketchRectangles";
import { polygonFromPoints } from "@/lib/sketchPolygons";
import { cadSketchSelectableRegions } from "@/lib/sketchCadProfile";
import { sketchDimensionAnchorCandidates, sketchDimensionAnchorKey, sketchDimensionAnchorPoint, sketchDistanceDimensionValue, type SketchDimensionAnchorCandidate } from "@/lib/sketchDimensions";
import { dedupeSketchSnapCandidates, snapSketchPoint, type SketchSnapCandidate, type SketchSnapResult } from "@/lib/sketchSnapping";
import { translateSketchPoints } from "@/lib/sketchTransforms";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE, normalizeSnapGrid, normalizeWorkspaceSettings } from "@/lib/workplaneSettings";
import type { GridSize, SketchDimensionAnchor, SketchImage, SketchOperation, SketchPoint, SketchProfile, SketchSegment, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

export type SketchPrimitive = "rectangle" | "circle" | "triangle" | "hexagon";
export type SketchTool = "line" | "bezier" | "smooth" | "circle-center" | "circle-diameter" | "rect-corner" | "rect-center" | "poly-inscribed" | "poly-circumscribed" | "poly-edge" | "text" | SketchPrimitive | "select" | "refine" | "erase" | "dimension" | "measure";
export type SketchCircleDraft = {
  tool: "circle-center" | "circle-diameter";
  first: { x: number; z: number };
};
export type SketchRectDraft = {
  tool: "rect-corner" | "rect-center";
  first: { x: number; z: number };
};
export type SketchPolygonDraft = {
  tool: "poly-inscribed" | "poly-circumscribed" | "poly-edge";
  first: { x: number; z: number };
  sides: number;
};
export type SketchTextDraft = {
  tool: "text";
  position: { x: number; z: number };
};
export type SketchSelection =
  | { kind: "point"; id: string }
  | { kind: "segment"; id: string }
  | { kind: "image"; id: string }
  | { kind: "text"; id: string }
  | { kind: "multiple"; pointIds: string[]; segmentIds: string[]; imageIds?: string[]; textIds?: string[] }
  | null;
export type SketchMeasurement = { start: SketchPoint; end: SketchPoint } | null;

type SketchWorkspaceProps = {
  profile: SketchProfile;
  operation?: SketchOperation;
  selectedRegionIds: readonly string[];
  revolvePreviewPositions?: number[] | null;
  referenceShapes: WorkplaneShape[];
  tool: SketchTool;
  activePointId: string | null;
  selected: SketchSelection;
  measurement: SketchMeasurement;
  pendingMeasurementStart: SketchPoint | null;
  circleDraft: SketchCircleDraft | null;
  rectDraft: SketchRectDraft | null;
  polygonDraft: SketchPolygonDraft | null;
  textDraft: SketchTextDraft | null;
  initialSnap?: GridSize;
  initialWorkspace?: WorkplaneWorkspaceSettings;
  planeName?: string;
  onPlanePoint: (point: { x: number; z: number }, handles?: { handleIn: { x: number; z: number }; handleOut: { x: number; z: number } }) => void;
  onAddPrimitive: (primitive: SketchPrimitive, center: { x: number; z: number }) => void;
  onPointPress: (id: string) => void;
  onSelectSegment: (id: string) => void;
  onSelectRegion: (id: string) => void;
  onSelectAllRegions: () => void;
  onClearRegionSelection: () => void;
  onSelectMany: (pointIds: string[], segmentIds: string[], imageIds: string[], textIds: string[]) => void;
  onSelectImage: (id: string) => void;
  onSelectText: (id: string) => void;
  onUpdateImage: (id: string, patch: Partial<SketchImage>, message?: string) => void;
  onDeleteImage: (id: string) => void;
  onDeletePoint: (id: string) => void;
  onDeleteSegment: (id: string) => void;
  onMovePoint: (id: string, point: { x: number; z: number }) => void;
  onMovePoints: (ids: string[], delta: { x: number; z: number }) => void;
  onTransformPoints: (points: SketchPoint[], message?: string) => void;
  onMoveHandle: (id: string, handle: "in" | "out", point: { x: number; z: number }) => void;
  onMoveDimension: (segmentId: string, offset: { x: number; z: number }) => void;
  onInsertPoint: (segmentId: string, point: { x: number; z: number }, amount: number) => void;
  onSetPointMode: (id: string, mode: "corner" | "smooth" | "split") => void;
  onTogglePointFixed: (id: string) => void;
  onToggleSegmentConstraint: (id: string, kind: "horizontal" | "vertical") => void;
  onSetSegmentLength: (id: string, value: number | null) => void;
  onAddDistanceDimension: (start: SketchDimensionAnchor, end: SketchDimensionAnchor) => void;
  onDeleteDimension: (id: string) => void;
  onClearMeasurement: () => void;
  onTextSubmit: (text: string) => void;
  onTextCancel: () => void;
};

type PathStep = { segment: SketchSegment; from: SketchPoint; to: SketchPoint };
type DisplayPath = { id: string; points: SketchPoint[]; steps: PathStep[]; closed: boolean };
type SketchReferenceFootprint = { fillD: string | null; outlineD: string | null };
type PointerAction =
  | { kind: "bezier"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number } }
  | { kind: "move-point"; pointerId: number; pointId: string; current: { x: number; z: number } }
  | { kind: "move-center"; pointerId: number; centerId: string; pointIds: string[]; origin: { x: number; z: number }; current: { x: number; z: number } }
  | { kind: "move-selection"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number }; startPoints: SketchPoint[] }
  | { kind: "resize-selection"; pointerId: number; handle: ResizeHandle; current: { x: number; z: number }; startPoints: SketchPoint[]; bounds: SelectionBounds }
  | { kind: "move-handle"; pointerId: number; pointId: string; handle: "in" | "out"; current: { x: number; z: number } }
  | { kind: "move-dimension"; pointerId: number; segmentId: string; origin: { x: number; z: number }; current: { x: number; z: number }; grabOffset: { x: number; z: number } }
  | { kind: "pan"; pointerId: number; clientX: number; clientY: number }
  | { kind: "marquee"; pointerId: number; origin: { x: number; z: number }; current: { x: number; z: number } }
  | { kind: "move-image"; pointerId: number; imageId: string; origin: { x: number; z: number }; current: { x: number; z: number }; start: SketchImage }
  | { kind: "resize-image"; pointerId: number; imageId: string; handle: ResizeHandle; current: { x: number; z: number }; start: SketchImage };

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type SelectionBounds = { minX: number; maxX: number; minZ: number; maxZ: number; width: number; depth: number; cx: number; cz: number };

function snapStep(size: GridSize) {
  if (size === "Off") return 0;
  if (size === "Brick") return 8;
  return Number.parseFloat(size) || 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resizeSketchImage(start: SketchImage, handle: ResizeHandle, point: { x: number; z: number }): Partial<SketchImage> {
  const minimum = 0.5;
  const startsWest = handle.includes("w");
  const startsEast = handle.includes("e");
  const startsNorth = handle.includes("n");
  const startsSouth = handle.includes("s");
  const minX = start.x - start.width / 2;
  const maxX = start.x + start.width / 2;
  const minZ = start.z - start.depth / 2;
  const maxZ = start.z + start.depth / 2;
  const aspect = start.width / Math.max(minimum, start.depth);

  if (start.lockAspect !== false) {
    if ((startsWest || startsEast) && (startsNorth || startsSouth)) {
      const fixedX = startsWest ? maxX : minX;
      const fixedZ = startsNorth ? maxZ : minZ;
      const widthScale = Math.abs(point.x - fixedX) / Math.max(minimum, start.width);
      const depthScale = Math.abs(point.z - fixedZ) / Math.max(minimum, start.depth);
      const scale = Math.max(minimum / Math.min(start.width, start.depth), widthScale, depthScale);
      const width = Math.max(minimum, start.width * scale);
      const depth = Math.max(minimum, start.depth * scale);
      const xDirection = startsWest ? -1 : 1;
      const zDirection = startsNorth ? -1 : 1;
      return { width, depth, x: fixedX + xDirection * width / 2, z: fixedZ + zDirection * depth / 2 };
    }
    if (startsWest || startsEast) {
      const fixedX = startsWest ? maxX : minX;
      const width = Math.max(minimum, Math.abs(point.x - fixedX));
      return { width, depth: Math.max(minimum, width / aspect), x: fixedX + (startsWest ? -1 : 1) * width / 2 };
    }
    const fixedZ = startsNorth ? maxZ : minZ;
    const depth = Math.max(minimum, Math.abs(point.z - fixedZ));
    return { depth, width: Math.max(minimum, depth * aspect), z: fixedZ + (startsNorth ? -1 : 1) * depth / 2 };
  }

  let nextMinX = minX;
  let nextMaxX = maxX;
  let nextMinZ = minZ;
  let nextMaxZ = maxZ;
  if (startsWest) nextMinX = Math.min(point.x, maxX - minimum);
  if (startsEast) nextMaxX = Math.max(point.x, minX + minimum);
  if (startsNorth) nextMinZ = Math.min(point.z, maxZ - minimum);
  if (startsSouth) nextMaxZ = Math.max(point.z, minZ + minimum);
  return {
    x: (nextMinX + nextMaxX) / 2,
    z: (nextMinZ + nextMaxZ) / 2,
    width: nextMaxX - nextMinX,
    depth: nextMaxZ - nextMinZ,
  };
}

function boundsForSketchPoints(points: SketchPoint[]): SelectionBounds | null {
  if (points.length < 2) return null;
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
  };
}

function transformSelectedSketchPoints(points: SketchPoint[], dx: number, dz: number) {
  return points.map((point) => ({
    ...point,
    x: point.x + dx,
    z: point.z + dz,
    handleIn: point.handleIn ? { x: point.handleIn.x + dx, z: point.handleIn.z + dz } : undefined,
    handleOut: point.handleOut ? { x: point.handleOut.x + dx, z: point.handleOut.z + dz } : undefined,
  }));
}

function resizeSketchPoints(points: SketchPoint[], bounds: SelectionBounds, handle: ResizeHandle, current: { x: number; z: number }) {
  const minimum = 0.5;
  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minZ = bounds.minZ;
  let maxZ = bounds.maxZ;
  if (handle.includes("w")) minX = Math.min(current.x, bounds.maxX - minimum);
  if (handle.includes("e")) maxX = Math.max(current.x, bounds.minX + minimum);
  if (handle.includes("n")) minZ = Math.min(current.z, bounds.maxZ - minimum);
  if (handle.includes("s")) maxZ = Math.max(current.z, bounds.minZ + minimum);
  const width = Math.max(minimum, bounds.width);
  const depth = Math.max(minimum, bounds.depth);
  const scaleX = (maxX - minX) / width;
  const scaleZ = (maxZ - minZ) / depth;
  const map = (value: { x: number; z: number }) => ({
    x: minX + (value.x - bounds.minX) * scaleX,
    z: minZ + (value.z - bounds.minZ) * scaleZ,
  });
  return points.map((point) => ({
    ...point,
    ...map(point),
    handleIn: point.handleIn ? map(point.handleIn) : undefined,
    handleOut: point.handleOut ? map(point.handleOut) : undefined,
  }));
}

function formatDimension(value: number, accuracy: 1 | 2 | 3) {
  const threshold = 0.5 * 10 ** -accuracy;
  return (Math.abs(value) < threshold ? 0 : value).toFixed(accuracy);
}

function dimensionPillSize(label: string, screenUnit: number, extra = 24) {
  return {
    width: Math.max(48, label.length * 7.5 + extra) * screenUnit,
    height: 26 * screenUnit,
    radius: 5 * screenUnit,
  };
}

function cubicPoint(start: SketchPoint, first: { x: number; z: number }, second: { x: number; z: number }, end: SketchPoint, amount: number) {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * end.x,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * end.z,
  };
}

function segmentDimension(segment: SketchSegment, pointById: Map<string, SketchPoint>) {
  const start = pointById.get(segment.startId);
  const end = pointById.get(segment.endId);
  if (!start || !end) return null;
  const first = start.handleOut;
  const second = end.handleIn;
  if (segment.kind === "line" || !first || !second) {
    return {
      length: Math.hypot(end.x - start.x, end.z - start.z),
      midpoint: { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 },
    };
  }
  let length = 0;
  let previous = start;
  for (let index = 1; index <= 32; index += 1) {
    const point = cubicPoint(start, first, second, end, index / 32);
    length += Math.hypot(point.x - previous.x, point.z - previous.z);
    previous = { ...point, id: "curve-sample" };
  }
  return { length, midpoint: cubicPoint(start, first, second, end, 0.5) };
}

function orderedPaths(profile: SketchProfile): DisplayPath[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const adjacency = new Map<string, Array<{ pointId: string; segment: SketchSegment }>>();
  profile.points.forEach((point) => adjacency.set(point.id, []));
  const valid = profile.segments.filter((segment) => {
    if (!pointById.has(segment.startId) || !pointById.has(segment.endId)) return false;
    adjacency.get(segment.startId)?.push({ pointId: segment.endId, segment });
    adjacency.get(segment.endId)?.push({ pointId: segment.startId, segment });
    return true;
  });
  const unvisited = new Set(valid.map((segment) => segment.id));
  const paths: DisplayPath[] = [];
  while (unvisited.size > 0) {
    const seedId = unvisited.values().next().value as string;
    const seed = valid.find((segment) => segment.id === seedId);
    if (!seed) break;
    const component = new Set<string>();
    const queue = [seed.startId, seed.endId];
    while (queue.length) {
      const id = queue.pop();
      if (!id || component.has(id)) continue;
      component.add(id);
      adjacency.get(id)?.forEach((edge) => queue.push(edge.pointId));
    }
    const startId = [...component].find((id) => (adjacency.get(id)?.filter((edge) => unvisited.has(edge.segment.id)).length ?? 0) === 1) ?? seed.startId;
    const first = pointById.get(startId);
    if (!first) break;
    const points = [first];
    const steps: PathStep[] = [];
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

function curveControls(step: PathStep) {
  const forward = step.segment.startId === step.from.id;
  return {
    first: forward ? step.from.handleOut : step.from.handleIn,
    second: forward ? step.to.handleIn : step.to.handleOut,
  };
}

function pathData(path: DisplayPath) {
  const first = path.points[0];
  if (!first) return "";
  const commands = [`M ${first.x} ${first.z}`];
  path.steps.forEach((step) => {
    const controls = curveControls(step);
    if (step.segment.kind !== "line" && controls.first && controls.second) {
      commands.push(`C ${controls.first.x} ${controls.first.z} ${controls.second.x} ${controls.second.z} ${step.to.x} ${step.to.z}`);
    } else {
      commands.push(`L ${step.to.x} ${step.to.z}`);
    }
  });
  if (path.closed) commands.push("Z");
  return commands.join(" ");
}

function segmentData(segment: SketchSegment, pointById: Map<string, SketchPoint>) {
  const from = pointById.get(segment.startId);
  const to = pointById.get(segment.endId);
  if (!from || !to) return "";
  const step = { segment, from, to };
  const controls = curveControls(step);
  return segment.kind !== "line" && controls.first && controls.second
    ? `M ${from.x} ${from.z} C ${controls.first.x} ${controls.first.z} ${controls.second.x} ${controls.second.z} ${to.x} ${to.z}`
    : `M ${from.x} ${from.z} L ${to.x} ${to.z}`;
}

function isRoundReference(shape: WorkplaneShape) {
  return ["cylinder", "sphere", "cone", "torus", "tube", "ring", "halfSphere"].includes(shape.kind);
}

function sketchReferencePoint(shape: WorkplaneShape, x: number, z: number) {
  return {
    x: shape.x + x * mirrorSign(shape.mirrorX),
    z: shape.z + z * mirrorSign(shape.mirrorZ),
  };
}

function pointKey(point: { x: number; z: number }, tolerance: number) {
  return `${Math.round(point.x / tolerance)},${Math.round(point.z / tolerance)}`;
}

function triangleArea2d(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }) {
  return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
}

function trianglePath(points: Array<{ x: number; z: number }>) {
  return `M ${points[0].x} ${points[0].z} L ${points[1].x} ${points[1].z} L ${points[2].x} ${points[2].z} Z`;
}

function convexHull(points: Array<{ x: number; z: number }>) {
  const unique = new Map<string, { x: number; z: number }>();
  points.forEach((point) => unique.set(pointKey(point, 0.001), point));
  const sorted = [...unique.values()].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  if (sorted.length <= 2) return sorted;
  const cross = (origin: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
  const lower: Array<{ x: number; z: number }> = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Array<{ x: number; z: number }> = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function boundaryPath(points: Array<{ x: number; z: number }>, triangles: number[][], tolerance: number) {
  const pointByKey = new Map<string, { x: number; z: number }>();
  const edgeCounts = new Map<string, { count: number; a: string; b: string }>();
  const addEdge = (aIndex: number, bIndex: number) => {
    const a = points[aIndex];
    const b = points[bIndex];
    const aKey = pointKey(a, tolerance);
    const bKey = pointKey(b, tolerance);
    pointByKey.set(aKey, a);
    pointByKey.set(bKey, b);
    const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    const current = edgeCounts.get(key);
    edgeCounts.set(key, current ? { ...current, count: current.count + 1 } : { count: 1, a: aKey, b: bKey });
  };
  triangles.forEach(([a, b, c]) => {
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  });

  const boundaryEdges = [...edgeCounts.values()].filter((edge) => edge.count === 1);
  if (boundaryEdges.length === 0) return null;
  const adjacency = new Map<string, string[]>();
  boundaryEdges.forEach(({ a, b }) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const unused = new Set(boundaryEdges.map(({ a, b }) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  const takeEdge = (a: string, b: string) => unused.delete(a < b ? `${a}|${b}` : `${b}|${a}`);
  const hasEdge = (a: string, b: string) => unused.has(a < b ? `${a}|${b}` : `${b}|${a}`);
  const commands: string[] = [];

  while (unused.size > 0) {
    const firstKey = unused.values().next().value as string;
    const [start, firstNext] = firstKey.split("|");
    const chain = [start, firstNext];
    takeEdge(start, firstNext);
    while (chain.length <= boundaryEdges.length + 1) {
      const current = chain[chain.length - 1];
      const previous = chain[chain.length - 2];
      const next = (adjacency.get(current) ?? []).find((candidate) => candidate !== previous && hasEdge(current, candidate))
        ?? (adjacency.get(current) ?? []).find((candidate) => hasEdge(current, candidate));
      if (!next) break;
      takeEdge(current, next);
      chain.push(next);
      if (next === start) break;
    }
    const startPoint = pointByKey.get(chain[0]);
    if (!startPoint) continue;
    const pointsD = chain
      .slice(1)
      .map((key) => pointByKey.get(key))
      .filter((point): point is { x: number; z: number } => Boolean(point))
      .map((point) => `L ${point.x} ${point.z}`);
    commands.push(`M ${startPoint.x} ${startPoint.z} ${pointsD.join(" ")}${chain[chain.length - 1] === chain[0] ? " Z" : ""}`);
  }

  return commands.join(" ");
}

function importedMeshFootprint(shape: WorkplaneShape): SketchReferenceFootprint | null {
  if (!shape.importedMesh) return null;
  const positions = resizedImportedMeshPositions(shape);
  if (positions.length < 9) return null;
  let minY = Number.POSITIVE_INFINITY;
  for (let index = 1; index < positions.length; index += 3) {
    minY = Math.min(minY, positions[index]);
  }
  if (!Number.isFinite(minY)) return null;

  const tolerance = Math.max(0.001, Math.max(shape.width, shape.depth, shape.height) / 100000);
  const bottomTolerance = Math.max(0.025, shape.height * 0.003);
  const points: Array<{ x: number; z: number }> = [];
  const triangles: number[][] = [];
  const allProjected: Array<{ x: number; z: number }> = [];

  for (let index = 0; index + 8 < positions.length; index += 9) {
    const ys = [positions[index + 1], positions[index + 4], positions[index + 7]];
    const projected = [
      sketchReferencePoint(shape, positions[index], positions[index + 2]),
      sketchReferencePoint(shape, positions[index + 3], positions[index + 5]),
      sketchReferencePoint(shape, positions[index + 6], positions[index + 8]),
    ];
    allProjected.push(...projected);
    if (!ys.every((value) => value <= minY + bottomTolerance) || triangleArea2d(projected[0], projected[1], projected[2]) <= tolerance) {
      continue;
    }
    const offset = points.length;
    points.push(...projected);
    triangles.push([offset, offset + 1, offset + 2]);
  }

  if (triangles.length > 0) {
    return {
      fillD: triangles.length <= 5000 ? triangles.map((triangle) => trianglePath(triangle.map((index) => points[index]))).join(" ") : null,
      outlineD: boundaryPath(points, triangles, tolerance),
    };
  }

  const hull = convexHull(allProjected);
  if (hull.length < 3) return null;
  const d = `M ${hull[0].x} ${hull[0].z} ${hull.slice(1).map((point) => `L ${point.x} ${point.z}`).join(" ")} Z`;
  return { fillD: d, outlineD: d };
}

export function SketchWorkspace({
  profile,
  operation = "extrude",
  selectedRegionIds,
  revolvePreviewPositions = null,
  referenceShapes,
  tool,
  activePointId,
  selected,
  measurement,
  pendingMeasurementStart,
  circleDraft,
  rectDraft,
  polygonDraft,
  textDraft,
  initialSnap,
  initialWorkspace,
  planeName = "Base XZ plane",
  onPlanePoint,
  onAddPrimitive,
  onPointPress,
  onSelectSegment,
  onSelectRegion,
  onSelectAllRegions,
  onClearRegionSelection,
  onSelectMany,
  onSelectImage,
  onSelectText,
  onUpdateImage,
  onDeleteImage,
  onDeletePoint,
  onDeleteSegment,
  onMovePoint,
  onMovePoints,
  onTransformPoints,
  onMoveHandle,
  onMoveDimension,
  onInsertPoint,
  onSetPointMode,
  onTogglePointFixed,
  onToggleSegmentConstraint,
  onSetSegmentLength,
  onAddDistanceDimension,
  onDeleteDimension,
  onClearMeasurement,
  onTextSubmit,
  onTextCancel,
}: SketchWorkspaceProps) {
  const workspace = useMemo(() => normalizeWorkspaceSettings(initialWorkspace, DEFAULT_WORKPLANE_WORKSPACE), [initialWorkspace]);
  const [snap, setSnap] = useState<GridSize>(() => normalizeSnapGrid(initialSnap, DEFAULT_SNAP_GRID));
  const [snapOpen, setSnapOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, z: 0 });
  const [hover, setHover] = useState<SketchSnapResult | null>(null);
  const [snapToGridLines, setSnapToGridLines] = useState(false);
  const [snapToGeometry, setSnapToGeometry] = useState(true);
  const [refinePreview, setRefinePreview] = useState<{ segmentId: string; placement: SketchSegmentPlacement } | null>(null);
  const [pointerAction, setPointerAction] = useState<PointerAction | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const [textDraftValue, setTextDraftValue] = useState("");
  const [pendingDimensionAnchor, setPendingDimensionAnchor] = useState<SketchDimensionAnchorCandidate | null>(null);
  useEffect(() => {
    if (textDraft) {
      setTextDraftValue("");
      requestAnimationFrame(() => textInputRef.current?.focus());
    }
  }, [textDraft]);
  const width = workspace.width / zoom;
  const depth = workspace.depth / zoom;
  const screenUnit = useMemo(() => {
    const fittedScale = Math.min(
      svgSize.width > 0 ? svgSize.width / width : 0,
      svgSize.height > 0 ? svgSize.height / depth : 0,
    );
    return fittedScale > 0 ? 1 / fittedScale : Math.max(width, depth) / 720;
  }, [depth, svgSize.height, svgSize.width, width]);
  const displayProfile = useMemo(() => {
    if (pointerAction?.kind === "move-selection") {
      const moved = transformSelectedSketchPoints(
        pointerAction.startPoints,
        pointerAction.current.x - pointerAction.origin.x,
        pointerAction.current.z - pointerAction.origin.z,
      );
      const movedById = new Map(moved.map((point) => [point.id, point]));
      return { ...profile, points: profile.points.map((point) => movedById.get(point.id) ?? point) };
    }
    if (pointerAction?.kind === "resize-selection") {
      const resized = resizeSketchPoints(pointerAction.startPoints, pointerAction.bounds, pointerAction.handle, pointerAction.current);
      const resizedById = new Map(resized.map((point) => [point.id, point]));
      return { ...profile, points: profile.points.map((point) => resizedById.get(point.id) ?? point) };
    }
    if (pointerAction?.kind === "move-point") {
      return moveConstrainedSketchPoint(profile, pointerAction.pointId, pointerAction.current).profile;
    }
    if (pointerAction?.kind === "move-center") {
      return translateSketchPoints(profile, pointerAction.pointIds, {
        x: pointerAction.current.x - pointerAction.origin.x,
        z: pointerAction.current.z - pointerAction.origin.z,
      });
    }
    if (pointerAction?.kind === "move-handle") {
      return {
        ...profile,
        points: profile.points.map((point) => {
          if (point.id !== pointerAction.pointId) return point;
          const next = { ...point, handleIn: point.handleIn ? { ...point.handleIn } : undefined, handleOut: point.handleOut ? { ...point.handleOut } : undefined };
          if (pointerAction.handle === "in") next.handleIn = { ...pointerAction.current };
          else next.handleOut = { ...pointerAction.current };
          if (point.mode === "smooth") {
            const opposite = { x: point.x * 2 - pointerAction.current.x, z: point.z * 2 - pointerAction.current.z };
            if (pointerAction.handle === "in") next.handleOut = opposite;
            else next.handleIn = opposite;
          }
          return next;
        }),
      };
    }
    return profile;
  }, [pointerAction, profile]);
  const displayImages = useMemo(() => {
    const images = profile.images ?? [];
    if (pointerAction?.kind === "move-image") {
      const deltaX = pointerAction.current.x - pointerAction.origin.x;
      const deltaZ = pointerAction.current.z - pointerAction.origin.z;
      return images.map((image) => image.id === pointerAction.imageId ? { ...image, x: pointerAction.start.x + deltaX, z: pointerAction.start.z + deltaZ } : image);
    }
    if (pointerAction?.kind === "resize-image") {
      return images.map((image) => image.id === pointerAction.imageId ? { ...image, ...resizeSketchImage(pointerAction.start, pointerAction.handle, pointerAction.current) } : image);
    }
    return images;
  }, [pointerAction, profile.images]);
  const pointById = useMemo(() => new Map(displayProfile.points.map((point) => [point.id, point])), [displayProfile.points]);
  const paths = useMemo(() => orderedPaths(displayProfile), [displayProfile]);
  const dimensionAnchorCandidates = useMemo(() => tool === "dimension" ? sketchDimensionAnchorCandidates(displayProfile) : [], [displayProfile, tool]);
  const regions = useMemo(() => {
    if (operation !== "extrude") return [];
    try {
      return cadSketchSelectableRegions(displayProfile);
    } catch {
      return [];
    }
  }, [displayProfile, operation]);
  const selectedRegionIdSet = useMemo(() => new Set(selectedRegionIds), [selectedRegionIds]);
  const fixedPointIds = useMemo(() => new Set((profile.constraints ?? []).flatMap((constraint) => constraint.kind === "fixed" ? [constraint.pointId] : [])), [profile.constraints]);
  const horizontalSegmentIds = useMemo(() => new Set((profile.constraints ?? []).flatMap((constraint) => constraint.kind === "horizontal" ? [constraint.segmentId] : [])), [profile.constraints]);
  const verticalSegmentIds = useMemo(() => new Set((profile.constraints ?? []).flatMap((constraint) => constraint.kind === "vertical" ? [constraint.segmentId] : [])), [profile.constraints]);
  const dimensionBySegmentId = useMemo(() => new Map((profile.dimensions ?? []).flatMap((dimension) => dimension.kind === "length" ? [[dimension.segmentId, dimension] as const] : [])), [profile.dimensions]);
  const activePoint = activePointId ? pointById.get(activePointId) ?? null : null;
  const selectedPoint = selected?.kind === "point" ? pointById.get(selected.id) ?? null : null;
  const selectedSegment = selected?.kind === "segment" ? displayProfile.segments.find((segment) => segment.id === selected.id) ?? null : null;
  const selectedImage = selected?.kind === "image" ? displayImages.find((image) => image.id === selected.id) ?? null : null;
  const selectedGeometryPoints = selected?.kind === "multiple"
    ? selected.pointIds.map((id) => pointById.get(id)).filter((point): point is SketchPoint => Boolean(point))
    : [];
  const selectedGeometryBounds = boundsForSketchPoints(selectedGeometryPoints);
  const isPointSelected = (id: string) => selected?.kind === "point" ? selected.id === id : selected?.kind === "multiple" ? selected.pointIds.includes(id) : false;
  const isSegmentSelected = (id: string) => selected?.kind === "segment" ? selected.id === id : selected?.kind === "multiple" ? selected.segmentIds.includes(id) : false;
  const gridStep = clamp(workspace.gridBlockSize, 1, 200);
  useEffect(() => {
    if (tool !== "dimension") setPendingDimensionAnchor(null);
  }, [tool]);
  useEffect(() => {
    if (pendingDimensionAnchor && !dimensionAnchorCandidates.some((candidate) => candidate.id === pendingDimensionAnchor.id)) setPendingDimensionAnchor(null);
  }, [dimensionAnchorCandidates, pendingDimensionAnchor]);
  const chooseDimensionAnchor = (candidate: SketchDimensionAnchorCandidate) => {
    if (!pendingDimensionAnchor) {
      setPendingDimensionAnchor(candidate);
      return;
    }
    if (sketchDimensionAnchorKey(pendingDimensionAnchor.anchor) === sketchDimensionAnchorKey(candidate.anchor)) {
      setPendingDimensionAnchor(null);
      return;
    }
    onAddDistanceDimension(pendingDimensionAnchor.anchor, candidate.anchor);
    setPendingDimensionAnchor(null);
  };
  const verticalLines = useMemo(() => {
    const lines: number[] = [];
    const start = Math.ceil((-workspace.width / 2) / gridStep) * gridStep;
    for (let x = start; x <= workspace.width / 2 + 0.0001; x += gridStep) lines.push(Number(x.toFixed(6)));
    return lines;
  }, [gridStep, workspace.width]);
  const horizontalLines = useMemo(() => {
    const lines: number[] = [];
    const start = Math.ceil((-workspace.depth / 2) / gridStep) * gridStep;
    for (let z = start; z <= workspace.depth / 2 + 0.0001; z += gridStep) lines.push(Number(z.toFixed(6)));
    return lines;
  }, [gridStep, workspace.depth]);

  const centerSnapCandidates = useMemo<SketchSnapCandidate[]>(() => paths
    .filter((path) => path.closed && path.points.length >= 3)
    .map((path) => {
      const xs = path.points.map((point) => point.x);
      const zs = path.points.map((point) => point.z);
      return {
        id: `center:${path.id}`,
        kind: "center" as const,
        label: "Center",
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...zs) + Math.max(...zs)) / 2,
        ownerPointIds: path.points.map((point) => point.id),
      };
    }), [paths]);
  const snapCandidates = useMemo(() => dedupeSketchSnapCandidates([
    ...displayProfile.points.map((point) => ({
      id: `point:${point.id}`,
      kind: "point" as const,
      label: "Point",
      x: point.x,
      z: point.z,
      ownerPointIds: [point.id],
    })),
    ...displayProfile.segments.flatMap((segment) => {
      const dimension = segmentDimension(segment, pointById);
      return dimension ? [{
        id: `midpoint:${segment.id}`,
        kind: "midpoint" as const,
        label: "Midpoint",
        x: dimension.midpoint.x,
        z: dimension.midpoint.z,
        ownerPointIds: [segment.startId, segment.endId],
      }] : [];
    }),
    ...centerSnapCandidates,
    ...(profile.texts ?? []).map((text) => ({
      id: `text:${text.id}`,
      kind: "center" as const,
      label: "Text anchor",
      x: text.x,
      z: text.z,
    })),
  ]), [centerSnapCandidates, displayProfile.points, displayProfile.segments, pointById, profile.texts]);

  const pointFromEvent = (event: { clientX: number; clientY: number }, magnetic = true) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const screenPoint = svg.createSVGPoint();
    screenPoint.x = event.clientX;
    screenPoint.y = event.clientY;
    const local = screenPoint.matrixTransform(matrix.inverse());
    let candidates = snapCandidates;
    if (pointerAction?.kind === "move-point") {
      candidates = candidates.filter((candidate) => !candidate.ownerPointIds?.includes(pointerAction.pointId));
    } else if (pointerAction?.kind === "move-center") {
      const movingPointIds = new Set(pointerAction.pointIds);
      candidates = candidates.filter((candidate) => !candidate.ownerPointIds?.some((id) => movingPointIds.has(id)));
    }
    const snapped = snapSketchPoint({ x: local.x, z: local.y }, {
      precisionStep: snapStep(snap),
      gridStep,
      tolerance: 10 * screenUnit,
      snapToGridLines: magnetic && snapToGridLines,
      snapToGeometry: magnetic && snapToGeometry,
      candidates,
    });
    return {
      ...snapped,
      x: clamp(snapped.x, -workspace.width / 2, workspace.width / 2),
      z: clamp(snapped.z, -workspace.depth / 2, workspace.depth / 2),
    };
  };

  const svgToScreen = (svgX: number, svgZ: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { left: 0, top: 0 };
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = svgX;
    svgPoint.y = svgZ;
    const screen = svgPoint.matrixTransform(matrix);
    const stage = svg.closest(".sketch-workspace-stage")?.getBoundingClientRect();
    if (!stage) return { left: screen.x, top: screen.y };
    return { left: screen.x - stage.left, top: screen.y - stage.top };
  };

  useEffect(() => {
    if (tool !== "refine") setRefinePreview(null);
  }, [tool]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const bounds = svg.getBoundingClientRect();
      setSvgSize({ width: bounds.width, height: bounds.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => clamp(current * (event.deltaY > 0 ? 0.88 : 1.14), 0.75, 6));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const beginPan = (event: ReactPointerEvent<SVGElement>) => {
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setPointerAction({ kind: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
  };

  const isPanGesture = (event: ReactPointerEvent<SVGElement>) => event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey));

  const handlePlanePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (isPanGesture(event)) {
      beginPan(event);
      return;
    }
    if (event.button !== 0 || (event.target !== event.currentTarget && (event.target as Element).closest("[data-sketch-entity]"))) return;
    const point = pointFromEvent(event, tool !== "select");
    if (!point) return;
    event.preventDefault();
    if (tool === "bezier") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerAction({ kind: "bezier", pointerId: event.pointerId, origin: point, current: point });
    } else if (tool === "select") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerAction({ kind: "marquee", pointerId: event.pointerId, origin: point, current: point });
    } else if (tool === "line" || tool === "smooth" || tool === "circle-center" || tool === "circle-diameter" || tool === "rect-corner" || tool === "rect-center" || tool === "poly-inscribed" || tool === "poly-circumscribed" || tool === "poly-edge" || tool === "text" || tool === "measure") {
      onPlanePoint(point);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointerAction?.kind === "pan") {
      const matrix = svgRef.current?.getScreenCTM();
      const scaleX = matrix ? Math.max(0.0001, Math.hypot(matrix.a, matrix.b)) : 1;
      const scaleY = matrix ? Math.max(0.0001, Math.hypot(matrix.c, matrix.d)) : 1;
      const deltaX = event.clientX - pointerAction.clientX;
      const deltaY = event.clientY - pointerAction.clientY;
      setPan((current) => ({
        x: clamp(current.x - deltaX / scaleX, -workspace.width / 2, workspace.width / 2),
        z: clamp(current.z - deltaY / scaleY, -workspace.depth / 2, workspace.depth / 2),
      }));
      setPointerAction({ ...pointerAction, clientX: event.clientX, clientY: event.clientY });
      return;
    }
    const magnetic = pointerAction
      ? pointerAction.kind === "bezier" || pointerAction.kind === "move-point" || pointerAction.kind === "move-center" || pointerAction.kind === "move-handle"
      : tool !== "select";
    const point = pointFromEvent(event, magnetic);
    setHover(point);
    if (point && pointerAction) setPointerAction({ ...pointerAction, current: point });
  };

  const finishPointerAction = (event: ReactPointerEvent<SVGSVGElement>) => {
    const action = pointerAction;
    if (!action || action.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (action.kind === "pan") {
      setPointerAction(null);
      return;
    }
    if (action.kind === "marquee") {
      const minX = Math.min(action.origin.x, action.current.x);
      const maxX = Math.max(action.origin.x, action.current.x);
      const minZ = Math.min(action.origin.z, action.current.z);
      const maxZ = Math.max(action.origin.z, action.current.z);
      const contains = (point: { x: number; z: number }) => point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ;
      const pointIds = profile.points.filter((point) => contains(point)).map((point) => point.id);
      const segmentIds = profile.segments.filter((segment) => {
        const start = pointById.get(segment.startId);
        const end = pointById.get(segment.endId);
        return Boolean(start && end && (contains(start) || contains(end) || contains({ x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 })));
      }).map((segment) => segment.id);
      const imageIds = (profile.images ?? []).filter((image) => {
        const imageMinX = image.x - image.width / 2;
        const imageMaxX = image.x + image.width / 2;
        const imageMinZ = image.z - image.depth / 2;
        const imageMaxZ = image.z + image.depth / 2;
        return imageMaxX >= minX && imageMinX <= maxX && imageMaxZ >= minZ && imageMinZ <= maxZ;
      }).map((image) => image.id);
      const textIds = (profile.texts ?? []).filter((text) => {
        return text.x >= minX && text.x <= maxX && text.z >= minZ && text.z <= maxZ;
      }).map((text) => text.id);
      onSelectMany(pointIds, segmentIds, imageIds, textIds);
      setPointerAction(null);
      return;
    }
    if (action.kind === "bezier") {
      const dx = action.current.x - action.origin.x;
      const dz = action.current.z - action.origin.z;
      onPlanePoint(action.origin, {
        handleIn: { x: action.origin.x - dx, z: action.origin.z - dz },
        handleOut: { x: action.origin.x + dx, z: action.origin.z + dz },
      });
    } else if (action.kind === "move-selection") {
      onTransformPoints(
        transformSelectedSketchPoints(action.startPoints, action.current.x - action.origin.x, action.current.z - action.origin.z),
        "Sketch shape moved",
      );
    } else if (action.kind === "resize-selection") {
      onTransformPoints(resizeSketchPoints(action.startPoints, action.bounds, action.handle, action.current), "Sketch shape resized");
    } else if (action.kind === "move-point") {
      onMovePoint(action.pointId, action.current);
    } else if (action.kind === "move-center") {
      const delta = { x: action.current.x - action.origin.x, z: action.current.z - action.origin.z };
      if (Math.hypot(delta.x, delta.z) > screenUnit * 0.1) onMovePoints(action.pointIds, delta);
    } else if (action.kind === "move-handle") {
      onMoveHandle(action.pointId, action.handle, action.current);
    } else if (action.kind === "move-dimension") {
      if (Math.hypot(action.current.x - action.origin.x, action.current.z - action.origin.z) > screenUnit * 0.5) {
        const segment = profile.segments.find((candidate) => candidate.id === action.segmentId);
        const dimension = segment ? segmentDimension(segment, pointById) : null;
        if (dimension) {
          onMoveDimension(action.segmentId, {
            x: action.current.x + action.grabOffset.x - dimension.midpoint.x,
            z: action.current.z + action.grabOffset.z - dimension.midpoint.z,
          });
        }
      }
    } else if (action.kind === "move-image") {
      onUpdateImage(action.imageId, {
        x: action.start.x + action.current.x - action.origin.x,
        z: action.start.z + action.current.z - action.origin.z,
      }, "Sketch image moved");
    } else if (action.kind === "resize-image") {
      onUpdateImage(action.imageId, resizeSketchImage(action.start, action.handle, action.current), "Sketch image resized");
    }
    setPointerAction(null);
  };

  const beginEntityDrag = (event: ReactPointerEvent<SVGElement>, action: PointerAction) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setPointerAction(action);
  };

  const measurementLength = measurement ? Math.hypot(measurement.end.x - measurement.start.x, measurement.end.z - measurement.start.z) : 0;
  const measurementLabel = formatDimension(measurementLength, workspace.accuracy);
  const previewLength = activePoint && hover ? Math.hypot(hover.x - activePoint.x, hover.z - activePoint.z) : 0;
  const previewLabel = formatDimension(previewLength, workspace.accuracy);
  const circlePreview = circleDraft && hover ? (() => {
    return circleFromPoints(circleDraft.tool === "circle-center" ? "center-radius" : "diameter", circleDraft.first, hover);
  })() : null;
  const rectPreview = rectDraft && hover ? (() => {
    return rectFromPoints(rectDraft.tool === "rect-corner" ? "corner" : "center", rectDraft.first, hover);
  })() : null;
  const polygonPreview = polygonDraft && hover ? (() => {
    return polygonFromPoints(
      polygonDraft.tool === "poly-inscribed" ? "inscribed" : polygonDraft.tool === "poly-circumscribed" ? "circumscribed" : "edge",
      polygonDraft.sides,
      polygonDraft.first,
      hover,
    );
  })() : null;
  const labelOffset = 22 * screenUnit;
  const pointRadius = 5 * screenUnit;
  const controlPointRadius = 6 * screenUnit;
  const hoverPointRadius = 5 * screenUnit;
  const handleSize = 12 * screenUnit;
  const handleRadius = 2 * screenUnit;
  const selectedImageBounds = selectedImage ? {
    minX: selectedImage.x - selectedImage.width / 2,
    maxX: selectedImage.x + selectedImage.width / 2,
    minZ: selectedImage.z - selectedImage.depth / 2,
    maxZ: selectedImage.z + selectedImage.depth / 2,
  } : null;
  const imageResizeHandles: Array<{ id: ResizeHandle; x: number; z: number }> = selectedImage && selectedImageBounds ? [
    { id: "nw", x: selectedImageBounds.minX, z: selectedImageBounds.minZ },
    { id: "n", x: selectedImage.x, z: selectedImageBounds.minZ },
    { id: "ne", x: selectedImageBounds.maxX, z: selectedImageBounds.minZ },
    { id: "e", x: selectedImageBounds.maxX, z: selectedImage.z },
    { id: "se", x: selectedImageBounds.maxX, z: selectedImageBounds.maxZ },
    { id: "s", x: selectedImage.x, z: selectedImageBounds.maxZ },
    { id: "sw", x: selectedImageBounds.minX, z: selectedImageBounds.maxZ },
    { id: "w", x: selectedImageBounds.minX, z: selectedImage.z },
  ] : [];
  const selectionResizeHandles: Array<{ id: ResizeHandle; x: number; z: number }> = selectedGeometryBounds ? [
    { id: "nw", x: selectedGeometryBounds.minX, z: selectedGeometryBounds.minZ },
    { id: "n", x: selectedGeometryBounds.cx, z: selectedGeometryBounds.minZ },
    { id: "ne", x: selectedGeometryBounds.maxX, z: selectedGeometryBounds.minZ },
    { id: "e", x: selectedGeometryBounds.maxX, z: selectedGeometryBounds.cz },
    { id: "se", x: selectedGeometryBounds.maxX, z: selectedGeometryBounds.maxZ },
    { id: "s", x: selectedGeometryBounds.cx, z: selectedGeometryBounds.maxZ },
    { id: "sw", x: selectedGeometryBounds.minX, z: selectedGeometryBounds.maxZ },
    { id: "w", x: selectedGeometryBounds.minX, z: selectedGeometryBounds.cz },
  ] : [];
  const referenceFootprints = useMemo(
    () => new Map(referenceShapes.map((shape) => [shape.id, importedMeshFootprint(shape)])),
    [referenceShapes],
  );

  return (
    <main className="sketch-workspace-stage">
      <div className="sketch-mode-badge">{operation === "revolve" ? "Revolve sketch" : "Sketch view"} - {planeName}</div>
      {operation === "extrude" && regions.length > 0 ? (
        <div className="sketch-profile-selection-status">
          <span><strong>{selectedRegionIds.length} of {regions.length}</strong> profiles selected</span>
          <span className="hint">{tool === "select" ? "Click profiles to toggle" : "Use Select to choose profiles"}</span>
          <button type="button" onClick={onSelectAllRegions}>All</button>
          <button type="button" onClick={onClearRegionSelection}>Clear</button>
        </div>
      ) : null}
      {tool === "dimension" ? (
        <div className="sketch-dimension-status">
          {pendingDimensionAnchor ? `First anchor: ${pendingDimensionAnchor.label}. Choose the second anchor.` : "Choose two endpoints, midpoints, or intersections."}
        </div>
      ) : null}
      {operation === "revolve" ? <SketchRevolvePreview positions={revolvePreviewPositions} /> : null}
      <div className="camera-controls sketch-camera-controls" aria-label="Sketch view controls">
        <button aria-label="Reset sketch view" onClick={() => { setZoom(1); setPan({ x: 0, z: 0 }); }}><Home size={28} /></button>
        <button aria-label="Zoom in" onClick={() => setZoom((value) => clamp(value * 1.25, 0.75, 6))}><Plus size={33} /></button>
        <button aria-label="Zoom out" onClick={() => setZoom((value) => clamp(value / 1.25, 0.75, 6))}><Minus size={33} /></button>
      </div>
      <section className="sketch-plate-wrap" aria-label="2D sketch plate">
        <svg
          ref={svgRef}
          className={`sketch-plate tool-${tool} ${pointerAction?.kind === "pan" ? "panning" : ""}`}
          viewBox={`${pan.x - width / 2} ${pan.z - depth / 2} ${width} ${depth}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={handlePlanePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerAction}
          onPointerCancel={() => setPointerAction(null)}
          onPointerLeave={() => {
            if (!pointerAction) setHover(null);
            setRefinePreview(null);
          }}
          onContextMenu={(event) => event.preventDefault()}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("application/x-sketchforge-sketch-primitive")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            const primitive = event.dataTransfer.getData("application/x-sketchforge-sketch-primitive") as SketchPrimitive;
            if (!["rectangle", "circle", "triangle", "hexagon"].includes(primitive)) return;
            event.preventDefault();
            const point = pointFromEvent(event);
            if (point) onAddPrimitive(primitive, point);
          }}
        >
          <rect className="sketch-plate-background" x={-workspace.width / 2} y={-workspace.depth / 2} width={workspace.width} height={workspace.depth} />
          {workspace.showGrid ? (
            <g className="sketch-grid" pointerEvents="none">
              {verticalLines.map((x, index) => <line className={Math.abs(x) < 0.0001 ? "axis" : index % WORKPLANE_MAJOR_GRID_INTERVAL === 0 ? "major" : "minor"} key={`x-${x}`} x1={x} y1={-workspace.depth / 2} x2={x} y2={workspace.depth / 2} />)}
              {horizontalLines.map((z, index) => <line className={Math.abs(z) < 0.0001 ? "axis" : index % WORKPLANE_MAJOR_GRID_INTERVAL === 0 ? "major" : "minor"} key={`z-${z}`} x1={-workspace.width / 2} y1={z} x2={workspace.width / 2} y2={z} />)}
            </g>
          ) : null}
          {operation === "revolve" ? (
            <g className="sketch-revolve-guide" pointerEvents="none">
              <rect x={0} y={-workspace.depth / 2} width={workspace.width / 2} height={workspace.depth} />
              <line x1={0} y1={-workspace.depth / 2} x2={0} y2={workspace.depth / 2} />
              <text x={-5 * screenUnit} y={-workspace.depth / 2 + 18 * screenUnit} fontSize={12 * screenUnit}>REVOLVE AXIS</text>
            </g>
          ) : null}
          <g className="sketch-reference-images">
            {displayImages.map((image) => (
              <image
                key={image.id}
                data-sketch-entity="image"
                aria-label={image.name}
                href={image.dataUrl}
                x={image.x - image.width / 2}
                y={image.z - image.depth / 2}
                width={image.width}
                height={image.depth}
                opacity={image.opacity ?? 0.55}
                preserveAspectRatio="none"
                pointerEvents={tool === "select" ? "auto" : "none"}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPanGesture(event)) {
                    beginPan(event);
                    return;
                  }
                  if (event.button !== 0 || tool !== "select") return;
                  const point = pointFromEvent(event, false);
                  if (!point) return;
                  onSelectImage(image.id);
                  beginEntityDrag(event, {
                    kind: "move-image",
                    pointerId: event.pointerId,
                    imageId: image.id,
                    origin: point,
                    current: point,
                    start: { ...image },
                  });
                }}
              />
            ))}
          </g>
          <g className="sketch-texts">
            {(profile.texts ?? []).map((text) => (
              <text
                key={text.id}
                data-sketch-entity="text"
                x={text.x}
                y={text.z}
                fontSize={text.fontSize * screenUnit}
                textAnchor="middle"
                dominantBaseline="central"
                className="sketch-text-item"
                pointerEvents={tool === "select" ? "auto" : "none"}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPanGesture(event)) {
                    beginPan(event);
                    return;
                  }
                  if (event.button !== 0 || tool !== "select") return;
                  onSelectText(text.id);
                }}
              >
                {text.text}
              </text>
            ))}
          </g>
          <g className="sketch-reference-shapes" pointerEvents="none">
            {referenceShapes.filter((shape) => !shape.hidden).map((shape) => {
              const footprint = referenceFootprints.get(shape.id);
              return (
                <g key={shape.id} transform={`rotate(${shape.rotation ?? 0} ${shape.x} ${shape.z})`}>
                  {footprint?.fillD || footprint?.outlineD ? (
                    <>
                      {footprint.fillD ? <path className="sketch-reference-mesh-face" d={footprint.fillD} /> : null}
                      {footprint.outlineD ? <path className="sketch-reference-mesh-outline" d={footprint.outlineD} /> : null}
                    </>
                  ) : isRoundReference(shape) ? (
                    <ellipse cx={shape.x} cy={shape.z} rx={shape.width / 2} ry={shape.depth / 2} />
                  ) : (
                    <rect x={shape.x - shape.width / 2} y={shape.z - shape.depth / 2} width={shape.width} height={shape.depth} />
                  )}
                </g>
              );
            })}
          </g>
          <rect className="sketch-plate-border" x={-workspace.width / 2} y={-workspace.depth / 2} width={workspace.width} height={workspace.depth} pointerEvents="none" />
          {pointerAction?.kind === "marquee" ? (
            <rect
              className="sketch-selection-marquee"
              x={Math.min(pointerAction.origin.x, pointerAction.current.x)}
              y={Math.min(pointerAction.origin.z, pointerAction.current.z)}
              width={Math.abs(pointerAction.current.x - pointerAction.origin.x)}
              height={Math.abs(pointerAction.current.z - pointerAction.origin.z)}
              pointerEvents="none"
            />
          ) : null}
          <g className="sketch-profile-fills">
            {operation === "extrude" ? regions.map((region, index) => (
              <path
                key={region.id}
                className={`selectable ${selectedRegionIdSet.has(region.id) ? "selected" : ""}`}
                d={[region.outer, ...region.holes].map(pathData).join(" ")}
                pointerEvents={tool === "select" ? "fill" : "none"}
                role="button"
                aria-label={`Extrusion profile ${index + 1}${selectedRegionIdSet.has(region.id) ? ", selected" : ""}`}
                aria-pressed={selectedRegionIdSet.has(region.id)}
                tabIndex={tool === "select" ? 0 : -1}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPanGesture(event)) {
                    beginPan(event);
                    return;
                  }
                  if (event.button === 0 && tool === "select") onSelectRegion(region.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectRegion(region.id);
                  }
                }}
              />
            )) : paths.some((path) => path.closed) ? <path d={paths.filter((path) => path.closed).map(pathData).join(" ")} pointerEvents="none" /> : null}
          </g>
          {snapToGeometry || tool === "select" ? (
            <g className="sketch-center-points">
              {centerSnapCandidates.map((center) => {
                const pointIds = center.ownerPointIds ?? [];
                const movable = pointIds.length > 0 && pointIds.every((id) => {
                  const point = pointById.get(id);
                  return point && !fixedPointIds.has(id);
                });
                const dragging = pointerAction?.kind === "move-center" && pointerAction.centerId === center.id;
                return (
                  <g
                    key={center.id}
                    data-sketch-entity="center"
                    className={`${tool === "select" ? movable ? "movable" : "locked" : ""} ${dragging ? "dragging" : ""}`}
                    transform={`translate(${center.x} ${center.z})`}
                    pointerEvents={tool === "select" ? "auto" : "none"}
                    onPointerDown={(event) => {
                      if (isPanGesture(event)) {
                        beginPan(event);
                        return;
                      }
                      if (event.button !== 0 || tool !== "select" || !movable) return;
                      const point = pointFromEvent(event, false);
                      if (!point) return;
                      beginEntityDrag(event, {
                        kind: "move-center",
                        pointerId: event.pointerId,
                        centerId: center.id,
                        pointIds,
                        origin: point,
                        current: point,
                      });
                    }}
                  >
                    <title>{movable ? "Drag to move this closed profile" : "Fixed or projected profiles cannot be moved"}</title>
                    <circle r={6 * screenUnit} />
                    <line x1={-4 * screenUnit} y1={0} x2={4 * screenUnit} y2={0} />
                    <line x1={0} y1={-4 * screenUnit} x2={0} y2={4 * screenUnit} />
                  </g>
                );
              })}
            </g>
          ) : null}
          {hover?.snap ? (
            <g className="sketch-snap-feedback" pointerEvents="none">
              {hover.snap.xGuide !== undefined ? <line className="guide" x1={hover.snap.xGuide} y1={pan.z - depth / 2} x2={hover.snap.xGuide} y2={pan.z + depth / 2} /> : null}
              {hover.snap.zGuide !== undefined ? <line className="guide" x1={pan.x - width / 2} y1={hover.snap.zGuide} x2={pan.x + width / 2} y2={hover.snap.zGuide} /> : null}
              <circle className={`marker ${hover.snap.kind}`} cx={hover.x} cy={hover.z} r={8 * screenUnit} />
              <text x={hover.x + 12 * screenUnit} y={hover.z - 10 * screenUnit} fontSize={11 * screenUnit}>{hover.snap.label}</text>
             </g>
           ) : null}
           <g className="sketch-segments">
            {displayProfile.segments.map((segment) => (
              <path
                data-sketch-entity="segment"
                className={`${isSegmentSelected(segment.id) ? "selected" : ""} ${horizontalSegmentIds.has(segment.id) || verticalSegmentIds.has(segment.id) || dimensionBySegmentId.has(segment.id) ? "constrained" : ""}`}
                key={segment.id}
                d={segmentData(segment, pointById)}
                pointerEvents={undefined}
                onPointerMove={(event) => {
                  if (tool !== "refine") return;
                  const target = pointFromEvent(event);
                  const start = pointById.get(segment.startId);
                  const end = pointById.get(segment.endId);
                  if (!target || !start || !end) return;
                  setRefinePreview({ segmentId: segment.id, placement: closestPointOnSketchSegment(segment, start, end, target) });
                }}
                onPointerLeave={() => {
                  if (tool === "refine") setRefinePreview((current) => current?.segmentId === segment.id ? null : current);
                }}
                onPointerDown={(event) => {
                  const point = pointFromEvent(event);
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPanGesture(event)) beginPan(event);
                  else if (tool === "erase") onDeleteSegment(segment.id);
                  else if (event.button === 0 && tool === "refine" && point) {
                    const start = pointById.get(segment.startId);
                    const end = pointById.get(segment.endId);
                    if (start && end) {
                      const placement = closestPointOnSketchSegment(segment, start, end, point);
                      onInsertPoint(segment.id, placement.point, placement.amount);
                    }
                  }
                  else if (event.button === 0 && tool === "bezier" && point) {
                    svgRef.current?.setPointerCapture(event.pointerId);
                    setPointerAction({ kind: "bezier", pointerId: event.pointerId, origin: point, current: point });
                  }
                  else if (event.button === 0 && point && (["line", "smooth", "circle-center", "circle-diameter", "rect-corner", "rect-center", "poly-inscribed", "poly-circumscribed", "poly-edge", "text", "measure"] as SketchTool[]).includes(tool)) onPlanePoint(point);
                  else if (event.button === 0 && tool === "select" && point) {
                    const closedPath = paths.find((path) => path.closed && path.steps.some((step) => step.segment.id === segment.id));
                    if (!closedPath) {
                      onSelectSegment(segment.id);
                      return;
                    }
                    const pointIds = closedPath.points.map((entry) => entry.id);
                    const segmentIds = closedPath.steps.map((step) => step.segment.id);
                    const startPoints = pointIds.map((id) => profile.points.find((entry) => entry.id === id)).filter((entry): entry is SketchPoint => Boolean(entry)).map((entry) => ({ ...entry, handleIn: entry.handleIn ? { ...entry.handleIn } : undefined, handleOut: entry.handleOut ? { ...entry.handleOut } : undefined }));
                    onSelectMany(pointIds, segmentIds, [], []);
                    beginEntityDrag(event, { kind: "move-selection", pointerId: event.pointerId, origin: point, current: point, startPoints });
                  } else if (event.button === 0) onSelectSegment(segment.id);
                }}
              />
            ))}
          </g>
          {tool === "refine" && refinePreview ? (
            <circle
              className="sketch-cursor-point"
              cx={refinePreview.placement.point.x}
              cy={refinePreview.placement.point.z}
              r={hoverPointRadius}
              opacity={0.72}
              pointerEvents="none"
            />
          ) : null}
          <g className="sketch-segment-dimensions">
            {(profile.dimensions ?? []).map((storedDimension) => {
              if (storedDimension.kind === "distance") {
                const start = sketchDimensionAnchorPoint(displayProfile, storedDimension.start);
                const end = sketchDimensionAnchorPoint(displayProfile, storedDimension.end);
                const value = sketchDistanceDimensionValue(displayProfile, storedDimension.start, storedDimension.end);
                if (!start || !end || value === null) return null;
                const deltaX = end.x - start.x;
                const deltaZ = end.z - start.z;
                const length = Math.max(0.000001, Math.hypot(deltaX, deltaZ));
                const position = {
                  x: (start.x + end.x) / 2 + deltaZ / length * labelOffset,
                  z: (start.z + end.z) / 2 - deltaX / length * labelOffset,
                };
                const label = formatDimension(value, workspace.accuracy);
                const pill = dimensionPillSize(label, screenUnit, 18);
                return (
                  <g className="sketch-distance-dimension" key={storedDimension.id}>
                    <line x1={start.x} y1={start.z} x2={end.x} y2={end.z} pointerEvents="none" />
                    <g
                      data-sketch-entity="dimension"
                      className="reference"
                      transform={`translate(${position.x} ${position.z})`}
                      pointerEvents={tool === "erase" ? "auto" : "none"}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.button === 0 && tool === "erase") onDeleteDimension(storedDimension.id);
                      }}
                    >
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </g>
                  </g>
                );
              }
              const segment = displayProfile.segments.find((entry) => entry.id === storedDimension.segmentId);
              const dimension = segment ? segmentDimension(segment, pointById) : null;
              if (!segment || !dimension) return null;
              const label = formatDimension(storedDimension.value, workspace.accuracy);
              const pill = dimensionPillSize(label, screenUnit, 18);
              const defaultPosition = {
                x: dimension.midpoint.x + (segment.dimensionLabelOffset?.x ?? 0),
                z: dimension.midpoint.z + (segment.dimensionLabelOffset?.z ?? -labelOffset),
              };
              const action = pointerAction?.kind === "move-dimension" && pointerAction.segmentId === segment.id ? pointerAction : null;
              const position = action ? {
                x: action.current.x + action.grabOffset.x,
                z: action.current.z + action.grabOffset.z,
              } : defaultPosition;
              return (
                <g
                  data-sketch-entity="dimension"
                  className={`driving movable ${action ? "dragging" : ""}`}
                  key={storedDimension.id}
                  transform={`translate(${position.x} ${position.z})`}
                  pointerEvents={tool === "select" || tool === "dimension" || tool === "erase" ? "auto" : "none"}
                  onPointerDown={(event) => {
                    if (isPanGesture(event)) {
                      beginPan(event);
                      return;
                    }
                    if (event.button !== 0 || tool !== "select" && tool !== "dimension" && tool !== "erase") return;
                    if (tool === "erase") {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteDimension(storedDimension.id);
                      return;
                    }
                    const point = pointFromEvent(event, false);
                    if (!point) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectSegment(segment.id);
                    if (tool === "dimension") return;
                    beginEntityDrag(event, {
                      kind: "move-dimension",
                      pointerId: event.pointerId,
                      segmentId: segment.id,
                      origin: point,
                      current: point,
                      grabOffset: { x: defaultPosition.x - point.x, z: defaultPosition.z - point.z },
                    });
                  }}
                >
                  <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                  <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                </g>
              );
            })}
          </g>
          <g className="sketch-segment-dimensions" pointerEvents="none">
            {selected?.kind === "multiple" ? null : displayProfile.segments
              .filter((segment) => !dimensionBySegmentId.has(segment.id))
              .map((segment) => {
                const dimension = segmentDimension(segment, pointById);
                if (!dimension) return null;
                const label = formatDimension(dimension.length, workspace.accuracy);
                const pill = dimensionPillSize(label, screenUnit, 18);
                return (
                  <g key={`dimension-${segment.id}`} transform={`translate(${dimension.midpoint.x} ${dimension.midpoint.z - labelOffset})`}>
                    <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                    <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                  </g>
                );
              })}
          </g>
          <g className="sketch-constraint-indicators" pointerEvents="none">
            {displayProfile.segments.map((segment) => {
              const start = pointById.get(segment.startId);
              const end = pointById.get(segment.endId);
              const horizontal = horizontalSegmentIds.has(segment.id);
              const vertical = verticalSegmentIds.has(segment.id);
              if (!start || !end || (!horizontal && !vertical)) return null;
              return (
                <text
                  key={`constraint-${segment.id}`}
                  x={(start.x + end.x) / 2 + 9 * screenUnit}
                  y={(start.z + end.z) / 2 + 16 * screenUnit}
                  fontSize={12 * screenUnit}
                >
                  {horizontal ? "H" : "V"}
                </text>
              );
            })}
            {displayProfile.points.filter((point) => fixedPointIds.has(point.id)).map((point) => (
              <text key={`fixed-${point.id}`} x={point.x + 8 * screenUnit} y={point.z - 8 * screenUnit} fontSize={11 * screenUnit}>F</text>
            ))}
          </g>
          {selectedGeometryBounds && tool === "select" ? (() => {
            const widthLabel = formatDimension(selectedGeometryBounds.width, workspace.accuracy);
            const depthLabel = formatDimension(selectedGeometryBounds.depth, workspace.accuracy);
            const widthPill = dimensionPillSize(widthLabel, screenUnit, 18);
            const depthPill = dimensionPillSize(depthLabel, screenUnit, 18);
            return (
              <g className="sketch-geometry-selection">
                <rect
                  data-sketch-entity="selection-box"
                  className="sketch-geometry-selection-box"
                  x={selectedGeometryBounds.minX}
                  y={selectedGeometryBounds.minZ}
                  width={selectedGeometryBounds.width}
                  height={selectedGeometryBounds.depth}
                  onPointerDown={(event) => {
                    if (event.button === 1) {
                      beginPan(event);
                      return;
                    }
                    if (event.button !== 0 || selected?.kind !== "multiple") return;
                    const point = pointFromEvent(event);
                    if (!point) return;
                    const startPoints = selected.pointIds.map((id) => profile.points.find((entry) => entry.id === id)).filter((entry): entry is SketchPoint => Boolean(entry)).map((entry) => ({ ...entry, handleIn: entry.handleIn ? { ...entry.handleIn } : undefined, handleOut: entry.handleOut ? { ...entry.handleOut } : undefined }));
                    beginEntityDrag(event, { kind: "move-selection", pointerId: event.pointerId, origin: point, current: point, startPoints });
                  }}
                />
                <g className="sketch-geometry-dimension" pointerEvents="none" transform={`translate(${selectedGeometryBounds.cx} ${selectedGeometryBounds.minZ - labelOffset})`}>
                  <rect x={-widthPill.width / 2} y={-widthPill.height / 2} width={widthPill.width} height={widthPill.height} rx={widthPill.radius} />
                  <text y={5 * screenUnit} fontSize={13 * screenUnit}>{widthLabel}</text>
                </g>
                <g className="sketch-geometry-dimension" pointerEvents="none" transform={`translate(${selectedGeometryBounds.maxX + 34 * screenUnit} ${selectedGeometryBounds.cz})`}>
                  <rect x={-depthPill.width / 2} y={-depthPill.height / 2} width={depthPill.width} height={depthPill.height} rx={depthPill.radius} />
                  <text y={5 * screenUnit} fontSize={13 * screenUnit}>{depthLabel}</text>
                </g>
                {selectionResizeHandles.map((handle) => (
                  <rect
                    key={`selection-handle-${handle.id}`}
                    data-sketch-entity="selection-handle"
                    className={`sketch-geometry-resize-handle handle-${handle.id}`}
                    x={handle.x - handleSize / 2}
                    y={handle.z - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    rx={handleRadius}
                    onPointerDown={(event) => {
                      if (event.button === 1) {
                        beginPan(event);
                        return;
                      }
                      if (event.button !== 0 || selected?.kind !== "multiple") return;
                      const startPoints = selected.pointIds.map((id) => profile.points.find((entry) => entry.id === id)).filter((entry): entry is SketchPoint => Boolean(entry)).map((entry) => ({ ...entry, handleIn: entry.handleIn ? { ...entry.handleIn } : undefined, handleOut: entry.handleOut ? { ...entry.handleOut } : undefined }));
                      const bounds = boundsForSketchPoints(startPoints);
                      if (!bounds) return;
                      beginEntityDrag(event, { kind: "resize-selection", pointerId: event.pointerId, handle: handle.id, current: { x: handle.x, z: handle.z }, startPoints, bounds });
                    }}
                  />
                ))}
              </g>
            );
          })() : null}
          {activePoint && hover && (["line", "bezier", "smooth"] as SketchTool[]).includes(tool) ? <line className="sketch-preview-line" x1={activePoint.x} y1={activePoint.z} x2={hover.x} y2={hover.z} pointerEvents="none" /> : null}
          {activePoint && hover && (["line", "bezier", "smooth"] as SketchTool[]).includes(tool) ? (
            <g className="sketch-segment-dimensions preview" pointerEvents="none" transform={`translate(${(activePoint.x + hover.x) / 2} ${(activePoint.z + hover.z) / 2 - labelOffset})`}>
              {(() => {
                const pill = dimensionPillSize(previewLabel, screenUnit, 18);
                return (
                  <>
                    <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                    <text y={5 * screenUnit} fontSize={13 * screenUnit}>{previewLabel}</text>
                  </>
                );
              })()}
            </g>
          ) : null}
          {circleDraft && hover && circlePreview ? (
            <g className="sketch-circle-preview" pointerEvents="none">
              <circle cx={circlePreview.center.x} cy={circlePreview.center.z} r={circlePreview.radius} />
              <line
                className="sketch-preview-line"
                x1={circleDraft.first.x}
                y1={circleDraft.first.z}
                x2={hover.x}
                y2={hover.z}
              />
              <circle className="center" cx={circlePreview.center.x} cy={circlePreview.center.z} r={pointRadius} />
              <g className="sketch-segment-dimensions preview" transform={`translate(${(circleDraft.first.x + hover.x) / 2} ${(circleDraft.first.z + hover.z) / 2 - labelOffset})`}>
                {(() => {
                  const label = `${circleDraft.tool === "circle-center" ? "R" : "Ø"} ${formatDimension(circleDraft.tool === "circle-center" ? circlePreview.radius : circlePreview.radius * 2, workspace.accuracy)}`;
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
            </g>
          ) : null}
          {rectDraft && hover && rectPreview ? (
            <g className="sketch-rect-preview" pointerEvents="none">
              <rect
                x={rectPreview.minX}
                y={rectPreview.minZ}
                width={rectPreview.width}
                height={rectPreview.height}
              />
              <line
                className="sketch-preview-line"
                x1={rectDraft.first.x}
                y1={rectDraft.first.z}
                x2={hover.x}
                y2={hover.z}
              />
              <g className="sketch-segment-dimensions preview" transform={`translate(${(rectDraft.first.x + hover.x) / 2} ${(rectDraft.first.z + hover.z) / 2 - labelOffset})`}>
                {(() => {
                  const label = `${formatDimension(rectPreview.width, workspace.accuracy)} × ${formatDimension(rectPreview.height, workspace.accuracy)}`;
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
            </g>
          ) : null}
          {polygonDraft && hover && polygonPreview ? (() => {
            const angleStep = (2 * Math.PI) / polygonDraft.sides;
            const vertices = Array.from({ length: polygonDraft.sides }, (_, i) => ({
              x: polygonPreview.center.x + polygonPreview.circumR * Math.cos(polygonPreview.startAngle + i * angleStep),
              z: polygonPreview.center.z + polygonPreview.circumR * Math.sin(polygonPreview.startAngle + i * angleStep),
            }));
            const polyD = vertices.map((v, i) => `${i === 0 ? "M" : "L"}${v.x} ${v.z}`).join(" ") + " Z";
            return (
              <g className="sketch-polygon-preview" pointerEvents="none">
                <path d={polyD} />
                <line
                  className="sketch-preview-line"
                  x1={polygonDraft.first.x}
                  y1={polygonDraft.first.z}
                  x2={hover.x}
                  y2={hover.z}
                />
                <circle className="center" cx={polygonPreview.center.x} cy={polygonPreview.center.z} r={pointRadius} />
                <g className="sketch-segment-dimensions preview" transform={`translate(${(polygonDraft.first.x + hover.x) / 2} ${(polygonDraft.first.z + hover.z) / 2 - labelOffset})`}>
                  {(() => {
                    const label = `${polygonDraft.sides}-gon  R ${formatDimension(polygonPreview.circumR, workspace.accuracy)}`;
                    const pill = dimensionPillSize(label, screenUnit, 18);
                    return (
                      <>
                        <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                        <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                      </>
                    );
                  })()}
                </g>
              </g>
            );
          })() : null}
          {textDraft ? (
            <g className="sketch-text-draft" pointerEvents="none">
              <text
                x={textDraft.position.x}
                y={textDraft.position.z}
                fontSize={10 * screenUnit}
                textAnchor="middle"
                dominantBaseline="central"
                className="sketch-text-preview"
              >
                {"Click to place text"}
              </text>
            </g>
          ) : null}
          {pointerAction?.kind === "bezier" ? (
            <g className="sketch-drag-handles" pointerEvents="none">
              <line x1={pointerAction.origin.x * 2 - pointerAction.current.x} y1={pointerAction.origin.z * 2 - pointerAction.current.z} x2={pointerAction.current.x} y2={pointerAction.current.z} />
              <circle cx={pointerAction.origin.x} cy={pointerAction.origin.z} r={controlPointRadius} />
            </g>
          ) : null}
          {tool === "measure" && measurement ? (
            <g className="sketch-measurement">
              <line x1={measurement.start.x} y1={measurement.start.z} x2={measurement.end.x} y2={measurement.end.z} />
              <circle className="sketch-measurement-point" cx={measurement.start.x} cy={measurement.start.z} r={pointRadius} pointerEvents="none" />
              <circle className="sketch-measurement-point" cx={measurement.end.x} cy={measurement.end.z} r={pointRadius} pointerEvents="none" />
              <g
                className="sketch-measurement-pill"
                role="button"
                aria-label="Remove measurement"
                transform={`translate(${(measurement.start.x + measurement.end.x) / 2} ${(measurement.start.z + measurement.end.z) / 2 - labelOffset})`}
                onPointerDown={(event) => {
                  if (isPanGesture(event)) {
                    beginPan(event);
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onClearMeasurement();
                }}
              >
                <rect x={-dimensionPillSize(measurementLabel, screenUnit, 30).width / 2} y={-dimensionPillSize(measurementLabel, screenUnit, 30).height / 2} width={dimensionPillSize(measurementLabel, screenUnit, 30).width} height={dimensionPillSize(measurementLabel, screenUnit, 30).height} rx={dimensionPillSize(measurementLabel, screenUnit, 30).radius} />
                <text x={-5 * screenUnit} y={5 * screenUnit} fontSize={13 * screenUnit}>{measurementLabel}</text>
                <text className="remove" x={dimensionPillSize(measurementLabel, screenUnit, 30).width / 2 - 8 * screenUnit} y={5 * screenUnit} fontSize={14 * screenUnit}>x</text>
              </g>
            </g>
          ) : null}
          {pendingMeasurementStart ? (
            <g className="sketch-measurement pending" pointerEvents="none">
              {hover ? <line x1={pendingMeasurementStart.x} y1={pendingMeasurementStart.z} x2={hover.x} y2={hover.z} /> : null}
              <circle className="sketch-measurement-point pending" cx={pendingMeasurementStart.x} cy={pendingMeasurementStart.z} r={pointRadius} />
              {hover ? <circle className="sketch-measurement-point hover" cx={hover.x} cy={hover.z} r={pointRadius} /> : null}
            </g>
          ) : null}
          {selectedPoint && tool === "select" ? (
            <g className="sketch-curve-handles">
              {selectedPoint.handleIn ? <><line x1={selectedPoint.x} y1={selectedPoint.z} x2={selectedPoint.handleIn.x} y2={selectedPoint.handleIn.z} /><circle data-sketch-entity="handle" cx={selectedPoint.handleIn.x} cy={selectedPoint.handleIn.z} r={controlPointRadius} onPointerDown={(event) => isPanGesture(event) ? beginPan(event) : beginEntityDrag(event, { kind: "move-handle", pointerId: event.pointerId, pointId: selectedPoint.id, handle: "in", current: selectedPoint.handleIn! })} /></> : null}
              {selectedPoint.handleOut ? <><line x1={selectedPoint.x} y1={selectedPoint.z} x2={selectedPoint.handleOut.x} y2={selectedPoint.handleOut.z} /><circle data-sketch-entity="handle" cx={selectedPoint.handleOut.x} cy={selectedPoint.handleOut.z} r={controlPointRadius} onPointerDown={(event) => isPanGesture(event) ? beginPan(event) : beginEntityDrag(event, { kind: "move-handle", pointerId: event.pointerId, pointId: selectedPoint.id, handle: "out", current: selectedPoint.handleOut! })} /></> : null}
            </g>
          ) : null}
          <g className="sketch-points">
            {displayProfile.points.map((point) => (
              <circle
                data-sketch-entity="point"
                className={`${isPointSelected(point.id) ? "selected" : ""} ${activePointId === point.id ? "active" : ""} ${fixedPointIds.has(point.id) ? "fixed" : ""}`}
                key={point.id}
                cx={point.x}
                cy={point.z}
                r={pointRadius}
                pointerEvents={undefined}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (isPanGesture(event)) {
                    beginPan(event);
                  } else if (tool === "erase" || tool === "refine") {
                    onDeletePoint(point.id);
                  } else if (event.button === 0 && tool === "select") {
                    onPointPress(point.id);
                    if (!fixedPointIds.has(point.id)) beginEntityDrag(event, { kind: "move-point", pointerId: event.pointerId, pointId: point.id, current: { x: point.x, z: point.z } });
                  } else if (event.button === 0) {
                    onPointPress(point.id);
                  }
                }}
              />
            ))}
          </g>
          {tool === "dimension" ? (
            <g className="sketch-dimension-anchors">
              {dimensionAnchorCandidates.map((candidate) => {
                const active = pendingDimensionAnchor?.id === candidate.id;
                return (
                  <g
                    key={candidate.id}
                    className={`${candidate.kind} ${active ? "active" : ""}`}
                    transform={`translate(${candidate.x} ${candidate.z})`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (isPanGesture(event)) beginPan(event);
                      else if (event.button === 0) chooseDimensionAnchor(candidate);
                    }}
                  >
                    <circle className="hit" r={9 * screenUnit} />
                    {candidate.kind === "midpoint" ? <rect x={-4 * screenUnit} y={-4 * screenUnit} width={8 * screenUnit} height={8 * screenUnit} transform="rotate(45)" /> : <circle r={4.5 * screenUnit} />}
                    {candidate.kind === "intersection" ? <><line x1={-6 * screenUnit} y1={0} x2={6 * screenUnit} y2={0} /><line x1={0} y1={-6 * screenUnit} x2={0} y2={6 * screenUnit} /></> : null}
                  </g>
                );
              })}
            </g>
          ) : null}
          {selectedImage && selectedImageBounds && tool === "select" ? (
            <g className="sketch-image-selection">
              <rect
                className="sketch-image-selection-box"
                x={selectedImageBounds.minX}
                y={selectedImageBounds.minZ}
                width={selectedImage.width}
                height={selectedImage.depth}
                pointerEvents="none"
              />
              <g className="sketch-image-dimension width" pointerEvents="none" transform={`translate(${selectedImage.x} ${selectedImageBounds.minZ - labelOffset})`}>
                {(() => {
                  const label = formatDimension(selectedImage.width, workspace.accuracy);
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
              <g className="sketch-image-dimension depth" pointerEvents="none" transform={`translate(${selectedImageBounds.maxX + 34 * screenUnit} ${selectedImage.z})`}>
                {(() => {
                  const label = formatDimension(selectedImage.depth, workspace.accuracy);
                  const pill = dimensionPillSize(label, screenUnit, 18);
                  return (
                    <>
                      <rect x={-pill.width / 2} y={-pill.height / 2} width={pill.width} height={pill.height} rx={pill.radius} />
                      <text y={5 * screenUnit} fontSize={13 * screenUnit}>{label}</text>
                    </>
                  );
                })()}
              </g>
              {imageResizeHandles.map((handle) => (
                <rect
                  key={handle.id}
                  data-sketch-entity="image-handle"
                  className={`sketch-image-resize-handle handle-${handle.id}`}
                  x={handle.x - handleSize / 2}
                  y={handle.z - handleSize / 2}
                  width={handleSize}
                  height={handleSize}
                  rx={handleRadius}
                  onPointerDown={(event) => {
                    if (isPanGesture(event)) {
                      beginPan(event);
                      return;
                    }
                    if (event.button !== 0) return;
                    const point = pointFromEvent(event, false);
                    if (!point) return;
                    beginEntityDrag(event, {
                      kind: "resize-image",
                      pointerId: event.pointerId,
                      imageId: selectedImage.id,
                      handle: handle.id,
                      current: point,
                      start: { ...selectedImage },
                    });
                  }}
                />
              ))}
            </g>
          ) : null}
          {hover && (["line", "bezier", "smooth", "measure"] as SketchTool[]).includes(tool) ? <circle className="sketch-cursor-point" cx={hover.x} cy={hover.z} r={hoverPointRadius} pointerEvents="none" /> : null}
        </svg>
      </section>
      {textDraft ? (() => {
        const pos = svgToScreen(textDraft.position.x, textDraft.position.z);
        return (
          <div
            className="sketch-text-input-overlay"
            style={{ position: "absolute", left: pos.left, top: pos.top, transform: "translate(-50%, -50%)", zIndex: 10 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              ref={textInputRef}
              type="text"
              className="sketch-text-input"
              value={textDraftValue}
              onChange={(e) => setTextDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const trimmed = textDraftValue.trim();
                  if (trimmed) onTextSubmit(trimmed);
                  else onTextCancel();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  onTextCancel();
                }
                e.stopPropagation();
              }}
              onBlur={() => {
                const trimmed = textDraftValue.trim();
                if (trimmed) onTextSubmit(trimmed);
                else onTextCancel();
              }}
              placeholder="Type text..."
            />
          </div>
        );
      })() : null}
      {selectedImage && tool === "select" ? (
        <SketchImageInspector
          image={selectedImage}
          accuracy={workspace.accuracy}
          onClose={() => onSelectMany([], [], [], [])}
          onUpdate={(patch, message) => onUpdateImage(selectedImage.id, patch, message)}
          onDelete={() => onDeleteImage(selectedImage.id)}
        />
      ) : null}
      {selectedSegment && (tool === "select" || tool === "dimension") ? (
        <SketchSegmentInspector
          key={selectedSegment.id}
          segment={selectedSegment}
          length={segmentDimension(selectedSegment, pointById)?.length ?? 0}
          accuracy={workspace.accuracy}
          horizontal={horizontalSegmentIds.has(selectedSegment.id)}
          vertical={verticalSegmentIds.has(selectedSegment.id)}
          dimensionValue={dimensionBySegmentId.get(selectedSegment.id)?.value ?? null}
          dimensionOnly={tool === "dimension"}
          onClose={() => onSelectMany([], [], [], [])}
          onToggleConstraint={(kind) => onToggleSegmentConstraint(selectedSegment.id, kind)}
          onSetLength={(value) => onSetSegmentLength(selectedSegment.id, value)}
        />
      ) : null}
      {selectedPoint && tool === "select" ? (
        <div className="sketch-point-actions" aria-label="Point actions">
          <button type="button" title="Make corner" onClick={() => onSetPointMode(selectedPoint.id, "corner")}><CornerDownRight /><span>Corner</span></button>
          <button type="button" title="Make smooth" onClick={() => onSetPointMode(selectedPoint.id, "smooth")}><Waves /><span>Smooth</span></button>
          <button type="button" title="Split handles" onClick={() => onSetPointMode(selectedPoint.id, "split")}><Split /><span>Split</span></button>
          <button className={fixedPointIds.has(selectedPoint.id) ? "active" : ""} type="button" title={fixedPointIds.has(selectedPoint.id) ? "Release point" : "Fix point"} aria-pressed={fixedPointIds.has(selectedPoint.id)} onClick={() => onTogglePointFixed(selectedPoint.id)}>
            {fixedPointIds.has(selectedPoint.id) ? <LockKeyhole /> : <LockKeyholeOpen />}
            <span>{fixedPointIds.has(selectedPoint.id) ? "Fixed" : "Fix"}</span>
          </button>
        </div>
      ) : null}
      <div className="grid-settings sketch-grid-settings">
        <SnapGridControl snap={snap} snapOpen={snapOpen} onSnapChange={setSnap} onSnapOpenChange={setSnapOpen} />
        <div className="sketch-snap-mode-buttons" role="group" aria-label="Sketch magnetic snapping">
          <button type="button" className={snapToGridLines ? "active" : ""} aria-pressed={snapToGridLines} onClick={() => setSnapToGridLines((enabled) => !enabled)}>Grid lines</button>
          <button type="button" className={snapToGeometry ? "active" : ""} aria-pressed={snapToGeometry} onClick={() => setSnapToGeometry((enabled) => !enabled)}>Geometry</button>
        </div>
      </div>
    </main>
  );
}

function SketchSegmentInspector({
  segment,
  length,
  accuracy,
  horizontal,
  vertical,
  dimensionValue,
  dimensionOnly,
  onClose,
  onToggleConstraint,
  onSetLength,
}: {
  segment: SketchSegment;
  length: number;
  accuracy: 1 | 2 | 3;
  horizontal: boolean;
  vertical: boolean;
  dimensionValue: number | null;
  dimensionOnly: boolean;
  onClose: () => void;
  onToggleConstraint: (kind: "horizontal" | "vertical") => void;
  onSetLength: (value: number | null) => void;
}) {
  const editable = !segment.kind || segment.kind === "line";
  const [draft, setDraft] = useState(formatDimension(dimensionValue ?? length, accuracy));
  useEffect(() => setDraft(formatDimension(dimensionValue ?? length, accuracy)), [accuracy, dimensionValue, length]);
  const commitLength = () => {
    const value = parseMeasurementInput(draft);
    if (Number.isFinite(value) && value > 0) onSetLength(value);
    else setDraft(formatDimension(dimensionValue ?? length, accuracy));
  };

  return (
    <aside className="shape-inspector sketch-constraint-inspector" aria-label="Segment constraints" onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-inspector-header">
        <button className="inspector-header-icon" type="button" aria-label="Close segment constraints" onClick={onClose}>
          <ChevronUp size={26} strokeWidth={2.8} />
        </button>
        <strong>{dimensionOnly ? "Dimension" : "Segment"}</strong>
      </div>
      <div className="property-card">
        <div className="property-card-header static"><span>Driving dimension</span></div>
        <div className="property-list">
          <label className="sketch-constraint-length-field">
            <span>Length</span>
            <div>
              <input
                type="text"
                inputMode="decimal"
                value={draft}
                autoFocus={dimensionOnly}
                disabled={!editable}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => { if (event.key === "Enter") commitLength(); }}
              />
              <span>mm</span>
            </div>
          </label>
          <button className="sketch-set-dimension" type="button" disabled={!editable} onClick={commitLength}>{dimensionValue === null ? "Set driving length" : "Update driving length"}</button>
          {dimensionValue !== null ? <button className="sketch-remove-dimension" type="button" onClick={() => onSetLength(null)}>Remove driving length</button> : null}
        </div>
      </div>
      {!dimensionOnly ? <div className="property-card">
        <div className="property-card-header static"><span>Geometric constraints</span></div>
        <div className="sketch-constraint-buttons">
          <button className={horizontal ? "active" : ""} type="button" disabled={!editable} aria-pressed={horizontal} onClick={() => onToggleConstraint("horizontal")}>H <span>Horizontal</span></button>
          <button className={vertical ? "active" : ""} type="button" disabled={!editable} aria-pressed={vertical} onClick={() => onToggleConstraint("vertical")}>V <span>Vertical</span></button>
        </div>
      </div> : null}
    </aside>
  );
}

function SketchImageInspector({
  image,
  accuracy,
  onClose,
  onUpdate,
  onDelete,
}: {
  image: SketchImage;
  accuracy: 1 | 2 | 3;
  onClose: () => void;
  onUpdate: (patch: Partial<SketchImage>, message?: string) => void;
  onDelete: () => void;
}) {
  const aspect = image.width / Math.max(0.5, image.depth);
  const updateWidth = (width: number) => onUpdate({
    width,
    ...(image.lockAspect !== false ? { depth: Math.max(0.5, width / aspect) } : {}),
  }, "Sketch image width updated");
  const updateDepth = (depth: number) => onUpdate({
    depth,
    ...(image.lockAspect !== false ? { width: Math.max(0.5, depth * aspect) } : {}),
  }, "Sketch image height updated");

  return (
    <aside className="shape-inspector sketch-image-inspector" aria-label={`${image.name} image settings`} onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-inspector-header">
        <button className="inspector-header-icon" type="button" aria-label="Close image settings" onClick={onClose}>
          <ChevronUp size={26} strokeWidth={2.8} />
        </button>
        <strong>{image.name}</strong>
        <div className="inspector-header-actions">
          <button className="inspector-header-icon danger" type="button" aria-label="Delete sketch image" title="Delete image" onClick={onDelete}>
            <Trash2 size={25} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="sketch-image-preview-card">
        <img src={image.dataUrl} alt="" />
        <span>{image.pixelWidth} × {image.pixelHeight} px</span>
      </div>
      <div className="property-card">
        <div className="property-card-header static"><span>Properties</span></div>
        <div className="property-list">
          <SketchImageRange label="Width" value={image.width} min={0.5} max={200} accuracy={accuracy} onChange={updateWidth} />
          <SketchImageRange label="Height" value={image.depth} min={0.5} max={200} accuracy={accuracy} onChange={updateDepth} />
          <SketchImageRange label="Opacity" value={(image.opacity ?? 0.55) * 100} min={5} max={100} accuracy={1} suffix="%" onChange={(opacity) => onUpdate({ opacity: opacity / 100 }, "Sketch image opacity updated")} />
          <SketchImagePositionField label="Position X" value={image.x} accuracy={accuracy} onChange={(x) => onUpdate({ x }, "Sketch image moved")} />
          <SketchImagePositionField label="Position Y" value={image.z} accuracy={accuracy} onChange={(z) => onUpdate({ z }, "Sketch image moved")} />
          <button className={`sketch-image-aspect-toggle ${image.lockAspect !== false ? "active" : ""}`} type="button" onClick={() => onUpdate({ lockAspect: image.lockAspect === false }, "Image aspect ratio setting updated")}>
            {image.lockAspect !== false ? <Link size={17} /> : <Link2Off size={17} />}
            <span>{image.lockAspect !== false ? "Aspect ratio locked" : "Aspect ratio unlocked"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function SketchImageRange({
  label,
  value,
  min,
  max,
  accuracy,
  suffix = "mm",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  accuracy: 1 | 2 | 3;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const safeValue = clamp(Number.isFinite(value) ? value : min, min, max);
  const [draft, setDraft] = useState(formatDimension(safeValue, accuracy));
  useEffect(() => setDraft(formatDimension(safeValue, accuracy)), [accuracy, safeValue]);
  const commit = () => {
    const parsed = parseMeasurementInput(draft);
    onChange(clamp(Number.isFinite(parsed) ? parsed : safeValue, min, max));
  };
  const position = ((safeValue - min) / Math.max(0.001, max - min)) * 100;
  return (
    <label className="range-property sketch-image-range" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span>{label}</span>
      <div className="sketch-image-range-row">
        <input
          className="sketch-image-number-input"
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
        <span>{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={accuracy === 1 ? 0.1 : 0.01} value={safeValue} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function SketchImagePositionField({
  label,
  value,
  accuracy,
  onChange,
}: {
  label: string;
  value: number;
  accuracy: 1 | 2 | 3;
  onChange: (value: number) => void;
}) {
  const formatted = formatDimension(value, accuracy);
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);
  const commit = () => {
    const parsed = parseMeasurementInput(draft);
    const next = Number.isFinite(parsed) ? parsed : value;
    onChange(next);
    setDraft(formatDimension(next, accuracy));
  };

  return (
    <label className="sketch-image-position-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </label>
  );
}
