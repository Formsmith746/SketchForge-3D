import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchSegment } from "@/types/sketchforge";

export function rectFromPoints(
  mode: "corner" | "center",
  first: { x: number; z: number },
  second: { x: number; z: number },
) {
  if (mode === "corner") {
    const minX = Math.min(first.x, second.x);
    const maxX = Math.max(first.x, second.x);
    const minZ = Math.min(first.z, second.z);
    const maxZ = Math.max(first.z, second.z);
    return { minX, maxX, minZ, maxZ, width: maxX - minX, height: maxZ - minZ };
  }
  const dx = Math.abs(second.x - first.x);
  const dz = Math.abs(second.z - first.z);
  return {
    minX: first.x - dx,
    maxX: first.x + dx,
    minZ: first.z - dz,
    maxZ: first.z + dz,
    width: dx * 2,
    height: dz * 2,
  };
}

export function rectangleSketchGeometry(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  createId: (prefix: string) => string = createLocalId,
): { points: SketchPoint[]; segments: SketchSegment[] } {
  const { minX, maxX, minZ, maxZ } = bounds;
  const pointIds = Array.from({ length: 4 }, () => createId("sketch-point"));
  const points: SketchPoint[] = [
    { id: pointIds[0], x: minX, z: minZ, mode: "corner" },
    { id: pointIds[1], x: maxX, z: minZ, mode: "corner" },
    { id: pointIds[2], x: maxX, z: maxZ, mode: "corner" },
    { id: pointIds[3], x: minX, z: maxZ, mode: "corner" },
  ];
  const segments: SketchSegment[] = pointIds.map((startId, index) => ({
    id: createId("sketch-segment"),
    startId,
    endId: pointIds[(index + 1) % pointIds.length],
    kind: "line",
  }));
  return { points, segments };
}
