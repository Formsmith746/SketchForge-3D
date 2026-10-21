import { apiEngine, apiEngineError } from "@/lib/apiEngine";
import { apiContext, apiErrors, apiJson, apiTarget } from "@/lib/apiV1";
import { apiShapeSummary } from "@/lib/apiShapes";

export const runtime = "nodejs";
export const revalidate = false;

/** Turn one imported STEP assembly into separate exact solids. */
export async function POST(request: Request) {
  const context = await apiContext(request);
  if (context.error) return context.error;
  const { projectId, shapeId } = apiTarget(request);
  if (!projectId) return apiErrors.invalidProjectId();
  if (!shapeId) return apiErrors.shapeIdRequired();
  const result = await apiEngine(context.root).explode(projectId, shapeId);
  if (!result.ok) return apiEngineError(result.failure, { oneShape: true, cadFailed: "The STEP assembly could not be exploded." });
  return apiJson({ shapes: result.value.shapes.map(apiShapeSummary), revision: result.value.revision });
}
