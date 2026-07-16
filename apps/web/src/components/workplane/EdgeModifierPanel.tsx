"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check, LoaderCircle, Minus, Plus, RotateCcw, X } from "lucide-react";
import { displayStepFromMillimeters, displayToMillimeters, formatMeasurementNumber, lengthDisplayUnit, millimetersToDisplay } from "@/lib/measurementUnits";
import type { CadModifierKind, CadModifierQuality } from "@/lib/cadModifierTypes";
import { CAD_MODIFIER_MAX_SHARP_ANGLE, edgeModifierSelectionStatus } from "@/lib/cadModifierRuntime";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

const MIN_EDGE_MODIFIER_AMOUNT = 0.001;
const EDGE_MODIFIER_AMOUNT_STEP = 0.001;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSliderValue(value: number, accuracy: WorkplaneWorkspaceSettings["accuracy"], step: number) {
  if (step >= 1) return String(Math.round(value));
  return formatMeasurementNumber(value, accuracy, step);
}

type EdgeHistoryOption = {
  id: string;
  label: string;
  targetName: string;
  removesNewerCount: number;
};

function EdgeModifierSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  workspace,
  length = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  workspace: WorkplaneWorkspaceSettings;
  length?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Math.max(safeMin, Number.isFinite(max) ? max : safeMin);
  const actualValue = Number.isFinite(value) ? value : safeMin;
  const controlValue = length ? millimetersToDisplay(actualValue, workspace) : actualValue;
  const controlMin = length ? millimetersToDisplay(safeMin, workspace) : safeMin;
  const controlMax = length ? millimetersToDisplay(safeMax, workspace) : safeMax;
  const controlStep = length ? displayStepFromMillimeters(step, workspace) : step;
  const sliderValue = clamp(controlValue, controlMin, controlMax);
  const position = ((sliderValue - controlMin) / Math.max(Number.EPSILON, controlMax - controlMin)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatSliderValue(controlValue, workspace.accuracy, controlStep));
  const unitLabel = length ? lengthDisplayUnit(workspace).label : unit;

  useEffect(() => {
    if (!editing) {
      setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
    }
  }, [controlStep, controlValue, editing, workspace.accuracy]);

  const toModelValue = (nextValue: number) => length ? displayToMillimeters(nextValue, workspace) : nextValue;

  const commitDraft = () => {
    const next = Number(draft);
    const finiteNext = Number.isFinite(next) ? next : controlValue;
    onChange(clamp(toModelValue(finiteNext), safeMin, safeMax));
    setEditing(false);
  };

  const handleSliderChange = (nextValue: number) => {
    const next = clamp(Number.isFinite(nextValue) ? nextValue : controlMin, controlMin, controlMax);
    onChange(clamp(toModelValue(next), safeMin, safeMax));
    setDraft(formatSliderValue(next, workspace.accuracy, controlStep));
  };

  return (
    <label className="edge-modifier-field edge-modifier-slider range-property" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">{label}</span>
        <span className="range-value-control">
          <input
            type="number"
            min={controlMin}
            max={controlMax}
            step={controlStep}
            value={editing ? draft : formatSliderValue(controlValue, workspace.accuracy, controlStep)}
            inputMode="decimal"
            disabled={disabled}
            onFocus={() => {
              setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
              setEditing(true);
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDraft(formatSliderValue(controlValue, workspace.accuracy, controlStep));
                setEditing(false);
              }
            }}
          />
          {unitLabel ? <span className="range-value-unit">{unitLabel}</span> : null}
        </span>
      </span>
      <div className="range-control">
        <input
          type="range"
          min={controlMin}
          max={controlMax}
          step={controlStep}
          value={sliderValue}
          disabled={disabled}
          onChange={(event) => handleSliderChange(Number(event.currentTarget.value))}
        />
      </div>
    </label>
  );
}

export function EdgeModifierPanel({
  kind,
  amount,
  maxAmount,
  chamferAngle,
  quality,
  sharpAngle,
  workspace,
  tangentChain,
  preserveEdgeSize,
  targetName,
  groupedCount,
  appliedFeatureCount,
  reversibleFeatureCount,
  historyOptions,
  selectedCount,
  availableCount,
  busy,
  prepared,
  error,
  onAmountChange,
  onChamferAngleChange,
  onQualityChange,
  onSharpAngleChange,
  onTangentChainChange,
  onPreserveEdgeSizeChange,
  onSelectAll,
  onClear,
  onRemoveFeature,
  onApply,
  onCancel,
}: {
  kind: CadModifierKind;
  amount: number;
  maxAmount: number;
  chamferAngle: number;
  quality: CadModifierQuality;
  sharpAngle: number;
  workspace: WorkplaneWorkspaceSettings;
  tangentChain: boolean;
  preserveEdgeSize: boolean;
  targetName: string;
  groupedCount: number;
  appliedFeatureCount: number;
  reversibleFeatureCount: number;
  historyOptions: EdgeHistoryOption[];
  selectedCount: number;
  availableCount: number;
  busy: boolean;
  prepared: boolean;
  error: string | null;
  onAmountChange: (value: number) => void;
  onChamferAngleChange: (value: number) => void;
  onQualityChange: (value: CadModifierQuality) => void;
  onSharpAngleChange: (value: number) => void;
  onTangentChainChange: (value: boolean) => void;
  onPreserveEdgeSizeChange: (value: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onRemoveFeature: (id: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const title = kind === "fillet" ? "Fillet edges" : "Chamfer edges";
  const amountMin = Math.min(MIN_EDGE_MODIFIER_AMOUNT, Math.max(Number.EPSILON, maxAmount));
  const amountMax = Math.max(amountMin, maxAmount);
  return (
    <aside className="edge-modifier-panel" aria-label={title}>
      <div className="edge-modifier-header">
        <div>
          <strong>{title}</strong>
          <span>{edgeModifierSelectionStatus(prepared, selectedCount, availableCount)}</span>
        </div>
        <button type="button" aria-label={`Cancel ${kind}`} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className={`edge-modifier-target ${groupedCount > 0 ? "grouped" : ""}`}>
        <strong>{targetName}</strong>
        <span>{groupedCount > 0 ? `${groupedCount} grouped objects` : "Single object"}{appliedFeatureCount > 0 ? ` · ${appliedFeatureCount} existing edge feature${appliedFeatureCount === 1 ? "" : "s"}` : ""}</span>
      </div>

      <div className="edge-modifier-selection-help">
        {prepared ? "Click highlighted model edges to toggle them. Hold Shift to add or remove a single edge." : "Loading CAD edge data from the local browser worker."}
      </div>

      <div className="edge-modifier-quick-actions">
        <button type="button" disabled={!prepared || busy} onClick={onSelectAll}>All sharp edges</button>
        <button type="button" disabled={!prepared || busy} onClick={onClear}>Clear</button>
      </div>

      {appliedFeatureCount > 0 ? (
        <div className="edge-modifier-history-actions">
          <button
            className="edge-modifier-history-toggle"
            type="button"
            aria-expanded={historyOpen}
            disabled={reversibleFeatureCount === 0}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            {historyOpen ? <Minus size={15} /> : <Plus size={15} />}
            <span>Edge feature history</span>
          </button>
          {reversibleFeatureCount === 0 ? <span>Older edge features do not have stored undo history.</span> : null}
          {historyOpen && historyOptions.length > 0 ? (
            <div className="edge-modifier-history-list">
              {historyOptions.map((option) => (
                <button className="edge-modifier-history-item" type="button" key={option.id} onClick={() => onRemoveFeature(option.id)}>
                  <RotateCcw size={14} />
                  <span>
                    <strong>{option.label}</strong>
                    <small>
                      {option.targetName}
                      {option.removesNewerCount > 0 ? ` · also removes ${option.removesNewerCount} newer` : ""}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <EdgeModifierSlider
        label={kind === "fillet" ? "Radius" : "Distance"}
        value={amount}
        min={amountMin}
        max={amountMax}
        step={EDGE_MODIFIER_AMOUNT_STEP}
        workspace={workspace}
        length
        disabled={!prepared || busy}
        onChange={onAmountChange}
      />

      {kind === "chamfer" ? <EdgeModifierSlider label="Angle" value={chamferAngle} min={5} max={85} step={1} unit="deg" workspace={workspace} disabled={!prepared || busy} onChange={onChamferAngleChange} /> : null}

      <EdgeModifierSlider label="Sharp-edge threshold" value={sharpAngle} min={1} max={CAD_MODIFIER_MAX_SHARP_ANGLE} step={1} unit="deg" workspace={workspace} disabled={!prepared || busy} onChange={onSharpAngleChange} />

      <label className="edge-modifier-check">
        <input type="checkbox" checked={tangentChain} disabled={!prepared || busy} onChange={(event) => onTangentChainChange(event.currentTarget.checked)} />
        <span>Select tangent chains</span>
      </label>

      <label className="edge-modifier-check">
        <input type="checkbox" checked={preserveEdgeSize} disabled={!prepared || busy} onChange={(event) => onPreserveEdgeSizeChange(event.currentTarget.checked)} />
        <span>Keep edge size when resizing</span>
      </label>

      <label className="edge-modifier-field">
        <span>Preview quality</span>
        <select value={quality} disabled={!prepared || busy} onChange={(event) => onQualityChange(event.currentTarget.value as CadModifierQuality)}>
          <option value="draft">Draft</option>
          <option value="standard">Standard</option>
          <option value="fine">Fine</option>
        </select>
      </label>

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}
      <div className="edge-modifier-footer">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary" disabled={!prepared || busy || selectedCount === 0 || Boolean(error)} onClick={onApply}>
          {busy ? <LoaderCircle className="edge-modifier-spinner" size={17} /> : <Check size={17} />}
          Apply
        </button>
      </div>
    </aside>
  );
}
