import { describe, expect, it } from "vitest";
import { WORKPLANE_CENTER, workplaneCenteringOffset, type WorkplanePlanarBounds } from "@/lib/workplaneCentering";

function bounds(minX: number, maxX: number, minZ: number, maxZ: number): WorkplanePlanarBounds {
  return { minX, maxX, minZ, maxZ };
}

describe("workplane centering offset", () => {
  it("moves an off-center bounding box onto the middle of the build plate", () => {
    const offset = workplaneCenteringOffset(bounds(10, 30, -50, -30));

    expect(offset).not.toBeNull();
    expect(offset?.x).toBeCloseTo(-20, 10);
    expect(offset?.z).toBeCloseTo(40, 10);
  });

  it("centers the bounding box itself, not the near corner", () => {
    // A 30 mm wide box sitting between 0 and 30 has to move back by half its width.
    const offset = workplaneCenteringOffset(bounds(0, 30, 0, 12));

    expect(offset?.x).toBeCloseTo(-15, 10);
    expect(offset?.z).toBeCloseTo(-6, 10);
  });

  it("reports no movement for a selection that already sits in the middle", () => {
    const offset = workplaneCenteringOffset(bounds(-12, 12, -8, 8));

    expect(offset).toEqual(WORKPLANE_CENTER);
  });

  it("leaves an asymmetric selection centered on its extents", () => {
    const offset = workplaneCenteringOffset(bounds(-40, 10, -5, 45));
    const centered = {
      minX: -40 + (offset?.x ?? 0),
      maxX: 10 + (offset?.x ?? 0),
      minZ: -5 + (offset?.z ?? 0),
      maxZ: 45 + (offset?.z ?? 0),
    };

    expect(centered.minX + centered.maxX).toBeCloseTo(0, 10);
    expect(centered.minZ + centered.maxZ).toBeCloseTo(0, 10);
  });

  it("refuses bounds that cannot be measured instead of moving objects by NaN", () => {
    expect(workplaneCenteringOffset(bounds(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 0))).toBeNull();
    expect(workplaneCenteringOffset(bounds(Number.NaN, 10, 0, 10))).toBeNull();
    expect(workplaneCenteringOffset(bounds(20, 10, 0, 10))).toBeNull();
    expect(workplaneCenteringOffset(bounds(0, 10, 20, 10))).toBeNull();
  });
});
