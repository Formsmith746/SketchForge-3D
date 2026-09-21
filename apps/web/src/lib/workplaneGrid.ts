import type { ResolvedAppTheme } from "@/lib/appTheme";

const WORKPLANE_BOUNDARY_EPSILON = 0.0001;

export const WORKPLANE_LINE_ELEVATION = 0;
export const WORKPLANE_MAJOR_GRID_INTERVAL = 5;
export const DEFAULT_WORKPLANE_GRID_COLOR = "#28b4de";

/** Printed along the front edge so the plane's orientation is readable. */
export const WORKPLANE_LABEL_TEXT = "Workplane";
/** Width to height of the label texture, and so of the mesh that carries it. */
export const WORKPLANE_LABEL_ASPECT = 4;
const WORKPLANE_LABEL_MIN_HEIGHT = 3;
const WORKPLANE_LABEL_MAX_HEIGHT = 26;
const WORKPLANE_LABEL_HEIGHT_RATIO = 0.085;
const WORKPLANE_LABEL_MAX_WIDTH_RATIO = 0.62;
/**
 * Gap between the plane edge and the nearest edge of the text, as a share of
 * the text height. The same on both axes, so the label sits squarely in the
 * corner rather than closer to one edge than the other.
 *
 * The texture carries roughly a further 0.16 of padding of its own, since the
 * glyphs are drawn centred at 68% of its height to leave room for descenders,
 * so the gap that actually reads on screen is a little wider than this.
 */
const WORKPLANE_LABEL_INSET_RATIO = 0.18;

export type WorkplaneLabelLayout = {
  width: number;
  height: number;
  /** Distance in front of the plane centre, towards the near edge. */
  depthOffset: number;
  /** Distance from the plane centre towards the left edge, so negative. */
  lateralOffset: number;
};

/**
 * Size and placement of the workplane label, in workspace units.
 *
 * It sits in the near left corner rather than centred on the front edge, so it
 * reads as a caption for the plane and leaves the middle of the workspace free.
 * It scales with the plane so it stays legible on a small workspace without
 * dominating a large one, and never reaches the edges it sits between.
 */
export function workplaneLabelLayout(width: number, depth: number): WorkplaneLabelLayout {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeDepth = Number.isFinite(depth) && depth > 0 ? depth : 0;
  if (safeWidth <= 0 || safeDepth <= 0) {
    return { width: 0, height: 0, depthOffset: 0, lateralOffset: 0 };
  }

  const preferredHeight = Math.min(safeWidth, safeDepth) * WORKPLANE_LABEL_HEIGHT_RATIO;
  const clampedHeight = Math.min(
    Math.max(preferredHeight, WORKPLANE_LABEL_MIN_HEIGHT),
    WORKPLANE_LABEL_MAX_HEIGHT,
  );
  const maxLabelWidth = safeWidth * WORKPLANE_LABEL_MAX_WIDTH_RATIO;
  const labelWidth = Math.min(clampedHeight * WORKPLANE_LABEL_ASPECT, maxLabelWidth);
  const labelHeight = labelWidth / WORKPLANE_LABEL_ASPECT;
  const inset = labelHeight * WORKPLANE_LABEL_INSET_RATIO;
  return {
    width: labelWidth,
    height: labelHeight,
    depthOffset: Math.max(0, safeDepth / 2 - inset - labelHeight / 2),
    lateralOffset: Math.min(0, -safeWidth / 2 + inset + labelWidth / 2),
  };
}

export type WorkplaneGridCoordinate = {
  coordinate: number;
  index: number;
};

export type WorkplaneGridPalette = {
  minor: { color: string; opacity: number };
  major: { color: string; opacity: number };
  axis: { color: string; opacity: number };
  border: { color: string; opacity: number };
};

export type WorkplaneThemePalette = {
  sceneBackground: string;
  surface: { color: string; opacity: number };
  grid: WorkplaneGridPalette;
};

export function workplaneGridPalette(
  theme: ResolvedAppTheme = "light",
  configuredColor: string = DEFAULT_WORKPLANE_GRID_COLOR,
): WorkplaneGridPalette {
  if (configuredColor.toLowerCase() !== DEFAULT_WORKPLANE_GRID_COLOR) {
    return {
      minor: { color: configuredColor, opacity: theme === "dark" ? 0.42 : 0.38 },
      major: { color: configuredColor, opacity: theme === "dark" ? 0.7 : 0.68 },
      axis: { color: configuredColor, opacity: 0.94 },
      border: { color: configuredColor, opacity: 0.9 },
    };
  }
  if (theme === "dark") {
    return {
      minor: { color: "#397080", opacity: 0.5 },
      major: { color: "#4d9caf", opacity: 0.72 },
      axis: { color: "#65c9df", opacity: 0.92 },
      border: { color: "#59b8cc", opacity: 0.88 },
    };
  }
  return {
    minor: { color: "#91dff0", opacity: 0.55 },
    major: { color: "#4bbddf", opacity: 0.7 },
    axis: { color: "#34aad2", opacity: 0.88 },
    border: { color: "#58c5e6", opacity: 0.9 },
  };
}

export function workplaneThemePalette(
  theme: ResolvedAppTheme,
  configuredBackground: string,
  configuredGridColor: string = DEFAULT_WORKPLANE_GRID_COLOR,
): WorkplaneThemePalette {
  return theme === "dark"
    ? {
        sceneBackground: "#101820",
        surface: { color: "#183640", opacity: 0.9 },
        grid: workplaneGridPalette("dark", configuredGridColor),
      }
    : {
        sceneBackground: configuredBackground,
        surface: { color: "#ddf8ff", opacity: 0.68 },
        grid: workplaneGridPalette("light", configuredGridColor),
      };
}

export function interiorWorkplaneGridCoordinates(span: number, step: number): WorkplaneGridCoordinate[] {
  if (!Number.isFinite(span) || !Number.isFinite(step) || span <= 0 || step <= 0) {
    return [];
  }

  const halfSpan = span / 2;
  const count = Math.floor(span / step);
  const coordinates: WorkplaneGridCoordinate[] = [];

  for (let index = 0; index <= count; index += 1) {
    const rawCoordinate = -halfSpan + index * step;
    const coordinate = Math.abs(rawCoordinate) < WORKPLANE_BOUNDARY_EPSILON ? 0 : rawCoordinate;
    const isBoundary = Math.abs(Math.abs(coordinate) - halfSpan) < WORKPLANE_BOUNDARY_EPSILON;
    if (!isBoundary) {
      coordinates.push({ coordinate, index });
    }
  }

  return coordinates;
}
