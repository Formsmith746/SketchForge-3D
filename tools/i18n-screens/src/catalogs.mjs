import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
// The repository's ICU parser (a devDependency of the app), the same syntax use-intl formats.
import { TYPE, parse } from "@formatjs/icu-messageformat-parser";

/** A nested catalog as "editor.notice.ready" → message. */
function flatten(tree, prefix = "") {
  return Object.assign({}, ...Object.entries(tree).map(([key, value]) =>
    typeof value === "string" ? { [`${prefix}${key}`]: value } : flatten(value, `${prefix}${key}.`)));
}

/** Reads apps/web/src/i18n/locales/<code>/*.json into flat key → message maps. */
export function loadCatalogs(localesDir) {
  const catalogs = new Map();
  for (const code of readdirSync(localesDir)) {
    const dir = path.join(localesDir, code);
    if (!statSync(dir).isDirectory()) continue;
    const messages = {};
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      Object.assign(messages, flatten(JSON.parse(readFileSync(path.join(dir, file), "utf8"))));
    }
    catalogs.set(code, messages);
  }
  return catalogs;
}

/**
 * Every text a message can render, with arguments as {name}: one per plural or select form, tags dropped,
 * ICU quoting resolved ("''" is one apostrophe).
 */
function expand(elements) {
  let results = [""];
  for (const element of elements) {
    let parts;
    if (element.type === TYPE.literal) parts = [element.value];
    else if (element.type === TYPE.pound) parts = ["{count}"];
    else if (element.type === TYPE.tag) parts = expand(element.children);
    else if (element.type === TYPE.plural || element.type === TYPE.select) parts = Object.values(element.options).flatMap((option) => expand(option.value));
    else parts = [`{${element.value}}`];
    results = results.flatMap((result) => parts.map((part) => result + part));
  }
  return results;
}

function templates(value) {
  return typeof value === "string" ? expand(parse(value)) : [];
}

/** Message text for a plain key, English when the language lacks it. Used to find buttons by their label. */
export function messageText(catalogs, lang, key) {
  const forms = templates(catalogs.get(lang)?.[key] ?? catalogs.get("en")?.[key]);
  if (forms.length !== 1 || /\{\w+\}/.test(forms[0])) throw new Error(`No plain message for ${key}`);
  return forms[0];
}

function templatePattern(template) {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{count\\\}/g, "(\\d[\\d.,\\s]*)")
    .replace(/\\\{\w+\\\}/g, "(.+?)");
  return new RegExp(`^${escaped}$`, "s");
}

/**
 * Catalog keys whose text renders as `text` in `lang`: exact matches first, then templates with
 * {params}. Returns at most `limit` keys with the file each lives in.
 */
export function createKeyFinder(catalogs, localesDir, repoRoot) {
  const indexes = new Map();
  const indexFor = (lang) => {
    if (!indexes.has(lang)) {
      const exact = new Map();
      const patterns = [];
      for (const [key, value] of Object.entries(catalogs.get(lang) ?? {})) {
        for (const template of templates(value)) {
          if (/\{\w+\}/.test(template)) patterns.push({ key, pattern: templatePattern(template) });
          else exact.set(template.trim(), [...(exact.get(template.trim()) ?? []), key]);
        }
      }
      indexes.set(lang, { exact, patterns });
    }
    return indexes.get(lang);
  };
  const fileFor = (lang, key) => path.relative(repoRoot, path.join(localesDir, lang, key.startsWith("desktop.") ? "desktop.json" : "messages.json"));

  return (lang, text, limit = 3) => {
    const { exact, patterns } = indexFor(lang);
    const keys = [...(exact.get(text.trim()) ?? [])];
    // Templates only when nothing renders the text exactly: "{count} фигур" would match any text ending in "фигур".
    if (keys.length === 0) {
      for (const { key, pattern } of patterns) {
        if (keys.length >= limit) break;
        if (!keys.includes(key) && pattern.test(text.trim())) keys.push(key);
      }
    }
    return keys.slice(0, limit).map((key) => ({ key, file: fileFor(lang, key), en: templates(catalogs.get("en")?.[key])[0] ?? null }));
  };
}
