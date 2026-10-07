import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, getMessages } from "next-intl/server";
import { getRequestLocale } from "@i18n/routing";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("layout");
  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: "assets/sketchforge/sketchforge-logo.png",
      apple: "assets/sketchforge/sketchforge-logo.png",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getRequestLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} style={{ colorScheme: "light" }}>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
