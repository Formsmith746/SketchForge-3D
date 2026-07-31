export function cadNormalsAreUsable(positions: ArrayLike<number>, normals: ArrayLike<number>) {
  if (normals.length !== positions.length) return false;
  for (let index = 0; index < normals.length; index += 1) {
    if (!Number.isFinite(normals[index])) return false;
  }
  return true;
}

export function cadDisplayEdgePointsAreUsable(points: number[]) {
  return points.length >= 6
    && points.length % 3 === 0
    && points.every(Number.isFinite);
}
