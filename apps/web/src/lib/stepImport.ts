import type { WorkplaneShape } from "@/types/sketchforge";
import { importedShapeFromTriangleSoup } from "@/lib/stlImport";
import { loadBrepWithOcct } from "@/lib/brepKernel";

const STEP_EXTENSIONS = new Set(["step", "stp"]);

export function isStepFile(fileName: string): boolean {
  return STEP_EXTENSIONS.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

export async function importedShapeFromStep(fileName: string, buffer: ArrayBuffer): Promise<WorkplaneShape> {
  const brep = await loadBrepWithOcct();

  const imported = await brep.importSTEP(new Blob([buffer]));
  if (!imported.ok) {
    throw new Error(`Could not read STEP: ${String(imported.error.message ?? imported.error)}`);
  }

  // STEP/CAD space is Z-up; SketchForge is Y-up. Rotating −90° about X maps CAD
  // +Z (up) to SketchForge +Y — the inverse of the exporter's +90°·X. Rigid
  // kernel ops (rotate/translate) are used throughout normalization because they
  // preserve the exact geometry; a matrix transform here corrupts later export.
  const flipped = brep.rotate(imported.value, -90, { axis: [1, 0, 0] });
  const tess = brep.mesh(flipped);
  if (tess.vertices.length < 9) {
    throw new Error("STEP file has no solid geometry to import");
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const hasNormals = tess.normals.length === tess.vertices.length;
  for (let i = 0; i < tess.triangles.length; i += 1) {
    const v = tess.triangles[i] * 3;
    positions.push(tess.vertices[v], tess.vertices[v + 1], tess.vertices[v + 2]);
    if (hasNormals) {
      normals.push(tess.normals[v], tess.normals[v + 1], tess.normals[v + 2]);
    }
  }

  // importedShapeFromTriangleSoup recenters the mesh to x/z-centered, bottom at
  // y=0. Recenter the stored B-Rep by the same offset so the exact geometry and
  // the displayed mesh share one local frame, and the editor's transforms apply
  // identically to both.
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const normalized = brep.translate(flipped, [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2]);
  const exported = brep.exportSTEP(normalized);
  const stepText = exported.ok ? await exported.value.text() : undefined;

  const shape = importedShapeFromTriangleSoup(fileName, positions, hasNormals ? normals : undefined, "step");
  if (shape.importedMesh && stepText) {
    shape.importedMesh.brepStep = stepText;
  }
  return shape;
}
