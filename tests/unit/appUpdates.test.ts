import { describe, expect, it } from "vitest";
import { appUpdateIsAvailable, compareAppVersions } from "@/lib/appUpdates";

describe("application update versions", () => {
  it("orders semantic releases numerically", () => {
    expect(compareAppVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareAppVersions("1.0.0", "0.99.99")).toBeGreaterThan(0);
    expect(compareAppVersions("v1.0.0", "1.0.0")).toBe(0);
  });

  it("keeps prereleases below their stable release", () => {
    expect(compareAppVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareAppVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });

  it("only offers a strictly newer version", () => {
    expect(appUpdateIsAvailable("1.0.0", "1.0.1")).toBe(true);
    expect(appUpdateIsAvailable("1.0.0", "1.0.0")).toBe(false);
    expect(appUpdateIsAvailable("1.0.0", "0.9.9")).toBe(false);
  });
});
