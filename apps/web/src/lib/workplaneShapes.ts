import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/sketchforge";

export function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function cleanRotationDegrees(value: number, precision = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = normalizeDegrees(value);
  const rounded = Number(normalized.toFixed(precision));
  const zeroThreshold = precision <= 1 ? 0.5 : 0.05;
  if (rounded < zeroThreshold || rounded >= 360 - zeroThreshold || Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

export function cleanNearZero(value: number, epsilon = 0.005) {
  return Math.abs(value) < epsilon ? 0 : value;
}

export function shapeTransformShouldRemainEditable(shape: WorkplaneShape) {
  return shape.kind === "text" || Boolean(shape.groupedShapes?.length);
}

export function cloneWorkplaneShapeTreeWithFreshIds(shape: WorkplaneShape, suffix: string): WorkplaneShape {
  return {
    ...shape,
    id: createLocalId(`${shape.id}-${suffix}`),
    groupedShapes: shape.groupedShapes?.map((child) => cloneWorkplaneShapeTreeWithFreshIds(child, suffix)),
  };
}

export function shapeWidth(shape: WorkplaneShape) {
  return shape.width ?? shape.size;
}

export function shapeDepth(shape: WorkplaneShape) {
  return shape.depth ?? shape.size;
}

export function normalizeTaperScale(value?: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(0.05, value as number));
}

function positiveTaperDimension(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.01, value as number);
}

export function shapeTaperDimensions(shape: WorkplaneShape) {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  return {
    topWidth: positiveTaperDimension(shape.taperTopWidth, width * normalizeTaperScale(shape.taperTopScale)),
    topDepth: positiveTaperDimension(shape.taperTopDepth, depth * normalizeTaperScale(shape.taperTopScale)),
    bottomWidth: positiveTaperDimension(shape.taperBottomWidth, width * normalizeTaperScale(shape.taperBottomScale)),
    bottomDepth: positiveTaperDimension(shape.taperBottomDepth, depth * normalizeTaperScale(shape.taperBottomScale)),
  };
}

export function shapeHasTaper(shape: WorkplaneShape) {
  if (shape.kind === "gear") return false;
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const taper = shapeTaperDimensions(shape);
  return Math.abs(taper.topWidth - width) > 1e-6 || Math.abs(taper.topDepth - depth) > 1e-6 || Math.abs(taper.bottomWidth - width) > 1e-6 || Math.abs(taper.bottomDepth - depth) > 1e-6;
}

export function shapeOverallFootprintDimensions(shape: WorkplaneShape) {
  if (!shapeHasTaper(shape)) {
    return { width: shapeWidth(shape), depth: shapeDepth(shape) };
  }
  const taper = shapeTaperDimensions(shape);
  return {
    width: Math.max(taper.topWidth, taper.bottomWidth),
    depth: Math.max(taper.topDepth, taper.bottomDepth),
  };
}

export function shapeTaperScaleAt(shape: WorkplaneShape, normalizedHeight: number, axis: "width" | "depth" = "width") {
  if (shape.kind === "gear") return 1;
  const taper = shapeTaperDimensions(shape);
  const base = axis === "width" ? shapeWidth(shape) : shapeDepth(shape);
  const bottom = axis === "width" ? taper.bottomWidth : taper.bottomDepth;
  const top = axis === "width" ? taper.topWidth : taper.topDepth;
  const t = Math.min(1, Math.max(0, Number.isFinite(normalizedHeight) ? normalizedHeight : 0));
  return (bottom + (top - bottom) * t) / Math.max(0.01, base);
}

export function meshYawDegrees(shape: WorkplaneShape) {
  const isRoundPrimitive = !shape.importedMesh && (shape.kind === "cylinder" || shape.kind === "cone");
  const isCircular = Math.abs(shapeWidth(shape) - shapeDepth(shape)) < 0.0005;
  if (!isRoundPrimitive || !isCircular) {
    return shape.rotation;
  }

  // A tessellated circular primitive is only invariant by one whole side step.
  // Preserve the remaining yaw so low-sided cylinders (for example a triangular
  // prism) are baked and used in booleans at the same angle shown in the viewport.
  const sides = Math.max(3, Math.round(shape.sides ?? 96));
  const sideStep = 360 / sides;
  const normalized = normalizeDegrees(shape.rotation);
  const equivalentYaw = normalized - Math.round(normalized / sideStep) * sideStep;
  return Math.abs(equivalentYaw) < 1e-9 ? 0 : equivalentYaw;
}

function edgeTreatmentPreserveZone(shape: WorkplaneShape): number {
  const own = Math.max(...(shape.edgeTreatments ?? []).map((feature) => feature.amount), 0);
  const child = Math.max(...(shape.groupedShapes ?? []).map(edgeTreatmentPreserveZone), 0);
  return Math.max(own, child);
}

export function preservesEdgeTreatmentSize(shape: WorkplaneShape) {
  return shape.edgeResizeMode === "preserve" && Boolean(shape.importedMesh && edgeTreatmentPreserveZone(shape) > 0);
}

function edgePreservedCoordinate(value: number, baseSize: number, targetSize: number, centered: boolean, requestedZone: number) {
  const oldMin = centered ? -baseSize / 2 : 0;
  const oldMax = oldMin + baseSize;
  const newMin = centered ? -targetSize / 2 : 0;
  const zone = Math.max(0, Math.min(requestedZone, baseSize / 2, targetSize / 2));
  if (zone <= 1e-6 || Math.abs(baseSize - targetSize) <= 1e-9) {
    return newMin + (value - oldMin) * targetSize / Math.max(0.001, baseSize);
  }
  const distanceFromMin = value - oldMin;
  const distanceFromMax = oldMax - value;
  if (distanceFromMin <= zone) return newMin + distanceFromMin;
  if (distanceFromMax <= zone) return newMin + targetSize - distanceFromMax;
  const oldInterior = Math.max(1e-6, baseSize - zone * 2);
  const newInterior = Math.max(0, targetSize - zone * 2);
  return newMin + zone + (distanceFromMin - zone) * newInterior / oldInterior;
}

export function resizedImportedCoordinates(shape: WorkplaneShape, sourcePositions: number[]) {
  const mesh = shape.importedMesh;
  if (!mesh) return [];
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const preserve = preservesEdgeTreatmentSize(shape);
  const zone = preserve ? edgeTreatmentPreserveZone(shape) : 0;
  const positions = new Array<number>(sourcePositions.length);
  for (let index = 0; index + 2 < sourcePositions.length; index += 3) {
    if (preserve) {
      positions[index] = edgePreservedCoordinate(sourcePositions[index], mesh.baseWidth, width, true, zone);
      positions[index + 1] = edgePreservedCoordinate(sourcePositions[index + 1], mesh.baseHeight, height, false, zone);
      positions[index + 2] = edgePreservedCoordinate(sourcePositions[index + 2], mesh.baseDepth, depth, true, zone);
    } else {
      positions[index] = sourcePositions[index] * width / Math.max(0.001, mesh.baseWidth);
      positions[index + 1] = sourcePositions[index + 1] * height / Math.max(0.001, mesh.baseHeight);
      positions[index + 2] = sourcePositions[index + 2] * depth / Math.max(0.001, mesh.baseDepth);
    }
  }
  return positions;
}

export function resizedImportedMeshPositions(shape: WorkplaneShape) {
  return shape.importedMesh ? resizedImportedCoordinates(shape, shape.importedMesh.positions) : [];
}

export function resizedShapeSize(width: number, depth: number) {
  return Math.max(width, depth);
}

export function proportionalResizeScale(startWidth: number, startDepth: number, nextWidth: number, nextDepth: number) {
  const widthScale = nextWidth / Math.max(0.001, startWidth);
  const depthScale = nextDepth / Math.max(0.001, startDepth);
  if (!Number.isFinite(widthScale) || !Number.isFinite(depthScale)) {
    return 1;
  }
  return Math.abs(widthScale - 1) >= Math.abs(depthScale - 1) ? widthScale : depthScale;
}

export function fallbackSolidColor(shape: WorkplaneShape) {
  if (shape.sketchOperation === "revolve") return "#78b96b";
  if (shape.kind === "cylinder") return "#d97813";
  if (shape.kind === "sphere") return "#0098c7";
  if (shape.kind === "cone") return "#6e2786";
  if (shape.kind === "pyramid") return "#f2cf10";
  if (shape.kind === "gear") return "#6f7f8d";
  return "#d41721";
}

export function withHoleMode(shape: WorkplaneShape, hole: boolean, parentColor?: string): WorkplaneShape {
  const color = parentColor ?? shape.color;
  return {
    ...shape,
    hole,
    color,
    groupedShapes: shape.groupedShapes?.map((child) => withHoleMode(child, hole, parentColor)),
  };
}

export function mirrorSign(value?: boolean) {
  return value ? -1 : 1;
}

export function mirroredAxisCount(shape: WorkplaneShape) {
  return [shape.mirrorX, shape.mirrorY, shape.mirrorZ].filter(Boolean).length;
}

export function canonicalizeShape(shape: WorkplaneShape): WorkplaneShape {
  const next: WorkplaneShape = {
    ...shape,
    rotation: cleanRotationDegrees(shape.rotation ?? 0),
    rotationX: cleanRotationDegrees(shape.rotationX ?? 0),
    rotationZ: cleanRotationDegrees(shape.rotationZ ?? 0),
    mirrorX: shape.mirrorX || undefined,
    mirrorY: shape.mirrorY || undefined,
    mirrorZ: shape.mirrorZ || undefined,
  };
  if (shape.groupedShapes) {
    next.groupedShapes = shape.groupedShapes.map(canonicalizeShape);
  }
  if (shape.sketchRevolve) {
    next.sketchRevolve = {
      startAngle: shape.sketchRevolve.startAngle,
      sweepAngle: shape.sketchRevolve.sweepAngle,
      sides: shape.sketchRevolve.sides,
      quality: shape.sketchRevolve.quality,
    };
  }
  if (shape.edgeTreatmentHistory) {
    next.edgeTreatmentHistory = shape.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: canonicalizeShape(entry.before),
    }));
  }
  return next;
}

export function workplaneShapesEqual(a: WorkplaneShape, b: WorkplaneShape) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.color === b.color &&
    a.hole === b.hole &&
    a.x === b.x &&
    a.z === b.z &&
    a.elevation === b.elevation &&
    a.size === b.size &&
    a.width === b.width &&
    a.depth === b.depth &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.rotationX === b.rotationX &&
    a.rotationZ === b.rotationZ &&
    a.mirrorX === b.mirrorX &&
    a.mirrorY === b.mirrorY &&
    a.mirrorZ === b.mirrorZ &&
    a.radius === b.radius &&
    a.steps === b.steps &&
    a.sides === b.sides &&
    a.bevel === b.bevel &&
    a.segments === b.segments &&
    a.topRadius === b.topRadius &&
    a.baseRadius === b.baseRadius &&
    a.taperTopWidth === b.taperTopWidth &&
    a.taperTopDepth === b.taperTopDepth &&
    a.taperBottomWidth === b.taperBottomWidth &&
    a.taperBottomDepth === b.taperBottomDepth &&
    a.taperTopScale === b.taperTopScale &&
    a.taperBottomScale === b.taperBottomScale &&
    a.teeth === b.teeth &&
    a.toothSize === b.toothSize &&
    a.toothWidth === b.toothWidth &&
    a.centerHoleSize === b.centerHoleSize &&
    a.gearType === b.gearType &&
    a.helixAngle === b.helixAngle &&
    a.helixQuality === b.helixQuality &&
    a.text === b.text &&
    a.font === b.font &&
    a.importedMesh === b.importedMesh &&
    a.imagePlate === b.imagePlate &&
    a.sketchProfile === b.sketchProfile &&
    a.sketchOperation === b.sketchOperation &&
    a.sketchRevolve === b.sketchRevolve &&
    a.edgeTreatments === b.edgeTreatments &&
    a.edgeTreatmentHistory === b.edgeTreatmentHistory &&
    a.cadDisplayEdges === b.cadDisplayEdges &&
    a.cadDisplayEdgesVersion === b.cadDisplayEdgesVersion &&
    a.edgeResizeMode === b.edgeResizeMode &&
    a.cadBrep === b.cadBrep &&
    a.cadBrepFrame === b.cadBrepFrame &&
    a.cadPrimitiveFrame === b.cadPrimitiveFrame &&
    a.groupedShapes === b.groupedShapes &&
    a.groupedBaseWidth === b.groupedBaseWidth &&
    a.groupedBaseDepth === b.groupedBaseDepth &&
    a.groupedBaseHeight === b.groupedBaseHeight &&
    a.groupOperation === b.groupOperation &&
    a.locked === b.locked &&
    a.hidden === b.hidden
  );
}

export function serializeShapesForSync(shapes: WorkplaneShape[]) {
  return JSON.stringify(shapes.map(canonicalizeShape));
}
