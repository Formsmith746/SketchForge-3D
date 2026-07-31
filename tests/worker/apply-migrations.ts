import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

type WorkerTestBindings = {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

beforeAll(async () => {
  const bindings = env as unknown as WorkerTestBindings;
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
});
