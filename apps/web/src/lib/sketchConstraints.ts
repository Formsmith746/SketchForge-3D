import type { SketchConstraint, SketchDimensionAnchor, SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";
import { sketchDimensionAnchorKey, sketchDimensionAnchorPoint } from "@/lib/sketchDimensions";

const SOLVER_TOLERANCE = 0.000001;
const DIMENSION_TOLERANCE = 0.0001;

type IdFactory = (prefix: string) => string;
type SegmentConstraintKind = Extract<SketchConstraint, { segmentId: string }>["kind"];

export type SketchSolveResult = {
  profile: SketchProfile;
  conflicts: string[];
};

function cloneProfile(profile: SketchProfile): SketchProfile {
  return {
    ...profile,
    points: profile.points.map((point) => ({
      ...point,
      handleIn: point.handleIn ? { ...point.handleIn } : undefined,
      handleOut: point.handleOut ? { ...point.handleOut } : undefined,
    })),
    segments: profile.segments.map((segment) => ({ ...segment })),
    constraints: (profile.constraints ?? []).map((constraint) => ({ ...constraint })),
    dimensions: (profile.dimensions ?? []).map((dimension) => dimension.kind === "length"
      ? { ...dimension }
      : { ...dimension, start: { ...dimension.start }, end: { ...dimension.end } }),
    images: profile.images?.map((image) => ({ ...image })),
    texts: profile.texts?.map((text) => ({ ...text })),
  };
}

function isLineSegment(segment: SketchSegment) {
  return !segment.kind || segment.kind === "line";
}

function movePoint(point: SketchPoint, x: number, z: number) {
  const deltaX = x - point.x;
  const deltaZ = z - point.z;
  point.x = x;
  point.z = z;
  if (point.handleIn) point.handleIn = { x: point.handleIn.x + deltaX, z: point.handleIn.z + deltaZ };
  if (point.handleOut) point.handleOut = { x: point.handleOut.x + deltaX, z: point.handleOut.z + deltaZ };
}

export function sketchSegmentLength(profile: SketchProfile, segmentId: string) {
  const segment = profile.segments.find((entry) => entry.id === segmentId);
  if (!segment) return null;
  const start = profile.points.find((point) => point.id === segment.startId);
  const end = profile.points.find((point) => point.id === segment.endId);
  return start && end ? Math.hypot(end.x - start.x, end.z - start.z) : null;
}

export function pruneSketchParameters(profile: SketchProfile): SketchProfile {
  const next = cloneProfile(profile);
  const pointIds = new Set(next.points.map((point) => point.id));
  const segmentIds = new Set(next.segments.map((segment) => segment.id));
  const lineSegmentIds = new Set(next.segments.filter(isLineSegment).map((segment) => segment.id));
  const seenConstraints = new Set<string>();
  const seenDimensions = new Set<string>();

  next.constraints = (next.constraints ?? []).filter((constraint) => {
    const targetId = constraint.kind === "fixed" ? constraint.pointId : constraint.segmentId;
    const key = `${constraint.kind}:${targetId}`;
    if (seenConstraints.has(key)) return false;
    const valid = constraint.kind === "fixed"
      ? pointIds.has(constraint.pointId) && Number.isFinite(constraint.x) && Number.isFinite(constraint.z)
      : lineSegmentIds.has(constraint.segmentId);
    if (valid) seenConstraints.add(key);
    return valid;
  });
  next.dimensions = (next.dimensions ?? []).filter((dimension) => {
    const anchorValid = (anchor: SketchDimensionAnchor) => {
      if (anchor.kind === "point") return pointIds.has(anchor.pointId);
      if (anchor.kind === "midpoint") return segmentIds.has(anchor.segmentId);
      return segmentIds.has(anchor.firstSegmentId)
        && segmentIds.has(anchor.secondSegmentId)
        && anchor.firstSegmentId !== anchor.secondSegmentId
        && Number.isInteger(anchor.index)
        && anchor.index >= 0
        && sketchDimensionAnchorPoint(next, anchor) !== null;
    };
    const key = dimension.kind === "length"
      ? `length:${dimension.segmentId}`
      : `distance:${[sketchDimensionAnchorKey(dimension.start), sketchDimensionAnchorKey(dimension.end)].sort().join("|")}`;
    const valid = !seenDimensions.has(key) && (dimension.kind === "length"
      ? lineSegmentIds.has(dimension.segmentId) && Number.isFinite(dimension.value) && dimension.value > SOLVER_TOLERANCE
      : anchorValid(dimension.start) && anchorValid(dimension.end) && sketchDimensionAnchorKey(dimension.start) !== sketchDimensionAnchorKey(dimension.end));
    if (valid) seenDimensions.add(key);
    return valid;
  });
  return next;
}

export function solveSketchProfile(profile: SketchProfile, anchorPointId?: string): SketchSolveResult {
  const next = pruneSketchParameters(profile);
  const pointById = new Map(next.points.map((point) => [point.id, point]));
  const fixedConstraints = (next.constraints ?? []).filter((constraint): constraint is Extract<SketchConstraint, { kind: "fixed" }> => constraint.kind === "fixed");
  const segmentConstraints = new Map<string, Set<SegmentConstraintKind>>();
  const dimensionBySegment = new Map((next.dimensions ?? []).flatMap((dimension) => dimension.kind === "length" ? [[dimension.segmentId, dimension] as const] : []));
  // Decreasing priority propagates changes away from fixed or dragged anchors without closed loops pulling them back.
  const priority = new Map<string, number>();
  const fixedPointIds = new Set(fixedConstraints.map((constraint) => constraint.pointId));
  const basePriority = next.segments.length + 2;

  fixedConstraints.forEach((constraint) => {
    const point = pointById.get(constraint.pointId);
    if (!point) return;
    movePoint(point, constraint.x, constraint.z);
    priority.set(point.id, basePriority + 1);
  });
  if (anchorPointId && !priority.has(anchorPointId) && pointById.has(anchorPointId)) priority.set(anchorPointId, basePriority);
  (next.constraints ?? []).forEach((constraint) => {
    if (constraint.kind === "fixed") return;
    const kinds = segmentConstraints.get(constraint.segmentId) ?? new Set<SegmentConstraintKind>();
    kinds.add(constraint.kind);
    segmentConstraints.set(constraint.segmentId, kinds);
  });

  const constrainedSegments = next.segments.filter((segment) => segmentConstraints.has(segment.id) || dimensionBySegment.has(segment.id));
  for (let pass = 0; pass < Math.max(1, constrainedSegments.length * 2); pass += 1) {
    constrainedSegments.forEach((segment) => {
      const start = pointById.get(segment.startId);
      const end = pointById.get(segment.endId);
      if (!start || !end) return;
      const startPriority = priority.get(start.id) ?? 0;
      const endPriority = priority.get(end.id) ?? 0;
      const startFixed = fixedPointIds.has(start.id);
      const endFixed = fixedPointIds.has(end.id);
      if (startFixed && endFixed) return;
      const anchor = startFixed
        ? start
        : endFixed
          ? end
          : start.id === anchorPointId
            ? start
            : end.id === anchorPointId
              ? end
              : endPriority > startPriority
                ? end
                : start;
      const target = anchor === start ? end : start;
      const anchorPriority = Math.max(startPriority, endPriority) || basePriority;
      const kinds = segmentConstraints.get(segment.id);
      const dimension = dimensionBySegment.get(segment.id);
      const dx = target.x - anchor.x;
      const dz = target.z - anchor.z;
      const horizontal = kinds?.has("horizontal") ?? false;
      const vertical = kinds?.has("vertical") ?? false;
      let x = target.x;
      let z = target.z;

      if (horizontal) z = anchor.z;
      if (vertical) x = anchor.x;
      if (dimension) {
        if (horizontal && !vertical) {
          x = anchor.x + (dx < 0 ? -dimension.value : dimension.value);
        } else if (vertical && !horizontal) {
          z = anchor.z + (dz < 0 ? -dimension.value : dimension.value);
        } else {
          const length = Math.hypot(dx, dz);
          const unitX = length > SOLVER_TOLERANCE ? dx / length : 1;
          const unitZ = length > SOLVER_TOLERANCE ? dz / length : 0;
          x = anchor.x + unitX * dimension.value;
          z = anchor.z + unitZ * dimension.value;
        }
      }
      movePoint(target, x, z);
      priority.set(anchor.id, anchorPriority);
      priority.set(target.id, Math.max(priority.get(target.id) ?? 0, anchorPriority - 1));
    });
  }

  const conflicts: string[] = [];
  (next.constraints ?? []).forEach((constraint) => {
    if (constraint.kind === "fixed") {
      const point = pointById.get(constraint.pointId);
      if (!point || Math.hypot(point.x - constraint.x, point.z - constraint.z) > SOLVER_TOLERANCE) conflicts.push(constraint.id);
      return;
    }
    const segment = next.segments.find((entry) => entry.id === constraint.segmentId);
    const start = segment ? pointById.get(segment.startId) : null;
    const end = segment ? pointById.get(segment.endId) : null;
    const error = start && end ? constraint.kind === "horizontal" ? Math.abs(end.z - start.z) : Math.abs(end.x - start.x) : Number.POSITIVE_INFINITY;
    if (error > SOLVER_TOLERANCE) conflicts.push(constraint.id);
  });
  (next.dimensions ?? []).forEach((dimension) => {
    if (dimension.kind !== "length") return;
    const length = sketchSegmentLength(next, dimension.segmentId);
    if (length === null || Math.abs(length - dimension.value) > DIMENSION_TOLERANCE) conflicts.push(dimension.id);
  });
  return { profile: next, conflicts };
}

export function setSketchSegmentConstraint(
  profile: SketchProfile,
  segmentId: string,
  kind: SegmentConstraintKind,
  enabled: boolean,
  createId: IdFactory,
) {
  const segment = profile.segments.find((entry) => entry.id === segmentId);
  if (!segment || !isLineSegment(segment)) return solveSketchProfile(profile);
  const opposite = kind === "horizontal" ? "vertical" : "horizontal";
  const constraints = (profile.constraints ?? []).filter((constraint) =>
    constraint.kind === "fixed" || constraint.segmentId !== segmentId || constraint.kind !== kind && (!enabled || constraint.kind !== opposite),
  );
  if (enabled) constraints.push({ id: createId(`sketch-${kind}`), kind, segmentId });
  return solveSketchProfile({ ...profile, constraints }, segment.startId);
}

export function setSketchPointFixed(profile: SketchProfile, pointId: string, fixed: boolean, createId: IdFactory) {
  const point = profile.points.find((entry) => entry.id === pointId);
  if (!point) return solveSketchProfile(profile);
  const constraints = (profile.constraints ?? []).filter((constraint) => constraint.kind !== "fixed" || constraint.pointId !== pointId);
  if (fixed) constraints.push({ id: createId("sketch-fixed"), kind: "fixed", pointId, x: point.x, z: point.z });
  return solveSketchProfile({ ...profile, constraints }, pointId);
}

export function setSketchSegmentLength(profile: SketchProfile, segmentId: string, value: number | null, createId: IdFactory) {
  const segment = profile.segments.find((entry) => entry.id === segmentId);
  if (!segment || !isLineSegment(segment)) return solveSketchProfile(profile);
  const dimensions = (profile.dimensions ?? []).filter((dimension) => dimension.kind !== "length" || dimension.segmentId !== segmentId);
  if (value !== null && Number.isFinite(value) && value > SOLVER_TOLERANCE) {
    dimensions.push({ id: createId("sketch-length"), kind: "length", segmentId, value });
  }
  return solveSketchProfile({ ...profile, dimensions }, segment.startId);
}

export function moveConstrainedSketchPoint(profile: SketchProfile, pointId: string, position: { x: number; z: number }) {
  const next = cloneProfile(profile);
  const point = next.points.find((entry) => entry.id === pointId);
  const fixed = (next.constraints ?? []).some((constraint) => constraint.kind === "fixed" && constraint.pointId === pointId);
  if (!point || fixed) return solveSketchProfile(next);
  movePoint(point, position.x, position.z);
  return solveSketchProfile(next, pointId);
}
