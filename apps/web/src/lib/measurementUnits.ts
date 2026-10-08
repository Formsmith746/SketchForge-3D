import type { MessageKey, Translator } from "@/i18n";
import type { GridSize, MeasurementAccuracy, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

const MILLIMETERS_PER_INCH = 25.4;
const MILLIMETERS_PER_FOOT = 304.8;
const MILLIMETERS_PER_STUD = 8;

type WorkspaceScaleOption = {
  /** Stored in project workspace settings; shown through `labelKey`. */
  label: string;
  labelKey: MessageKey;
  displayLabel: string;
  millimetersPerDisplayUnit: number;
};

const METRIC_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (millimeters)", labelKey: "panels.measurement.scale.mm", displayLabel: "mm", millimetersPerDisplayUnit: 1 },
  { label: "1:10 (centimeters)", labelKey: "panels.measurement.scale.cm", displayLabel: "cm", millimetersPerDisplayUnit: 10 },
  { label: "1:1000 (meters)", labelKey: "panels.measurement.scale.m", displayLabel: "m", millimetersPerDisplayUnit: 1000 },
];

const IMPERIAL_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (inches)", labelKey: "panels.measurement.scale.in", displayLabel: "in", millimetersPerDisplayUnit: MILLIMETERS_PER_INCH },
  { label: "1:1 (feet)", labelKey: "panels.measurement.scale.ft", displayLabel: "ft", millimetersPerDisplayUnit: MILLIMETERS_PER_FOOT },
];

const BRICK_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (studs)", labelKey: "panels.measurement.scale.stud", displayLabel: "stud", millimetersPerDisplayUnit: MILLIMETERS_PER_STUD },
];

export const WORKSPACE_UNIT_OPTIONS = ["Metric (Default)", "Imperial", "Bricks"] as const;

const WORKSPACE_UNIT_LABEL_KEYS: Record<(typeof WORKSPACE_UNIT_OPTIONS)[number], MessageKey> = {
  "Metric (Default)": "panels.measurement.units.metric",
  Imperial: "panels.measurement.units.imperial",
  Bricks: "panels.measurement.units.bricks",
};

function isWorkspaceUnitOption(value: string): value is (typeof WORKSPACE_UNIT_OPTIONS)[number] {
  return (WORKSPACE_UNIT_OPTIONS as readonly string[]).includes(value);
}

/** Display text for a stored workspace units value (`WORKSPACE_UNIT_OPTIONS`); unknown values pass through. */
export function workspaceUnitsLabel(t: Translator, units: string): string {
  return isWorkspaceUnitOption(units) ? t(WORKSPACE_UNIT_LABEL_KEYS[units]) : units;
}

export type LengthDisplayUnit = {
  label: string;
  millimetersPerUnit: number;
};

function scaleEntriesForUnits(units: string) {
  if (units === "Imperial") return IMPERIAL_SCALE_OPTIONS;
  if (units === "Bricks") return BRICK_SCALE_OPTIONS;
  return METRIC_SCALE_OPTIONS;
}

export function scaleOptionsForUnits(units: string) {
  return scaleEntriesForUnits(units).map((option) => option.label);
}

/** Display text for a stored workspace scale value (`scaleOptionsForUnits`); unknown values pass through. */
export function workspaceScaleLabel(t: Translator, scale: string): string {
  const option = [...METRIC_SCALE_OPTIONS, ...IMPERIAL_SCALE_OPTIONS, ...BRICK_SCALE_OPTIONS].find((entry) => entry.label === scale);
  return option ? t(option.labelKey) : scale;
}

/** Display text for a snap grid value: `Off` and `Brick` are translated, millimeter steps get the localized unit. */
export function snapGridLabel(t: Translator, size: GridSize): string {
  if (size === "Off") return t("panels.snapGrid.off");
  if (size === "Brick") return t("panels.snapGrid.brick");
  return `${size.slice(0, -" mm".length)} ${t("common.unit.mm")}`;
}

export function defaultScaleForUnits(units: string) {
  return scaleEntriesForUnits(units)[0].label;
}

export function normalizeScaleForUnits(units: string, scale: string) {
  const options = scaleEntriesForUnits(units);
  const normalizedScale = units !== "Imperial" && units !== "Bricks" && scale === "1:100 (meters)" ? "1:1000 (meters)" : scale;
  return options.some((option) => option.label === normalizedScale) ? normalizedScale : options[0].label;
}

function scaleEntryForWorkspace(workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  const options = scaleEntriesForUnits(workspace.units);
  const normalizedScale = normalizeScaleForUnits(workspace.units, workspace.scale);
  return options.find((option) => option.label === normalizedScale) ?? options[0];
}

export function lengthDisplayUnit(workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">): LengthDisplayUnit {
  const scale = scaleEntryForWorkspace(workspace);
  return { label: scale.displayLabel, millimetersPerUnit: scale.millimetersPerDisplayUnit };
}

export function millimetersToDisplay(value: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return value / lengthDisplayUnit(workspace).millimetersPerUnit;
}

export function displayToMillimeters(value: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return value * lengthDisplayUnit(workspace).millimetersPerUnit;
}

export function displayStepFromMillimeters(step: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return step / lengthDisplayUnit(workspace).millimetersPerUnit;
}

export function parseMeasurementInput(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const compact = value.trim().replace(/[\s\u00a0]/g, "");
  if (!compact) return Number.NaN;

  const commaIndex = compact.lastIndexOf(",");
  const dotIndex = compact.lastIndexOf(".");
  let normalized = compact;
  if (commaIndex >= 0 && dotIndex >= 0) {
    normalized = commaIndex > dotIndex
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(/,/g, "");
  } else if (commaIndex >= 0) {
    normalized = compact.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatMeasurementNumber(value: number, accuracy: MeasurementAccuracy, _step?: number) {
  let decimals = accuracy;
  while (decimals < 6 && value !== 0 && Math.abs(value) < 0.5 * 10 ** -decimals) {
    decimals += 1;
  }
  const zeroThreshold = 0.5 * 10 ** -decimals;
  return (Math.abs(value) < zeroThreshold ? 0 : value).toFixed(decimals);
}
