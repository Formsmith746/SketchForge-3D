import { describe, expect, it } from "vitest";
import {
  WORKPLANE_LABEL_ASPECT,
  WORKPLANE_LABEL_TEXT,
  workplaneLabelLayout,
} from "@/lib/workplaneGrid";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

// Workspace presets the editor offers, plus the extremes either side.
const SIZES: Array<[number, number]> = [
  [40, 40],
  [100, 100],
  [200, 200],
  [300, 200],
  [200, 300],
  [1000, 1000],
];

describe("workplane label layout", () => {
  it("keeps the declared aspect at every workspace size", () => {
    for (const [width, depth] of SIZES) {
      const layout = workplaneLabelLayout(width, depth);
      expect(layout.width / layout.height).toBeCloseTo(WORKPLANE_LABEL_ASPECT, 6);
    }
  });

  it("stays inside the plane it labels", () => {
    for (const [width, depth] of SIZES) {
      const layout = workplaneLabelLayout(width, depth);
      expect(layout.width).toBeLessThanOrEqual(width);
      expect(layout.height).toBeLessThanOrEqual(depth);
      // The far edge of the text must not cross the near edge of the plane.
      expect(layout.depthOffset + layout.height / 2).toBeLessThanOrEqual(depth / 2);
      expect(layout.depthOffset).toBeGreaterThan(0);
      // Nor may either end run past the left or right edge.
      expect(layout.lateralOffset - layout.width / 2).toBeGreaterThanOrEqual(-width / 2);
      expect(layout.lateralOffset + layout.width / 2).toBeLessThanOrEqual(width / 2);
    }
  });

  it("sits in the near half, not across the middle", () => {
    for (const [width, depth] of SIZES) {
      const layout = workplaneLabelLayout(width, depth);
      expect(layout.depthOffset - layout.height / 2).toBeGreaterThan(0);
    }
  });

  it("tucks into the near left corner rather than centring on the edge", () => {
    for (const [width, depth] of SIZES) {
      const layout = workplaneLabelLayout(width, depth);
      // Left of centre, and its right end stops short of the middle.
      expect(layout.lateralOffset).toBeLessThan(0);
      expect(layout.lateralOffset + layout.width / 2).toBeLessThanOrEqual(0);
    }
  });

  it("keeps the same gap from the left edge as from the near edge", () => {
    for (const [width, depth] of SIZES) {
      const layout = workplaneLabelLayout(width, depth);
      const leftGap = layout.lateralOffset - layout.width / 2 + width / 2;
      const nearGap = depth / 2 - (layout.depthOffset + layout.height / 2);
      expect(leftGap).toBeCloseTo(nearGap, 6);
    }
  });

  it("grows with the workspace but stays bounded", () => {
    const small = workplaneLabelLayout(40, 40);
    const medium = workplaneLabelLayout(200, 200);
    const large = workplaneLabelLayout(1000, 1000);
    expect(medium.height).toBeGreaterThan(small.height);
    expect(large.height).toBeGreaterThanOrEqual(medium.height);
    // Capped, so it cannot swallow a very large plane.
    expect(large.width / 1000).toBeLessThan(0.3);
  });

  it("never lets a narrow plane make the text overhang", () => {
    // A wide-but-shallow plane is the case where the aspect fights the width.
    const layout = workplaneLabelLayout(30, 400);
    expect(layout.width).toBeLessThanOrEqual(30);
  });

  it("fits the default workspace", () => {
    const layout = workplaneLabelLayout(DEFAULT_WORKPLANE_WORKSPACE.width, DEFAULT_WORKPLANE_WORKSPACE.depth);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.width).toBeLessThan(DEFAULT_WORKPLANE_WORKSPACE.width);
    expect(layout.depthOffset).toBeLessThan(DEFAULT_WORKPLANE_WORKSPACE.depth / 2);
  });

  it("returns nothing to draw for a degenerate workspace", () => {
    for (const [width, depth] of [[0, 200], [200, 0], [-5, 200], [Number.NaN, 200]] as Array<[number, number]>) {
      const layout = workplaneLabelLayout(width, depth);
      expect(layout).toEqual({ width: 0, height: 0, depthOffset: 0, lateralOffset: 0 });
    }
  });

  it("labels the plane in the language the rest of the editor uses", () => {
    expect(WORKPLANE_LABEL_TEXT).toBe("Workplane");
  });
});
