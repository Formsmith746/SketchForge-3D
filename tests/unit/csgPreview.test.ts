import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Brush, Evaluator, HOLLOW_INTERSECTION } from "three-bvh-csg";

describe("cylinder cut preview", () => {
  it("keeps a padded overlapping cylinder preview bounded", () => {
    const solidGeometry = new THREE.CylinderGeometry(10, 10, 20, 96, 1);
    solidGeometry.translate(0, 10, 0);
    const holeGeometry = new THREE.CylinderGeometry(10.01, 10.01, 20.02, 96, 1);
    holeGeometry.translate(4, 10, 0);

    const solid = new Brush(solidGeometry);
    const hole = new Brush(holeGeometry);
    solid.updateMatrixWorld(true);
    hole.updateMatrixWorld(true);

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ["position", "normal"];
    const result = evaluator.evaluate(solid, hole, HOLLOW_INTERSECTION);
    const triangleCount = Math.floor((result.geometry.getAttribute("position")?.count ?? 0) / 3);

    expect(triangleCount).toBeGreaterThan(0);
    expect(triangleCount).toBeLessThan(1_000);
  });
});
