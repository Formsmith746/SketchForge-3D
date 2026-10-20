import { describe, expect, it } from "vitest";
import { importExtensionSupported } from "@/lib/importExtensions";

describe("importExtensionSupported", () => {
  it("accepts STL, OBJ, and SVG imports", () => {
    expect(importExtensionSupported("part.stl")).toBe(true);
    expect(importExtensionSupported("assembly.obj")).toBe(true);
    expect(importExtensionSupported("MODEL.OBJ")).toBe(true);
    expect(importExtensionSupported("logo.svg")).toBe(true);
    expect(importExtensionSupported("profile.SVG")).toBe(true);
  });

  it("rejects unsupported dashboard import extensions", () => {
    expect(importExtensionSupported("drawing.png")).toBe(false);
    expect(importExtensionSupported("assembly.step")).toBe(false);
  });
});
