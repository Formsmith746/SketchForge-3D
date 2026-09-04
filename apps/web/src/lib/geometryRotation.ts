import * as THREE from "three";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import { cleanNearZero, cleanRotationDegrees } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

export const GEOMETRY_ROTATION_STEP_DEGREES = 45;
export const GEOMETRY_FINE_ROTATION_STEP_DEGREES = 22.5;

type GeometryRotationShortcutEvent = {
  altKey: boolean;
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export function geometryRotationDegreesForShortcut(event: GeometryRotationShortcutEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.code !== "KeyR" && event.key.toLowerCase() !== "r") {
    return null;
  }
  return event.shiftKey ? GEOMETRY_FINE_ROTATION_STEP_DEGREES : GEOMETRY_ROTATION_STEP_DEGREES;
}

export function geometryRotationDelta(workplane: PlacementWorkplane, degrees: number) {
  const axis = new THREE.Vector3(workplane.normal.x, workplane.normal.y, workplane.normal.z);
  if (axis.lengthSq() < 0.000001) {
    axis.set(0, 1, 0);
  } else {
    axis.normalize();
  }
  return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(Number.isFinite(degrees) ? degrees : 0));
}

function quaternionForShape(shape: WorkplaneShape) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(shape.rotation),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
}

function rotationPatchFromQuaternion(quaternion: THREE.Quaternion) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    rotationX: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.x)),
    rotation: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.y)),
    rotationZ: cleanRotationDegrees(THREE.MathUtils.radToDeg(euler.z)),
  };
}

export function rotatedGeometryShapePatch(
  shape: WorkplaneShape,
  rotationDelta: THREE.Quaternion,
  pivot: THREE.Vector3 | null,
): Partial<WorkplaneShape> {
  const patch: Partial<WorkplaneShape> = rotationPatchFromQuaternion(
    rotationDelta.clone().multiply(quaternionForShape(shape)),
  );

  if (pivot) {
    const startCenter = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
    const nextCenter = pivot.clone().add(startCenter.sub(pivot).applyQuaternion(rotationDelta));
    patch.x = cleanNearZero(nextCenter.x, 0.0005);
    patch.z = cleanNearZero(nextCenter.z, 0.0005);
    patch.elevation = cleanNearZero(nextCenter.y - shape.height / 2, 0.0005);
  }

  return patch;
}
