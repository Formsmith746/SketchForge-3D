// Padding keeps a framed selection off the very edge of the viewport, so the
// selection outline and its handles stay visible after the camera moves.
export const CAMERA_FRAMING_PADDING = 1.18;

function usableAspect(aspect: number) {
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

function usableRadius(radius: number) {
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

/**
 * Distance a perspective camera needs from the middle of a selection so that a
 * sphere of the given radius fits, in the narrower of the two viewport axes.
 */
export function perspectiveFramingDistance(
  radius: number,
  verticalFovDegrees: number,
  aspect: number,
  padding = CAMERA_FRAMING_PADDING,
) {
  const safeRadius = usableRadius(radius);
  if (safeRadius === 0) return 0;
  const verticalFov = (verticalFovDegrees * Math.PI) / 180;
  const halfVertical = verticalFov / 2;
  // A wide viewport is limited by its height, a tall one by its width.
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * usableAspect(aspect));
  const limiting = Math.min(halfVertical, halfHorizontal);
  return (safeRadius / Math.sin(limiting)) * padding;
}

/**
 * Zoom an orthographic camera needs so that the same sphere fits its frustum.
 * `halfHeight` is the unzoomed half height of the frustum, as set up by the
 * viewport when it switches projections.
 */
export function orthographicFramingZoom(
  radius: number,
  halfHeight: number,
  aspect: number,
  padding = CAMERA_FRAMING_PADDING,
) {
  const safeRadius = usableRadius(radius);
  if (safeRadius === 0 || !Number.isFinite(halfHeight) || halfHeight <= 0) return null;
  const safeAspect = usableAspect(aspect);
  const fitsHeight = halfHeight / (safeRadius * padding);
  const fitsWidth = (halfHeight * safeAspect) / (safeRadius * padding);
  return Math.min(fitsHeight, fitsWidth);
}
