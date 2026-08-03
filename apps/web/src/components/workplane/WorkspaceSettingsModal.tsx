"use client";

import { ChevronDown, Grid3X3, History, Palette, RotateCcw, Ruler, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { normalizeScaleForUnits, parseMeasurementInput, scaleOptionsForUnits, WORKSPACE_UNIT_OPTIONS } from "@/lib/measurementUnits";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { customThemeWithDefaults, THEME_PRESET_OPTIONS } from "@/lib/themes";
import type { GridSize, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type WorkspaceSettings = WorkplaneWorkspaceSettings;
type WorkspaceSettingsSection = "appearance" | "measurement" | "workplane" | "history";

const GRID_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];
const BACKGROUND_PRESETS = ["#ffffff", "#f8fbfc", "#e8e4e0", "#eaf7fb", "#9aa5b0", "#3a3f47", "#1e2028"];
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

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{3,8}$/.test(v);

export const UI_LABELS: Record<string, string> = {
  background: "Background",
  foreground: "Foreground",
  topbar: "Top Bar",
  subbar: "Sub Bar",
  panel: "Panel",
  tile: "Tile",
  tileHover: "Tile Hover",
  border: "Border",
  borderStrong: "Border Strong",
  muted: "Muted",
  mutedStrong: "Muted Strong",
  primary: "Primary",
  activeTab: "Active Tab",
  navText: "Nav Text",
  workplane: "Workplane",
  workplaneSoft: "Workplane Soft",
  shadow: "Shadow",
};

export const VP_LABELS: Record<string, string> = {
  background: "Background",
  gridMinor: "Grid Minor",
  gridMajor: "Grid Major",
  gridAxis: "Grid Axis",
  gridBorder: "Grid Border",
  textPrimary: "Text Primary",
  textSecondary: "Text Secondary",
  handleDefault: "Handle Default",
  handleHover: "Handle Hover",
  handleActive: "Handle Active",
  handleHoverAlt: "Handle Hover Alt",
  handleActiveAlt: "Handle Active Alt",
  handleMaterial: "Handle Material",
  darkMaterial: "Dark Material",
  dashMaterial: "Dash Material",
  hole: "Hole",
  holeEdge: "Hole Edge",
  complexEdge: "Complex Edge",
};

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

export function WorkspaceSettingsModal({
  workspace,
  snap,
  moveDimensionsEnabled,
  onWorkspaceChange,
  onSnapChange,
  onMoveDimensionsEnabledChange,
  onMakeDefault,
  onClose,
}: {
  workspace: WorkspaceSettings;
  snap: GridSize;
  moveDimensionsEnabled: boolean;
  onWorkspaceChange: (next: WorkspaceSettings) => void;
  onSnapChange: (next: GridSize) => void;
  onMoveDimensionsEnabledChange: (enabled: boolean) => void;
  onMakeDefault: () => void;
  onClose: () => void;
}) {
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSettingsSection>("appearance");
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
  const customTheme = customThemeWithDefaults(workspace.customTheme);
  const gridColor = /^#[0-9a-f]{6}$/i.test(workspace.gridColor)
    ? workspace.gridColor
    : DEFAULT_WORKPLANE_WORKSPACE.gridColor;
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
                    <span>Adjust the canvas, theme, and navigation behavior.</span>
                  </div>
                  <div className="workspace-row">
                    <span>Theme preset</span>
                    <select
                      value={workspace.themeId || "light"}
                      onChange={(event) => {
                        const themeId = event.currentTarget.value;
                        patchWorkspace({ themeId });
                      }}
                      style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--tile)", color: "var(--foreground)", fontSize: "13px" }}
                    >
                      {THEME_PRESET_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <p className="workspace-global-note">The selected preset is saved for this project and becomes the default for new projects.</p>
                  {workspace.themeId === "custom" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", alignContent: "start", gap: "10px", height: "400px", maxHeight: "45vh", overflowY: "auto", padding: "16px", background: "var(--tile)", borderRadius: "8px", border: "2px solid var(--primary)" }}>
                      <p style={{ gridColumn: "1 / -1", fontWeight: 600, margin: "0 0 8px 0", fontSize: "13px", color: "var(--foreground)" }}>UI Colors</p>
                      {Object.entries(customTheme.ui)
                        .filter(([, val]) => isHexColor(val as string))
                        .map(([key, val]) => (
                        <label key={`ui-${key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--foreground)", padding: "2px 0" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{UI_LABELS[key] || key}</span>
                          <input
                            type="color"
                            value={val as string}
                            onChange={(e) => {
                              onWorkspaceChange({
                                ...workspace,
                                customTheme: {
                                  ...customTheme,
                                  ui: { ...customTheme.ui, [key]: e.target.value }
                                }
                              });
                            }}
                            style={{ width: "32px", height: "32px", padding: 0, border: "2px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}
                          />
                        </label>
                      ))}
                      <p style={{ gridColumn: "1 / -1", fontWeight: 600, margin: "12px 0 8px 0", fontSize: "13px", color: "var(--foreground)" }}>3D Viewport Colors</p>
                      {Object.entries(customTheme.viewport)
                        .filter(([, val]) => isHexColor(val as string))
                        .map(([key, val]) => (
                        <label key={`vp-${key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--foreground)", padding: "2px 0" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{VP_LABELS[key] || key}</span>
                          <input
                            type="color"
                            value={val as string}
                            onChange={(e) => {
                              onWorkspaceChange({
                                ...workspace,
                                customTheme: {
                                  ...customTheme,
                                  viewport: { ...customTheme.viewport, [key]: e.target.value }
                                }
                              });
                            }}
                            style={{ width: "32px", height: "32px", padding: 0, border: "2px solid var(--border)", borderRadius: "4px", cursor: "pointer" }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="workspace-bg-color">
                    <span>Background color</span>
                    <div className="workspace-bg-swatches">
                      {BACKGROUND_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`workspace-bg-swatch${workspace.background === preset ? " active" : ""}`}
                          style={{ background: preset }}
                          aria-label={`Set background to ${preset}`}
                          onClick={() => patchWorkspace({ background: preset })}
                        />
                      ))}
                      <label className="workspace-bg-custom" aria-label="Custom background color">
                        <input
                          type="color"
                          value={workspace.background}
                          onChange={(event) => patchWorkspace({ background: event.currentTarget.value })}
                        />
                        <span>Custom</span>
                      </label>
                    </div>
                  </div>
                  <WorkspaceToggle
                    label="Show movement dimensions"
                    checked={moveDimensionsEnabled}
                    onChange={onMoveDimensionsEnabledChange}
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

function WorkspaceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="workspace-toggle">
      <span>{label}</span>
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
