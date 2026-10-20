import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  GEOMETRY_FINE_ROTATION_STEP_DEGREES,
  GEOMETRY_ROTATION_STEP_DEGREES,
  geometryRotationDegreesForShortcut,
  geometryRotationDelta,
  rotatedGeometryShapePatch,
} from "@/lib/geometryRotation";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function shortcut(overrides: Partial<Parameters<typeof geometryRotationDegreesForShortcut>[0]> = {}) {
  return geometryRotationDegreesForShortcut({
    altKey: false,
    code: "KeyR",
    ctrlKey: false,
    key: "r",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

describe("geometry rotation shortcut", () => {
  it("maps R to 45 degrees and Shift+R to 22.5 degrees", () => {
    expect(shortcut()).toBe(GEOMETRY_ROTATION_STEP_DEGREES);
    expect(shortcut({ key: "R", shiftKey: true })).toBe(GEOMETRY_FINE_ROTATION_STEP_DEGREES);
  });

  it("does not intercept browser, command, Alt, or unrelated shortcuts", () => {
    expect(shortcut({ ctrlKey: true })).toBeNull();
    expect(shortcut({ metaKey: true })).toBeNull();
    expect(shortcut({ altKey: true })).toBeNull();
    expect(shortcut({ code: "KeyT", key: "t" })).toBeNull();
  });

  it("uses the physical R key even when the keyboard layout reports another character", () => {
    expect(shortcut({ key: "ρ" })).toBe(GEOMETRY_ROTATION_STEP_DEGREES);
  });
});

describe("geometry rotation transform", () => {
  it("rotates an object 45 degrees around the base workplane normal", () => {
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 45);
    const patch = rotatedGeometryShapePatch(shape(), delta, null);

    expect(patch).toMatchObject({ rotationX: 0, rotation: 45, rotationZ: 0 });
    expect(patch).not.toHaveProperty("x");
    expect(patch).not.toHaveProperty("elevation");
  });

  it("preserves the fine 22.5-degree step on an oriented workplane", () => {
    const vertical = placementWorkplaneFromSurface(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const delta = geometryRotationDelta(vertical, 22.5);
    const patch = rotatedGeometryShapePatch(shape(), delta, null);

    expect(patch).toMatchObject({ rotationX: 22.5, rotation: 0, rotationZ: 0 });
  });

  it("rotates multi-object centers around the shared selection pivot", () => {
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 90);
    const patch = rotatedGeometryShapePatch(shape({ x: 10, elevation: 4 }), delta, new THREE.Vector3(0, 14, 0));

    expect(patch.x).toBeCloseTo(0, 8);
    expect(patch.z).toBeCloseTo(-10, 8);
    expect(patch.elevation).toBeCloseTo(4, 8);
  });

  it("pre-multiplies the shortcut around the world workplane axis for compound rotations", () => {
    const source = shape({ rotationX: 18, rotation: 31, rotationZ: 12 });
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 22.5);
    const patch = rotatedGeometryShapePatch(source, delta, null);
    const actual = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(patch.rotationX ?? 0),
      THREE.MathUtils.degToRad(patch.rotation ?? 0),
      THREE.MathUtils.degToRad(patch.rotationZ ?? 0),
      "XYZ",
    ));
    const sourceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(source.rotationX ?? 0),
      THREE.MathUtils.degToRad(source.rotation),
      THREE.MathUtils.degToRad(source.rotationZ ?? 0),
      "XYZ",
    ));
    const expected = delta.clone().multiply(sourceQuaternion);

    expect(actual.angleTo(expected)).toBeLessThan(0.002);
  });

  it("falls back to the world-up axis for a malformed workplane normal", () => {
    const malformed = { ...horizontalPlacementWorkplane(), normal: { x: 0, y: 0, z: 0 } };
    const patch = rotatedGeometryShapePatch(shape(), geometryRotationDelta(malformed, 45), null);

    expect(patch).toMatchObject({ rotationX: 0, rotation: 45, rotationZ: 0 });
  });
});
