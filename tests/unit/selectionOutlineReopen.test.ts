import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bakedBoxSelectionFrame, bakeCadMetadataForShapeTransform } from "@/lib/cadBakeMetadata";
import { exportSkfProject, importSkfProject } from "@/lib/skfProject";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/sketchforge";

function cube(): WorkplaneShape {
  return {
    id: "cube",
    name: "Cube",
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
    rotationX: 0,
    rotationZ: 0,
  };
}

function inverseRotationPatch(shape: Pick<WorkplaneShape, "rotation" | "rotationX" | "rotationZ">) {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(shape.rotationX ?? 0),
    THREE.MathUtils.degToRad(shape.rotation),
    THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
    "XYZ",
  ));
  const inverse = new THREE.Euler().setFromQuaternion(quaternion.invert(), "XYZ");
  return {
    rotationX: THREE.MathUtils.radToDeg(inverse.x),
    rotation: THREE.MathUtils.radToDeg(inverse.y),
    rotationZ: THREE.MathUtils.radToDeg(inverse.z),
  };
}

const cubeTriangles = [
  0, 2, 1, 0, 3, 2,
  4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4,
  1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6,
  3, 0, 4, 3, 4, 7,
];

function primitiveCubePositions() {
  const vertices = [
    [-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10],
    [-10, 20, -10], [10, 20, -10], [10, 20, 10], [-10, 20, 10],
  ];
  return cubeTriangles.flatMap((index) => vertices[index]);
}

function bake(shape: WorkplaneShape, rotation: Pick<WorkplaneShape, "rotation" | "rotationX" | "rotationZ">) {
  const source = shape.importedMesh?.positions ?? primitiveCubePositions();
  const sourceWidth = shape.importedMesh?.baseWidth ?? shape.width;
  const sourceDepth = shape.importedMesh?.baseDepth ?? shape.depth;
  const sourceHeight = shape.importedMesh?.baseHeight ?? shape.height;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotation.rotationX ?? 0),
    THREE.MathUtils.degToRad(rotation.rotation),
    THREE.MathUtils.degToRad(rotation.rotationZ ?? 0),
    "XYZ",
  ));
  const centerY = shape.height / 2;
  const world = Array.from({ length: source.length / 3 }, (_, index) => new THREE.Vector3(
    source[index * 3] * shape.width / sourceWidth,
    source[index * 3 + 1] * shape.height / sourceHeight - centerY,
    source[index * 3 + 2] * shape.depth / sourceDepth,
  ).applyMatrix4(matrix).add(new THREE.Vector3(shape.x, (shape.elevation ?? 0) + centerY, shape.z)));
  const bounds = new THREE.Box3().setFromPoints(world);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const positions = world.flatMap((point) => [point.x - center.x, point.y - bounds.min.y, point.z - center.z]);
  const cadMetadata = bakeCadMetadataForShapeTransform(
    { ...shape, ...rotation },
    {
      centerX: center.x,
      minY: bounds.min.y,
      centerZ: center.z,
      width: size.x,
      depth: size.z,
      height: size.y,
      yawDegrees: rotation.rotation,
    },
  );
  return {
    ...shape,
    kind: "mesh" as const,
    x: center.x,
    z: center.z,
    elevation: bounds.min.y,
    size: Math.max(size.x, size.z),
    width: size.x,
    depth: size.z,
    height: size.y,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions,
      baseWidth: size.x,
      baseDepth: size.z,
      baseHeight: size.y,
      triangleCount: positions.length / 9,
      sourceFormat: "json" as const,
    },
    ...cadMetadata,
  };
}

function expectAxisAlignedCube(shape: WorkplaneShape) {
  const positions = shape.importedMesh?.positions ?? [];
  expect(positions.length).toBeGreaterThan(0);
  const coordinates = [0, 1, 2].map((axis) =>
    [...new Set(Array.from({ length: positions.length / 3 }, (_, index) => Number(positions[index * 3 + axis].toFixed(5))))].sort((a, b) => a - b),
  );
  coordinates.forEach((axisValues) => expect(axisValues).toHaveLength(2));
}

describe("selection outline after project reopen", () => {
  it("restores the exact oriented box frame for a baked cube", async () => {
    const rotated = bake(cube(), { rotationX: 31, rotation: 47, rotationZ: 19 });
    const bytes = await exportSkfProject({
      projectId: "oriented-selection-outline-project",
      projectName: "Oriented selection outline",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_000_100,
      shapes: [rotated],
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = await importSkfProject(bytes);
    const frame = bakedBoxSelectionFrame(restored.shapes[0]);

    expect(frame).not.toBeNull();
    expect(Math.abs(frame?.xAxis.x ?? 1)).toBeLessThan(0.99);
    expect(frame?.width).toBeCloseTo(20, 5);
    expect(frame?.height).toBeCloseTo(20, 5);
    expect(frame?.depth).toBeCloseTo(20, 5);
  });

  it("keeps a cube axis-aligned after rotating it away and back, then round-tripping the project", async () => {
    const firstRotation = { rotationX: 31, rotation: 47, rotationZ: 19 };
    const rotated = bake(cube(), firstRotation);
    const returned = bake(rotated, inverseRotationPatch(firstRotation));
    expectAxisAlignedCube(returned);

    const bytes = await exportSkfProject({
      projectId: "selection-outline-project",
      projectName: "Selection outline",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_000_100,
      shapes: [returned],
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = await importSkfProject(bytes);
    expectAxisAlignedCube(restored.shapes[0]);
    const frame = bakedBoxSelectionFrame(restored.shapes[0]);
    expect(frame?.xAxis.x).toBeCloseTo(1, 5);
    expect(frame?.yAxis.y).toBeCloseTo(1, 5);
    expect(frame?.zAxis.z).toBeCloseTo(1, 5);
    expect(restored.shapes[0].rotation).toBe(0);
    expect(restored.shapes[0].rotationX).toBe(0);
    expect(restored.shapes[0].rotationZ).toBe(0);
  });
});
