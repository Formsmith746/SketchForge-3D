import type { PlacementWorkplane } from "@/lib/placementWorkplane";

export type CameraOrientation = {
  yawDegrees: number;
  pitchDegrees: number;
};

/** A camera parked on the Front face, the mapping arrow keys used before they followed the view. */
export const DEFAULT_CAMERA_ORIENTATION: CameraOrientation = { yawDegrees: 0, pitchDegrees: 0 };

const QUARTER_TURN_DEGREES = 90;

// Exact values, so a quarter turn never leaks 6e-17 into a coordinate.
const QUARTER_TURN_COS = [1, 0, -1, 0];
const QUARTER_TURN_SIN = [0, 1, 0, -1];

/**
 * How many quarter turns of the scene the camera looks at, 0 for the Front view.
 *
 * A yaw exactly between two axes rounds down, which keeps the default
 * three-quarter home view (yaw 45) on the axes it has always used.
 */
function quarterTurnsFacingCamera(yawDegrees: number) {
  if (!Number.isFinite(yawDegrees)) {
    return 0;
  }
  const turns = Math.ceil(yawDegrees / QUARTER_TURN_DEGREES - 0.5);
  return ((turns % 4) + 4) % 4;
}

/** A quarter turn can leave a negative zero behind, which nothing downstream wants. */
function positiveZero(value: number) {
  return value === 0 ? 0 : value;
}

function followsCamera(workplane: PlacementWorkplane) {
  // Only the flat ground plane has no orientation of its own. A workplane laid
  // on a face keeps its own axes, otherwise its arrows would leave that face.
  return Math.abs(Math.abs(workplane.normal.y) - 1) < 1e-6;
}

/**
 * Turns an arrow key, read as a screen direction, into a step along the workplane
 * axes: right and down on screen at the Front view, and at any other view the
 * axis closest to that screen direction.
 */
export function screenAlignedNudge(
  workplane: PlacementWorkplane,
  camera: CameraOrientation,
  screenRight: number,
  screenDown: number,
) {
  if (!followsCamera(workplane)) {
    return { x: screenRight, z: screenDown };
  }
  const turns = quarterTurnsFacingCamera(camera.yawDegrees);
  const cos = QUARTER_TURN_COS[turns];
  const sin = QUARTER_TURN_SIN[turns];
  // Seen from below the horizon the scene is mirrored, so screen down points the
  // other way. Screen right is unaffected: it never depends on the pitch.
  const down = camera.pitchDegrees >= 0 ? screenDown : -screenDown;
  return {
    x: positiveZero(screenRight * cos + down * sin),
    z: positiveZero(down * cos - screenRight * sin),
  };
}
