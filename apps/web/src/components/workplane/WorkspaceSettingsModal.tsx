"use client";

import { useTranslations } from "next-intl";
import { Box as BoxIcon, ChevronDown, Grid3X3, History, Palette, RotateCcw, Ruler, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { APP_THEME_OPTIONS, type AppThemePreference } from "@/lib/appTheme";
import { gearCenterHoleLimits, gearToothPitch } from "@/lib/gearGeometry";
import { normalizeScaleForUnits, parseMeasurementInput, scaleOptionsForUnits, WORKSPACE_UNIT_OPTIONS, unitLabelKey, scaleLabelKey } from "@/lib/measurementUnits";
import { shapeAssetDefaultDimensions, shapeAssetSpecialDefaults, toolbarShapeAssets, TEXT_FONT_OPTIONS } from "@/lib/shapeCatalog";
import { DEFAULT_WORKPLANE_WORKSPACE, MAX_CUSTOM_SHAPE_DIMENSION, MAX_HIGH_RESOLUTION_SIDES, MIN_CUSTOM_SHAPE_DIMENSION } from "@/lib/workplaneSettings";
import type { GearType, GridSize, ShapeCustomization, ShapeKind, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type WorkspaceSettings = WorkplaneWorkspaceSettings;
type WorkspaceSettingsSection = "appearance" | "measurement" | "workplane" | "shapes" | "history";

const SNAP_GRID_KEYS: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];
const SNAP_GRID_LABEL_KEYS: ("off" | "pointOne" | "pointTwoFive" | "pointFive" | "oneZero" | "twoZero" | "fiveZero" | "brick")[] = ["off", "pointOne", "pointTwoFive", "pointFive", "oneZero", "twoZero", "fiveZero", "brick"];
const MIN_WORKSPACE_SIZE = 60;
const MAX_WORKSPACE_SIZE = 2000;
const MIN_GRID_BLOCK_SIZE = 1;
const MAX_GRID_BLOCK_SIZE = 200;
const WORKSPACE_SIZE_PRESETS = [
  { label: "200 x 200 mm", labelKey: "200x200", width: 200, depth: 200 },
  { label: "300 x 300 mm", labelKey: "300x300", width: 300, depth: 300 },
  { label: "500 x 500 mm", labelKey: "500x500", width: 500, depth: 500 },
  { label: "1000 x 1000 mm", labelKey: "1000x1000", width: 1000, depth: 1000 },
  { label: "2000 x 2000 mm", labelKey: "2000x2000", width: 2000, depth: 2000 },
  { label: "Custom", labelKey: "custom", width: 200, depth: 200 },
];
const GRID_BLOCK_PRESETS = [
  { label: "1 mm", labelKey: "1mm" },
  { label: "2.5 mm", labelKey: "2point5mm" },
  { label: "5 mm", labelKey: "5mm" },
  { label: "10 mm", labelKey: "10mm" },
  { label: "20 mm", labelKey: "20mm" },
  { label: "50 mm", labelKey: "50mm" },
  { label: "100 mm", labelKey: "100mm" },
  { label: "Custom", labelKey: "custom" },
];
const HISTORY_LIMIT_OPTIONS = [30, 50, 100, "unlimited", "custom"] as const;
const HISTORY_CUSTOM_DEFAULT = 250;
const GEAR_TYPE_OPTIONS: Array<{ value: GearType; labelKey: string }> = [
  { value: "spur", labelKey: "shapes.spurGear" },
  { value: "helical", labelKey: "shapes.helicalGear" },
  { value: "bevel", labelKey: "shapes.bevelGear" },
];

type ShapeSpecialNumberKey = "steps" | "sides" | "bevel" | "segments" | "topRadius" | "baseRadius" | "teeth" | "toothSize" | "toothWidth" | "centerHoleSize" | "helixAngle" | "helixQuality";
type ShapeSpecialField =
  | { type: "number"; key: ShapeSpecialNumberKey; labelKey: string; defaultValue: number; min: number; max: number; step?: number; unit?: string }
  | { type: "select"; key: "font" | "gearType"; labelKey: string; defaultValue: string; options: Array<{ value: string; labelKey: string }> }
  | { type: "text"; key: "text"; labelKey: string; defaultValue: string; maxLength: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function gridBlockSizeForPreset(preset: string, fallback: number) {
  if (preset === "Custom") {
    return clamp(fallback, MIN_GRID_BLOCK_SIZE, MAX_GRID_BLOCK_SIZE);
  }
  return clamp(Number.parseFloat(preset) || DEFAULT_WORKPLANE_WORKSPACE.gridBlockSize, MIN_GRID_BLOCK_SIZE, MAX_GRID_BLOCK_SIZE);
}

function isHistoryLimitPreset(value: unknown): value is 30 | 50 | 100 {
  return value === 30 || value === 50 || value === 100;
}

function specialFieldsForShape(
  kind: ShapeKind,
  dimensions: { width: number; depth: number; height: number },
  customization: ShapeCustomization,
): ShapeSpecialField[] {
  const defaults = shapeAssetSpecialDefaults(kind, dimensions);
  if (kind === "cylinder") return [{ type: "number", key: "sides", labelKey: "sides", defaultValue: defaults.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 }];
  if (kind === "sphere" || kind === "halfSphere") return [{ type: "number", key: "steps", labelKey: "steps", defaultValue: defaults.steps ?? 24, min: 6, max: 64, step: 1 }];
  if (kind === "cone") {
    return [
      { type: "number", key: "topRadius", labelKey: "topRadius", defaultValue: defaults.topRadius ?? 0, min: 0, max: MAX_CUSTOM_SHAPE_DIMENSION / 2, unit: "mm" },
      { type: "number", key: "baseRadius", labelKey: "baseRadius", defaultValue: defaults.baseRadius ?? dimensions.width / 2, min: MIN_CUSTOM_SHAPE_DIMENSION, max: MAX_CUSTOM_SHAPE_DIMENSION / 2, unit: "mm" },
      { type: "number", key: "sides", labelKey: "sides", defaultValue: defaults.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 },
    ];
  }
  if (kind === "pyramid") return [{ type: "number", key: "sides", labelKey: "sides", defaultValue: defaults.sides ?? 4, min: 3, max: 24, step: 1 }];
  if (kind === "roundRoof") return [{ type: "number", key: "sides", labelKey: "sides", defaultValue: defaults.sides ?? 64, min: 4, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 }];
  if (kind === "tube" || kind === "ring") return [{ type: "number", key: "bevel", labelKey: "bevel", defaultValue: defaults.bevel ?? 4, min: 0.5, max: 20, unit: "mm" }];
  if (kind === "text") {
    return [
      { type: "text", key: "text", labelKey: "text", defaultValue: defaults.text ?? "TEXT", maxLength: 24 },
      { type: "select", key: "font", labelKey: "font", defaultValue: defaults.font ?? "Multilanguage", options: TEXT_FONT_OPTIONS.map((option) => ({ value: option.value, labelKey: option.labelKey })) },
      { type: "number", key: "bevel", labelKey: "bevel", defaultValue: defaults.bevel ?? 0, min: 0, max: 8, unit: "mm" },
      { type: "number", key: "segments", labelKey: "segments", defaultValue: defaults.segments ?? 0, min: 0, max: 24, step: 1 },
    ];
  }
  if (kind === "gear") {
    const teeth = customization.teeth ?? defaults.teeth ?? 12;
    const toothSize = customization.toothSize ?? defaults.toothSize ?? 2.5;
    const toothPitch = gearToothPitch(dimensions.width, dimensions.depth, teeth);
    const centerHoleLimits = gearCenterHoleLimits(dimensions.width, dimensions.depth, toothSize);
    const gearType = customization.gearType ?? defaults.gearType ?? "spur";
    const fields: ShapeSpecialField[] = [
      { type: "select", key: "gearType", labelKey: "gearType", defaultValue: defaults.gearType ?? "spur", options: GEAR_TYPE_OPTIONS },
      { type: "number", key: "teeth", labelKey: "teeth", defaultValue: defaults.teeth ?? 12, min: 6, max: 64, step: 1 },
      { type: "number", key: "toothSize", labelKey: "toothSize", defaultValue: defaults.toothSize ?? 2.5, min: 0.2, max: Math.max(0.2, Math.min(dimensions.width, dimensions.depth) * 0.22), unit: "mm" },
      { type: "number", key: "toothWidth", labelKey: "toothWidth", defaultValue: defaults.toothWidth ?? toothPitch * 0.54, min: toothPitch * 0.12, max: toothPitch * 0.82, unit: "mm" },
      { type: "number", key: "centerHoleSize", labelKey: "centerHole", defaultValue: defaults.centerHoleSize ?? 6, min: centerHoleLimits.min, max: centerHoleLimits.max, unit: "mm" },
    ];
    if (gearType === "helical") {
      fields.push(
        { type: "number", key: "helixAngle", labelKey: "helixAngle", defaultValue: defaults.helixAngle ?? 22.5, min: -45, max: 45, unit: "deg" },
        { type: "number", key: "helixQuality", labelKey: "quality", defaultValue: defaults.helixQuality ?? 16, min: 4, max: 32, step: 1 },
      );
    }
    return fields;
  }
  return [];
}

export function WorkspaceSettingsModal({
  workspace,
  snap,
  themePreference,
  moveDimensionsEnabled,
  showProjectNameInToolbar,
  onWorkspaceChange,
  onSnapChange,
  onThemePreferenceChange,
  onMoveDimensionsEnabledChange,
  onShowProjectNameInToolbarChange,
  onMakeDefault,
  onClose,
}: {
  workspace: WorkspaceSettings;
  snap: GridSize;
  themePreference: AppThemePreference;
  moveDimensionsEnabled: boolean;
  showProjectNameInToolbar: boolean;
  onWorkspaceChange: (next: WorkspaceSettings) => void;
  onSnapChange: (next: GridSize) => void;
  onThemePreferenceChange?: (preference: AppThemePreference) => void;
  onMoveDimensionsEnabledChange: (enabled: boolean) => void;
  onShowProjectNameInToolbarChange?: (show: boolean) => void;
  onMakeDefault: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  const [defaultSaved, setDefaultSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSettingsSection>("appearance");
  const [selectedShapeKind, setSelectedShapeKind] = useState<ShapeKind>(toolbarShapeAssets[0].kind);
  const [dimensionDrafts, setDimensionDrafts] = useState(() => ({
    width: workspace.width.toFixed(workspace.accuracy),
    depth: workspace.depth.toFixed(workspace.accuracy),
  }));
  const [gridBlockSizeDraft, setGridBlockSizeDraft] = useState(() => workspace.gridBlockSize.toFixed(workspace.accuracy));
  const [customHistoryDraft, setCustomHistoryDraft] = useState(() =>
    typeof workspace.historyLimit === "number" && !isHistoryLimitPreset(workspace.historyLimit)
      ? String(workspace.historyLimit)
      : String(HISTORY_CUSTOM_DEFAULT),
  );
  const historyLimitMode: (typeof HISTORY_LIMIT_OPTIONS)[number] = workspace.historyLimit === "unlimited" || isHistoryLimitPreset(workspace.historyLimit)
    ? workspace.historyLimit
    : "custom";
  const historyLimitIndex = HISTORY_LIMIT_OPTIONS.indexOf(historyLimitMode);
  const scaleOptions = scaleOptionsForUnits(workspace.units);
  const scaleValue = normalizeScaleForUnits(workspace.units, workspace.scale);
  const gridColor = /^#[0-9a-f]{6}$/i.test(workspace.gridColor)
    ? workspace.gridColor
    : DEFAULT_WORKPLANE_WORKSPACE.gridColor;
  const selectedShapeAsset = toolbarShapeAssets.find((asset) => asset.kind === selectedShapeKind) ?? toolbarShapeAssets[0];
  const selectedShapeAppDefaults = shapeAssetDefaultDimensions(selectedShapeKind);
  const selectedShapeCustomization = workspace.shapeCustomizations[selectedShapeKind] ?? {};
  const selectedShapeEffectiveDimensions = {
    width: selectedShapeCustomization.width ?? selectedShapeAppDefaults.width,
    depth: selectedShapeCustomization.depth ?? selectedShapeAppDefaults.depth,
    height: selectedShapeCustomization.height ?? selectedShapeAppDefaults.height,
  };
  const selectedShapeSpecialFields = specialFieldsForShape(selectedShapeKind, selectedShapeEffectiveDimensions, selectedShapeCustomization);
  const selectedShapeCustomized = Object.keys(selectedShapeCustomization).length > 0;

  const sizePresetOptions = WORKSPACE_SIZE_PRESETS.map((preset) => t(`workspaceSettings.sizePresets.${preset.labelKey}`));
  const gridBlockPresetOptions = GRID_BLOCK_PRESETS.map((preset) => t(`workspaceSettings.gridBlockPresets.${preset.labelKey}`));
  const snapGridOptions = SNAP_GRID_LABEL_KEYS.map((key) => t(`snapGrid.${key}`));
  const sizePresetDisplayValue = sizePresetOptions[WORKSPACE_SIZE_PRESETS.findIndex((preset) => preset.label === workspace.sizePreset)] ?? sizePresetOptions[WORKSPACE_SIZE_PRESETS.length - 1];
  const gridBlockPresetDisplayValue = gridBlockPresetOptions[GRID_BLOCK_PRESETS.findIndex((preset) => preset.label === workspace.gridBlockPreset)] ?? gridBlockPresetOptions[GRID_BLOCK_PRESETS.length - 1];
  const snapDisplayValue = snapGridOptions[SNAP_GRID_KEYS.indexOf(snap)] ?? snap;

  useEffect(() => {
    setDimensionDrafts({
      width: workspace.width.toFixed(workspace.accuracy),
      depth: workspace.depth.toFixed(workspace.accuracy),
    });
  }, [workspace.accuracy, workspace.depth, workspace.width]);
  useEffect(() => {
    setGridBlockSizeDraft(workspace.gridBlockSize.toFixed(workspace.accuracy));
  }, [workspace.accuracy, workspace.gridBlockSize]);
  useEffect(() => {
    if (typeof workspace.historyLimit === "number" && !isHistoryLimitPreset(workspace.historyLimit)) {
      setCustomHistoryDraft(String(workspace.historyLimit));
    }
  }, [workspace.historyLimit]);
  const patchWorkspace = (patch: Partial<WorkspaceSettings>) => {
    setDefaultSaved(false);
    const next = { ...workspace, ...patch };
    onWorkspaceChange({ ...next, scale: normalizeScaleForUnits(next.units, next.scale) });
  };
  const patchShapeCustomization = (kind: ShapeKind, patch: Partial<ShapeCustomization>) => {
    const nextEntry = Object.fromEntries(
      Object.entries({ ...workspace.shapeCustomizations[kind], ...patch }).filter(([, value]) => value !== undefined),
    ) as ShapeCustomization;
    const nextCustomizations = { ...workspace.shapeCustomizations };
    if (Object.keys(nextEntry).length > 0) nextCustomizations[kind] = nextEntry;
    else delete nextCustomizations[kind];
    patchWorkspace({ shapeCustomizations: nextCustomizations });
  };
  const setShapeDefaultDimension = (key: "width" | "depth" | "height", rawValue: string) => {
    const parsed = parseMeasurementInput(rawValue);
    if (!Number.isFinite(parsed)) return;
    const nextValue = clamp(parsed, MIN_CUSTOM_SHAPE_DIMENSION, MAX_CUSTOM_SHAPE_DIMENSION);
    patchShapeCustomization(selectedShapeKind, key === "width" && selectedShapeKind === "cone"
      ? { width: nextValue, baseRadius: nextValue / 2 }
      : { [key]: nextValue });
  };
  const setShapeSpecialNumber = (field: Extract<ShapeSpecialField, { type: "number" }>, rawValue: string) => {
    if (!rawValue.trim()) {
      patchShapeCustomization(selectedShapeKind, { [field.key]: undefined });
      return;
    }
    const parsed = parseMeasurementInput(rawValue);
    if (!Number.isFinite(parsed)) return;
    const clamped = clamp(parsed, field.min, field.max);
    const nextValue = field.step === 1 ? Math.round(clamped) : clamped;
    patchShapeCustomization(selectedShapeKind, field.key === "baseRadius" && selectedShapeKind === "cone"
      ? { baseRadius: nextValue, width: nextValue * 2 }
      : { [field.key]: nextValue });
  };
  const setShapeSpecialText = (field: Extract<ShapeSpecialField, { type: "text" }>, rawValue: string) => {
    const nextValue = rawValue.slice(0, field.maxLength);
    patchShapeCustomization(selectedShapeKind, { [field.key]: nextValue || undefined });
  };
  const setShapeLimit = (rawValue: string) => {
    if (!rawValue.trim()) {
      patchShapeCustomization(selectedShapeKind, { maxDimension: undefined });
      return;
    }
    const parsed = parseMeasurementInput(rawValue);
    if (!Number.isFinite(parsed)) return;
    patchShapeCustomization(selectedShapeKind, {
      maxDimension: clamp(parsed, MIN_CUSTOM_SHAPE_DIMENSION, MAX_CUSTOM_SHAPE_DIMENSION),
    });
  };
  const resetSelectedShapeCustomization = () => {
    const nextCustomizations = { ...workspace.shapeCustomizations };
    delete nextCustomizations[selectedShapeKind];
    patchWorkspace({ shapeCustomizations: nextCustomizations });
  };
  const setDimension = (key: "width" | "depth", value: string) => {
    const parsed = parseMeasurementInput(value);
    const next = clamp(Number.isFinite(parsed) ? parsed : workspace[key], MIN_WORKSPACE_SIZE, MAX_WORKSPACE_SIZE);
    setDimensionDrafts((current) => ({ ...current, [key]: next.toFixed(workspace.accuracy) }));
    patchWorkspace({ [key]: next, sizePreset: "Custom" } as Partial<WorkspaceSettings>);
  };
  const setWorkspaceSizePreset = (sizePreset: string) => {
    const preset = WORKSPACE_SIZE_PRESETS.find((entry) => entry.label === sizePreset);
    if (!preset || sizePreset === "Custom") {
      patchWorkspace({ sizePreset: "Custom" });
      return;
    }
    patchWorkspace({ sizePreset, width: preset.width, depth: preset.depth });
  };
  const setGridBlockPreset = (gridBlockPreset: string) => {
    patchWorkspace({ gridBlockPreset, gridBlockSize: gridBlockSizeForPreset(gridBlockPreset, workspace.gridBlockSize) });
  };
  const setGridBlockSize = (value: string) => {
    const parsed = parseMeasurementInput(value);
    const next = clamp(Number.isFinite(parsed) ? parsed : workspace.gridBlockSize, MIN_GRID_BLOCK_SIZE, MAX_GRID_BLOCK_SIZE);
    setGridBlockSizeDraft(next.toFixed(workspace.accuracy));
    patchWorkspace({ gridBlockPreset: "Custom", gridBlockSize: next });
  };
  const setHistoryLimitMode = (mode: (typeof HISTORY_LIMIT_OPTIONS)[number]) => {
    if (mode === "custom") {
      const parsed = Number.parseInt(customHistoryDraft, 10);
      patchWorkspace({ historyLimit: Number.isFinite(parsed) ? clamp(parsed, 1, 5000) : HISTORY_CUSTOM_DEFAULT });
      return;
    }
    patchWorkspace({ historyLimit: mode });
  };
  const setCustomHistoryLimit = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    const next = Number.isFinite(parsed) ? Math.round(clamp(parsed, 1, 5000)) : HISTORY_CUSTOM_DEFAULT;
    setCustomHistoryDraft(String(next));
    patchWorkspace({ historyLimit: next });
  };

  return (
    <div className="workspace-modal" role="dialog" aria-modal="true" aria-label={t("workspaceSettings.title")}>
      <div className="workspace-modal-card" onPointerDown={(event) => event.stopPropagation()}>
        <header className="workspace-modal-header">
          <strong>{t("workspaceSettings.title")}</strong>
          <button aria-label={t("workspaceSettings.closeSettings")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="workspace-modal-layout">
          <nav className="workspace-settings-nav" aria-label={t("workspaceSettings.workspaceSettingsSections")}>
            <button className={activeSection === "appearance" ? "active" : ""} aria-current={activeSection === "appearance" ? "page" : undefined} onClick={() => setActiveSection("appearance")}>
              <Palette size={18} />
              <span>{t("workspaceSettings.appearance")}</span>
            </button>
            <button className={activeSection === "measurement" ? "active" : ""} aria-current={activeSection === "measurement" ? "page" : undefined} onClick={() => setActiveSection("measurement")}>
              <Ruler size={18} />
              <span>{t("workspaceSettings.measurement")}</span>
            </button>
            <button className={activeSection === "workplane" ? "active" : ""} aria-current={activeSection === "workplane" ? "page" : undefined} onClick={() => setActiveSection("workplane")}>
              <Grid3X3 size={18} />
              <span>{t("workspaceSettings.workplane")}</span>
            </button>
            <button className={activeSection === "shapes" ? "active" : ""} aria-current={activeSection === "shapes" ? "page" : undefined} onClick={() => setActiveSection("shapes")}>
              <BoxIcon size={18} />
              <span>{t("workspaceSettings.shapeDefaults")}</span>
            </button>
            <button className={activeSection === "history" ? "active" : ""} aria-current={activeSection === "history" ? "page" : undefined} onClick={() => setActiveSection("history")}>
              <History size={18} />
              <span>{t("workspaceSettings.history")}</span>
            </button>
          </nav>

          <div className="workspace-modal-content">
            <div className="workspace-modal-body">
              {activeSection === "appearance" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>{t("workspaceSettings.appearance")}</strong>
                    <span>{t("workspaceSettings.appearanceDescription")}</span>
                  </div>
                  <label className="workspace-select">
                    <span>{t("workspaceSettings.theme")}</span>
                    <select
                      value={themePreference}
                      onChange={(event) => onThemePreferenceChange?.(event.currentTarget.value as AppThemePreference)}
                    >
                      {APP_THEME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(`theme.${option.value}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="workspace-global-note">{t("workspaceSettings.themeAppliesAcross")}</p>
                  <WorkspaceToggle
                    label={t("workspaceSettings.showProjectName")}
                    checked={showProjectNameInToolbar}
                    onChange={(show) => onShowProjectNameInToolbarChange?.(show)}
                  />
                  <WorkspaceToggle
                    label={t("workspaceSettings.showMovementDimensions")}
                    checked={moveDimensionsEnabled}
                    onChange={onMoveDimensionsEnabledChange}
                  />
                  <WorkspaceToggle
                    label={t("workspaceSettings.selectBeforeMove")}
                    checked={workspace.selectBeforeMove}
                    onChange={(selectBeforeMove) => patchWorkspace({ selectBeforeMove })}
                  />
                  <WorkspaceToggle label={t("workspaceSettings.showShadows")} checked={workspace.showShadows} onChange={(showShadows) => patchWorkspace({ showShadows })} />
                  <WorkspaceToggle
                    label={t("workspaceSettings.cruiseWhenAdding")}
                    checked={workspace.cruiseShapes}
                    onChange={(cruiseShapes) => patchWorkspace({ cruiseShapes })}
                  />
                  <label className="workspace-range">
                    <span>{t("workspaceSettings.zoomSpeed")}</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={workspace.zoomSpeed}
                      onChange={(event) => patchWorkspace({ zoomSpeed: Number(event.currentTarget.value) })}
                    />
                    <small>
                      <span>{t("workspaceSettings.slow")}</span>
                      <span>{t("workspaceSettings.fast")}</span>
                    </small>
                  </label>
                </>
              ) : null}

              {activeSection === "measurement" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>{t("workspaceSettings.measurement")}</strong>
                    <span>{t("workspaceSettings.measurementDescription")}</span>
                  </div>
                  <div className="workspace-select">
                    <span>{t("workspaceSettings.units")}</span>
                    <select
                      value={workspace.units}
                      onChange={(event) => patchWorkspace({ units: event.currentTarget.value })}
                    >
                      {WORKSPACE_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {t(unitLabelKey(unit))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="workspace-select">
                    <span>{t("workspaceSettings.scale")}</span>
                    <select
                      value={scaleValue}
                      onChange={(event) => patchWorkspace({ scale: event.currentTarget.value })}
                    >
                      {scaleOptions.map((scale) => (
                        <option key={scale} value={scale}>
                          {t(scaleLabelKey(workspace.units, scale))}
                        </option>
                      ))}
                    </select>
                  </div>
                  <WorkspaceSelect
                    label={t("workspaceSettings.accuracy")}
                    value={`0.${"0".repeat(workspace.accuracy)}`}
                    options={["0.0", "0.00", "0.000"]}
                    onChange={(accuracy) => patchWorkspace({ accuracy: accuracy.slice(2).length as WorkspaceSettings["accuracy"] })}
                  />
                  <WorkspaceSelect
                    label={t("snapGrid.label")}
                    value={snapDisplayValue}
                    options={snapGridOptions}
                    onChange={(next) => {
                      const index = snapGridOptions.indexOf(next);
                      const gridSize = SNAP_GRID_KEYS[index];
                      if (!gridSize) return;
                      setDefaultSaved(false);
                      onSnapChange(gridSize);
                    }}
                  />
                </>
              ) : null}

              {activeSection === "workplane" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>{t("workspaceSettings.workplane")}</strong>
                    <span>{t("workspaceSettings.workplaneDescription")}</span>
                  </div>
                  <WorkspaceSelect
                    label={t("workspaceSettings.workplaneSize")}
                    value={sizePresetDisplayValue}
                    options={sizePresetOptions}
                    onChange={(label) => {
                      const index = sizePresetOptions.indexOf(label);
                      const preset = WORKSPACE_SIZE_PRESETS[index];
                      if (preset) setWorkspaceSizePreset(preset.label);
                    }}
                  />
                  <div className="workspace-dimensions">
                    <label>
                      <span>{t("workspaceSettings.width")}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={dimensionDrafts.width}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setDimensionDrafts((current) => ({ ...current, width: value }));
                        }}
                        onBlur={(event) => setDimension("width", event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </label>
                    <label>
                      <span>{t("workspaceSettings.length")}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={dimensionDrafts.depth}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setDimensionDrafts((current) => ({ ...current, depth: value }));
                        }}
                        onBlur={(event) => setDimension("depth", event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </label>
                  </div>
                  <WorkspaceSelect
                    label={t("workspaceSettings.gridBlockSize")}
                    value={gridBlockPresetDisplayValue}
                    options={gridBlockPresetOptions}
                    onChange={(label) => {
                      const index = gridBlockPresetOptions.indexOf(label);
                      const preset = GRID_BLOCK_PRESETS[index];
                      if (preset) setGridBlockPreset(preset.label);
                    }}
                  />
                  <GridColorControl color={gridColor} onChange={(nextGridColor) => patchWorkspace({ gridColor: nextGridColor })} />
                  {workspace.gridBlockPreset === "Custom" ? (
                    <div className="workspace-dimensions workspace-grid-dimensions">
                      <label>
                        <span>{t("workspaceSettings.blockSize")}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={gridBlockSizeDraft}
                          onChange={(event) => setGridBlockSizeDraft(event.currentTarget.value)}
                          onBlur={(event) => setGridBlockSize(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      </label>
                    </div>
                  ) : null}
                </>
              ) : null}

              {activeSection === "shapes" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>{t("workspaceSettings.shapeDefaults")}</strong>
                    <span>{t("workspaceSettings.shapeDefaultsDescription")}</span>
                  </div>
                  <label className="workspace-shape-picker">
                    <span>{t("workspaceSettings.shape")}</span>
                    <span className="workspace-shape-picker-control">
                      <img src={selectedShapeAsset.menuIcon} alt="" />
                      <select value={selectedShapeKind} onChange={(event) => setSelectedShapeKind(event.currentTarget.value as ShapeKind)}>
                        {toolbarShapeAssets.map((asset) => (
                          <option key={asset.kind} value={asset.kind}>
                            {asset.name}{workspace.shapeCustomizations[asset.kind] ? ` ${t("shapes.shapeCustomized")}` : ""}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <div className="workspace-shape-card">
                    <div className="workspace-shape-card-heading">
                      <span>
                        <strong>{selectedShapeAsset.name}</strong>
                        <small>{selectedShapeCustomized ? t("shapes.customSettingsActive") : t("shapes.usingDefaults")}</small>
                      </span>
                      <button type="button" onClick={resetSelectedShapeCustomization} disabled={!selectedShapeCustomized}>
                        <RotateCcw size={14} />
                        <span>{t("shapes.useAppDefaults")}</span>
                      </button>
                    </div>
                    <div className="workspace-shape-dimensions">
                      {(["width", "depth", "height"] as const).map((key) => (
                        <label key={`${selectedShapeKind}-${key}`}>
                          <span>{key === "depth" ? t("workspaceSettings.length") : key[0].toUpperCase() + key.slice(1)}</span>
                          <input
                            key={`${selectedShapeKind}-${key}-${selectedShapeCustomization[key] ?? "app"}`}
                            type="text"
                            inputMode="decimal"
                            defaultValue={(selectedShapeCustomization[key] ?? selectedShapeAppDefaults[key]).toFixed(workspace.accuracy)}
                            onBlur={(event) => setShapeDefaultDimension(key, event.currentTarget.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") event.currentTarget.blur();
                            }}
                          />
                          <small>{t("workspaceSettings.appDefault", { value: selectedShapeAppDefaults[key] })} mm</small>
                        </label>
                      ))}
                    </div>
                    {selectedShapeSpecialFields.length > 0 ? (
                      <div className="workspace-shape-specials">
                        <div className="workspace-shape-specials-heading">
                          <strong>{t("shapes.shapeDetails")}</strong>
                          <small>{t("shapes.extraDefaults")}</small>
                        </div>
                        <div className="workspace-shape-special-fields">
                          {selectedShapeSpecialFields.map((field) => {
                            const customizedValue = selectedShapeCustomization[field.key];
                            const effectiveValue = customizedValue ?? field.defaultValue;
                            if (field.type === "select") {
                              const defaultOption = field.options.find((option) => option.value === field.defaultValue);
                              return (
                                <label key={`${selectedShapeKind}-${field.key}`}>
                                  <span>{t(`shapes.${field.labelKey}`)}</span>
                                  <select
                                    value={String(effectiveValue)}
                                    onChange={(event) => patchShapeCustomization(selectedShapeKind, { [field.key]: event.currentTarget.value })}
                                  >
                                    {field.options.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                                  </select>
                                  <small>{t("workspaceSettings.appDefault", { value: defaultOption ? t(defaultOption.labelKey) : field.defaultValue })}</small>
                                </label>
                              );
                            }
                            if (field.type === "text") {
                              return (
                                <label key={`${selectedShapeKind}-${field.key}`}>
                                  <span>{t(`shapes.${field.labelKey}`)}</span>
                                  <input
                                    key={`${selectedShapeKind}-${field.key}-${String(customizedValue ?? "app")}`}
                                    type="text"
                                    maxLength={field.maxLength}
                                    defaultValue={String(effectiveValue)}
                                    onBlur={(event) => setShapeSpecialText(field, event.currentTarget.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") event.currentTarget.blur();
                                    }}
                                  />
                                  <small>{t("workspaceSettings.appDefault", { value: field.defaultValue })}</small>
                                </label>
                              );
                            }
                            const numericValue = Number(effectiveValue);
                            return (
                              <label key={`${selectedShapeKind}-${field.key}`}>
                                <span>{t(`shapes.${field.labelKey}`)}</span>
                                <input
                                  key={`${selectedShapeKind}-${field.key}-${String(customizedValue ?? "app")}-${field.defaultValue}`}
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={field.step === 1 ? String(Math.round(numericValue)) : numericValue.toFixed(workspace.accuracy)}
                                  onBlur={(event) => setShapeSpecialNumber(field, event.currentTarget.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                />
                                <small>{t("workspaceSettings.appDefault", { value: field.step === 1 ? Math.round(field.defaultValue) : Number(field.defaultValue.toFixed(workspace.accuracy)) })}{field.unit ? ` ${field.unit}` : ""}</small>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <label className="workspace-shape-limit">
                      <span>
                        <strong>{t("shapes.customSizeLimit")}</strong>
                        <small>{t("shapes.leaveBlankKeepLimits")}</small>
                      </span>
                      <input
                        key={`${selectedShapeKind}-limit-${selectedShapeCustomization.maxDimension ?? "app"}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={selectedShapeCustomization.maxDimension?.toFixed(workspace.accuracy) ?? ""}
                        placeholder={t("shapes.custom")}
                        onBlur={(event) => setShapeLimit(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </label>
                    <p className="workspace-shape-note">{t("shapes.customValuesApplyToNew")} A custom size limit also replaces this shape&apos;s existing resize ceilings, up to 2000 mm.</p>
                  </div>
                </>
              ) : null}

              {activeSection === "history" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>{t("workspaceSettings.savedHistory")}</strong>
                    <span>{t("workspaceSettings.historyDescription")}</span>
                  </div>
                  <div className="workspace-history-setting">
                    <div
                      className="workspace-history-range-control"
                      data-limit={String(historyLimitMode)}
                    >
                      <input
                        type="range"
                        min={0}
                        max={HISTORY_LIMIT_OPTIONS.length - 1}
                        step={1}
                        value={historyLimitIndex}
                        aria-label={t("workspaceSettings.actionsToRetain")}
                        aria-valuetext={historyLimitMode === "unlimited" ? t("workspaceSettings.unlimited") : historyLimitMode === "custom" ? `${workspace.historyLimit} actions` : `${historyLimitMode} actions`}
                        onChange={(event) => setHistoryLimitMode(HISTORY_LIMIT_OPTIONS[Number(event.currentTarget.value)] ?? "unlimited")}
                      />
                    </div>
                    <div className="workspace-history-labels" aria-hidden="true">
                      {HISTORY_LIMIT_OPTIONS.map((option) => (
                        <span key={option} className={historyLimitMode === option ? "active" : undefined}>
                          {option === "unlimited" ? t("workspaceSettings.unlimited") : option === "custom" ? t("workspaceSettings.custom") : option}
                        </span>
                      ))}
                    </div>
                    {historyLimitMode === "custom" ? (
                      <label className="workspace-history-custom">
                        <span>{t("workspaceSettings.actionsToRetain")}</span>
                        <input
                          type="number"
                          min={1}
                          max={5000}
                          step={1}
                          value={customHistoryDraft}
                          onChange={(event) => setCustomHistoryDraft(event.currentTarget.value)}
                          onBlur={(event) => setCustomHistoryLimit(event.currentTarget.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                          }}
                        />
                      </label>
                    ) : null}
                    <p className="workspace-history-note">{t("workspaceSettings.actionsDefault")}</p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="workspace-modal-footer">
              <span>{t("workspaceSettings.saveSettings")}</span>
              <button
                className="make-default-button"
                onClick={() => {
                  onMakeDefault();
                  setDefaultSaved(true);
                }}
              >
                {defaultSaved ? t("workspaceSettings.defaultSaved") : t("workspaceSettings.makeDefault")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <button className="workspace-modal-backdrop" aria-label={t("workspaceSettings.closeSettings")} onClick={onClose} />
    </div>
  );
}

const GRID_COLOR_PRESETS = [
  DEFAULT_WORKPLANE_WORKSPACE.gridColor,
  "#0e69f1",
  "#23a66f",
  "#e0842f",
  "#dc5252",
  "#945bd4",
  "#718695",
] as const;

function GridColorControl({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(color);
  const draftColorRef = useRef(color);
  const pickerCommitAbortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const previewColor = (nextColor: string) => {
    draftColorRef.current = nextColor;
    setDraftColor(nextColor);
  };

  const commitDraftColor = () => {
    onChange(draftColorRef.current);
  };

  const armPickerCommit = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pickerCommitAbortRef.current?.abort();
    const controller = new AbortController();
    pickerCommitAbortRef.current = controller;
    const finish = () => {
      commitDraftColor();
      controller.abort();
      if (pickerCommitAbortRef.current === controller) {
        pickerCommitAbortRef.current = null;
      }
    };
    window.addEventListener("pointerup", finish, { once: true, signal: controller.signal });
    window.addEventListener("pointercancel", finish, { once: true, signal: controller.signal });
  };

  useEffect(() => () => pickerCommitAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) {
      previewColor(color);
    }
  }, [color, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePopoverPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const width = Math.min(286, Math.max(220, window.innerWidth - viewportPadding * 2));
      const measuredHeight = popoverRef.current?.offsetHeight ?? 320;
      const roomBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
      const roomAbove = triggerRect.top - viewportPadding;
      const openAbove = roomBelow < measuredHeight + gap && roomAbove > roomBelow;
      const preferredTop = openAbove
        ? triggerRect.top - measuredHeight - gap
        : triggerRect.bottom + gap;
      const top = Math.min(
        Math.max(viewportPadding, preferredTop),
        Math.max(viewportPadding, window.innerHeight - measuredHeight - viewportPadding),
      );
      const left = Math.min(
        Math.max(viewportPadding, triggerRect.right - width),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      const popover = popoverRef.current;
      if (!popover) return;
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.width = `${width}px`;
      popover.style.visibility = "visible";
    };

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open]);

  const popover = open && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={popoverRef}
        className="workspace-color-popover"
        role="group"
        aria-label={t("workspaceSettings.gridColorPicker")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
      >
        <div onPointerDownCapture={armPickerCommit}>
          <HexColorPicker
            className="workspace-hex-color-picker"
            color={draftColor}
            onChange={previewColor}
            onChangeEnd={(nextColor) => {
              previewColor(nextColor);
              onChange(nextColor);
            }}
          />
        </div>
        <div className="workspace-color-presets" aria-label={t("workspaceSettings.gridColorPresets")}>
          {GRID_COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              className={preset.toLowerCase() === draftColor.toLowerCase() ? "selected" : ""}
              type="button"
              aria-label={`${t("workspaceSettings.gridColorPicker")} — ${preset}`}
              aria-pressed={preset.toLowerCase() === draftColor.toLowerCase()}
              style={{ backgroundColor: preset }}
              onClick={() => {
                previewColor(preset);
                onChange(preset);
              }}
            />
          ))}
        </div>
        <div className="workspace-color-popover-footer">
          <label>
            <span>{t("workspaceSettings.hex")}</span>
            <HexColorInput
              color={draftColor}
              onChange={previewColor}
              onBlur={commitDraftColor}
              prefixed
              aria-label={t("workspaceSettings.gridColorPicker")}
            />
          </label>
          <button
            className="workspace-color-reset"
            type="button"
            title={t("workspaceSettings.resetGridColor")}
            aria-label={t("workspaceSettings.resetGridColor")}
            onClick={() => {
              previewColor(DEFAULT_WORKPLANE_WORKSPACE.gridColor);
              onChange(DEFAULT_WORKPLANE_WORKSPACE.gridColor);
            }}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="workspace-row workspace-grid-color-row">
      <span>{t("workspaceSettings.gridColor")}</span>
      <div
        className="workspace-color-control"
        ref={rootRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          className="workspace-color-trigger"
          type="button"
          aria-label={`${t("workspaceSettings.gridColor")} ${color}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (!open) {
              previewColor(color);
            }
            setOpen((current) => !current);
          }}
        >
          <span className="workspace-color-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
          <span>{color.toUpperCase()}</span>
          <ChevronDown className={open ? "open" : ""} size={15} aria-hidden="true" />
        </button>
        {popover}
      </div>
    </div>
  );
}

function WorkspaceToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="workspace-toggle">
      <span className="workspace-toggle-copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  );
}

function WorkspaceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="workspace-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
