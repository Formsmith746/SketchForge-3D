import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const exportRoot = join(repositoryRoot, "apps", "web", ".next-export");
const chunksRoot = join(exportRoot, "_next", "static", "chunks");

function isPathInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`));
}

async function readContainedTextFile(root, filePath) {
  const fileStat = await lstat(filePath);
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error(`Static worker asset is not a regular file: ${filePath}`);
  const canonicalPath = await realpath(filePath);
  if (!isPathInside(root, canonicalPath)) throw new Error(`Static worker asset escapes the export directory: ${filePath}`);
  return readFile(canonicalPath, "utf8");
}

async function listJavaScriptFiles(directory, root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      if (entry.name !== basename(entry.name)) throw new Error(`Invalid static asset name: ${entry.name}`);
      const assetPath = resolve(directory, entry.name);
      if (!isPathInside(root, assetPath)) throw new Error(`Static asset escapes the chunks directory: ${assetPath}`);
      if (entry.isSymbolicLink()) throw new Error(`Static worker assets must not be symbolic links: ${assetPath}`);
      if (entry.isDirectory()) return listJavaScriptFiles(assetPath, root);
      return entry.isFile() && assetPath.endsWith(".js") ? [assetPath] : [];
    }),
  );

  return files.flat();
}

const canonicalExportRoot = await realpath(exportRoot);
const canonicalChunksRoot = await realpath(chunksRoot);
if (!isPathInside(canonicalExportRoot, canonicalChunksRoot)) {
  throw new Error(`Static chunks directory escapes the export directory: ${chunksRoot}`);
}

const indexHtml = await readContainedTextFile(canonicalExportRoot, resolve(canonicalExportRoot, "index.html"));
if (indexHtml.includes('="./_next/')) {
  throw new Error(
    "Static HTML uses a relative ./_next asset prefix. Worker chunks resolve that prefix " +
      "relative to their own directory and request a duplicated /_next/static/chunks path.",
  );
}

const workerChunks = [];
for (const workerPath of await listJavaScriptFiles(canonicalChunksRoot, canonicalChunksRoot)) {
  const source = await readContainedTextFile(canonicalChunksRoot, workerPath);
  if (source.includes("importScripts(") && source.includes("static/chunks/")) {
    workerChunks.push({ path: workerPath, source });
  }
}

if (workerChunks.length === 0) {
  throw new Error("Could not find the generated CAD worker runtime to verify its public path.");
}

for (const { path, source } of workerChunks) {
  if (!source.includes('.p="/_next/"') && !source.includes(".p='/_next/'")) {
    throw new Error(`Worker runtime ${path} does not use the root-relative /_next/ public path.`);
  }
}

console.log(`Verified ${workerChunks.length} static worker runtime(s) use /_next/.`);
