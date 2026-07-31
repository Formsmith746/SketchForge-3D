export const ANALYTICS_CONSENT_KEY = "sketchforge-cookie-consent-v2";
export const ANALYTICS_CONSENT_EVENT = "sketchforge:analytics-consent";
export const EDITOR_HEALTH_FAILURE_EVENT = "sketchforge:editor-health-failure";

export type TelemetryEvent =
  | "human-visitor-today"
  | "human-visitor-7d"
  | "human-visitor-30d"
  | "landing-bounce"
  | "editor-opened"
  | "successful-creator"
  | "returning-creator-7d"
  | "returning-creator-30d"
  | "tutorial-started"
  | "tutorial-completed"
  | "tutorial-skipped"
  | "crash-free-session"
  | "failed-editor-session"
  | "fatal-editor-error"
  | "frozen-editor-loading"
  | "wasm-initialization-failed";

const TELEMETRY_STORAGE_PREFIX = "sketchforge.telemetry";
const DAY_MS = 24 * 60 * 60 * 1000;

function browserStorage(storage: "local" | "session") {
  try {
    return storage === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function analyticsConsentGranted() {
  return browserStorage("local")?.getItem(ANALYTICS_CONSENT_KEY) === "all";
}

export function announceAnalyticsConsent(granted: boolean) {
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: { granted } }));
}

function looksLikeHumanBrowser() {
  if (navigator.webdriver) return false;
  return !/(bot|crawler|spider|headless|lighthouse|slurp|bingpreview)/i.test(navigator.userAgent);
}

function telemetryUrl(event: TelemetryEvent) {
  const url = new URL(`/telemetry/${event}.svg`, window.location.origin);
  url.searchParams.set("v", `${Date.now()}-${crypto.randomUUID?.() ?? "event"}`);
  return url.href;
}

export function trackTelemetry(event: TelemetryEvent) {
  if (!analyticsConsentGranted() || !looksLikeHumanBrowser()) return false;
  void fetch(telemetryUrl(event), {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    keepalive: true,
  }).catch(() => undefined);
  return true;
}

export function trackTelemetryOncePerSession(event: TelemetryEvent) {
  const storage = browserStorage("session");
  const key = `${TELEMETRY_STORAGE_PREFIX}.session.${event}`;
  if (storage?.getItem(key) === "true") return false;
  const sent = trackTelemetry(event);
  if (sent) storage?.setItem(key, "true");
  return sent;
}

export function trackTelemetryAtMostEvery(event: TelemetryEvent, intervalMs: number) {
  const storage = browserStorage("local");
  const key = `${TELEMETRY_STORAGE_PREFIX}.periodic.${event}`;
  const lastSent = Number(storage?.getItem(key) ?? 0);
  const now = Date.now();
  if (Number.isFinite(lastSent) && now - lastSent < intervalMs) return false;
  const sent = trackTelemetry(event);
  if (sent) storage?.setItem(key, String(now));
  return sent;
}

export function trackHumanVisitorWindows() {
  trackTelemetryAtMostEvery("human-visitor-today", DAY_MS);
  trackTelemetryAtMostEvery("human-visitor-7d", 7 * DAY_MS);
  trackTelemetryAtMostEvery("human-visitor-30d", 30 * DAY_MS);
}

export function markTelemetrySessionFlag(flag: string) {
  browserStorage("session")?.setItem(`${TELEMETRY_STORAGE_PREFIX}.flag.${flag}`, "true");
}

export function hasTelemetrySessionFlag(flag: string) {
  return browserStorage("session")?.getItem(`${TELEMETRY_STORAGE_PREFIX}.flag.${flag}`) === "true";
}

export function recordSuccessfulCreator() {
  const sent = trackTelemetryOncePerSession("successful-creator");
  if (!sent) return;
  browserStorage("local")?.setItem(`${TELEMETRY_STORAGE_PREFIX}.last-successful-creator`, String(Date.now()));
}

export function trackReturningCreator() {
  if (!analyticsConsentGranted()) return;
  const storage = browserStorage("local");
  const lastCreatedAt = Number(storage?.getItem(`${TELEMETRY_STORAGE_PREFIX}.last-successful-creator`) ?? 0);
  const elapsed = Date.now() - lastCreatedAt;
  if (!Number.isFinite(lastCreatedAt) || lastCreatedAt <= 0 || elapsed < 30 * 60 * 1000) return;
  if (elapsed <= 7 * DAY_MS) {
    trackTelemetryAtMostEvery("returning-creator-7d", 7 * DAY_MS);
  }
  if (elapsed <= 30 * DAY_MS) {
    trackTelemetryAtMostEvery("returning-creator-30d", 30 * DAY_MS);
  }
}

export function reportEditorHealthFailure(event: Extract<TelemetryEvent, "fatal-editor-error" | "frozen-editor-loading" | "wasm-initialization-failed">) {
  trackTelemetryOncePerSession("failed-editor-session");
  trackTelemetryOncePerSession(event);
  window.dispatchEvent(new CustomEvent(EDITOR_HEALTH_FAILURE_EVENT, { detail: { event } }));
}
