import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../apps/web/src/app/api/local-download/route";

const DOWNLOAD_ROOT_ENV = "SKETCHFORGE_LOCAL_DOWNLOAD_ROOT";

function downloadRequest(folder: string, filename = "model.svg", content = "<svg />") {
  return new Request("http://localhost/api/local-download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    },
    body: JSON.stringify({ content, filename, folder }),
  });
}

describe("local download route path validation", () => {
  let sandbox: string;
  let downloadRoot: string;
  let outsideRoot: string;
  let originalDownloadRoot: string | undefined;

  beforeEach(async () => {
    originalDownloadRoot = process.env[DOWNLOAD_ROOT_ENV];
    sandbox = await mkdtemp(path.join(tmpdir(), "sketchforge-local-download-"));
    downloadRoot = path.join(sandbox, "downloads");
    outsideRoot = path.join(sandbox, "outside");
    await Promise.all([mkdir(downloadRoot), mkdir(outsideRoot)]);
    process.env[DOWNLOAD_ROOT_ENV] = downloadRoot;
  });

  afterEach(async () => {
    if (originalDownloadRoot === undefined) delete process.env[DOWNLOAD_ROOT_ENV];
    else process.env[DOWNLOAD_ROOT_ENV] = originalDownloadRoot;
    await rm(sandbox, { recursive: true, force: true });
  });

  it("writes to an existing relative folder inside the configured root", async () => {
    const exportDirectory = path.join(downloadRoot, "exports");
    await mkdir(exportDirectory);

    const response = await POST(downloadRequest("exports"));
    const payload = (await response.json()) as { path?: string };

    expect(response.status).toBe(200);
    expect(payload.path).toBe(path.join(await realpath(exportDirectory), "model.svg"));
    await expect(readFile(payload.path!, "utf8")).resolves.toBe("<svg />");
  });

  it("rejects absolute and relative paths outside the configured root", async () => {
    const absoluteResponse = await POST(downloadRequest(outsideRoot, "absolute.svg"));
    const relativeResponse = await POST(downloadRequest(path.join("..", "outside"), "relative.svg"));

    expect(absoluteResponse.status).toBe(400);
    expect(relativeResponse.status).toBe(400);
    await expect(access(path.join(outsideRoot, "absolute.svg"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(outsideRoot, "relative.svg"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a directory symlink that resolves outside the configured root", async () => {
    const linkedDirectory = path.join(downloadRoot, "linked");
    try {
      await symlink(outsideRoot, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    const response = await POST(downloadRequest(linkedDirectory, "linked.svg"));

    expect(response.status).toBe(400);
    await expect(access(path.join(outsideRoot, "linked.svg"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("replaces an output symlink instead of writing through it", async () => {
    const outsideFile = path.join(outsideRoot, "sensitive.svg");
    const outputPath = path.join(downloadRoot, "model.svg");
    await writeFile(outsideFile, "original", "utf8");
    try {
      await symlink(outsideFile, outputPath, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    const response = await POST(downloadRequest(downloadRoot, "model.svg", "replacement"));

    expect(response.status).toBe(200);
    await expect(readFile(outsideFile, "utf8")).resolves.toBe("original");
    await expect(readFile(outputPath, "utf8")).resolves.toBe("replacement");
    expect((await lstat(outputPath)).isSymbolicLink()).toBe(false);
  });
});
