import { createTranslator } from "use-intl/core";
import { messageFallback, withFastPath } from "./fastPath";
import { LocalizedError } from "./LocalizedError";
import {
  DEFAULT_LOCALE,
  SOURCE_MESSAGES,
  isLocaleCatalogLoaded,
  localeCatalog,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Messages,
} from "./locales";

/** What `useTranslations()` returns in components; code outside React gets the same from `translatorFor`. */
export type Translator = ReturnType<typeof createTranslator<Messages>>;

type MessageTree = { [key: string]: string | MessageTree };

/**
 * English as the fallback for a language that lacks a message. Its `one` form becomes `=1`: the language's own
 * plural rules apply, and Russian `one` also covers 21, which would read "21 shape".
 */
function englishFallback(tree: MessageTree): MessageTree {
  return Object.fromEntries(Object.entries(tree).map(([key, value]) => [
    key,
    typeof value === "string" ? value.replace(/(\{count, plural, )one \{/g, "$1=1 {") : englishFallback(value),
  ]));
}

function mergeMessages(base: MessageTree, overrides: MessageTree): MessageTree {
  const merged: MessageTree = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] = typeof value === "string" || typeof current !== "object" ? value : mergeMessages(current, value);
  }
  return merged;
}

const messagesByLocale = new Map<Locale, Messages>([[DEFAULT_LOCALE, SOURCE_MESSAGES]]);
let englishFallbackTree: MessageTree | null = null;

/** Messages of a loaded language, English where it lacks one; English until the language has loaded. */
export function messagesFor(locale: Locale): Messages {
  if (!isLocaleCatalogLoaded(locale)) return SOURCE_MESSAGES;
  let messages = messagesByLocale.get(locale);
  if (!messages) {
    englishFallbackTree ??= englishFallback(SOURCE_MESSAGES);
    messages = mergeMessages(englishFallbackTree, localeCatalog(locale) as MessageTree) as Messages;
    messagesByLocale.set(locale, messages);
  }
  return messages;
}

const translatorsByLocale = new Map<Locale, Translator>();

/**
 * Translator for code outside React (workers excepted: they use LocalizedError). English until the language has
 * loaded, so ask for it when translating rather than keeping it across a language switch.
 */
export function translatorFor(locale: Locale): Translator {
  const effective = isLocaleCatalogLoaded(locale) ? locale : DEFAULT_LOCALE;
  let translator = translatorsByLocale.get(effective);
  if (!translator) {
    const messages = messagesFor(effective);
    translator = withFastPath(createTranslator({ locale: effective, messages, getMessageFallback: messageFallback(messages) }), effective, messages);
    translatorsByLocale.set(effective, translator);
  }
  return translator;
}

/**
 * Text for an error shown to the user: LocalizedError is translated, other errors keep their own
 * message (third-party libraries), anything else uses the fallback.
 */
export function errorText(t: Translator, error: unknown, fallbackKey: MessageKey, fallbackParams?: MessageParams): string {
  if (error instanceof LocalizedError) return t(error.key, error.params);
  if (error instanceof Error && error.message) return error.message;
  return t(fallbackKey, fallbackParams);
}
