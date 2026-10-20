import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET } from "@/app/api/shared-projects/route";

const SHARED_PROJECTS_ENV = "SKETCHFORGE_SHARED_PROJECTS_DIR";

let sharedProjectsRoot = "";
let previousSharedProjectsRoot: string | undefined;

async function createSharedProject(fileName: string, content = "shared project") {
  await fs.writeFile(path.join(sharedProjectsRoot, fileName), content);
  const response = await GET(new Request("http://localhost/api/shared-projects"));
  const payload = await response.json() as { projects: Array<{ fileName: string; revision: string }> };
  const project = payload.projects.find((candidate) => candidate.fileName === fileName);
  if (!project) throw new Error(`Could not find ${fileName} in shared project listing`);
  return project;
}

function deleteRequest(fileName: string, revision?: string, origin = "http://localhost") {
  const headers = new Headers({ Origin: origin });
  if (revision) headers.set("If-Match", `"${revision}"`);
  return new Request(`http://localhost/api/shared-projects?fileName=${encodeURIComponent(fileName)}`, {
    method: "DELETE",
    headers,
  });
}

describe("shared project deletion", () => {
  beforeEach(async () => {
    previousSharedProjectsRoot = process.env[SHARED_PROJECTS_ENV];
    sharedProjectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sketchforge-shared-delete-"));
    process.env[SHARED_PROJECTS_ENV] = sharedProjectsRoot;
  });

  afterEach(async () => {
    if (previousSharedProjectsRoot === undefined) delete process.env[SHARED_PROJECTS_ENV];
    else process.env[SHARED_PROJECTS_ENV] = previousSharedProjectsRoot;
    await fs.rm(sharedProjectsRoot, { recursive: true, force: true });
  });

  it("deletes a shared project when the listed revision still matches", async () => {
    const project = await createSharedProject("Delete me.skf");

    const response = await DELETE(deleteRequest(project.fileName, project.revision));

    expect(response.status).toBe(200);
    await expect(fs.access(path.join(sharedProjectsRoot, project.fileName))).rejects.toThrow();
    expect(await response.json()).toEqual({ deleted: true, fileName: project.fileName });
  });

  it("refuses to delete from a stale dashboard revision", async () => {
    const project = await createSharedProject("Changed model.skf");

    const response = await DELETE(deleteRequest(project.fileName, "stale-revision"));

    expect(response.status).toBe(409);
    await expect(fs.access(path.join(sharedProjectsRoot, project.fileName))).resolves.toBeUndefined();
  });

  it("requires a revision precondition before deleting", async () => {
    const project = await createSharedProject("Needs revision.skf");

    const response = await DELETE(deleteRequest(project.fileName));

    expect(response.status).toBe(428);
    await expect(fs.access(path.join(sharedProjectsRoot, project.fileName))).resolves.toBeUndefined();
  });

  it("rejects cross-origin delete requests", async () => {
    const project = await createSharedProject("Protected model.skf");

    const response = await DELETE(deleteRequest(project.fileName, project.revision, "https://example.invalid"));

    expect(response.status).toBe(403);
    await expect(fs.access(path.join(sharedProjectsRoot, project.fileName))).resolves.toBeUndefined();
  });
});
