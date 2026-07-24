import { describe, expect, it } from "vitest";
import {
  BASE_CONSTRUCTION_PLANE_POSE,
  constructionPlaneAttachmentFromWorldPose,
  identityConstructionPlanePose,
  localDirectionToWorld,
  localPointToWorld,
  normalizeQuaternion,
  poseFromWorldOriginAndNormal,
  principalPlanePose,
  quaternionFromEulerXYZDegrees,
  resolveConstructionPlaneAttachment,
  shapeCenterInConstructionPlane,
  sourceShapePose,
  worldDirectionToLocal,
  worldPointToLocal,
  type ConstructionPlanePose,
  type Vector3Tuple,
} from "@/lib/constructionPlanes";

function expectVectorClose(actual: Vector3Tuple, expected: Vector3Tuple, precision = 10) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], precision));
}

function expectSameRotation(actual: ConstructionPlanePose, expected: ConstructionPlanePose) {
  expectVectorClose(localDirectionToWorld(actual, [1, 0, 0]), localDirectionToWorld(expected, [1, 0, 0]));
  expectVectorClose(localDirectionToWorld(actual, [0, 1, 0]), localDirectionToWorld(expected, [0, 1, 0]));
  expectVectorClose(localDirectionToWorld(actual, [0, 0, 1]), localDirectionToWorld(expected, [0, 0, 1]));
}

describe("construction plane poses", () => {
  it("provides identity and normalized quaternion poses", () => {
    expect(BASE_CONSTRUCTION_PLANE_POSE).toEqual({ origin: [0, 0, 0], quaternion: [0, 0, 0, 1] });
    expect(identityConstructionPlanePose()).toEqual(BASE_CONSTRUCTION_PLANE_POSE);
    expect(normalizeQuaternion([0, 0, 0, 5])).toEqual([0, 0, 0, 1]);
    expect(normalizeQuaternion([0, 0, 0, 0])).toEqual([0, 0, 0, 1]);
  });

  it.each([
    { plane: "xz" as const, offset: 7, origin: [0, 7, 0] as Vector3Tuple, normal: [0, 1, 0] as Vector3Tuple },
    { plane: "xy" as const, offset: -3, origin: [0, 0, -3] as Vector3Tuple, normal: [0, 0, 1] as Vector3Tuple },
    { plane: "yz" as const, offset: 11, origin: [11, 0, 0] as Vector3Tuple, normal: [1, 0, 0] as Vector3Tuple },
  ])("orients and offsets the $plane principal plane along its normal", ({ plane, offset, origin, normal }) => {
    const pose = principalPlanePose(plane, offset);

    expectVectorClose(pose.origin, origin);
    expectVectorClose(localDirectionToWorld(pose, [0, 1, 0]), normal);
    const xAxis = localDirectionToWorld(pose, [1, 0, 0]);
    const zAxis = localDirectionToWorld(pose, [0, 0, 1]);
    expect(xAxis[0] * normal[0] + xAxis[1] * normal[1] + xAxis[2] * normal[2]).toBeCloseTo(0);
    expect(zAxis[0] * normal[0] + zAxis[1] * normal[1] + zAxis[2] * normal[2]).toBeCloseTo(0);
  });

  it("roundtrips points and directions through an arbitrary normalized pose", () => {
    const pose: ConstructionPlanePose = {
      origin: [4.5, -8, 12],
      quaternion: quaternionFromEulerXYZDegrees(27, -41, 13).map((value) => value * 4) as ConstructionPlanePose["quaternion"],
    };
    const localPoint: Vector3Tuple = [2.25, -6, 9.5];
    const localDirection: Vector3Tuple = [-0.5, 3, 7];

    expectVectorClose(worldPointToLocal(pose, localPointToWorld(pose, localPoint)), localPoint);
    expectVectorClose(worldDirectionToLocal(pose, localDirectionToWorld(pose, localDirection)), localDirection);
  });

  it("builds a right-handed stable face frame with local Y as its normal", () => {
    const normal: Vector3Tuple = [1, 2, -3];
    const pose = poseFromWorldOriginAndNormal([5, 6, 7], normal);
    const length = Math.hypot(...normal);
    const expectedNormal: Vector3Tuple = normal.map((value) => value / length) as Vector3Tuple;
    const xAxis = localDirectionToWorld(pose, [1, 0, 0]);
    const yAxis = localDirectionToWorld(pose, [0, 1, 0]);
    const zAxis = localDirectionToWorld(pose, [0, 0, 1]);

    expect(pose.origin).toEqual([5, 6, 7]);
    expectVectorClose(yAxis, expectedNormal);
    expect(xAxis[0]).toBeGreaterThan(0);
    expectVectorClose([
      xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1],
      xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2],
      xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0],
    ], zAxis);

    const nearXAxis = poseFromWorldOriginAndNormal([0, 0, 0], [1, 1e-8, 0]);
    expectVectorClose(localDirectionToWorld(nearXAxis, [1, 0, 0]), [0, 0, 1], 7);
  });

  it("matches the viewport's Euler XYZ convention", () => {
    const pose = sourceShapePose({
      x: 3,
      z: -4,
      elevation: 2,
      height: 8,
      width: 10,
      depth: 6,
      rotationX: 90,
      rotation: 90,
      rotationZ: 0,
    });

    expectVectorClose(pose.origin, [3, 6, -4]);
    // XYZ composes qx*qy*qz, so local X is first yawed toward -Z and then rolled toward +Y.
    expectVectorClose(localDirectionToWorld(pose, [1, 0, 0]), [0, 1, 0]);
    expectVectorClose(localDirectionToWorld(pose, [0, 1, 0]), [0, 0, 1]);
  });
});

describe("construction plane attachments", () => {
  it("updates a sketch body's plane-local center when the body is moved", () => {
    const movedBody = {
      x: 12,
      z: -7,
      elevation: 3,
      height: 4,
      width: 10,
      depth: 8,
      rotation: 0,
    };

    expectVectorClose(shapeCenterInConstructionPlane(movedBody, BASE_CONSTRUCTION_PLANE_POSE), [12, 5, -7]);
    const sidePlane = principalPlanePose("yz", 2);
    expectVectorClose(localPointToWorld(sidePlane, shapeCenterInConstructionPlane(movedBody, sidePlane)), [12, 5, -7]);
  });

  it("roundtrips an arbitrary world pose through a source-local attachment", () => {
    const source = {
      x: -5,
      z: 8,
      elevation: 3,
      height: 12,
      width: 20,
      depth: 16,
      rotationX: 17,
      rotation: -32,
      rotationZ: 9,
    };
    const worldPose = poseFromWorldOriginAndNormal([7, 11, -2], [-2, 5, 3]);
    const attachment = constructionPlaneAttachmentFromWorldPose(worldPose, source);
    const resolved = resolveConstructionPlaneAttachment(attachment, source);

    expectVectorClose(resolved.origin, worldPose.origin);
    expectSameRotation(resolved, worldPose);
    expect(Math.hypot(...attachment.localQuaternion)).toBeCloseTo(1);
  });

  it("follows source translation, rotation, and resize using normalized local coordinates", () => {
    const initialSource = {
      x: 0,
      z: 0,
      elevation: 2,
      height: 8,
      width: 10,
      depth: 6,
      rotationX: 0,
      rotation: 0,
      rotationZ: 0,
    };
    const rightFace = poseFromWorldOriginAndNormal([5, 10, 0], [1, 0, 0]);
    const attachment = constructionPlaneAttachmentFromWorldPose(rightFace, initialSource);

    expectVectorClose(attachment.normalizedOrigin, [0.5, 0.5, 0]);

    const changedSource = {
      ...initialSource,
      x: 10,
      z: -3,
      elevation: 4,
      height: 12,
      width: 20,
      depth: 12,
      rotation: 90,
    };
    const resolved = resolveConstructionPlaneAttachment(attachment, changedSource);

    expectVectorClose(resolved.origin, [10, 16, -13]);
    expectVectorClose(localDirectionToWorld(resolved, [0, 1, 0]), [0, 0, -1]);
  });
});
