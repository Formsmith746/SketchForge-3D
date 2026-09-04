import { describe, expect, it } from "vitest";
import { isSketchPanGesture } from "@/lib/sketchPointerControls";

describe("sketch pointer controls", () => {
  it("pans with the middle mouse button", () => {
    expect(isSketchPanGesture({ button: 1, ctrlKey: false, metaKey: false })).toBe(true);
  });

  it("pans with Ctrl or Cmd plus the right mouse button", () => {
    expect(isSketchPanGesture({ button: 2, ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSketchPanGesture({ button: 2, ctrlKey: false, metaKey: true })).toBe(true);
  });

  it("does not repurpose unmodified or primary-button input", () => {
    expect(isSketchPanGesture({ button: 2, ctrlKey: false, metaKey: false })).toBe(false);
    expect(isSketchPanGesture({ button: 0, ctrlKey: true, metaKey: false })).toBe(false);
    expect(isSketchPanGesture({ button: 0, ctrlKey: false, metaKey: true })).toBe(false);
  });
});
