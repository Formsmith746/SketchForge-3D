import { describe, expect, it } from "vitest";
import {
  CAD_MODIFIER_MAX_SHARP_ANGLE,
  CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS,
  CAD_MODIFIER_REQUEST_TIMEOUT_MS,
  CAD_MODIFIER_RUNTIME_BASE,
  cadModifierPrepareTimeoutMs,
  cadModifierMeshFallbackParts,
  cadModifierTopologyEdgeIsSelectable,
  cadTransformRequiresGeneralTransform,
  cadModifierTimeoutMessage,
  defaultCadModifierTangentChain,
  edgeModifierSelectionStatus,
  findCadModifierCompatibleSelection,
  fitCadModifierAmount,
  isCadModifierWasmMemoryFault,
  serializeOptionalCadModifierBreps,
  selectableCadModifierEdge,
} from "@/lib/cadModifierRuntime";

describe("CAD modifier runtime state", () => {
  it("uses the build-managed OCCT runtime", () => {
    expect(CAD_MODIFIER_RUNTIME_BASE).toBe("/occt");
  });

  it("does not report zero edges before preparation finishes", () => {
    expect(edgeModifierSelectionStatus(false, 0, 0)).toBe("Preparing edges\u2026");
    expect(edgeModifierSelectionStatus(true, 0, 0)).toBe("0 of 0 sharp edges selected");
    expect(edgeModifierSelectionStatus(true, 2, 12)).toBe("2 of 12 sharp edges selected");
  });

  it("keeps exact CAD preparation short and gives imported meshes a bounded triangle-aware budget", () => {
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(cadModifierPrepareTimeoutMs(0)).toBe(CAD_MODIFIER_REQUEST_TIMEOUT_MS);
    expect(cadModifierPrepareTimeoutMs(Number.NaN)).toBe(CAD_MODIFIER_REQUEST_TIMEOUT_MS);
    expect(cadModifierPrepareTimeoutMs(10_000)).toBe(60_000);
    expect(cadModifierPrepareTimeoutMs(100_000)).toBe(120_000);
    expect(cadModifierPrepareTimeoutMs(180_000)).toBe(CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS);
    expect(cadModifierTimeoutMessage("prepare")).toContain("lower-detail STL");
    expect(cadModifierTimeoutMessage("prepare")).not.toContain("Firefox");
  });

  it("does not expose thresholds above the worker's folded edge-angle range", () => {
    expect(CAD_MODIFIER_MAX_SHARP_ANGLE).toBe(90);
  });

  it("recognizes browser-specific WebAssembly memory fault messages", () => {
    expect(isCadModifierWasmMemoryFault("toBREP: memory access out of bounds")).toBe(true);
    expect(isCadModifierWasmMemoryFault("toBREP: Out of bounds memory access (evaluating 'func(...args)')")).toBe(true);
    expect(isCadModifierWasmMemoryFault("Unreachable code reached", "RuntimeError")).toBe(true);
    expect(isCadModifierWasmMemoryFault("The selected edges cannot be filleted together", "Error")).toBe(false);
    expect(isCadModifierWasmMemoryFault("fillet: [object WebAssembly.Exception]", "OcctError")).toBe(false);
    expect(isCadModifierWasmMemoryFault("fillet: wasm exception", "OcctError")).toBe(false);
  });

  it("routes rotated non-uniform resize transforms through OCCT's general transform", () => {
    const angle = Math.PI / 4;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedNonUniformResize = [
      2 * cosine, 0, 2 * sine, 12,
      0, 1, 0, 4,
      -sine, 0, cosine, -8,
    ];
    const rigidRotation = [
      cosine, 0, sine, 12,
      0, 1, 0, 4,
      -sine, 0, cosine, -8,
    ];

    expect(cadTransformRequiresGeneralTransform(rotatedNonUniformResize)).toBe(true);
    expect(cadTransformRequiresGeneralTransform(rigidRotation)).toBe(false);
  });

  it("does not auto-chain newly created edges after an applied edge treatment", () => {
    expect(defaultCadModifierTangentChain(0)).toBe(true);
    expect(defaultCadModifierTangentChain(1)).toBe(false);
    expect(defaultCadModifierTangentChain(2)).toBe(false);
  });

  it("keeps valid post-treatment edges selectable when normal outline display suppresses them", () => {
    const hiddenDetailEdge = {
      display: false,
      selectable: true,
      manifold: true,
      boundary: false,
      angle: 45,
      points: [0, 0, 0, 1, 0, 0],
    };

    expect(cadModifierTopologyEdgeIsSelectable(hiddenDetailEdge)).toBe(true);
    expect(selectableCadModifierEdge(hiddenDetailEdge, 25)).toBe(true);
    expect(selectableCadModifierEdge(hiddenDetailEdge, 60)).toBe(false);
  });

  it("keeps the requested edge size when the first geometry attempt succeeds", () => {
    const attempts: Array<{ amount: number; retryOrder: boolean }> = [];
    const fitted = fitCadModifierAmount(
      4,
      (amount, retryOrder) => {
        attempts.push({ amount, retryOrder });
        return { amount };
      },
      () => undefined,
    );

    expect(fitted).toEqual({ value: { amount: 4 }, amount: 4, adjusted: false });
    expect(attempts).toEqual([{ amount: 4, retryOrder: true }]);
  });

  it("finds and retains the largest tested valid size below a failed request", () => {
    const released: number[] = [];
    const fitted = fitCadModifierAmount(
      8,
      (amount) => {
        if (amount >= 5) throw new Error("invalid geometry");
        return amount;
      },
      (amount) => released.push(amount),
    );

    expect(fitted.adjusted).toBe(true);
    expect(fitted.amount).toBeGreaterThanOrEqual(4.98);
    expect(fitted.amount).toBeLessThan(5);
    expect(fitted.value).toBe(fitted.amount);
    expect(released.length).toBeGreaterThan(0);
    expect(released).not.toContain(fitted.value);
  });

  it("does not retry non-geometry failures while fitting an edge size", () => {
    let attempts = 0;
    const fatal = new Error("memory fault");

    expect(() => fitCadModifierAmount(
      8,
      () => {
        attempts += 1;
        throw fatal;
      },
      () => undefined,
      () => false,
    )).toThrow(fatal);
    expect(attempts).toBe(1);
  });

  it("probes the supported minimum when eight halvings do not find a valid size", () => {
    const attempts: number[] = [];
    const fitted = fitCadModifierAmount(
      8,
      (amount) => {
        attempts.push(amount);
        if (amount > 0.002) throw new Error("still too large");
        return amount;
      },
      () => undefined,
    );

    expect(attempts).toContain(0.001);
    expect(fitted.amount).toBe(0.002);
  });

  it("strips failed exact geometry only when a mesh fallback is available", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const meshBacked = { brep: "broken", brepTransform: [1, 0, 0, 2, 0, 1, 0, 3, 0, 0, 1, 4], positions, indices, hole: false };
    const exactOnly = { brep: "large-exact-body", hole: false };
    const primitive = { primitive: { kind: "box" as const, width: 2, depth: 3, height: 4 }, hole: false };

    const fallback = cadModifierMeshFallbackParts([meshBacked, exactOnly, primitive]);

    expect(fallback[0]).toEqual({ positions, indices, hole: false });
    expect(fallback[1]).toBe(exactOnly);
    expect(fallback[2]).toBe(primitive);
  });

  it("keeps a valid modifier result when optional B-Rep serialization traps", () => {
    const calls: string[] = [];
    const serialized = serializeOptionalCadModifierBreps(
      "result",
      ["component-a", "component-b"],
      (shape) => {
        calls.push(shape);
        if (shape === "component-a") throw new Error("toBREP: unreachable");
        return `brep:${shape}`;
      },
    );

    expect(serialized).toEqual({
      brep: undefined,
      componentBreps: [undefined, undefined],
      failed: true,
    });
    expect(calls).toEqual(["result", "component-a"]);
  });

  it("finds a near-complete compatible edge selection after a combined failure", () => {
    const released: string[] = [];
    const compatible = findCadModifierCompatibleSelection(
      [1, 2, 3],
      (candidate) => {
        if (candidate.includes(2) && candidate.includes(3)) throw new Error("incompatible corner");
        return candidate.join(",");
      },
      (value) => released.push(String(value)),
    );

    expect(compatible).toEqual([1, 3]);
    expect(released).toEqual(["1,3"]);
  });

  it("falls back to a greedy compatible edge set when no single omission is enough", () => {
    const compatible = findCadModifierCompatibleSelection(
      [1, 2, 3, 4],
      (candidate) => {
        if (candidate.length > 1) throw new Error("only isolated edges work");
        return candidate[0];
      },
      () => undefined,
    );

    expect(compatible).toEqual([1]);
  });
});
