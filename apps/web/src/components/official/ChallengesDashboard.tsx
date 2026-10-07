"use client";

import { AlignCenter, Box, CircleDotDashed, Group, LockKeyhole, MoveUp, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChallengeTutorialId } from "@/lib/challenges";

function KeyTagPreview() {
  const c = useTranslations("challenges");
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/key-tag/card-key-tag-light.webp"
        alt={c("keyTagLight")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/key-tag/card-key-tag-dark.webp"
        alt={c("keyTagDark")}
      />
    </>
  );
}

function NameplatePreview() {
  const c = useTranslations("challenges");
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/nameplate/card-nameplate-light.webp"
        alt={c("nameplateLight")}
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/nameplate/card-nameplate-dark.webp"
        alt={c("nameplateDark")}
      />
    </>
  );
}

export default function ChallengesDashboard({ onStartChallenge }: { onStartChallenge: (challenge: ChallengeTutorialId) => void }) {
  const t = useTranslations("tutorial");
  const c = useTranslations("challenges");
  const ed = useTranslations("editor");
  const sh = useTranslations("shapes");
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
              <h2>{t("keyTag")}</h2>
            </div>

            <p>{c("keyTagDescription")}</p>

            <div className="challenge-key-tag-skills" aria-label={c("skillsUsed")}>
              <span><Box size={16} aria-hidden="true" /> {ed("shapes")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {ed("align")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {ed("hole")}</span>
              <span><LockKeyhole size={16} aria-hidden="true" /> {ed("lock")}</span>
              <span><Group size={16} aria-hidden="true" /> {ed("group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("key-tag")}>
              {c("startChallenge")}
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
              <h2>{t("nameplate")}</h2>
            </div>

            <p>{c("nameplateDescription")}</p>

            <div className="challenge-key-tag-skills" aria-label={c("skillsUsed")}>
              <span><Box size={16} aria-hidden="true" /> {sh("box")}</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> {ed("fillet")}</span>
              <span><Type size={16} aria-hidden="true" /> {sh("text")}</span>
              <span><MoveUp size={16} aria-hidden="true" /> {sh("elevation")}</span>
              <span><AlignCenter size={16} aria-hidden="true" /> {ed("align")}</span>
              <span><Group size={16} aria-hidden="true" /> {ed("group")}</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("nameplate")}>
              {c("startChallenge")}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
