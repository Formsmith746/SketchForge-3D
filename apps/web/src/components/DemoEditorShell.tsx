"use client";

import { useEffect, useState } from "react";
import { SketchForgeEditor } from "@/components/SketchForgeEditor";
import EditorTelemetryLifecycle from "@/components/analytics/EditorTelemetryLifecycle";
import {
  applyAppTheme,
  readStoredAppTheme,
  resolveAppTheme,
  storeAppTheme,
  type AppThemePreference,
  type ResolvedAppTheme,
} from "@/lib/appTheme";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";

export function DemoEditorShell() {
  const [themePreference, setThemePreference] = useState<AppThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedAppTheme>("light");
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const storedTheme = readStoredAppTheme(window.localStorage);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemePreference(storedTheme);
    setResolvedTheme(resolveAppTheme(storedTheme, systemPrefersDark));
    applyAppTheme(storedTheme, systemPrefersDark);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      setResolvedTheme(resolveAppTheme(themePreference, media.matches));
      applyAppTheme(themePreference, media.matches);
    };
    storeAppTheme(window.localStorage, themePreference);
    updateTheme();
    if (themePreference !== "system") return;
    media.addEventListener("change", updateTheme);
    return () => media.removeEventListener("change", updateTheme);
  }, [themePreference, themeReady]);

  return (
    <main className="demo-editor-shell">
      <EditorTelemetryLifecycle />
      <SketchForgeEditor
        initialShapes={[]}
        initialSnap={DEFAULT_SNAP_GRID}
        initialWorkspace={DEFAULT_WORKPLANE_WORKSPACE}
        projectName="SketchForge 3D Demo"
        themePreference={themePreference}
        resolvedTheme={resolvedTheme}
        onThemePreferenceChange={setThemePreference}
        historySettingsEnabled={false}
        tutorialEnabled
      />
    </main>
  );
}
