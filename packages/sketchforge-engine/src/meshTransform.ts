import * as THREE from "three";
import {
  meshYawDegrees,
  mirrorSign,
  mirroredAxisCount,
  shapeHasTaper,
  shapeTaperScaleAt,
} from "./workplaneShapes.js";
import type { WorkplaneShape } from "./domain/sketchforge.js";

export type Vec3 = [number, number, number];
export type MeshData = { name: string; vertices: Vec3[]; faces: [number, number, number][]; triangleColors?: (string | null)[] };

/**
 * Place a shape's local mesh into the scene: taper, mirror, rotate, translate.
 *
 * The taper is applied here rather than by the geometry builders, because every
 * kind's builder produces an untapered profile. It scales each vertex by the
 * shape's taper at that vertex's height, so the mesh the booleans consume has
 * the same silhouette as the one on screen.
 */
export function transformMesh(mesh: MeshData, shape: WorkplaneShape): MeshData {
  const centerY = shape.height / 2;
  const tapered = shapeHasTaper(shape);
  let minLocalY = 0;
  let maxLocalY = 1;
  if (tapered && mesh.vertices.length) {
    minLocalY = Number.POSITIVE_INFINITY;
    maxLocalY = Number.NEGATIVE_INFINITY;
    mesh.vertices.forEach((vertex) => {
      minLocalY = Math.min(minLocalY, vertex[1]);
      maxLocalY = Math.max(maxLocalY, vertex[1]);
    });
  }
  const taperHeight = Math.max(1e-6, maxLocalY - minLocalY);
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const mirrorX = mirrorSign(shape.mirrorX);
  const mirrorY = mirrorSign(shape.mirrorY);
  const mirrorZ = mirrorSign(shape.mirrorZ);
  const reversedWinding = mirroredAxisCount(shape) % 2 === 1;
  return {
    ...mesh,
    vertices: mesh.vertices.map(([x, y, z]) => {
      const normalizedHeight = (y - minLocalY) / taperHeight;
      const widthScale = tapered ? shapeTaperScaleAt(shape, normalizedHeight, "width") : 1;
      const depthScale = tapered ? shapeTaperScaleAt(shape, normalizedHeight, "depth") : 1;
      const vertex = new THREE.Vector3(x * widthScale * mirrorX, (y - centerY) * mirrorY, z * depthScale * mirrorZ).applyMatrix4(matrix);
      return [vertex.x + shape.x, vertex.y + (shape.elevation ?? 0) + centerY, vertex.z + shape.z] as Vec3;
    }),
    faces: reversedWinding ? mesh.faces.map(([a, b, c]) => [a, c, b] as [number, number, number]) : mesh.faces,
  };
}
