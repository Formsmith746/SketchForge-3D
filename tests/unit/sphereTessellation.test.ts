import { describe, expect, it } from "vitest";
import { sphereTessellation } from "@/lib/sphereTessellation";

describe("sphere tessellation", () => {
  it("uses the visible sphere Steps value for both rendering and boolean operands", () => {
    expect(sphereTessellation(6)).toEqual({ widthSegments: 12, heightSegments: 6 });
    expect(sphereTessellation(24)).toEqual({ widthSegments: 48, heightSegments: 24 });
    expect(sphereTessellation(64)).toEqual({ widthSegments: 128, heightSegments: 64 });
  });

  it("uses the catalog default and normalizes fractional input", () => {
    expect(sphereTessellation()).toEqual({ widthSegments: 48, heightSegments: 24 });
    expect(sphereTessellation(27.6)).toEqual({ widthSegments: 56, heightSegments: 28 });
  });
});
