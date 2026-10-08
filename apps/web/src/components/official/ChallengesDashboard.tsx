"use client";

import { AlignCenter, Box, CircleDotDashed, Group, LockKeyhole, MoveUp, Type } from "lucide-react";
import { useTranslations } from "@/i18n";
import type { ChallengeTutorialId } from "@/lib/challenges";

function KeyTagPreview() {
  const t = useTranslations();
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/key-tag/card-key-tag-light.webp"
        alt={t("dashboard.challenges.keyTag.altLight")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/key-tag/card-key-tag-dark.webp"
        alt={t("dashboard.challenges.keyTag.altDark")}
      />
    </>
  );
}

function NameplatePreview() {
  const t = useTranslations();
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/nameplate/card-nameplate-light.webp"
        alt={t("dashboard.challenges.nameplate.altLight")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/nameplate/card-nameplate-dark.webp"
        alt={t("dashboard.challenges.nameplate.altDark")}
      />
    </>
  );
}

export default function ChallengesDashboard({ onStartChallenge }: { onStartChallenge: (challenge: ChallengeTutorialId) => void }) {
  const t = useTranslations();
  return (
    <div className="challenge-key-tag-page">
      <div className="challenge-key-tag-rail" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="challenge-card-stack">
        <article className="challenge-key-tag-card">
          <div className="challenge-key-tag-preview">
            <KeyTagPreview />
          </div>

          <div className="challenge-key-tag-content">
            <div className="challenge-key-tag-title-row">
              <span>01</span>
              <h2>{t("dashboard.challenges.keyTag.title")}</h2>
            </div>

            <p>{t("dashboard.challenges.keyTag.description")}</p>

            <div className="challenge-key-tag-skills" aria-label={t("dashboard.challenges.skills")}>
              <span><Box size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.basicShapes")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.align")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.hole")}</span>
              <span><LockKeyhole size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.lock")}</span>
              <span><Group size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("key-tag")}>
              {t("dashboard.challenges.start")}
            </button>
          </div>
        </article>

        <article className="challenge-key-tag-card">
          <div className="challenge-key-tag-preview">
            <NameplatePreview />
          </div>

          <div className="challenge-key-tag-content">
            <div className="challenge-key-tag-title-row">
              <span>02</span>
              <h2>{t("dashboard.challenges.nameplate.title")}</h2>
            </div>

            <p>{t("dashboard.challenges.nameplate.description")}</p>

            <div className="challenge-key-tag-skills" aria-label={t("dashboard.challenges.skills")}>
              <span><Box size={16} aria-hidden="true" /> {t("common.shape.box")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.fillet")}</span>
              <span><Type size={16} aria-hidden="true" /> {t("common.shape.text")}</span>
              <span><MoveUp size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.elevation")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.align")}</span>
              <span><Group size={16} aria-hidden="true" /> {t("dashboard.challenges.skill.group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("nameplate")}>
              {t("dashboard.challenges.start")}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
