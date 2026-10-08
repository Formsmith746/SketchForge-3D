import type { Locale, Messages } from "./locales";

// Types `useTranslations()` and `useLocale()` with the English catalog and the app's languages.
declare module "use-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
