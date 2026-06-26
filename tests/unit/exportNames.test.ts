import { describe, expect, it } from "vitest";
import { projectExportFileName } from "@/lib/exportNames";

describe("project export filenames", () => {
  it("uses the project name for each supported export format", () => {
    expect(projectExportFileName("Gearbox Prototype", "stl")).toBe("Gearbox Prototype.stl");
    expect(projectExportFileName("Gearbox Prototype", "obj")).toBe("Gearbox Prototype.obj");
    expect(projectExportFileName("Gearbox Prototype", "step")).toBe("Gearbox Prototype.step");
  });

  it("removes filesystem-reserved characters without discarding the project name", () => {
    expect(projectExportFileName('  enclosure: v2 / final?  ', "stl")).toBe("enclosure- v2 - final-.stl");
  });

  it("falls back to a useful name when the project name cannot be used", () => {
    expect(projectExportFileName("...", "obj")).toBe("SketchForge design.obj");
  });
});
