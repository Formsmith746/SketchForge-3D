#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [sourceArgument, targetArgument] = process.argv.slice(2);
if (!sourceArgument || !targetArgument) {
  console.error("Usage: prepare-web-build.mjs SOURCE_WEB_DIR TARGET_WEB_DIR");
  process.exit(2);
}

const sourceDirectory = path.resolve(sourceArgument);
const targetDirectory = path.resolve(targetArgument);
if (sourceDirectory === targetDirectory || !targetDirectory.includes(`${path.sep}apps${path.sep}mac${path.sep}.cache${path.sep}`)) {
  throw new Error(`Refusing to replace unsafe staging directory: ${targetDirectory}`);
}

await rm(targetDirectory, { recursive: true, force: true });
await mkdir(path.dirname(targetDirectory), { recursive: true });
await cp(sourceDirectory, targetDirectory, {
  recursive: true,
  filter(source) {
    const relative = path.relative(sourceDirectory, source);
    return !relative.split(path.sep).some((part) => part === ".next" || part === ".next-dev" || part === ".next-export");
  },
});

async function transform(relativePath, transform) {
  const filePath = path.join(targetDirectory, relativePath);
  const original = await readFile(filePath, "utf8");
  const updated = transform(original);
  if (updated === original) {
    throw new Error(`Mac MCP overlay did not match ${relativePath}; update prepare-web-build.mjs for the current web source.`);
  }
  await writeFile(filePath, updated, "utf8");
}

await transform("src/app/api/sketchforge-mcp/route.ts", (source) => {
  const guard = 'if (process.env.NODE_ENV === "production") {';
  const matches = source.split(guard).length - 1;
  if (matches !== 1) throw new Error(`Expected one MCP production route guard, found ${matches}.`);
  return source.replace(guard, 'if (process.env.SKETCHFORGE_ENABLE_MCP !== "true") {');
});

await transform("src/components/SketchForgeEditor.tsx", (source) => {
  const anchor = "const identity = readMcpEditorIdentity();";
  const guard = 'if (process.env.NODE_ENV === "production" || typeof window === "undefined") {';
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) throw new Error("Could not find the MCP editor identity anchor.");
  const guardIndex = source.lastIndexOf(guard, anchorIndex);
  if (guardIndex < 0 || anchorIndex - guardIndex > 500) {
    throw new Error("Could not find the MCP client production guard near its identity setup.");
  }
  return `${source.slice(0, guardIndex)}if (typeof window === "undefined") {${source.slice(guardIndex + guard.length)}`;
});

console.log(`[mac-build] prepared isolated MCP-enabled web source at ${targetDirectory}`);
