export const locales = ["en", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale = "ru" as const;
export const localePrefix = "always" as const;

// For static exports, we don't need URL-based routing.
// Locale is stored in a cookie and components use useTranslations().
