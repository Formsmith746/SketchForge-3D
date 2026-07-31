import type { Metadata } from "next";
import SiteTelemetry from "@/components/analytics/SiteTelemetry";
import "./globals.css";

export const metadata: Metadata = {
  title: "SketchForge 3D Editor | Free Tinkercad Alternative",
  description:
    "Create, edit, combine, import, and export 3D models with SketchForge, a free Tinkercad alternative that works directly in your browser—no account required.",
  icons: {
    icon: "/assets/sketchforge/sketchforge-tab-icon.png",
    shortcut: "/assets/sketchforge/sketchforge-tab-icon.png",
    apple: "/assets/sketchforge/sketchforge-tab-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <head>
        <meta name="sketchforge-deployment" content="2026-07-13-sketchforge-landing" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <SiteTelemetry />
      </body>
    </html>
  );
}
