export { LOCALES, DEFAULT_LOCALE, isLocale, type Locale, type MessageKey, type MessageParams } from "./locales";
export {
  LocalizedError,
  errorFromPayload,
  errorFromResponse,
  errorResponseFields,
  localizedErrorPayload,
  type ErrorKey,
  type ErrorResponseFields,
  type LocalizedErrorPayload,
} from "./LocalizedError";
export { englishNotice, notice, type Notice } from "./notice";
export {
  LANGUAGE_PREFERENCE_OPTIONS,
  currentTranslator,
  formattingLocale,
  getLocale,
  initLanguage,
  languagePreferenceLabel,
  normalizeLanguagePreference,
  setLanguagePreference,
  translate,
  useLanguagePreference,
  type LanguagePreference,
} from "./store";
export { errorText, translatorFor, type Translator } from "./translator";
export { unitLabel } from "./units";
// Components translate with use-intl through this module, so only apps/web/src/i18n depends on it.
export { useTranslations } from "./useTranslations";
export { useLocale } from "use-intl";
