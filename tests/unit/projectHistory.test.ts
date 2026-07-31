import { describe, expect, it } from "vitest";
import {
  appendProjectHistory,
  MAX_PERSISTED_HISTORY_ENTRIES,
  normalizeProjectHistory,
} from "@/lib/projectHistory";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(id: string, x = 0): WorkplaneShape {
  return {
    id,
    name: id,
    kind: "box",
    color: "#d41721",
    x,
    z: 0,
    size: 10,
    width: 10,
    depth: 10,
    height: 10,
    rotation: 0,
  };
}

describe("persistent project history", () => {
  it("restores a saved undo and redo position", () => {
    const first = [box("box", 0)];
    const second = [box("box", 10)];
    const third = [box("box", 20)];

    const restored = normalizeProjectHistory(second, [first, second, third], 1);

    expect(restored.index).toBe(1);
    expect(restored.entries[0][0].x).toBe(0);
    expect(restored.entries[2][0].x).toBe(20);
  });

  it("uses the loaded shapes as the initial undo baseline for legacy projects", () => {
    const current = [box("box", 7)];
    const restored = normalizeProjectHistory(current, undefined, undefined);

    expect(restored).toMatchObject({ index: 0, entries: [[{ id: "box", x: 7 }]] });
  });

  it("drops the redo branch and bounds retained snapshots", () => {
    let history = normalizeProjectHistory([box("box", 0)], undefined, undefined);
    for (let x = 1; x <= MAX_PERSISTED_HISTORY_ENTRIES + 5; x += 1) {
      history = appendProjectHistory(history, [box("box", x)]);
    }
    expect(history.entries).toHaveLength(MAX_PERSISTED_HISTORY_ENTRIES);
    expect(history.index).toBe(MAX_PERSISTED_HISTORY_ENTRIES - 1);

    const undone = { entries: history.entries, index: history.index - 2 };
    const branched = appendProjectHistory(undone, [box("box", 999)]);
    expect(branched.entries.at(-1)?.[0].x).toBe(999);
    expect(branched.entries.some((snapshot) => snapshot[0].x === MAX_PERSISTED_HISTORY_ENTRIES + 5)).toBe(false);
  });
});
