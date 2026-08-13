"use client";

import { useEffect, useState } from "react";
import {
  deriveRotationMode,
  parseRotationModeParam,
  ROTATION_MODE_MEDIA_QUERY,
  ROTATION_MODE_STORAGE_KEY,
  type RotationMode,
} from "@/lib/rotationMode";

function readPreferClassic() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ROTATION_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function readUrlOverride(): RotationMode | null {
  if (typeof window === "undefined") return null;
  return parseRotationModeParam(window.location.search);
}

function readMediaMatches() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(ROTATION_MODE_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Reactive rotation mode. Reads media query, preference, and URL override,
 * and updates when the media query state changes (window resize, mouse
 * plug-in, etc.) or another tab writes the preference.
 *
 * URL overrides are read once on mount — changing the URL without a full
 * navigation is not supported.
 */
export function useRotationMode(): RotationMode {
  const [urlOverride] = useState<RotationMode | null>(() => readUrlOverride());
  const [preferClassic, setPreferClassic] = useState<boolean>(() => readPreferClassic());
  const [mediaMatches, setMediaMatches] = useState<boolean>(() => readMediaMatches());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(ROTATION_MODE_MEDIA_QUERY);
    const listener = (event: MediaQueryListEvent) => setMediaMatches(event.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ROTATION_MODE_STORAGE_KEY) {
        setPreferClassic(readPreferClassic());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return deriveRotationMode({ urlOverride, preferClassic, mediaMatches });
}

/**
 * Write the "prefer classic rotate handles" preference to localStorage and
 * dispatch a fake `storage` event so listeners in the same tab pick it up
 * (StorageEvent normally only fires cross-tab).
 */
export function setPreferClassicRotateHandles(preferClassic: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROTATION_MODE_STORAGE_KEY, String(preferClassic));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: ROTATION_MODE_STORAGE_KEY,
        newValue: String(preferClassic),
      }),
    );
  } catch {
    // Ignore; the change only lives in the current session.
  }
}

export function readPreferClassicRotateHandles(): boolean {
  return readPreferClassic();
}
