import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import ru from "@/i18n/messages/ru.json";

/**
 * Собирает плоский список ключей вида «namespace.key».
 *
 * @param node Узел каталога переводов.
 * @param prefix Накопленный путь.
 * @returns Список ключей.
 */
function collectKeys(node: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

/**
 * Достаёт значение по пути ключа.
 *
 * @param node Каталог переводов.
 * @param key Путь ключа.
 * @returns Значение или undefined.
 */
function getByKey(node: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[part]
          : undefined,
      node,
    );
}

const enKeys = collectKeys(en as Record<string, unknown>);
const ruKeys = collectKeys(ru as Record<string, unknown>);

describe("catalogs of translations", () => {
  it("cover the same set of keys", () => {
    const missingInRu = enKeys.filter((key) => !ruKeys.includes(key));
    const extraInRu = ruKeys.filter((key) => !enKeys.includes(key));

    expect(missingInRu).toEqual([]);
    expect(extraInRu).toEqual([]);
  });

  it("keep every Russian value filled", () => {
    const empty = ruKeys.filter((key) => {
      const value = getByKey(ru as Record<string, unknown>, key);
      return typeof value !== "string" || value.trim() === "";
    });

    expect(empty).toEqual([]);
  });

  it("do not repeat English text where a translation is expected", () => {
    // Названия продукта и обозначения форматов совпадают намеренно,
    // поэтому список исключений задан явно.
    const intentional = new Set([
      "appShell.exportFormatOption",
      "desktop.trayTooltip",
      "desktop.windowTitle",
      "editor.exportStepDesc",
      "importExport.step",
    ]);

    const untranslated = ruKeys.filter((key) => {
      if (intentional.has(key)) {
        return false;
      }
      const ruValue = getByKey(ru as Record<string, unknown>, key);
      const enValue = getByKey(en as Record<string, unknown>, key);
      return (
        typeof ruValue === "string" &&
        typeof enValue === "string" &&
        ruValue === enValue &&
        /[A-Za-z]/.test(ruValue) &&
        ruValue.length > 3
      );
    });

    expect(untranslated).toEqual([]);
  });
});
