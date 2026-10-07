import type { NextConfig } from "next";
import path from "node:path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isStaticExport = process.env.STATIC_EXPORT === "true";
const isDockerBuild = process.env.SKETCHFORGE_DOCKER_BUILD === "true";
const extraAllowedDevOrigins = (process.env.SKETCHFORGE_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd()),
  devIndicators: false,
  distDir: isStaticExport ? ".next-export" : process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  allowedDevOrigins: ["localhost", "127.0.0.1", ...extraAllowedDevOrigins],
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "true" : "false",
  },
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "brepkit-wasm": false,
      "brepjs-opencascade": false,
    };
    return config;
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : isDockerBuild
      ? { output: "standalone" as const }
      : {}),
};

export default withNextIntl(nextConfig);
