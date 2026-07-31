export const DEFAULT_SPHERE_STEPS = 24;

export function sphereTessellation(steps = DEFAULT_SPHERE_STEPS) {
  const normalizedSteps = Math.max(6, Math.round(steps));

  return {
    widthSegments: Math.max(8, normalizedSteps * 2),
    heightSegments: Math.max(6, normalizedSteps),
  };
}
