import { describe, expect, it } from "vitest";
import { CAD_TEST_TIMEOUT_MS } from "./support/cadTestTimeout";
import { shapeFromRequest } from "@constructorfleet/sketchforge-engine/shapeRequests";
import { wallThickness } from "@constructorfleet/sketchforge-engine/serverCadThickness";

describe("sampled wall thickness", { timeout: CAD_TEST_TIMEOUT_MS }, () => {
  it("reports the known wall between opposite faces of a rectangular solid", async () => {
    const shape = shapeFromRequest({ kind: "box", width: 20, depth: 12, height: 8 });
    await expect(wallThickness(shape)).resolves.toMatchObject({
      minimum: 8,
      unit: "mm",
      method: "sampled-opposing-surface-distance",
      samplesPerFace: 25,
      facesChecked: 6,
    });
  });
});
