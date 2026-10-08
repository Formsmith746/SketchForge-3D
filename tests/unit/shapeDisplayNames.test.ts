import { describe, expect, it } from "vitest";
import { translatorFor } from "@/i18n/translator";
import { toolbarShapeAssets } from "@/lib/shapeCatalog";
import { shapeDisplayName } from "@/lib/shapeDisplayNames";

const en = translatorFor("en");
const ru = translatorFor("ru");
const DEFAULT_NAMES = [
  ...toolbarShapeAssets.map((asset) => asset.name),
  "Cube",
  "Group",
  "Intersection",
  "Sketch extrusion",
  "Sketch revolve",
  "Sketch image",
];

describe("shape display names", () => {
  it("shows default names unchanged in English", () => {
    for (const name of DEFAULT_NAMES) expect(shapeDisplayName(en, name)).toBe(name);
    expect(shapeDisplayName(en, "Box Part 2")).toBe("Box Part 2");
  });

  it("translates default names in another language", () => {
    expect(shapeDisplayName(ru, "Box")).toBe(ru("common.shape.box"));
    expect(shapeDisplayName(ru, "Round Roof")).toBe(ru("common.shape.roundRoof"));
    for (const name of DEFAULT_NAMES) expect(shapeDisplayName(ru, name)).not.toBe(name);
    expect(shapeDisplayName(ru, "Group Part 3")).toBe(`${ru("common.shapeName.group")}, часть 3`);
  });

  it("leaves names the user gave as they are", () => {
    for (const name of ["Мой брелок", "box", "Box 2", "Engine Part 2", "Group (copy)"]) {
      expect(shapeDisplayName(ru, name)).toBe(name);
    }
  });
});
