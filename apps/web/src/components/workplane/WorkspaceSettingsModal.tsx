"use client";

import { Box as BoxIcon, ChevronDown, Grid3X3, History, Palette, RotateCcw, Ruler, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { APP_THEME_OPTIONS, type AppThemePreference } from "@/lib/appTheme";
import { gearCenterHoleLimits, gearToothPitch } from "@/lib/gearGeometry";
import { normalizeScaleForUnits, parseMeasurementInput, scaleOptionsForUnits, WORKSPACE_UNIT_OPTIONS } from "@/lib/measurementUnits";
import { shapeAssetDefaultDimensions, shapeAssetSpecialDefaults, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { DEFAULT_WORKPLANE_WORKSPACE, MAX_CUSTOM_SHAPE_DIMENSION, MAX_HIGH_RESOLUTION_SIDES, MIN_CUSTOM_SHAPE_DIMENSION } from "@/lib/workplaneSettings";
import type { GearType, GridSize, ShapeCustomization, ShapeKind, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type WorkspaceSettings = WorkplaneWorkspaceSettings;
type WorkspaceSettingsSection = "appearance" | "measurement" | "workplane" | "shapes" | "history";

const GRID_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];
const MIN_WORKSPACE_SIZE = 60;
const MAX_WORKSPACE_SIZE = 2000;
const MIN_GRID_BLOCK_SIZE = 1;
const MAX_GRID_BLOCK_SIZE = 200;
const WORKSPACE_SIZE_PRESETS = [
  { label: "200 x 200 mm", width: 200, depth: 200 },
  { label: "300 x 300 mm", width: 300, depth: 300 },
  { label: "500 x 500 mm", width: 500, depth: 500 },
  { label: "1000 x 1000 mm", width: 1000, depth: 1000 },
  { label: "2000 x 2000 mm", width: 2000, depth: 2000 },
  { label: "Custom", width: 200, depth: 200 },
];
const GRID_BLOCK_PRESETS = ["1 mm", "2.5 mm", "5 mm", "10 mm", "20 mm", "50 mm", "100 mm", "Custom"] as const;
const HISTORY_LIMIT_OPTIONS = [30, 50, 100, "unlimited", "custom"] as const;
const HISTORY_CUSTOM_DEFAULT = 250;
const TEXT_FONT_OPTIONS = ["Multilanguage", "Sans", "Serif", "Script", "Monospace", "Rounded", "Stencil"];
const GEAR_TYPE_OPTIONS: Array<{ value: GearType; label: string }> = [
  { value: "spur", label: "Spur gear" },
  { value: "helical", label: "Helical gear" },
  { value: "bevel", label: "Bevel gear" },
];

type ShapeSpecialNumberKey = "steps" | "sides" | "bevel" | "segments" | "topRadius" | "baseRadius" | "teeth" | "toothSize" | "toothWidth" | "centerHoleSize" | "helixAngle" | "helixQuality";
type ShapeSpecialField =
  | { type: "number"; key: ShapeSpecialNumberKey; label: string; defaultValue: number; min: number; max: number; step?: number; unit?: string }
  | { type: "select"; key: "font" | "gearType"; label: string; defaultValue: string; options: Array<{ value: string; label: string }> }
  | { type: "text"; key: "text"; label: string; defaultValue: string; maxLength: number };

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
  if (kind === "cylinder") return [{ type: "number", key: "sides", label: "Sides", defaultValue: defaults.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 }];
  if (kind === "sphere" || kind === "halfSphere") return [{ type: "number", key: "steps", label: "Steps", defaultValue: defaults.steps ?? 24, min: 6, max: 64, step: 1 }];
  if (kind === "cone") {
    return [
      { type: "number", key: "topRadius", label: "Top radius", defaultValue: defaults.topRadius ?? 0, min: 0, max: MAX_CUSTOM_SHAPE_DIMENSION / 2, unit: "mm" },
      { type: "number", key: "baseRadius", label: "Base radius", defaultValue: defaults.baseRadius ?? dimensions.width / 2, min: MIN_CUSTOM_SHAPE_DIMENSION, max: MAX_CUSTOM_SHAPE_DIMENSION / 2, unit: "mm" },
      { type: "number", key: "sides", label: "Sides", defaultValue: defaults.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 },
    ];
  }
  if (kind === "pyramid") return [{ type: "number", key: "sides", label: "Sides", defaultValue: defaults.sides ?? 4, min: 3, max: 24, step: 1 }];
  if (kind === "roundRoof") return [{ type: "number", key: "sides", label: "Sides", defaultValue: defaults.sides ?? 64, min: 4, max: MAX_HIGH_RESOLUTION_SIDES, step: 1 }];
  if (kind === "tube" || kind === "ring") return [{ type: "number", key: "bevel", label: "Thickness", defaultValue: defaults.bevel ?? 4, min: 0.5, max: 20, unit: "mm" }];
  if (kind === "text") {
    return [
      { type: "text", key: "text", label: "Text", defaultValue: defaults.text ?? "TEXT", maxLength: 24 },
      { type: "select", key: "font", label: "Font", defaultValue: defaults.font ?? "Multilanguage", options: TEXT_FONT_OPTIONS.map((value) => ({ value, label: value })) },
      { type: "number", key: "bevel", label: "Bevel", defaultValue: defaults.bevel ?? 0, min: 0, max: 8, unit: "mm" },
      { type: "number", key: "segments", label: "Segments", defaultValue: defaults.segments ?? 0, min: 0, max: 24, step: 1 },
    ];
  }
  if (kind === "gear") {
    const teeth = customization.teeth ?? defaults.teeth ?? 12;
    const toothSize = customization.toothSize ?? defaults.toothSize ?? 2.5;
    const toothPitch = gearToothPitch(dimensions.width, dimensions.depth, teeth);
    const centerHoleLimits = gearCenterHoleLimits(dimensions.width, dimensions.depth, toothSize);
    const gearType = customization.gearType ?? defaults.gearType ?? "spur";
    const fields: ShapeSpecialField[] = [
      { type: "select", key: "gearType", label: "Gear type", defaultValue: defaults.gearType ?? "spur", options: GEAR_TYPE_OPTIONS },
      { type: "number", key: "teeth", label: "Teeth", defaultValue: defaults.teeth ?? 12, min: 6, max: 64, step: 1 },
      { type: "number", key: "toothSize", label: "Tooth size", defaultValue: defaults.toothSize ?? 2.5, min: 0.2, max: Math.max(0.2, Math.min(dimensions.width, dimensions.depth) * 0.22), unit: "mm" },
      { type: "number", key: "toothWidth", label: "Tooth width", defaultValue: defaults.toothWidth ?? toothPitch * 0.54, min: toothPitch * 0.12, max: toothPitch * 0.82, unit: "mm" },
      { type: "number", key: "centerHoleSize", label: "Center hole", defaultValue: defaults.centerHoleSize ?? 6, min: centerHoleLimits.min, max: centerHoleLimits.max, unit: "mm" },
    ];
    if (gearType === "helical") {
      fields.push(
        { type: "number", key: "helixAngle", label: "Helix angle", defaultValue: defaults.helixAngle ?? 22.5, min: -45, max: 45, unit: "deg" },
        { type: "number", key: "helixQuality", label: "Helix quality", defaultValue: defaults.helixQuality ?? 16, min: 4, max: 32, step: 1 },
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
    <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Workspace settings">
      <div className="workspace-modal-card" onPointerDown={(event) => event.stopPropagation()}>
        <header className="workspace-modal-header">
          <strong>Workspace settings</strong>
          <button aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="workspace-modal-layout">
          <nav className="workspace-settings-nav" aria-label="Workspace settings sections">
            <button className={activeSection === "appearance" ? "active" : ""} aria-current={activeSection === "appearance" ? "page" : undefined} onClick={() => setActiveSection("appearance")}>
              <Palette size={18} />
              <span>Appearance</span>
            </button>
            <button className={activeSection === "measurement" ? "active" : ""} aria-current={activeSection === "measurement" ? "page" : undefined} onClick={() => setActiveSection("measurement")}>
              <Ruler size={18} />
              <span>Measurement</span>
            </button>
            <button className={activeSection === "workplane" ? "active" : ""} aria-current={activeSection === "workplane" ? "page" : undefined} onClick={() => setActiveSection("workplane")}>
              <Grid3X3 size={18} />
              <span>Workplane</span>
            </button>
            <button className={activeSection === "shapes" ? "active" : ""} aria-current={activeSection === "shapes" ? "page" : undefined} onClick={() => setActiveSection("shapes")}>
              <BoxIcon size={18} />
              <span>Shape defaults</span>
            </button>
            <button className={activeSection === "history" ? "active" : ""} aria-current={activeSection === "history" ? "page" : undefined} onClick={() => setActiveSection("history")}>
              <History size={18} />
              <span>History</span>
            </button>
          </nav>

          <div className="workspace-modal-content">
            <div className="workspace-modal-body">
              {activeSection === "appearance" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>Appearance</strong>
                    <span>Adjust the canvas and navigation behavior.</span>
                  </div>
                  <label className="workspace-select">
                    <span>Theme</span>
                    <select
                      value={themePreference}
                      onChange={(event) => onThemePreferenceChange?.(event.currentTarget.value as AppThemePreference)}
                    >
                      {APP_THEME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="workspace-global-note">Theme applies across SketchForge and all projects.</p>
                  <WorkspaceToggle
                    label="Show project name in toolbar"
                    checked={showProjectNameInToolbar}
                    onChange={(show) => onShowProjectNameInToolbarChange?.(show)}
                  />
                  <WorkspaceToggle
                    label="Show movement dimensions"
                    checked={moveDimensionsEnabled}
                    onChange={onMoveDimensionsEnabledChange}
                  />
                  <WorkspaceToggle
                    label="Select before moving"
                    checked={workspace.selectBeforeMove}
                    onChange={(selectBeforeMove) => patchWorkspace({ selectBeforeMove })}
                  />
                  <WorkspaceToggle label="Show shadows" checked={workspace.showShadows} onChange={(showShadows) => patchWorkspace({ showShadows })} />
                  <WorkspaceToggle
                    label="Cruise when adding new shapes"
                    checked={workspace.cruiseShapes}
                    onChange={(cruiseShapes) => patchWorkspace({ cruiseShapes })}
                  />
                  <label className="workspace-range">
                    <span>Zoom speed</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={workspace.zoomSpeed}
                      onChange={(event) => patchWorkspace({ zoomSpeed: Number(event.currentTarget.value) })}
                    />
                    <small>
                      <span>Slow</span>
                      <span>Fast</span>
                    </small>
                  </label>
                </>
              ) : null}

              {activeSection === "measurement" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>Measurement</strong>
                    <span>Choose units, precision, scale, and snapping.</span>
                  </div>
                  <WorkspaceSelect
                    label="Units"
                    value={workspace.units}
                    options={WORKSPACE_UNIT_OPTIONS}
                    onChange={(units) => patchWorkspace({ units })}
                  />
                  <WorkspaceSelect
                    label="Scale"
                    value={scaleValue}
                    options={scaleOptions}
                    onChange={(scale) => patchWorkspace({ scale })}
                  />
                  <WorkspaceSelect
                    label="Accuracy"
                    value={`0.${"0".repeat(workspace.accuracy)}`}
                    options={["0.0", "0.00", "0.000"]}
                    onChange={(accuracy) => patchWorkspace({ accuracy: accuracy.slice(2).length as WorkspaceSettings["accuracy"] })}
                  />
                  <WorkspaceSelect
                    label="Snap Grid"
                    value={snap}
                    options={GRID_SIZES}
                    onChange={(next) => {
                      setDefaultSaved(false);
                      onSnapChange(next as GridSize);
                    }}
                  />
                </>
              ) : null}

              {activeSection === "workplane" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>Workplane</strong>
                    <span>Set the plate dimensions and visible grid spacing.</span>
                  </div>
                  <WorkspaceSelect
                    label="Workplane size"
                    value={workspace.sizePreset}
                    options={WORKSPACE_SIZE_PRESETS.map((preset) => preset.label)}
                    onChange={setWorkspaceSizePreset}
                  />
                  <div className="workspace-dimensions">
                    <label>
                      <span>Width</span>
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
                      <span>Length</span>
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
                  <WorkspaceSelect label="Grid block size" value={workspace.gridBlockPreset} options={GRID_BLOCK_PRESETS} onChange={setGridBlockPreset} />
                  <GridColorControl color={gridColor} onChange={(nextGridColor) => patchWorkspace({ gridColor: nextGridColor })} />
                  {workspace.gridBlockPreset === "Custom" ? (
                    <div className="workspace-dimensions workspace-grid-dimensions">
                      <label>
                        <span>Block size</span>
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
                    <strong>Shape defaults</strong>
                    <span>Customize how each toolbar shape starts. Existing limits stay unchanged until you enter a custom limit.</span>
                  </div>
                  <label className="workspace-shape-picker">
                    <span>Shape</span>
                    <span className="workspace-shape-picker-control">
                      <img src={selectedShapeAsset.menuIcon} alt="" />
                      <select value={selectedShapeKind} onChange={(event) => setSelectedShapeKind(event.currentTarget.value as ShapeKind)}>
                        {toolbarShapeAssets.map((asset) => (
                          <option key={asset.kind} value={asset.kind}>
                            {asset.name}{workspace.shapeCustomizations[asset.kind] ? " — customized" : ""}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <div className="workspace-shape-card">
                    <div className="workspace-shape-card-heading">
                      <span>
                        <strong>{selectedShapeAsset.name}</strong>
                        <small>{selectedShapeCustomized ? "Custom settings active" : "Using SketchForge defaults"}</small>
                      </span>
                      <button type="button" onClick={resetSelectedShapeCustomization} disabled={!selectedShapeCustomized}>
                        <RotateCcw size={14} />
                        <span>Use app defaults</span>
                      </button>
                    </div>
                    <div className="workspace-shape-dimensions">
                      {(["width", "depth", "height"] as const).map((key) => (
                        <label key={`${selectedShapeKind}-${key}`}>
                          <span>{key === "depth" ? "Length" : key[0].toUpperCase() + key.slice(1)}</span>
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
                          <small>App: {selectedShapeAppDefaults[key]} mm</small>
                        </label>
                      ))}
                    </div>
                    {selectedShapeSpecialFields.length > 0 ? (
                      <div className="workspace-shape-specials">
                        <div className="workspace-shape-specials-heading">
                          <strong>Shape details</strong>
                          <small>Extra defaults used when this shape is added.</small>
                        </div>
                        <div className="workspace-shape-special-fields">
                          {selectedShapeSpecialFields.map((field) => {
                            const customizedValue = selectedShapeCustomization[field.key];
                            const effectiveValue = customizedValue ?? field.defaultValue;
                            if (field.type === "select") {
                              return (
                                <label key={`${selectedShapeKind}-${field.key}`}>
                                  <span>{field.label}</span>
                                  <select
                                    value={String(effectiveValue)}
                                    onChange={(event) => patchShapeCustomization(selectedShapeKind, { [field.key]: event.currentTarget.value })}
                                  >
                                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                  </select>
                                  <small>App: {field.options.find((option) => option.value === field.defaultValue)?.label ?? field.defaultValue}</small>
                                </label>
                              );
                            }
                            if (field.type === "text") {
                              return (
                                <label key={`${selectedShapeKind}-${field.key}`}>
                                  <span>{field.label}</span>
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
                                  <small>App: {field.defaultValue}</small>
                                </label>
                              );
                            }
                            const numericValue = Number(effectiveValue);
                            return (
                              <label key={`${selectedShapeKind}-${field.key}`}>
                                <span>{field.label}</span>
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
                                <small>App: {field.step === 1 ? Math.round(field.defaultValue) : Number(field.defaultValue.toFixed(workspace.accuracy))}{field.unit ? ` ${field.unit}` : ""}</small>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <label className="workspace-shape-limit">
                      <span>
                        <strong>Custom size limit</strong>
                        <small>Leave blank to keep all current inspector and drag limits for this shape.</small>
                      </span>
                      <input
                        key={`${selectedShapeKind}-limit-${selectedShapeCustomization.maxDimension ?? "app"}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={selectedShapeCustomization.maxDimension?.toFixed(workspace.accuracy) ?? ""}
                        placeholder="App limits"
                        onBlur={(event) => setShapeLimit(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    </label>
                    <p className="workspace-shape-note">Custom values apply to new shapes. A custom size limit also replaces this shape&apos;s existing resize ceilings, up to 2000 mm.</p>
                  </div>
                </>
              ) : null}

              {activeSection === "history" ? (
                <>
                  <div className="workspace-section-heading">
                    <strong>Saved history</strong>
                    <span>Choose how many completed actions remain available after saving or reopening this project.</span>
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
                        aria-label="Saved history actions"
                        aria-valuetext={historyLimitMode === "unlimited" ? "Unlimited" : historyLimitMode === "custom" ? `${workspace.historyLimit} actions` : `${historyLimitMode} actions`}
                        onChange={(event) => setHistoryLimitMode(HISTORY_LIMIT_OPTIONS[Number(event.currentTarget.value)] ?? "unlimited")}
                      />
                    </div>
                    <div className="workspace-history-labels" aria-hidden="true">
                      {HISTORY_LIMIT_OPTIONS.map((option) => (
                        <span key={option} className={historyLimitMode === option ? "active" : undefined}>
                          {option === "unlimited" ? "Unlimited" : option === "custom" ? "Custom" : option}
                        </span>
                      ))}
                    </div>
                    {historyLimitMode === "custom" ? (
                      <label className="workspace-history-custom">
                        <span>Actions to retain</span>
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
                    <p className="workspace-history-note">
                      100 actions is the default. Lower limits permanently discard older Undo states from this project.
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <div className="workspace-modal-footer">
              <span>Save the current settings for this project.</span>
              <button
                className="make-default-button"
                onClick={() => {
                  onMakeDefault();
                  setDefaultSaved(true);
                }}
              >
                {defaultSaved ? "Default saved" : "Make default"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <button className="workspace-modal-backdrop" aria-label="Close settings" onClick={onClose} />
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
        aria-label="Grid color picker"
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
        <div className="workspace-color-presets" aria-label="Grid color presets">
          {GRID_COLOR_PRESETS.map((preset) => (
            <button
              key={preset}
              className={preset.toLowerCase() === draftColor.toLowerCase() ? "selected" : ""}
              type="button"
              aria-label={`Use grid color ${preset}`}
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
            <span>HEX</span>
            <HexColorInput
              color={draftColor}
              onChange={previewColor}
              onBlur={commitDraftColor}
              prefixed
              aria-label="Grid color hexadecimal value"
            />
          </label>
          <button
            className="workspace-color-reset"
            type="button"
            title="Reset grid color"
            aria-label="Reset grid color"
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
      <span>Grid color</span>
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
          aria-label={`Grid color ${color}`}
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
