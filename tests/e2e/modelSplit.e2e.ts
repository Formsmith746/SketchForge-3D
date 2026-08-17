import { describe, expect, it } from "vitest";
import Module from "manifold-3d";
import { unionSplitManifoldComponents, type ManifoldSolid } from "@/lib/manifoldSplit";

function dispose(values: unknown[]) {
  Array.from(new Set(values)).forEach((value) => (value as { delete?: () => void })?.delete?.());
}

describe("model split topology (real Manifold kernel)", () => {
  it("unions overlapping closed components before splitting", async () => {
    const runtime = await Module();
    runtime.setup();
    const created: ManifoldSolid[] = [];
    const left = runtime.Manifold.cube([20, 20, 20], true).translate([-5, 0, 0]);
    const right = runtime.Manifold.cube([20, 20, 20], true).translate([5, 0, 0]);
    created.push(left, right);

    const vertProperties: number[] = [];
    const triVerts: number[] = [];
    for (const solid of [left, right]) {
      const mesh = solid.getMesh();
      const vertexOffset = vertProperties.length / 3;
      for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
        const offset = vertex * mesh.numProp;
        vertProperties.push(mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]);
      }
      for (const index of mesh.triVerts) triVerts.push(vertexOffset + index);
    }
    const aggregateMesh = new runtime.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(vertProperties),
      triVerts: new Uint32Array(triVerts),
      tolerance: 0.0001,
    });
    aggregateMesh.merge();
    const aggregate = runtime.Manifold.ofMesh(aggregateMesh);
    created.push(aggregate);
    const aggregateComponents = aggregate.decompose();
    created.push(...aggregateComponents);
    expect(aggregateComponents).toHaveLength(2);
    expect(aggregate.volume()).toBeCloseTo(16_000, 5);

    const normalized = unionSplitManifoldComponents(runtime, aggregate);
    created.push(...normalized.created);
    expect(normalized.solid?.volume()).toBeCloseTo(12_000, 5);
    const [positive, negative] = normalized.solid?.splitByPlane([1, 0, 0], 0) ?? [];
    if (positive) created.push(positive);
    if (negative) created.push(negative);
    expect(positive?.status()).toBe("NoError");
    expect(negative?.status()).toBe("NoError");
    expect(positive?.volume()).toBeCloseTo(6_000, 5);
    expect(negative?.volume()).toBeCloseTo(6_000, 5);

    const negativeMesh = negative?.getMesh();
    const flattenedPositions: number[] = [];
    if (negativeMesh) {
      for (const vertex of negativeMesh.triVerts) {
        const offset = vertex * negativeMesh.numProp;
        flattenedPositions.push(
          negativeMesh.vertProperties[offset],
          negativeMesh.vertProperties[offset + 1],
          negativeMesh.vertProperties[offset + 2],
        );
      }
    }
    const flattenedMesh = new runtime.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(flattenedPositions),
      triVerts: new Uint32Array(flattenedPositions.length / 3).map((_, index) => index),
      tolerance: 0.0001,
    });
    flattenedMesh.merge();
    const restoredHalf = runtime.Manifold.ofMesh(flattenedMesh);
    created.push(restoredHalf);
    const restoredNormalized = unionSplitManifoldComponents(runtime, restoredHalf);
    created.push(...restoredNormalized.created);
    const [front, back] = restoredNormalized.solid?.splitByPlane([0, 0, 1], 0) ?? [];
    if (front) created.push(front);
    if (back) created.push(back);
    expect(front?.status()).toBe("NoError");
    expect(back?.status()).toBe("NoError");
    expect(front?.volume()).toBeCloseTo(3_000, 5);
    expect(back?.volume()).toBeCloseTo(3_000, 5);
    dispose(created);
  });
});
