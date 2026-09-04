import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";

export type TransformHandleKind = "scale" | "height" | "lift" | "rotate";
export type RotationAxis = "x" | "y" | "z";
export type RotationWheelView = { x: number; y: number; radius: number };

export type RotationPlaneView = {
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
  d: number;
  directionSign?: number;
};

export type RotationPlaneBasis = Pick<RotationPlaneView, "a" | "b" | "c" | "d">;

export type TransformOverlayPoint = { x: number; y: number };
export type TransformOverlayPoint3D = TransformOverlayPoint & { z: number };
export type TransformOverlayClipPoint = TransformOverlayPoint3D & { w: number };

export function isPointInsideTransformBounds(
  point: TransformOverlayPoint3D,
  min: TransformOverlayPoint3D,
  max: TransformOverlayPoint3D,
) {
  return point.x >= min.x
    && point.x <= max.x
    && point.y >= min.y
    && point.y <= max.y
    && point.z >= min.z
    && point.z <= max.z;
}

export function transformBoundsIntersectClipVolume(points: TransformOverlayClipPoint[]) {
  if (points.length === 0 || points.some((point) => ![point.x, point.y, point.z, point.w].every(Number.isFinite))) {
    return false;
  }

  // A convex selection box is outside the camera frustum only when every one
  // of its corners is beyond the same homogeneous clip plane. Checking the
  // planes before dividing by w also handles boxes behind the camera and boxes
  // that surround the camera during close zoom.
  const outsidePlanes = [
    (point: TransformOverlayClipPoint) => point.x < -point.w,
    (point: TransformOverlayClipPoint) => point.x > point.w,
    (point: TransformOverlayClipPoint) => point.y < -point.w,
    (point: TransformOverlayClipPoint) => point.y > point.w,
    (point: TransformOverlayClipPoint) => point.z < -point.w,
    (point: TransformOverlayClipPoint) => point.z > point.w,
  ];
  return !outsidePlanes.some((isOutside) => points.every(isOutside));
}

export function transformOverlayScreenPoint(
  projectedNdc: TransformOverlayPoint,
  cameraSpaceZ: number,
  width: number,
  height: number,
) {
  const x = ((projectedNdc.x + 1) / 2) * width;
  const y = ((1 - projectedNdc.y) / 2) * height;
  return {
    x,
    y,
    visible: cameraSpaceZ < -0.0001 && Number.isFinite(x) && Number.isFinite(y),
  };
}

export const ROTATION_WHEEL_SNAP_DEGREES = 45;
export const ROTATION_WHEEL_SHIFT_SNAP_DEGREES = 22.5;

type RotationDirectionVector = { x: number; y: number; z: number };

export function rotationPlaneDirectionSign(
  axis: RotationDirectionVector,
  uAxis: RotationDirectionVector,
  vAxis: RotationDirectionVector,
) {
  const crossX = uAxis.y * vAxis.z - uAxis.z * vAxis.y;
  const crossY = uAxis.z * vAxis.x - uAxis.x * vAxis.z;
  const crossZ = uAxis.x * vAxis.y - uAxis.y * vAxis.x;
  const alignment = axis.x * crossX + axis.y * crossY + axis.z * crossZ;
  return alignment < 0 ? -1 : 1;
}

export function snappedRotationDelta(rawDelta: number, insideSnapWheel: boolean, shiftKey: boolean) {
  const step = insideSnapWheel || shiftKey ? ROTATION_WHEEL_SNAP_DEGREES : 1;
  return Math.round(rawDelta / step) * step;
}

export function snappedWheelRotation(
  pointerAngle: number,
  startPointerAngle: number,
  directionSign = 1,
  snapDegrees = ROTATION_WHEEL_SNAP_DEGREES,
) {
  const snappedPointerAngle = Math.round(pointerAngle / snapDegrees) * snapDegrees;
  const snappedStartPointerAngle = Math.round(startPointerAngle / snapDegrees) * snapDegrees;
  let pointerDelta = snappedPointerAngle - snappedStartPointerAngle;
  while (pointerDelta > 180) pointerDelta -= 360;
  while (pointerDelta <= -180) pointerDelta += 360;
  const direction = directionSign < 0 ? -1 : 1;
  const delta = pointerDelta * direction;
  return {
    delta: delta === 0 ? 0 : delta,
    pointerAngle: snappedPointerAngle,
  };
}

export function continuousSnappedWheelRotation(
  rotation: { delta: number; pointerAngle: number },
  snapDegrees: number,
  previousSnapDegrees: number | undefined,
  previousDelta: number | undefined,
  previousPointerAngle: number | undefined,
  previousDeltaOffset = 0,
  previousPointerOffset = 0,
) {
  const snapModeChanged = previousSnapDegrees !== undefined && previousSnapDegrees !== snapDegrees;
  const deltaOffset = snapModeChanged && previousDelta !== undefined
    ? previousDelta - rotation.delta
    : previousDeltaOffset;
  const pointerOffset = snapModeChanged && previousPointerAngle !== undefined
    ? previousPointerAngle - rotation.pointerAngle
    : previousPointerOffset;
  let pointerAngle = rotation.pointerAngle + pointerOffset;
  while (pointerAngle > 180) pointerAngle -= 360;
  while (pointerAngle < -180) pointerAngle += 360;
  const delta = rotation.delta + deltaOffset;
  return {
    delta: delta === 0 ? 0 : delta,
    pointerAngle,
    deltaOffset,
    pointerOffset,
  };
}

export function normalizedRotationPlaneBasis(plane: RotationPlaneView, invertVerticalAxis = false): RotationPlaneBasis {
  const longestAxis = Math.max(Math.hypot(plane.a, plane.b), Math.hypot(plane.c, plane.d));
  if (!Number.isFinite(longestAxis) || longestAxis < 0.000001) {
    return { a: 1, b: 0, c: 0, d: 1 };
  }
  return {
    a: plane.a / longestAxis,
    b: plane.b / longestAxis,
    c: (plane.c / longestAxis) * (invertVerticalAxis ? -1 : 1),
    d: (plane.d / longestAxis) * (invertVerticalAxis ? -1 : 1),
  };
}

export type PinnedRotationWheelView = {
  axis: RotationAxis;
  wheel: RotationWheelView;
  plane: RotationPlaneView;
};

export type DimensionMark = {
  key: string;
  handleKey: string;
  axis: "width" | "depth" | "height" | "elevation";
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  e1x1: number;
  e1y1: number;
  e1x2: number;
  e1y2: number;
  e2x1: number;
  e2y1: number;
  e2x2: number;
  e2y2: number;
  labelX: number;
  labelY: number;
};

export type TransformOverlayState = {
  id: string;
  width: number;
  height: number;
  guides: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  handles: Array<{ key: string; className: string; kind: TransformHandleKind; x: number; y: number; title: string; angle?: number }>;
  rotateHandles: Array<{ key: string; className: string; x: number; y: number; plane: RotationPlaneBasis }>;
  dimensions: Record<string, DimensionMark[]>;
  rotationWheel: RotationWheelView | null;
  rotationWheels: Record<RotationAxis, RotationWheelView>;
  rotationPlaneCenters: Record<RotationAxis, { x: number; y: number; z: number }>;
  rotationPlanes: Record<RotationAxis, RotationPlaneView>;
};

export type RotationReadout = {
  x: number;
  y: number;
  text: string;
  angle?: number;
  pointerAngle?: number;
} | null;

export type EditingDimension = {
  key: string;
  axis: "width" | "depth" | "height" | "elevation";
  x: number;
  y: number;
  value: string;
} | null;

export type EditingRotation = {
  axis: RotationAxis;
  handleKey: string;
  x: number;
  y: number;
  value: string;
} | null;

export type TransformOverlayProps = {
  box: TransformOverlayState;
  measureKey: string | null;
  editingDimension: EditingDimension;
  editingRotation: EditingRotation;
  rotationReadout: RotationReadout;
  showRotationWheel: boolean;
  hideSelectionChrome: boolean;
  hideDimensionMarks: boolean;
  rotationWheelAxis: RotationAxis;
  pinnedRotationWheelView: PinnedRotationWheelView | null;
  onBeginCameraDrag: (event: ReactPointerEvent<Element>) => void;
  onCameraWheel: (event: ReactWheelEvent<Element>) => void;
  onBeginTransform: (kind: TransformHandleKind, handleKey: string, event: ReactPointerEvent<Element>) => void;
  onMoveTransform: (clientX: number, clientY: number, shiftKey?: boolean, altKey?: boolean) => boolean;
  onFinishTransform: (event: ReactPointerEvent<Element>) => void;
  onHoverMeasure: (key: string | null) => void;
  onPinMeasure: (key: string | null) => void;
  onBeginDimensionEdit: (mark: DimensionMark) => void;
  onBeginLiftEdit: (handleKey: string, x: number, y: number) => void;
  onEditingDimensionChange: (value: string) => void;
  onCommitDimensionEdit: () => void;
  onCancelDimensionEdit: () => void;
  onBeginRotationEdit: (handleKey: string, x: number, y: number) => void;
  onEditingRotationChange: (value: string) => void;
  onCommitRotationEdit: () => void;
  onCancelRotationEdit: () => void;
};

export function getElevationMeasureKey(overlay: TransformOverlayState | null) {
  return (
    Object.values(overlay?.dimensions ?? {})
      .flat()
      .find((mark) => mark.axis === "elevation")?.handleKey ?? null
  );
}

export function measureKeyForHandle(kind: TransformHandleKind, handleKey: string, overlay: TransformOverlayState | null) {
  if (kind === "lift") {
    return getElevationMeasureKey(overlay) ?? handleKey;
  }
  return handleKey;
}
