import { describe, expect, it } from "vitest";
import {
  GEOMETRY_TOOLBAR_GROUPS,
  TOOLBAR_ACTION_LABEL_MIN_WIDTH,
  TOOLBAR_DENSITIES,
  TOOLBAR_DENSITY_METRICS,
  TOOLBAR_TITLE_ROW_MIN_WIDTH,
  geometryToolbarRowWidth,
  toolbarDensityStyle,
  toolbarLayoutForWidth,
  toolbarMenuAnchor,
  toolbarSectionWidth,
} from "@/lib/toolbarLayout";

// The two widths the whole design turns on. Written out here rather than
// imported so a change to the metrics has to be agreed to twice: once in the
// module, once against the number quoted in the changelog and the issue.
const COMFORTABLE_FIT = 1081;
const COMPACT_FIT = 897;

describe("toolbar section widths", () => {
  it("sizes a section to its row of buttons", () => {
    expect(toolbarSectionWidth(5, "comfortable")).toBe(5 * 43 + 6);
    expect(toolbarSectionWidth(5, "compact")).toBe(5 * 37 + 6);
  });

  // A one-button section is narrower than the word above it, so it is the
  // minimum that decides, not the button.
  it("holds a thin section open to its minimum", () => {
    expect(toolbarSectionWidth(1, "comfortable")).toBe(88);
    expect(toolbarSectionWidth(1, "compact")).toBe(56);
  });

  it("takes the larger of the two, either way round", () => {
    // Two buttons clear the comfortable minimum; one does not.
    expect(toolbarSectionWidth(2, "comfortable")).toBe(92);
    expect(toolbarSectionWidth(1, "comfortable")).toBe(88);
  });

  it("keeps the artwork inside the button at every density", () => {
    for (const density of TOOLBAR_DENSITIES) {
      const metrics = TOOLBAR_DENSITY_METRICS[density];
      expect(metrics.iconSize).toBeLessThanOrEqual(metrics.buttonSize);
    }
  });
});

describe("geometry ribbon width", () => {
  it("is the measured width the breakpoints are derived from", () => {
    expect(geometryToolbarRowWidth("comfortable")).toBe(COMFORTABLE_FIT);
    expect(geometryToolbarRowWidth("compact")).toBe(COMPACT_FIT);
  });

  it("drops the nav group's rule along with the Home button", () => {
    const home = toolbarSectionWidth(1, "comfortable");
    expect(geometryToolbarRowWidth("comfortable", { hasHomeButton: false })).toBe(COMFORTABLE_FIT - home - 1);
    expect(geometryToolbarRowWidth("comfortable", { hasHomeButton: true })).toBe(COMFORTABLE_FIT);
  });

  it("is narrower compact than comfortable, by enough to matter", () => {
    expect(COMFORTABLE_FIT - COMPACT_FIT).toBeGreaterThan(150);
  });

  // The sum is only trustworthy if it counts what the component renders.
  it("counts every button in the ribbon", () => {
    const buttons = GEOMETRY_TOOLBAR_GROUPS.flatMap((group) => group.sections).reduce((sum, section) => sum + section.buttons, 0);
    expect(buttons).toBe(22);
  });
});

describe("toolbar layout for a width", () => {
  it("stays comfortable in a window wide enough for the full ribbon", () => {
    expect(toolbarLayoutForWidth(1440)).toMatchObject({ density: "comfortable", toolsOverflow: false, showActionLabels: true });
  });

  // Either side of the step, not at it: at the boundary both answers agree on
  // everything except the one field under test.
  it("steps to compact one pixel below the comfortable fit", () => {
    expect(toolbarLayoutForWidth(COMFORTABLE_FIT).density).toBe("comfortable");
    expect(toolbarLayoutForWidth(COMFORTABLE_FIT - 1).density).toBe("compact");
  });

  it("fits the compact ribbon without scrolling down to its own width", () => {
    expect(toolbarLayoutForWidth(COMPACT_FIT)).toMatchObject({ density: "compact", toolsOverflow: false });
    expect(toolbarLayoutForWidth(COMPACT_FIT - 1)).toMatchObject({ density: "compact", toolsOverflow: true });
  });

  // The window the issue is about. A 1000px window showed no Import or Export
  // at all before, and no scrollbar to reach them with.
  it("covers the band the report is about", () => {
    expect(toolbarLayoutForWidth(1000)).toMatchObject({ density: "compact", toolsOverflow: false, showActionLabels: true });
  });

  // A 900px desktop window is the case most likely to be forgotten.
  it("degrades a 900px window to a scrolling ribbon, not a clipped one", () => {
    expect(toolbarLayoutForWidth(900)).toMatchObject({ density: "compact", toolsOverflow: false });
    expect(toolbarLayoutForWidth(900, { hasHomeButton: false }).toolsOverflow).toBe(false);
  });

  it("keeps the action labels until the title row would overflow", () => {
    expect(toolbarLayoutForWidth(TOOLBAR_ACTION_LABEL_MIN_WIDTH).showActionLabels).toBe(true);
    expect(toolbarLayoutForWidth(TOOLBAR_ACTION_LABEL_MIN_WIDTH - 1).showActionLabels).toBe(false);
  });

  it("leaves room for the icon-only title row below the labelled one", () => {
    expect(TOOLBAR_TITLE_ROW_MIN_WIDTH).toBeLessThan(TOOLBAR_ACTION_LABEL_MIN_WIDTH);
    // A phone-width browser window still reaches the actions.
    expect(TOOLBAR_TITLE_ROW_MIN_WIDTH).toBeLessThanOrEqual(360);
  });

  // An unmeasured width is a server render, not a 0px window. Guessing wide
  // costs one frame on a narrow screen; guessing narrow costs one on every
  // desktop.
  it("assumes room when it has not been told the width", () => {
    for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(toolbarLayoutForWidth(width)).toMatchObject({ density: "comfortable", toolsOverflow: false, showActionLabels: true });
    }
  });

  it("gives a narrower window the same answer whether or not Home is there", () => {
    // Without the Home button the ribbon fits in less, so the step moves with it.
    const fit = geometryToolbarRowWidth("comfortable", { hasHomeButton: false });
    expect(toolbarLayoutForWidth(fit, { hasHomeButton: false }).density).toBe("comfortable");
    expect(toolbarLayoutForWidth(fit).density).toBe("compact");
  });
});

describe("toolbar menu anchor", () => {
  const trigger = { triggerLeft: 300, triggerWidth: 92, triggerBottom: 108, viewportWidth: 1440, menuWidth: 244 };

  it("lines a menu up with its control and sits below it", () => {
    expect(toolbarMenuAnchor({ ...trigger, gap: 0 })).toEqual({ top: 108, left: 300 });
    expect(toolbarMenuAnchor({ ...trigger, gap: 8 })).toEqual({ top: 116, left: 300 });
  });

  // Flush against the control is a deliberate choice at a couple of call sites,
  // not the default, so the default has to be the one that leaves a gap.
  it("leaves a gap by default", () => {
    expect(toolbarMenuAnchor(trigger)).toEqual({ top: 116, left: 300 });
  });

  it("centres under the control when asked", () => {
    expect(toolbarMenuAnchor({ ...trigger, align: "center" }).left).toBe(300 + 46 - 122);
  });

  // A control near the right edge: the menu slides left rather than opening
  // past the edge of the window, where it could be neither read nor dismissed.
  it("keeps a menu inside the right edge", () => {
    expect(toolbarMenuAnchor({ ...trigger, triggerLeft: 1380, viewportWidth: 1440 }).left).toBe(1440 - 244 - 12);
  });

  it("keeps the gutter when the window is narrower than the menu", () => {
    const anchor = toolbarMenuAnchor({ ...trigger, triggerLeft: 8, viewportWidth: 320 });
    expect(anchor.left).toBe(12);
  });

  it("honours a caller's gutter", () => {
    expect(toolbarMenuAnchor({ ...trigger, triggerLeft: 0, gutter: 20 }).left).toBe(20);
  });
});

describe("density custom properties", () => {
  it("publishes the metrics the stylesheet reads", () => {
    expect(toolbarDensityStyle("comfortable")).toEqual({
      "--toolbar-button-size": "43px",
      "--toolbar-icon-size": "43px",
      "--toolbar-section-min-width": "88px",
      "--toolbar-section-label-size": "12px",
      "--toolbar-section-label-height": "24px",
      "--toolbar-section-label-padding": "9px",
      "--toolbar-section-min-width-scale": "1",
    });
  });

  // The section minimum is only a true floor if the label fits inside it: a
  // label wider than the minimum widens the section instead, and the derived
  // ribbon widths above would be short by the difference. "Shapes" is the widest
  // English label over a section too thin to be sized by its buttons, measured
  // in the Arial Bold the label rule asks for: 49.35px at 12px, 41.13px at 10px.
  const SHAPES_LABEL_WIDTH = { comfortable: 49.35, compact: 41.13 } as const;

  it("keeps a thin section's label inside the section minimum", () => {
    for (const density of TOOLBAR_DENSITIES) {
      const metrics = TOOLBAR_DENSITY_METRICS[density];
      expect(SHAPES_LABEL_WIDTH[density] + 2 * metrics.sectionLabelPadding).toBeLessThanOrEqual(metrics.sectionMinWidth);
    }
  });

  it("leaves room for the button row under the label at both densities", () => {
    // The ribbon is 76px tall and the label sits above the buttons, so a label
    // that grew would squeeze the buttons out of the row.
    for (const density of TOOLBAR_DENSITIES) {
      const metrics = TOOLBAR_DENSITY_METRICS[density];
      expect(76 - metrics.sectionLabelHeight).toBeGreaterThanOrEqual(metrics.buttonSize);
    }
  });

  it("shrinks every one of them for compact", () => {
    const comfortable = toolbarDensityStyle("comfortable");
    const compact = toolbarDensityStyle("compact");
    for (const key of Object.keys(comfortable)) {
      expect(Number.parseFloat(compact[key])).toBeLessThan(Number.parseFloat(comfortable[key]));
    }
  });
});
