import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkplaneShape } from "@/types/sketchforge";

type ImportedShapeFromStl = (fileName: string, buffer: ArrayBuffer) => WorkplaneShape;
type BenchRow = {
  workload: string;
  step: string;
  triangles?: number;
  bytes?: number;
  runs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  heapDeltaMb: number;
};

const SYNTHETIC_WORKLOADS = [
  { label: "synthetic-small", triangles: 1200 },
  { label: "synthetic-medium", triangles: 12000 },
  { label: "synthetic-large", triangles: 60000 },
];

if (process.env.SKETCHFORGE_PERF_LARGE === "1") {
  SYNTHETIC_WORKLOADS.push({ label: "synthetic-xl", triangles: 150000 });
}

function formatMs(value: number) {
  return Number(value.toFixed(2));
}

function formatMb(value: number) {
  return Number(value.toFixed(2));
}

function heapUsedMb() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function measure<T>(
  rows: BenchRow[],
  workload: string,
  step: string,
  runs: number,
  metadata: Pick<BenchRow, "triangles" | "bytes">,
  fn: () => T | Promise<T>,
) {
  const durations: number[] = [];
  const heapBefore = heapUsedMb();
  let value: T | undefined;

  for (let run = 0; run < runs; run += 1) {
    const start = performance.now();
    value = await fn();
    durations.push(performance.now() - start);
  }

  const heapAfter = heapUsedMb();
  const avgMs = durations.reduce((total, duration) => total + duration, 0) / durations.length;
  rows.push({
    workload,
    step,
    ...metadata,
    runs,
    avgMs,
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
    heapDeltaMb: heapAfter - heapBefore,
  });

  return value as T;
}

function writeTriangle(view: DataView, offset: number, normal: number[], a: number[], b: number[], c: number[]) {
  const values = [...normal, ...a, ...b, ...c];
  let cursor = offset;
  values.forEach((value) => {
    view.setFloat32(cursor, value, true);
    cursor += 4;
  });
  view.setUint16(cursor, 0, true);
  return cursor + 2;
}

function createSyntheticBinaryStl(requestedTriangles: number) {
  const cubeCount = Math.ceil(requestedTriangles / 12);
  const triangleCount = cubeCount * 12;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);

  const faces = [
    { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  ];

  const columns = Math.ceil(Math.sqrt(cubeCount));
  let offset = 84;
  for (let cube = 0; cube < cubeCount; cube += 1) {
    const x = (cube % columns) * 1.4;
    const y = Math.floor(cube / (columns * columns)) * 1.4;
    const z = Math.floor(cube / columns) % columns * 1.4;
    const translate = ([px, py, pz]: number[]) => [px + x, py + y, pz + z];

    faces.forEach(({ normal, corners }) => {
      const [a, b, c, d] = corners.map(translate);
      offset = writeTriangle(view, offset, normal, a, b, c);
      offset = writeTriangle(view, offset, normal, a, c, d);
    });
  }

  return { buffer, triangleCount };
}

function toArrayBuffer(bytes: Buffer) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function findRealStlFiles() {
  const configured = process.env.SKETCHFORGE_PERF_STL_DIR?.trim();
  if (!configured) {
    return [];
  }

  const directory = path.resolve(configured);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`SKETCHFORGE_PERF_STL_DIR is not a directory: ${directory}`);
  }

  return readdirSync(directory)
    .filter((entry) => entry.toLowerCase().endsWith(".stl"))
    .map((entry) => path.join(directory, entry))
    .filter((entry) => statSync(entry).isFile())
    .slice(0, 12);
}

function printReport(rows: BenchRow[]) {
  const table = rows.map((row) => ({
    workload: row.workload,
    step: row.step,
    triangles: row.triangles ?? "",
    mb: row.bytes ? formatMb(row.bytes / 1024 / 1024) : "",
    runs: row.runs,
    avgMs: formatMs(row.avgMs),
    minMs: formatMs(row.minMs),
    maxMs: formatMs(row.maxMs),
    heapDeltaMb: formatMb(row.heapDeltaMb),
    msPer10kTriangles: row.triangles ? formatMs((row.avgMs / row.triangles) * 10000) : "",
  }));

  const bottlenecks = [...table].sort((a, b) => Number(b.avgMs) - Number(a.avgMs)).slice(0, 8);
  const totalsByStep = new Map<string, number>();
  rows.forEach((row) => totalsByStep.set(row.step, (totalsByStep.get(row.step) ?? 0) + row.avgMs));
  const stepTotals = [...totalsByStep.entries()]
    .map(([step, totalMs]) => ({ step, totalMs: formatMs(totalMs) }))
    .sort((a, b) => Number(b.totalMs) - Number(a.totalMs));

  console.log("\nSketchForge STL performance report");
  console.log("Tip: set SKETCHFORGE_PERF_STL_DIR=C:\\path\\to\\stls to include real STL files.");
  console.table(table);
  console.log("\nRanked bottlenecks by average duration");
  console.table(bottlenecks);
  console.log("\nTotal time by pipeline step");
  console.table(stepTotals);
}

describe("STL performance benchmark", () => {
  it("measures import and local-first persistence costs", async () => {
    const rows: BenchRow[] = [];
    const stlModule = await measure(rows, "startup", "load STL import module", 1, {}, () => import("@/lib/stlImport"));
    const importedShapeFromStl = stlModule.importedShapeFromStl as ImportedShapeFromStl;

    for (const workload of SYNTHETIC_WORKLOADS) {
      const stl = await measure(rows, workload.label, "generate synthetic binary STL", 1, { triangles: workload.triangles }, () =>
        createSyntheticBinaryStl(workload.triangles),
      );
      const runs = stl.triangleCount >= 60000 ? 2 : 3;
      const shape = await measure(rows, workload.label, "import STL into WorkplaneShape", runs, { triangles: stl.triangleCount, bytes: stl.buffer.byteLength }, () =>
        importedShapeFromStl(`${workload.label}.stl`, stl.buffer),
      );
      expect(shape.importedMesh?.triangleCount).toBe(stl.triangleCount);

      const json = await measure(rows, workload.label, "serialize shape JSON", runs, { triangles: stl.triangleCount }, () => JSON.stringify(shape));
      await measure(rows, workload.label, "parse shape JSON", runs, { triangles: stl.triangleCount, bytes: json.length }, () => JSON.parse(json));
    }

    for (const filePath of findRealStlFiles()) {
      const label = `real-${path.basename(filePath)}`;
      const bytes = await measure(rows, label, "read STL file", 1, { bytes: statSync(filePath).size }, () => readFileSync(filePath));
      const shape = await measure(rows, label, "import STL into WorkplaneShape", 2, { bytes: bytes.byteLength }, () =>
        importedShapeFromStl(path.basename(filePath), toArrayBuffer(bytes)),
      );
      const triangles = shape.importedMesh?.triangleCount ?? 0;
      expect(triangles).toBeGreaterThan(0);
      const json = await measure(rows, label, "serialize shape JSON", 2, { triangles }, () => JSON.stringify(shape));
      await measure(rows, label, "parse shape JSON", 2, { triangles, bytes: json.length }, () => JSON.parse(json));
    }

    printReport(rows);
  });
});
