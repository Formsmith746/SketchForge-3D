import { describe, expect, it } from "vitest";
import {
  BRICK_SNAP_STEP,
  KEYBOARD_NUDGE_COARSE_FACTOR,
  KEYBOARD_NUDGE_FALLBACK_STEP,
  keyboardNudgeStep,
  snapGridStep,
} from "@/lib/workplaneSettings";
import type { GridSize } from "@/types/sketchforge";

const ALL_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];

describe("snap grid step", () => {
  it("reads the millimetre value out of every grid option", () => {
    expect(snapGridStep("0.1 mm")).toBeCloseTo(0.1, 10);
    expect(snapGridStep("0.25 mm")).toBeCloseTo(0.25, 10);
    expect(snapGridStep("0.5 mm")).toBeCloseTo(0.5, 10);
    expect(snapGridStep("1.0 mm")).toBeCloseTo(1, 10);
    expect(snapGridStep("2.0 mm")).toBeCloseTo(2, 10);
    expect(snapGridStep("5.0 mm")).toBeCloseTo(5, 10);
  });

  it("treats Brick as its own step and Off as no step", () => {
    expect(snapGridStep("Brick")).toBe(BRICK_SNAP_STEP);
    expect(snapGridStep("Off")).toBe(0);
  });
});

describe("keyboard nudge step", () => {
  it("moves by the snap grid so a nudge stays on the lattice a drag snaps to", () => {
    for (const size of ALL_SIZES.filter((value) => value !== "Off")) {
      expect(keyboardNudgeStep(size, false)).toBeCloseTo(snapGridStep(size), 10);
    }
  });

  it("keeps the old millimetre when the grid is off", () => {
    expect(keyboardNudgeStep("Off", false)).toBe(KEYBOARD_NUDGE_FALLBACK_STEP);
    expect(keyboardNudgeStep("Off", true)).toBe(KEYBOARD_NUDGE_FALLBACK_STEP * KEYBOARD_NUDGE_COARSE_FACTOR);
  });

  it("matches the previous behaviour at the default grid", () => {
    // The old code was a hard-coded `event.shiftKey ? 5 : 1`, and the default
    // grid is 1.0 mm, so anyone who never touched the setting sees no change.
    expect(keyboardNudgeStep("1.0 mm", false)).toBe(1);
    expect(keyboardNudgeStep("1.0 mm", true)).toBe(5);
  });

  it("keeps Shift a coarser step of the same grid", () => {
    for (const size of ALL_SIZES) {
      expect(keyboardNudgeStep(size, true)).toBeCloseTo(
        keyboardNudgeStep(size, false) * KEYBOARD_NUDGE_COARSE_FACTOR,
        10,
      );
    }
  });

  it("never returns a zero or negative step", () => {
    for (const size of ALL_SIZES) {
      expect(keyboardNudgeStep(size, false)).toBeGreaterThan(0);
      expect(keyboardNudgeStep(size, true)).toBeGreaterThan(0);
    }
  });

  it("actually follows the setting instead of one fixed distance", () => {
    // The reported bug: the step never changed, whatever the dropdown said.
    const steps = ALL_SIZES.map((size) => keyboardNudgeStep(size, false));
    expect(new Set(steps).size).toBeGreaterThan(1);
    expect(keyboardNudgeStep("5.0 mm", false)).not.toBe(keyboardNudgeStep("0.5 mm", false));
  });

  it("stays on the lattice over repeated presses", () => {
    // A shape sitting on the 5mm lattice must still be on it after nudging.
    const step = keyboardNudgeStep("5.0 mm", false);
    let position = 15;
    for (let press = 0; press < 7; press += 1) {
      position += step;
    }
    expect(position % snapGridStep("5.0 mm")).toBeCloseTo(0, 10);
  });
});
