import { createLocalId } from "@/lib/localIds";
import type { SketchPoint, SketchSegment } from "@/types/sketchforge";

export function polygonFromPoints(
  mode: "inscribed" | "circumscribed" | "edge",
  sides: number,
  first: { x: number; z: number },
  second: { x: number; z: number },
) {
  const apothemAngle = Math.PI / sides;

  if (mode === "edge") {
    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const edgeLen = Math.hypot(dx, dz);
    const circumR = edgeLen / (2 * Math.sin(apothemAngle));
    const apothem = circumR * Math.cos(apothemAngle);
    const midX = (first.x + second.x) / 2;
    const midZ = (first.z + second.z) / 2;
    const perpX = -dz / edgeLen;
    const perpZ = dx / edgeLen;
    const center = { x: midX + perpX * apothem, z: midZ + perpZ * apothem };
    const startAngle = Math.atan2(first.z - center.z, first.x - center.x);
    return { center, circumR, startAngle };
  }

  const center = first;
  const dist = Math.hypot(second.x - first.x, second.z - first.z);
  const circumR = mode === "inscribed"
    ? dist
    : dist / Math.cos(apothemAngle);
  const startAngle = Math.atan2(second.z - center.z, second.x - center.x);

  return { center, circumR, startAngle };
}

export function polygonSketchGeometry(
  center: { x: number; z: number },
  circumR: number,
  startAngle: number,
  sides: number,
  createId: (prefix: string) => string = createLocalId,
): { points: SketchPoint[]; segments: SketchSegment[] } {
  const angleStep = (2 * Math.PI) / sides;
  const pointIds = Array.from({ length: sides }, () => createId("sketch-point"));
  const points: SketchPoint[] = pointIds.map((id, i) => ({
    id,
    x: center.x + circumR * Math.cos(startAngle + i * angleStep),
    z: center.z + circumR * Math.sin(startAngle + i * angleStep),
    mode: "corner" as const,
  }));
  const segments: SketchSegment[] = pointIds.map((startId, i) => ({
    id: createId("sketch-segment"),
    startId,
    endId: pointIds[(i + 1) % sides],
    kind: "line" as const,
  }));
  return { points, segments };
}
