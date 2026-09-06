import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import { DEFAULT_CAMERA_ORIENTATION, screenAlignedNudge } from "@/lib/screenAlignedNudge";

const BASE = horizontalPlacementWorkplane();

const LEFT = { right: -1, down: 0 };
const RIGHT = { right: 1, down: 0 };
const UP = { right: 0, down: -1 };
const DOWN = { right: 0, down: 1 };

function nudge(arrow: { right: number; down: number }, yawDegrees: number, pitchDegrees = 35) {
  return screenAlignedNudge(BASE, { yawDegrees, pitchDegrees }, arrow.right, arrow.down);
}

describe("screenAlignedNudge", () => {
  it("keeps the world axes at the Front view", () => {
    expect(nudge(RIGHT, 0)).toEqual({ x: 1, z: 0 });
    expect(nudge(LEFT, 0)).toEqual({ x: -1, z: 0 });
    expect(nudge(DOWN, 0)).toEqual({ x: 0, z: 1 });
    expect(nudge(UP, 0)).toEqual({ x: 0, z: -1 });
  });

  it("keeps the world axes at the default home view", () => {
    expect(nudge(RIGHT, 45, 39.2)).toEqual({ x: 1, z: 0 });
    expect(nudge(DOWN, 45, 39.2)).toEqual({ x: 0, z: 1 });
  });

  it("turns the arrows with the camera at the Right view", () => {
    expect(nudge(RIGHT, 90)).toEqual({ x: 0, z: -1 });
    expect(nudge(LEFT, 90)).toEqual({ x: 0, z: 1 });
    expect(nudge(DOWN, 90)).toEqual({ x: 1, z: 0 });
    expect(nudge(UP, 90)).toEqual({ x: -1, z: 0 });
  });

  it("turns the arrows with the camera at the Back view", () => {
    expect(nudge(RIGHT, 180)).toEqual({ x: -1, z: 0 });
    expect(nudge(DOWN, 180)).toEqual({ x: 0, z: -1 });
  });

  it("turns the arrows with the camera at the Left view", () => {
    expect(nudge(RIGHT, -90)).toEqual({ x: 0, z: 1 });
    expect(nudge(DOWN, -90)).toEqual({ x: -1, z: 0 });
  });

  it("rounds a yaw sitting exactly between two axes down to the lower one", () => {
    expect(nudge(RIGHT, 44.9)).toEqual({ x: 1, z: 0 });
    expect(nudge(RIGHT, 45)).toEqual({ x: 1, z: 0 });
    expect(nudge(RIGHT, 45.1)).toEqual({ x: 0, z: -1 });

    expect(nudge(RIGHT, 135)).toEqual({ x: 0, z: -1 });
    expect(nudge(RIGHT, 135.1)).toEqual({ x: -1, z: 0 });

    expect(nudge(RIGHT, -45)).toEqual({ x: 0, z: 1 });
    expect(nudge(RIGHT, -44.9)).toEqual({ x: 1, z: 0 });
  });

  it("reads negative yaw the same as its positive turn", () => {
    for (const arrow of [LEFT, RIGHT, UP, DOWN]) {
      expect(nudge(arrow, -90)).toEqual(nudge(arrow, 270));
      expect(nudge(arrow, -180)).toEqual(nudge(arrow, 180));
      expect(nudge(arrow, -270)).toEqual(nudge(arrow, 90));
    }
  });

  it("repeats itself every full turn", () => {
    for (let yawDegrees = -180; yawDegrees <= 180; yawDegrees += 7.5) {
      for (const arrow of [LEFT, RIGHT, UP, DOWN]) {
        expect(nudge(arrow, yawDegrees + 360)).toEqual(nudge(arrow, yawDegrees));
        expect(nudge(arrow, yawDegrees - 720)).toEqual(nudge(arrow, yawDegrees));
      }
    }
  });

  it("keeps the Front view axes when looking straight down, where there is no yaw to read", () => {
    expect(nudge(RIGHT, 0, 90)).toEqual({ x: 1, z: 0 });
    expect(nudge(DOWN, 0, 90)).toEqual({ x: 0, z: 1 });
  });

  it("mirrors the vertical arrows below the horizon, because the view is mirrored there", () => {
    expect(nudge(RIGHT, 0, -90)).toEqual({ x: 1, z: 0 });
    expect(nudge(LEFT, 0, -90)).toEqual({ x: -1, z: 0 });
    expect(nudge(DOWN, 0, -90)).toEqual({ x: 0, z: -1 });
    expect(nudge(UP, 0, -90)).toEqual({ x: 0, z: 1 });

    expect(nudge(DOWN, 90, -30)).toEqual({ x: -1, z: 0 });
  });

  it("always moves along one axis by the full step, never diagonally", () => {
    for (let yawDegrees = -360; yawDegrees <= 360; yawDegrees += 3) {
      for (const arrow of [LEFT, RIGHT, UP, DOWN]) {
        const step = nudge(arrow, yawDegrees);
        expect([step.x, step.z].filter((value) => value !== 0)).toHaveLength(1);
        expect(Math.abs(step.x) + Math.abs(step.z)).toBe(1);
      }
    }
  });

  it("carries the shift step through untouched", () => {
    expect(screenAlignedNudge(BASE, { yawDegrees: 90, pitchDegrees: 35 }, 5, 0)).toEqual({ x: 0, z: -5 });
    expect(screenAlignedNudge(BASE, { yawDegrees: 180, pitchDegrees: 35 }, 0, 5)).toEqual({ x: 0, z: -5 });
  });

  it("leaves a workplane laid on a face on its own axes", () => {
    const onAFace = placementWorkplaneFromSurface({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
    for (const yawDegrees of [0, 90, 180, -90]) {
      expect(screenAlignedNudge(onAFace, { yawDegrees, pitchDegrees: 35 }, 1, 0)).toEqual({ x: 1, z: 0 });
      expect(screenAlignedNudge(onAFace, { yawDegrees, pitchDegrees: 35 }, 0, 1)).toEqual({ x: 0, z: 1 });
    }
  });

  it("still follows the camera on a workplane raised parallel to the base", () => {
    const raised = horizontalPlacementWorkplane(24);
    expect(screenAlignedNudge(raised, { yawDegrees: 90, pitchDegrees: 35 }, 1, 0)).toEqual({ x: 0, z: -1 });
  });

  it("falls back to the Front view mapping for a camera orientation it cannot read", () => {
    expect(screenAlignedNudge(BASE, DEFAULT_CAMERA_ORIENTATION, 1, 0)).toEqual({ x: 1, z: 0 });
    expect(screenAlignedNudge(BASE, { yawDegrees: Number.NaN, pitchDegrees: 35 }, 1, 0)).toEqual({ x: 1, z: 0 });
  });
});

// Reproduces what the viewport does with the camera, then reads the screen axes
// back out of the matrix three.js built, rather than trusting the derivation.
function screenAxes(offset: THREE.Vector3, orthographic = false) {
  const camera = orthographic
    ? new THREE.OrthographicCamera(-80, 80, 50, -50, 0.1, 6000)
    : new THREE.PerspectiveCamera(45, 1.6, 0.1, 6000);
  camera.up.set(0, 1, 0);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const down = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).negate();
  return { right, down };
}

function cameraOrientation(offset: THREE.Vector3) {
  return {
    yawDegrees: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
    pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.max(0.001, Math.hypot(offset.x, offset.z)))),
  };
}

describe("screenAlignedNudge against the axes three.js actually renders", () => {
  const views: [string, THREE.Vector3, boolean][] = [
    ["home", new THREE.Vector3(118, 96, 118), false],
    ["front", new THREE.Vector3(0, 0, 160), false],
    ["right", new THREE.Vector3(160, 0, 0), false],
    ["back", new THREE.Vector3(0, 0, -160), false],
    ["left", new THREE.Vector3(-160, 0, 0), false],
    ["top", new THREE.Vector3(0, 160, 0), false],
    ["bottom", new THREE.Vector3(0, -160, 0), false],
    ["low back-left", new THREE.Vector3(-90, 20, -140), false],
    ["from under the front-right", new THREE.Vector3(70, -40, 90), false],
    ["orthographic home", new THREE.Vector3(118, 96, 118), true],
    ["orthographic top", new THREE.Vector3(0, 160, 0), true],
  ];

  for (const [label, offset, orthographic] of views) {
    it(`picks the closest axis at the ${label} view`, () => {
      const axes = screenAxes(offset, orthographic);
      const camera = cameraOrientation(offset);

      for (const [right, down] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const step = screenAlignedNudge(BASE, camera, right, down);
        const moved = new THREE.Vector3(step.x, 0, step.z);
        const onScreen = axes.right.clone().multiplyScalar(right).add(axes.down.clone().multiplyScalar(down)).setY(0);

        if (onScreen.lengthSq() < 1e-9) {
          // Camera exactly at eye level: a vertical arrow has no screen-vertical
          // part at all, so the only sane reading left is "up goes away from the camera".
          const away = offset.clone().setY(0).normalize().negate();
          expect(moved.normalize().dot(away)).toBeCloseTo(down === -1 ? 1 : -1, 6);
          continue;
        }

        onScreen.normalize();
        const closest = Math.max(
          ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => new THREE.Vector3(x, 0, z).dot(onScreen)),
        );
        expect(moved.normalize().dot(onScreen)).toBeCloseTo(closest, 6);
        // Never more than 45 degrees away from where the arrow points on screen.
        expect(moved.normalize().dot(onScreen)).toBeGreaterThan(Math.SQRT1_2 - 1e-9);
      }
    });
  }
});
