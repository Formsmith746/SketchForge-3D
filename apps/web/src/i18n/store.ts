import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALES, isLocale, isLocaleCatalogLoaded, loadLocaleCatalog, type Locale, type MessageKey, type MessageParams } from "./locales";
import { translatorFor, type Translator } from "./translator";

export const LANGUAGE_STORAGE_KEY = "sketchForge.language";

export type LanguagePreference = "system" | Locale;

export const LANGUAGE_PREFERENCE_OPTIONS: readonly LanguagePreference[] = ["system", ...LOCALES.map((locale) => locale.code)];

/** Languages are listed by their own name so a user can find theirs whatever the current language. */
export function languagePreferenceLabel(t: Translator, preference: LanguagePreference): string {
  if (preference === "system") return t("common.language.system");
  return LOCALES.find((locale) => locale.code === preference)?.nativeName ?? preference;
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return value === "system" || isLocale(value) ? value : "system";
}

/** First system language whose base subtag (`ru` in `ru-RU`) has a catalog, else English. */
export function resolveLocale(preference: LanguagePreference, systemLanguages: readonly string[]): Locale {
  if (preference !== "system") return preference;
  for (const language of systemLanguages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function readStoredLanguagePreference(storage: Pick<Storage, "getItem"> | null | undefined): LanguagePreference {
  if (!storage) return "system";
  try {
    return normalizeLanguagePreference(storage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeLanguagePreference(storage: Pick<Storage, "setItem"> | null | undefined, preference: LanguagePreference) {
  if (!storage) return;
  try {
    storage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // The selected language still applies for this session when storage is unavailable.
  }
}

type LanguageState = { preference: LanguagePreference; locale: Locale };

const SERVER_STATE: LanguageState = { preference: "system", locale: DEFAULT_LOCALE };
let state: LanguageState = SERVER_STATE;
let systemLanguageListenerAttached = false;
let languageRequest = 0;
const listeners = new Set<() => void>();

function systemLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function commitLanguage(preference: LanguagePreference, locale: Locale) {
  if (state.preference === preference && state.locale === locale) return;
  const localeChanged = state.locale !== locale;
  state = { preference, locale };
  if (localeChanged) {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    if (typeof window !== "undefined") window.sketchforgeDesktop?.setLanguage(locale);
  }
  listeners.forEach((listener) => listener());
}

/**
 * Switches once the language's catalog is loaded. Until then the interface stays in the current language
 * (not English keys or half-translated screens) and the language menu already shows the new choice.
 */
function applyLanguage(preference: LanguagePreference) {
  const locale = resolveLocale(preference, systemLanguages());
  const request = ++languageRequest;
  if (isLocaleCatalogLoaded(locale)) {
    commitLanguage(preference, locale);
    return;
  }
  commitLanguage(preference, state.locale);
  loadLocaleCatalog(locale).then(
    () => {
      // A later choice wins over a slower earlier download.
      if (request === languageRequest) commitLanguage(preference, locale);
    },
    (error: unknown) => console.warn(`The ${locale} interface language could not be loaded; it is tried again on the next start.`, error),
  );
}

function storedPreferenceOrSystem(): LanguagePreference {
  try {
    return readStoredLanguagePreference(window.localStorage);
  } catch {
    return "system";
  }
}

// Start fetching the stored or system language while the page script loads, before the first render asks for it.
if (typeof window !== "undefined") {
  loadLocaleCatalog(resolveLocale(storedPreferenceOrSystem(), systemLanguages())).catch(() => undefined);
}

/** Reads the stored preference. Call once on the client before the first translated render. */
export function initLanguage() {
  if (typeof window === "undefined") return;
  if (!systemLanguageListenerAttached) {
    systemLanguageListenerAttached = true;
    window.addEventListener("languagechange", () => {
      if (state.preference === "system") applyLanguage("system");
    });
  }
  applyLanguage(storedPreferenceOrSystem());
  // Main process starts with the OS language; tell it the chosen one even when it did not change.
  // It reads its own catalog, so it need not wait for this page's download.
  window.sketchforgeDesktop?.setLanguage(resolveLocale(state.preference, systemLanguages()));
}

export function setLanguagePreference(preference: LanguagePreference) {
  if (typeof window !== "undefined") storeLanguagePreference(window.localStorage, preference);
  applyLanguage(preference);
}

export function getLocale(): Locale {
  return state.locale;
}

/** The language chosen in the menu; it can be ahead of `getLocale()` while that language downloads. */
export function getLanguagePreference(): LanguagePreference {
  return state.preference;
}

/**
 * Locale for Intl date/number formatting: the system's regional variant when it is the UI language
 * (`en-GB` keeps "4 Oct" in English), otherwise the UI language itself.
 */
export function formattingLocale(locale: Locale): string {
  return systemLanguages().find((language) => language.toLowerCase().split(/[-_]/)[0] === locale) ?? locale;
}

/**
 * Translator for the locale at call time. For long-lived listeners, timers and effects whose deps must not
 * include `t` because re-running them on a language switch has side effects (worker restart, refetch, autosave).
 */
export function currentTranslator(): Translator {
  return translatorFor(state.locale);
}

/** For code outside React (event handlers in plain modules). Not reactive: read at call time. */
export function translate(key: MessageKey, params?: MessageParams): string {
  return translatorFor(state.locale)(key, params);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;
const getServerState = () => SERVER_STATE;

/** Calls `listener` after every language or preference change; returns the unsubscribe function. */
export function subscribeToLanguage(listener: () => void): () => void {
  return subscribe(listener);
}

export function useLanguagePreference(): [LanguagePreference, (preference: LanguagePreference) => void] {
  const { preference } = useSyncExternalStore(subscribe, getState, getServerState);
  return [preference, useCallback((next: LanguagePreference) => setLanguagePreference(next), [])];
}
