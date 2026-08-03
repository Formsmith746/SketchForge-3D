import type { GridSize, HistoryRetentionLimit, MeasurementAccuracy, WorkplaneWorkspaceSettings } from "@/types/sketchforge";
import { normalizeScaleForUnits } from "@/lib/measurementUnits";
import { defaultThemes, type AppTheme } from "@/lib/themes";
import { DEFAULT_WORKPLANE_GRID_COLOR } from "@/lib/workplaneGrid";

export const DEFAULT_SNAP_GRID: GridSize = "1.0 mm";

export const DEFAULT_WORKPLANE_WORKSPACE: WorkplaneWorkspaceSettings = {
  width: 200,
  depth: 200,
  sizePreset: "200 x 200 mm",
  gridBlockSize: 5,
  gridBlockPreset: "5 mm",
  gridColor: DEFAULT_WORKPLANE_GRID_COLOR,
  background: "#f8fbfc",
  themeId: "light",
  showShadows: true,
  showGrid: true,
  cruiseShapes: true,
  zoomSpeed: 5,
  units: "Metric (Default)",
  scale: "1:1 (millimeters)",
  accuracy: 2,
  historyLimit: 100,
};

const snapGridOptions: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function colorOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function accuracyOrDefault(value: unknown, fallback: MeasurementAccuracy) {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function historyLimitOrDefault(value: unknown, fallback: HistoryRetentionLimit): HistoryRetentionLimit {
  if (value === "unlimited") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(5000, Math.max(1, Math.round(value)));
}

export function normalizeSnapGrid(value: unknown, fallback: GridSize = DEFAULT_SNAP_GRID): GridSize {
  return snapGridOptions.includes(value as GridSize) ? (value as GridSize) : fallback;
}

function themeOrDefault(value: unknown, fallback: AppTheme | undefined): AppTheme | undefined {
  if (!value || typeof value !== "object") return fallback;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.name !== "string" || !t.ui || typeof t.ui !== "object" || !t.viewport || typeof t.viewport !== "object") {
    return fallback;
  }
  return value as AppTheme;
}

const VALID_THEME_IDS = new Set([...Object.keys(defaultThemes), "custom"]);

export function normalizeWorkspaceSettings(value: unknown, fallback: WorkplaneWorkspaceSettings = DEFAULT_WORKPLANE_WORKSPACE): WorkplaneWorkspaceSettings {
  const candidate = value && typeof value === "object" ? (value as Partial<WorkplaneWorkspaceSettings>) : {};
  const units = stringOrDefault(candidate.units, fallback.units);
  const themeId = VALID_THEME_IDS.has(candidate.themeId ?? "") ? candidate.themeId : fallback.themeId ?? "light";
  const customTheme = themeOrDefault(candidate.customTheme, fallback.customTheme);
  return {
    width: numberOrDefault(candidate.width, fallback.width),
    depth: numberOrDefault(candidate.depth, fallback.depth),
    sizePreset: stringOrDefault(candidate.sizePreset, fallback.sizePreset),
    gridBlockSize: numberOrDefault(candidate.gridBlockSize, fallback.gridBlockSize),
    gridBlockPreset: stringOrDefault(candidate.gridBlockPreset, fallback.gridBlockPreset),
    gridColor: colorOrDefault(candidate.gridColor, fallback.gridColor),
    background: stringOrDefault(candidate.background, fallback.background),
    themeId,
    ...(customTheme ? { customTheme } : {}),
    showShadows: booleanOrDefault(candidate.showShadows, fallback.showShadows),
    showGrid: booleanOrDefault(candidate.showGrid, fallback.showGrid),
    cruiseShapes: booleanOrDefault(candidate.cruiseShapes, fallback.cruiseShapes),
    zoomSpeed: numberOrDefault(candidate.zoomSpeed, fallback.zoomSpeed),
    units,
    scale: normalizeScaleForUnits(units, stringOrDefault(candidate.scale, fallback.scale)),
    accuracy: accuracyOrDefault(candidate.accuracy, fallback.accuracy),
    historyLimit: historyLimitOrDefault(candidate.historyLimit, fallback.historyLimit),
  };
}

export function workplaneSettingsFingerprint(workspace: WorkplaneWorkspaceSettings, snapGrid: GridSize) {
  return JSON.stringify({ workspace, snapGrid });
}

export function workspaceHydrationSyncDecision(pendingFingerprint: string | null, currentFingerprint: string) {
  if (pendingFingerprint === null) {
    return { shouldSync: true, pendingFingerprint: null };
  }
  return {
    shouldSync: false,
    pendingFingerprint: currentFingerprint === pendingFingerprint ? null : pendingFingerprint,
  };
}

export function workspaceHydrationRequired(
  keyChanged: boolean,
  lastSyncedFingerprint: string,
  currentFingerprint: string,
  nextFingerprint: string,
) {
  return keyChanged || lastSyncedFingerprint !== nextFingerprint || currentFingerprint !== nextFingerprint;
}
