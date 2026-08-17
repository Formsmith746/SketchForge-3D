import type { CadModifierEdge } from "@/lib/cadModifierTypes";
import type { CadModifierMeshPart } from "@/lib/cadModifierTypes";

export const CAD_MODIFIER_RUNTIME_BASE = "/occt";
export const CAD_MODIFIER_REQUEST_TIMEOUT_MS = 60_000;
export const CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS = 180_000;
export const CAD_MODIFIER_MAX_SHARP_ANGLE = 90;
export const CAD_MODIFIER_MIN_AMOUNT = 0.001;

const CAD_MODIFIER_FIT_HALVING_STEPS = 8;
const CAD_MODIFIER_FIT_REFINEMENT_STEPS = 8;

export type CadModifierRequestPhase = "prepare" | "preview";

export function cadModifierMeshFallbackParts(parts: CadModifierMeshPart[]) {
  return parts.map((part): CadModifierMeshPart => {
    if ((!part.brep && !part.step) || !part.positions || !part.indices) return part;
    return {
      positions: part.positions,
      indices: part.indices,
      hole: part.hole,
    };
  });
}

export function serializeOptionalCadModifierBreps<T>(
  result: T,
  components: T[],
  serialize: (shape: T) => string,
) {
  try {
    return {
      brep: serialize(result),
      componentBreps: components.map(serialize),
      failed: false,
    };
  } catch {
    return {
      brep: undefined,
      componentBreps: components.map(() => undefined),
      failed: true,
    };
  }
}

export type FittedCadModifierResult<T> = {
  value: T;
  amount: number;
  adjusted: boolean;
};

export function fitCadModifierAmount<T>(
  requestedAmount: number,
  attempt: (amount: number, retryOrder: boolean) => T,
  release: (value: T) => void,
  shouldRetry: (error: unknown) => boolean = () => true,
): FittedCadModifierResult<T> {
  const requested = Math.max(CAD_MODIFIER_MIN_AMOUNT, requestedAmount);
  let initialError: unknown;
  try {
    return { value: attempt(requested, true), amount: requested, adjusted: false };
  } catch (error) {
    if (!shouldRetry(error)) throw error;
    initialError = error;
  }

  const normalizedAmount = (value: number) => Math.max(
    CAD_MODIFIER_MIN_AMOUNT,
    Math.floor((value + Number.EPSILON) / CAD_MODIFIER_MIN_AMOUNT) * CAD_MODIFIER_MIN_AMOUNT,
  );
  let failedAmount = requested;
  let fitted: FittedCadModifierResult<T> | null = null;

  for (let step = 0; step < CAD_MODIFIER_FIT_HALVING_STEPS; step += 1) {
    const candidateAmount = normalizedAmount(failedAmount / 2);
    if (candidateAmount >= failedAmount - Number.EPSILON) break;
    try {
      fitted = { value: attempt(candidateAmount, true), amount: candidateAmount, adjusted: true };
      break;
    } catch (error) {
      if (!shouldRetry(error)) throw error;
      failedAmount = candidateAmount;
      if (candidateAmount <= CAD_MODIFIER_MIN_AMOUNT) break;
    }
  }

  if (!fitted && failedAmount > CAD_MODIFIER_MIN_AMOUNT) {
    try {
      fitted = {
        value: attempt(CAD_MODIFIER_MIN_AMOUNT, true),
        amount: CAD_MODIFIER_MIN_AMOUNT,
        adjusted: true,
      };
    } catch (error) {
      if (!shouldRetry(error)) throw error;
    }
  }

  if (!fitted) throw initialError;

  for (let step = 0; step < CAD_MODIFIER_FIT_REFINEMENT_STEPS; step += 1) {
    const candidateAmount = normalizedAmount((fitted.amount + failedAmount) / 2);
    if (candidateAmount <= fitted.amount || candidateAmount >= failedAmount) break;
    try {
      const value = attempt(candidateAmount, true);
      release(fitted.value);
      fitted = { value, amount: candidateAmount, adjusted: true };
    } catch (error) {
      if (!shouldRetry(error)) {
        release(fitted.value);
        throw error;
      }
      failedAmount = candidateAmount;
    }
  }

  return fitted;
}

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

export function edgeModifierSelectionStatus(prepared: boolean, selectedCount: number, availableCount: number) {
  return prepared ? `${selectedCount} of ${availableCount} sharp edges selected` : "Preparing edges\u2026";
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

export function cadModifierTimeoutMessage(phase: CadModifierRequestPhase) {
  if (phase === "preview") {
    return "The edge preview timed out. Cancel the tool and try again.";
  }
  return "Edge preparation timed out. This mesh needs more CAD processing than the interactive limit allows. Try a repaired or lower-detail STL.";
}

export function cadModifierWorkerFailureMessage() {
  return "The CAD worker could not start. Update to Firefox 121+, Chrome/Brave 114+, or Safari 17.2+, then try again.";
}
