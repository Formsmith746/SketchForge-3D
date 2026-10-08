// Tray and dialog text for the main process, read from the web UI catalogs
// (apps/web/src/i18n/locales/<code>/desktop.json). No Electron imports so it can be unit-tested.

const DEFAULT_LOCALE = "en";
const LOCALE_CODE_PATTERN = /^[a-z]{2,3}$/;
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

function createDesktopI18n(loadMessages = (locale) => require(`../web/src/i18n/locales/${locale}/desktop.json`)) {
  const messagesByLocale = new Map();
  let locale = DEFAULT_LOCALE;

  function messagesFor(code) {
    if (!messagesByLocale.has(code)) {
      let messages = null;
      try {
        messages = loadMessages(code);
      } catch {
        // No catalog for this language.
      }
      messagesByLocale.set(code, messages);
    }
    return messagesByLocale.get(code);
  }

  /** Base language code (`ru` for `ru-RU`) when a catalog exists for it, else null. Rejects anything that isn't a plain code. */
  function supportedLocale(code) {
    const base = String(code ?? "").toLowerCase().split(/[-_]/)[0];
    return LOCALE_CODE_PATTERN.test(base) && messagesFor(base) ? base : null;
  }

  /** First supported language from a preference list, else English. */
  function resolveLocale(languages) {
    return languages.map(supportedLocale).find(Boolean) ?? DEFAULT_LOCALE;
  }

  /** Switches the language; returns false when the code is unsupported or already active. */
  function setLocale(code) {
    const next = supportedLocale(code);
    if (!next || next === locale) return false;
    locale = next;
    return true;
  }

  /** Message at a dotted path ("desktop.tray.quit") in a nested catalog. */
  function lookup(messages, key) {
    const value = key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), messages);
    return typeof value === "string" ? value : undefined;
  }

  function t(key, params = {}) {
    const template = lookup(messagesFor(locale), key) ?? lookup(messagesFor(DEFAULT_LOCALE), key) ?? key;
    return template.replace(PLACEHOLDER_PATTERN, (match, name) => (name in params ? String(params[name]) : match));
  }

  return { getLocale: () => locale, resolveLocale, setLocale, supportedLocale, t };
}

module.exports = { createDesktopI18n };
