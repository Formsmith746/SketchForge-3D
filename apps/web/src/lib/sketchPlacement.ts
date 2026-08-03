import {
  placementPatchForNewShape,
  placementWorkplanePoint,
  type PlacementWorkplane,
} from "@/lib/placementWorkplane";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

export function placeSketchExtrusion(
  shape: WorkplaneShape,
  workplane: PlacementWorkplane,
  existing?: WorkplaneShape | null,
) {
  if (existing) {
    return canonicalizeShape({
      ...shape,
      x: existing.x,
      z: existing.z,
      elevation: existing.elevation ?? 0,
      rotation: existing.rotation,
      rotationX: existing.rotationX ?? 0,
      rotationZ: existing.rotationZ ?? 0,
      mirrorX: existing.mirrorX,
      mirrorY: existing.mirrorY,
      mirrorZ: existing.mirrorZ,
      locked: existing.locked,
      hidden: existing.hidden,
    });
  }

  const basePoint = placementWorkplanePoint(workplane, shape.x, shape.z);
  return canonicalizeShape({
    ...shape,
    ...placementPatchForNewShape(shape, workplane, basePoint),
  });
}
