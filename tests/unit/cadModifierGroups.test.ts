import { describe, expect, it } from "vitest";
import { hasOneToOneCadComponentMapping } from "@/lib/cadModifierGroups";

describe("grouped CAD modifier component tracking", () => {
  it("tracks grouped children only when every source still has one distinct CAD component", () => {
    expect(hasOneToOneCadComponentMapping(2, [0, 1])).toBe(true);
    expect(hasOneToOneCadComponentMapping(3, [2, 0, 1])).toBe(true);
  });

  it("falls back to the cumulative group body when touching parts fuse into fewer components", () => {
    expect(hasOneToOneCadComponentMapping(2, [0])).toBe(false);
    expect(hasOneToOneCadComponentMapping(2, [0, 0])).toBe(false);
  });
});
