import { TYPE, parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocalizedError, errorFromPayload, localizedErrorPayload, type ErrorKey } from "@/i18n/LocalizedError";
import { LOCALES, SOURCE_MESSAGES, localeCatalog, type Locale, type MessageKey } from "@/i18n/locales";
import { normalizeLanguagePreference, readStoredLanguagePreference, resolveLocale, LANGUAGE_STORAGE_KEY } from "@/i18n/store";
import { errorText, translatorFor } from "@/i18n/translator";
import { createTranslator } from "use-intl/core";
import { messagesFor } from "@/i18n/translator";

type MessageTree = { [key: string]: string | MessageTree };

/** A nested catalog as "editor.notice.ready" → message. */
function flatten(tree: object, prefix = ""): Record<string, string> {
  return Object.assign({}, ...Object.entries(tree).map(([key, value]) =>
    typeof value === "string" ? { [`${prefix}${key}`]: value } : flatten(value, `${prefix}${key}.`)));
}

const source = flatten(SOURCE_MESSAGES);
const sourceKeys = Object.keys(source).sort();
const firstErrorKey = sourceKeys.find((key): key is ErrorKey => key.startsWith("errors."));

/** Argument and tag names a message uses, and the forms of each plural in it. */
function messageParts(message: string) {
  const names = new Set<string>();
  const plurals: string[][] = [];
  const walk = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) continue;
      names.add(element.type === TYPE.tag ? `<${element.value}>` : element.value);
      if (element.type === TYPE.tag) walk(element.children);
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        if (element.type === TYPE.plural) plurals.push(Object.keys(element.options));
        for (const option of Object.values(element.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return { names: [...names].sort(), plurals };
}

// Words that read the same in every language: unit symbols, format and product names.
const NEUTRAL_WORDS = new Set(["mm", "cm", "m", "in", "ft", "CAD", "B-Rep", "STL", "OBJ", "STEP", "SVG", "SKF", "PNG", "SketchForge"]);
// Words a language spells like English. Any other text identical to English counts as untranslated.
const SAME_AS_ENGLISH: Partial<Record<Locale, readonly MessageKey[]>> = {
  cs: ["common.shape.text", "editor.panel.import", "editor.panel.export", "panels.property.text"],
  de: [
    "common.shape.text", "common.shape.torus", "common.shape.ring", "common.shape.polygon", "dashboard.projects.sortName",
    "editor.panel.import", "editor.panel.export", "editor.panel.format", "panels.property.text", "panels.edgeModifier.radius",
  ],
  es: ["panels.inspector.color.title"],
  fr: [
    "common.shape.tube", "common.shapeName.cube", "common.shapeName.intersection", "editor.sketch.primitive.rectangle",
    "editor.sketch.primitive.triangle", "editor.panel.format", "panels.edgeModifier.distance", "panels.edgeModifier.angle",
    "panels.edgeModifier.quality.fine",
  ],
  pl: ["common.shape.torus", "editor.panel.import", "editor.panel.format"],
  pt: ["common.shape.cone"],
};

const isLanguageNeutral = (message: string) =>
  (message.replace(/\{\w+\}|<\/?\w+>/g, " ").match(/\p{L}[\p{L}-]*/gu) ?? []).every((word) => NEUTRAL_WORDS.has(word));

/** Keys a language lacks or still has in English; English itself is the source. */
function untranslatedKeys(catalog: Record<string, string>, code: Locale) {
  const sameAllowed = new Set<string>(SAME_AS_ENGLISH[code] ?? []);
  return sourceKeys.filter((key) => {
    const value = catalog[key];
    if (value === undefined) return true;
    if (code === "en" || sameAllowed.has(key)) return false;
    return value === source[key] && !isLanguageNeutral(source[key]);
  });
}

describe("message formatting", () => {
  it("selects plural forms by the language's rules and prints counts as they are", () => {
    const ru = translatorFor("ru");
    expect([1, 3, 5, 21, 1.5].map((count) => ru("dashboard.projects.shapeCount", { count }))).toEqual([
      "1 фигура",
      "3 фигуры",
      "5 фигур",
      "21 фигура",
      "1.5 фигуры",
    ]);
    expect(translatorFor("en")("dashboard.projects.shapeCount", { count: 1000 })).toBe("1000 shapes");
  });

  it("prints an apostrophe next to a placeholder", () => {
    expect(new LocalizedError("errors.skf.assetMissing", { path: "a.png" }).message).toBe("Missing asset 'a.png'");
  });
});

describe("fast path", () => {
  it("formats every message exactly as use-intl does", () => {
    const counts = [0, 1, 2, 3, 5, 11, 21, 22, 101, 1000, 1.5];
    const mismatches: string[] = [];
    for (const { code } of LOCALES) {
      const fast = translatorFor(code) as unknown as (key: string, values?: Record<string, string | number>) => string;
      const icu = createTranslator({ locale: code, messages: messagesFor(code) }) as unknown as typeof fast;
      for (const [key, message] of Object.entries(flatten(messagesFor(code)))) {
        const { names } = messageParts(message);
        if (names.some((name) => name.startsWith("<"))) continue; // tags are formatted by use-intl itself (t.rich)
        const base = Object.fromEntries(names.filter((name) => name !== "count").map((name) => [name, `‹${name}›`]));
        for (const count of names.includes("count") ? counts : [undefined]) {
          const values = count === undefined ? (names.length ? base : undefined) : { ...base, count };
          if (fast(key, values) !== icu(key, values)) mismatches.push(`${code} ${key} ${count ?? ""}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("keeps an argument the call lacks visible, as before use-intl", () => {
    const en = translatorFor("en") as unknown as (key: string, values?: Record<string, string | number>) => string;
    expect(en("dashboard.updates.updateTo")).toBe("Update to {version}");
    expect(en("dashboard.projects.shapeCount")).toBe("{count} shapes");
    expect(en("errors.skf.assetMissing")).toBe("Missing asset '{path}'");
  });
});

describe("language preference", () => {
  it("resolves the system language by its base subtag", () => {
    expect(resolveLocale("system", ["ru-RU", "en-US"])).toBe("ru");
    expect(resolveLocale("system", ["ja-JP", "ru"])).toBe("ru");
    expect(resolveLocale("system", ["ja-JP"])).toBe("en");
    // Brazilian Portuguese is the one Portuguese catalog, also for Portugal.
    expect(resolveLocale("system", ["pt-BR"])).toBe("pt");
    expect(resolveLocale("system", ["pt-PT"])).toBe("pt");
    expect(resolveLocale("system", ["de-AT", "en"])).toBe("de");
    expect(resolveLocale("system", [])).toBe("en");
    expect(resolveLocale("en", ["ru-RU"])).toBe("en");
  });

  it("normalizes unknown stored values to system", () => {
    expect(normalizeLanguagePreference("ru")).toBe("ru");
    expect(normalizeLanguagePreference("klingon")).toBe("system");
    expect(normalizeLanguagePreference(null)).toBe("system");
    expect(readStoredLanguagePreference({ getItem: (key) => (key === LANGUAGE_STORAGE_KEY ? "ru" : null) })).toBe("ru");
    expect(readStoredLanguagePreference({ getItem: () => { throw new Error("blocked"); } })).toBe("system");
  });
});

describe.each(LOCALES.map((locale) => [locale.code, flatten(localeCatalog(locale.code)), locale.complete] as const))("%s catalog", (code, catalog, complete) => {
  const pluralCategories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  const keys = Object.keys(catalog);

  it("has no keys that English lacks", () => {
    expect(keys.filter((key) => !(key in source))).toEqual([]);
  });

  // A language being translated (`complete: false` in locales.ts) may lack strings or still have them in English.
  // They are reported as a todo, which the test summary always counts, instead of a failure.
  const missing = untranslatedKeys(catalog, code);
  if (complete || missing.length === 0) {
    it("has every string translated", () => {
      expect(missing).toEqual([]);
    });
  } else {
    it.todo(`translate ${missing.length} of ${sourceKeys.length} strings, shown in English until then: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ", …" : ""}`);
  }

  it("is valid ICU with the placeholders and tags English has", () => {
    const mismatches = keys.filter((key) => key in source && messageParts(catalog[key]).names.join() !== messageParts(source[key]).names.join());
    expect(mismatches).toEqual([]);
  });

  it("has every plural form the language needs", () => {
    const incomplete = keys.filter((key) => messageParts(catalog[key]).plurals.some((forms) => pluralCategories.some((category) => !forms.includes(category))));
    expect(incomplete).toEqual([]);
  });

  it("has no empty messages", () => {
    expect(keys.filter((key) => catalog[key].trim() === "")).toEqual([]);
  });
});

describe("rich messages", () => {
  const html = (node: ReactNode) => renderToStaticMarkup(createElement("p", null, node));

  it("wrap tagged text in the element the code gives", () => {
    const name = translatorFor("en").rich("dashboard.projects.deleteConfirm", { name: "Desk", b: (chunks) => createElement("strong", null, chunks) });
    expect(html(name)).toBe("<p>Do you actually want the project <strong>Desk</strong> to be deleted?</p>");
    const keys = translatorFor("fr").rich("editor.toolbar.visibilityHelpShortcut", {
      keys: () => createElement("kbd", null, "H"),
      action: "tout afficher",
    });
    expect(html(keys)).toBe("<p><kbd>H</kbd> : tout afficher</p>");
  });
});

describe("missing translations", () => {
  it("are listed per key", () => {
    const partial = { [sourceKeys[0]]: "x" };
    expect(untranslatedKeys(partial, "ru")).toEqual(sourceKeys.slice(1));
  });

  it("include text left in English, but not words the language spells the same or language-neutral text", () => {
    const ru = { ...flatten(localeCatalog("ru")), "common.language.label": "Language" };
    expect(untranslatedKeys(ru, "ru")).toEqual(["common.language.label"]);
    expect(untranslatedKeys(flatten(localeCatalog("de")), "de")).toEqual([]);
    expect(isLanguageNeutral("{message}; {detail}")).toBe(true);
    expect(isLanguageNeutral("CAD / B-Rep")).toBe(true);
    expect(isLanguageNeutral("Import")).toBe(false);
  });

  it("show in English, with English plural forms", async () => {
    vi.resetModules();
    const locales = await import("@/i18n/locales");
    const translator = await import("@/i18n/translator");
    const ru = (await locales.loadLocaleCatalog("ru")) as MessageTree;
    delete ((ru.common as MessageTree).language as MessageTree).label;
    delete ((ru.dashboard as MessageTree).projects as MessageTree).shapeCount;
    const t = translator.translatorFor("ru");
    expect(t("common.language.label")).toBe("Language");
    expect(t("common.language.system")).toBe("Как в системе");
    // Russian "one" also covers 21; the English fallback still reads "21 shapes".
    expect([1, 21].map((count) => t("dashboard.projects.shapeCount", { count }))).toEqual(["1 shape", "21 shapes"]);
  });
});

describe("languages loaded on demand", () => {
  it("translate into English until the language has loaded, never into keys", async () => {
    vi.resetModules();
    const locales = await import("@/i18n/locales");
    const translator = await import("@/i18n/translator");
    expect(locales.isLocaleCatalogLoaded("ru")).toBe(false);
    expect(translator.translatorFor("ru")("common.language.label")).toBe("Language");
    expect(translator.translatorFor("ru")("dashboard.projects.shapeCount", { count: 3 })).toBe("3 shapes");
    await locales.loadLocaleCatalog("ru");
    expect(translator.translatorFor("ru")("common.language.label")).toBe("Язык");
    expect(translator.translatorFor("ru")("dashboard.projects.shapeCount", { count: 3 })).toBe("3 фигуры");
  });
});

describe("translator", () => {
  it("translates through the requested locale", () => {
    expect(translatorFor("en")("common.language.label")).toBe("Language");
    expect(translatorFor("ru")("common.language.label")).toBe("Язык");
    expect(translatorFor("ru")).toBe(translatorFor("ru"));
  });

  it("renders localized errors in the UI language and keeps foreign messages", () => {
    const errorKey = firstErrorKey;
    const ru = translatorFor("ru");
    if (errorKey) expect(errorText(ru, new LocalizedError(errorKey), "common.language.label")).toBe(ru(errorKey));
    expect(errorText(ru, new Error("socket hang up"), "common.language.label")).toBe("socket hang up");
    expect(errorText(ru, "boom", "common.language.label")).toBe("Язык");
  });
});

describe("LocalizedError", () => {
  it("keeps an English message and survives a worker round trip", () => {
    const errorKey = firstErrorKey;
    if (!errorKey) return;
    const error = new LocalizedError(errorKey);
    expect(error.message).toBe(translatorFor("en")(errorKey));
    const restored = errorFromPayload(structuredClone(localizedErrorPayload(error)));
    expect(restored).toBeInstanceOf(LocalizedError);
    expect((restored as LocalizedError).key).toBe(errorKey);
    expect(errorFromPayload(localizedErrorPayload(new Error("plain")))).not.toBeInstanceOf(LocalizedError);
  });
});

describe("use-intl", () => {
  it("is imported only by apps/web/src/i18n; the rest of the app imports @/i18n", () => {
    const sourceRoot = path.resolve(__dirname, "../../apps/web/src");
    const direct = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file) && !file.startsWith(`i18n${path.sep}`))
      .filter((file) => /from "use-intl/.test(readFileSync(path.join(sourceRoot, file), "utf8")));
    expect(direct).toEqual([]);
  });
});
