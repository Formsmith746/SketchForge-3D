export type SketchSnapCandidateKind = "point" | "midpoint" | "center";

export type SketchSnapCandidate = {
  id: string;
  kind: SketchSnapCandidateKind;
  label: string;
  x: number;
  z: number;
  ownerPointIds?: string[];
};

export type SketchSnapMatch = {
  kind: SketchSnapCandidateKind | "grid" | "alignment";
  label: string;
  xGuide?: number;
  zGuide?: number;
};

export type SketchSnapResult = {
  x: number;
  z: number;
  snap?: SketchSnapMatch;
};

type SketchSnapOptions = {
  precisionStep: number;
  gridStep: number;
  tolerance: number;
  snapToGridLines: boolean;
  snapToGeometry: boolean;
  candidates: SketchSnapCandidate[];
};

function snappedValue(value: number, step: number) {
  return step > 0 ? Math.round(value / step) * step : value;
}

function nearestAxisCandidate(candidates: SketchSnapCandidate[], value: number, axis: "x" | "z") {
  return candidates.reduce<{ candidate: SketchSnapCandidate; distance: number } | null>((nearest, candidate) => {
    const distance = Math.abs(candidate[axis] - value);
    return !nearest || distance < nearest.distance ? { candidate, distance } : nearest;
  }, null);
}

export function dedupeSketchSnapCandidates(candidates: SketchSnapCandidate[], tolerance = 0.000001) {
  const result: SketchSnapCandidate[] = [];
  candidates.forEach((candidate) => {
    if (!result.some((current) => Math.hypot(current.x - candidate.x, current.z - candidate.z) <= tolerance)) result.push(candidate);
  });
  return result;
}

export function snapSketchPoint(raw: { x: number; z: number }, options: SketchSnapOptions): SketchSnapResult {
  const candidates = options.candidates;
  if (options.snapToGeometry && candidates.length > 0) {
    const exact = candidates.reduce<{ candidate: SketchSnapCandidate; distance: number } | null>((nearest, candidate) => {
      const distance = Math.hypot(candidate.x - raw.x, candidate.z - raw.z);
      return !nearest || distance < nearest.distance ? { candidate, distance } : nearest;
    }, null);
    if (exact && exact.distance <= options.tolerance) {
      return {
        x: exact.candidate.x,
        z: exact.candidate.z,
        snap: { kind: exact.candidate.kind, label: exact.candidate.label },
      };
    }
  }

  let x = snappedValue(raw.x, options.precisionStep);
  let z = snappedValue(raw.z, options.precisionStep);
  let xGuide: number | undefined;
  let zGuide: number | undefined;
  let label: string | undefined;
  let kind: SketchSnapMatch["kind"] = "grid";

  if (options.snapToGridLines && options.gridStep > 0) {
    const gridX = snappedValue(raw.x, options.gridStep);
    const gridZ = snappedValue(raw.z, options.gridStep);
    if (Math.abs(gridX - raw.x) <= options.tolerance) {
      x = gridX;
      xGuide = gridX;
      label = "Grid line";
    }
    if (Math.abs(gridZ - raw.z) <= options.tolerance) {
      z = gridZ;
      zGuide = gridZ;
      label = "Grid line";
    }
  }

  if (options.snapToGeometry && candidates.length > 0) {
    const nearestX = nearestAxisCandidate(candidates, raw.x, "x");
    const nearestZ = nearestAxisCandidate(candidates, raw.z, "z");
    if (nearestX && nearestX.distance <= options.tolerance) {
      x = nearestX.candidate.x;
      xGuide = x;
      label = `Align X: ${nearestX.candidate.label}`;
      kind = "alignment";
    }
    if (nearestZ && nearestZ.distance <= options.tolerance) {
      z = nearestZ.candidate.z;
      zGuide = z;
      label = `Align Z: ${nearestZ.candidate.label}`;
      kind = "alignment";
    }
    if (nearestX && nearestZ && nearestX.distance <= options.tolerance && nearestZ.distance <= options.tolerance) {
      label = nearestX.candidate.id === nearestZ.candidate.id ? nearestX.candidate.label : "Geometry alignment";
    }
  }

  return {
    x,
    z,
    ...(label ? { snap: { kind, label, ...(xGuide !== undefined ? { xGuide } : {}), ...(zGuide !== undefined ? { zGuide } : {}) } } : {}),
  };
}
