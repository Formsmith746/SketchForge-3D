import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  continuousSnappedWheelRotation,
  isPointInsideTransformBounds,
  normalizedRotationPlaneBasis,
  rotationPlaneDirectionSign,
  transformBoundsIntersectClipVolume,
  transformOverlayScreenPoint,
  snappedRotationDelta,
  snappedWheelRotation,
} from "@/components/workplane/transformOverlayTypes";

describe("rotation handle projection", () => {
  it("hides transform chrome when the whole selection is outside one camera plane", () => {
    const offscreenRight = Array.from({ length: 8 }, (_, index) => ({
      x: index % 2 === 0 ? 2 : 3,
      y: index % 4 < 2 ? -0.5 : 0.5,
      z: index < 4 ? -0.5 : 0.5,
      w: 1,
    }));
    expect(transformBoundsIntersectClipVolume(offscreenRight)).toBe(false);
  });

  it("hides transform chrome when the selection is wholly behind the camera", () => {
    const behindCamera = Array.from({ length: 8 }, (_, index) => ({
      x: index % 2 === 0 ? -0.25 : 0.25,
      y: index % 4 < 2 ? -0.25 : 0.25,
      z: index < 4 ? -1.5 : -1.25,
      w: -1,
    }));
    expect(transformBoundsIntersectClipVolume(behindCamera)).toBe(false);
  });

  it("keeps transform chrome when close zoom puts the viewport inside the selection projection", () => {
    const surroundingSelection = Array.from({ length: 8 }, (_, index) => ({
      x: index % 2 === 0 ? -2 : 2,
      y: index % 4 < 2 ? -2 : 2,
      z: index < 4 ? -0.5 : 0.5,
      w: 1,
    }));
    expect(transformBoundsIntersectClipVolume(surroundingSelection)).toBe(true);
  });

  it("rejects invalid projected selection bounds", () => {
    expect(transformBoundsIntersectClipVolume([{ x: 0, y: 0, z: 0, w: Number.NaN }])).toBe(false);
  });

  it("keeps anchors at their projected world position instead of clamping them to the viewport", () => {
    expect(transformOverlayScreenPoint({ x: -3, y: 2 }, -10, 900, 600)).toEqual({
      x: -900,
      y: -300,
      visible: true,
    });
  });

  it("marks anchors behind the camera as hidden without relocating them", () => {
    expect(transformOverlayScreenPoint({ x: 0.25, y: -0.5 }, 2, 800, 500)).toEqual({
      x: 500,
      y: 375,
      visible: false,
    });
  });

  it("detects when the camera is inside the selected oriented frame", () => {
    const min = { x: -10, y: -5, z: -8 };
    const max = { x: 10, y: 5, z: 8 };
    expect(isPointInsideTransformBounds({ x: 0, y: 0, z: 0 }, min, max)).toBe(true);
    expect(isPointInsideTransformBounds({ x: 10.01, y: 0, z: 0 }, min, max)).toBe(false);
  });

  it("preserves face-plane foreshortening while normalizing icon size", () => {
    expect(normalizedRotationPlaneBasis({ x: 10, y: 20, a: 2, b: 0, c: 0.5, d: 1 })).toEqual({
      a: 1,
      b: 0,
      c: 0.25,
      d: 0.5,
    });
  });

  it("turns an upper arrow upright without detaching it from the face plane", () => {
    expect(normalizedRotationPlaneBasis({ x: 10, y: 20, a: 2, b: 0, c: 0.5, d: 1 }, true)).toEqual({
      a: 1,
      b: 0,
      c: -0.25,
      d: -0.5,
    });
  });

  it("falls back to a screen-facing icon for a collapsed projection", () => {
    expect(normalizedRotationPlaneBasis({ x: 10, y: 20, a: 0, b: 0, c: 0, d: 0 })).toEqual({
      a: 1,
      b: 0,
      c: 0,
      d: 1,
    });
  });

  it("moves 45-degree rotation in the same pointer direction as 22.5-degree rotation", () => {
    const direction = -1;
    expect(snappedWheelRotation(-52, -80, direction)).toEqual({ delta: -45, pointerAngle: -45 });
    expect(snappedWheelRotation(-58, -80, direction)).toEqual({ delta: -45, pointerAngle: -45 });
    expect(snappedWheelRotation(-69, -80, direction)).toEqual({ delta: 0, pointerAngle: -90 });
  });

  it.each([
    { direction: -1, coarseClockwise: -45, fineClockwise: -22.5, coarseCounterClockwise: 45, fineCounterClockwise: 22.5 },
    { direction: 1, coarseClockwise: 45, fineClockwise: 22.5, coarseCounterClockwise: -45, fineCounterClockwise: -22.5 },
  ])("keeps both snap modes aligned for plane direction $direction", ({ direction, coarseClockwise, fineClockwise, coarseCounterClockwise, fineCounterClockwise }) => {
    expect(snappedWheelRotation(-58, -80, direction).delta).toBe(coarseClockwise);
    expect(snappedWheelRotation(-58, -80, direction, 22.5).delta).toBe(fineClockwise);
    expect(snappedWheelRotation(-120, -80, direction).delta).toBe(coarseCounterClockwise);
    expect(snappedWheelRotation(-120, -80, direction, 22.5).delta).toBe(fineCounterClockwise);
    expect(Math.sign(coarseClockwise)).toBe(Math.sign(fineClockwise));
    expect(Math.sign(coarseCounterClockwise)).toBe(Math.sign(fineCounterClockwise));
  });

  it.each([
    { direction: -1, coarse: [0, -45, -90], fine: [0, -22.5, -45, -67.5] },
    { direction: 1, coarse: [0, 45, 90], fine: [0, 22.5, 45, 67.5] },
  ])("advances monotonically through 45 and 22.5 degree marks for plane direction $direction", ({ direction, coarse, fine }) => {
    expect([-90, -45, 0].map((pointer) => snappedWheelRotation(pointer, -90, direction).delta)).toEqual(coarse);
    expect([-90, -67.5, -45, -22.5].map((pointer) => snappedWheelRotation(pointer, -90, direction, 22.5).delta)).toEqual(fine);
  });

  it("switches the wheel rotation and orange indicator to 22.5-degree marks with Shift", () => {
    const direction = -1;
    expect(snappedWheelRotation(-58, -80, direction, 22.5)).toEqual({ delta: -22.5, pointerAngle: -67.5 });
    expect(snappedWheelRotation(-52, -80, direction, 22.5)).toEqual({ delta: -45, pointerAngle: -45 });
  });

  it("keeps the current result continuous when switching to 22.5-degree snapping", () => {
    const direction = -1;
    const coarse = snappedWheelRotation(-58, -80, direction);
    const fineAtShift = continuousSnappedWheelRotation(
      snappedWheelRotation(-58, -80, direction, 22.5),
      22.5,
      45,
      coarse.delta,
      coarse.pointerAngle,
    );
    expect(fineAtShift).toEqual({
      delta: -45,
      pointerAngle: -45,
      deltaOffset: -22.5,
      pointerOffset: 22.5,
    });

    const fineForward = continuousSnappedWheelRotation(
      snappedWheelRotation(-52, -80, direction, 22.5),
      22.5,
      22.5,
      fineAtShift.delta,
      fineAtShift.pointerAngle,
      fineAtShift.deltaOffset,
      fineAtShift.pointerOffset,
    );
    expect(fineForward).toEqual({
      delta: -67.5,
      pointerAngle: -22.5,
      deltaOffset: -22.5,
      pointerOffset: 22.5,
    });
  });

  it.each([
    { direction: -1, coarseDelta: -45, fineDelta: -67.5 },
    { direction: 1, coarseDelta: 45, fineDelta: 67.5 },
  ])("does not reverse or jump when Shift is pressed and released for plane direction $direction", ({ direction, coarseDelta, fineDelta }) => {
    const coarse = snappedWheelRotation(-58, -80, direction);
    const fineAtShift = continuousSnappedWheelRotation(
      snappedWheelRotation(-58, -80, direction, 22.5),
      22.5,
      45,
      coarse.delta,
      coarse.pointerAngle,
    );
    const fineAfterMove = continuousSnappedWheelRotation(
      snappedWheelRotation(-52, -80, direction, 22.5),
      22.5,
      22.5,
      fineAtShift.delta,
      fineAtShift.pointerAngle,
      fineAtShift.deltaOffset,
      fineAtShift.pointerOffset,
    );
    const coarseAtRelease = continuousSnappedWheelRotation(
      snappedWheelRotation(-52, -80, direction),
      45,
      22.5,
      fineAfterMove.delta,
      fineAfterMove.pointerAngle,
      fineAfterMove.deltaOffset,
      fineAfterMove.pointerOffset,
    );

    expect(coarse.delta).toBe(coarseDelta);
    expect(fineAtShift.delta).toBe(coarseDelta);
    expect(fineAfterMove.delta).toBe(fineDelta);
    expect(coarseAtRelease.delta).toBe(fineDelta);
    expect(Math.sign(fineAfterMove.delta)).toBe(Math.sign(coarse.delta));
  });

  it("derives rotation direction from each protractor plane's handedness", () => {
    const x = new THREE.Vector3(1, 0, 0);
    const y = new THREE.Vector3(0, 1, 0);
    const z = new THREE.Vector3(0, 0, 1);
    expect(rotationPlaneDirectionSign(x, z, y)).toBe(-1);
    expect(rotationPlaneDirectionSign(y, x, z)).toBe(-1);
    expect(rotationPlaneDirectionSign(y, x.clone().negate(), z.clone().negate())).toBe(-1);
    expect(rotationPlaneDirectionSign(y, z.clone().negate(), x)).toBe(-1);
    expect(rotationPlaneDirectionSign(y, z, x.clone().negate())).toBe(-1);
    expect(rotationPlaneDirectionSign(z, x, y)).toBe(1);
  });

  it.each([
    { name: "X", axis: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0) },
    { name: "Y", axis: new THREE.Vector3(0, 1, 0), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
    { name: "Z", axis: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  ])("makes the object follow both 45 and Shift+22.5 pointer marks around $name", ({ axis, u, v }) => {
    const direction = rotationPlaneDirectionSign(axis, u, v);
    [45, 22.5, -45, -22.5].forEach((pointerDelta) => {
      const snapDegrees = Math.abs(pointerDelta) === 22.5 ? 22.5 : 45;
      const objectDelta = snappedWheelRotation(pointerDelta, 0, direction, snapDegrees).delta;
      const actual = u.clone().applyQuaternion(
        new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(objectDelta)),
      );
      const pointerRadians = THREE.MathUtils.degToRad(pointerDelta);
      const intended = u.clone().multiplyScalar(Math.cos(pointerRadians)).add(v.clone().multiplyScalar(Math.sin(pointerRadians))).normalize();
      expect(actual.angleTo(intended)).toBeLessThan(1e-8);
    });
  });

  it("keeps one-degree rotation outside the wheel", () => {
    expect(snappedRotationDelta(28.4, false, false)).toBe(28);
  });

  it("retains the Shift 45-degree shortcut outside the wheel", () => {
    expect(snappedRotationDelta(28, false, true)).toBe(45);
  });

  it("keeps absolute wheel snapping synchronized for a negative plane direction", () => {
    expect(snappedWheelRotation(-134, -80, -1)).toEqual({ delta: 45, pointerAngle: -135 });
  });

  it("wraps wheel deltas across the -180/180 boundary", () => {
    expect(snappedWheelRotation(-179, 179)).toEqual({ delta: 0, pointerAngle: -180 });
    expect(snappedWheelRotation(-134, 179)).toEqual({ delta: 45, pointerAngle: -135 });
  });

  it.each([
    { direction: 1, expected: 22.5 },
    { direction: -1, expected: -22.5 },
  ])("wraps 22.5-degree Shift snapping without reversing for plane direction $direction", ({ direction, expected }) => {
    expect(snappedWheelRotation(-157, 179, direction, 22.5)).toEqual({ delta: expected, pointerAngle: -157.5 });
  });
});
