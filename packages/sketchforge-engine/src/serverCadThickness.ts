/** Sampled wall-thickness analysis for exact project solids. Node-only. */

import type { OcctKernel, ShapeHandle, Vec3 } from "occt-wasm";
import { withCadKernel } from "./serverCadKernel.js";
import { ServerCadError } from "./serverCadOperations.js";
import { placedSolidForShape } from "./serverShapeBooleans.js";
import type { WorkplaneShape } from "./domain/sketchforge.js";

const MAX_FACES = 256;
const GRID = 5;

export type WallThicknessResult = {
  minimum: number | null;
  unit: "mm";
  method: "sampled-opposing-surface-distance";
  samplesPerFace: number;
  facesChecked: number;
};

function samples(cad: OcctKernel, face: ShapeHandle) {
  const uv = cad.uvBounds(face);
  const points: Array<{ point: Vec3; normal: Vec3 }> = [];
  for (let i = 0; i < GRID; i += 1) for (let j = 0; j < GRID; j += 1) {
    const u = uv.uMin + (uv.uMax - uv.uMin) * (i + 0.5) / GRID;
    const v = uv.vMin + (uv.vMax - uv.vMin) * (j + 0.5) / GRID;
    if (cad.classifyPointOnFace(face, u, v) !== "out") {
      points.push({ point: cad.pointOnSurface(face, u, v), normal: cad.surfaceNormal(face, u, v) });
    }
  }
  return points;
}

/**
 * Return the smallest sampled distance between opposing faces. This is a
 * screening estimate, not a medial-axis or certified minimum-thickness result.
 */
export function wallThickness(shape: WorkplaneShape): Promise<WallThicknessResult> {
  return withCadKernel((cad) => {
    const solid = placedSolidForShape(cad, shape);
    const faces = cad.getSubShapes(solid, "face");
    if (!faces.length) throw new ServerCadError("The shape has no faces to analyze.");
    if (faces.length > MAX_FACES) throw new ServerCadError(`Wall-thickness analysis supports at most ${MAX_FACES} faces.`, 413);
    const sampled = faces.map((face) => samples(cad, face));
    let minimum = Infinity;
    for (let i = 0; i < faces.length; i += 1) for (let j = i + 1; j < faces.length; j += 1) {
      for (const source of sampled[i]!) {
        for (const target of sampled[j]!) {
          const dot = source.normal.x * target.normal.x + source.normal.y * target.normal.y + source.normal.z * target.normal.z;
          if (dot > -0.5) continue;
          const uv = cad.uvFromPoint(faces[j]!, source.point);
          if (cad.classifyPointOnFace(faces[j]!, uv.u, uv.v) === "out") continue;
          const projected = cad.pointOnSurface(faces[j]!, uv.u, uv.v);
          const distance = Math.hypot(source.point.x - projected.x, source.point.y - projected.y, source.point.z - projected.z);
          if (distance > 1e-7 && distance < minimum) minimum = distance;
        }
      }
    }
    return { minimum: Number.isFinite(minimum) ? minimum : null, unit: "mm", method: "sampled-opposing-surface-distance", samplesPerFace: GRID * GRID, facesChecked: faces.length };
  });
}
