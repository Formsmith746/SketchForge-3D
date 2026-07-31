import { describe, expect, it } from "vitest";
import {
  CAD_MODIFIER_MAX_SHARP_ANGLE,
  CAD_MODIFIER_REQUEST_TIMEOUT_MS,
  CAD_MODIFIER_RUNTIME_BASE,
  cadModifierTopologyEdgeIsSelectable,
  cadTransformRequiresGeneralTransform,
  cadModifierTimeoutMessage,
  defaultCadModifierTangentChain,
  edgeModifierSelectionStatus,
  isCadModifierWasmMemoryFault,
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

  it("sets a bounded preparation wait and an actionable compatibility error", () => {
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(cadModifierTimeoutMessage("prepare")).toContain("Firefox 121+");
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
});
