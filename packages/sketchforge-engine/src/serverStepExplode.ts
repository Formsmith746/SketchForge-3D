/** Split a retained STEP source into positioned, independently editable solids. Node-only. */

import * as THREE from "three";
import type { ShapeHandle } from "occt-wasm";
import { importedShapeFromTriangleSoup } from "./stlImport.js";
import { withCadKernel } from "./serverCadKernel.js";
import { ServerCadError } from "./serverCadOperations.js";
import type { ProjectAsset, WorkplaneShape } from "./domain/sketchforge.js";
import { meshYawDegrees } from "./workplaneShapes.js";

export const MAX_EXPLODE_SOLIDS = 200;
export const MAX_EXPLODE_SOURCE_BYTES = 8 * 1024 * 1024;
const X_AXIS = { point: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } } as const;

function boundsOf(cad: Parameters<Parameters<typeof withCadKernel>[0]>[0], shape: ShapeHandle) {
  return cad.getBoundingBox(shape, false);
}

/** Turn a STEP-imported mesh shape into one exact mesh/B-rep-backed shape per solid. */
export function explodeStepAssembly(shape: WorkplaneShape, source: ProjectAsset): Promise<WorkplaneShape[]> {
  if (shape.importedMesh?.sourceFormat !== "step" || !shape.importedMesh.assetId) {
    return Promise.reject(new ServerCadError("Only a STEP import with its original source asset can be exploded."));
  }
  if (source.sourceFormat !== "step" || source.byteLength > MAX_EXPLODE_SOURCE_BYTES) {
    return Promise.reject(new ServerCadError(`STEP explosion supports source files up to ${MAX_EXPLODE_SOURCE_BYTES} bytes.`, 413));
  }
  return withCadKernel((cad) => {
    const imported = cad.importStep(new TextDecoder().decode(source.bytes));
    const solids = cad.getSubShapes(imported, "solid");
    if (solids.length < 2) throw new ServerCadError("This STEP file contains only one solid; there is nothing to explode.");
    if (solids.length > MAX_EXPLODE_SOLIDS) throw new ServerCadError(`STEP explosion supports at most ${MAX_EXPLODE_SOLIDS} solids; this file contains ${solids.length}.`, 413);

    // Match the importer's Z-up conversion and scene-wide recentering.
    const turnedAssembly = cad.rotate(imported, X_AXIS, -Math.PI / 2);
    const assemblyBounds = boundsOf(cad, turnedAssembly);
    const centerX = (assemblyBounds.xmin + assemblyBounds.xmax) / 2;
    const floorY = assemblyBounds.ymin;
    const centerZ = (assemblyBounds.zmin + assemblyBounds.zmax) / 2;
    const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ));
    const mirrors = new THREE.Vector3(shape.mirrorX ? -1 : 1, shape.mirrorY ? -1 : 1, shape.mirrorZ ? -1 : 1);
    const parentCenter = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);

    return solids.map((solid, index) => {
      const turned = cad.rotate(solid, X_AXIS, -Math.PI / 2);
      const positioned = cad.translate(turned, -centerX, -floorY, -centerZ);
      const bounds = boundsOf(cad, positioned);
      const partX = (bounds.xmin + bounds.xmax) / 2;
      const partY = bounds.ymin;
      const partZ = (bounds.zmin + bounds.zmax) / 2;
      const local = cad.translate(positioned, -partX, -partY, -partZ);
      const mesh = cad.tessellate(positioned);
      const positions: number[] = [];
      const normals: number[] = [];
      for (let cursor = 0; cursor < mesh.indices.length; cursor += 1) {
        const vertex = mesh.indices[cursor]! * 3;
        positions.push(mesh.positions[vertex]!, mesh.positions[vertex + 1]!, mesh.positions[vertex + 2]!);
        if (mesh.normals.length === mesh.positions.length) normals.push(mesh.normals[vertex]!, mesh.normals[vertex + 1]!, mesh.normals[vertex + 2]!);
      }
      const child = importedShapeFromTriangleSoup(`${shape.name} ${index + 1}`, positions, normals.length ? normals : undefined, "step");
      const offset = new THREE.Vector3(partX, partY - shape.height / 2, partZ).multiply(mirrors).applyMatrix4(rotation).add(parentCenter);
      child.color = shape.color;
      child.material = shape.material;
      child.appearance = shape.appearance;
      child.hole = shape.hole;
      child.hidden = shape.hidden;
      child.locked = shape.locked;
      child.rotation = shape.rotation;
      child.rotationX = shape.rotationX;
      child.rotationZ = shape.rotationZ;
      child.mirrorX = shape.mirrorX;
      child.mirrorY = shape.mirrorY;
      child.mirrorZ = shape.mirrorZ;
      child.x = offset.x;
      child.elevation = offset.y;
      child.z = offset.z;
      child.importedMesh!.brepStep = cad.exportStep(local);
      return child;
    });
  });
}
