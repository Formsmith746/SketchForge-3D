import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";

export type PlacementPoint = { x: number; y: number; z: number };

export type PlacementWorkplane = {
  origin: PlacementPoint;
  normal: PlacementPoint;
  xAxis: PlacementPoint;
  zAxis: PlacementPoint;
};

const EPSILON = 1e-8;

function vector(point: PlacementPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

function point(value: THREE.Vector3): PlacementPoint {
  return {
    x: value.x === 0 ? 0 : value.x,
    y: value.y === 0 ? 0 : value.y,
    z: value.z === 0 ? 0 : value.z,
  };
}

function clean(value: number) {
  const rounded = Number(value.toFixed(6));
  return Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

function finitePoint(value: unknown): PlacementPoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PlacementPoint>;
  if (![candidate.x, candidate.y, candidate.z].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
    return null;
  }
  return { x: candidate.x as number, y: candidate.y as number, z: candidate.z as number };
}

export function horizontalPlacementWorkplane(elevation = 0): PlacementWorkplane {
  return {
    origin: { x: 0, y: Number.isFinite(elevation) ? elevation : 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    xAxis: { x: 1, y: 0, z: 0 },
    zAxis: { x: 0, y: 0, z: 1 },
  };
}

export function normalizePlacementWorkplane(value: unknown, fallbackElevation = 0): PlacementWorkplane {
  if (!value || typeof value !== "object") return horizontalPlacementWorkplane(fallbackElevation);
  const candidate = value as Partial<PlacementWorkplane>;
  const origin = finitePoint(candidate.origin);
  const normal = finitePoint(candidate.normal);
  const xAxis = finitePoint(candidate.xAxis);
  if (!origin || !normal || !xAxis || vector(normal).lengthSq() < EPSILON || vector(xAxis).lengthSq() < EPSILON) {
    return horizontalPlacementWorkplane(fallbackElevation);
  }
  return placementWorkplaneFromSurface(origin, normal, xAxis);
}

export function placementWorkplaneFingerprint(workplane: PlacementWorkplane) {
  return [
    workplane.origin.x, workplane.origin.y, workplane.origin.z,
    workplane.normal.x, workplane.normal.y, workplane.normal.z,
    workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z,
    workplane.zAxis.x, workplane.zAxis.y, workplane.zAxis.z,
  ].map(clean).join(":");
}

export function placementWorkplaneFromSurface(
  origin: PlacementPoint,
  surfaceNormal: PlacementPoint,
  tangentHint: PlacementPoint,
  reverse = false,
): PlacementWorkplane {
  const normal = vector(surfaceNormal).normalize();
  if (reverse) normal.negate();

  let xAxis = vector(tangentHint).projectOnPlane(normal);
  if (xAxis.lengthSq() < EPSILON) {
    const candidates = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0),
    ];
    xAxis = candidates.reduce((best, candidate) => {
      const projected = candidate.clone().projectOnPlane(normal);
      return projected.lengthSq() > best.lengthSq() ? projected : best;
    }, new THREE.Vector3());
  }
  xAxis.normalize();
  const zAxis = xAxis.clone().cross(normal).normalize();

  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    normal: point(normal),
    xAxis: point(xAxis),
    zAxis: point(zAxis),
  };
}

export function snapPlacementWorkplaneOrigin(
  workplane: PlacementWorkplane,
  step: number,
  referenceOrigin: PlacementPoint = { x: 0, y: 0, z: 0 },
): PlacementWorkplane {
  if (!Number.isFinite(step) || step <= 0) return workplane;

  const normal = vector(workplane.normal);
  const xAxis = vector(workplane.xAxis);
  const zAxis = vector(workplane.zAxis);
  const origin = vector(workplane.origin);
  const reference = vector(referenceOrigin);
  const anchor = reference.clone().addScaledVector(
    normal,
    origin.clone().sub(reference).dot(normal),
  );
  const offset = origin.clone().sub(anchor);
  const snappedOrigin = anchor
    .addScaledVector(xAxis, Math.round(offset.dot(xAxis) / step) * step)
    .addScaledVector(zAxis, Math.round(offset.dot(zAxis) / step) * step);

  return {
    ...workplane,
    origin: point(snappedOrigin),
  };
}

export function placementWorkplaneQuaternion(workplane: PlacementWorkplane) {
  const basis = new THREE.Matrix4().makeBasis(
    vector(workplane.xAxis),
    vector(workplane.normal),
    vector(workplane.zAxis),
  );
  return new THREE.Quaternion().setFromRotationMatrix(basis).normalize();
}

export function placementWorkplaneCoordinates(workplane: PlacementWorkplane, worldPoint: PlacementPoint) {
  const relative = vector(worldPoint).sub(vector(workplane.origin));
  return {
    x: relative.dot(vector(workplane.xAxis)),
    y: relative.dot(vector(workplane.normal)),
    z: relative.dot(vector(workplane.zAxis)),
  };
}

export function placementWorkplanePoint(workplane: PlacementWorkplane, x: number, z: number): PlacementPoint {
  const world = vector(workplane.origin)
    .addScaledVector(vector(workplane.xAxis), x)
    .addScaledVector(vector(workplane.zAxis), z);
  return point(world);
}

export function placementPatchForNewShape(
  shape: Pick<WorkplaneShape, "height">,
  workplane: PlacementWorkplane,
  basePoint: PlacementPoint = workplane.origin,
): Pick<WorkplaneShape, "x" | "z" | "elevation" | "rotation" | "rotationX" | "rotationZ"> {
  const quaternion = placementWorkplaneQuaternion(workplane);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  const center = vector(basePoint).addScaledVector(vector(workplane.normal), shape.height / 2);
  return {
    x: clean(center.x),
    z: clean(center.z),
    elevation: clean(center.y - shape.height / 2),
    rotation: clean(THREE.MathUtils.radToDeg(euler.y)),
    rotationX: clean(THREE.MathUtils.radToDeg(euler.x)),
    rotationZ: clean(THREE.MathUtils.radToDeg(euler.z)),
  };
}

export function translationToWorkplane(
  workplane: PlacementWorkplane,
  worldVertices: PlacementPoint[],
): PlacementPoint {
  if (worldVertices.length === 0) return { x: 0, y: 0, z: 0 };
  const origin = vector(workplane.origin);
  const normal = vector(workplane.normal);
  const minimumDistance = worldVertices.reduce(
    (minimum, vertex) => Math.min(minimum, vector(vertex).sub(origin).dot(normal)),
    Number.POSITIVE_INFINITY,
  );
  const translation = normal.multiplyScalar(-minimumDistance);
  return point(translation);
}

export function placementWorkplaneIsBase(workplane: PlacementWorkplane) {
  return (
    Math.abs(workplane.origin.x) < 1e-6
    && Math.abs(workplane.origin.y) < 1e-6
    && Math.abs(workplane.origin.z) < 1e-6
    && Math.abs(workplane.normal.x) < 1e-6
    && Math.abs(workplane.normal.y - 1) < 1e-6
    && Math.abs(workplane.normal.z) < 1e-6
  );
}
