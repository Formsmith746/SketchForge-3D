import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createEmptySkfProject, validateSkfProject } from "../../worker/src/skfValidation";

function rewriteProject(bytes: Uint8Array, update: (document: Record<string, unknown>) => void) {
  const files = unzipSync(bytes);
  const document = JSON.parse(strFromU8(files["project.json"])) as Record<string, unknown>;
  update(document);
  files["project.json"] = strToU8(JSON.stringify(document));
  return zipSync(files, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
}

describe("server-side .skf validation", () => {
  it("accepts the native empty project generated for a new Cloud row", async () => {
    const project = createEmptySkfProject("project-1", "New project", 1_700_000_000);
    await expect(validateSkfProject(project)).resolves.toEqual({ valid: true });
  });

  it("rejects history references to a missing state", async () => {
    const project = rewriteProject(createEmptySkfProject("project-1", "New project", 1_700_000_000), (document) => {
      const history = document.history as { entries: Array<{ stateId: string }> };
      history.entries[0].stateId = "missing-state";
    });
    await expect(validateSkfProject(project)).resolves.toEqual({ valid: false, reason: "INVALID_HISTORY_ENTRY" });
  });

  it("rejects undeclared and unsafe archive entries", async () => {
    const files = unzipSync(createEmptySkfProject("project-1", "New project", 1_700_000_000));
    files["assets/source/undeclared.stl"] = new Uint8Array([1, 2, 3]);
    const undeclared = zipSync(files, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
    await expect(validateSkfProject(undeclared)).resolves.toEqual({ valid: false, reason: "UNDECLARED_ARCHIVE_ENTRY" });

    files["../escape.txt"] = new Uint8Array([1]);
    const unsafe = zipSync(files, { level: 6, mtime: new Date("1980-01-01T00:00:00.000Z") });
    await expect(validateSkfProject(unsafe)).resolves.toEqual({ valid: false, reason: "UNSAFE_OR_DUPLICATE_PATH" });
  });
});

