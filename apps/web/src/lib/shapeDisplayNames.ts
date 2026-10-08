import type { MessageKey, Translator } from "@/i18n";
import { toolbarShapeAssets } from "@/lib/shapeCatalog";

// Default names the editor gives new objects. They are saved into projects in English; the UI shows them in
// the current language until the user renames the object.
const DEFAULT_NAME_KEYS: ReadonlyMap<string, MessageKey> = new Map<string, MessageKey>([
  ...toolbarShapeAssets.map((asset) => [asset.name, `common.shape.${asset.kind}`] as const),
  ["Cube", "common.shapeName.cube"],
  ["Group", "common.shapeName.group"],
  ["Intersection", "common.shapeName.intersection"],
  ["Sketch extrusion", "common.shapeName.sketchExtrusion"],
  ["Sketch revolve", "common.shapeName.sketchRevolve"],
  ["Sketch image", "common.shapeName.sketchImage"],
]);

/** "Box Part 2" from Separate parts; only the suffix of a default name is translated, never of a user's own name. */
const PART_NAME_PATTERN = /^(.+) Part (\d+)$/;

/** Text to show for an object or sketch image name. */
export function shapeDisplayName(t: Translator, name: string): string {
  const key = DEFAULT_NAME_KEYS.get(name);
  if (key) return t(key);
  const part = PART_NAME_PATTERN.exec(name);
  const baseKey = part ? DEFAULT_NAME_KEYS.get(part[1]) : undefined;
  return part && baseKey ? t("common.shapeName.part", { name: t(baseKey), index: Number(part[2]) }) : name;
}
