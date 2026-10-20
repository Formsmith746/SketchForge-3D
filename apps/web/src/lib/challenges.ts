export const CHALLENGE_TUTORIAL_IDS = ["key-tag", "nameplate"] as const;

export type ChallengeTutorialId = (typeof CHALLENGE_TUTORIAL_IDS)[number];

export function isChallengeTutorialId(value: unknown): value is ChallengeTutorialId {
  return typeof value === "string" && CHALLENGE_TUTORIAL_IDS.includes(value as ChallengeTutorialId);
}
