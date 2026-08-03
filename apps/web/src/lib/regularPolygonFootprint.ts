export type RegularPolygonFootprintScale = {
  x: number;
  z: number;
  offsetX: number;
  offsetZ: number;
};

export function regularPolygonFootprintScale(
  width: number,
  depth: number,
  sides: number,
): RegularPolygonFootprintScale {
  const count = Math.max(3, Math.round(sides));
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const x = Math.max(0.001, width) / Math.max(0.001, maxX - minX);
  const z = Math.max(0.001, depth) / Math.max(0.001, maxZ - minZ);
  return {
    x,
    z,
    offsetX: -((minX + maxX) / 2) * x,
    offsetZ: -((minZ + maxZ) / 2) * z,
  };
}
