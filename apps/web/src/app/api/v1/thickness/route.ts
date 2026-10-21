import { apiContext, apiError, apiErrors, apiJson, apiTarget } from "@/lib/apiV1";
import { readProjectDocument } from "@/lib/engine/serverProjectDocument";
import { wallThickness } from "@constructorfleet/sketchforge-engine/serverCadThickness";
import { ServerCadError } from "@constructorfleet/sketchforge-engine/serverCadOperations";
import { apiReadOnlyOptions } from "@/lib/apiV1Methods";

export const runtime = "nodejs";
export const revalidate = false;

/** Estimate the thinnest wall by sampling opposing surface pairs. */
export async function GET(request: Request) {
  const context = await apiContext(request);
  if (context.error) return context.error;
  const { projectId, shapeId } = apiTarget(request);
  if (!projectId) return apiErrors.invalidProjectId();
  if (!shapeId) return apiErrors.shapeIdRequired();
  const document = await readProjectDocument(context.root, projectId);
  if (!document) return apiErrors.projectNotFound();
  const shape = document.shapes.find((candidate) => candidate.id === shapeId);
  if (!shape) return apiError(`Shape ${shapeId} is not in the project.`, 404, "shape_not_found");
  try {
    return apiJson({ thickness: await wallThickness(shape) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Wall thickness could not be estimated.", error instanceof ServerCadError ? error.status : 422, "geometry_failed");
  }
}

export const OPTIONS = apiReadOnlyOptions;
