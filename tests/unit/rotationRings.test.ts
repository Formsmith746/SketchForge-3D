import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  computeCameraFacingBias,
  computeRingRadius,
  easeOpacity,
  RING_BIAS_MAX_TILT_DEG,
  RING_BIAS_THRESHOLD_DEG,
  RING_FADE_ACTIVE_OPACITY,
  RING_FADE_DIM_OPACITY,
  RING_FADE_HOVER_OPACITY,
  RING_FADE_IDLE_OPACITY,
  RING_SCREEN_MAX_PX,
  RING_SCREEN_MIN_PX,
  targetRingOpacities,
  worldUnitsPerScreenPixel,
} from "@/lib/rotationRings";

const EPS = 1e-6;

describe("computeRingRadius", () => {
  it("returns the desired radius when it lands inside the screen-size clamp", () => {
    // worldPerPx = 0.1 → 1 world unit = 10 px. boundingSphere 10 → desired 13.5 world = 135 px. Inside 40-160.
    const radius = computeRingRadius(10, 0.1);
    expect(radius).toBeCloseTo(13.5, 6);
  });

  it("clamps upward when the desired size is below the minimum", () => {
    // boundingSphere 0.1 → desired 0.135 world → 1.35 px. Should clamp to 40 px.
    const radius = computeRingRadius(0.1, 0.1);
    expect(radius).toBeCloseTo(RING_SCREEN_MIN_PX * 0.1, 6);
  });

  it("clamps downward when the desired size is above the maximum", () => {
    // boundingSphere 1000 → desired 1350 world → 13500 px. Should clamp to 160 px.
    const radius = computeRingRadius(1000, 0.1);
    expect(radius).toBeCloseTo(RING_SCREEN_MAX_PX * 0.1, 6);
  });

  it("handles zero or negative bounding sphere by treating it as 1", () => {
    const radius = computeRingRadius(0, 0.1);
    // Falls back to 1 * 1.35 = 0.135 world = 1.35 px → clamps to 40 px.
    expect(radius).toBeCloseTo(RING_SCREEN_MIN_PX * 0.1, 6);
  });
});

describe("worldUnitsPerScreenPixel", () => {
  it("uses the frustum height for orthographic cameras", () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    const wp = worldUnitsPerScreenPixel(camera, new THREE.Vector3(), 100);
    // frustum height = 10; over 100 px = 0.1 world/px.
    expect(wp).toBeCloseTo(0.1, 6);
  });

  it("scales with depth for perspective cameras", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const wpNear = worldUnitsPerScreenPixel(camera, new THREE.Vector3(0, 0, 5), 100);
    const wpFar = worldUnitsPerScreenPixel(camera, new THREE.Vector3(0, 0, -5), 100);
    // Farther point → larger world/px.
    expect(wpFar).toBeGreaterThan(wpNear);
    // Depth 5 vs depth 15 → 3x.
    expect(wpFar / wpNear).toBeCloseTo(3, 3);
  });
});

describe("computeCameraFacingBias", () => {
  it("returns zero tilt when the ring is face-on to the camera", () => {
    // Ring normal parallel to view direction → face-on → no bias.
    const result = computeCameraFacingBias(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    );
    expect(result.angleRad).toBe(0);
  });

  it("returns zero tilt just outside the edge-on threshold", () => {
    // 20° from edge-on is outside the 15° threshold → no bias.
    const fromEdgeDeg = RING_BIAS_THRESHOLD_DEG + 5;
    const alignment = Math.sin(THREE.MathUtils.degToRad(fromEdgeDeg));
    const normal = new THREE.Vector3(Math.sqrt(1 - alignment * alignment), 0, alignment);
    const result = computeCameraFacingBias(normal, new THREE.Vector3(0, 0, -1));
    expect(result.angleRad).toBe(0);
  });

  it("returns positive tilt just inside the edge-on threshold", () => {
    // 10° from edge-on is inside the 15° threshold → some bias, less than max.
    const fromEdgeDeg = RING_BIAS_THRESHOLD_DEG - 5;
    const alignment = Math.sin(THREE.MathUtils.degToRad(fromEdgeDeg));
    const normal = new THREE.Vector3(Math.sqrt(1 - alignment * alignment), 0, alignment);
    const result = computeCameraFacingBias(normal, new THREE.Vector3(0, 0, -1));
    expect(result.angleRad).toBeGreaterThan(0);
    expect(THREE.MathUtils.radToDeg(result.angleRad)).toBeLessThan(RING_BIAS_MAX_TILT_DEG);
  });

  it("returns the max tilt at exact edge-on", () => {
    const normal = new THREE.Vector3(1, 0, 0);
    const result = computeCameraFacingBias(normal, new THREE.Vector3(0, 0, -1));
    expect(THREE.MathUtils.radToDeg(result.angleRad)).toBeCloseTo(RING_BIAS_MAX_TILT_DEG, 4);
  });

  it("bias axis is perpendicular to both the ring normal and the view direction", () => {
    const normal = new THREE.Vector3(1, 0, 0);
    const forward = new THREE.Vector3(0, 0, -1);
    const result = computeCameraFacingBias(normal, forward);
    expect(Math.abs(result.axis.dot(normal))).toBeLessThan(EPS);
    expect(Math.abs(result.axis.dot(forward))).toBeLessThan(EPS);
  });
});

describe("easeOpacity", () => {
  it("returns current when delta is zero", () => {
    expect(easeOpacity(0.3, 1, 0)).toBe(0.3);
  });

  it("moves toward the target monotonically", () => {
    const step1 = easeOpacity(0, 1, 50);
    const step2 = easeOpacity(step1, 1, 50);
    expect(step1).toBeGreaterThan(0);
    expect(step2).toBeGreaterThan(step1);
    expect(step2).toBeLessThan(1);
  });

  it("converges to target for a very large delta", () => {
    const result = easeOpacity(0, 1, 10000);
    expect(result).toBeGreaterThan(0.99);
  });

  it("passes target through unchanged when current is NaN", () => {
    expect(easeOpacity(Number.NaN, 0.5, 100)).toBe(0.5);
  });
});

describe("targetRingOpacities", () => {
  it("idle: all rings at the idle opacity", () => {
    const opacities = targetRingOpacities({ activeAxis: null, hoveredAxis: null, cameraMoving: false });
    expect(opacities.x).toBe(RING_FADE_IDLE_OPACITY);
    expect(opacities.y).toBe(RING_FADE_IDLE_OPACITY);
    expect(opacities.z).toBe(RING_FADE_IDLE_OPACITY);
  });

  it("camera moving: all rings dim (unless hovered/active)", () => {
    const opacities = targetRingOpacities({ activeAxis: null, hoveredAxis: null, cameraMoving: true });
    expect(opacities.x).toBe(RING_FADE_ACTIVE_OPACITY);
    expect(opacities.y).toBe(RING_FADE_ACTIVE_OPACITY);
    expect(opacities.z).toBe(RING_FADE_ACTIVE_OPACITY);
  });

  it("hover: only the hovered ring is highlighted", () => {
    const opacities = targetRingOpacities({ activeAxis: null, hoveredAxis: "y", cameraMoving: false });
    expect(opacities.y).toBe(RING_FADE_HOVER_OPACITY);
    expect(opacities.x).toBe(RING_FADE_IDLE_OPACITY);
    expect(opacities.z).toBe(RING_FADE_IDLE_OPACITY);
  });

  it("active drag beats hover and camera motion", () => {
    const opacities = targetRingOpacities({ activeAxis: "z", hoveredAxis: "y", cameraMoving: true });
    expect(opacities.z).toBe(RING_FADE_HOVER_OPACITY);
    expect(opacities.x).toBe(RING_FADE_DIM_OPACITY);
    expect(opacities.y).toBe(RING_FADE_DIM_OPACITY);
  });
});
