"use client";

import { Grid3X3, Palette, Ruler, X } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeScaleForUnits, parseMeasurementInput, scaleOptionsForUnits, WORKSPACE_UNIT_OPTIONS } from "@/lib/measurementUnits";
import { DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { customThemeWithDefaults } from "@/lib/themes";
import type { GridSize, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

type WorkspaceSettings = WorkplaneWorkspaceSettings;
type WorkspaceSettingsSection = "appearance" | "measurement" | "workplane";

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

export function WorkspaceSettingsModal({
  workspace,
  snap,
  onWorkspaceChange,
  onSnapChange,
  onMakeDefault,
  onClose,
}: {
  workspace: WorkspaceSettings;
  snap: GridSize;
  onWorkspaceChange: (next: WorkspaceSettings) => void;
  onSnapChange: (next: GridSize) => void;
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
  const scaleOptions = scaleOptionsForUnits(workspace.units);
  const scaleValue = normalizeScaleForUnits(workspace.units, workspace.scale);
  const customTheme = customThemeWithDefaults(workspace.customTheme);
  useEffect(() => {
    setDimensionDrafts({
      width: workspace.width.toFixed(workspace.accuracy),
      depth: workspace.depth.toFixed(workspace.accuracy),
    });
  }, [workspace.accuracy, workspace.depth, workspace.width]);
  useEffect(() => {
    setGridBlockSizeDraft(workspace.gridBlockSize.toFixed(workspace.accuracy));
  }, [workspace.accuracy, workspace.gridBlockSize]);
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
                    <span>Theme</span>
                    <select
                      value={workspace.themeId || "light"}
                      onChange={(event) => patchWorkspace({ themeId: event.target.value })}
                      style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--tile)", color: "var(--foreground)", fontSize: "13px" }}
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="solidworks">SolidWorks</option>
                      <option value="inventor">Inventor</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
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
                  <WorkspaceToggle label="Show shadows" checked={workspace.showShadows} onChange={(showShadows) => patchWorkspace({ showShadows })} />
                  <WorkspaceToggle label="Show grid" checked={workspace.showGrid} onChange={(showGrid) => patchWorkspace({ showGrid })} />
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
