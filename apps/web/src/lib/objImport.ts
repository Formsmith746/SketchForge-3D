import * as THREE from "three";
import { createLocalId } from "@/lib/localIds";
import { zUpToSketchForge } from "@/lib/meshCoordinates";
import type { WorkplaneShape } from "@/types/sketchforge";

type ObjFaceVertex = {
  vertexIndex: number;
  normalIndex?: number;
};

function resolveObjIndex(token: string, count: number, label: string) {
  const parsed = Number.parseInt(token, 10);
  if (!Number.isInteger(parsed) || parsed === 0) throw new Error(`OBJ has an invalid ${label} index`);
  const index = parsed > 0 ? parsed - 1 : count + parsed;
  if (index < 0 || index >= count) throw new Error(`OBJ ${label} index is out of range`);
  return index;
}

function faceNormal(points: readonly THREE.Vector3[]) {
  const normal = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal;
}

function projectedFace(points: readonly THREE.Vector3[], normal: THREE.Vector3) {
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);
  if (absX >= absY && absX >= absZ) return points.map((point) => new THREE.Vector2(point.y, point.z));
  if (absY >= absZ) return points.map((point) => new THREE.Vector2(point.x, point.z));
  return points.map((point) => new THREE.Vector2(point.x, point.y));
}

function triangulateFace(points: readonly THREE.Vector3[]) {
  if (points.length === 3) return [[0, 1, 2] as const];

  const polygonNormal = faceNormal(points);
  if (polygonNormal.lengthSq() <= 1e-20) throw new Error("OBJ contains a degenerate polygon face");
  const triangles = THREE.ShapeUtils.triangulateShape(projectedFace(points, polygonNormal), []);
  if (!triangles.length) throw new Error("OBJ contains a polygon face that could not be triangulated");

  return triangles.map(([a, b, c]) => {
    const triangleNormal = new THREE.Vector3()
      .subVectors(points[b], points[a])
      .cross(new THREE.Vector3().subVectors(points[c], points[a]));
    return triangleNormal.dot(polygonNormal) < 0 ? [a, c, b] as const : [a, b, c] as const;
  });
}

function orientTriangleToObjNormals(
  triangle: readonly [number, number, number],
  refs: readonly ObjFaceVertex[],
  vertices: readonly THREE.Vector3[],
  normals: readonly THREE.Vector3[],
): readonly [number, number, number] {
  const [aIndex, bIndex, cIndex] = triangle;
  const aRef = refs[aIndex];
  const bRef = refs[bIndex];
  const cRef = refs[cIndex];
  if (aRef.normalIndex === undefined || bRef.normalIndex === undefined || cRef.normalIndex === undefined) {
    return triangle;
  }

  const a = vertices[aRef.vertexIndex];
  const b = vertices[bRef.vertexIndex];
  const c = vertices[cRef.vertexIndex];
  const geometricNormal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a));
  if (geometricNormal.lengthSq() <= 1e-20) return triangle;

  const objNormal = new THREE.Vector3()
    .add(normals[aRef.normalIndex])
    .add(normals[bRef.normalIndex])
    .add(normals[cRef.normalIndex]);
  if (objNormal.lengthSq() <= 1e-20) return triangle;

  return geometricNormal.dot(objNormal) < 0
    ? [aIndex, cIndex, bIndex] as const
    : triangle;
}

function generatedFaceNormals(positions: readonly number[]) {
  const normals: number[] = [];
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const a = new THREE.Vector3(positions[index], positions[index + 1], positions[index + 2]);
    const b = new THREE.Vector3(positions[index + 3], positions[index + 4], positions[index + 5]);
    const c = new THREE.Vector3(positions[index + 6], positions[index + 7], positions[index + 8]);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a));
    if (normal.lengthSq() > 1e-20) normal.normalize();
    for (let vertex = 0; vertex < 3; vertex += 1) normals.push(normal.x, normal.y, normal.z);
  }
  return normals;
}

function importedObjShapeFromTriangles(
  fileName: string,
  rawPositions: number[],
  rawNormals: number[] | undefined,
): WorkplaneShape {
  if (rawPositions.length < 9 || rawPositions.length % 9 !== 0) {
    throw new Error("OBJ has no readable mesh geometry");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < rawPositions.length; index += 3) {
    const x = rawPositions[index];
    const y = rawPositions[index + 1];
    const z = rawPositions[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDimension = Math.max(sizeX, sizeY, sizeZ);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) throw new Error("OBJ geometry is empty");

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const positions: number[] = [];
  for (let index = 0; index < rawPositions.length; index += 3) {
    positions.push(
      rawPositions[index] - centerX,
      rawPositions[index + 1] - minY,
      rawPositions[index + 2] - centerZ,
    );
  }

  const normals = rawNormals?.length === rawPositions.length
    ? [...rawNormals]
    : generatedFaceNormals(rawPositions);
  const width = Math.max(1, sizeX);
  const height = Math.max(1, sizeY);
  const depth = Math.max(1, sizeZ);

  return {
    id: createLocalId("uploaded-mesh"),
    name: fileName.replace(/\.[^.]+$/, "") || "Imported OBJ",
    kind: "mesh",
    color: "#0098c7",
    x: 0,
    z: 0,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions,
      normals,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount: rawPositions.length / 9,
      sourceFormat: "obj",
    },
    locked: false,
    hidden: false,
  };
}

export function importedShapeFromObj(fileName: string, source: string): WorkplaneShape {
  const sketchForgeZUpExport = /^# SketchForge OBJ export\b/m.test(source);
  const vertices: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];
  const rawPositions: number[] = [];
  const rawNormals: number[] = [];
  let hasCompleteNormals = true;
  let faceCount = 0;

  source.split(/\r?\n/).forEach((sourceLine) => {
    const line = sourceLine.split("#", 1)[0].trim();
    if (!line) return;
    const parts = line.split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      if (parts.length < 4) throw new Error("OBJ contains an invalid vertex");
      const values = parts.slice(1, 4).map(Number);
      if (values.some((value) => !Number.isFinite(value))) throw new Error("OBJ contains a non-finite vertex");
      vertices.push(new THREE.Vector3(values[0], values[1], values[2]));
      return;
    }

    if (keyword === "vn") {
      if (parts.length < 4) throw new Error("OBJ contains an invalid normal");
      const values = parts.slice(1, 4).map(Number);
      if (values.some((value) => !Number.isFinite(value))) throw new Error("OBJ contains a non-finite normal");
      normals.push(new THREE.Vector3(values[0], values[1], values[2]).normalize());
      return;
    }

    if (keyword !== "f") return;
    if (parts.length < 4) throw new Error("OBJ contains a face with fewer than three vertices");

    const refs: ObjFaceVertex[] = parts.slice(1).map((token) => {
      const fields = token.split("/");
      const vertexIndex = resolveObjIndex(fields[0], vertices.length, "vertex");
      const normalIndex = fields.length >= 3 && fields[2]
        ? resolveObjIndex(fields[2], normals.length, "normal")
        : undefined;
      return { vertexIndex, normalIndex };
    });
    if (refs.length > 3 && refs[0].vertexIndex === refs[refs.length - 1].vertexIndex) refs.pop();
    if (refs.length < 3) throw new Error("OBJ contains a degenerate face");

    const points = refs.map((ref) => vertices[ref.vertexIndex]);
    triangulateFace(points).forEach((triangle) => {
      const orientedTriangle = orientTriangleToObjNormals(triangle, refs, vertices, normals);
      orientedTriangle.forEach((faceIndex) => {
        const ref = refs[faceIndex];
        const point = vertices[ref.vertexIndex];
        const position: [number, number, number] = [point.x, point.y, point.z];
        rawPositions.push(...(sketchForgeZUpExport ? zUpToSketchForge(position) : position));
        if (ref.normalIndex === undefined) {
          hasCompleteNormals = false;
        } else {
          const normal = normals[ref.normalIndex];
          const sourceNormal: [number, number, number] = [normal.x, normal.y, normal.z];
          rawNormals.push(...(sketchForgeZUpExport ? zUpToSketchForge(sourceNormal) : sourceNormal));
        }
      });
      faceCount += 1;
    });
  });

  if (!vertices.length || !faceCount || !rawPositions.length) {
    throw new Error("OBJ has no readable mesh geometry");
  }

  return importedObjShapeFromTriangles(
    fileName,
    rawPositions,
    hasCompleteNormals && rawNormals.length === rawPositions.length ? rawNormals : undefined,
  );
}
