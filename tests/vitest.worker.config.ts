import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig(async () => {
  const { cloudflareTest, readD1Migrations } = await import("@cloudflare/vitest-pool-workers");

  return {
    root: rootDir,
    plugins: [
      cloudflareTest(async () => ({
        wrangler: { configPath: path.join(rootDir, "wrangler.test.jsonc") },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(path.join(rootDir, "migrations")),
          },
          serviceBindings: {
            ASSETS: () => new Response("Static asset not found in Worker tests.", {
              status: 404,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
          },
        },
      })),
    ],
    test: {
      include: ["tests/worker/**/*.test.ts"],
      setupFiles: ["./tests/worker/apply-migrations.ts"],
      passWithNoTests: true,
    },
  };
});
