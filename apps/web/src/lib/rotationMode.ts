export type RotationMode = "rings" | "classic";

export const ROTATION_MODE_URL_PARAM = "rotationMode";
export const ROTATION_MODE_MEDIA_QUERY = "(pointer: coarse), (max-width: 768px)";
export const ROTATION_MODE_STORAGE_KEY = "sketchForge.editor.useClassicRotateHandles";

/**
 * Parse a query string for the developer/E2E override. Returns null if the
 * param is absent or the value doesn't match a known mode.
 */
export function parseRotationModeParam(search: string): RotationMode | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const raw = params.get(ROTATION_MODE_URL_PARAM);
  if (raw === "rings" || raw === "classic") return raw;
  return null;
}

/**
 * Precedence (highest to lowest): URL override → user preference → media
 * query. When nothing overrides, `mediaMatches === true` selects classic
 * (touch or narrow viewport); otherwise rings.
 */
export function deriveRotationMode(input: {
  urlOverride: RotationMode | null;
  preferClassic: boolean;
  mediaMatches: boolean;
}): RotationMode {
  if (input.urlOverride) return input.urlOverride;
  if (input.preferClassic) return "classic";
  return input.mediaMatches ? "classic" : "rings";
}
