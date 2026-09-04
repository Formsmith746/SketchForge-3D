import { describe, expect, it } from "vitest";
import {
  BASE_CONSTRUCTION_PLANE_POSE,
  principalPlanePose,
  type Vector3Tuple,
} from "@/lib/constructionPlanes";
import {
  intersectMeshWithPlane,
  projectSketchProfileToPlane,
  type SketchProjectionResult,
  type TriangleFace,
} from "@/lib/sketchProjection";
import type { SketchProfile } from "@/types/sketchforge";

function sequentialIds() {
  let next = 0;
  return (prefix: string) => `${prefix}-${++next}`;
}

function boxMesh(): { vertices: Vector3Tuple[]; faces: TriangleFace[] } {
  return {
    vertices: [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ],
    faces: [
      [0, 2, 1], [0, 3, 2],
      [4, 5, 6], [4, 6, 7],
      [0, 4, 7], [0, 7, 3],
      [1, 2, 6], [1, 6, 5],
      [0, 1, 5], [0, 5, 4],
      [3, 7, 6], [3, 6, 2],
    ],
  };
}

function expectClosedTopology(result: SketchProjectionResult) {
  const pointIds = new Set(result.points.map((point) => point.id));
  const degree = new Map(result.points.map((point) => [point.id, 0]));
  const edgeKeys = new Set<string>();
  for (const segment of result.segments) {
    expect(pointIds.has(segment.startId)).toBe(true);
    expect(pointIds.has(segment.endId)).toBe(true);
    expect(segment.startId).not.toBe(segment.endId);
    degree.set(segment.startId, degree.get(segment.startId)! + 1);
    degree.set(segment.endId, degree.get(segment.endId)! + 1);
    edgeKeys.add([segment.startId, segment.endId].sort().join(":"));
  }
  expect(edgeKeys.size).toBe(result.segments.length);
  expect([...degree.values()].every((count) => count === 2)).toBe(true);
}

function bounds(result: SketchProjectionResult) {
  return {
    minX: Math.min(...result.points.map((point) => point.x)),
    maxX: Math.max(...result.points.map((point) => point.x)),
    minZ: Math.min(...result.points.map((point) => point.z)),
    maxZ: Math.max(...result.points.map((point) => point.z)),
  };
}

describe("mesh-plane sketch projection", () => {
  it("creates a closed horizontal section through a triangulated box", () => {
    const mesh = boxMesh();
    const result = intersectMeshWithPlane(mesh.vertices, mesh.faces, principalPlanePose("xz"), sequentialIds());

    expect(bounds(result)).toEqual({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
    expect(result.points).toHaveLength(8);
    expect(result.segments).toHaveLength(8);
    expect(result.segments.every((segment) => segment.kind === "line")).toBe(true);
    expectClosedTopology(result);
  });

  it("creates a closed vertical section in target-local x/z coordinates", () => {
    const mesh = boxMesh();
    const result = intersectMeshWithPlane(mesh.vertices, mesh.faces, principalPlanePose("yz"), sequentialIds());

    expect(bounds(result)).toEqual({ minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
    expect(result.points).toHaveLength(8);
    expect(result.segments).toHaveLength(8);
    expectClosedTopology(result);
  });

  it("cancels the shared diagonal of coplanar triangles and stamps projection IDs", () => {
    const vertices: Vector3Tuple[] = [[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]];
    const result = intersectMeshWithPlane(
      vertices,
      [[0, 1, 2], [0, 2, 3]],
      BASE_CONSTRUCTION_PLANE_POSE,
      sequentialIds(),
      "section-1",
    );
    const pointById = new Map(result.points.map((point) => [point.id, point]));
    const edges = result.segments.map((segment) => {
      const start = pointById.get(segment.startId)!;
      const end = pointById.get(segment.endId)!;
      return [`${start.x},${start.z}`, `${end.x},${end.z}`].sort().join("|");
    }).sort();

    expect(result.points).toHaveLength(4);
    expect(result.segments).toHaveLength(4);
    expect(edges).toEqual(["0,0|0,2", "0,0|2,0", "0,2|2,2", "2,0|2,2"]);
    expect([...result.points, ...result.segments].every((item) => item.projectionId === "section-1")).toBe(true);
    expectClosedTopology(result);
  });

  it("deduplicates a shared edge that lies on the plane", () => {
    const vertices: Vector3Tuple[] = [[-1, 0, 0], [1, 0, 0], [0, 1, 1], [0, -1, -1]];
    const result = intersectMeshWithPlane(
      vertices,
      [[0, 1, 2], [1, 0, 3]],
      BASE_CONSTRUCTION_PLANE_POSE,
      sequentialIds(),
    );

    expect(result.points.map(({ x, z }) => ({ x, z }))).toEqual([{ x: -1, z: 0 }, { x: 1, z: 0 }]);
    expect(result.segments).toHaveLength(1);
    expect(new Set([result.segments[0].startId, result.segments[0].endId])).toEqual(
      new Set(result.points.map((point) => point.id)),
    );
  });

  it("returns an explicit empty result when the mesh does not intersect", () => {
    let idCalls = 0;
    const result = intersectMeshWithPlane(
      [[0, 2, 0], [1, 2, 0], [0, 2, 1]],
      [[0, 1, 2]],
      BASE_CONSTRUCTION_PLANE_POSE,
      () => `id-${++idCalls}`,
    );

    expect(result).toEqual({ points: [], segments: [] });
    expect(idCalls).toBe(0);
  });
});

describe("previous-sketch projection", () => {
  it("projects through identical poses with source-local translation and ignores non-geometry data", () => {
    const source: SketchProfile = {
      points: [{ id: "a", x: 1, z: 2 }, { id: "b", x: 4, z: 2 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line" }],
      constraints: [{ id: "horizontal", kind: "horizontal", segmentId: "ab" }],
      dimensions: [{ id: "length", kind: "length", segmentId: "ab", value: 3 }],
      images: [{
        id: "image", name: "reference", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png",
        pixelWidth: 1, pixelHeight: 1, x: 0, z: 0, width: 1, depth: 1,
      }],
      texts: [{ id: "text", text: "ignore", x: 0, z: 0, fontSize: 12 }],
    };
    const snapshot = structuredClone(source);
    const result = projectSketchProfileToPlane(
      source,
      BASE_CONSTRUCTION_PLANE_POSE,
      BASE_CONSTRUCTION_PLANE_POSE,
      [5, 3, -2],
      sequentialIds(),
      "previous-1",
    );

    expect(source).toEqual(snapshot);
    expect(Object.keys(result).sort()).toEqual(["points", "segments"]);
    expect(result.points.map(({ x, z }) => ({ x, z }))).toEqual([{ x: 6, z: 0 }, { x: 9, z: 0 }]);
    expect(result.segments[0]).toMatchObject({
      startId: result.points[0].id,
      endId: result.points[1].id,
      kind: "line",
      projectionId: "previous-1",
    });
    expect(result.points.every((point) => point.projectionId === "previous-1")).toBe(true);
  });

  it("filters segments that collapse under perpendicular projection without breaking remaining connectivity", () => {
    const source: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 2, z: 0 }, { id: "c", x: 2, z: 3 }],
      segments: [
        { id: "ab", startId: "a", endId: "b", kind: "line" },
        { id: "bc", startId: "b", endId: "c", kind: "line" },
      ],
    };
    const result = projectSketchProfileToPlane(
      source,
      BASE_CONSTRUCTION_PLANE_POSE,
      principalPlanePose("yz"),
      sequentialIds(),
    );

    expect(result.points.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 3, z: 0 },
    ]);
    expect(result.segments).toEqual([{
      id: "sketch-segment-4",
      startId: result.points[1].id,
      endId: result.points[2].id,
      kind: "line",
    }]);
  });

  it("transforms Bezier handles and preserves curve kinds and point modes", () => {
    const source: SketchProfile = {
      points: [
        { id: "a", x: 0, z: 0, mode: "smooth", handleIn: { x: 0, z: -1 }, handleOut: { x: 0, z: 1 } },
        { id: "b", x: 0, z: 4, mode: "split", handleIn: { x: 0, z: 3 }, handleOut: { x: 0, z: 5 } },
        { id: "c", x: 0, z: 8, handleIn: { x: 0, z: 7 } },
      ],
      segments: [
        { id: "curve-a", startId: "a", endId: "b", kind: "bezier" },
        { id: "curve-b", startId: "b", endId: "c", kind: "smooth" },
      ],
    };
    const result = projectSketchProfileToPlane(
      source,
      BASE_CONSTRUCTION_PLANE_POSE,
      principalPlanePose("yz"),
      sequentialIds(),
    );

    expect(result.points).toMatchObject([
      { x: 0, z: 0, mode: "smooth", handleIn: { x: -1, z: 0 }, handleOut: { x: 1, z: 0 } },
      { x: 4, z: 0, mode: "split", handleIn: { x: 3, z: 0 }, handleOut: { x: 5, z: 0 } },
      { x: 8, z: 0, handleIn: { x: 7, z: 0 } },
    ]);
    expect(result.segments.map((segment) => segment.kind)).toEqual(["bezier", "smooth"]);
    expect(result.segments.map(({ startId, endId }) => ({ startId, endId }))).toEqual([
      { startId: result.points[0].id, endId: result.points[1].id },
      { startId: result.points[1].id, endId: result.points[2].id },
    ]);
  });

  it("retries colliding factory values so all generated IDs are fresh", () => {
    const source: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 1, z: 0 }],
      segments: [{ id: "ab", startId: "a", endId: "b" }],
    };
    const ids = ["a", "new-a", "b", "new-b", "ab", "new-ab"];
    const result = projectSketchProfileToPlane(
      source,
      BASE_CONSTRUCTION_PLANE_POSE,
      BASE_CONSTRUCTION_PLANE_POSE,
      () => ids.shift() ?? "unused",
    );
    const generatedIds = [...result.points.map((point) => point.id), ...result.segments.map((segment) => segment.id)];

    expect(generatedIds).toEqual(["new-a", "new-b", "new-ab"]);
    expect(new Set(generatedIds).size).toBe(generatedIds.length);
    expect(generatedIds.some((id) => ["a", "b", "ab"].includes(id))).toBe(false);
  });
});
