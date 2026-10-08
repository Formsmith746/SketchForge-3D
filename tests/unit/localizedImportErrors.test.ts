import { describe, expect, it } from "vitest";
import { LocalizedError } from "@/i18n/LocalizedError";
import { translatorFor, errorText } from "@/i18n/translator";
import { importedShapeFromObj } from "@/lib/objImport";
import { importSkfProject } from "@/lib/skfProject";
import { importedShapeFromStl } from "@/lib/stlImport";
import { validateClosedSolidTriangleSoup } from "@/lib/svgImport";

const ru = translatorFor("ru");

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

// Import errors reach the user: they must stay translatable instead of plain English Error messages.
describe("import errors shown to the user", () => {
  it.each([
    ["OBJ", () => importedShapeFromObj("empty.obj", "")],
    ["STL", () => importedShapeFromStl("empty.stl", new TextEncoder().encode(`solid empty${" ".repeat(100)}\nendsolid empty\n`).buffer)],
    ["open SVG mesh", () => validateClosedSolidTriangleSoup([0, 0, 0, 1, 0, 0, 0, 1, 0])],
  ])("%s errors are LocalizedError with an English message and a translation", (_label, run) => {
    const error = caught(run);
    expect(error).toBeInstanceOf(LocalizedError);
    const localized = error as LocalizedError;
    expect(localized.message).toBe(translatorFor("en")(localized.key, localized.params));
    expect(errorText(ru, localized, "common.language.label")).not.toBe(localized.message);
  });

  it("rejects an empty .skf package with a translatable error", async () => {
    const error = await importSkfProject(new Uint8Array()).then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(LocalizedError);
    expect((error as LocalizedError).message).toBe(".skf file is empty");
  });
});
