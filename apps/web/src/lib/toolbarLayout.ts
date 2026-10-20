/**
 * How much room the editor toolbar needs, and what it gives up when it has less.
 *
 * The toolbar is two rows: a short title row carrying the mode tabs, the project
 * name and the Import/Export/Settings actions, and below it the tools ribbon of
 * icon sections. The ribbon is the row that runs out of width — it is a fixed
 * number of fixed-size buttons — so the only honest questions are how wide it
 * wants to be and what to shrink when the window is narrower than that.
 *
 * Those answers live here rather than in media queries so they can be checked:
 * a breakpoint written as `@media (max-width: 980px)` is a number no test can
 * read, and the widths below are the ones the reporter of #87 measured from the
 * outside ("the buttons for IMPORT/EXPORT need a screen size far above 1200px").
 *
 * The widths are derived, not chosen. A section is as wide as its row of buttons
 * (`buttons * buttonSize` plus the row's padding) or its minimum, whichever is
 * larger, and the ribbon is the sections plus the 1px rules between and around
 * the groups. The numbers that falls out for the geometry ribbon in English:
 *
 * | density     | with Home | without Home |
 * | ----------- | --------- | ------------ |
 * | comfortable | 1081px    | 992px        |
 * | compact     | 897px     | 840px        |
 *
 * Section labels are not modelled: at both densities every English label is
 * narrower than the button row or the section minimum it sits above, so it never
 * decides a section's width. A locale with longer words can push past that, and
 * the ribbon scrolls when it does — which is why `toolsOverflow` exists rather
 * than a promise that the ribbon always fits.
 */

/**
 * How large the ribbon draws itself.
 *
 * `comfortable` is the toolbar as designed. `compact` keeps every control, in
 * the same place, on a smaller grid: it buys 184px, which is the difference
 * between a ribbon that fits a 1000px window and one that does not.
 */
export type ToolbarDensity = "comfortable" | "compact";

export const TOOLBAR_DENSITIES: readonly ToolbarDensity[] = ["comfortable", "compact"];

export const DEFAULT_TOOLBAR_DENSITY: ToolbarDensity = "comfortable";

export type ToolbarDensityMetrics = {
  /** Edge of a square icon button. */
  readonly buttonSize: number;
  /** Floor for a section, so a one-button section is not narrower than its label. */
  readonly sectionMinWidth: number;
  /** Artwork inside a button; it has to fit the button, not the other way round. */
  readonly iconSize: number;
  readonly sectionLabelFontSize: number;
  readonly sectionLabelHeight: number;
  /** Side padding of a section's label, which is what sets a thin section's floor. */
  readonly sectionLabelPadding: number;
  /** Horizontal padding of the button row inside a section. */
  readonly toolsRowPadding: number;
  /**
   * What to multiply a section's own minimum by.
   *
   * Sections holding worded buttons rather than icons — the sketch ribbon's —
   * set their own floor in the stylesheet. Lowering a floor is always safe here
   * because sections never shrink under their contents, so this only decides how
   * much air a short section keeps.
   */
  readonly sectionMinWidthScale: number;
};

export const TOOLBAR_DENSITY_METRICS: Readonly<Record<ToolbarDensity, ToolbarDensityMetrics>> = {
  comfortable: {
    buttonSize: 43,
    sectionMinWidth: 88,
    iconSize: 43,
    sectionLabelFontSize: 12,
    sectionLabelHeight: 24,
    sectionLabelPadding: 9,
    toolsRowPadding: 6,
    sectionMinWidthScale: 1,
  },
  compact: {
    // 37px is not an arbitrary step down: the sprite and vector artwork is drawn
    // at 35px, so this is the smallest button the existing icons fit inside
    // without being rescaled into mush.
    buttonSize: 37,
    sectionMinWidth: 56,
    iconSize: 35,
    sectionLabelFontSize: 10,
    sectionLabelHeight: 22,
    sectionLabelPadding: 7,
    toolsRowPadding: 6,
    sectionMinWidthScale: 0.64,
  },
};

export type ToolbarSectionId =
  | "home"
  | "clipboard"
  | "history"
  | "shapes"
  | "visibility"
  | "combine"
  | "modify"
  | "arrange";

export type ToolbarSectionSpec = {
  readonly id: ToolbarSectionId;
  /** Icon buttons in the section, dropdown triggers included. */
  readonly buttons: number;
};

export type ToolbarGroupSpec = {
  readonly id: string;
  readonly sections: readonly ToolbarSectionSpec[];
  /** Rules on the group's own outside edges, which the sections do not carry. */
  readonly outerBorders: number;
};

/**
 * The geometry ribbon, as the component renders it.
 *
 * Kept in step with `SecondaryToolbar` by hand, which is the price of measuring
 * a layout without a browser. A section gaining a button makes the ribbon wider
 * than this says, the ribbon scrolls sooner than predicted, and nothing breaks.
 */
export const GEOMETRY_TOOLBAR_GROUPS: readonly ToolbarGroupSpec[] = [
  { id: "nav", sections: [{ id: "home", buttons: 1 }], outerBorders: 1 },
  {
    id: "left",
    sections: [
      { id: "clipboard", buttons: 4 },
      { id: "history", buttons: 2 },
      { id: "shapes", buttons: 1 },
    ],
    outerBorders: 1,
  },
  {
    id: "right",
    sections: [
      { id: "visibility", buttons: 2 },
      { id: "combine", buttons: 3 },
      { id: "modify", buttons: 5 },
      { id: "arrange", buttons: 4 },
    ],
    outerBorders: 2,
  },
];

/**
 * The narrowest title row that still spells out Import and Export.
 *
 * 10px of tab offset + 197px of uppercase tabs + the project name field
 * squeezed to its own padding (32px) + 219px of labelled action buttons, rounded
 * up to leave a few pixels of slack: the tab text is the one piece measured with
 * Arial Bold metrics as a stand-in for the Avenir Next UI face it actually
 * renders in, and that face is a shade wider.
 *
 * Below this the actions keep their icons and drop their words, which takes the
 * row down to `TOOLBAR_TITLE_ROW_MIN_WIDTH`. Being wrong here is cheap — the row
 * scrolls, and the actions are pinned to its right edge either way.
 */
export const TOOLBAR_ACTION_LABEL_MIN_WIDTH = 461;

/**
 * The title row's own floor, once the action labels are gone.
 *
 * 10 + 197 tabs + 32 project name + 104 of icon-only actions. Narrower than this
 * the row scrolls sideways, with the actions sticky against its right edge, so
 * nothing is lost — it is the width below which the mode tabs stop being visible
 * without scrolling.
 */
export const TOOLBAR_TITLE_ROW_MIN_WIDTH = 343;

export function toolbarSectionWidth(buttons: number, density: ToolbarDensity): number {
  const metrics = TOOLBAR_DENSITY_METRICS[density];
  const buttonRow = Math.max(0, buttons) * metrics.buttonSize + metrics.toolsRowPadding;
  return Math.max(metrics.sectionMinWidth, buttonRow);
}

export type ToolbarRowOptions = {
  /** The Home button only renders when the editor was opened from the dashboard. */
  readonly hasHomeButton?: boolean;
};

/**
 * How wide the geometry ribbon wants to be at a given density.
 *
 * Groups whose sections are all dropped — the nav group, when there is no Home
 * button — take their outer rules with them.
 */
export function geometryToolbarRowWidth(density: ToolbarDensity, options: ToolbarRowOptions = {}): number {
  const hasHomeButton = options.hasHomeButton ?? true;
  return GEOMETRY_TOOLBAR_GROUPS.reduce((total, group) => {
    const sections = group.sections.filter((section) => section.id !== "home" || hasHomeButton);
    if (sections.length === 0) return total;
    const sectionsWidth = sections.reduce((sum, section) => sum + toolbarSectionWidth(section.buttons, density), 0);
    // Every section but the last in a group draws a rule on its right.
    return total + sectionsWidth + (sections.length - 1) + group.outerBorders;
  }, 0);
}

export type ToolbarLayout = {
  readonly density: ToolbarDensity;
  /** Import and Export carry their words, rather than shrinking to bare icons. */
  readonly showActionLabels: boolean;
  /**
   * The ribbon is wider than the bar, so it scrolls sideways.
   *
   * Scrolling is the floor of this design, not a failure of it: every tool stays
   * reachable at any width, and the toolbar never pushes a control off the edge
   * of a window with no way back to it.
   */
  readonly toolsOverflow: boolean;
};

/**
 * The toolbar layout for a bar of a given width.
 *
 * A width of zero or less, or one that is not a number, means nothing has been
 * measured yet — a server render, or the first paint before the window reports
 * itself. Those get the comfortable layout, because guessing wide and tightening
 * on mount is the cheaper mistake: the alternative draws a cramped toolbar on
 * every desktop for one frame.
 */
export function toolbarLayoutForWidth(barWidth: number, options: ToolbarRowOptions = {}): ToolbarLayout {
  if (!Number.isFinite(barWidth) || barWidth <= 0) {
    return { density: DEFAULT_TOOLBAR_DENSITY, showActionLabels: true, toolsOverflow: false };
  }
  const density: ToolbarDensity = barWidth >= geometryToolbarRowWidth("comfortable", options) ? "comfortable" : "compact";
  return {
    density,
    showActionLabels: barWidth >= TOOLBAR_ACTION_LABEL_MIN_WIDTH,
    toolsOverflow: barWidth < geometryToolbarRowWidth(density, options),
  };
}

export type ToolbarMenuAnchorInput = {
  readonly triggerLeft: number;
  readonly triggerWidth: number;
  readonly triggerBottom: number;
  readonly menuWidth: number;
  readonly viewportWidth: number;
  /** `start` lines the menu up with the control's left edge; `center` under its middle. */
  readonly align?: "start" | "center";
  /** Space between the control and the menu. */
  readonly gap?: number;
  /** Space kept clear at the window's edges. */
  readonly gutter?: number;
};

/**
 * Where a toolbar menu sits, in window coordinates.
 *
 * Toolbar menus are positioned against the window rather than laid out inside
 * their section, because the tools ribbon scrolls sideways when it is wider than
 * the bar: a menu positioned inside that scroll box is clipped by it, and slides
 * out from under its own button when the ribbon is scrolled.
 *
 * The clamp is what makes a narrow window usable — a menu anchored to a control
 * near the right edge would otherwise open past it, which on a touch device
 * means a menu that cannot be read or dismissed.
 */
export function toolbarMenuAnchor(input: ToolbarMenuAnchorInput): { top: number; left: number } {
  const gutter = input.gutter ?? 12;
  const gap = input.gap ?? 8;
  // A menu's own rule caps its width at the window's, so `menuWidth` is the
  // width it asks for rather than the width it gets. The difference does not
  // reach the answer: once a menu is too wide for the window, the clamp below
  // pins it to the left gutter either way.
  const { menuWidth } = input;
  const preferred = input.align === "center" ? input.triggerLeft + input.triggerWidth / 2 - menuWidth / 2 : input.triggerLeft;
  const rightmost = input.viewportWidth - menuWidth - gutter;
  return {
    top: input.triggerBottom + gap,
    // `Math.min` first so a window too narrow for even the gutters still lands
    // the menu at the gutter rather than off the left edge.
    left: Math.max(gutter, Math.min(preferred, rightmost)),
  };
}

/**
 * The density as custom properties for the toolbar element.
 *
 * The stylesheet reads these and nothing else about sizing, so the button grid
 * has one definition rather than one here and another in a media query that
 * drifts from it.
 */
export function toolbarDensityStyle(density: ToolbarDensity): Readonly<Record<string, string>> {
  const metrics = TOOLBAR_DENSITY_METRICS[density];
  return {
    "--toolbar-button-size": `${metrics.buttonSize}px`,
    "--toolbar-icon-size": `${metrics.iconSize}px`,
    "--toolbar-section-min-width": `${metrics.sectionMinWidth}px`,
    "--toolbar-section-label-size": `${metrics.sectionLabelFontSize}px`,
    "--toolbar-section-label-height": `${metrics.sectionLabelHeight}px`,
    "--toolbar-section-label-padding": `${metrics.sectionLabelPadding}px`,
    "--toolbar-section-min-width-scale": `${metrics.sectionMinWidthScale}`,
  };
}
