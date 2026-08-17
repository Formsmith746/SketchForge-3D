import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { fitCadModifierAmount } from "@/lib/cadModifierRuntime";

async function kernel() {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  return OcctKernel.init({ wasm });
}

describe("CAD modifier size fitting (real OCCT kernel)", () => {
  it.each(["fillet", "chamfer"] as const)("fits an oversized all-edge %s to valid box geometry", async (kind) => {
    const cad = await kernel();
    const box = cad.makeBox(10, 10, 10);
    const edges = cad.getSubShapes(box, "edge");
    const fitted = fitCadModifierAmount<ShapeHandle>(
      8,
      (amount) => {
        const result = cad[kind](box, edges, amount);
        if (cad.isValid(result)) return result;
        cad.release(result);
        throw new Error("invalid edge geometry");
      },
      (shape) => cad.release(shape),
    );

    expect(fitted.adjusted).toBe(true);
    expect(fitted.amount).toBeGreaterThanOrEqual(4.9);
    expect(fitted.amount).toBeLessThan(5);
    expect(cad.isValid(fitted.value)).toBe(true);
    expect(cad.getSubShapes(fitted.value, "solid")).toHaveLength(1);
    cad.releaseAll();
  });

  it("can reconstruct a mesh after a stored B-Rep parser exception", async () => {
    const cad = await kernel();
    const box = cad.makeBox(10, 10, 10);
    const stl = cad.exportStl(box, 0.1, true);

    expect(() => cad.fromBREP("not a valid B-Rep")).toThrow();
    const imported = cad.importStl(stl);
    const faces = cad.getSubShapes(imported, "face");
    let restored = cad.sewAndSolidify(faces, 1e-5);
    restored = cad.fixShape(restored);
    if (cad.isSolid(restored)) restored = cad.healSolid(restored, 1e-5);
    restored = cad.fixFaceOrientations(restored);
    restored = cad.removeDegenerateEdges(restored);
    restored = cad.unifySameDomain(restored);

    expect(cad.isSolid(restored)).toBe(true);
    expect(cad.isValid(restored)).toBe(true);
    expect(cad.getVolume(restored)).toBeCloseTo(1000, 5);
    cad.releaseAll();
  });
});
