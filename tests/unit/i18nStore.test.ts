import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "@/i18n/store";

type StoreModule = typeof import("@/i18n/store");

type FakeBrowser = {
  storage: Map<string, string>;
  setLanguage: ReturnType<typeof vi.fn>;
  document: { documentElement: { lang: string } };
  navigator: { languages: string[]; language: string };
  fireLanguageChange: () => void;
};

function installBrowser(systemLanguages: string[], storedPreference?: string): FakeBrowser {
  const storage = new Map<string, string>();
  if (storedPreference) storage.set(LANGUAGE_STORAGE_KEY, storedPreference);
  const languageChangeListeners: Array<() => void> = [];
  const setLanguage = vi.fn();
  const browser: FakeBrowser = {
    storage,
    setLanguage,
    document: { documentElement: { lang: "en" } },
    navigator: { languages: systemLanguages, language: systemLanguages[0] ?? "en" },
    fireLanguageChange: () => languageChangeListeners.forEach((listener) => listener()),
  };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === "languagechange") languageChangeListeners.push(listener);
    },
    sketchforgeDesktop: { setLanguage },
  });
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("navigator", browser.navigator);
  return browser;
}

// The store keeps the active language in module state, so every test loads a fresh copy.
async function loadStore(): Promise<StoreModule> {
  vi.resetModules();
  return import("@/i18n/store");
}

describe("language store", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts in English before init and on the server", async () => {
    const store = await loadStore();
    expect(store.getLocale()).toBe("en");
    expect(store.translate("common.language.label")).toBe("Language");
  });

  it("follows the system language when nothing is stored", async () => {
    const browser = installBrowser(["ru-RU", "en-US"]);
    const store = await loadStore();
    store.initLanguage();
    // The desktop main process is told at once; the page switches when the Russian catalog has loaded.
    expect(browser.setLanguage).toHaveBeenLastCalledWith("ru");
    await vi.waitFor(() => expect(store.getLocale()).toBe("ru"));
    expect(browser.document.documentElement.lang).toBe("ru");
    expect(store.translate("common.language.label")).toBe("Язык");
  });

  it("prefers the stored choice over the system language", async () => {
    const browser = installBrowser(["ru-RU"], "en");
    const store = await loadStore();
    store.initLanguage();
    expect(store.getLocale()).toBe("en");
    // The desktop main process starts with the OS language and must still be told.
    expect(browser.setLanguage).toHaveBeenLastCalledWith("en");
  });

  it("stores and applies a new choice", async () => {
    const browser = installBrowser(["en-US"]);
    const store = await loadStore();
    store.initLanguage();
    store.setLanguagePreference("ru");
    expect(browser.storage.get(LANGUAGE_STORAGE_KEY)).toBe("ru");
    await vi.waitFor(() => expect(store.getLocale()).toBe("ru"));
    expect(browser.document.documentElement.lang).toBe("ru");
    expect(browser.setLanguage).toHaveBeenLastCalledWith("ru");
    store.setLanguagePreference("system");
    expect(browser.storage.get(LANGUAGE_STORAGE_KEY)).toBe("system");
    expect(store.getLocale()).toBe("en");
  });

  it("re-resolves on a system language change only while following the system", async () => {
    const browser = installBrowser(["en-US"]);
    const store = await loadStore();
    store.initLanguage();
    browser.navigator.languages = ["ru-RU"];
    browser.fireLanguageChange();
    await vi.waitFor(() => expect(store.getLocale()).toBe("ru"));

    store.setLanguagePreference("en");
    browser.navigator.languages = ["ru-RU"];
    browser.fireLanguageChange();
    expect(store.getLocale()).toBe("en");
  });

  it("keeps the current language until the chosen one has loaded", async () => {
    installBrowser(["en-US"]);
    const store = await loadStore();
    const locales = await import("@/i18n/locales");
    store.initLanguage();
    expect(locales.isLocaleCatalogLoaded("ru")).toBe(false);
    store.setLanguagePreference("ru");
    // The menu shows the choice at once; the text stays English, not keys, while Russian downloads.
    expect(store.getLanguagePreference()).toBe("ru");
    expect(store.getLocale()).toBe("en");
    expect(store.translate("common.language.label")).toBe("Language");
    await vi.waitFor(() => expect(store.getLocale()).toBe("ru"));
    expect(store.translate("common.language.label")).toBe("Язык");
  });

  it("lets a later choice win over a slower download", async () => {
    installBrowser(["en-US"]);
    const store = await loadStore();
    store.initLanguage();
    store.setLanguagePreference("ru");
    store.setLanguagePreference("en");
    const locales = await import("@/i18n/locales");
    await locales.loadLocaleCatalog("ru");
    await Promise.resolve();
    expect(store.getLocale()).toBe("en");
    expect(store.getLanguagePreference()).toBe("en");
  });

  it("starts downloading the stored language as soon as the page script runs", async () => {
    installBrowser(["en-US"], "ru");
    const store = await loadStore();
    const locales = await import("@/i18n/locales");
    // Without initLanguage(): loading started when the module ran.
    await vi.waitFor(() => expect(locales.isLocaleCatalogLoaded("ru")).toBe(true));
    expect(store.getLocale()).toBe("en");
  });

  it("formats dates and numbers in the system's regional variant of the UI language", async () => {
    installBrowser(["en-GB", "ru-RU"]);
    const store = await loadStore();
    expect(store.formattingLocale("en")).toBe("en-GB");
    expect(store.formattingLocale("ru")).toBe("ru-RU");
    installBrowser(["de-DE"]);
    expect(store.formattingLocale("ru")).toBe("ru");
  });
});
