import { describe, expect, it } from "vitest";
import { dedupeSketchSnapCandidates, snapSketchPoint, type SketchSnapCandidate } from "@/lib/sketchSnapping";

const candidates: SketchSnapCandidate[] = [
  { id: "point-a", kind: "point", label: "Endpoint", x: 12, z: 8 },
  { id: "center-a", kind: "center", label: "Center", x: 30, z: 20 },
];

function snap(raw: { x: number; z: number }, patch: Partial<Parameters<typeof snapSketchPoint>[1]> = {}) {
  return snapSketchPoint(raw, {
    precisionStep: 1,
    gridStep: 5,
    tolerance: 0.75,
    snapToGridLines: true,
    snapToGeometry: true,
    candidates,
    ...patch,
  });
}

describe("sketch snapping", () => {
  it("prioritizes exact geometry anchors over grid lines", () => {
    expect(snap({ x: 30.4, z: 20.2 })).toEqual({ x: 30, z: 20, snap: { kind: "center", label: "Center" } });
  });

  it("magnetically snaps individual axes to visible grid lines", () => {
    expect(snap({ x: 10.3, z: 12.2 }, { snapToGeometry: false })).toEqual({
      x: 10,
      z: 12,
      snap: { kind: "grid", label: "Grid line", xGuide: 10 },
    });
  });

  it("aligns individual axes with existing geometry", () => {
    expect(snap({ x: 12.4, z: 14.2 }, { snapToGridLines: false })).toEqual({
      x: 12,
      z: 14,
      snap: { kind: "alignment", label: "Align X: Endpoint", xGuide: 12 },
    });
  });

  it("falls back to precision snapping when magnetic modes are disabled", () => {
    expect(snap({ x: 12.4, z: 8.4 }, { snapToGridLines: false, snapToGeometry: false })).toEqual({ x: 12, z: 8 });
  });

  it("deduplicates overlapping point and center anchors", () => {
    expect(dedupeSketchSnapCandidates([
      candidates[0],
      { id: "duplicate", kind: "center", label: "Center", x: 12, z: 8 },
      candidates[1],
    ])).toEqual(candidates);
  });
});
