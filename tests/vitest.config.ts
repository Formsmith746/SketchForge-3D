import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "apps/web/src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/unit/cloud*.test.ts"],
  },
});
