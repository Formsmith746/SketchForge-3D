import { describe, expect, it } from "vitest";
import { deriveRotationMode, parseRotationModeParam } from "@/lib/rotationMode";

describe("parseRotationModeParam", () => {
  it("returns 'rings' or 'classic' when the param is present", () => {
    expect(parseRotationModeParam("?rotationMode=rings")).toBe("rings");
    expect(parseRotationModeParam("?rotationMode=classic")).toBe("classic");
  });

  it("tolerates a query string without a leading ?", () => {
    expect(parseRotationModeParam("rotationMode=rings")).toBe("rings");
  });

  it("returns null when the param is missing", () => {
    expect(parseRotationModeParam("?foo=bar")).toBeNull();
    expect(parseRotationModeParam("")).toBeNull();
  });

  it("returns null when the value is unknown", () => {
    expect(parseRotationModeParam("?rotationMode=purple")).toBeNull();
    expect(parseRotationModeParam("?rotationMode=")).toBeNull();
  });
});

describe("deriveRotationMode", () => {
  it("URL override wins over everything", () => {
    expect(
      deriveRotationMode({ urlOverride: "rings", preferClassic: true, mediaMatches: true }),
    ).toBe("rings");
    expect(
      deriveRotationMode({ urlOverride: "classic", preferClassic: false, mediaMatches: false }),
    ).toBe("classic");
  });

  it("preference forces classic when set (and no URL override)", () => {
    expect(
      deriveRotationMode({ urlOverride: null, preferClassic: true, mediaMatches: false }),
    ).toBe("classic");
  });

  it("media match selects classic when nothing overrides", () => {
    expect(
      deriveRotationMode({ urlOverride: null, preferClassic: false, mediaMatches: true }),
    ).toBe("classic");
  });

  it("defaults to rings on desktop with no preference and no override", () => {
    expect(
      deriveRotationMode({ urlOverride: null, preferClassic: false, mediaMatches: false }),
    ).toBe("rings");
  });
});
