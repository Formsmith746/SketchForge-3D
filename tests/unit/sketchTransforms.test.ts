import { describe, expect, it } from "vitest";
import {
  applyAffineTransform,
  normalizeSketchTransformSelection,
  reflectionTransform,
  rotationTransform,
  transformSketchSelection,
  translationTransform,
  type SketchTransformSelection,
} from "@/lib/sketchTransforms";
import type { SketchProfile } from "@/types/sketchforge";

const emptySelection = (): SketchTransformSelection => ({ pointIds: [], segmentIds: [], imageIds: [], textIds: [] });

function sequentialIds() {
  let next = 0;
  return (prefix: string) => `${prefix}-${++next}`;
}

function lineProfile(): SketchProfile {
  return {
    points: [
      { id: "a", x: 1, z: 2, mode: "smooth", handleIn: { x: 0, z: 2 }, handleOut: { x: 2, z: 2 } },
      { id: "b", x: 5, z: 2 },
      { id: "unused", x: 20, z: 20 },
    ],
    segments: [{ id: "ab", startId: "a", endId: "b", kind: "bezier" }],
    constraints: [
      { id: "fixed-a", kind: "fixed", pointId: "a", x: 1, z: 2 },
      { id: "horizontal-ab", kind: "horizontal", segmentId: "ab" },
      { id: "fixed-unused", kind: "fixed", pointId: "unused", x: 20, z: 20 },
    ],
    dimensions: [{ id: "length-ab", kind: "length", segmentId: "ab", value: 4 }],
  };
}

describe("sketch selection transforms", () => {
  it("normalizes selected segments to their endpoints and discards unknown IDs", () => {
    const selection = { ...emptySelection(), pointIds: ["unused", "missing"], segmentIds: ["ab", "missing"] };

    expect(normalizeSketchTransformSelection(lineProfile(), selection)).toEqual({
      pointIds: ["a", "b", "unused"],
      segmentIds: ["ab"],
      imageIds: [],
      textIds: [],
    });
  });

  it("copies IDs, rewrites references, transforms Bezier handles, and copies only targeted parameters", () => {
    const source = lineProfile();
    const result = transformSketchSelection(
      source,
      { ...emptySelection(), segmentIds: ["ab"] },
      [translationTransform(10, -3)],
      sequentialIds(),
    );

    expect(source.points[0]).toMatchObject({ id: "a", x: 1, z: 2 });
    expect(result.selection).toEqual({
      pointIds: ["sketch-point-1", "sketch-point-2"],
      segmentIds: ["sketch-segment-3"],
      imageIds: [],
      textIds: [],
    });
    expect(result.profile.points.slice(-2)).toEqual([
      {
        id: "sketch-point-1",
        x: 11,
        z: -1,
        mode: "smooth",
        handleIn: { x: 10, z: -1 },
        handleOut: { x: 12, z: -1 },
      },
      { id: "sketch-point-2", x: 15, z: -1, handleIn: undefined, handleOut: undefined },
    ]);
    expect(result.profile.segments.at(-1)).toEqual({
      id: "sketch-segment-3",
      startId: "sketch-point-1",
      endId: "sketch-point-2",
      kind: "bezier",
    });
    expect(result.profile.constraints?.slice(-2)).toEqual([
      { id: "sketch-fixed-4", kind: "fixed", pointId: "sketch-point-1", x: 11, z: -1 },
      { id: "sketch-horizontal-5", kind: "horizontal", segmentId: "sketch-segment-3" },
    ]);
    expect(result.profile.constraints?.some((constraint) => constraint.id === "fixed-unused-6")).toBe(false);
    expect(result.profile.dimensions?.at(-1)).toEqual({
      id: "sketch-length-6",
      kind: "length",
      segmentId: "sketch-segment-3",
      value: 4,
    });
  });

  it("reflects geometry about an offset line and swaps or preserves axis constraints", () => {
    const profile: SketchProfile = {
      points: [
        { id: "a", x: 2, z: 1 },
        { id: "b", x: 4, z: 1 },
        { id: "c", x: 2, z: 3 },
      ],
      segments: [
        { id: "horizontal", startId: "a", endId: "b", kind: "line" },
        { id: "vertical", startId: "a", endId: "c", kind: "line" },
      ],
      constraints: [
        { id: "h", kind: "horizontal", segmentId: "horizontal" },
        { id: "v", kind: "vertical", segmentId: "vertical" },
      ],
    };
    const diagonal = reflectionTransform({ x: 1, z: 0 }, { x: 2, z: 1 });
    const selection = { ...emptySelection(), segmentIds: ["horizontal", "vertical"] };
    const result = transformSketchSelection(profile, selection, [diagonal], sequentialIds());

    const pointOnLine = applyAffineTransform(diagonal, { x: 2, z: 1 });
    expect(pointOnLine.x).toBeCloseTo(2);
    expect(pointOnLine.z).toBeCloseTo(1);
    const reflectedPoints = result.profile.points.slice(-3);
    expect(reflectedPoints[0].x).toBeCloseTo(2);
    expect(reflectedPoints[0].z).toBeCloseTo(1);
    expect(reflectedPoints[1].x).toBeCloseTo(2);
    expect(reflectedPoints[1].z).toBeCloseTo(3);
    expect(reflectedPoints[2].x).toBeCloseTo(4);
    expect(reflectedPoints[2].z).toBeCloseTo(1);
    expect(result.profile.constraints?.slice(-2).map((constraint) => constraint.kind)).toEqual(["vertical", "horizontal"]);

    const verticalMirror = reflectionTransform({ x: 1, z: 0 }, { x: 1, z: 5 });
    const preserved = transformSketchSelection(profile, selection, [verticalMirror], sequentialIds());
    expect(preserved.profile.constraints?.slice(-2).map((constraint) => constraint.kind)).toEqual(["horizontal", "vertical"]);
  });

  it("swaps axis constraints for quarter turns and drops them for arbitrary rotations and reflections", () => {
    const selection = { ...emptySelection(), segmentIds: ["ab"] };
    const quarterTurn = transformSketchSelection(lineProfile(), selection, [rotationTransform(Math.PI / 2)], sequentialIds());
    const arbitraryTurn = transformSketchSelection(lineProfile(), selection, [rotationTransform(Math.PI / 4)], sequentialIds());
    const arbitraryMirror = transformSketchSelection(
      lineProfile(),
      selection,
      [reflectionTransform({ x: 0, z: 0 }, { x: 2, z: 1 })],
      sequentialIds(),
    );

    expect(quarterTurn.profile.constraints?.at(-1)).toMatchObject({ kind: "vertical" });
    expect(arbitraryTurn.profile.constraints?.filter((constraint) => constraint.kind !== "fixed")).toHaveLength(1);
    expect(arbitraryMirror.profile.constraints?.filter((constraint) => constraint.kind !== "fixed")).toHaveLength(1);
    const transformedFixed = arbitraryTurn.profile.constraints?.at(-1);
    expect(transformedFixed).toMatchObject({ kind: "fixed" });
    if (!transformedFixed || transformedFixed.kind !== "fixed") throw new Error("Expected a copied fixed constraint");
    expect(transformedFixed.x).toBeCloseTo(-Math.SQRT1_2);
    expect(transformedFixed.z).toBeCloseTo(3 * Math.SQRT1_2);
  });

  it("transforms image centers and text anchors while preserving image size", () => {
    const profile: SketchProfile = {
      points: [],
      segments: [],
      images: [{
        id: "image",
        name: "reference.png",
        dataUrl: "data:image/png;base64,AA==",
        mimeType: "image/png",
        pixelWidth: 200,
        pixelHeight: 100,
        x: 3,
        z: 2,
        width: 20,
        depth: 10,
        opacity: 0.5,
      }],
      texts: [{ id: "text", text: "A", x: 4, z: 2, fontSize: 12 }],
    };
    const result = transformSketchSelection(
      profile,
      { ...emptySelection(), imageIds: ["image"], textIds: ["text"] },
      [rotationTransform(Math.PI / 2, { x: 2, z: 2 })],
      sequentialIds(),
    );

    expect(result.profile.images?.at(-1)).toMatchObject({ id: "sketch-image-1", x: 2, z: 3, width: 20, depth: 10, opacity: 0.5 });
    expect(result.profile.texts?.at(-1)).toMatchObject({ id: "sketch-text-2", x: 2, z: 4, text: "A", fontSize: 12 });
    expect(result.selection).toEqual({ pointIds: [], segmentIds: [], imageIds: ["sketch-image-1"], textIds: ["sketch-text-2"] });
  });

  it("appends independent copies for every pattern transform", () => {
    const source: SketchProfile = {
      points: [{ id: "point", x: 1, z: 2 }],
      segments: [],
    };
    const result = transformSketchSelection(
      source,
      { ...emptySelection(), pointIds: ["point"] },
      [translationTransform(5, 0), translationTransform(10, 0), translationTransform(15, 0)],
      sequentialIds(),
    );

    expect(result.profile.points.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 1, z: 2 },
      { x: 6, z: 2 },
      { x: 11, z: 2 },
      { x: 16, z: 2 },
    ]);
    expect(result.selection.pointIds).toEqual(["sketch-point-1", "sketch-point-2", "sketch-point-3"]);
  });

  it("transforms a moved dimension label offset with copied geometry", () => {
    const profile: SketchProfile = {
      points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 4, z: 0 }],
      segments: [{ id: "ab", startId: "a", endId: "b", kind: "line", dimensionLabelOffset: { x: 2, z: -3 } }],
    };

    const result = transformSketchSelection(
      profile,
      { ...emptySelection(), segmentIds: ["ab"] },
      [rotationTransform(Math.PI / 2)],
      sequentialIds(),
    );

    expect(result.profile.segments.at(-1)?.dimensionLabelOffset?.x).toBeCloseTo(3);
    expect(result.profile.segments.at(-1)?.dimensionLabelOffset?.z).toBeCloseTo(2);
  });
});
