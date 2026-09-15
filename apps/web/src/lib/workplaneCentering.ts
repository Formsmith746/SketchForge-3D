export type WorkplanePlanarBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type WorkplaneCenteringOffset = {
  x: number;
  z: number;
};

// The workplane grid runs from -span/2 to +span/2 on both axes, so the middle of
// the build plate is the origin regardless of the configured workspace size.
export const WORKPLANE_CENTER: WorkplaneCenteringOffset = { x: 0, z: 0 };

/**
 * Offset that moves the given bounding box onto the middle of the workplane,
 * leaving elevation untouched. Returns null for a bounding box that cannot be
 * measured, so callers keep the scene untouched instead of moving objects by NaN.
 */
export function workplaneCenteringOffset(bounds: WorkplanePlanarBounds): WorkplaneCenteringOffset | null {
  const { minX, maxX, minZ, maxZ } = bounds;
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX > maxX || minZ > maxZ) return null;
  return {
    x: WORKPLANE_CENTER.x - (minX + maxX) / 2,
    z: WORKPLANE_CENTER.z - (minZ + maxZ) / 2,
  };
}
