export type Vector3Tuple = [number, number, number];
export type QuaternionTuple = [number, number, number, number];

export type ConstructionPlanePose = {
  origin: Vector3Tuple;
  quaternion: QuaternionTuple;
};

export type PrincipalPlane = "xz" | "xy" | "yz";

export type ConstructionPlaneSourceShape = {
  x: number;
  z: number;
  elevation?: number;
  height: number;
  rotation: number;
  rotationX?: number;
  rotationZ?: number;
  width: number;
  depth: number;
};

export type ConstructionPlaneAttachment = {
  normalizedOrigin: Vector3Tuple;
  localQuaternion: QuaternionTuple;
};

type Vector3Like = readonly [number, number, number];
type QuaternionLike = readonly [number, number, number, number];

const EPSILON = 1e-12;
const DEGREES_TO_RADIANS = Math.PI / 180;

export const BASE_CONSTRUCTION_PLANE_POSE: ConstructionPlanePose = {
  origin: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
};

export const IDENTITY_CONSTRUCTION_PLANE_POSE = BASE_CONSTRUCTION_PLANE_POSE;

function dot(a: Vector3Like, b: Vector3Like) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3Like, b: Vector3Like): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeVector(vector: Vector3Like): Vector3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < EPSILON) {
    throw new RangeError("Cannot normalize a zero-length vector");
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

export function identityConstructionPlanePose(): ConstructionPlanePose {
  return { origin: [0, 0, 0], quaternion: [0, 0, 0, 1] };
}

export function normalizeQuaternion(quaternion: QuaternionLike): QuaternionTuple {
  const length = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
  if (length < EPSILON) {
    return [0, 0, 0, 1];
  }
  return [
    quaternion[0] / length,
    quaternion[1] / length,
    quaternion[2] / length,
    quaternion[3] / length,
  ];
}

export function conjugateQuaternion(quaternion: QuaternionLike): QuaternionTuple {
  const normalized = normalizeQuaternion(quaternion);
  return [-normalized[0], -normalized[1], -normalized[2], normalized[3]];
}

export function multiplyQuaternions(a: QuaternionLike, b: QuaternionLike): QuaternionTuple {
  const [ax, ay, az, aw] = normalizeQuaternion(a);
  const [bx, by, bz, bw] = normalizeQuaternion(b);
  return normalizeQuaternion([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function quaternionFromEulerXYZDegrees(rotationX: number, rotationY: number, rotationZ: number): QuaternionTuple {
  const x = rotationX * DEGREES_TO_RADIANS / 2;
  const y = rotationY * DEGREES_TO_RADIANS / 2;
  const z = rotationZ * DEGREES_TO_RADIANS / 2;
  const c1 = Math.cos(x);
  const c2 = Math.cos(y);
  const c3 = Math.cos(z);
  const s1 = Math.sin(x);
  const s2 = Math.sin(y);
  const s3 = Math.sin(z);

  // Matches THREE.Euler(rx, ry, rz, "XYZ").
  return normalizeQuaternion([
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]);
}

export function rotateDirection(direction: Vector3Like, quaternion: QuaternionLike): Vector3Tuple {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  const quaternionVector: Vector3Tuple = [x, y, z];
  const uv = cross(quaternionVector, direction);
  const uuv = cross(quaternionVector, uv);
  return [
    direction[0] + 2 * (w * uv[0] + uuv[0]),
    direction[1] + 2 * (w * uv[1] + uuv[1]),
    direction[2] + 2 * (w * uv[2] + uuv[2]),
  ];
}

export function localDirectionToWorld(pose: ConstructionPlanePose, direction: Vector3Like): Vector3Tuple {
  return rotateDirection(direction, pose.quaternion);
}

export function worldDirectionToLocal(pose: ConstructionPlanePose, direction: Vector3Like): Vector3Tuple {
  return rotateDirection(direction, conjugateQuaternion(pose.quaternion));
}

export function localPointToWorld(pose: ConstructionPlanePose, point: Vector3Like): Vector3Tuple {
  const rotated = localDirectionToWorld(pose, point);
  return [rotated[0] + pose.origin[0], rotated[1] + pose.origin[1], rotated[2] + pose.origin[2]];
}

export function worldPointToLocal(pose: ConstructionPlanePose, point: Vector3Like): Vector3Tuple {
  return worldDirectionToLocal(pose, [
    point[0] - pose.origin[0],
    point[1] - pose.origin[1],
    point[2] - pose.origin[2],
  ]);
}

function quaternionFromBasis(xAxis: Vector3Like, yAxis: Vector3Like, zAxis: Vector3Like): QuaternionTuple {
  // Matrix columns are the world-space directions of the local axes.
  const m11 = xAxis[0];
  const m12 = yAxis[0];
  const m13 = zAxis[0];
  const m21 = xAxis[1];
  const m22 = yAxis[1];
  const m23 = zAxis[1];
  const m31 = xAxis[2];
  const m32 = yAxis[2];
  const m33 = zAxis[2];
  const trace = m11 + m22 + m33;
  let quaternion: QuaternionTuple;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    quaternion = [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    quaternion = [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    quaternion = [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    quaternion = [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
  }
  return normalizeQuaternion(quaternion);
}

export function poseFromWorldOriginAndNormal(
  origin: Vector3Like,
  normal: Vector3Like,
  preferredXAxis: Vector3Like = [1, 0, 0],
): ConstructionPlanePose {
  const yAxis = normalizeVector(normal);
  const preferred = normalizeVector(preferredXAxis);
  const fallbackAxes: Vector3Like[] = [[0, 0, 1], [0, 1, 0], [1, 0, 0]];
  const reference = Math.abs(dot(preferred, yAxis)) < 0.999
    ? preferred
    : fallbackAxes.reduce((best, candidate) => (
      Math.abs(dot(candidate, yAxis)) < Math.abs(dot(best, yAxis)) ? candidate : best
    ));
  const projection = dot(reference, yAxis);
  const xAxis = normalizeVector([
    reference[0] - projection * yAxis[0],
    reference[1] - projection * yAxis[1],
    reference[2] - projection * yAxis[2],
  ]);
  const zAxis = normalizeVector(cross(xAxis, yAxis));

  return {
    origin: [origin[0], origin[1], origin[2]],
    quaternion: quaternionFromBasis(xAxis, yAxis, zAxis),
  };
}

export const constructionPlanePoseFromNormal = poseFromWorldOriginAndNormal;

export function principalPlanePose(plane: PrincipalPlane, normalOffset = 0): ConstructionPlanePose {
  if (plane === "xz") {
    return poseFromWorldOriginAndNormal([0, normalOffset, 0], [0, 1, 0]);
  }
  if (plane === "xy") {
    return poseFromWorldOriginAndNormal([0, 0, normalOffset], [0, 0, 1]);
  }
  return poseFromWorldOriginAndNormal([normalOffset, 0, 0], [1, 0, 0]);
}

export const principalConstructionPlanePose = principalPlanePose;

export function sourceShapePose(source: ConstructionPlaneSourceShape): ConstructionPlanePose {
  return {
    origin: [source.x, (source.elevation ?? 0) + source.height / 2, source.z],
    quaternion: quaternionFromEulerXYZDegrees(
      source.rotationX ?? 0,
      source.rotation,
      source.rotationZ ?? 0,
    ),
  };
}

export function shapeCenterInConstructionPlane(source: ConstructionPlaneSourceShape, pose: ConstructionPlanePose): Vector3Tuple {
  return worldPointToLocal(pose, [source.x, (source.elevation ?? 0) + source.height / 2, source.z]);
}

function normalizedCoordinate(value: number, dimension: number) {
  return Math.abs(dimension) < EPSILON ? 0 : value / dimension;
}

export function constructionPlaneAttachmentFromWorldPose(
  worldPose: ConstructionPlanePose,
  source: ConstructionPlaneSourceShape,
): ConstructionPlaneAttachment {
  const sourcePose = sourceShapePose(source);
  const localOrigin = worldPointToLocal(sourcePose, worldPose.origin);
  return {
    normalizedOrigin: [
      normalizedCoordinate(localOrigin[0], source.width),
      normalizedCoordinate(localOrigin[1], source.height),
      normalizedCoordinate(localOrigin[2], source.depth),
    ],
    localQuaternion: multiplyQuaternions(conjugateQuaternion(sourcePose.quaternion), worldPose.quaternion),
  };
}

export function resolveConstructionPlaneAttachment(
  attachment: ConstructionPlaneAttachment,
  source: ConstructionPlaneSourceShape,
): ConstructionPlanePose {
  const sourcePose = sourceShapePose(source);
  return {
    origin: localPointToWorld(sourcePose, [
      attachment.normalizedOrigin[0] * source.width,
      attachment.normalizedOrigin[1] * source.height,
      attachment.normalizedOrigin[2] * source.depth,
    ]),
    quaternion: multiplyQuaternions(sourcePose.quaternion, attachment.localQuaternion),
  };
}

export const worldPoseToConstructionPlaneAttachment = constructionPlaneAttachmentFromWorldPose;
export const constructionPlaneAttachmentToWorldPose = resolveConstructionPlaneAttachment;
