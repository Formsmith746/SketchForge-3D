const WORKPLANE_BOUNDARY_EPSILON = 0.0001;

export const WORKPLANE_LINE_ELEVATION = 0;
export const WORKPLANE_MAJOR_GRID_INTERVAL = 5;

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

export function workplaneGridPalette(): WorkplaneGridPalette {
  return {
    minor: { color: "#91dff0", opacity: 0.55 },
    major: { color: "#4bbddf", opacity: 0.7 },
    axis: { color: "#34aad2", opacity: 0.88 },
    border: { color: "#58c5e6", opacity: 0.9 },
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
