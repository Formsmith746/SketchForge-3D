import type { MessageKeys, NestedKeyOf } from "use-intl/core";
import en from "./locales/en";

/** English is the source catalog: every key must exist here, other locales fall back to it. */
export type Messages = typeof en;
/** A message's path in the catalogs, e.g. "editor.notice.ready". */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;
/** Values for a message's `{placeholders}`; `count` also picks the plural form. */
export type MessageParams = Record<string, string | number>;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? T[K] : DeepPartial<T[K]> };
/** A language's messages; one being translated may lack some, which then show in English. */
export type MessageCatalog = DeepPartial<Messages>;

type LocaleDefinition = {
  code: string;
  nativeName: string;
  complete: boolean;
  /** English is built in; every other language is a separate file the browser fetches when it is chosen. */
  load: () => Promise<{ default: MessageCatalog }>;
};

/**
 * To add a language: copy locales/en to locales/<code>, translate the JSON files and register it here.
 * `complete: false` while it is being translated: missing strings show in English and the catalog test
 * reports them as a todo. With `complete: true` a missing string fails the test.
 */
export const LOCALES = [
  { code: "en", nativeName: "English", complete: true, load: async () => ({ default: en }) },
  { code: "cs", nativeName: "Čeština", complete: true, load: () => import("./locales/cs") },
  { code: "de", nativeName: "Deutsch", complete: true, load: () => import("./locales/de") },
  { code: "es", nativeName: "Español", complete: true, load: () => import("./locales/es") },
  { code: "fr", nativeName: "Français", complete: true, load: () => import("./locales/fr") },
  { code: "pl", nativeName: "Polski", complete: true, load: () => import("./locales/pl") },
  // Brazilian Portuguese under the plain code: the desktop app and system-language matching use base codes.
  { code: "pt", nativeName: "Português (Brasil)", complete: true, load: () => import("./locales/pt") },
  { code: "ru", nativeName: "Русский", complete: true, load: () => import("./locales/ru") },
] as const satisfies readonly LocaleDefinition[];

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "en";
export const SOURCE_MESSAGES: Messages = en;

const loadedCatalogs = new Map<string, MessageCatalog>([[DEFAULT_LOCALE, SOURCE_MESSAGES]]);
const pendingLoads = new Map<string, Promise<MessageCatalog>>();

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((locale) => locale.code === value);
}

export function isLocaleCatalogLoaded(locale: Locale): boolean {
  return loadedCatalogs.has(locale);
}

/** Fetches a language's catalog once; a failed fetch is tried again on the next call. */
export function loadLocaleCatalog(locale: Locale): Promise<MessageCatalog> {
  const loaded = loadedCatalogs.get(locale);
  if (loaded) return Promise.resolve(loaded);
  const pending = pendingLoads.get(locale);
  if (pending) return pending;
  const definition = LOCALES.find((entry) => entry.code === locale) ?? LOCALES[0];
  const request = definition.load()
    .then(({ default: catalog }) => {
      loadedCatalogs.set(locale, catalog);
      return catalog;
    })
    .finally(() => pendingLoads.delete(locale));
  pendingLoads.set(locale, request);
  return request;
}

/** The catalog of a loaded language; English until it has loaded. */
export function localeCatalog(locale: Locale): MessageCatalog {
  return loadedCatalogs.get(locale) ?? SOURCE_MESSAGES;
}
