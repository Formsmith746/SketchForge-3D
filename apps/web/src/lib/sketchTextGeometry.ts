import { createLocalId } from "@/lib/localIds";
import type { Font } from "three/examples/jsm/loaders/FontLoader.js";
import type { SketchPoint, SketchSegment } from "@/types/sketchforge";

const TEXT_CURVE_SEGMENTS = 8;
const DEDUP_EPS = 1e-6;

function dedupeContour(points: { x: number; y: number }[]) {
  if (points.length < 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    if (Math.hypot(points[i].x - prev.x, points[i].y - prev.y) > DEDUP_EPS) {
      result.push(points[i]);
    }
  }
  if (result.length >= 2) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) <= DEDUP_EPS) {
      result.pop();
    }
  }
  return result;
}

export function textSketchGeometry(
  text: string,
  font: Font,
  fontSize: number,
  position: { x: number; z: number },
  createId: (prefix: string) => string = createLocalId,
): { points: SketchPoint[]; segments: SketchSegment[] } {
  const shapes = font.generateShapes(text, fontSize);
  const allPoints: SketchPoint[] = [];
  const allSegments: SketchSegment[] = [];

  for (const shape of shapes) {
    const contours = [dedupeContour(shape.getPoints(TEXT_CURVE_SEGMENTS))];
    for (const hole of shape.holes) {
      contours.push(dedupeContour(hole.getPoints(TEXT_CURVE_SEGMENTS)));
    }

    for (const contour of contours) {
      if (contour.length < 2) continue;
      const ids = contour.map(() => createId("sketch-point"));
      for (let i = 0; i < contour.length; i++) {
        allPoints.push({
          id: ids[i],
          x: contour[i].x + position.x,
          z: -contour[i].y + position.z,
          mode: "corner",
        });
      }
      for (let i = 0; i < ids.length; i++) {
        allSegments.push({
          id: createId("sketch-segment"),
          startId: ids[i],
          endId: ids[(i + 1) % ids.length],
          kind: "line",
        });
      }
    }
  }

  return { points: allPoints, segments: allSegments };
}
