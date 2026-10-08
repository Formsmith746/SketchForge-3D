import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY } from "./config.mjs";

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), "report-template.html");

/** Writes index.html next to the screenshots. The page is self-contained and works offline. */
export function writeReport(report, outDir) {
  const data = JSON.stringify({ ...report, categories: CATEGORY }).replace(/</g, "\\u003c");
  const file = path.join(outDir, "index.html");
  writeFileSync(file, readFileSync(TEMPLATE, "utf8").replace("__REPORT_DATA__", () => data));
  return file;
}
