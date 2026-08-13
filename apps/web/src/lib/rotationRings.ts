import * as THREE from "three";

export type RotationRingAxis = "x" | "y" | "z";

export const ROTATION_RING_AXES: readonly RotationRingAxis[] = ["x", "y", "z"] as const;

export const ROTATION_RING_COLORS: Record<RotationRingAxis, number> = {
  x: 0xe5484d,
  y: 0x46a758,
  z: 0x3e63dd,
};

// Ring geometry / behavior tuning. Locked by the rotation-handle-visibility wayfinder map.
export const RING_SCREEN_MIN_PX = 40;
export const RING_SCREEN_MAX_PX = 160;
export const RING_TUBE_TO_RADIUS = 0.03;
export const RING_TUBE_MIN = 0.5;

// Camera-facing bias — ticket 04.
export const RING_BIAS_THRESHOLD_DEG = 15;
export const RING_BIAS_MAX_TILT_DEG = 10;

// Camera-motion fade — ticket 03.
export const RING_FADE_ACTIVE_OPACITY = 0.2;
export const RING_FADE_IDLE_OPACITY = 0.85;
export const RING_FADE_DIM_OPACITY = 0.28;
export const RING_FADE_HOVER_OPACITY = 1;
export const RING_FADE_EASE_MS = 200;

/**
 * Return a world-space ring radius such that the ring renders at a screen size
 * that falls inside [RING_SCREEN_MIN_PX, RING_SCREEN_MAX_PX].
 *
 * Given a desired radius derived from the selection's bounding sphere, we
 * project it to screen space at the ring's center, then rescale if it lands
 * outside the target range.
 */
export function computeRingRadius(
  boundingSphereRadius: number,
  worldPerScreenPixel: number,
): number {
  if (!Number.isFinite(boundingSphereRadius) || boundingSphereRadius <= 0) {
    boundingSphereRadius = 1;
  }
  const desiredWorld = boundingSphereRadius * 1.35;
  const desiredScreenPx = desiredWorld / Math.max(1e-6, worldPerScreenPixel);
  if (desiredScreenPx < RING_SCREEN_MIN_PX) {
    return RING_SCREEN_MIN_PX * worldPerScreenPixel;
  }
  if (desiredScreenPx > RING_SCREEN_MAX_PX) {
    return RING_SCREEN_MAX_PX * worldPerScreenPixel;
  }
  return desiredWorld;
}

/**
 * The world distance that corresponds to one pixel of screen height at the
 * given center point, given the camera's projection.
 *
 * For a perspective camera the mapping depends on distance-along-view.
 * For an orthographic camera it's a fixed ratio derived from the frustum.
 */
export function worldUnitsPerScreenPixel(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  worldPoint: THREE.Vector3,
  viewportHeightPx: number,
): number {
  const height = Math.max(1, viewportHeightPx);
  if (camera instanceof THREE.OrthographicCamera) {
    const worldViewHeight = Math.abs(camera.top - camera.bottom) / Math.max(0.0001, camera.zoom);
    return worldViewHeight / height;
  }
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const toPoint = worldPoint.clone().sub(camera.position);
  const depth = Math.max(0.001, toPoint.dot(forward));
  const worldViewHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return worldViewHeight / height;
}

/**
 * How much visual tilt the ring should get so its plane presents a thicker
 * profile toward the camera. Returns the tilt angle in radians, plus the axis
 * to rotate around. Applied to the ring's *visual* quaternion only; the actual
 * rotation axis stays fixed to the object's local axis.
 *
 * Zero result outside the threshold. Eases from 0 at the threshold to
 * RING_BIAS_MAX_TILT_DEG when the ring is exactly edge-on.
 */
export function computeCameraFacingBias(
  ringPlaneNormalWorld: THREE.Vector3,
  cameraForwardWorld: THREE.Vector3,
): { axis: THREE.Vector3; angleRad: number } {
  const normal = ringPlaneNormalWorld.clone().normalize();
  const forward = cameraForwardWorld.clone().normalize();
  // alignment: 1 = ring face-on to camera, 0 = ring edge-on to camera.
  const alignment = Math.abs(normal.dot(forward));
  // fromEdgeDeg: 0 at exact edge-on, 90 at exact face-on.
  const fromEdgeDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(alignment, 0, 1)));
  if (fromEdgeDeg >= RING_BIAS_THRESHOLD_DEG) {
    return { axis: new THREE.Vector3(1, 0, 0), angleRad: 0 };
  }
  // t: 0 at the threshold, 1 at exact edge-on.
  const t = 1 - fromEdgeDeg / RING_BIAS_THRESHOLD_DEG;
  const eased = t * t * (3 - 2 * t);
  const angleDeg = eased * RING_BIAS_MAX_TILT_DEG;
  const axis = new THREE.Vector3().crossVectors(normal, forward);
  if (axis.lengthSq() < 1e-8) {
    axis.set(1, 0, 0);
  }
  axis.normalize();
  return { axis, angleRad: THREE.MathUtils.degToRad(angleDeg) };
}

/**
 * Ease an opacity toward a target with a fixed time constant (RING_FADE_EASE_MS).
 * Frame-rate-independent within reason.
 */
export function easeOpacity(current: number, target: number, deltaMs: number): number {
  if (!Number.isFinite(current)) current = target;
  if (deltaMs <= 0) return current;
  const t = 1 - Math.exp(-deltaMs / RING_FADE_EASE_MS);
  return current + (target - current) * t;
}

/**
 * Given interaction + camera-motion state, return the target opacity for each
 * of the three rings. Precedence: active drag > hover > camera motion > idle.
 */
export function targetRingOpacities(input: {
  activeAxis: RotationRingAxis | null;
  hoveredAxis: RotationRingAxis | null;
  cameraMoving: boolean;
}): Record<RotationRingAxis, number> {
  const { activeAxis, hoveredAxis, cameraMoving } = input;
  const base = cameraMoving ? RING_FADE_ACTIVE_OPACITY : RING_FADE_IDLE_OPACITY;
  const result: Record<RotationRingAxis, number> = {
    x: base,
    y: base,
    z: base,
  };
  if (activeAxis) {
    for (const axis of ROTATION_RING_AXES) {
      result[axis] = axis === activeAxis ? RING_FADE_HOVER_OPACITY : RING_FADE_DIM_OPACITY;
    }
    return result;
  }
  if (hoveredAxis) {
    result[hoveredAxis] = RING_FADE_HOVER_OPACITY;
  }
  return result;
}

export type RotationRing = {
  axis: RotationRingAxis;
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  planeNormalLocal: THREE.Vector3; // axis in ring's local space that is normal to its plane
};

export type RotationRingSet = {
  group: THREE.Group;
  rings: Record<RotationRingAxis, RotationRing>;
  dispose: () => void;
};

/**
 * Create the three axis rings as a group of Torus meshes. The group's transform
 * is used to orient the whole set to match the selection frame; each ring's
 * local transform is set so its plane normal aligns with the corresponding
 * axis of the group's local space.
 */
export function createRotationRingSet(): RotationRingSet {
  const group = new THREE.Group();
  group.name = "RotationRings";
  group.visible = false;
  group.renderOrder = 999; // draw over shape geometry so rings are never fully hidden by opaque solids

  const build = (axis: RotationRingAxis): RotationRing => {
    // TorusGeometry lies in the local XY plane (normal = +Z). Reorient so its
    // normal matches the requested axis in group-local space.
    const geometry = new THREE.TorusGeometry(1, RING_TUBE_TO_RADIUS, 12, 96);
    const material = new THREE.MeshBasicMaterial({
      color: ROTATION_RING_COLORS[axis],
      transparent: true,
      opacity: RING_FADE_IDLE_OPACITY,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `RotationRing-${axis}`;
    mesh.renderOrder = 999;
    // Torus geometry normal = +Z of its local space. Rotate so it faces the
    // requested axis of the *group* local space.
    if (axis === "x") {
      mesh.rotation.y = Math.PI / 2;
    } else if (axis === "y") {
      mesh.rotation.x = Math.PI / 2;
    }
    group.add(mesh);
    const normalLocal =
      axis === "x" ? new THREE.Vector3(1, 0, 0)
      : axis === "y" ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
    return { axis, mesh, planeNormalLocal: normalLocal };
  };

  const rings: Record<RotationRingAxis, RotationRing> = {
    x: build("x"),
    y: build("y"),
    z: build("z"),
  };

  const dispose = () => {
    for (const axis of ROTATION_RING_AXES) {
      const ring = rings[axis];
      ring.mesh.geometry.dispose();
      ring.mesh.material.dispose();
      group.remove(ring.mesh);
    }
  };

  return { group, rings, dispose };
}

/**
 * Update the ring set to match the current selection frame + camera state.
 * Positions the group at the frame's center, orients its axes to the frame's
 * local axes, sizes each ring by the shared world radius, applies per-ring
 * camera-facing bias, and eases opacities toward the current targets.
 */
export function updateRotationRingSet(
  set: RotationRingSet,
  params: {
    frameCenter: THREE.Vector3;
    frameXAxis: THREE.Vector3;
    frameYAxis: THREE.Vector3;
    frameZAxis: THREE.Vector3;
    boundingSphereRadius: number;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    viewportHeightPx: number;
    activeAxis: RotationRingAxis | null;
    hoveredAxis: RotationRingAxis | null;
    cameraMoving: boolean;
    deltaMs: number;
  },
): void {
  const {
    frameCenter,
    frameXAxis,
    frameYAxis,
    frameZAxis,
    boundingSphereRadius,
    camera,
    viewportHeightPx,
    activeAxis,
    hoveredAxis,
    cameraMoving,
    deltaMs,
  } = params;

  set.group.position.copy(frameCenter);
  set.group.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frameXAxis, frameYAxis, frameZAxis),
  );

  const worldPerPx = worldUnitsPerScreenPixel(camera, frameCenter, viewportHeightPx);
  const radius = computeRingRadius(boundingSphereRadius, worldPerPx);

  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);

  const opacityTargets = targetRingOpacities({ activeAxis, hoveredAxis, cameraMoving });

  for (const axis of ROTATION_RING_AXES) {
    const ring = set.rings[axis];
    ring.mesh.scale.setScalar(radius);
    const tube = Math.max(RING_TUBE_MIN, radius * RING_TUBE_TO_RADIUS);
    // TorusGeometry(1, radius) already sets tube by geometry; scaling scales both.
    // To keep the tube from ballooning at large radii, adjust it via extra scaling
    // on the mesh's normal axis is complex — instead we accept proportional tubes.
    // The RING_TUBE_TO_RADIUS constant is picked so the ring reads as a fine line
    // at all sizes. `tube` unused here but kept for callers that want it.
    void tube;

    // Camera-facing bias in world space, projected back into group-local space.
    const normalWorld = ring.planeNormalLocal.clone().applyQuaternion(set.group.quaternion);
    const bias = computeCameraFacingBias(normalWorld, cameraForward);
    const localBiasAxis = bias.axis.clone().applyQuaternion(set.group.quaternion.clone().invert());
    // Reset to the axis-aligned base orientation, then apply the bias delta.
    if (axis === "x") {
      ring.mesh.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    } else if (axis === "y") {
      ring.mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    } else {
      ring.mesh.quaternion.identity();
    }
    if (bias.angleRad > 0) {
      const biasQuat = new THREE.Quaternion().setFromAxisAngle(localBiasAxis, bias.angleRad);
      ring.mesh.quaternion.premultiply(biasQuat);
    }

    const target = opacityTargets[axis];
    ring.mesh.material.opacity = easeOpacity(ring.mesh.material.opacity, target, deltaMs);
  }
}
