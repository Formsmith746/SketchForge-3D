import { sketchForgeToZUp, type MeshPoint } from "@/lib/meshCoordinates";

export type StlExportMesh = {
  vertices: readonly MeshPoint[];
  faces: readonly (readonly [number, number, number])[];
};

const STL_HEADER_BYTES = 80;
const STL_TRIANGLE_COUNT_BYTES = 4;
const STL_TRIANGLE_BYTES = 50;
const STL_PREFIX_BYTES = STL_HEADER_BYTES + STL_TRIANGLE_COUNT_BYTES;

function normalFor(a: MeshPoint, b: MeshPoint, c: MeshPoint): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function writePoint(view: DataView, offset: number, point: MeshPoint) {
  view.setFloat32(offset, point[0], true);
  view.setFloat32(offset + 4, point[1], true);
  view.setFloat32(offset + 8, point[2], true);
  return offset + 12;
}

export function exportMeshesToStl(meshes: readonly StlExportMesh[]): ArrayBuffer {
  const triangleCount = meshes.reduce((count, mesh) => count + mesh.faces.length, 0);
  if (triangleCount > 0xffff_ffff) {
    throw new Error("STL export exceeds the binary format's triangle limit");
  }

  const buffer = new ArrayBuffer(STL_PREFIX_BYTES + triangleCount * STL_TRIANGLE_BYTES);
  const bytes = new Uint8Array(buffer);
  const header = new TextEncoder().encode("Binary STL (Z-up coordinates)");
  bytes.set(header.subarray(0, STL_HEADER_BYTES));

  const view = new DataView(buffer);
  view.setUint32(STL_HEADER_BYTES, triangleCount, true);
  let offset = STL_PREFIX_BYTES;

  meshes.forEach((mesh) => {
    mesh.faces.forEach(([ai, bi, ci]) => {
      const a = sketchForgeToZUp(mesh.vertices[ai]);
      const b = sketchForgeToZUp(mesh.vertices[bi]);
      const c = sketchForgeToZUp(mesh.vertices[ci]);
      const n = normalFor(a, b, c);
      offset = writePoint(view, offset, n);
      offset = writePoint(view, offset, a);
      offset = writePoint(view, offset, b);
      offset = writePoint(view, offset, c);
      view.setUint16(offset, 0, true);
      offset += 2;
    });
  });

  return buffer;
}
