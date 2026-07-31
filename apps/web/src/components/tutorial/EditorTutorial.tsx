"use client";

import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

export type EditorTutorialStep = "welcome" | "workspace" | "shapes" | "cube" | "inspector" | "resize" | "complete";

type SpotlightRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function readInspectorRect(): SpotlightRect | null {
  const inspector = document.querySelector<HTMLElement>(".shape-inspector");
  if (!inspector) return null;
  const rect = inspector.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function InspectorSpotlight({ onSkip, onNext }: { onSkip: () => void; onNext: () => void }) {
  const [target, setTarget] = useState<SpotlightRect | null>(null);

  useLayoutEffect(() => {
    const update = () => setTarget(readInspectorRect());
    update();
    const observer = new ResizeObserver(update);
    const inspector = document.querySelector<HTMLElement>(".shape-inspector");
    if (inspector) observer.observe(inspector);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 720 : window.innerHeight;
  const safeTarget = target ?? {
    top: 108,
    left: Math.max(0, viewportWidth - 320),
    right: viewportWidth,
    bottom: viewportHeight,
    width: Math.min(320, viewportWidth),
    height: Math.max(0, viewportHeight - 108),
  };
  const cardWidth = Math.min(360, Math.max(280, viewportWidth - 36));
  const fitsToLeft = safeTarget.left >= cardWidth + 54;
  const cardStyle = fitsToLeft
    ? {
        width: `${cardWidth}px`,
        left: `${Math.max(18, safeTarget.left - cardWidth - 30)}px`,
        top: `${Math.max(126, Math.min(viewportHeight - 270, safeTarget.top + safeTarget.height * 0.3))}px`,
      }
    : {
        width: `${cardWidth}px`,
        left: `${Math.max(18, (viewportWidth - cardWidth) / 2)}px`,
        top: `${Math.max(126, Math.min(viewportHeight - 270, safeTarget.bottom + 18))}px`,
      };

  return (
    <div className="editor-tutorial-spotlight" role="dialog" aria-modal="true" aria-labelledby="tutorial-inspector-title">
      <div className="tutorial-shade tutorial-shade-top" style={{ height: `${Math.max(0, safeTarget.top)}px` }} />
      <div className="tutorial-shade tutorial-shade-left" style={{ top: `${safeTarget.top}px`, width: `${Math.max(0, safeTarget.left)}px`, height: `${safeTarget.height}px` }} />
      <div className="tutorial-shade tutorial-shade-right" style={{ top: `${safeTarget.top}px`, left: `${safeTarget.right}px`, height: `${safeTarget.height}px` }} />
      <div className="tutorial-shade tutorial-shade-bottom" style={{ top: `${safeTarget.bottom}px` }} />
      <div
        className="tutorial-spotlight-frame"
        style={{ top: `${safeTarget.top}px`, left: `${safeTarget.left}px`, width: `${safeTarget.width}px`, height: `${safeTarget.height}px` }}
      />
      <section className={`tutorial-inspector-card ${fitsToLeft ? "points-right" : "points-up"}`} style={cardStyle as CSSProperties}>
        <span className="tutorial-step-kicker">Shape controls</span>
        <h2 id="tutorial-inspector-title">Make the cube your own</h2>
        <p>Use this panel to choose Solid or Hole and adjust the cube’s length, width, and height.</p>
        <footer className="tutorial-card-actions">
          <button className="tutorial-skip-button" type="button" onClick={onSkip}>Skip tutorial</button>
          <button className="tutorial-next-button" type="button" onClick={onNext}>Next</button>
        </footer>
      </section>
    </div>
  );
}

export function EditorTutorialOverlay({ step, onSkip, onNext }: { step: EditorTutorialStep; onSkip: () => void; onNext: () => void }) {
  const modalOpen = step === "welcome" || step === "workspace";

  useEffect(() => {
    if (!modalOpen && step !== "inspector") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [modalOpen, onSkip, step]);

  if (step === "inspector") {
    return <InspectorSpotlight onSkip={onSkip} onNext={onNext} />;
  }
  if (!modalOpen) return null;

  const welcome = step === "welcome";
  return (
    <div className="editor-tutorial-modal-layer" role="dialog" aria-modal="true" aria-labelledby="editor-tutorial-title">
      <section className="editor-tutorial-card">
        <div className="editor-tutorial-media">
          <img
            src={welcome ? "/assets/sketchforge/tutorial-introduction.png" : "/assets/sketchforge/tutorial-workplane.png"}
            alt={welcome ? "A selected cube in the SketchForge editor" : "An empty SketchForge workplane ready for a first shape"}
          />
          <span className="editor-tutorial-progress" aria-label={`Slide ${welcome ? 1 : 2} of 2`}>
            <i className="active" />
            <i className={welcome ? "" : "active"} />
          </span>
        </div>
        <div className="editor-tutorial-copy">
          <span className="tutorial-step-kicker">{welcome ? "Welcome to SketchForge" : "Move around your design"}</span>
          <h1 id="editor-tutorial-title">{welcome ? "Let’s build your first cube" : "Your workplane, your point of view"}</h1>
          <p>
            {welcome
              ? "This quick tutorial will show you how to add a shape, change its dimensions, and resize it directly on the workplane."
              : "Right-drag to orbit, middle-drag to pan, and scroll to zoom. The camera unlocks as soon as you continue."}
          </p>
        </div>
        <footer className="editor-tutorial-actions">
          <button className="tutorial-skip-button" type="button" onClick={onSkip}>Skip tutorial</button>
          <button className="tutorial-next-button" type="button" onClick={onNext}>Next</button>
        </footer>
      </section>
    </div>
  );
}

export function TutorialCompletionWindow({ onClose }: { onClose: () => void }) {
  return (
    <aside className="tutorial-completion-window" role="dialog" aria-labelledby="tutorial-completion-title" aria-describedby="tutorial-completion-description">
      <div>
        <span className="tutorial-step-kicker">Tutorial complete</span>
        <h2 id="tutorial-completion-title">You have completed the tutorial</h2>
        <p id="tutorial-completion-description">You are ready to keep creating in SketchForge.</p>
      </div>
      <button type="button" onClick={onClose}>Close</button>
    </aside>
  );
}
