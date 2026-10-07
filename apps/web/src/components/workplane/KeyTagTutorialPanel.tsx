"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const KEY_TAG_STEP_STORAGE_KEY = "sketchforge:key-tag-tutorial-step";

type TutorialDimension = {
  label: "Length" | "Width" | "Height";
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
  titleKey: string;
  bodyKey: string;
};

const STEPS: TutorialStep[] = [
  {
    eyebrow: "Before you start",
    title: "Build a Key Tag",
    body: "Set Snap Grid to 0.5 mm, then build the Key Tag from simple shapes.",
    image: "/assets/challenges/key-tag/01-finished-target.png",
    alt: "Finished Key Tag shown in the SketchForge workplane",
    snapGrid: "0.5 mm",
    titleKey: "keyTagSteps.buildKeyTag",
    bodyKey: "keyTagSteps.buildKeyTagBody",
  },
  {
    eyebrow: "Step 1",
    title: "Make the middle",
    body: "Add a Box, then set its size in the shape panel.",
    image: "/assets/challenges/key-tag/02-middle-box.png",
    alt: "The middle box of the Key Tag in SketchForge",
    dimensions: [
      { label: "Length", value: "25.50 mm", slider: 38 },
      { label: "Width", value: "11.50 mm", slider: 20 },
      { label: "Height", value: "1.00 mm", slider: 5 },
    ],
    titleKey: "keyTagSteps.makeMiddle",
    bodyKey: "keyTagSteps.makeMiddleBody",
  },
  {
    eyebrow: "Step 2",
    title: "Add the left round end",
    body: "Add a solid Cylinder and place half of it over the left end of the box.",
    image: "/assets/challenges/key-tag/03-left-round-end.png",
    alt: "A solid cylinder added to the left end of the Key Tag",
    dimensions: [
      { label: "Length", value: "11.50 mm", slider: 20 },
      { label: "Width", value: "11.50 mm", slider: 20 },
      { label: "Height", value: "1.00 mm", slider: 5 },
    ],
    titleKey: "keyTagSteps.addLeftRoundEnd",
    bodyKey: "keyTagSteps.addLeftRoundEndBody",
  },
  {
    eyebrow: "Step 3",
    title: "Make the other end",
    body: "Duplicate the solid cylinder and place the copy on the right end.",
    image: "/assets/challenges/key-tag/04-right-round-end.png",
    alt: "Two solid cylinders forming both rounded ends of the Key Tag",
    titleKey: "keyTagSteps.makeOtherEnd",
    bodyKey: "keyTagSteps.makeOtherEndBody",
  },
  {
    eyebrow: "Step 4",
    title: "Lock the left circle",
    body: "Select the left solid cylinder and press Lock. It will be the alignment reference.",
    image: "/assets/challenges/key-tag/05-select-left-circle.png",
    alt: "The left solid cylinder selected in the SketchForge workplane",
    titleKey: "keyTagSteps.lockLeftCircle",
    bodyKey: "keyTagSteps.lockLeftCircleBody",
  },
  {
    eyebrow: "Step 5",
    title: "Create the hole",
    body: "Add another Cylinder, set its size, then change it from Solid to Hole.",
    image: "/assets/challenges/key-tag/06-hole-cylinder.png",
    alt: "The small hole cylinder added near the left end of the Key Tag",
    dimensions: [
      { label: "Length", value: "3.00 mm", slider: 8 },
      { label: "Width", value: "3.00 mm", slider: 8 },
      { label: "Height", value: "2.00 mm", slider: 7 },
    ],
    titleKey: "keyTagSteps.createHole",
    bodyKey: "keyTagSteps.createHoleBody",
  },
  {
    eyebrow: "Step 6",
    title: "Align the hole",
    body: "Select the hole and the locked left circle. Press Align and choose the middle on both horizontal axes.",
    image: "/assets/challenges/key-tag/07-align-hole.png",
    alt: "The hole aligned to the center of the left solid cylinder",
    titleKey: "keyTagSteps.alignHole",
    bodyKey: "keyTagSteps.alignHoleBody",
  },
  {
    eyebrow: "Step 7",
    title: "Unlock the circle",
    body: "Select the left solid circle again and press Unlock.",
    image: "/assets/challenges/key-tag/08-unlock-left-circle.png",
    alt: "The left solid cylinder selected again after the hole has been aligned",
    titleKey: "keyTagSteps.unlockCircle",
    bodyKey: "keyTagSteps.unlockCircleBody",
  },
  {
    eyebrow: "Step 8",
    title: "Group the Key Tag",
    body: "Select the box, both solid circles, and the hole. Press Group.",
    image: "/assets/challenges/key-tag/09-grouped-key-tag.png",
    alt: "The finished grouped Key Tag selected in SketchForge",
    titleKey: "keyTagSteps.groupKeyTag",
    bodyKey: "keyTagSteps.groupKeyTagBody",
  },
];

function storedStepIndex() {
  if (typeof window === "undefined") return 0;
  const parsed = Number.parseInt(window.localStorage.getItem(KEY_TAG_STEP_STORAGE_KEY) ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(STEPS.length - 1, parsed)) : 0;
}

export function KeyTagTutorialPanel({
  onFinish,
  collapsed = false,
  onCollapsedChange,
}: {
  onFinish?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [stepIndex, setStepIndex] = useState(storedStepIndex);
  const t = useTranslations("tutorial");
  const step = STEPS[stepIndex];
  const first = stepIndex === 0;
  const last = stepIndex === STEPS.length - 1;

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    setStepIndex(next);
    window.localStorage.setItem(KEY_TAG_STEP_STORAGE_KEY, String(next));
  };

  if (collapsed) {
    return (
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label={t("keyTagChallenge")}>
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title={t("expandInstructions")}
          aria-label={t("expandInstructions")}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">{t("keyTag")}</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
      <aside
        className="key-tag-tutorial-panel"
        aria-label={t("keyTagChallenge")}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="key-tag-tutorial-header">
        <div>
          <span>{t("challenge1")}</span>
          <strong>{t("keyTag")}</strong>
        </div>
        <div className="key-tag-tutorial-header-actions">
          <span className="key-tag-tutorial-count">{stepIndex + 1} / {STEPS.length}</span>
          <button
            type="button"
            className="key-tag-tutorial-collapse"
            title={t("minimizeInstructions")}
            aria-label={t("minimizeInstructions")}
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="key-tag-tutorial-body">
        <div className="key-tag-tutorial-copy">
          <span className="key-tag-tutorial-eyebrow">{stepIndex === 0 ? t("beforeYouStart") : t("step", { number: stepIndex + 1 })}</span>
          <h2>{t(step.titleKey)}</h2>
          <p>{t(step.bodyKey)}</p>

          {step.snapGrid ? (
            <div className="key-tag-snap-row" aria-label={`Snap Grid ${step.snapGrid}`}>
              <span>{t("snapGrid")}</span>
              <strong>{step.snapGrid}</strong>
            </div>
          ) : null}

          {step.dimensions ? (
            <div className="key-tag-tutorial-dimensions" aria-label={t("requiredDimensions")}>
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
          <ChevronLeft size={17} /> {t("previous")}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (last) {
              window.localStorage.removeItem(KEY_TAG_STEP_STORAGE_KEY);
              onFinish?.();
              return;
            }
            goToStep(stepIndex + 1);
          }}
        >
          {last ? t("finish") : t("next")} {!last ? <ChevronRight size={17} /> : null}
        </button>
      </footer>
    </aside>
  );
}
