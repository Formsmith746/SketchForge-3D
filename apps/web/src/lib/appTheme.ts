export const APP_THEME_STORAGE_KEY = "sketchForge.theme";

export const APP_THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export type AppThemePreference = (typeof APP_THEME_OPTIONS)[number]["value"];
export type ResolvedAppTheme = Exclude<AppThemePreference, "system">;

export function normalizeAppThemePreference(value: unknown): AppThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveAppTheme(preference: AppThemePreference, prefersDark: boolean): ResolvedAppTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

export function readStoredAppTheme(storage: Pick<Storage, "getItem"> | null | undefined): AppThemePreference {
  if (!storage) return "system";
  try {
    return normalizeAppThemePreference(storage.getItem(APP_THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function storeAppTheme(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: AppThemePreference,
) {
  if (!storage) return;
  try {
    storage.setItem(APP_THEME_STORAGE_KEY, preference);
  } catch {
    // The selected theme still applies for this session when storage is unavailable.
  }
}

export function applyAppTheme(preference: AppThemePreference, prefersDark?: boolean) {
  if (typeof document === "undefined") return;
  const systemPrefersDark = prefersDark ?? (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );
  const resolved = resolveAppTheme(preference, systemPrefersDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}
