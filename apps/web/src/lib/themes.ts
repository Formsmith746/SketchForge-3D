export type ThemeUI = {
  background: string;
  foreground: string;
  topbar: string;
  subbar: string;
  panel: string;
  tile: string;
  tileHover: string;
  border: string;
  borderStrong: string;
  muted: string;
  mutedStrong: string;
  primary: string;
  activeTab: string;
  navText: string;
  workplane: string;
  workplaneSoft: string;
  shadow: string;
};

export type ThemeViewport = {
  background: string;
  gridMinor: string;
  gridMajor: string;
  gridAxis: string;
  gridBorder: string;
  textPrimary: string;
  textSecondary: string;
  handleDefault: string;
  handleHover: string;
  handleActive: string;
  handleHoverAlt: string;
  handleActiveAlt: string;
  handleMaterial: string;
  darkMaterial: string;
  dashMaterial: string;
  hole: string;
  holeEdge: string;
  complexEdge: string;
};

export type AppTheme = {
  id: string;
  name: string;
  ui: ThemeUI;
  viewport: ThemeViewport;
};

export const THEME_PRESET_OPTIONS = [
  { value: "sketchforge", label: "SketchForge (Current)" },
  { value: "light", label: "Light" },
  { value: "solidworks", label: "SolidWorks" },
  { value: "inventor", label: "Inventor" },
  { value: "custom", label: "Custom" },
] as const;

export function appColorModeForThemePreset(themeId: string): "light" | "dark" {
  return themeId === "sketchforge" ? "dark" : "light";
}

export const defaultThemes: Record<string, AppTheme> = {
  sketchforge: {
    id: "sketchforge",
    name: "SketchForge",
    ui: {
      background: "#101820",
      foreground: "#d8e6f1",
      topbar: "#0e69f1",
      subbar: "#1b2732",
      panel: "#17232d",
      tile: "#1b2833",
      tileHover: "#223341",
      border: "#304250",
      borderStrong: "#405665",
      muted: "#52697a",
      mutedStrong: "#7890a1",
      primary: "#0e69f1",
      activeTab: "#0e69f1",
      navText: "#d1e0eb",
      workplane: "#65c9df",
      workplaneSoft: "rgba(101, 201, 223, 0.24)",
      shadow: "0 3px 12px rgba(0, 0, 0, 0.32)",
    },
    viewport: {
      background: "#101820",
      gridMinor: "#397080",
      gridMajor: "#4d9caf",
      gridAxis: "#65c9df",
      gridBorder: "#59b8cc",
      textPrimary: "#d8e6f1",
      textSecondary: "#9eb1c0",
      handleDefault: "#00aeea",
      handleHover: "#ffbf45",
      handleActive: "#ff8a1d",
      handleHoverAlt: "#84edff",
      handleActiveAlt: "#17b7e5",
      handleMaterial: "#d5e2e9",
      darkMaterial: "#17232d",
      dashMaterial: "#c7d8e4",
      hole: "#405665",
      holeEdge: "#7890a1",
      complexEdge: "#e1edf5",
    },
  },
  light: {
    id: "light",
    name: "Light",
    ui: {
      background: "#fafafa",
      foreground: "#31465d",
      topbar: "#f9f9fa",
      subbar: "#f1f1f3",
      panel: "#fafafa",
      tile: "#f4f5f7",
      tileHover: "#ffffff",
      border: "#dde2e8",
      borderStrong: "#cfd8e2",
      muted: "#c5d0dc",
      mutedStrong: "#9cabb8",
      primary: "#009cde",
      activeTab: "#4f8edb",
      navText: "#31465d",
      workplane: "#9adcf0",
      workplaneSoft: "rgba(154, 220, 240, 0.28)",
      shadow: "0 2px 6px rgba(35, 55, 75, 0.12)",
    },
    viewport: {
      background: "#f8fbfc",
      gridMinor: "#91dff0",
      gridMajor: "#4bbddf",
      gridAxis: "#34aad2",
      gridBorder: "#58c5e6",
      textPrimary: "#30363a",
      textSecondary: "#7f8f95",
      handleDefault: "#00aeea",
      handleHover: "#ffbf45",
      handleActive: "#ff8a1d",
      handleHoverAlt: "#84edff",
      handleActiveAlt: "#17b7e5",
      handleMaterial: "#e8eef1",
      darkMaterial: "#273849",
      dashMaterial: "#2c3339",
      hole: "#b8c2cc",
      holeEdge: "#697989",
      complexEdge: "#141b21",
    }
  },
  solidworks: {
    id: "solidworks",
    name: "SolidWorks",
    ui: {
      background: "#d2deeb",
      foreground: "#111111",
      topbar: "#e6eef5",
      subbar: "#d9e4f0",
      panel: "#e6eef5",
      tile: "#ffffff",
      tileHover: "#f0f5fa",
      border: "#aab8c7",
      borderStrong: "#899bb0",
      muted: "#9ba8b5",
      mutedStrong: "#6b7d91",
      primary: "#2e6da4",
      activeTab: "#417db0",
      navText: "#222222",
      workplane: "#ffffff",
      workplaneSoft: "rgba(255, 255, 255, 0.5)",
      shadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
    },
    viewport: {
      background: "#d2deeb",
      gridMinor: "#b0c4de",
      gridMajor: "#8cabc9",
      gridAxis: "#6a8bb0",
      gridBorder: "#5b7d9e",
      textPrimary: "#111111",
      textSecondary: "#444444",
      handleDefault: "#ff0000",
      handleHover: "#ff6600",
      handleActive: "#cc0000",
      handleHoverAlt: "#ff9933",
      handleActiveAlt: "#ff3300",
      handleMaterial: "#f5f5f5",
      darkMaterial: "#333333",
      dashMaterial: "#111111",
      hole: "#99a3ab",
      holeEdge: "#606b75",
      complexEdge: "#000000",
    }
  },
  inventor: {
    id: "inventor",
    name: "Inventor",
    ui: {
      background: "#1b293d",
      foreground: "#dce3eb",
      topbar: "#2e4d6a",
      subbar: "#223952",
      panel: "#223952",
      tile: "#3b5b7a",
      tileHover: "#4b6c8c",
      border: "#182436",
      borderStrong: "#0f1826",
      muted: "#607d9c",
      mutedStrong: "#87a5c4",
      primary: "#eeb422",
      activeTab: "#f3c746",
      navText: "#ffffff",
      workplane: "#dce3eb",
      workplaneSoft: "rgba(220, 227, 235, 0.2)",
      shadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    },
    viewport: {
      background: "#223952",
      gridMinor: "#2e4d6a",
      gridMajor: "#3b5b7a",
      gridAxis: "#4b6c8c",
      gridBorder: "#5a7a9a",
      textPrimary: "#ffffff",
      textSecondary: "#b3c6d9",
      handleDefault: "#ffcc00",
      handleHover: "#ffff66",
      handleActive: "#ff9900",
      handleHoverAlt: "#ffffcc",
      handleActiveAlt: "#ffcc33",
      handleMaterial: "#3b5b7a",
      darkMaterial: "#0f1826",
      dashMaterial: "#dce3eb",
      hole: "#1b293d",
      holeEdge: "#111a26",
      complexEdge: "#ffffff",
    }
  }
};

export function customThemeWithDefaults(theme: AppTheme | undefined): AppTheme {
  const fallback = defaultThemes.light;
  return {
    ...fallback,
    ...theme,
    id: "custom",
    name: theme?.name || "Custom",
    ui: { ...fallback.ui, ...theme?.ui },
    viewport: { ...fallback.viewport, ...theme?.viewport },
  };
}
