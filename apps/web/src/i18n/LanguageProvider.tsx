"use client";

import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { IntlErrorCode, IntlProvider, type IntlError } from "use-intl";
import { messageFallback } from "./fastPath";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { getLocale, subscribeToLanguage } from "./store";
import { messagesFor } from "./translator";

/**
 * use-intl warns at prerender that no time zone is set. It formats no dates here (they use Intl with the system
 * time zone, see formattingLocale), so only that warning is dropped.
 */
function onIntlError(error: IntlError) {
  if (error.code !== IntlErrorCode.ENVIRONMENT_FALLBACK) console.error(error);
}

/** Gives components `useTranslations()` in the interface language; switching the language re-renders them. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  // Starts as the prerendered page did. The switch to the stored language is a transition: an urgent context
  // change while parts of the page are still hydrating would make React drop their server HTML and render
  // them again.
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const sync = () => startTransition(() => setLocale(getLocale()));
    const unsubscribe = subscribeToLanguage(sync);
    sync();
    return unsubscribe;
  }, []);
  const messages = messagesFor(locale);
  const getMessageFallback = useMemo(() => messageFallback(messages), [messages]);
  return (
    <IntlProvider locale={locale} messages={messages} onError={onIntlError} getMessageFallback={getMessageFallback}>
      {children}
    </IntlProvider>
  );
}
