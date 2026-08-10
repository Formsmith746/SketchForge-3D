import { sketchForgeToZUp, type MeshPoint } from "@/lib/meshCoordinates";

export type StlExportMesh = {
  vertices: readonly MeshPoint[];
  faces: readonly (readonly [number, number, number])[];
};

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

export function exportMeshesToStl(meshes: readonly StlExportMesh[]) {
  const lines = ["solid sketchforge_design"];
  meshes.forEach((mesh) => {
    mesh.faces.forEach(([ai, bi, ci]) => {
      const a = sketchForgeToZUp(mesh.vertices[ai]);
      const b = sketchForgeToZUp(mesh.vertices[bi]);
      const c = sketchForgeToZUp(mesh.vertices[ci]);
      const n = normalFor(a, b, c);
      lines.push(`  facet normal ${n[0]} ${n[1]} ${n[2]}`);
      lines.push("    outer loop");
      lines.push(`      vertex ${a[0]} ${a[1]} ${a[2]}`);
      lines.push(`      vertex ${b[0]} ${b[1]} ${b[2]}`);
      lines.push(`      vertex ${c[0]} ${c[1]} ${c[2]}`);
      lines.push("    endloop");
      lines.push("  endfacet");
    });
  });
  lines.push("endsolid sketchforge_design");
  return lines.join("\n");
}
