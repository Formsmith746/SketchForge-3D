import type { MeshPoint } from "@/lib/meshCoordinates";

export type ObjExportMesh = {
  name: string;
  vertices: readonly MeshPoint[];
  faces: readonly (readonly [number, number, number])[];
};

const OBJ_WELD_TOLERANCE = 0.00001;

function bucketKey(x: number, y: number, z: number) {
  return `${x}:${y}:${z}`;
}

function weldMeshVertices(mesh: ObjExportMesh) {
  const vertices: Array<[number, number, number]> = [];
  const buckets = new Map<string, number[]>();
  const remappedIndices: number[] = [];

  mesh.vertices.forEach((sourceVertex) => {
    // OBJ tools conventionally treat Y as up. Keep SketchForge's Y-up
    // coordinates here so slicers do not apply their OBJ axis conversion a
    // second time. STL is exported separately using explicit Z-up coordinates.
    const vertex: [number, number, number] = [...sourceVertex];
    const bucketX = Math.floor(vertex[0] / OBJ_WELD_TOLERANCE);
    const bucketY = Math.floor(vertex[1] / OBJ_WELD_TOLERANCE);
    const bucketZ = Math.floor(vertex[2] / OBJ_WELD_TOLERANCE);
    let weldedIndex: number | undefined;

    for (let xOffset = -1; xOffset <= 1 && weldedIndex === undefined; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1 && weldedIndex === undefined; yOffset += 1) {
        for (let zOffset = -1; zOffset <= 1 && weldedIndex === undefined; zOffset += 1) {
          const candidates = buckets.get(bucketKey(bucketX + xOffset, bucketY + yOffset, bucketZ + zOffset)) ?? [];
          weldedIndex = candidates.find((candidateIndex) => {
            const candidate = vertices[candidateIndex];
            return (
              Math.abs(candidate[0] - vertex[0]) <= OBJ_WELD_TOLERANCE &&
              Math.abs(candidate[1] - vertex[1]) <= OBJ_WELD_TOLERANCE &&
              Math.abs(candidate[2] - vertex[2]) <= OBJ_WELD_TOLERANCE
            );
          });
        }
      }
    }

    if (weldedIndex === undefined) {
      weldedIndex = vertices.length;
      vertices.push(vertex);
      const key = bucketKey(bucketX, bucketY, bucketZ);
      buckets.set(key, [...(buckets.get(key) ?? []), weldedIndex]);
    }
    remappedIndices.push(weldedIndex);
  });

  const faces = mesh.faces
    .map(([a, b, c]) => [remappedIndices[a], remappedIndices[b], remappedIndices[c]] as [number, number, number])
    .filter(([a, b, c]) => a !== b && b !== c && c !== a);

  return { vertices, faces };
}

function objNumber(value: number) {
  return Math.abs(value) < 1e-12 ? "0" : String(value);
}

export function exportMeshesToObj(meshes: readonly ObjExportMesh[]) {
  const lines = ["# SketchForge OBJ export"];
  let offset = 1;

  meshes.forEach((mesh) => {
    const welded = weldMeshVertices(mesh);
    lines.push(`o ${mesh.name}`);
    welded.vertices.forEach(([x, y, z]) => lines.push(`v ${objNumber(x)} ${objNumber(y)} ${objNumber(z)}`));
    welded.faces.forEach(([a, b, c]) => lines.push(`f ${a + offset} ${b + offset} ${c + offset}`));
    offset += welded.vertices.length;
  });

  return lines.join("\n");
}
