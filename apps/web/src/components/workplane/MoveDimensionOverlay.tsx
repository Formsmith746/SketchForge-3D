"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { MoveDimensionAxis, MoveDimensionOverlayData } from "@/lib/moveDimensionLines";

export function MoveDimensionOverlay({
  overlay,
  active,
  onCommit,
}: {
  overlay: MoveDimensionOverlayData;
  active: boolean;
  onCommit: (axis: MoveDimensionAxis, value: string) => void;
}) {
  const [editing, setEditing] = useState<{ axis: MoveDimensionAxis; value: string } | null>(null);
  const nextEditingAxisRef = useRef<MoveDimensionAxis | null>(null);
  const cancelEditRef = useRef(false);

  useEffect(() => {
    if (active) {
      setEditing(null);
    }
  }, [active]);

  const stopPointerPropagation = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditRef.current = true;
      event.currentTarget.blur();
    } else if (event.key === "Tab" && overlay.lines.length > 1) {
      event.preventDefault();
      const currentIndex = overlay.lines.findIndex((line) => line.axis === editing?.axis);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = (currentIndex + direction + overlay.lines.length) % overlay.lines.length;
      nextEditingAxisRef.current = overlay.lines[nextIndex].axis;
      event.currentTarget.blur();
    }
  };

  const styleForLine = (line: MoveDimensionOverlayData["lines"][number]) => ({
    "--overlay-x": `${line.labelX}px`,
    "--overlay-y": `${line.labelY}px`,
  }) as CSSProperties;

  return (
    <div className={`move-dimension-overlay ${active ? "active" : "settled"}`} aria-label="Movement dimensions">
      {overlay.lines.map((line) => {
        if (editing?.axis === line.axis) {
          return (
            <input
              key={`edit-${line.axis}`}
              className="dimension-input move-dimension-input"
              aria-label={`${line.axis.toUpperCase()} movement`}
              value={editing.value}
              autoFocus
              inputMode="decimal"
              spellCheck={false}
              style={styleForLine(line)}
              onChange={(event) => setEditing({ axis: line.axis, value: event.target.value })}
              onBlur={() => {
                const nextAxis = nextEditingAxisRef.current;
                nextEditingAxisRef.current = null;
                if (!cancelEditRef.current) {
                  onCommit(line.axis, editing.value);
                }
                cancelEditRef.current = false;
                const nextLine = nextAxis ? overlay.lines.find((candidate) => candidate.axis === nextAxis) : null;
                setEditing(nextLine ? { axis: nextLine.axis, value: nextLine.label } : null);
              }}
              onKeyDown={handleKeyDown}
              onPointerDown={stopPointerPropagation}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            />
          );
        }

        return active ? (
          <span
            key={line.axis}
            className="dimension-label move-dimension-value"
            style={styleForLine(line)}
          >
            {line.label}
          </span>
        ) : (
          <button
            key={line.axis}
            className="dimension-label move-dimension-value"
            type="button"
            aria-label={`${line.axis.toUpperCase()} movement`}
            style={styleForLine(line)}
            onClick={() => setEditing({ axis: line.axis, value: line.label })}
            onPointerDown={stopPointerPropagation}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {line.label}
          </button>
        );
      })}
    </div>
  );
}
