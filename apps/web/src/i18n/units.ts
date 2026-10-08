import type { MessageKey } from "./locales";
import type { Translator } from "./translator";

const UNIT_LABEL_KEYS: Record<string, MessageKey> = {
  mm: "common.unit.mm",
  cm: "common.unit.cm",
  m: "common.unit.m",
  in: "common.unit.in",
  ft: "common.unit.ft",
  stud: "common.unit.stud",
};

/** Display text for a unit symbol from lib/measurementUnits (`LengthDisplayUnit.label`); unknown symbols pass through. */
export function unitLabel(t: Translator, symbol: string): string {
  const key = UNIT_LABEL_KEYS[symbol];
  return key ? t(key) : symbol;
}
