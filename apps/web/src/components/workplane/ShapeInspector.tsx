"use client";

import { ChevronDown, ChevronUp, LockKeyhole, LockKeyholeOpen, Split } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ToolbarHideSelectedIcon } from "@/components/icons";
import {
  DEFAULT_GEAR_HELIX_ANGLE,
  DEFAULT_GEAR_HELIX_QUALITY,
  DEFAULT_GEAR_TEETH,
  DEFAULT_GEAR_TOOTH_SIZE,
  MAX_GEAR_HELIX_ANGLE,
  MAX_GEAR_HELIX_QUALITY,
  MIN_GEAR_HELIX_ANGLE,
  MIN_GEAR_HELIX_QUALITY,
  gearCenterHoleLimits,
  normalizeGearHelixAngle,
  normalizeGearHelixQuality,
  normalizeGearCenterHoleSize,
  normalizeGearToothSize,
  normalizeGearToothWidth,
  normalizeGearType,
  gearToothPitch,
} from "@/lib/gearGeometry";
import { displayStepFromMillimeters, displayToMillimeters, formatMeasurementNumber, lengthDisplayUnit, millimetersToDisplay, parseMeasurementInput } from "@/lib/measurementUnits";
import { resizedShapeSize, shapeDepth, shapeHasTaper, shapeOverallFootprintDimensions, shapeTaperDimensions, shapeWidth } from "@/lib/workplaneShapes";
import { normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import { MAX_HIGH_RESOLUTION_SIDES } from "@/lib/workplaneSettings";
import type { GearType, GridSize, MeasurementAccuracy, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";
import {useTranslation} from "react-i18next";

const GRID_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];
const MIN_SHAPE_SIZE = 0.01;
const SOLID_COLORS = [
  "#d41721",
  "#ff4b4b",
  "#ff7a1a",
  "#d97813",
  "#f6a21a",
  "#f2cf10",
  "#f7e65a",
  "#a8d642",
  "#33983d",
  "#1fb66d",
  "#18b99a",
  "#0098c7",
  "#49c7ef",
  "#3b82f6",
  "#294c93",
  "#5b5ce2",
  "#6e2786",
  "#9b3bd2",
  "#c9009a",
  "#f062b6",
  "#8a5a2b",
  "#b98254",
  "#f2caa0",
  "#ffffff",
  "#cfd8df",
  "#8a98a6",
  "#4b5563",
  "#111111",
];
const TEXT_FONT_OPTIONS = ["Multilanguage", "Sans", "Serif", "Script", "Monospace", "Rounded", "Stencil"];
const GEAR_TYPE_OPTIONS: Array<{ value: GearType; label: string }> = [
  { value: "spur", label: "Spur gear" },
  { value: "helical", label: "Helical gear" },
  { value: "bevel", label: "Bevel gear" },
];

type RangePropertyConfig = {
  type?: "range";
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

type TextPropertyConfig = {
  type: "text";
  label: string;
  value: string;
  onChange: (value: string) => void;
};

type SelectPropertyConfig = {
  type: "select";
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

type ShapePropertyConfig = RangePropertyConfig | TextPropertyConfig | SelectPropertyConfig;
export type ShapeInspectorUpdateOptions = { resizeAxis?: "width" | "depth" | "height" };
type ShapeInspectorUpdate = (patch: Partial<WorkplaneShape>, options?: ShapeInspectorUpdateOptions) => void;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatPropertyNumber(value: number, accuracy: MeasurementAccuracy, step: number) {
  if (step >= 1) return String(Math.round(value));
  return formatMeasurementNumber(value, accuracy, step);
}

function propertyUsesLengthUnit(label: string) {
  return ["Radius", "Length", "Width", "Height", "Bevel", "Top Radius", "Base Radius", "Thickness", "Tooth Size", "Tooth Width", "Center Hole", "Top Length", "Top Width", "Bottom Length", "Bottom Width"].includes(label);
}

function getShapePropertiesWithAppLimits(shape: WorkplaneShape, onUpdate: ShapeInspectorUpdate, textWidthMax = 260): ShapePropertyConfig[] {
  const baseWidth = shapeWidth(shape);
  const baseDepth = shapeDepth(shape);
  const footprint = shapeOverallFootprintDimensions(shape);
  const width = footprint.width;
  const depth = footprint.depth;
  const taper = shapeTaperDimensions(shape);
  const widthPatch = (value: number): Partial<WorkplaneShape> => {
    if (!shapeHasTaper(shape)) {
      return { width: value, size: resizedShapeSize(value, baseDepth) };
    }
    const scale = value / Math.max(MIN_SHAPE_SIZE, width);
    const nextBaseWidth = Math.max(MIN_SHAPE_SIZE, baseWidth * scale);
    return {
      width: nextBaseWidth,
      size: resizedShapeSize(nextBaseWidth, baseDepth),
      taperTopWidth: Math.max(MIN_SHAPE_SIZE, taper.topWidth * scale),
      taperBottomWidth: Math.max(MIN_SHAPE_SIZE, taper.bottomWidth * scale),
    };
  };
  const depthPatch = (value: number): Partial<WorkplaneShape> => {
    if (!shapeHasTaper(shape)) {
      return { depth: value, size: resizedShapeSize(baseWidth, value) };
    }
    const scale = value / Math.max(MIN_SHAPE_SIZE, depth);
    const nextBaseDepth = Math.max(MIN_SHAPE_SIZE, baseDepth * scale);
    return {
      depth: nextBaseDepth,
      size: resizedShapeSize(baseWidth, nextBaseDepth),
      taperTopDepth: Math.max(MIN_SHAPE_SIZE, taper.topDepth * scale),
      taperBottomDepth: Math.max(MIN_SHAPE_SIZE, taper.bottomDepth * scale),
    };
  };
  const setWidth = (value: number) => onUpdate(widthPatch(value), { resizeAxis: "width" });
  const setDepth = (value: number) => onUpdate(depthPatch(value), { resizeAxis: "depth" });
  const setConeWidth = (value: number) => {
    const patch = widthPatch(value);
    patch.baseRadius = Math.max(MIN_SHAPE_SIZE, (patch.width ?? baseWidth) / 2);
    onUpdate(patch, { resizeAxis: "width" });
  };
  const setBaseRadius = (value: number) => {
    const diameter = value * 2;
    onUpdate({ baseRadius: value, width: diameter, size: resizedShapeSize(diameter, baseDepth) }, { resizeAxis: "width" });
  };
  const setHeight = (height: number) => onUpdate({ height }, { resizeAxis: "height" });

  if (shape.sketchOperation === "revolve" || shape.sketchRevolve) {
    const settings = normalizeSketchRevolveSettings(shape.sketchRevolve);
    const updateRevolve = (patch: Partial<typeof settings>) => onUpdate({ sketchRevolve: normalizeSketchRevolveSettings({ ...settings, ...patch }) });
    return [
      { label: "Start Angle", value: settings.startAngle, min: 0, max: 359, step: 1, onChange: (startAngle) => updateRevolve({ startAngle }) },
      { label: "Sweep", value: settings.sweepAngle, min: -360, max: 360, step: 1, onChange: (sweepAngle) => updateRevolve({ sweepAngle }) },
      { label: "Sides", value: settings.sides, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => updateRevolve({ sides }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "box") {
    return [
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "cylinder") {
    return [
      { label: "Sides", value: shape.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "sphere") {
    return [
      { label: "Steps", value: shape.steps ?? 24, min: 6, max: 64, step: 1, onChange: (steps) => onUpdate({ steps: Math.round(steps) }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "halfSphere") {
    return [
      { label: "Steps", value: shape.steps ?? 32, min: 6, max: 64, step: 1, onChange: (steps) => onUpdate({ steps: Math.round(steps) }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "cone") {
    return [
      { label: "Top Radius", value: shape.topRadius ?? 0, min: 0, max: 40, onChange: (topRadius) => onUpdate({ topRadius }) },
      { label: "Base Radius", value: shape.baseRadius ?? baseWidth / 2, min: MIN_SHAPE_SIZE, max: 80, onChange: setBaseRadius },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setConeWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
      { label: "Sides", value: shape.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
    ];
  }

  if (shape.kind === "pyramid") {
    return [
      { label: "Sides", value: shape.sides ?? 4, min: 3, max: 24, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "roundRoof") {
    return [
      { label: "Sides", value: shape.sides ?? 64, min: 4, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "tube" || shape.kind === "ring") {
    return [
      { label: "Thickness", value: shape.bevel ?? 4, min: 0.5, max: 20, onChange: (bevel) => onUpdate({ bevel }) },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "gear") {
    const setGearWidth = (value: number) => {
      const toothSize = normalizeGearToothSize(shape.toothSize, value, depth);
      const toothWidth = normalizeGearToothWidth(shape.toothWidth, value, depth, shape.teeth);
      const centerHoleSize = normalizeGearCenterHoleSize(shape.centerHoleSize, value, depth, toothSize);
      onUpdate({ width: value, size: resizedShapeSize(value, depth), toothSize, toothWidth, centerHoleSize }, { resizeAxis: "width" });
    };
    const setGearDepth = (value: number) => {
      const toothSize = normalizeGearToothSize(shape.toothSize, width, value);
      const toothWidth = normalizeGearToothWidth(shape.toothWidth, width, value, shape.teeth);
      const centerHoleSize = normalizeGearCenterHoleSize(shape.centerHoleSize, width, value, toothSize);
      onUpdate({ depth: value, size: resizedShapeSize(width, value), toothSize, toothWidth, centerHoleSize }, { resizeAxis: "depth" });
    };
    const teeth = shape.teeth ?? DEFAULT_GEAR_TEETH;
    const toothPitch = gearToothPitch(width, depth, teeth);
    const toothSize = normalizeGearToothSize(shape.toothSize ?? DEFAULT_GEAR_TOOTH_SIZE, width, depth);
    const centerHoleLimits = gearCenterHoleLimits(width, depth, toothSize);
    const properties: ShapePropertyConfig[] = [
      {
        label: "Teeth",
        value: teeth,
        min: 6,
        max: 64,
        step: 1,
        onChange: (value) => {
          const nextTeeth = Math.round(value);
          onUpdate({
            teeth: nextTeeth,
            toothWidth: normalizeGearToothWidth(shape.toothWidth, width, depth, nextTeeth),
          });
        },
      },
      {
        label: "Tooth Size",
        value: toothSize,
        min: 0.2,
        max: Math.max(0.2, Math.min(width, depth) * 0.22),
        step: 0.1,
        onChange: (nextToothSize) => onUpdate({
          toothSize: nextToothSize,
          centerHoleSize: normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, nextToothSize),
        }),
      },
      {
        label: "Tooth Width",
        value: normalizeGearToothWidth(shape.toothWidth, width, depth, teeth),
        min: toothPitch * 0.12,
        max: toothPitch * 0.82,
        step: 0.1,
        onChange: (toothWidth) => onUpdate({ toothWidth }),
      },
    ];
    if (normalizeGearType(shape.gearType) === "helical") {
      properties.push({
        label: "Helix Angle",
        value: normalizeGearHelixAngle(shape.helixAngle ?? DEFAULT_GEAR_HELIX_ANGLE),
        min: MIN_GEAR_HELIX_ANGLE,
        max: MAX_GEAR_HELIX_ANGLE,
        step: 1,
        onChange: (helixAngle) => onUpdate({ helixAngle }),
      });
      properties.push({
        label: "Quality",
        value: normalizeGearHelixQuality(shape.helixQuality ?? DEFAULT_GEAR_HELIX_QUALITY),
        min: MIN_GEAR_HELIX_QUALITY,
        max: MAX_GEAR_HELIX_QUALITY,
        step: 1,
        onChange: (helixQuality) => onUpdate({ helixQuality: Math.round(helixQuality) }),
      });
    }
    properties.push(
      {
        label: "Center Hole",
        value: normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, toothSize),
        min: centerHoleLimits.min,
        max: centerHoleLimits.max,
        step: 0.1,
        onChange: (centerHoleSize) => onUpdate({ centerHoleSize }),
      },
      { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setGearDepth },
      { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setGearWidth },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    );
    return properties;
  }

  if (shape.kind === "text") {
    return [
      {
        type: "text",
        label: "Text",
        value: shape.text ?? "TEXT",
        onChange: (text) => {
          const nextText = text.slice(0, 24) || " ";
          const nextWidth = clamp(Math.max(Math.min(46, textWidthMax), nextText.length * 19), MIN_SHAPE_SIZE, textWidthMax);
          onUpdate({ text: nextText, width: nextWidth, size: nextWidth });
        },
      },
      { type: "select", label: "Font", value: shape.font ?? "Multilanguage", options: TEXT_FONT_OPTIONS, onChange: (font) => onUpdate({ font }) },
      { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 40, onChange: setHeight },
      { label: "Bevel", value: shape.bevel ?? 0, min: 0, max: 8, onChange: (bevel) => onUpdate({ bevel }) },
      { label: "Segments", value: shape.segments ?? 0, min: 0, max: 24, step: 1, onChange: (segments) => onUpdate({ segments: Math.round(segments) }) },
    ];
  }

  return [
    { label: "Length", value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
    { label: "Width", value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
    { label: "Height", value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
  ];
}

function getShapeProperties(shape: WorkplaneShape, onUpdate: ShapeInspectorUpdate, workspace: WorkplaneWorkspaceSettings): ShapePropertyConfig[] {
  const customLimit = workspace.shapeCustomizations[shape.kind]?.maxDimension;
  const properties = getShapePropertiesWithAppLimits(shape, onUpdate, customLimit ?? 260);
  if (customLimit === undefined) return properties;
  return properties.map((property) => {
    if (property.type === "text" || property.type === "select") return property;
    if (["Length", "Width", "Height"].includes(property.label)) return { ...property, max: customLimit };
    if (["Top Radius", "Base Radius"].includes(property.label)) return { ...property, max: customLimit / 2 };
    return property;
  });
}

export function ShapeInspector({
  shape,
  snap,
  snapOpen,
  workspace,
  onUpdate,
  onSnapChange,
  onSnapOpenChange,
  onEditSketch,
  canSeparateParts = false,
  onSeparateParts,
  onInteractionActiveChange,
}: {
  shape: WorkplaneShape;
  snap: GridSize;
  snapOpen: boolean;
  workspace: WorkplaneWorkspaceSettings;
  onUpdate: ShapeInspectorUpdate;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
  onEditSketch?: () => void;
  canSeparateParts?: boolean;
  onSeparateParts?: () => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const solidColor = shape.color;
  const locked = Boolean(shape.locked);
  const properties = getShapeProperties(shape, onUpdate, workspace);
  const gearType = shape.kind === "gear" ? normalizeGearType(shape.gearType) : null;
  const primaryProperties = shape.kind === "gear"
    ? properties.filter((property) => ["Center Hole", "Length", "Width", "Height"].includes(property.label))
    : properties;
  const gearTeethProperties = shape.kind === "gear"
    ? properties.filter((property) => ["Teeth", "Tooth Size", "Tooth Width"].includes(property.label))
    : [];
  const gearHelixProperties = shape.kind === "gear"
    ? properties.filter((property) => ["Helix Angle", "Quality"].includes(property.label))
    : [];
  const taper = shapeTaperDimensions(shape);
  const taperDimensionMax = workspace.shapeCustomizations[shape.kind]?.maxDimension ?? 480;
  const taperProperties: ShapePropertyConfig[] = shape.kind === "gear" ? [] : [
    {
      label: "Top Length",
      value: taper.topDepth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperTopDepth) => onUpdate({ taperTopDepth, taperTopWidth: taper.topWidth, taperTopScale: undefined }),
    },
    {
      label: "Top Width",
      value: taper.topWidth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperTopWidth) => onUpdate({ taperTopWidth, taperTopDepth: taper.topDepth, taperTopScale: undefined }),
    },
    {
      label: "Bottom Length",
      value: taper.bottomDepth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperBottomDepth) => onUpdate({ taperBottomDepth, taperBottomWidth: taper.bottomWidth, taperBottomScale: undefined }),
    },
    {
      label: "Bottom Width",
      value: taper.bottomWidth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperBottomWidth) => onUpdate({ taperBottomWidth, taperBottomDepth: taper.bottomDepth, taperBottomScale: undefined }),
    },
  ];
  const isSketchRevolve = shape.sketchOperation === "revolve" || Boolean(shape.sketchRevolve);
  const inspectorRef = useRef<HTMLElement>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [taperOpen, setTaperOpen] = useState(false);
  const [gearTeethOpen, setGearTeethOpen] = useState(true);
  const [gearHelixOpen, setGearHelixOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => onInteractionActiveChange?.(false), [onInteractionActiveChange]);
  useEffect(() => {
    const input = customColorInputRef.current;
    if (!colorOpen || !input) {
      return;
    }

    // React's color-input onChange follows the native input event and fires for
    // every movement in the picker. Commit only the native change event, which
    // fires after the user finishes choosing, so dragging stays responsive.
    const commitCustomColor = () => {
      onUpdate({ color: input.value, hole: false });
    };
    input.addEventListener("change", commitCustomColor);
    return () => input.removeEventListener("change", commitCustomColor);
  }, [colorOpen, onUpdate]);
  useLayoutEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0, left: 0 });
  }, [isSketchRevolve, shape.id]);

  return (
    <aside ref={inspectorRef} className={`shape-inspector ${isSketchRevolve ? "sketch-revolve-inspector" : ""} ${shape.kind === "gear" ? "gear-inspector" : ""} ${minimized ? "minimized" : ""}`} aria-label={`${shape.name} shape settings`} onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-inspector-header">
        <button
          className="inspector-header-icon"
          aria-label={minimized ? "Expand shape settings" : "Minimize shape settings"}
          aria-expanded={!minimized}
          onClick={() => setMinimized((current) => !current)}
        >
          {minimized ? <ChevronDown size={26} strokeWidth={2.8} /> : <ChevronUp size={26} strokeWidth={2.8} />}
        </button>
        <strong>{t(shape.name)}</strong>
        <div className="inspector-header-actions">
          <button className={locked ? "inspector-header-icon active" : "inspector-header-icon"} aria-label={locked ? "Unlock shape" : "Lock shape"} onClick={() => onUpdate({ locked: !locked })}>
            {locked ? <LockKeyhole size={31} strokeWidth={2.4} /> : <LockKeyholeOpen size={31} strokeWidth={2.4} />}
          </button>
          <button className={shape.hidden ? "inspector-header-icon active" : "inspector-header-icon"} aria-label={shape.hidden ? "Show shape" : "Hide shape"} onClick={() => onUpdate({ hidden: !shape.hidden })}>
            <ToolbarHideSelectedIcon />
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
      <div className="shape-state-card" role="group" aria-label="Shape mode">
        <button
          className={!shape.hole ? "active solid-choice" : "solid-choice"}
          onClick={() => {
            const wasHole = Boolean(shape.hole);
            onUpdate({ hole: false, color: solidColor });
            setColorOpen((open) => (wasHole ? false : !open));
          }}
          disabled={locked}
          aria-pressed={!shape.hole}
          aria-expanded={colorOpen}
        >
          <span className="large-solid-swatch" style={{ "--swatch": solidColor } as CSSProperties} />
          <span>{t("Solid")}</span>
        </button>
        <button
          className={shape.hole ? "active hole-choice" : "hole-choice"}
          onClick={() => {
            onUpdate({ hole: true });
            setColorOpen(false);
          }}
          disabled={locked}
          aria-pressed={shape.hole}
        >
          <span className="large-hole-swatch" />
          <span>{t("Hole")}</span>
        </button>
      </div>

      {colorOpen ? (
        <div className="color-card" aria-label="Shape color">
          <div className="color-card-header">
            <span>{t("Color")}</span>
            <span className="color-value">{solidColor.toUpperCase()}</span>
          </div>
          <div className="color-grid">
            {SOLID_COLORS.map((color) => (
              <button
                key={color}
                className={solidColor.toLowerCase() === color.toLowerCase() && !shape.hole ? "selected" : ""}
                type="button"
                style={{ "--shape-swatch": color } as CSSProperties}
                title={color.toUpperCase()}
                aria-label={`Set color ${color}`}
                disabled={locked}
                onClick={() => {
                  onUpdate({ color, hole: false });
                  setColorOpen(false);
                }}
              />
            ))}
            <label className={locked ? "custom-color disabled" : "custom-color"} title="Custom color">
              <input
                key={`${shape.id}-${solidColor}`}
                ref={customColorInputRef}
                type="color"
                defaultValue={solidColor}
                disabled={locked}
                onFocus={() => onInteractionActiveChange?.(true)}
                onBlur={() => onInteractionActiveChange?.(false)}
              />
              <span>{t("Custom")}</span>
            </label>
          </div>
        </div>
      ) : null}

      {shape.sketchProfile && onEditSketch ? (
        <button className="edit-sketch-button" type="button" disabled={locked} onClick={onEditSketch}>
          Edit sketch
        </button>
      ) : null}

      {canSeparateParts && onSeparateParts ? (
        <button className="inspector-action-button" type="button" disabled={locked} onClick={onSeparateParts}>
          <Split size={17} strokeWidth={2.5} />
          <span>{t("Separate Parts")}</span>
        </button>
      ) : null}

      <div className={`property-card ${propertiesOpen ? "" : "collapsed"}`}>
        <button
          className="property-card-header"
          type="button"
          aria-expanded={propertiesOpen}
          aria-controls={`properties-${shape.id}`}
          onClick={() => setPropertiesOpen((open) => !open)}
        >
          <span>{t("Properties")}</span>
          <ChevronUp className={propertiesOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
        </button>
        {propertiesOpen ? (
          <div className="property-list" id={`properties-${shape.id}`}>
            {gearType ? (
              <GearTypeSelector
                value={gearType}
                disabled={locked}
                onChange={(gearType) => onUpdate({ gearType })}
              />
            ) : null}
            <ShapePropertyRows properties={primaryProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
          </div>
        ) : null}
      </div>
      {shape.kind !== "gear" ? (
        <div className={`property-card ${taperOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={taperOpen}
            aria-controls={`taper-${shape.id}`}
            onClick={() => setTaperOpen((open) => !open)}
          >
            <span>{t("Taper")}</span>
            <ChevronUp className={taperOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {taperOpen ? (
            <div className="property-list" id={`taper-${shape.id}`}>
              <ShapePropertyRows properties={taperProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {shape.kind === "gear" ? (
        <div className={`property-card ${gearTeethOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={gearTeethOpen}
            aria-controls={`gear-teeth-${shape.id}`}
            onClick={() => setGearTeethOpen((open) => !open)}
          >
            <span>{t("Teeth")}</span>
            <ChevronUp className={gearTeethOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {gearTeethOpen ? (
            <div className="property-list" id={`gear-teeth-${shape.id}`}>
              <ShapePropertyRows properties={gearTeethProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {gearType === "helical" ? (
        <div className={`property-card ${gearHelixOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={gearHelixOpen}
            aria-controls={`gear-helix-${shape.id}`}
            onClick={() => setGearHelixOpen((open) => !open)}
          >
            <span>Helix</span>
            <ChevronUp className={gearHelixOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {gearHelixOpen ? (
            <div className="property-list" id={`gear-helix-${shape.id}`}>
              <ShapePropertyRows properties={gearHelixProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="inspector-snap-dock">
        <SnapGridControl snap={snap} snapOpen={snapOpen} onSnapChange={onSnapChange} onSnapOpenChange={onSnapOpenChange} />
      </div>
        </>
      ) : null}
    </aside>
  );
}

function ShapePropertyRows({
  properties,
  workspace,
  disabled,
  onInteractionActiveChange,
}: {
  properties: ShapePropertyConfig[];
  workspace: WorkplaneWorkspaceSettings;
  disabled?: boolean;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  return properties.map((property) => {
    if (property.type === "text") {
      return <TextProperty key={property.label} {...property} disabled={disabled} onInteractionActiveChange={onInteractionActiveChange} />;
    }
    if (property.type === "select") {
      return <SelectProperty key={property.label} {...property} disabled={disabled} />;
    }
    return <RangeProperty key={property.label} {...property} workspace={workspace} disabled={disabled} onInteractionActiveChange={onInteractionActiveChange} />;
  });
}

export function SnapGridControl({
  snap,
  snapOpen,
  onSnapChange,
  onSnapOpenChange,
}: {
  snap: GridSize;
  snapOpen: boolean;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
}) {

  const { t } = useTranslation();
  return (
    <div className="snap-row">
      <span>{t("Snap Grid")}</span>
      <button className="snap-select" onClick={() => onSnapOpenChange((value) => !value)}>
        {snap}
        <ChevronDown size={12} fill="currentColor" />
      </button>
      {snapOpen ? (
        <div className="snap-menu">
          {GRID_SIZES.map((size) => (
            <button
              key={size}
              className={size === snap ? "selected" : ""}
              onClick={() => {
                onSnapChange(size);
                onSnapOpenChange(false);
              }}
            >
              {size}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RangeProperty({
  label,
  value,
  min,
  max,
  step = 0.01,
  workspace,
  disabled,
  onChange,
  onInteractionActiveChange,
}: RangePropertyConfig & { workspace: WorkplaneWorkspaceSettings; disabled?: boolean; onInteractionActiveChange?: (active: boolean) => void }) {
  const allowsAboveSliderMax = label === "Length" || label === "Width" || label === "Height" || label.endsWith(" Length") || label.endsWith(" Width");
  const isLength = propertyUsesLengthUnit(label);
  const accuracy = workspace.accuracy;
  const actualValue = Math.max(min, Number.isFinite(value) ? value : min);
  const controlValue = isLength ? millimetersToDisplay(actualValue, workspace) : actualValue;
  const controlMin = isLength ? millimetersToDisplay(min, workspace) : min;
  const controlMax = isLength ? millimetersToDisplay(max, workspace) : max;
  const controlStep = isLength ? displayStepFromMillimeters(step, workspace) : step;
  const sliderValue = clamp(controlValue, controlMin, controlMax);
  const position = ((sliderValue - controlMin) / Math.max(Number.EPSILON, controlMax - controlMin)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatPropertyNumber(controlValue, accuracy, controlStep));
  const unit = isLength ? lengthDisplayUnit(workspace).label : null;
  const toModelValue = (nextValue: number) => isLength ? displayToMillimeters(nextValue, workspace) : nextValue;
  const commitDraft = () => {
    const next = parseMeasurementInput(draft);
    const finiteNext = Number.isFinite(next) ? next : controlValue;
    const nextModelValue = toModelValue(finiteNext);
    onChange(allowsAboveSliderMax ? Math.max(min, nextModelValue) : clamp(nextModelValue, min, max));
    setEditing(false);
    onInteractionActiveChange?.(false);
  };
  const handleSliderChange = (nextValue: number) => {
    const next = clamp(Number.isFinite(nextValue) ? nextValue : controlMin, controlMin, controlMax);
    onChange(clamp(toModelValue(next), min, max));
    setDraft(formatPropertyNumber(next, accuracy, controlStep));
  };
  const { t } = useTranslation();

  return (
    <label className="range-property" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">{t(label)}</span>
        <span className="range-value-control">
          <input
            type="text"
            value={editing ? draft : formatPropertyNumber(controlValue, accuracy, controlStep)}
            disabled={disabled}
            inputMode="decimal"
            onFocus={() => {
              onInteractionActiveChange?.(true);
              setDraft(formatPropertyNumber(controlValue, accuracy, controlStep));
              setEditing(true);
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraft(formatPropertyNumber(controlValue, accuracy, controlStep));
                setEditing(false);
              }
            }}
          />
          {unit ? <span className="range-value-unit">{unit}</span> : null}
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
          onFocus={() => onInteractionActiveChange?.(true)}
          onBlur={() => onInteractionActiveChange?.(false)}
          onPointerDown={() => onInteractionActiveChange?.(true)}
          onPointerUp={() => onInteractionActiveChange?.(false)}
          onPointerCancel={() => onInteractionActiveChange?.(false)}
          onChange={(event) => handleSliderChange(Number(event.currentTarget.value))}
        />
      </div>
    </label>
  );
}

function TextProperty({ label, value, disabled, onChange, onInteractionActiveChange }: TextPropertyConfig & { disabled?: boolean; onInteractionActiveChange?: (active: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <label className="text-property">
      <span>{t(label)}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={24}
        spellCheck={false}
        onFocus={() => onInteractionActiveChange?.(true)}
        onBlur={() => onInteractionActiveChange?.(false)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectProperty({ label, value, options, disabled, onChange }: SelectPropertyConfig & { disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <label className="select-property">
      <span>{t(label)}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function GearTypePreview({ type }: { type: GearType }) {
  return <img src={`assets/sketchforge/gear-types/${type}.png`} alt="" aria-hidden="true" />;
}

function GearTypeSelector({ value, disabled, onChange }: { value: GearType; disabled?: boolean; onChange: (value: GearType) => void }) {
  const { t } = useTranslation();
  return (
    <div className="gear-type-property" role="group" aria-label="Gear type">
      <span>{t("Gear Type")}</span>
      <div className="gear-type-options">
        {GEAR_TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={value === option.value ? "selected" : ""}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <GearTypePreview type={option.value} />
            <span>{t(option.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
