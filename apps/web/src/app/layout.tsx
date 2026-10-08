import type { Metadata } from "next";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

// The page renders <title> itself so it follows the UI language.
export const metadata: Metadata = {
  description: "Browser-based SketchForge editor workspace",
  icons: {
    icon: "assets/sketchforge/sketchforge-logo.png",
    apple: "assets/sketchforge/sketchforge-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body suppressHydrationWarning>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
