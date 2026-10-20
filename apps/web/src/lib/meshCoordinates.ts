export type MeshPoint = readonly [number, number, number];

/** Maps the Z-up coordinate convention used by slicers/CAD files into SketchForge's Y-up scene. */
export function zUpToSketchForge([x, y, z]: MeshPoint): [number, number, number] {
  return [x, z, -y];
}

/** Maps SketchForge's Y-up scene into the Z-up coordinate convention expected by slicers. */
export function sketchForgeToZUp([x, y, z]: MeshPoint): [number, number, number] {
  return [x, -z, y];
}
