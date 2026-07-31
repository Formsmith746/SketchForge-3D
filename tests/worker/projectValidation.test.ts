import { describe, expect, it } from "vitest";
import { validateProjectDocument } from "../../worker/src/projectValidation";

function boxShape() {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
  };
}

describe("project document edge-treatment history validation", () => {
  it("accepts current millisecond timestamps for chamfer and fillet history", () => {
    const before = boxShape();
    const modified = {
      ...boxShape(),
      kind: "mesh",
      importedMesh: {
        positions: [
          0, 0, 0,
          20, 0, 0,
          0, 20, 0,
        ],
        baseWidth: 20,
        baseDepth: 20,
        baseHeight: 20,
        triangleCount: 1,
        sourceFormat: "json",
      },
      edgeTreatments: [{ kind: "chamfer", amount: 1, edgeCount: 1, chamferAngle: 45 }],
      edgeTreatmentHistory: [{
        id: "edge-history-1",
        createdAt: Date.now(),
        feature: { kind: "chamfer", amount: 1, edgeCount: 1, chamferAngle: 45 },
        before,
      }],
    };

    expect(validateProjectDocument({
      formatVersion: 1,
      shapes: [modified],
      workspace: null,
      snap: null,
    })).toEqual({ valid: true });
  });

  it("rejects negative, fractional, and out-of-range timestamps", () => {
    for (const createdAt of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const modified = {
        ...boxShape(),
        edgeTreatmentHistory: [{
          id: "edge-history-1",
          createdAt,
          feature: { kind: "fillet", amount: 1, edgeCount: 1 },
          before: boxShape(),
        }],
      };

      expect(validateProjectDocument({
        formatVersion: 1,
        shapes: [modified],
        workspace: null,
        snap: null,
      })).toEqual({ valid: false, reason: "INVALID_SHAPE" });
    }
  });
});
