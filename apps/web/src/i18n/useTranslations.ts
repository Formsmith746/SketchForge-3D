import { useMemo } from "react";
import { useLocale, useTranslations as useIntlTranslations } from "use-intl";
import { withFastPath } from "./fastPath";
import { messagesFor, type Translator } from "./translator";

/** use-intl's `useTranslations()` with the fast path for common messages (see fastPath.ts); same identity rules. */
export function useTranslations(): Translator {
  const intl = useIntlTranslations();
  const locale = useLocale();
  return useMemo(() => withFastPath(intl, locale, messagesFor(locale)), [intl, locale]);
}
