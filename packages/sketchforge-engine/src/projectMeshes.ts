import type { WorkplaneShape } from "./domain/sketchforge.js";
import { withCadKernel } from "./serverCadKernel.js";
import { placedSolidForShape } from "./serverShapeBooleans.js";
import { worldMeshForShape } from "./serverShapeGroups.js";
import type { MeshData } from "./meshTransform.js";

/** Build world-space triangle meshes for exports and headless scene checks. */
export async function meshProjectShapes(shapes: readonly WorkplaneShape[]): Promise<MeshData[]> {
  const visible = shapes.filter((shape) => !shape.hidden && !shape.hole);
  const built = new Map<WorkplaneShape, MeshData>();
  const analytic: WorkplaneShape[] = [];
  for (const shape of visible) {
    // A face color needs OCCT's face-group ranges. An imported/BREP display
    // mesh is still useful for ordinary exports, but it has lost that map.
    const stored = shape.faceColors && (shape.cadBrep || shape.importedMesh?.brepStep)
      ? null
      : worldMeshForShape(shape);
    if (stored) built.set(shape, stored);
    else analytic.push(shape);
  }
  if (analytic.length) await withCadKernel((cad) => {
    for (const shape of analytic) {
    const solid = placedSolidForShape(cad, shape);
    const tessellation = shape.faceColors ? cad.meshShape(solid) : cad.tessellate(solid);
    const vertices: [number, number, number][] = [];
    for (let index = 0; index + 2 < tessellation.positions.length; index += 3) {
      vertices.push([tessellation.positions[index], tessellation.positions[index + 1], tessellation.positions[index + 2]]);
    }
    const indices = tessellation.indices;
    const faces: [number, number, number][] = [];
    for (let index = 0; index + 2 < indices.length; index += 3) {
      faces.push([indices[index], indices[index + 1], indices[index + 2]]);
    }
      let triangleColors: (string | null)[] | undefined;
      if (shape.faceColors && tessellation.faceGroups) {
        const facesInOrder = cad.getSubShapes(solid, "face");
        const faceIndexByHash = new Map(facesInOrder.map((face, index) => [cad.hashCode(face, 2_147_483_647), index]));
        triangleColors = Array(tessellation.triangleCount).fill(null);
        for (let group = 0; group + 2 < tessellation.faceGroups.length; group += 3) {
          const start = tessellation.faceGroups[group]!;
          const count = tessellation.faceGroups[group + 1]!;
          const index = faceIndexByHash.get(tessellation.faceGroups[group + 2]!);
          const color = index === undefined ? undefined : shape.faceColors[index];
          if (!color) continue;
          for (let triangle = start; triangle < start + count; triangle += 1) triangleColors[triangle] = color;
        }
      }
      built.set(shape, { name: shape.name, vertices, faces, ...(triangleColors ? { triangleColors } : {}) });
    }
  });
  return visible.flatMap((shape) => {
    const mesh = built.get(shape);
    return mesh ? [mesh] : [];
  });
}
