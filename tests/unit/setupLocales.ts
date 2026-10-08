import { LOCALES, loadLocaleCatalog } from "@/i18n/locales";

// Tests translate into every language right away (translatorFor("ru")); the app loads languages on demand.
await Promise.all(LOCALES.map((locale) => loadLocaleCatalog(locale.code)));
