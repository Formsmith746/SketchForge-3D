import { IntlErrorCode, type IntlError } from "use-intl/core";
import type { Locale, Messages } from "./locales";
import type { Translator } from "./translator";

// use-intl resolves the path, prepares values and parses ICU on every call: 10-16 times the cost of the plain string
// replace the app used before (300 calls, a toolbar render: 23 µs before, 291 µs through use-intl alone). The fast
// path formats the shapes the catalogs actually use the old way: plain text, text with {name}, and a whole-message
// plural whose forms are such text. Everything else (tags, quoting, #, select, nesting) goes to use-intl.
// tests/unit/i18n.test.ts checks both paths give the same text for every message.

/** Text split at its `{name}` arguments: literal, argument name, literal, … (odd indexes are names). */
type Parts = string[];

/** A plain message is its text; the rest are formatted per call. */
type Compiled =
  | string
  | { kind: "template"; parts: Parts }
  | { kind: "plural"; argument: string; exact: Map<number, Parts>; forms: Map<string, Parts> }
  | { kind: "icu" };

/** Text with no ICU syntax but `{name}` arguments. */
const SIMPLE_TEMPLATE = /^[^{}<>'#]*(?:\{\w+\}[^{}<>'#]*)*$/;
const PLACEHOLDER = /\{(\w+)\}/;
const PLURAL = /^\{(\w+), plural, ([\s\S]*)\}$/;
const PLURAL_OPTION = /\s*(=\d+|zero|one|two|few|many|other) \{/y;

function compile(message: string): Compiled {
  if (!/[{}<>']/.test(message)) return message;
  if (SIMPLE_TEMPLATE.test(message)) return { kind: "template", parts: message.split(PLACEHOLDER) };
  const plural = PLURAL.exec(message);
  if (!plural) return { kind: "icu" };
  const [, argument, body] = plural;
  const exact = new Map<number, Parts>();
  const forms = new Map<string, Parts>();
  let index = 0;
  while (index < body.length) {
    PLURAL_OPTION.lastIndex = index;
    const option = PLURAL_OPTION.exec(body);
    if (!option) return { kind: "icu" };
    const start = PLURAL_OPTION.lastIndex;
    let depth = 1;
    let end = start;
    for (; end < body.length && depth > 0; end += 1) {
      if (body[end] === "{") depth += 1;
      else if (body[end] === "}") depth -= 1;
    }
    const form = body.slice(start, end - 1);
    if (depth !== 0 || !SIMPLE_TEMPLATE.test(form)) return { kind: "icu" };
    if (option[1].startsWith("=")) exact.set(Number(option[1].slice(1)), form.split(PLACEHOLDER));
    else forms.set(option[1], form.split(PLACEHOLDER));
    index = end;
    while (body[index] === " ") index += 1;
  }
  return forms.has("other") ? { kind: "plural", argument, exact, forms } : { kind: "icu" };
}

type Values = Record<string, unknown>;

/** Joins the parts with the argument values; an argument the call lacks stays visible, so the mistake is easy to spot. */
function interpolate(parts: Parts, values: Values | undefined): string {
  let text = parts[0];
  for (let index = 1; index < parts.length; index += 2) {
    const name = parts[index];
    text += (values && name in values ? String(values[name]) : `{${name}}`) + parts[index + 1];
  }
  return text;
}

/** Message path → compiled message. Compiled once per catalog, so a plain message costs one lookup per call. */
type Catalog = Map<string, Compiled>;
const catalogs = new WeakMap<Messages, Catalog>();

function flatten<T>(tree: object, prefix: string, into: Map<string, T>, map: (message: string) => T) {
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") into.set(prefix + key, map(value));
    else flatten(value, `${prefix}${key}.`, into, map);
  }
  return into;
}

function catalogOf(messages: Messages): Catalog {
  let catalog = catalogs.get(messages);
  if (!catalog) {
    catalog = flatten(messages, "", new Map<string, Compiled>(), compile);
    catalogs.set(messages, catalog);
  }
  return catalog;
}

function pluralForm(compiled: Extract<Compiled, { kind: "plural" }>, rules: Intl.PluralRules, values: Values | undefined): Parts {
  const count = values?.[compiled.argument];
  if (typeof count !== "number") return compiled.forms.get("other") as Parts;
  return compiled.exact.get(count) ?? compiled.forms.get(rules.select(count)) ?? (compiled.forms.get("other") as Parts);
}

/** `intl`, the use-intl translator for `messages` in `locale`, with the common messages formatted directly. */
export function withFastPath(intl: Translator, locale: Locale, messages: Messages): Translator {
  const catalog = catalogOf(messages);
  const rules = new Intl.PluralRules(locale);
  const formatIcu = intl as unknown as (key: string, values?: Values, formats?: unknown) => string;
  const translate = (key: string, values?: Values, formats?: unknown): string => {
    const entry = catalog.get(key);
    if (typeof entry === "string") return entry;
    if (entry === undefined || formats !== undefined) return formatIcu(key, values, formats);
    switch (entry.kind) {
      case "template":
        return interpolate(entry.parts, values);
      case "plural":
        return interpolate(pluralForm(entry, rules, values), values);
      default:
        return formatIcu(key, values, formats);
    }
  };
  return Object.assign(translate, { rich: intl.rich, markup: intl.markup, raw: intl.raw, has: intl.has }) as unknown as Translator;
}

/**
 * Text use-intl shows when a message fails to format (a value the call lacks): the message itself without tags,
 * as the fast path does, instead of its key.
 */
export function messageFallback(messages: Messages) {
  return ({ error, key, namespace }: { error: IntlError; key: string; namespace?: string }): string => {
    const path = namespace ? `${namespace}.${key}` : key;
    const message = path
      .split(".")
      .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);
    if (error.code !== IntlErrorCode.FORMATTING_ERROR || typeof message !== "string") return path;
    return message.replace(/<\/?\w+>/g, "").replace(/''/g, "'");
  };
}
