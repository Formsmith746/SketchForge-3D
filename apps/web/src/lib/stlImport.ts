import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/sketchforge";

const stlLoader = new STLLoader();
const SUPPORTED_IMPORT_EXTENSIONS = new Set(["stl", "svg"]);

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function importedShapeFromTriangleSoup(
  fileName: string,
  rawPositions: number[],
  rawNormals: number[] | undefined,
  sourceFormat: NonNullable<WorkplaneShape["importedMesh"]>["sourceFormat"] = "stl",
): WorkplaneShape {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(rawPositions, 3));
  if (rawNormals?.length === rawPositions.length) {
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(rawNormals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();

  const box = geometry.boundingBox;
  if (!box) {
    throw new Error("STL has no readable geometry");
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error("STL geometry is empty");
  }

  const scale = 1;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const positions: number[] = [];
  const normals: number[] = [];

  for (let i = 0; i < position.count; i += 1) {
    positions.push((position.getX(i) - center.x) * scale, (position.getY(i) - box.min.y) * scale, (position.getZ(i) - center.z) * scale);
    if (normal) {
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }
  }

  const width = Math.max(1, size.x * scale);
  const height = Math.max(1, size.y * scale);
  const depth = Math.max(1, size.z * scale);
  const triangleCount = Math.floor(position.count / 3);

  return {
    id: createLocalId("uploaded-mesh"),
    name: fileName.replace(/\.[^.]+$/, "") || `Imported ${sourceFormat.toUpperCase()}`,
    kind: "mesh",
    color: "#0098c7",
    x: 10,
    z: -10,
    size: Math.max(width, depth),
    width,
    depth,
    height,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions,
      normals: normals.length ? normals : undefined,
      baseWidth: width,
      baseDepth: depth,
      baseHeight: height,
      triangleCount,
      sourceFormat,
    },
    locked: false,
    hidden: false,
  };
}

export function importExtensionSupported(fileName: string) {
  return SUPPORTED_IMPORT_EXTENSIONS.has(fileExtension(fileName));
}

export function importedShapeFromStl(fileName: string, buffer: ArrayBuffer): WorkplaneShape {
  const rawGeometry = stlLoader.parse(buffer);
  const geometry = rawGeometry.index ? rawGeometry.toNonIndexed() : rawGeometry.clone();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const rawPositions: number[] = [];
  const rawNormals: number[] = [];

  for (let i = 0; i < position.count; i += 1) {
    rawPositions.push(position.getX(i), position.getY(i), position.getZ(i));
    if (normal) {
      rawNormals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    }
  }

  return importedShapeFromTriangleSoup(fileName, rawPositions, rawNormals.length ? rawNormals : undefined);
}
