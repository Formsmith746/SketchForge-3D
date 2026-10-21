import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createProject } from "@/app/api/v1/projects/route";
import { POST as createShapes } from "@/app/api/v1/shapes/route";
import { POST as exportProject } from "@/app/api/v1/exports/route";
import { PATCH as changeShape } from "@/app/api/v1/shapes/route";
import { GET as listShapes } from "@/app/api/v1/shapes/route";
import { API_TOKEN_ENV } from "@/lib/apiTokens";
import { SERVER_PROJECTS_ENV } from "@/lib/serverProjectStore";

const TOKEN = "test-token-value";
let projectsRoot = "";
let previousRoot: string | undefined;
let previousToken: string | undefined;

function authorized(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}

async function makeProject() {
  const response = await createProject(authorized("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Export fixture" }),
  }));
  const payload = await response.json() as { project: { id: string } };
  const created = await createShapes(authorized(`/api/v1/shapes?projectId=${payload.project.id}`, {
    method: "POST",
    body: JSON.stringify({ shapes: [{ kind: "box", name: "Plate", width: 20, depth: 10, height: 4 }] }),
  }));
  expect(created.status).toBe(201);
  return payload.project.id;
}

describe("REST API v1 project exports", () => {
  beforeEach(async () => {
    previousRoot = process.env[SERVER_PROJECTS_ENV];
    previousToken = process.env[API_TOKEN_ENV];
    projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sketchforge-api-exports-"));
    process.env[SERVER_PROJECTS_ENV] = projectsRoot;
    process.env[API_TOKEN_ENV] = TOKEN;
  });

  afterEach(async () => {
    if (previousRoot === undefined) delete process.env[SERVER_PROJECTS_ENV];
    else process.env[SERVER_PROJECTS_ENV] = previousRoot;
    if (previousToken === undefined) delete process.env[API_TOKEN_ENV];
    else process.env[API_TOKEN_ENV] = previousToken;
    await fs.rm(projectsRoot, { recursive: true, force: true });
  });

  it("exports a project mesh in binary STL form", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "stl" }),
    }));

    expect(response.status).toBe(200);
    const artifact = await response.json() as {
      format: string; filename: string; mimeType: string; bytes: number; shapeCount: number; base64: string;
    };
    expect(artifact).toMatchObject({
      format: "stl",
      filename: "Export fixture.stl",
      mimeType: "model/stl",
      shapeCount: 1,
    });
    const bytes = Buffer.from(artifact.base64, "base64");
    expect(bytes.byteLength).toBe(artifact.bytes);
    expect(bytes.byteLength).toBeGreaterThan(84);
    expect(bytes.readUInt32LE(80)).toBeGreaterThan(0);
  });

  it("returns raw artifact bytes and metadata headers for file downloads", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}&download=1`, {
      method: "POST",
      body: JSON.stringify({ format: "stl" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("model/stl");
    expect(response.headers.get("content-disposition")).toContain("Export%20fixture.stl");
    const metadata = JSON.parse(decodeURIComponent(response.headers.get("x-sketchforge-metadata") ?? "{}"));
    expect(metadata).toMatchObject({ format: "stl", filename: "Export fixture.stl", shapeCount: 1 });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(84);
    expect(new DataView(bytes.buffer).getUint32(80, true)).toBeGreaterThan(0);
  });

  it.each(["obj", "3mf", "skf", "zip"] as const)("exports the %s artifact", async (format) => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format }),
    }));

    expect(response.status).toBe(200);
    const artifact = await response.json() as { bytes: number; base64: string; filename: string; shapeCount: number };
    const bytes = Buffer.from(artifact.base64, "base64");
    expect(bytes.byteLength).toBe(artifact.bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(artifact.filename).toMatch(new RegExp(`\\.${format}$`));
    expect(artifact.shapeCount).toBeGreaterThan(0);
    if (format === "3mf" || format === "zip") {
      const entries = Object.keys(unzipSync(bytes));
      if (format === "3mf") expect(entries).toContain("3D/3dmodel.model");
      else expect(entries.some((entry) => entry.endsWith(".stl"))).toBe(true);
    }
  });

  it("exports exact box geometry to STEP", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "step" }),
    }));

    expect(response.status).toBe(200);
    const artifact = await response.json() as { exportedCount: number; bytes: number; base64: string };
    expect(artifact.exportedCount).toBe(1);
    expect(Buffer.from(artifact.base64, "base64").byteLength).toBe(artifact.bytes);
  }, 90_000);

  it("draws the project as a multiview SVG from the exact geometry", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg" }),
    }));

    expect(response.status).toBe(200);
    const artifact = await response.json() as { format: string; filename: string; mimeType: string; bytes: number; shapeCount: number; base64: string };
    expect(artifact).toMatchObject({ format: "svg", filename: "Export fixture.svg", mimeType: "image/svg+xml", shapeCount: 1 });
    const svg = Buffer.from(artifact.base64, "base64").toString("utf8");
    expect(Buffer.byteLength(svg)).toBe(artifact.bytes);
    expect(svg.startsWith("<svg")).toBe(true);
    for (const label of ["Front", "Top", "Right", "Iso"]) expect(svg).toContain(`>${label}</text>`);
    expect(svg).toContain("20 × 10 × 4 (X×Y×Z)");
  }, 90_000);

  it("draws one named view when asked, as a file download too", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}&download=1`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", view: "top" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-disposition")).toContain("Export%20fixture.svg");
    const svg = await response.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain(">Front</text>");
    expect(svg).not.toContain("(X×Y×Z)");
  }, 90_000);

  it("exports exact contours cut by a named axis plane", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", section: { plane: "xy", offset: 2 } }),
    }));

    expect(response.status).toBe(200);
    const artifact = await response.json() as { base64: string; bytes: number; shapeCount: number };
    const svg = Buffer.from(artifact.base64, "base64").toString("utf8");
    expect(Buffer.byteLength(svg)).toBe(artifact.bytes);
    expect(artifact.shapeCount).toBe(1);
    expect(svg).toContain('data-plane="xy"');
    expect(svg).toContain('data-offset="2"');
    expect(svg).toContain("<path");
  }, 90_000);

  it("validates section parameters and keeps them separate from projection views", async () => {
    const projectId = await makeProject();
    const invalidPlane = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", section: { plane: "oblique", offset: 0 } }),
    }));
    expect(invalidPlane.status).toBe(400);

    const both = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", section: { plane: "xy", offset: 2 }, view: "top" }),
    }));
    expect(both.status).toBe(400);

    const outOfRange = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", section: { plane: "xy", offset: 100_001 } }),
    }));
    expect(outOfRange.status).toBe(400);
  });

  it("exports stored face colors as 3MF per-triangle materials", async () => {
    const projectId = await makeProject();
    const listed = await listShapes(authorized(`/api/v1/shapes?projectId=${projectId}`));
    const [{ id: shapeId }] = (await listed.json() as { shapes: Array<{ id: string }> }).shapes;
    const changed = await changeShape(authorized(`/api/v1/shapes?projectId=${projectId}&shapeId=${shapeId}`, {
      method: "PATCH", body: JSON.stringify({ faceColors: { 0: "#ff0000" } }),
    }));
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ shape: { faceColors: { 0: "#ff0000" } } });
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST", body: JSON.stringify({ format: "3mf" }),
    }));
    expect(response.status).toBe(200);
    const artifact = await response.json() as { base64: string };
    const model = new TextDecoder().decode(unzipSync(Buffer.from(artifact.base64, "base64"))["3D/3dmodel.model"]);
    expect(model).toContain('displaycolor="#ff0000FF"');
    expect(model).toMatch(/pid="\d+" p1="0" p2="0" p3="0"/);
  }, 90_000);

  it("refuses a view it does not know, and a view on a format that has none", async () => {
    const projectId = await makeProject();
    const unknown = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "svg", view: "sideways" }),
    }));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: "invalid_request", error: expect.stringContaining("multiview") });

    const misplaced = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "stl", view: "top" }),
    }));
    expect(misplaced.status).toBe(400);
    expect(await misplaced.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects an unsupported format before building geometry", async () => {
    const projectId = await makeProject();
    const response = await exportProject(authorized(`/api/v1/exports?projectId=${projectId}`, {
      method: "POST",
      body: JSON.stringify({ format: "gcode" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "unsupported_format" });
  });
});
