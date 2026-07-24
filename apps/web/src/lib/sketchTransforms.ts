import { createLocalId } from "@/lib/localIds";
import type { SketchConstraint, SketchDimension, SketchImage, SketchPoint, SketchProfile, SketchSegment, SketchText } from "@/types/sketchforge";

export type SketchTransformSelection = {
  pointIds: string[];
  segmentIds: string[];
  imageIds: string[];
  textIds: string[];
};

export type SketchAffineTransform = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  tz: number;
};

export type SketchTransformResult = {
  profile: SketchProfile;
  selection: SketchTransformSelection;
};

type Point2D = { x: number; z: number };
type IdFactory = (prefix: string) => string;

const AXIS_EPSILON = 1e-9;

export function applyAffineTransform(transform: SketchAffineTransform, point: Point2D): Point2D {
  return {
    x: transform.a * point.x + transform.c * point.z + transform.tx,
    z: transform.b * point.x + transform.d * point.z + transform.tz,
  };
}

export function translationTransform(deltaX: number, deltaZ: number): SketchAffineTransform {
  return { a: 1, b: 0, c: 0, d: 1, tx: deltaX, tz: deltaZ };
}

export function rotationTransform(angleRadians: number, center: Point2D = { x: 0, z: 0 }): SketchAffineTransform {
  const cosine = Math.cos(angleRadians);
  const sine = Math.sin(angleRadians);
  return {
    a: cosine,
    b: sine,
    c: -sine,
    d: cosine,
    tx: center.x - cosine * center.x + sine * center.z,
    tz: center.z - sine * center.x - cosine * center.z,
  };
}

export function reflectionTransform(lineStart: Point2D, lineEnd: Point2D): SketchAffineTransform {
  const deltaX = lineEnd.x - lineStart.x;
  const deltaZ = lineEnd.z - lineStart.z;
  const length = Math.hypot(deltaX, deltaZ);
  if (length <= Number.EPSILON) throw new Error("Reflection line must have two distinct points");

  const unitX = deltaX / length;
  const unitZ = deltaZ / length;
  const a = 2 * unitX * unitX - 1;
  const b = 2 * unitX * unitZ;
  const c = b;
  const d = 2 * unitZ * unitZ - 1;
  return {
    a,
    b,
    c,
    d,
    tx: lineStart.x - a * lineStart.x - c * lineStart.z,
    tz: lineStart.z - b * lineStart.x - d * lineStart.z,
  };
}

export function normalizeSketchTransformSelection(
  profile: SketchProfile,
  selection: SketchTransformSelection,
): SketchTransformSelection {
  const selectedPointIds = new Set(selection.pointIds);
  const selectedSegmentIds = new Set(selection.segmentIds);
  for (const segment of profile.segments) {
    if (!selectedSegmentIds.has(segment.id)) continue;
    selectedPointIds.add(segment.startId);
    selectedPointIds.add(segment.endId);
  }

  const selectedImageIds = new Set(selection.imageIds);
  const selectedTextIds = new Set(selection.textIds);
  return {
    pointIds: profile.points.filter((point) => selectedPointIds.has(point.id)).map((point) => point.id),
    segmentIds: profile.segments.filter((segment) => selectedSegmentIds.has(segment.id)).map((segment) => segment.id),
    imageIds: (profile.images ?? []).filter((image) => selectedImageIds.has(image.id)).map((image) => image.id),
    textIds: (profile.texts ?? []).filter((text) => selectedTextIds.has(text.id)).map((text) => text.id),
  };
}

function transformedAxisConstraint(
  kind: "horizontal" | "vertical",
  transform: SketchAffineTransform,
): "horizontal" | "vertical" | null {
  const x = kind === "horizontal" ? transform.a : transform.c;
  const z = kind === "horizontal" ? transform.b : transform.d;
  const length = Math.hypot(x, z);
  if (length <= Number.EPSILON) return null;
  if (Math.abs(z) <= AXIS_EPSILON * length) return "horizontal";
  if (Math.abs(x) <= AXIS_EPSILON * length) return "vertical";
  return null;
}

export function transformSketchSelection(
  profile: SketchProfile,
  selection: SketchTransformSelection,
  transforms: readonly SketchAffineTransform[],
  createId: IdFactory = createLocalId,
): SketchTransformResult {
  const normalized = normalizeSketchTransformSelection(profile, selection);
  const pointIds = new Set(normalized.pointIds);
  const segmentIds = new Set(normalized.segmentIds);
  const imageIds = new Set(normalized.imageIds);
  const textIds = new Set(normalized.textIds);
  const sourcePoints = profile.points.filter((point) => pointIds.has(point.id));
  const sourceSegments = profile.segments.filter((segment) => segmentIds.has(segment.id));
  const sourceImages = (profile.images ?? []).filter((image) => imageIds.has(image.id));
  const sourceTexts = (profile.texts ?? []).filter((text) => textIds.has(text.id));

  const copiedPoints: SketchPoint[] = [];
  const copiedSegments: SketchSegment[] = [];
  const copiedConstraints: SketchConstraint[] = [];
  const copiedDimensions: SketchDimension[] = [];
  const copiedImages: SketchImage[] = [];
  const copiedTexts: SketchText[] = [];
  const generatedSelection: SketchTransformSelection = { pointIds: [], segmentIds: [], imageIds: [], textIds: [] };

  for (const transform of transforms) {
    const pointIdMap = new Map<string, string>();
    const segmentIdMap = new Map<string, string>();

    for (const point of sourcePoints) {
      const id = createId("sketch-point");
      const position = applyAffineTransform(transform, point);
      const handleIn = point.handleIn ? applyAffineTransform(transform, point.handleIn) : undefined;
      const handleOut = point.handleOut ? applyAffineTransform(transform, point.handleOut) : undefined;
      copiedPoints.push({ ...point, ...position, id, handleIn, handleOut });
      pointIdMap.set(point.id, id);
      generatedSelection.pointIds.push(id);
    }

    for (const segment of sourceSegments) {
      const startId = pointIdMap.get(segment.startId);
      const endId = pointIdMap.get(segment.endId);
      if (!startId || !endId) continue;
      const id = createId("sketch-segment");
      const dimensionLabelOffset = segment.dimensionLabelOffset ? {
        x: transform.a * segment.dimensionLabelOffset.x + transform.c * segment.dimensionLabelOffset.z,
        z: transform.b * segment.dimensionLabelOffset.x + transform.d * segment.dimensionLabelOffset.z,
      } : undefined;
      copiedSegments.push({ ...segment, id, startId, endId, ...(dimensionLabelOffset ? { dimensionLabelOffset } : {}) });
      segmentIdMap.set(segment.id, id);
      generatedSelection.segmentIds.push(id);
    }

    for (const constraint of profile.constraints ?? []) {
      if (constraint.kind === "fixed") {
        const pointId = pointIdMap.get(constraint.pointId);
        if (!pointId) continue;
        const position = applyAffineTransform(transform, constraint);
        copiedConstraints.push({ ...constraint, ...position, id: createId("sketch-fixed"), pointId });
        continue;
      }

      const segmentId = segmentIdMap.get(constraint.segmentId);
      const kind = transformedAxisConstraint(constraint.kind, transform);
      if (!segmentId || !kind) continue;
      copiedConstraints.push({ id: createId(`sketch-${kind}`), kind, segmentId });
    }

    for (const dimension of profile.dimensions ?? []) {
      const segmentId = segmentIdMap.get(dimension.segmentId);
      if (!segmentId) continue;
      copiedDimensions.push({ ...dimension, id: createId("sketch-length"), segmentId });
    }

    for (const image of sourceImages) {
      const id = createId("sketch-image");
      const position = applyAffineTransform(transform, image);
      copiedImages.push({ ...image, ...position, id });
      generatedSelection.imageIds.push(id);
    }

    for (const text of sourceTexts) {
      const id = createId("sketch-text");
      const position = applyAffineTransform(transform, text);
      copiedTexts.push({ ...text, ...position, id });
      generatedSelection.textIds.push(id);
    }
  }

  return {
    profile: {
      ...profile,
      points: [...profile.points, ...copiedPoints],
      segments: [...profile.segments, ...copiedSegments],
      constraints: copiedConstraints.length ? [...(profile.constraints ?? []), ...copiedConstraints] : profile.constraints,
      dimensions: copiedDimensions.length ? [...(profile.dimensions ?? []), ...copiedDimensions] : profile.dimensions,
      images: copiedImages.length ? [...(profile.images ?? []), ...copiedImages] : profile.images,
      texts: copiedTexts.length ? [...(profile.texts ?? []), ...copiedTexts] : profile.texts,
    },
    selection: generatedSelection,
  };
}
