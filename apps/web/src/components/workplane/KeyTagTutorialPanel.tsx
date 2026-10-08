"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslations, type MessageKey } from "@/i18n";
import { snapGridLabel } from "@/lib/measurementUnits";
import type { GridSize } from "@/types/sketchforge";

const KEY_TAG_STEP_STORAGE_KEY = "sketchforge:key-tag-tutorial-step";

type TutorialDimension = {
  labelKey: MessageKey;
  millimeters: number;
  slider: number;
};

type TutorialStep = {
  titleKey: MessageKey;
  bodyKey: MessageKey;
  altKey: MessageKey;
  image: string;
  dimensions?: TutorialDimension[];
  snapGrid?: GridSize;
};

// Step 0 is the "Before you start" overview; step N is labelled "Step N".
const STEPS: TutorialStep[] = [
  {
    titleKey: "panels.keyTag.intro.title",
    bodyKey: "panels.keyTag.intro.body",
    altKey: "panels.keyTag.intro.alt",
    image: "/assets/challenges/key-tag/01-finished-target.png",
    snapGrid: "0.5 mm",
  },
  {
    titleKey: "panels.keyTag.middle.title",
    bodyKey: "panels.keyTag.middle.body",
    altKey: "panels.keyTag.middle.alt",
    image: "/assets/challenges/key-tag/02-middle-box.png",
    dimensions: [
      { labelKey: "panels.property.length", millimeters: 25.5, slider: 38 },
      { labelKey: "panels.property.width", millimeters: 11.5, slider: 20 },
      { labelKey: "panels.property.height", millimeters: 1, slider: 5 },
    ],
  },
  {
    titleKey: "panels.keyTag.leftEnd.title",
    bodyKey: "panels.keyTag.leftEnd.body",
    altKey: "panels.keyTag.leftEnd.alt",
    image: "/assets/challenges/key-tag/03-left-round-end.png",
    dimensions: [
      { labelKey: "panels.property.length", millimeters: 11.5, slider: 20 },
      { labelKey: "panels.property.width", millimeters: 11.5, slider: 20 },
      { labelKey: "panels.property.height", millimeters: 1, slider: 5 },
    ],
  },
  {
    titleKey: "panels.keyTag.rightEnd.title",
    bodyKey: "panels.keyTag.rightEnd.body",
    altKey: "panels.keyTag.rightEnd.alt",
    image: "/assets/challenges/key-tag/04-right-round-end.png",
  },
  {
    titleKey: "panels.keyTag.lockCircle.title",
    bodyKey: "panels.keyTag.lockCircle.body",
    altKey: "panels.keyTag.lockCircle.alt",
    image: "/assets/challenges/key-tag/05-select-left-circle.png",
  },
  {
    titleKey: "panels.keyTag.hole.title",
    bodyKey: "panels.keyTag.hole.body",
    altKey: "panels.keyTag.hole.alt",
    image: "/assets/challenges/key-tag/06-hole-cylinder.png",
    dimensions: [
      { labelKey: "panels.property.length", millimeters: 3, slider: 8 },
      { labelKey: "panels.property.width", millimeters: 3, slider: 8 },
      { labelKey: "panels.property.height", millimeters: 2, slider: 7 },
    ],
  },
  {
    titleKey: "panels.keyTag.alignHole.title",
    bodyKey: "panels.keyTag.alignHole.body",
    altKey: "panels.keyTag.alignHole.alt",
    image: "/assets/challenges/key-tag/07-align-hole.png",
  },
  {
    titleKey: "panels.keyTag.unlockCircle.title",
    bodyKey: "panels.keyTag.unlockCircle.body",
    altKey: "panels.keyTag.unlockCircle.alt",
    image: "/assets/challenges/key-tag/08-unlock-left-circle.png",
  },
  {
    titleKey: "panels.keyTag.group.title",
    bodyKey: "panels.keyTag.group.body",
    altKey: "panels.keyTag.group.alt",
    image: "/assets/challenges/key-tag/09-grouped-key-tag.png",
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
  const t = useTranslations();
  const [stepIndex, setStepIndex] = useState(storedStepIndex);
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
      <aside className="key-tag-tutorial-panel key-tag-tutorial-panel-collapsed" aria-label={t("panels.keyTag.ariaLabel")}>
        <button
          type="button"
          className="key-tag-tutorial-expand"
          title={t("panels.tutorial.expand")}
          aria-label={t("panels.tutorial.expand")}
          onClick={() => onCollapsedChange?.(false)}
        >
          <ChevronLeft size={19} />
        </button>
        <span className="key-tag-tutorial-collapsed-label">{t("panels.keyTag.title")}</span>
        <span className="key-tag-tutorial-collapsed-count">{stepIndex + 1}/{STEPS.length}</span>
      </aside>
    );
  }

  return (
    <aside
      className="key-tag-tutorial-panel"
      aria-label={t("panels.keyTag.ariaLabel")}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header className="key-tag-tutorial-header">
        <div>
          <span>{t("panels.tutorial.challenge", { number: 1 })}</span>
          <strong>{t("panels.keyTag.title")}</strong>
        </div>
        <div className="key-tag-tutorial-header-actions">
          <span className="key-tag-tutorial-count">{stepIndex + 1} / {STEPS.length}</span>
          <button
            type="button"
            className="key-tag-tutorial-collapse"
            title={t("panels.tutorial.minimize")}
            aria-label={t("panels.tutorial.minimize")}
            onClick={() => onCollapsedChange?.(true)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <div className="key-tag-tutorial-body">
        <div className="key-tag-tutorial-copy">
          <span className="key-tag-tutorial-eyebrow">{first ? t("panels.tutorial.beforeStart") : t("panels.tutorial.step", { number: stepIndex })}</span>
          <h2>{t(step.titleKey)}</h2>
          <p>{t(step.bodyKey)}</p>

          {step.snapGrid ? (
            <div className="key-tag-snap-row" aria-label={t("panels.tutorial.snapGridValue", { value: snapGridLabel(t, step.snapGrid) })}>
              <span>{t("panels.snapGrid.label")}</span>
              <strong>{snapGridLabel(t, step.snapGrid)}</strong>
            </div>
          ) : null}

          {step.dimensions ? (
            <div className="key-tag-tutorial-dimensions" aria-label={t("panels.tutorial.requiredDimensions")}>
              {step.dimensions.map((dimension) => (
                <div className="key-tag-tutorial-dimension-control" key={dimension.labelKey}>
                  <div className="key-tag-tutorial-dimension-heading">
                    <span>{t(dimension.labelKey)}</span>
                    <strong>{t("panels.unit.millimeters", { value: dimension.millimeters.toFixed(2) })}</strong>
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
          <img className="key-tag-tutorial-capture" src={step.image} alt={t(step.altKey)} draggable={false} />
        </div>
      </div>

      <footer className="key-tag-tutorial-footer">
        <button type="button" className="secondary" disabled={first} onClick={() => goToStep(stepIndex - 1)}>
          <ChevronLeft size={17} /> {t("panels.tutorial.previous")}
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
          {last ? t("panels.tutorial.finish") : t("panels.tutorial.next")} {!last ? <ChevronRight size={17} /> : null}
        </button>
      </footer>
    </aside>
  );
}
