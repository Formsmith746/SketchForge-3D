"use client";

import { ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect, useState } from "react";

const NAMEPLATE_STEP_STORAGE_KEY = "sketchforge:nameplate-tutorial-step";

type TutorialDimension = {
  label: "Length" | "Width" | "Height" | "Elevation";
  value: string;
  slider: number;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  alt: string;
  dimensions?: TutorialDimension[];
  snapGrid?: string;
  callout?: string;
};

const STEPS: TutorialStep[] = [
  {
    eyebrow: "Before you start",
    title: "Build a Nameplate",
    body: "Create a rounded base, personalize a Text object, then combine both parts into one printable design.",
    image: "/assets/challenges/nameplate/01-finished-target.webp",
    alt: "Finished blue ALEX nameplate on the SketchForge workplane",
    snapGrid: "0.5 mm",
  },
  {
    eyebrow: "Step 1",
    title: "Make the base",
    body: "Add a Box and enter these dimensions in the shape panel.",
    image: "/assets/challenges/nameplate/02-base-box.webp",
    alt: "Plain rectangular blue nameplate base",
    dimensions: [
      { label: "Length", value: "24.00 mm", slider: 24 },
      { label: "Width", value: "70.00 mm", slider: 70 },
      { label: "Height", value: "3.00 mm", slider: 12 },
    ],
  },
  {
    eyebrow: "Step 2",
    title: "Round the outside",
    body: "Select the base, press Fillet, select its outside edges, and apply the treatment.",
    image: "/assets/challenges/nameplate/03-rounded-base.webp",
    alt: "Blue nameplate base with softly rounded outer edges",
    callout: "Use a 1.00 mm fillet amount.",
  },
  {
    eyebrow: "Step 3",
    title: "Add a Text object",
    body: "Open Shapes and add Text. The new object starts with the letter T.",
    image: "/assets/challenges/nameplate/04-text-added.webp",
    alt: "A red capital T Text object on the blue nameplate base",
  },
  {
    eyebrow: "Step 4",
    title: "Personalize the text",
    body: "Change the Text field to your name. This example uses ALEX. Pick any font you like.",
    image: "/assets/challenges/nameplate/05-text-customized.webp",
    alt: "Raised red ALEX text placed off-center on the blue base",
    dimensions: [
      { label: "Height", value: "2.00 mm", slider: 9 },
    ],
  },
  {
    eyebrow: "Step 5",
    title: "Place it on top",
    body: "Lift the Text object until its bottom sits exactly on the top face of the 3 mm base.",
    image: "/assets/challenges/nameplate/05-text-customized.webp",
    alt: "Raised red ALEX text resting on the blue nameplate base",
    dimensions: [
      { label: "Elevation", value: "3.00 mm", slider: 12 },
    ],
  },
  {
    eyebrow: "Step 6",
    title: "Center the name",
    body: "Lock the base, select the Text and base, then Align to the middle on both horizontal axes. Unlock the base afterward.",
    image: "/assets/challenges/nameplate/06-text-centered.webp",
    alt: "Red ALEX text centered on the blue nameplate base",
    callout: "The locked base stays fixed as your alignment reference.",
  },
  {
    eyebrow: "Step 7",
    title: "Group the Nameplate",
    body: "Select the base and Text object, then press Group to make one finished printable model.",
    image: "/assets/challenges/nameplate/07-grouped-nameplate.webp",
    alt: "Finished grouped blue ALEX nameplate",
  },
];

function storedStepIndex() {
  if (typeof window === "undefined") return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(NAMEPLATE_STEP_STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(STEPS.length - 1, parsed)) : 0;
}

function FilletButtonCoachmark() {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLButtonElement>('button[data-sketchforge-tool="fillet"]');
    if (!target) return;

    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      setPosition({
        left: rect.left + rect.width / 2,
        top: rect.bottom + 42,
      });
    };

    target.classList.add("nameplate-fillet-button-target");
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = new ResizeObserver(updatePosition);
    observer.observe(target);

    return () => {
      target.classList.remove("nameplate-fillet-button-target");
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      observer.disconnect();
    };
  }, []);

  if (!position) return null;

  return (
    <div className="nameplate-fillet-coachmark" style={position} role="status">
      <ArrowUp size={30} strokeWidth={3} aria-hidden="true" />
      <strong>Click Fillet</strong>
    </div>
  );
}

export function NameplateTutorialPanel({
  onFinish,
  collapsed = false,
  onCollapsedChange,
}: {
  onFinish?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(storedStepIndex);
  const step = STEPS[stepIndex];
  const first = stepIndex === 0;
  const last = stepIndex === STEPS.length - 1;

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    setStepIndex(next);
    window.localStorage.setItem(NAMEPLATE_STEP_STORAGE_KEY, String(next));
  };

  if (collapsed) {
    return (
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label="Personalized Nameplate challenge instructions">
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title="Expand challenge instructions"
          aria-label="Expand challenge instructions"
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">Nameplate</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
    <>
      {stepIndex === 2 ? <FilletButtonCoachmark /> : null}
      <aside
        className="key-tag-tutorial-panel"
        aria-label="Personalized Nameplate challenge instructions"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
      <header className="key-tag-tutorial-header">
        <div>
          <span>Challenge 2</span>
          <strong>Personalized Nameplate</strong>
        </div>
        <div className="key-tag-tutorial-header-actions">
          <span className="key-tag-tutorial-count">{stepIndex + 1} / {STEPS.length}</span>
          <button
            type="button"
            className="key-tag-tutorial-collapse"
            title="Minimize challenge instructions"
            aria-label="Minimize challenge instructions"
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="key-tag-tutorial-body">
        <div className="key-tag-tutorial-copy">
          <span className="key-tag-tutorial-eyebrow">{step.eyebrow}</span>
          <h2>{step.title}</h2>
          <p>{step.body}</p>

          {step.snapGrid ? (
            <div className="key-tag-snap-row" aria-label={`Snap Grid ${step.snapGrid}`}>
              <span>Snap Grid</span>
              <strong>{step.snapGrid}</strong>
            </div>
          ) : null}

          {step.callout ? <div className="nameplate-tutorial-callout">{step.callout}</div> : null}

          {step.dimensions ? (
            <div className="key-tag-tutorial-dimensions" aria-label="Required dimensions">
              {step.dimensions.map((dimension) => (
                <div className="key-tag-tutorial-dimension-control" key={dimension.label}>
                  <div className="key-tag-tutorial-dimension-heading">
                    <span>{dimension.label}</span>
                    <strong>{dimension.value}</strong>
                  </div>
                  <div className="key-tag-tutorial-slider" aria-hidden="true">
                    <span style={{ width: `${dimension.slider}%` }} />
                    <i style={{ left: `${dimension.slider}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="key-tag-tutorial-image-box">
          <img className="key-tag-tutorial-capture" src={step.image} alt={step.alt} draggable={false} />
        </div>
      </div>

      <footer className="key-tag-tutorial-footer">
        <button type="button" className="secondary" disabled={first} onClick={() => goToStep(stepIndex - 1)}>
          <ChevronLeft size={17} /> Previous
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (last) {
              window.localStorage.removeItem(NAMEPLATE_STEP_STORAGE_KEY);
              onFinish?.();
              return;
            }
            goToStep(stepIndex + 1);
          }}
        >
          {last ? "Finish" : "Next"} {!last ? <ChevronRight size={17} /> : null}
        </button>
      </footer>
      </aside>
    </>
  );
}
