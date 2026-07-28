import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";
import type { CadModifierPrimitivePart } from "@/lib/cadModifierTypes";
import { mirrorSign, resizedImportedCoordinates, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";

export type BakedCadMetadataFrame = {
  centerX: number;
  minY: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
  yawDegrees: number;
};

export function cadTransformToMatrix(transform: number[] | undefined) {
  if (!transform || transform.length !== 12 || !transform.every(Number.isFinite)) {
    return new THREE.Matrix4();
  }

  return new THREE.Matrix4().set(
    transform[0], transform[1], transform[2], transform[3],
    transform[4], transform[5], transform[6], transform[7],
    transform[8], transform[9], transform[10], transform[11],
    0, 0, 0, 1,
  );
}

export function cadTransformFromMatrix(matrix: THREE.Matrix4) {
  const elements = matrix.elements;
  return [
    elements[0], elements[4], elements[8], elements[12],
    elements[1], elements[5], elements[9], elements[13],
    elements[2], elements[6], elements[10], elements[14],
  ];
}

function isIdentityCadTransform(transform: number[]) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  return transform.every((value, index) => Math.abs(value - identity[index]) < 1e-9);
}

function allFinitePositive(values: number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

export function cadModifierPrimitiveForAnalyticBox(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  if (shape.kind !== "box" || shape.importedMesh || shape.groupedShapes?.length) {
    return null;
  }

  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  if (!allFinitePositive([width, depth, height])) {
    return null;
  }

  const centerY = height / 2;
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + centerY, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(shape.rotationX ?? 0),
        THREE.MathUtils.degToRad(shape.rotation ?? 0),
        THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
        "XYZ",
      ),
    ))
    .multiply(new THREE.Matrix4().makeScale(mirrorSign(shape.mirrorX), mirrorSign(shape.mirrorY), mirrorSign(shape.mirrorZ)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -centerY, 0));

  const transform = cadTransformFromMatrix(matrix);
  return {
    kind: "box",
    width,
    depth,
    height,
    transform: isIdentityCadTransform(transform) ? undefined : transform,
  };
}

export function cadModifierPrimitiveForBakedShape(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  const primitive = shape.cadPrimitiveFrame;
  const frame = primitive?.frame;
  if (!primitive || primitive.kind !== "box" || !frame) {
    return null;
  }

  if (!allFinitePositive([
    primitive.width,
    primitive.depth,
    primitive.height,
    frame.width,
    frame.depth,
    frame.height,
    shapeWidth(shape),
    shapeDepth(shape),
    shape.height,
  ])) {
    return null;
  }

  const centerY = shape.height / 2;
  const scaleX = shapeWidth(shape) / frame.width;
  const scaleY = shape.height / frame.height;
  const scaleZ = shapeDepth(shape) / frame.depth;
  const mirrorX = mirrorSign(shape.mirrorX);
  const mirrorY = mirrorSign(shape.mirrorY);
  const mirrorZ = mirrorSign(shape.mirrorZ);
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + centerY, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(shape.rotationX ?? 0),
        THREE.MathUtils.degToRad(shape.rotation ?? 0),
        THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
        "XYZ",
      ),
    ))
    .multiply(new THREE.Matrix4().makeTranslation(0, -mirrorY * centerY, 0))
    .multiply(new THREE.Matrix4().makeScale(mirrorX * scaleX, mirrorY * scaleY, mirrorZ * scaleZ))
    .multiply(new THREE.Matrix4().makeTranslation(-frame.x, -frame.elevation, -frame.z))
    .multiply(cadTransformToMatrix(frame.sourceTransform));

  const transform = cadTransformFromMatrix(matrix);
  return {
    kind: primitive.kind,
    width: primitive.width,
    depth: primitive.depth,
    height: primitive.height,
    transform: isIdentityCadTransform(transform) ? undefined : transform,
  };
}

export function bakedBoxSelectionFrame(shape: WorkplaneShape) {
  const primitive = cadModifierPrimitiveForBakedShape(shape);
  if (!primitive || primitive.kind !== "box") {
    return null;
  }
  const matrix = cadTransformToMatrix(primitive.transform);
  const xVector = new THREE.Vector3(primitive.width, 0, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const yVector = new THREE.Vector3(0, primitive.height, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const zVector = new THREE.Vector3(0, 0, primitive.depth).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const width = xVector.length();
  const height = yVector.length();
  const depth = zVector.length();
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0.001)) {
    return null;
  }

  const xAxis = xVector.normalize();
  const yAxis = yVector.normalize();
  const zAxis = zVector.normalize();
  const center = new THREE.Vector3(0, primitive.height / 2, 0).applyMatrix4(matrix);
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return {
    center,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
    xAxis,
    yAxis,
    zAxis,
    width,
    height,
    depth,
  };
}

export function cadBrepTransformForShape(shape: WorkplaneShape) {
  const frame = shape.cadBrepFrame;
  if (!frame) return undefined;
  const oldCenter = new THREE.Vector3(frame.x, frame.elevation + frame.height / 2, frame.z);
  const currentCenter = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(shape.rotationX ?? 0),
    THREE.MathUtils.degToRad(shape.rotation ?? 0),
    THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
    "XYZ",
  ));
  const scale = new THREE.Vector3(
    shapeWidth(shape) / Math.max(0.001, frame.width) * mirrorSign(shape.mirrorX),
    shape.height / Math.max(0.001, frame.height) * mirrorSign(shape.mirrorY),
    shapeDepth(shape) / Math.max(0.001, frame.depth) * mirrorSign(shape.mirrorZ),
  );
  const matrix = new THREE.Matrix4()
    .compose(currentCenter, rotation, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-oldCenter.x, -oldCenter.y, -oldCenter.z))
    .multiply(cadTransformToMatrix(frame.sourceTransform));
  const result = cadTransformFromMatrix(matrix);
  return isIdentityCadTransform(result) ? undefined : result;
}

function bakeCadDisplayEdgesForShape(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  if (!shape.cadDisplayEdges?.length) {
    return undefined;
  }

  const centerY = shape.height / 2;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(frame.yawDegrees),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const xMirror = mirrorSign(shape.mirrorX);
  const yMirror = mirrorSign(shape.mirrorY);
  const zMirror = mirrorSign(shape.mirrorZ);
  const bakedEdges = shape.cadDisplayEdges.flatMap((edge) => {
    if (edge.points.length < 6) {
      return [];
    }

    const resizedPoints = resizedImportedCoordinates(shape, edge.points);
    const points: number[] = [];
    for (let index = 0; index + 2 < resizedPoints.length; index += 3) {
      const vertex = new THREE.Vector3(
        resizedPoints[index] * xMirror,
        (resizedPoints[index + 1] - centerY) * yMirror,
        resizedPoints[index + 2] * zMirror,
      ).applyMatrix4(matrix);
      const x = vertex.x + shape.x - frame.centerX;
      const y = vertex.y + (shape.elevation ?? 0) + centerY - frame.minY;
      const z = vertex.z + shape.z - frame.centerZ;
      if ([x, y, z].every(Number.isFinite)) {
        points.push(x, y, z);
      }
    }

    return points.length >= 6 ? [{ points }] : [];
  });

  return bakedEdges.length > 0 ? bakedEdges : undefined;
}

function bakeCadPrimitiveFrameForShapeTransform(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  const primitive = cadModifierPrimitiveForBakedShape(shape) ?? cadModifierPrimitiveForAnalyticBox(shape);
  if (!primitive) {
    return undefined;
  }

  return {
    kind: primitive.kind,
    width: primitive.width,
    depth: primitive.depth,
    height: primitive.height,
    frame: {
      x: frame.centerX,
      z: frame.centerZ,
      elevation: frame.minY,
      width: frame.width,
      depth: frame.depth,
      height: frame.height,
      ...(primitive.transform ? { sourceTransform: primitive.transform } : {}),
    },
  };
}

export function bakeCadMetadataForShapeTransform(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  const cadDisplayEdges = bakeCadDisplayEdgesForShape(shape, frame);
  const sourceTransform = cadBrepTransformForShape(shape);
  const cadPrimitiveFrame = bakeCadPrimitiveFrameForShapeTransform(shape, frame);
  const cadBrepFrame = shape.cadBrep && shape.cadBrepFrame
    ? {
        x: frame.centerX,
        z: frame.centerZ,
        elevation: frame.minY,
        width: frame.width,
        depth: frame.depth,
        height: frame.height,
        ...(sourceTransform ? { sourceTransform } : {}),
      }
    : undefined;
  return {
    cadDisplayEdges,
    cadDisplayEdgesVersion: cadDisplayEdges ? (2 as const) : undefined,
    cadBrep: cadBrepFrame ? shape.cadBrep : undefined,
    cadBrepFrame,
    cadPrimitiveFrame,
  };
}
