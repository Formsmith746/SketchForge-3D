import type { ResolvedAppTheme } from "@/lib/appTheme";

const WORKPLANE_BOUNDARY_EPSILON = 0.0001;

export const WORKPLANE_LINE_ELEVATION = 0;
export const WORKPLANE_MAJOR_GRID_INTERVAL = 5;
export const DEFAULT_WORKPLANE_GRID_COLOR = "#28b4de";

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
