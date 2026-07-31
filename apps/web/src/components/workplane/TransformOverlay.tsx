import type { CSSProperties } from "react";
import * as THREE from "three";
import {
  measureKeyForHandle,
  type TransformOverlayProps,
  type TransformOverlayState,
} from "@/components/workplane/transformOverlayTypes";

export {
  getElevationMeasureKey,
  measureKeyForHandle,
  type DimensionMark,
  type EditingDimension,
  type EditingRotation,
  type PinnedRotationWheelView,
  type RotationAxis,
  type RotationPlaneView,
  type RotationReadout,
  type RotationWheelView,
  type TransformHandleKind,
  type TransformOverlayState,
} from "@/components/workplane/transformOverlayTypes";

export function TransformOverlay({
  box,
  measureKey,
  editingDimension,
  editingRotation,
  rotationReadout,
  showRotationWheel,
  hideSelectionChrome,
  hideDimensionMarks,
  rotationWheelAxis,
  pinnedRotationWheelView,
  tutorialResizeActive = false,
  onTutorialResizeStart,
  onBeginCameraDrag,
  onCameraWheel,
  onBeginTransform,
  onMoveTransform,
  onFinishTransform,
  onHoverMeasure,
  onPinMeasure,
  onBeginDimensionEdit,
  onBeginLiftEdit,
  onEditingDimensionChange,
  onCommitDimensionEdit,
  onCancelDimensionEdit,
  onBeginRotationEdit,
  onEditingRotationChange,
  onCommitRotationEdit,
  onCancelRotationEdit,
}: TransformOverlayProps) {
  const marks = measureKey ? (box.dimensions[measureKey] ?? []) : [];
  const visibleMarks = (hideDimensionMarks ? [] : marks).filter((mark) => mark.key !== editingDimension?.key);
  const handleMeasureKey = (handle: TransformOverlayState["handles"][number]) => measureKeyForHandle(handle.kind, handle.key, box);
  const protractorTicks = Array.from({ length: 16 }, (_, index) => {
    const degrees = index * 22.5 - 90;
    const radians = THREE.MathUtils.degToRad(degrees);
    const major = index % 2 === 0;
    const outer = 94;
    const inner = major ? 80 : 86;
    return {
      key: `tick-${index}`,
      major,
      x1: Math.cos(radians) * inner,
      y1: Math.sin(radians) * inner,
      x2: Math.cos(radians) * outer,
      y2: Math.sin(radians) * outer,
    };
  });
  const activeAngle = rotationReadout?.angle ?? 0;
  const activeRadians = rotationReadout?.pointerAngle === undefined
    ? THREE.MathUtils.degToRad(activeAngle - 90)
    : THREE.MathUtils.degToRad(rotationReadout.pointerAngle);
  const activeLine = {
    x: Math.cos(activeRadians) * 92,
    y: Math.sin(activeRadians) * 92,
  };
  const pinnedWheel = pinnedRotationWheelView?.axis === rotationWheelAxis ? pinnedRotationWheelView : null;
  const plane = pinnedWheel?.plane ?? box.rotationPlanes[rotationWheelAxis];
  const wheel = pinnedWheel?.wheel ?? box.rotationWheels[rotationWheelAxis] ?? box.rotationWheel;
  const tutorialHandle = tutorialResizeActive ? box.handles.find((handle) => handle.kind === "scale" && handle.className.includes("corner")) ?? null : null;
  return (
    <div
      className={`transform-overlay ${hideSelectionChrome ? "hide-selection-chrome" : ""}`}
      onPointerDownCapture={(event) => {
        if (event.button === 1 || event.button === 2) {
          onHoverMeasure(null);
          onPinMeasure(null);
          onBeginCameraDrag(event);
        }
      }}
      onWheelCapture={onCameraWheel}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {showRotationWheel && wheel && plane ? (
        <svg
          className={`rotation-protractor-plane axis-${rotationWheelAxis}`}
          aria-hidden="true"
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
          onPointerDown={(event) => {
            if (event.button === 0) {
              onBeginTransform("rotate", `rotate-wheel-${rotationWheelAxis}`, event);
            }
          }}
          onPointerMove={(event) => onMoveTransform(event.clientX, event.clientY, event.shiftKey, event.altKey)}
          onPointerUp={onFinishTransform}
          onPointerCancel={onFinishTransform}
        >
          <g transform={`matrix(${plane.a} ${plane.b} ${plane.c} ${plane.d} ${plane.x} ${plane.y})`}>
            <circle className="rotation-protractor-outer" cx="0" cy="0" r="94" />
            <circle className="rotation-protractor-inner" cx="0" cy="0" r="68" />
            {protractorTicks.map((tick) => (
              <line
                key={tick.key}
                className={tick.major ? "rotation-tick major" : "rotation-tick"}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
              />
            ))}
            <line className="rotation-zero-line" x1="0" y1="0" x2="0" y2="-92" />
            <line className="rotation-current-line" x1="0" y1="0" x2={activeLine.x} y2={activeLine.y} />
            <text className="rotation-zero-label" x="0" y="-75">
              0&deg;
            </text>
          </g>
        </svg>
      ) : null}
      <svg className="transform-guides" viewBox={`0 0 ${box.width} ${box.height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="dimension-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0 4 L8 0 L5.2 4 L8 8 Z" />
          </marker>
        </defs>
        {box.guides.map((line, index) => (
          <line key={`guide-${index}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}
        {visibleMarks.map((mark) => (
          <g key={mark.key} className="dimension-mark">
            <line className="dimension-extension" x1={mark.e1x1} y1={mark.e1y1} x2={mark.e1x2} y2={mark.e1y2} />
            <line className="dimension-extension" x1={mark.e2x1} y1={mark.e2y1} x2={mark.e2x2} y2={mark.e2y2} />
            <line className="dimension-line" x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} />
          </g>
        ))}
      </svg>
      {visibleMarks.map((mark) => (
        <button
          key={`${mark.key}-label`}
          className="dimension-label"
          type="button"
          style={{ "--overlay-x": `${mark.labelX}px`, "--overlay-y": `${mark.labelY}px` } as CSSProperties}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onBeginDimensionEdit(mark)}
        >
          {mark.label}
        </button>
      ))}
      {editingDimension ? (
        <input
          className="dimension-input"
          style={{ "--overlay-x": `${editingDimension.x}px`, "--overlay-y": `${editingDimension.y}px` } as CSSProperties}
          value={editingDimension.value}
          autoFocus
          inputMode="decimal"
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => onEditingDimensionChange(event.target.value)}
          onBlur={onCommitDimensionEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommitDimensionEdit();
            }
            if (event.key === "Escape") {
              onCancelDimensionEdit();
            }
          }}
        />
      ) : null}
      {editingRotation ? (
        <label className="rotation-edit" style={{ "--overlay-x": `${editingRotation.x}px`, "--overlay-y": `${editingRotation.y}px` } as CSSProperties}>
          <input
            value={editingRotation.value}
            autoFocus
            inputMode="decimal"
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onEditingRotationChange(event.target.value)}
            onBlur={onCommitRotationEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onCommitRotationEdit();
              }
              if (event.key === "Escape") {
                onCancelRotationEdit();
              }
            }}
          />
          <span>&deg;</span>
        </label>
      ) : null}
      {tutorialHandle ? (
        <div
          className="tutorial-resize-guide"
          style={{ "--tutorial-handle-x": `${tutorialHandle.x}px`, "--tutorial-handle-y": `${tutorialHandle.y}px` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="tutorial-resize-message">Drag this dot to resize the cube</span>
          <svg className="tutorial-resize-cursor" viewBox="0 0 54 66">
            <path d="M8 4v46l12-11 9 21 10-5-9-20h17L8 4Z" />
          </svg>
        </div>
      ) : null}
      {box.handles.map((handle) => (
        <button
          key={handle.key}
          className={`transform-handle ${handle.className} ${tutorialHandle?.key === handle.key ? "tutorial-resize-target" : ""}`}
          data-transform-handle-key={handle.key}
          style={{ "--overlay-x": `${handle.x}px`, "--overlay-y": `${handle.y}px` } as CSSProperties}
          title={handle.title}
          onPointerEnter={(event) => {
            if ((event.buttons & 4) !== 0) {
              onHoverMeasure(null);
              return;
            }
            onHoverMeasure(handle.kind === "lift" ? null : handleMeasureKey(handle));
          }}
          onPointerLeave={() => onHoverMeasure(null)}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            if (tutorialHandle?.key === handle.key) onTutorialResizeStart?.();
            onPinMeasure(handleMeasureKey(handle));
            onBeginTransform(handle.kind, handle.key, event);
          }}
          onPointerMove={(event) => onMoveTransform(event.clientX, event.clientY, event.shiftKey, event.altKey)}
          onPointerUp={onFinishTransform}
          onPointerCancel={onFinishTransform}
          onClick={(event) => {
            if (handle.kind === "lift") {
              event.stopPropagation();
              onBeginLiftEdit(handle.key, handle.x + 42, handle.y - 32);
            }
          }}
        />
      ))}
      {box.rotateHandles.map((handle) => (
        <button
          key={handle.key}
          className={`rotate-handle ${handle.className}`}
          style={{ "--overlay-x": `${handle.x}px`, "--overlay-y": `${handle.y}px`, "--rotate-handle-angle": `${handle.angle}deg` } as CSSProperties}
          title="Rotate"
          onPointerDown={(event) => {
            if (event.button === 0) {
              onBeginTransform("rotate", handle.key, event);
            }
          }}
          onPointerMove={(event) => onMoveTransform(event.clientX, event.clientY, event.shiftKey, event.altKey)}
          onPointerUp={onFinishTransform}
          onPointerCancel={onFinishTransform}
          onClick={(event) => {
            event.stopPropagation();
            onBeginRotationEdit(handle.key, handle.x + 34, handle.y - 28);
          }}
        >
          <span className="rotate-handle-icon" aria-hidden="true">
            <svg viewBox="0 0 150 150" focusable="false">
              <path d="m145.4 67.6-12.1 7.7c-6.6-10.8-22.1-27.4-43.6-31.5-3.7-0.7-8-1.3-14.1-1.3-21.5 0-41.5 9.8-55.1 28.9l-3.3 4.1-12.4-7.9c-1.3-0.7-3 0.1-2.9 1.8l1.1 36.1c0.3 1.7 2 2.5 3.1 1.7l30.2-17.6c1.4-0.6 1.4-2.9 0-3.5l-12.1-6.7c9.7-14.8 26.4-28.5 51.2-28.6 20.5-0.1 37.4 9.8 50.7 28.6l-12 6.5c-1.6 0.6-1.5 3.3 0 3.8l30.2 17.4c1.4 0.7 3 0 3-1.7l0.8-36c0-1.5-1.5-2.6-2.7-1.8z" />
            </svg>
          </span>
        </button>
      ))}
      {!hideDimensionMarks && rotationReadout ? (
        <div className="rotation-readout" style={{ "--overlay-x": `${rotationReadout.x}px`, "--overlay-y": `${rotationReadout.y}px` } as CSSProperties}>
          {rotationReadout.text}
        </div>
      ) : null}
    </div>
  );
}
