"use client";

import { AlignCenter, Box, CircleDotDashed, Group, LockKeyhole, MoveUp, Type } from "lucide-react";
import type { ChallengeTutorialId } from "@/lib/challenges";

function KeyTagPreview() {
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/key-tag/card-key-tag-light.webp"
        alt="Finished red Key Tag model on the SketchForge workplane"
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/key-tag/card-key-tag-dark.webp"
        alt="Finished red Key Tag model on the dark SketchForge workplane"
      />
    </>
  );
}

function NameplatePreview() {
  return (
    <>
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-light"
        src="/assets/challenges/nameplate/card-nameplate-light.webp"
        alt="Finished blue ALEX nameplate on the SketchForge workplane"
      />
      <img
        className="challenge-key-tag-photo challenge-key-tag-photo-dark"
        src="/assets/challenges/nameplate/card-nameplate-dark.webp"
        alt="Finished blue ALEX nameplate on the dark SketchForge workplane"
      />
    </>
  );
}

export default function ChallengesDashboard({ onStartChallenge }: { onStartChallenge: (challenge: ChallengeTutorialId) => void }) {
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
              <h2>Key Tag</h2>
            </div>

            <p>Build your first Key Tag from simple shapes.</p>

            <div className="challenge-key-tag-skills" aria-label="Skills used in this challenge">
              <span><Box size={16} aria-hidden="true" /> Basic shapes</span>
              <span><AlignCenter size={16} aria-hidden="true" /> Align</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> Hole</span>
              <span><LockKeyhole size={16} aria-hidden="true" /> Lock</span>
              <span><Group size={16} aria-hidden="true" /> Group</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("key-tag")}>
              Start Challenge
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
              <h2>Personalized Nameplate</h2>
            </div>

            <p>Create a printable nameplate with rounded edges and raised custom text.</p>

            <div className="challenge-key-tag-skills" aria-label="Skills used in this challenge">
              <span><Box size={16} aria-hidden="true" /> Box</span>
              <span><CircleDotDashed size={16} aria-hidden="true" /> Fillet</span>
              <span><Type size={16} aria-hidden="true" /> Text</span>
              <span><MoveUp size={16} aria-hidden="true" /> Elevation</span>
              <span><AlignCenter size={16} aria-hidden="true" /> Align</span>
              <span><Group size={16} aria-hidden="true" /> Group</span>
            </div>

            <button type="button" className="challenge-key-tag-start" onClick={() => onStartChallenge("nameplate")}>
              Start Challenge
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
