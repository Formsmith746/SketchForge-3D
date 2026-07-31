import { describe, expect, it } from "vitest";
import {
  bakeCadMetadataForShapeTransform,
  cadBrepTransformForShape,
  cadModifierPrimitiveForAnalyticBox,
  cadModifierPrimitiveForBakedShape,
} from "@/lib/cadBakeMetadata";
import { cadTransformRequiresGeneralTransform } from "@/lib/cadModifierRuntime";
import type { WorkplaneShape } from "@/types/sketchforge";

function expectTransformClose(actual: number[] | undefined, expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual?.[index]).toBeCloseTo(value, 6);
  });
}

function treatedMeshShape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "treated-mesh",
    name: "Treated Mesh",
    kind: "mesh",
    color: "#d41721",
    x: 10,
    z: 0,
    elevation: 5,
    size: 2,
    width: 2,
    depth: 2,
    height: 2,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: [-1, 0, 0, 1, 0, 0, 0, 2, 0],
      baseWidth: 2,
      baseDepth: 2,
      baseHeight: 2,
      triangleCount: 1,
      sourceFormat: "json",
    },
    edgeTreatments: [{ kind: "fillet", amount: 0.5, edgeCount: 1 }],
    cadDisplayEdges: [{ points: [-1, 0, 0, 1, 0, 0] }],
    cadDisplayEdgesVersion: 2,
    cadBrep: "stored-brep-before-rotation",
    cadBrepFrame: {
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
    },
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function boxShape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 4,
    z: -6,
    elevation: 2,
    size: 20,
    width: 20,
    depth: 18,
    height: 16,
    rotation: 32,
    rotationX: 18,
    rotationZ: 24,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

describe("SketchForge transform baking", () => {
  it("preserves exact BREP and rebases CAD display edges after wheel rotation", () => {
    const shape = treatedMeshShape({ rotationZ: 90 });
    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 10,
      minY: 5,
      centerZ: 0,
      width: 2,
      depth: 2,
      height: 2,
      yawDegrees: 0,
    });
    const expectedTransform = [0, -1, 0, 16, 1, 0, 0, -4, 0, 0, 1, 0];

    expect(baked.cadBrep).toBe("stored-brep-before-rotation");
    expect(baked.cadBrepFrame).toMatchObject({
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
    });
    expectTransformClose(baked.cadBrepFrame?.sourceTransform, expectedTransform);
    expect(baked.cadDisplayEdgesVersion).toBe(2);
    expect(baked.cadDisplayEdges?.[0].points).toEqual([1, 0, 0, 1, 2, 0]);

    const bakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
      size: 2,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
    };
    expectTransformClose(cadBrepTransformForShape(bakedShape), expectedTransform);
  });

  it("preserves an analytic box primitive when wheel rotation bakes it to a mesh", () => {
    const shape = boxShape();
    const directPrimitive = cadModifierPrimitiveForAnalyticBox(shape);
    expect(directPrimitive?.transform).toBeDefined();

    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 4.5,
      minY: -2,
      centerZ: -5.5,
      width: 27,
      depth: 26,
      height: 25,
      yawDegrees: 32,
    });

    expect(baked.cadPrimitiveFrame).toMatchObject({
      kind: "box",
      width: 20,
      depth: 18,
      height: 16,
      frame: {
        x: 4.5,
        z: -5.5,
        elevation: -2,
        width: 27,
        depth: 26,
        height: 25,
      },
    });
    expectTransformClose(baked.cadPrimitiveFrame?.frame.sourceTransform, directPrimitive?.transform ?? []);

    const bakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      kind: "mesh",
      x: 4.5,
      z: -5.5,
      elevation: -2,
      width: 27,
      depth: 26,
      height: 25,
      size: 27,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      importedMesh: {
        positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
        baseWidth: 27,
        baseDepth: 26,
        baseHeight: 25,
        triangleCount: 1,
        sourceFormat: "json",
      },
    };
    const restoredPrimitive = cadModifierPrimitiveForBakedShape(bakedShape);
    expect(restoredPrimitive).toMatchObject({
      kind: "box",
      width: 20,
      depth: 18,
      height: 16,
    });
    expectTransformClose(restoredPrimitive?.transform, directPrimitive?.transform ?? []);
  });

  it("uses a general CAD transform after resizing a baked rotated box", () => {
    const shape = boxShape({
      x: 0,
      z: 0,
      elevation: 0,
      width: 20,
      depth: 20,
      height: 20,
      rotation: 45,
      rotationX: 0,
      rotationZ: 0,
    });
    const diagonal = Math.sqrt(20 ** 2 + 20 ** 2);
    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 0,
      minY: 0,
      centerZ: 0,
      width: diagonal,
      depth: diagonal,
      height: 20,
      yawDegrees: 45,
    });
    const resizedBakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      kind: "mesh",
      width: diagonal * 1.8,
      depth: diagonal * 0.75,
      height: 26,
      size: diagonal * 1.8,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      importedMesh: {
        positions: [-10, 0, -10, 10, 0, -10, 10, 20, 10],
        baseWidth: diagonal,
        baseDepth: diagonal,
        baseHeight: 20,
        triangleCount: 1,
        sourceFormat: "json",
      },
    };

    const restoredPrimitive = cadModifierPrimitiveForBakedShape(resizedBakedShape);
    expect(restoredPrimitive?.transform).toBeDefined();
    expect(cadTransformRequiresGeneralTransform(restoredPrimitive?.transform ?? [])).toBe(true);
  });
});
