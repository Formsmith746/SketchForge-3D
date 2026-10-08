// Imported by the CAD modifier worker: use only "@/i18n/LocalizedError" here, never "@/i18n" (it pulls React into the worker).
// Type-only imports from other i18n modules are erased and safe.
import { LocalizedError } from "@/i18n/LocalizedError";
import type { MessageParams } from "@/i18n/locales";
import type { MessageKey } from "@/i18n/locales";
import type { CadModifierEdge } from "@/lib/cadModifierTypes";

export const CAD_MODIFIER_RUNTIME_BASE = "/occt";
export const CAD_MODIFIER_REQUEST_TIMEOUT_MS = 30_000;
export const CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS = 180_000;
export const CAD_MODIFIER_MAX_SHARP_ANGLE = 90;

export type CadModifierRequestPhase = "prepare" | "preview";

export function cadTransformRequiresGeneralTransform(transform: number[]) {
  if (transform.length !== 12 || !transform.every(Number.isFinite)) {
    return false;
  }

  const x = [transform[0], transform[4], transform[8]];
  const y = [transform[1], transform[5], transform[9]];
  const z = [transform[2], transform[6], transform[10]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const xLengthSquared = dot(x, x);
  const yLengthSquared = dot(y, y);
  const zLengthSquared = dot(z, z);
  const scaleSquared = Math.max(xLengthSquared, yLengthSquared, zLengthSquared);
  if (scaleSquared <= 1e-18) {
    return true;
  }

  const tolerance = scaleSquared * 1e-9;
  return (
    Math.abs(dot(x, y)) > tolerance ||
    Math.abs(dot(x, z)) > tolerance ||
    Math.abs(dot(y, z)) > tolerance ||
    Math.abs(xLengthSquared - yLengthSquared) > tolerance ||
    Math.abs(xLengthSquared - zLengthSquared) > tolerance ||
    Math.abs(yLengthSquared - zLengthSquared) > tolerance
  );
}

export function isCadModifierWasmMemoryFault(message: string, errorName = "") {
  return (
    /memory access out of bounds|out of bounds memory access|\babort(?:ed)?\b/i.test(message) ||
    /^(?:WebAssembly\.)?RuntimeError$/i.test(errorName)
  );
}

export function defaultCadModifierTangentChain(appliedFeatureCount: number) {
  return appliedFeatureCount === 0;
}

export function cadModifierTopologyEdgeIsSelectable(
  edge: Pick<CadModifierEdge, "manifold" | "boundary" | "points">,
) {
  return edge.manifold && !edge.boundary && edge.points.length >= 6;
}

export function selectableCadModifierEdge(
  edge: Pick<CadModifierEdge, "display" | "selectable" | "manifold" | "boundary" | "angle">,
  sharpAngle: number,
) {
  return edge.selectable && edge.manifold && !edge.boundary && edge.angle + 1e-3 >= sharpAngle;
}

/** English only; the edge modifier panel shows `edgeModifierSelectionMessage` through the catalog. */
export type EdgeModifierSelectionMessage = { key: MessageKey; params?: MessageParams };

/** Panel status as a catalog message: "Preparing edges…" until edges are ready (never "0 of 0"), then the selected count. */
export function edgeModifierSelectionMessage(prepared: boolean, selectedCount: number, availableCount: number): EdgeModifierSelectionMessage {
  return prepared
    ? { key: "panels.edgeModifier.status.selected", params: { selected: selectedCount, count: availableCount } }
    : { key: "panels.edgeModifier.status.preparing" };
}

export function cadModifierPrepareTimeoutMs(meshTriangleCount: number) {
  if (!Number.isFinite(meshTriangleCount) || meshTriangleCount <= 0) {
    return CAD_MODIFIER_REQUEST_TIMEOUT_MS;
  }
  const normalizedTriangleCount = Math.max(0, Math.floor(meshTriangleCount));
  const meshPreparationBudget = 45_000 + normalizedTriangleCount * 0.75;
  return Math.min(
    CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS,
    Math.max(60_000, Math.ceil(meshPreparationBudget)),
  );
}

/** Show with `errorText`. */
export function cadModifierTimeoutError(phase: CadModifierRequestPhase) {
  return new LocalizedError(phase === "preview" ? "errors.cadModifier.previewTimeout" : "errors.cadModifier.prepareTimeout");
}

/** Show with `errorText`. */
export function cadModifierWorkerFailureError() {
  return new LocalizedError("errors.cadModifier.workerFailed");
}
