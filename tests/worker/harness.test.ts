import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type WorkerTestBindings = {
  ASSETS: Fetcher;
  AUTH_RATE_LIMITER: RateLimit;
  DB: D1Database;
  PROJECTS: R2Bucket;
};

describe("local Worker runtime harness", () => {
  it("provides migrated D1, local R2, rate limiting, and stub assets", async () => {
    const bindings = env as unknown as WorkerTestBindings;
    const tables = await bindings.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('projects', 'users') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map(({ name }) => name)).toEqual(["projects", "users"]);

    await bindings.PROJECTS.put("worker-harness/object.txt", "local-only");
    expect(await (await bindings.PROJECTS.get("worker-harness/object.txt"))?.text()).toBe("local-only");

    const rateLimit = await bindings.AUTH_RATE_LIMITER.limit({ key: crypto.randomUUID() });
    expect(rateLimit.success).toBe(true);

    const asset = await bindings.ASSETS.fetch("http://sketchforge.test/not-present");
    expect(asset.status).toBe(404);
  });
});
