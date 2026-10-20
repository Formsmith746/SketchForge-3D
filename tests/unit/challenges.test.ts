import { describe, expect, it } from "vitest";
import { CHALLENGE_TUTORIAL_IDS, isChallengeTutorialId } from "@/lib/challenges";

describe("challenge tutorial ids", () => {
  it("recognizes every supported challenge", () => {
    expect(CHALLENGE_TUTORIAL_IDS).toEqual(["key-tag", "nameplate"]);
    expect(CHALLENGE_TUTORIAL_IDS.every(isChallengeTutorialId)).toBe(true);
  });

  it("rejects stale or malformed stored values", () => {
    expect(isChallengeTutorialId("phone-stand")).toBe(false);
    expect(isChallengeTutorialId(null)).toBe(false);
    expect(isChallengeTutorialId({ tutorial: "nameplate" })).toBe(false);
  });
});
