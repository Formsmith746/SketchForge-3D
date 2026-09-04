import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchSegment } from "@/types/sketchforge";

const CIRCLE_BEZIER_KAPPA = 0.5522847498307936;

export function circleFromPoints(
  mode: "center-radius" | "diameter",
  first: { x: number; z: number },
  second: { x: number; z: number },
) {
  const center = mode === "center-radius"
    ? first
    : { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
  const radius = Math.hypot(second.x - first.x, second.z - first.z) / (mode === "center-radius" ? 1 : 2);
  return { center, radius };
}

export function circleSketchGeometry(
  center: { x: number; z: number },
  radius: number,
  createId: (prefix: string) => string = createLocalId,
): { points: SketchPoint[]; segments: SketchSegment[] } {
  const handleOffset = radius * CIRCLE_BEZIER_KAPPA;
  const pointIds = Array.from({ length: 4 }, () => createId("sketch-point"));
  const points: SketchPoint[] = [
    {
      id: pointIds[0],
      x: center.x + radius,
      z: center.z,
      handleIn: { x: center.x + radius, z: center.z - handleOffset },
      handleOut: { x: center.x + radius, z: center.z + handleOffset },
      mode: "smooth",
    },
    {
      id: pointIds[1],
      x: center.x,
      z: center.z + radius,
      handleIn: { x: center.x + handleOffset, z: center.z + radius },
      handleOut: { x: center.x - handleOffset, z: center.z + radius },
      mode: "smooth",
    },
    {
      id: pointIds[2],
      x: center.x - radius,
      z: center.z,
      handleIn: { x: center.x - radius, z: center.z + handleOffset },
      handleOut: { x: center.x - radius, z: center.z - handleOffset },
      mode: "smooth",
    },
    {
      id: pointIds[3],
      x: center.x,
      z: center.z - radius,
      handleIn: { x: center.x - handleOffset, z: center.z - radius },
      handleOut: { x: center.x + handleOffset, z: center.z - radius },
      mode: "smooth",
    },
  ];
  const segments: SketchSegment[] = pointIds.map((startId, index) => ({
    id: createId("sketch-segment"),
    startId,
    endId: pointIds[(index + 1) % pointIds.length],
    kind: "bezier",
  }));
  return { points, segments };
}
