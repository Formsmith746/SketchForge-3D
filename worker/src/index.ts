import {
  CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
  CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES,
  CLOUD_STORAGE_QUOTA_BYTES,
  getEntitlement,
  MAX_PROJECT_BYTES,
  retentionDeadline,
} from "./entitlement";
import { ApiError, apiError } from "./errors";
import { validateProjectDocument } from "./projectValidation";
import { createEmptySkfProject, SKF_MEDIA_TYPE, validateSkfProject } from "./skfValidation";
import {
  assertSameOrigin,
  cookieHeader,
  hmacHex,
  oauthCookieName,
  parseCookies,
  randomToken,
  sessionCookieName,
  sha256,
  signValue,
  timingSafeEqual,
  verifyGoogleIdToken,
  verifySignedValue,
} from "./security";
import { assertStripeTestMode, stripeId, stripeRequest, subscriptionPeriod, type StripeEvent, type StripeObject } from "./stripe";
import {
  MAX_THUMBNAIL_BYTES,
  MAX_THUMBNAIL_REQUEST_BYTES,
  thumbnailByteLength,
  thumbnailBytesFromDataUrl,
  thumbnailPngDimensions,
} from "./thumbnails";
import type { Env, ProjectRow, SessionContext, SessionRow, UserRow } from "./types";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_TTL_SECONDS = 10 * 60;
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const STRIPE_PROCESSING_LEASE_SECONDS = 10 * 60;
const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;
const MAX_PROJECTS_PER_USER = 200;
const MAINTENANCE_BATCH_SIZE = 100;
const SAVED_GEOMETRY_REFERENCE_KEY = "reuseSavedGeometry";
const MAX_GEOMETRY_REFERENCE_NODES = 500_000;
const TURNSTILE_ACTION = "turnstile-spin-v2";
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
export const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function json(data: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function errorResponse(error: ApiError, requestId?: string) {
  return json({ error: error.code, message: error.publicMessage, ...(requestId ? { requestId } : {}) }, error.status);
}

function logEvent(level: "error" | "warn" | "info", event: string, fields: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ event, ...fields }));
}

function redirect(location: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Location", location);
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers: responseHeaders });
}

function requireConfiguration(value: string, placeholder: string, code: string) {
  if (!value || value === placeholder) throw new Error(code);
  return value;
}

function assertRuntimeConfiguration(env: Env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET_TOO_SHORT");
  if (env.APP_ENV !== "local" && (!env.AUTH_RATE_LIMITER || !env.MUTATION_RATE_LIMITER)) {
    throw new Error("RATE_LIMIT_BINDINGS_REQUIRED");
  }
  if (env.APP_ENV !== "local" && (!env.AUTH_RATE_LIMITER || !env.MUTATION_RATE_LIMITER)) {
    throw new Error("RATE_LIMIT_BINDINGS_REQUIRED");
  }
  if (env.APP_ENV === "staging") {
    const appHost = new URL(env.APP_BASE_URL).hostname.toLowerCase();
    if (appHost === "sketchforge3d.com" || appHost === "www.sketchforge3d.com") {
      throw new Error("STAGING_PRODUCTION_DOMAIN_FORBIDDEN");
    }
    assertStripeTestMode(env);
  }
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function safeReturnPath(value: string | null) {
  return value && /^\/cloud(?:\/|$)/.test(value) ? value : "/cloud/subscribe";
}

function normalizeProjectName(value: unknown) {
  if (typeof value !== "string") return "Untitled project";
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  return cleaned || "Untitled project";
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SavedGeometryReference =
  | { kind: "position" }
  | { kind: "shapeId"; source: string }
  | { kind: "path"; source: string };

function savedGeometryReference(value: unknown): SavedGeometryReference | undefined {
  if (!isJsonRecord(value) || value[SAVED_GEOMETRY_REFERENCE_KEY] !== true) return undefined;
  const keys = Object.keys(value);
  if (keys.length === 1) return { kind: "position" };
  if (keys.length !== 2) return undefined;
  if (
    keys.includes("sourceShapeId")
    && typeof value.sourceShapeId === "string"
    && value.sourceShapeId.length > 0
    && value.sourceShapeId.length <= 200
  ) return { kind: "shapeId", source: value.sourceShapeId };
  if (
    keys.includes("sourceGeometryPath")
    && typeof value.sourceGeometryPath === "string"
    && value.sourceGeometryPath.length > 0
    && value.sourceGeometryPath.length <= 1024
  ) return { kind: "path", source: value.sourceGeometryPath };
  return undefined;
}

function isSavedGeometryReference(value: unknown) {
  return savedGeometryReference(value) !== undefined;
}

function projectShapeRoots(document: Record<string, unknown>) {
  const roots: Array<{ shape: unknown; path: string }> = [];
  if (Array.isArray(document.shapes)) {
    document.shapes.forEach((shape, index) => roots.push({ shape, path: `shapes/${index}` }));
  }
  if (Array.isArray(document.history)) {
    document.history.forEach((snapshot, historyIndex) => {
      if (!Array.isArray(snapshot)) return;
      snapshot.forEach((shape, shapeIndex) => roots.push({
        shape,
        path: `history/${historyIndex}/${shapeIndex}`,
      }));
    });
  }
  return roots;
}

function indexSavedGeometry(document: Record<string, unknown>) {
  const byShapeId = new Map<string, Record<string, unknown> | null>();
  const byPath = new Map<string, Record<string, unknown>>();
  const stack = projectShapeRoots(document);
  let visited = 0;
  while (stack.length) {
    const { shape, path } = stack.pop()!;
    visited += 1;
    if (visited > MAX_GEOMETRY_REFERENCE_NODES) break;
    if (!isJsonRecord(shape)) continue;
    if (isJsonRecord(shape.importedMesh) && !isSavedGeometryReference(shape.importedMesh)) {
      byPath.set(path, shape.importedMesh);
      if (typeof shape.id === "string") {
        byShapeId.set(shape.id, byShapeId.has(shape.id) ? null : shape.importedMesh);
      }
    }
    if (Array.isArray(shape.groupedShapes)) {
      shape.groupedShapes.forEach((child, index) => stack.push({
        shape: child,
        path: `${path}/groupedShapes/${index}`,
      }));
    }
    if (Array.isArray(shape.edgeTreatmentHistory)) {
      shape.edgeTreatmentHistory.forEach((entry, index) => {
        if (isJsonRecord(entry)) stack.push({
          shape: entry.before,
          path: `${path}/edgeTreatmentHistory/${index}/before`,
        });
      });
    }
  }
  return { byShapeId, byPath };
}

function projectUsesSavedGeometryReferences(document: Record<string, unknown>) {
  const stack = projectShapeRoots(document).map((root) => root.shape);
  let visited = 0;
  while (stack.length) {
    const shape = stack.pop();
    visited += 1;
    if (visited > MAX_GEOMETRY_REFERENCE_NODES) return false;
    if (!isJsonRecord(shape)) continue;
    if (isSavedGeometryReference(shape.importedMesh)) return true;
    if (Array.isArray(shape.groupedShapes)) stack.push(...shape.groupedShapes);
    if (Array.isArray(shape.edgeTreatmentHistory)) {
      for (const entry of shape.edgeTreatmentHistory) {
        if (isJsonRecord(entry)) stack.push(entry.before);
      }
    }
  }
  return false;
}

function restoreSavedProjectGeometry(
  currentDocument: Record<string, unknown>,
  previousDocument: Record<string, unknown>,
) {
  const currentRoots = projectShapeRoots(currentDocument);
  const previousRoots = new Map(projectShapeRoots(previousDocument).map((root) => [root.path, root.shape]));
  const savedGeometry = indexSavedGeometry(previousDocument);
  const stack: Array<{ current: unknown; previous: unknown; path: string }> = currentRoots.map((root) => ({
    current: root.shape,
    previous: previousRoots.get(root.path),
    path: root.path,
  }));
  let visited = 0;
  while (stack.length) {
    const pair = stack.pop()!;
    visited += 1;
    if (visited > MAX_GEOMETRY_REFERENCE_NODES) {
      throw apiError(409, "PROJECT_GEOMETRY_REFERENCE_MISSING", "Saved geometry could not be reused. Retry the full save.");
    }
    if (!isJsonRecord(pair.current)) continue;
    const previous = isJsonRecord(pair.previous) ? pair.previous : null;
    const reference = savedGeometryReference(pair.current.importedMesh);
    if (reference) {
      const referencedMesh = reference.kind === "position"
        ? previous?.importedMesh
        : reference.kind === "shapeId"
          ? savedGeometry.byShapeId.get(reference.source)
          : savedGeometry.byPath.get(reference.source);
      if (
        !isJsonRecord(referencedMesh)
        || isSavedGeometryReference(referencedMesh)
        || (reference.kind === "position" && pair.current.id !== previous?.id)
      ) {
        throw apiError(409, "PROJECT_GEOMETRY_REFERENCE_MISSING", "Saved geometry could not be reused. Retry the full save.");
      }
      pair.current.importedMesh = referencedMesh;
    }

    const currentGrouped = Array.isArray(pair.current.groupedShapes) ? pair.current.groupedShapes : [];
    const previousGrouped = previous && Array.isArray(previous.groupedShapes) ? previous.groupedShapes : [];
    for (let index = 0; index < currentGrouped.length; index += 1) {
      stack.push({
        current: currentGrouped[index],
        previous: previousGrouped[index],
        path: `${pair.path}/groupedShapes/${index}`,
      });
    }

    const currentHistory = Array.isArray(pair.current.edgeTreatmentHistory) ? pair.current.edgeTreatmentHistory : [];
    const previousHistory = previous && Array.isArray(previous.edgeTreatmentHistory) ? previous.edgeTreatmentHistory : [];
    for (let index = 0; index < currentHistory.length; index += 1) {
      const currentEntry = currentHistory[index];
      const previousEntry = previousHistory[index];
      if (isJsonRecord(currentEntry)) {
        stack.push({
          current: currentEntry.before,
          previous: isJsonRecord(previousEntry) ? previousEntry.before : undefined,
          path: `${pair.path}/edgeTreatmentHistory/${index}/before`,
        });
      }
    }
  }
}

async function hydrateSavedProjectGeometry(env: Env, project: ProjectRow, document: Record<string, unknown>) {
  if (!projectUsesSavedGeometryReferences(document)) return;
  const object = await env.PROJECTS.get(project.r2_object_key);
  if (!object || object.size > MAX_PROJECT_BYTES) {
    throw apiError(409, "PROJECT_GEOMETRY_REFERENCE_MISSING", "Saved geometry could not be reused. Retry the full save.");
  }
  let previous: unknown;
  try {
    previous = await object.json<unknown>();
  } catch {
    throw apiError(409, "PROJECT_GEOMETRY_REFERENCE_MISSING", "Saved geometry could not be reused. Retry the full save.");
  }
  if (!isJsonRecord(previous) || !validateProjectDocument(previous).valid) {
    throw apiError(409, "PROJECT_GEOMETRY_REFERENCE_MISSING", "Saved geometry could not be reused. Retry the full save.");
  }
  restoreSavedProjectGeometry(document, previous);
}

function projectThumbnailLegacyKey(userId: string, projectId: string) {
  return `users/${userId}/projects/${projectId}/thumbnail.png`;
}

function projectThumbnailKey(userId: string, projectId: string, projectVersion: number) {
  return `users/${userId}/projects/${projectId}/thumbnails/${projectVersion}-${crypto.randomUUID()}.png`;
}

function requestRateKey(request: Request, scope: string) {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  return `${scope}:${address}`;
}

async function enforceRateLimit(limiter: RateLimit | undefined, key: string) {
  if (!limiter) return;
  const outcome = await limiter.limit({ key });
  if (!outcome.success) throw apiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
}

async function enforceMutationRateLimit(env: Env, userId: string, resource: string) {
  await enforceRateLimit(env.MUTATION_RATE_LIMITER, `user:${userId}:${resource}`);
}

function requireLegalAcceptance(user: UserRow, env: Env) {
  if (!legalAccepted(user, env)) throw apiError(409, "LEGAL_ACCEPTANCE_REQUIRED", "Accept the current legal policies first.");
}

async function requestText(request: Request, maxBytes: number) {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw apiError(400, "INVALID_CONTENT_LENGTH", "The request content length is invalid.");
    }
    if (contentLength > maxBytes) throw apiError(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("request body limit exceeded");
        throw apiError(413, "REQUEST_TOO_LARGE", "The request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function requestJson(request: Request, maxBytes = MAX_PROJECT_BYTES + 1024) {
  const text = await requestText(request, maxBytes);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw apiError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
}

async function requestBytes(request: Request, maxBytes: number) {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) throw apiError(400, "INVALID_CONTENT_LENGTH", "The request content length is invalid.");
    if (contentLength > maxBytes) throw apiError(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel("request body limit exceeded");
        throw apiError(413, "REQUEST_TOO_LARGE", "The request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function getSessionContext(request: Request, env: Env): Promise<SessionContext | null> {
  const secure = isSecureRequest(request);
  const signed = parseCookies(request).get(sessionCookieName(secure));
  if (!signed) return null;
  const token = await verifySignedValue(env.SESSION_SECRET, signed);
  if (!token) return null;
  const idHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT
      sessions.id_hash AS session_id_hash,
      sessions.user_id AS session_user_id,
      sessions.created_at AS session_created_at,
      sessions.expires_at AS session_expires_at,
      sessions.authenticated_at AS session_authenticated_at,
      sessions.last_seen_at AS session_last_seen_at,
      users.*
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.id_hash = ? AND sessions.expires_at > ? AND users.deleted_at IS NULL`,
  )
    .bind(idHash, nowSeconds())
    .first<UserRow & {
      session_id_hash: string;
      session_user_id: string;
      session_created_at: number;
      session_expires_at: number;
      session_authenticated_at: number;
      session_last_seen_at: number;
    }>();
  if (!row) return null;
  const {
    session_id_hash,
    session_user_id,
    session_created_at,
    session_expires_at,
    session_authenticated_at,
    session_last_seen_at,
    ...user
  } = row;
  const session: SessionRow = {
    id_hash: session_id_hash,
    user_id: session_user_id,
    created_at: session_created_at,
    expires_at: session_expires_at,
    authenticated_at: session_authenticated_at,
    last_seen_at: session_last_seen_at,
  };
  let currentUser = user;
  if (
    currentUser.stripe_subscription_id
    && ["active", "trialing"].includes(currentUser.subscription_status ?? "")
    && (currentUser.subscription_period_end ?? 0) <= nowSeconds() + 5 * 60
  ) {
    try {
      const subscription = await stripeRequest<StripeObject>(
        env,
        "GET",
        `/v1/subscriptions/${encodeURIComponent(currentUser.stripe_subscription_id)}`,
      );
      await syncSubscription(env, subscription);
      currentUser = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL")
        .bind(currentUser.id)
        .first<UserRow>() ?? currentUser;
    } catch (error) {
      logEvent("warn", "subscription_reconciliation_failed", {
        userId: currentUser.id,
        code: error instanceof Error ? error.message.slice(0, 120) : "STRIPE_RECONCILIATION_FAILED",
      });
    }
  }
  return { session, user: currentUser };
}

async function requireSession(request: Request, env: Env) {
  const context = await getSessionContext(request, env);
  if (!context) throw apiError(401, "AUTHENTICATION_REQUIRED", "Sign in with Google to continue.");
  return context;
}

async function createSession(env: Env, userId: string, request: Request) {
  const token = randomToken(32);
  const idHash = await sha256(token);
  const now = nowSeconds();
  await env.DB.prepare(
    "INSERT INTO sessions (id_hash, user_id, created_at, expires_at, authenticated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(idHash, userId, now, now + SESSION_TTL_SECONDS, now, now).run();
  const signed = await signValue(env.SESSION_SECRET, token);
  return cookieHeader(sessionCookieName(isSecureRequest(request)), signed, {
    maxAge: SESSION_TTL_SECONDS,
    secure: isSecureRequest(request),
  });
}

function legalAccepted(user: UserRow, env: Env) {
  return Boolean(
    user.legal_accepted_at
      && user.terms_version === env.CURRENT_TERMS_VERSION
      && user.privacy_version === env.CURRENT_PRIVACY_VERSION,
  );
}

async function accountPayload(user: UserRow, env: Env) {
  const entitlement = getEntitlement({
    status: user.subscription_status,
    periodEnd: user.subscription_period_end,
    retentionDeleteEligibleAt: user.retention_delete_eligible_at,
  });
  const deletionRequest = await env.DB.prepare(
    "SELECT status, execute_after FROM account_deletion_requests WHERE user_id = ? AND status <> 'completed' ORDER BY requested_at DESC LIMIT 1",
  ).bind(user.id).first<{ status: string; execute_after: number | null }>();
  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_verified),
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
    legal: {
      accepted: legalAccepted(user, env),
      termsVersion: env.CURRENT_TERMS_VERSION,
      privacyVersion: env.CURRENT_PRIVACY_VERSION,
      termsUrl: env.TERMS_URL,
      privacyUrl: env.PRIVACY_URL,
      refundUrl: env.REFUND_URL,
      retentionUrl: env.RETENTION_URL,
    },
    subscription: {
      status: entitlement.status,
      periodEnd: user.subscription_period_end,
      cancelAtPeriodEnd: Boolean(user.cancel_at_period_end),
      cancelAt: user.subscription_cancel_at,
      retentionDeleteEligibleAt: user.retention_delete_eligible_at,
    },
    entitlement,
    storage: {
      usedBytes: user.storage_used_bytes,
      allocatedBytes: user.storage_allocated_bytes,
      quotaBytes: CLOUD_STORAGE_QUOTA_BYTES,
    },
    projectCount: user.project_count,
    deletionRequestedAt: user.deletion_requested_at,
    deletionRequest: deletionRequest ? {
      status: deletionRequest.status,
      executeAfter: deletionRequest.execute_after,
    } : null,
  };
}

type TurnstileSiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function validateTurnstileToken(
  env: Env,
  token: unknown,
  remoteIp?: string,
  fetcher: typeof fetch = fetch,
) {
  if (typeof token !== "string" || token.length < 1 || token.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    throw apiError(400, "TURNSTILE_TOKEN_REQUIRED", "Complete the human verification before continuing.");
  }
  const secret = requireConfiguration(env.TURNSTILE_SECRET, "", "TURNSTILE_SECRET_NOT_CONFIGURED");
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);
  let response: Response;
  try {
    response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
  } catch {
    throw apiError(503, "TURNSTILE_UNAVAILABLE", "Human verification is temporarily unavailable. Try again.");
  }
  const result = (await response.json().catch(() => null)) as TurnstileSiteverifyResponse | null;
  if (!response.ok || !result) {
    throw apiError(503, "TURNSTILE_UNAVAILABLE", "Human verification is temporarily unavailable. Try again.");
  }
  const expectedHostname = new URL(env.APP_BASE_URL).hostname.toLowerCase();
  if (
    result.success !== true
    || result.hostname?.toLowerCase() !== expectedHostname
    || result.action !== TURNSTILE_ACTION
  ) {
    throw apiError(403, "TURNSTILE_VERIFICATION_FAILED", "Human verification failed. Please try again.");
  }
  return result;
}

function turnstileConfig(env: Env) {
  const siteKey = requireConfiguration(env.TURNSTILE_SITE_KEY, "", "TURNSTILE_SITE_KEY_NOT_CONFIGURED");
  return json({ siteKey, action: TURNSTILE_ACTION });
}

async function startGoogleAuth(request: Request, env: Env) {
  assertSameOrigin(request);
  await enforceRateLimit(env.AUTH_RATE_LIMITER, requestRateKey(request, "google-auth-start"));
  const body = await requestJson(request, 4096);
  await validateTurnstileToken(env, body.turnstileToken, request.headers.get("CF-Connecting-IP") ?? undefined);
  const clientId = requireConfiguration(env.GOOGLE_CLIENT_ID, "STAGING_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID_NOT_CONFIGURED");
  requireConfiguration(env.GOOGLE_CLIENT_SECRET, "", "GOOGLE_CLIENT_SECRET_NOT_CONFIGURED");
  requireConfiguration(env.SESSION_SECRET, "", "SESSION_SECRET_NOT_CONFIGURED");
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const returnTo = safeReturnPath(typeof body.returnTo === "string" ? body.returnTo : null);
  const challenge = await sha256(verifier);
  const oauthValue = await signValue(env.SESSION_SECRET, [state, nonce, verifier, encodeURIComponent(returnTo)].join("|"));
  const callbackUrl = `${env.APP_BASE_URL}/api/cloud/auth/google/callback`;
  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return json({ url: googleUrl.toString() }, 200, {
    "Set-Cookie": cookieHeader(oauthCookieName(isSecureRequest(request)), oauthValue, {
      maxAge: OAUTH_TTL_SECONDS,
      secure: isSecureRequest(request),
    }),
  });
}

async function finishGoogleAuth(request: Request, env: Env) {
  await enforceRateLimit(env.AUTH_RATE_LIMITER, requestRateKey(request, "google-auth-callback"));
  const url = new URL(request.url);
  const secure = isSecureRequest(request);
  const clearOauthCookie = cookieHeader(oauthCookieName(secure), "", { maxAge: 0, secure });
  if (url.searchParams.get("error")) return redirect("/cloud/subscribe?auth=cancelled", { "Set-Cookie": clearOauthCookie });
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const signedState = parseCookies(request).get(oauthCookieName(secure));
  if (!code || !returnedState || !signedState) return redirect("/cloud/subscribe?auth=invalid", { "Set-Cookie": clearOauthCookie });
  const stateValue = await verifySignedValue(env.SESSION_SECRET, signedState);
  const [expectedState, nonce, verifier, encodedReturnTo] = stateValue?.split("|") ?? [];
  if (!expectedState || !nonce || !verifier || !timingSafeEqual(returnedState, expectedState)) {
    return redirect("/cloud/subscribe?auth=invalid", { "Set-Cookie": clearOauthCookie });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.APP_BASE_URL}/api/cloud/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as { id_token?: string } | null;
  if (!tokenResponse.ok || !tokenPayload?.id_token) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
  const claims = await verifyGoogleIdToken(tokenPayload.id_token, env.GOOGLE_CLIENT_ID, nonce);
  const now = nowSeconds();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE google_subject = ?")
    .bind(claims.sub)
    .first<{ id: string }>();
  const userId = existing?.id ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (
      id, google_subject, email, email_verified, display_name, avatar_url, created_at, last_login_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(google_subject) DO UPDATE SET
      email = excluded.email,
      email_verified = excluded.email_verified,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      last_login_at = excluded.last_login_at,
      updated_at = excluded.updated_at`,
  ).bind(
    userId,
    claims.sub,
    claims.email.toLowerCase(),
    claims.email_verified ? 1 : 0,
    claims.name ?? null,
    claims.picture ?? null,
    now,
    now,
    now,
  ).run();
  const sessionCookie = await createSession(env, userId, request);
  const headers = new Headers();
  headers.append("Set-Cookie", clearOauthCookie);
  headers.append("Set-Cookie", sessionCookie);
  return redirect(safeReturnPath(encodedReturnTo ? decodeURIComponent(encodedReturnTo) : null), headers);
}

async function logout(request: Request, env: Env) {
  assertSameOrigin(request);
  const secure = isSecureRequest(request);
  const signed = parseCookies(request).get(sessionCookieName(secure));
  if (signed) {
    const token = await verifySignedValue(env.SESSION_SECRET, signed);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(await sha256(token)).run();
  }
  return json({ ok: true }, 200, {
    "Set-Cookie": cookieHeader(sessionCookieName(secure), "", { maxAge: 0, secure }),
  });
}

async function acceptLegal(request: Request, env: Env) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  await enforceMutationRateLimit(env, user.id, "legal-acceptance");
  const body = await requestJson(request, 4096);
  if (body.acceptTerms !== true || body.confirmPrivacy !== true) {
    throw apiError(400, "LEGAL_ACCEPTANCE_REQUIRED", "Accept the Terms and confirm the Privacy Policy to continue.");
  }
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO legal_acceptances (id, user_id, terms_version, privacy_version, accepted_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), user.id, env.CURRENT_TERMS_VERSION, env.CURRENT_PRIVACY_VERSION, now),
    env.DB.prepare(
      "UPDATE users SET terms_version = ?, privacy_version = ?, legal_accepted_at = ?, updated_at = ? WHERE id = ?",
    ).bind(env.CURRENT_TERMS_VERSION, env.CURRENT_PRIVACY_VERSION, now, now, user.id),
  ]);
  return json({ ok: true });
}

async function ensureStripeCustomer(env: Env, user: UserRow) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripeRequest<StripeObject>(
    env,
    "POST",
    "/v1/customers",
    new URLSearchParams({
      email: user.email,
      name: user.display_name ?? "",
      "metadata[sketchforge_user_id]": user.id,
    }),
    `sketchforge-customer-${user.id}`,
  );
  await env.DB.prepare(
    "UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ? AND stripe_customer_id IS NULL",
  ).bind(customer.id, nowSeconds(), user.id).run();
  const refreshed = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ stripe_customer_id: string | null }>();
  if (!refreshed?.stripe_customer_id) throw new Error("STRIPE_CUSTOMER_LINK_FAILED");
  return refreshed.stripe_customer_id;
}

export function buildStripeCheckoutParams(env: Env, userId: string, customerId: string) {
  const params = new URLSearchParams({
    mode: "subscription",
    customer: customerId,
    client_reference_id: userId,
    "line_items[0][price]": env.STRIPE_PRICE_ID,
    "line_items[0][quantity]": "1",
    success_url: `${env.APP_BASE_URL}/cloud/activating`,
    cancel_url: `${env.APP_BASE_URL}/cloud/subscribe?checkout=cancelled`,
    "metadata[sketchforge_user_id]": userId,
    "subscription_data[metadata][sketchforge_user_id]": userId,
    allow_promotion_codes: "false",
  });
  if (env.APP_ENV === "production") {
    params.set("automatic_tax[enabled]", "true");
    params.set("billing_address_collection", "required");
    params.set("customer_update[address]", "auto");
  }
  return params;
}

async function createCheckout(request: Request, env: Env) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  await enforceMutationRateLimit(env, user.id, "billing-checkout");
  if (!legalAccepted(user, env)) throw apiError(409, "LEGAL_ACCEPTANCE_REQUIRED", "Accept the current legal policies first.");
  assertStripeTestMode(env);
  requireConfiguration(env.STRIPE_PRICE_ID, "STAGING_STRIPE_TEST_PRICE_ID", "STRIPE_PRICE_NOT_CONFIGURED");
  const entitlement = getEntitlement({
    status: user.subscription_status,
    periodEnd: user.subscription_period_end,
    retentionDeleteEligibleAt: user.retention_delete_eligible_at,
  });
  if (entitlement.canWriteProjects) return json({ url: "/cloud" });
  const customerId = await ensureStripeCustomer(env, user);
  const checkout = await stripeRequest<StripeObject & { url?: string }>(
    env,
    "POST",
    "/v1/checkout/sessions",
    buildStripeCheckoutParams(env, user.id, customerId),
    `sketchforge-checkout-${user.id}-${Math.floor(Date.now() / 60000)}`,
  );
  if (!checkout.url) throw new Error("STRIPE_CHECKOUT_URL_MISSING");
  const now = nowSeconds();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO checkout_sessions (session_id, user_id, status, created_at, updated_at) VALUES (?, ?, 'created', COALESCE((SELECT created_at FROM checkout_sessions WHERE session_id = ?), ?), ?)",
  ).bind(checkout.id, user.id, checkout.id, now, now).run();
  return json({ url: checkout.url });
}

async function createPortal(request: Request, env: Env) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  await enforceMutationRateLimit(env, user.id, "billing-portal");
  if (!user.stripe_customer_id) throw apiError(409, "NO_BILLING_ACCOUNT", "No Stripe billing account exists yet.");
  const portal = await stripeRequest<StripeObject & { url?: string }>(
    env,
    "POST",
    "/v1/billing_portal/sessions",
    new URLSearchParams({
      customer: user.stripe_customer_id,
      configuration: env.STRIPE_PORTAL_CONFIGURATION_ID,
      return_url: `${env.APP_BASE_URL}/cloud/account`,
    }),
  );
  if (!portal.url) throw new Error("STRIPE_PORTAL_URL_MISSING");
  return json({ url: portal.url });
}

function stripeSignatureParts(header: string) {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now = nowSeconds()) {
  if (!header || !secret.startsWith("whsec_")) return false;
  const { timestamp, signatures } = stripeSignatureParts(header);
  if (!timestamp || Math.abs(now - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

function nestedSubscriptionId(object: StripeObject) {
  const direct = stripeId(object.subscription);
  if (direct) return direct;
  const candidate = object as StripeObject & {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
  };
  return stripeId(candidate.parent?.subscription_details?.subscription ?? null);
}

export async function findLatestSubscription(env: Env, object: StripeObject) {
  const subscriptionId = object.object === "subscription" ? object.id : nestedSubscriptionId(object);
  if (subscriptionId) return stripeRequest<StripeObject>(env, "GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const customerId = stripeId(object.customer);
  if (!customerId) return null;
  const list = await stripeRequest<{ data?: StripeObject[] }>(
    env,
    "GET",
    `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=1`,
  );
  return list.data?.[0] ?? null;
}

async function syncSubscription(env: Env, subscription: StripeObject) {
  const customerId = stripeId(subscription.customer);
  const metadataUserId = subscription.metadata?.sketchforge_user_id;
  const user = metadataUserId
    ? await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(metadataUserId).first<UserRow>()
    : customerId
      ? await env.DB.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").bind(customerId).first<UserRow>()
      : null;
  if (user?.deleted_at) {
    logEvent("info", "stripe_event_ignored_for_deleted_user", { userId: user.id });
    return;
  }
  if (!user) throw new Error("STRIPE_USER_NOT_FOUND");
  if (customerId && user.stripe_customer_id && customerId !== user.stripe_customer_id) throw new Error("STRIPE_CUSTOMER_MISMATCH");
  const period = subscriptionPeriod(subscription);
  const status = subscription.status ?? "unknown";
  const syncedAt = nowSeconds();
  const endedAt = subscription.ended_at ?? subscription.canceled_at ?? (status === "canceled" ? period.end : null);
  const frozenStatus = ["canceled", "incomplete_expired", "past_due", "unpaid", "paused"].includes(status);
  const retention = frozenStatus
    ? retentionDeadline(period.end, endedAt ?? syncedAt)
    : null;
  await env.DB.prepare(
    `UPDATE users SET
      stripe_customer_id = COALESCE(stripe_customer_id, ?),
      stripe_subscription_id = ?,
      subscription_status = ?,
      subscription_period_start = ?,
      subscription_period_end = ?,
      cancel_at_period_end = ?,
      subscription_cancel_at = ?,
      subscription_ended_at = ?,
      retention_delete_eligible_at = ?,
      updated_at = ?
    WHERE id = ?`,
  ).bind(
    customerId,
    subscription.id,
    status,
    period.start,
    period.end,
    subscription.cancel_at_period_end ? 1 : 0,
    subscription.cancel_at ?? null,
    endedAt,
    retention,
    syncedAt,
    user.id,
  ).run();
}

async function processStripeEvent(env: Env, event: StripeEvent) {
  const object = event.data.object;
  if (event.type === "checkout.session.expired") {
    await env.DB.prepare("UPDATE checkout_sessions SET status = 'expired', updated_at = ? WHERE session_id = ?")
      .bind(nowSeconds(), object.id)
      .run();
    return;
  }
  if (event.type.startsWith("checkout.session.")) {
    await env.DB.prepare("UPDATE checkout_sessions SET status = ?, updated_at = ? WHERE session_id = ?")
      .bind(event.type.split(".").pop() ?? "updated", nowSeconds(), object.id)
      .run();
  }
  const subscription = await findLatestSubscription(env, object);
  if (subscription) await syncSubscription(env, subscription);
}

async function stripeWebhook(request: Request, env: Env) {
  assertStripeTestMode(env);
  await enforceRateLimit(env.AUTH_RATE_LIMITER, requestRateKey(request, "stripe-webhook"));
  const rawBody = await requestText(request, MAX_STRIPE_WEBHOOK_BYTES);
  if (!(await verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    throw apiError(400, "INVALID_STRIPE_SIGNATURE", "Invalid webhook signature.");
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    throw apiError(400, "INVALID_STRIPE_EVENT", "Invalid webhook event.");
  }
  if (!event.id || !event.type || !event.data?.object) throw apiError(400, "INVALID_STRIPE_EVENT", "Invalid webhook event.");
  if (env.APP_ENV === "production" && event.livemode !== true) {
    throw apiError(400, "TEST_EVENT_REJECTED", "Test Stripe events are disabled in production.");
  }
  if (env.APP_ENV !== "production" && event.livemode !== false) {
    throw apiError(400, "LIVE_EVENT_REJECTED", "Live Stripe events are disabled outside production.");
  }

  const now = nowSeconds();
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO stripe_events (event_id, event_type, stripe_created_at, received_at, status) VALUES (?, ?, ?, ?, 'processing')",
  ).bind(event.id, event.type, Number.isSafeInteger(event.created) ? event.created : null, now).run();
  if (inserted.meta.changes !== 1) {
    const existing = await env.DB.prepare("SELECT status, received_at FROM stripe_events WHERE event_id = ?")
      .bind(event.id)
      .first<{ status: string; received_at: number }>();
    if (existing?.status === "processed" || existing?.status === "ignored") {
      return json({ received: true, duplicate: true });
    }
    if (existing?.status === "processing" && existing.received_at >= now - STRIPE_PROCESSING_LEASE_SECONDS) {
      throw apiError(409, "WEBHOOK_EVENT_IN_PROGRESS", "Webhook processing is still in progress; retry later.");
    }
    const claimed = await env.DB.prepare(
      `UPDATE stripe_events
       SET status = 'processing', received_at = ?, error_code = NULL
       WHERE event_id = ?
         AND (status = 'failed' OR (status = 'processing' AND received_at < ?))`,
    ).bind(now, event.id, now - STRIPE_PROCESSING_LEASE_SECONDS).run();
    if (claimed.meta.changes !== 1) {
      throw apiError(409, "WEBHOOK_EVENT_IN_PROGRESS", "Webhook processing is still in progress; retry later.");
    }
  }
  if (!SUPPORTED_WEBHOOK_EVENTS.has(event.type)) {
    await env.DB.prepare("UPDATE stripe_events SET status = 'ignored', processed_at = ? WHERE event_id = ?")
      .bind(nowSeconds(), event.id)
      .run();
    return json({ received: true, ignored: true });
  }

  try {
    await processStripeEvent(env, event);
    await env.DB.prepare("UPDATE stripe_events SET status = 'processed', processed_at = ? WHERE event_id = ?")
      .bind(nowSeconds(), event.id)
      .run();
    return json({ received: true });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 120) : "WEBHOOK_PROCESSING_FAILED";
    await env.DB.prepare("UPDATE stripe_events SET status = 'failed', error_code = ? WHERE event_id = ?")
      .bind(errorCode, event.id)
      .run();
    logEvent("error", "stripe_webhook_failed", { eventType: event.type, errorCode });
    throw apiError(500, "WEBHOOK_PROCESSING_FAILED", "Webhook processing will be retried.");
  }
}

function projectPayload(project: ProjectRow) {
  return {
    id: project.id,
    name: project.name,
    sizeBytes: project.size_bytes,
    formatVersion: project.format_version,
    version: project.version,
    thumbnailVersion: project.thumbnail_updated_at,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

function userEntitlement(user: UserRow) {
  return getEntitlement({
    status: user.subscription_status,
    periodEnd: user.subscription_period_end,
    retentionDeleteEligibleAt: user.retention_delete_eligible_at,
  });
}

async function reconcileStaleStorageReservations(env: Env, userId: string, forceAggregate = false) {
  const staleBefore = nowSeconds() - 10 * 60;
  const stale = await env.DB.prepare(
    "SELECT id, project_id, status, old_object_key, new_object_key FROM storage_reservations WHERE user_id = ? AND status IN ('pending', 'reserved') AND created_at < ? LIMIT 100",
  ).bind(userId, staleBefore).all<{
    id: string;
    project_id: string;
    status: string;
    old_object_key: string | null;
    new_object_key: string | null;
  }>();
  for (const reservation of stale.results) {
    const project = await env.DB.prepare("SELECT r2_object_key, thumbnail_object_key FROM projects WHERE id = ? AND owner_user_id = ?")
      .bind(reservation.project_id, userId)
      .first<{ r2_object_key: string; thumbnail_object_key: string | null }>();
    const committed = Boolean(
      project
      && reservation.new_object_key
      && (project.r2_object_key === reservation.new_object_key || project.thumbnail_object_key === reservation.new_object_key),
    );
    await env.DB.prepare("UPDATE storage_reservations SET status = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'reserved')")
      .bind(committed ? "committed" : "released", nowSeconds(), reservation.id)
      .run();
    const obsoleteKey = committed ? reservation.old_object_key : reservation.new_object_key;
    if (obsoleteKey && obsoleteKey !== project?.r2_object_key && obsoleteKey !== project?.thumbnail_object_key) {
      try {
        await env.PROJECTS.delete(obsoleteKey);
        if (committed) {
          await env.DB.prepare("UPDATE storage_reservations SET old_object_key = NULL, updated_at = ? WHERE id = ?")
            .bind(nowSeconds(), reservation.id)
            .run();
        } else {
          await env.DB.prepare("UPDATE storage_reservations SET new_object_key = NULL, updated_at = ? WHERE id = ?")
            .bind(nowSeconds(), reservation.id)
            .run();
        }
      } catch {
        logEvent("warn", "stale_project_object_cleanup_pending", { projectId: reservation.project_id });
      }
    }
  }

  const committedCleanup = await env.DB.prepare(
    "SELECT id, project_id, old_object_key FROM storage_reservations WHERE user_id = ? AND status = 'committed' AND old_object_key IS NOT NULL LIMIT 100",
  ).bind(userId).all<{ id: string; project_id: string; old_object_key: string }>();
  for (const reservation of committedCleanup.results) {
    const current = await env.DB.prepare("SELECT r2_object_key, thumbnail_object_key FROM projects WHERE id = ? AND owner_user_id = ?")
      .bind(reservation.project_id, userId)
      .first<{ r2_object_key: string; thumbnail_object_key: string | null }>();
    if (reservation.old_object_key === current?.r2_object_key || reservation.old_object_key === current?.thumbnail_object_key) continue;
    try {
      await env.PROJECTS.delete(reservation.old_object_key);
      await env.DB.prepare("UPDATE storage_reservations SET old_object_key = NULL, updated_at = ? WHERE id = ? AND old_object_key = ?")
        .bind(nowSeconds(), reservation.id, reservation.old_object_key)
        .run();
    } catch {
      logEvent("warn", "committed_object_cleanup_pending", { projectId: reservation.project_id });
    }
  }
  const releasedCleanup = await env.DB.prepare(
    "SELECT id, project_id, new_object_key FROM storage_reservations WHERE user_id = ? AND status = 'released' AND new_object_key IS NOT NULL LIMIT 100",
  ).bind(userId).all<{ id: string; project_id: string; new_object_key: string }>();
  for (const reservation of releasedCleanup.results) {
    const current = await env.DB.prepare("SELECT r2_object_key, thumbnail_object_key FROM projects WHERE id = ? AND owner_user_id = ?")
      .bind(reservation.project_id, userId)
      .first<{ r2_object_key: string; thumbnail_object_key: string | null }>();
    if (reservation.new_object_key === current?.r2_object_key || reservation.new_object_key === current?.thumbnail_object_key) continue;
    try {
      await env.PROJECTS.delete(reservation.new_object_key);
      await env.DB.prepare("UPDATE storage_reservations SET new_object_key = NULL, updated_at = ? WHERE id = ? AND new_object_key = ?")
        .bind(nowSeconds(), reservation.id, reservation.new_object_key)
        .run();
    } catch {
      logEvent("warn", "released_object_cleanup_pending", { projectId: reservation.project_id });
    }
  }
  if (!forceAggregate && stale.results.length === 0) return;
  await env.DB.prepare(
    `UPDATE users SET
      storage_used_bytes = COALESCE((SELECT SUM(size_bytes + thumbnail_size_bytes) FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL), 0),
      project_count = (SELECT COUNT(*) FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL),
      updated_at = ?
    WHERE id = ?
      AND NOT EXISTS (
        SELECT 1 FROM storage_reservations
        WHERE user_id = ? AND status IN ('pending', 'reserved')
      )`,
  ).bind(userId, userId, nowSeconds(), userId, userId).run();
}

async function deleteProjectObjectSet(env: Env, project: Pick<ProjectRow, "id" | "owner_user_id" | "r2_object_key" | "thumbnail_object_key">) {
  const directKeys = new Set<string>([project.r2_object_key, projectThumbnailLegacyKey(project.owner_user_id, project.id)]);
  if (project.thumbnail_object_key) directKeys.add(project.thumbnail_object_key);
  await env.PROJECTS.delete([...directKeys]);

  // A project can have older package/thumbnail objects awaiting reservation cleanup.
  // Delete everything below the server-owned project prefix so a successful project
  // deletion cannot leave private project bytes behind in R2.
  const prefix = `users/${project.owner_user_id}/projects/${project.id}/`;
  while (true) {
    const page = await env.PROJECTS.list({ prefix, limit: 1000 });
    if (!page.objects.length) break;
    await env.PROJECTS.delete(page.objects.map((object) => object.key));
  }
}

async function hardDeleteProjectMetadata(env: Env, project: Pick<ProjectRow, "id" | "owner_user_id">) {
  try {
    const removed = await env.DB.prepare(
      "DELETE FROM projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NOT NULL",
    ).bind(project.id, project.owner_user_id).run();
    if (removed.meta.changes === 1) return;
  } catch (error) {
    const remaining = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?")
      .bind(project.id, project.owner_user_id)
      .first<{ id: string }>();
    if (!remaining) return;
    throw error;
  }

  const remaining = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?")
    .bind(project.id, project.owner_user_id)
    .first<{ id: string }>();
  if (remaining) throw new Error("PROJECT_DATABASE_DELETE_INCOMPLETE");
}

async function retryDeletedProjectObjectsForUser(env: Env, userId: string) {
  const projects = await env.DB.prepare(
    "SELECT * FROM projects WHERE owner_user_id = ? AND deleted_at IS NOT NULL AND object_deletion_status IN ('pending', 'retry_required') LIMIT 100",
  ).bind(userId).all<ProjectRow>();
  for (const project of projects.results) {
    try {
      await deleteProjectObjectSet(env, project);
      await hardDeleteProjectMetadata(env, project);
    } catch {
      await env.DB.prepare("UPDATE projects SET object_deletion_status = 'retry_required' WHERE id = ? AND deleted_at IS NOT NULL")
        .bind(project.id)
        .run();
    }
  }
}

async function listProjects(request: Request, env: Env) {
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  const entitlement = userEntitlement(user);
  if (!entitlement.canReadProjects && !entitlement.canWriteProjects) {
    throw apiError(402, "SUBSCRIPTION_REQUIRED", "A current subscription or retention access is required.");
  }
  await reconcileStaleStorageReservations(env, user.id);
  await retryDeletedProjectObjectsForUser(env, user.id);
  const result = await env.DB.prepare(
    "SELECT * FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200",
  ).bind(user.id).all<ProjectRow>();
  return json({ projects: result.results.map(projectPayload), readOnly: !entitlement.canWriteProjects });
}

async function releaseStorageReservation(
  env: Env,
  userId: string,
  reservationId: string,
  byteDelta: number,
  projectCountDelta = 0,
) {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?), project_count = MAX(0, project_count - ?), updated_at = ? WHERE id = ?",
    ).bind(byteDelta, projectCountDelta, nowSeconds(), userId),
    env.DB.prepare("UPDATE storage_reservations SET status = 'released', updated_at = ? WHERE id = ? AND status IN ('pending', 'reserved')")
      .bind(nowSeconds(), reservationId),
  ]);
}

async function finalizeStorageReservation(env: Env, reservationId: string, projectId: string, oldObjectKey: string | null) {
  try {
    await env.DB.prepare("UPDATE storage_reservations SET status = 'committed', updated_at = ? WHERE id = ? AND status IN ('pending', 'reserved')")
      .bind(nowSeconds(), reservationId)
      .run();
  } catch {
    logEvent("warn", "reservation_commit_bookkeeping_pending", { projectId });
  }
  if (!oldObjectKey) return;
  try {
    await env.PROJECTS.delete(oldObjectKey);
    await env.DB.prepare("UPDATE storage_reservations SET status = 'committed', old_object_key = NULL, updated_at = ? WHERE id = ?")
      .bind(nowSeconds(), reservationId)
      .run();
  } catch {
    logEvent("warn", "old_project_object_cleanup_pending", { projectId });
  }
}

async function createProject(request: Request, env: Env) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  await enforceMutationRateLimit(env, user.id, "project-create");
  if (!userEntitlement(user).canWriteProjects) throw apiError(402, "WRITE_ENTITLEMENT_REQUIRED", "Cloud saving requires an active subscription.");
  const body = await requestJson(request, 4096);
  const id = crypto.randomUUID();
  const now = nowSeconds();
  const name = normalizeProjectName(body.name);
  const bytes = createEmptySkfProject(id, name, now);
  const objectKey = `users/${user.id}/projects/${id}/${crypto.randomUUID()}.skf`;
  const reservationId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO storage_reservations (id, user_id, project_id, byte_delta, status, created_at, updated_at, old_object_key, new_object_key, expected_project_version) VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, ?, 0)",
  ).bind(reservationId, user.id, id, bytes.byteLength, now, now, objectKey).run();
  const quota = await env.DB.prepare(
    `UPDATE users SET
      storage_used_bytes = storage_used_bytes + ?,
      storage_allocated_bytes = MIN(?, MAX(storage_allocated_bytes, (CAST((storage_used_bytes + ? + ?) / ? AS INTEGER) + 1) * ?)),
      project_count = project_count + 1,
      updated_at = ?
    WHERE id = ? AND storage_used_bytes + ? <= ? AND project_count < ?`,
  ).bind(
    bytes.byteLength,
    CLOUD_STORAGE_QUOTA_BYTES,
    bytes.byteLength,
    CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    now,
    user.id,
    bytes.byteLength,
    CLOUD_STORAGE_QUOTA_BYTES,
    MAX_PROJECTS_PER_USER,
  ).run();
  if (quota.meta.changes !== 1) {
    await env.DB.prepare("UPDATE storage_reservations SET status = 'released', updated_at = ? WHERE id = ?")
      .bind(nowSeconds(), reservationId)
      .run();
    const counters = await env.DB.prepare("SELECT project_count FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ project_count: number }>();
    if ((counters?.project_count ?? MAX_PROJECTS_PER_USER) >= MAX_PROJECTS_PER_USER) {
      throw apiError(409, "PROJECT_LIMIT_REACHED", `An account may have at most ${MAX_PROJECTS_PER_USER} active projects.`);
    }
    throw apiError(413, "STORAGE_QUOTA_EXCEEDED", "The 20 GB storage quota would be exceeded.");
  }
  await env.DB.prepare("UPDATE storage_reservations SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(nowSeconds(), reservationId)
    .run();
  try {
    await env.PROJECTS.put(objectKey, bytes, { httpMetadata: { contentType: SKF_MEDIA_TYPE } });
  } catch (error) {
    await releaseStorageReservation(env, user.id, reservationId, bytes.byteLength, 1);
    throw error;
  }
  try {
    await env.DB.prepare(
      "INSERT INTO projects (id, owner_user_id, name, r2_object_key, size_bytes, format_version, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)",
    ).bind(id, user.id, name, objectKey, bytes.byteLength, now, now).run();
  } catch (error) {
    await releaseStorageReservation(env, user.id, reservationId, bytes.byteLength, 1);
    await env.PROJECTS.delete(objectKey);
    throw error;
  }
  await finalizeStorageReservation(env, reservationId, id, null);
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id = ? AND owner_user_id = ?")
    .bind(id, user.id)
    .first<ProjectRow>();
  return json({ project: projectPayload(project!) }, 201);
}

async function ownedProject(env: Env, userId: string, projectId: string) {
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL")
    .bind(projectId, userId)
    .first<ProjectRow>();
  if (!project) throw apiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  return project;
}

async function loadProject(request: Request, env: Env, projectId: string, download = false) {
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  const entitlement = userEntitlement(user);
  if (!entitlement.canReadProjects && !entitlement.canWriteProjects) throw apiError(402, "READ_ENTITLEMENT_REQUIRED", "Project access is unavailable.");
  if (download && !entitlement.canExport) throw apiError(402, "EXPORT_ENTITLEMENT_REQUIRED", "Project export is unavailable.");
  const project = await ownedProject(env, user.id, projectId);
  const object = await env.PROJECTS.get(project.r2_object_key);
  if (!object) throw apiError(503, "PROJECT_OBJECT_MISSING", "The project file is temporarily unavailable.");
  const isSkf = project.r2_object_key.toLowerCase().endsWith(".skf") || object.httpMetadata?.contentType === SKF_MEDIA_TYPE;
  const contentType = isSkf ? SKF_MEDIA_TYPE : "application/json; charset=utf-8";
  if (download) {
    const filename = normalizeProjectName(project.name).replace(/[^a-z0-9_.-]+/gi, "-");
    return new Response(object.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename || "sketchforge-project"}.${isSkf ? "skf" : "sketchforge.json"}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-SketchForge-Project-Format": isSkf ? "skf" : "legacy-json",
      },
    });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "X-SketchForge-Project-Version": String(project.version),
      "X-SketchForge-Project-Format": isSkf ? "skf" : "legacy-json",
    },
  });
}

async function loadProjectThumbnail(request: Request, env: Env, projectId: string) {
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  const entitlement = userEntitlement(user);
  if (!entitlement.canReadProjects && !entitlement.canWriteProjects) {
    throw apiError(402, "READ_ENTITLEMENT_REQUIRED", "Project access is unavailable.");
  }
  const project = await ownedProject(env, user.id, projectId);
  if (!project.thumbnail_object_key) throw apiError(404, "PROJECT_THUMBNAIL_NOT_FOUND", "This project does not have a preview yet.");
  const object = await env.PROJECTS.get(project.thumbnail_object_key);
  if (!object) throw apiError(404, "PROJECT_THUMBNAIL_NOT_FOUND", "This project does not have a preview yet.");
  const requestedVersion = new URL(request.url).searchParams.get("v");
  const immutableVersion = requestedVersion !== null && requestedVersion === String(project.thumbnail_updated_at);
  const headers = new Headers({
    "Cache-Control": immutableVersion ? "private, max-age=31536000, immutable" : "private, no-cache",
    "Content-Type": "image/png",
    "ETag": object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.headers.get("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}

async function saveProjectThumbnail(request: Request, env: Env, projectId: string) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  await enforceMutationRateLimit(env, user.id, `project-thumbnail:${projectId}`);
  if (!userEntitlement(user).canWriteProjects) {
    throw apiError(402, "WRITE_ENTITLEMENT_REQUIRED", "Updating a project preview requires an active subscription.");
  }
  const project = await ownedProject(env, user.id, projectId);
  const body = await requestJson(request, MAX_THUMBNAIL_REQUEST_BYTES);
  if (typeof body.dataUrl !== "string") throw apiError(400, "INVALID_THUMBNAIL", "The project preview is invalid.");
  const byteLength = thumbnailByteLength(body.dataUrl);
  if (byteLength !== null && byteLength > MAX_THUMBNAIL_BYTES) {
    throw apiError(413, "THUMBNAIL_TOO_LARGE", "A project preview may not exceed 5 MB.");
  }
  const bytes = thumbnailBytesFromDataUrl(body.dataUrl);
  if (!bytes) throw apiError(400, "INVALID_THUMBNAIL", "The project preview must be a valid PNG image.");
  const dimensions = thumbnailPngDimensions(bytes);
  if (!dimensions) throw apiError(400, "INVALID_THUMBNAIL", "The project preview has invalid PNG dimensions or structure.");
  if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1) {
    throw apiError(400, "EXPECTED_VERSION_REQUIRED", "The project version is required when saving a preview.");
  }
  if (body.expectedVersion !== project.version) {
    throw apiError(409, "PROJECT_VERSION_CONFLICT", "This project changed before its preview was saved.");
  }
  const objectKey = projectThumbnailKey(user.id, projectId, project.version);
  const version = Math.max(Date.now(), (project.thumbnail_updated_at ?? 0) + 1);
  const byteDelta = bytes.byteLength - project.thumbnail_size_bytes;
  const reservationId = crypto.randomUUID();
  const now = nowSeconds();
  await env.DB.prepare(
    "INSERT INTO storage_reservations (id, user_id, project_id, byte_delta, status, created_at, updated_at, old_object_key, new_object_key, expected_project_version) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
  ).bind(
    reservationId,
    user.id,
    project.id,
    byteDelta,
    now,
    now,
    project.thumbnail_object_key,
    objectKey,
    project.version,
  ).run();
  const quota = await env.DB.prepare(
    `UPDATE users SET
      storage_used_bytes = storage_used_bytes + ?,
      storage_allocated_bytes = MIN(?, MAX(storage_allocated_bytes, (CAST((storage_used_bytes + ? + ?) / ? AS INTEGER) + 1) * ?)),
      updated_at = ?
    WHERE id = ? AND storage_used_bytes + ? BETWEEN 0 AND ?`,
  ).bind(
    byteDelta,
    CLOUD_STORAGE_QUOTA_BYTES,
    byteDelta,
    CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    now,
    user.id,
    byteDelta,
    CLOUD_STORAGE_QUOTA_BYTES,
  ).run();
  if (quota.meta.changes !== 1) {
    await env.DB.prepare("UPDATE storage_reservations SET status = 'released', updated_at = ? WHERE id = ?")
      .bind(nowSeconds(), reservationId)
      .run();
    throw apiError(413, "STORAGE_QUOTA_EXCEEDED", "The 20 GB storage quota would be exceeded.");
  }
  await env.DB.prepare("UPDATE storage_reservations SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(nowSeconds(), reservationId)
    .run();
  try {
    await env.PROJECTS.put(objectKey, bytes, {
      httpMetadata: { contentType: "image/png" },
      customMetadata: { projectId, width: String(dimensions.width), height: String(dimensions.height) },
    });
  } catch (error) {
    await releaseStorageReservation(env, user.id, reservationId, byteDelta);
    throw error;
  }
  const updated = await env.DB.prepare(
    `UPDATE projects
     SET thumbnail_object_key = ?, thumbnail_updated_at = ?, thumbnail_size_bytes = ?
     WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL AND version = ?
       AND thumbnail_object_key IS ? AND thumbnail_updated_at IS ?`,
  ).bind(
    objectKey,
    version,
    bytes.byteLength,
    projectId,
    user.id,
    project.version,
    project.thumbnail_object_key,
    project.thumbnail_updated_at,
  ).run();
  if (updated.meta.changes !== 1) {
    await releaseStorageReservation(env, user.id, reservationId, byteDelta);
    await env.PROJECTS.delete(objectKey);
    throw apiError(409, "PROJECT_VERSION_CONFLICT", "This project changed before its preview was saved.");
  }
  await finalizeStorageReservation(env, reservationId, project.id, project.thumbnail_object_key);
  return json({ ok: true, version, sizeBytes: bytes.byteLength });
}

async function saveProject(request: Request, env: Env, projectId: string) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  await enforceMutationRateLimit(env, user.id, `project-save:${projectId}`);
  if (!userEntitlement(user).canWriteProjects) throw apiError(402, "WRITE_ENTITLEMENT_REQUIRED", "Cloud saving requires an active subscription.");
  const project = await ownedProject(env, user.id, projectId);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== SKF_MEDIA_TYPE) throw apiError(415, "SKF_CONTENT_TYPE_REQUIRED", "Cloud projects must be uploaded as .skf packages.");
  const expectedVersion = Number(request.headers.get("x-sketchforge-expected-version"));
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion !== project.version) {
    throw apiError(409, "PROJECT_VERSION_CONFLICT", "This project changed on another device. Reload before saving.");
  }
  const bytes = await requestBytes(request, MAX_PROJECT_BYTES);
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw apiError(413, "PROJECT_TOO_LARGE", "A project file may not exceed 8 MB.");
  const validation = await validateSkfProject(bytes);
  if (!validation.valid) throw apiError(400, "INVALID_PROJECT_FORMAT", `The .skf package is invalid (${validation.reason}).`);
  const objectKey = `users/${user.id}/projects/${project.id}/${crypto.randomUUID()}.skf`;
  const reservationId = crypto.randomUUID();
  const byteDelta = bytes.byteLength - project.size_bytes;
  const now = nowSeconds();
  await env.DB.prepare(
    "INSERT INTO storage_reservations (id, user_id, project_id, byte_delta, status, created_at, updated_at, old_object_key, new_object_key, expected_project_version) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
  ).bind(reservationId, user.id, project.id, byteDelta, now, now, project.r2_object_key, objectKey, expectedVersion).run();
  const quota = await env.DB.prepare(
    `UPDATE users SET
      storage_used_bytes = storage_used_bytes + ?,
      storage_allocated_bytes = MIN(?, MAX(storage_allocated_bytes, (CAST((storage_used_bytes + ? + ?) / ? AS INTEGER) + 1) * ?)),
      updated_at = ?
    WHERE id = ? AND storage_used_bytes + ? BETWEEN 0 AND ?`,
  ).bind(
    byteDelta,
    CLOUD_STORAGE_QUOTA_BYTES,
    byteDelta,
    CLOUD_STORAGE_GROWTH_THRESHOLD_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    CLOUD_STORAGE_ALLOCATION_STEP_BYTES,
    now,
    user.id,
    byteDelta,
    CLOUD_STORAGE_QUOTA_BYTES,
  ).run();
  if (quota.meta.changes !== 1) {
    await env.DB.prepare("UPDATE storage_reservations SET status = 'released', updated_at = ? WHERE id = ?")
      .bind(nowSeconds(), reservationId)
      .run();
    throw apiError(413, "STORAGE_QUOTA_EXCEEDED", "The 20 GB storage quota would be exceeded.");
  }
  await env.DB.prepare("UPDATE storage_reservations SET status = 'reserved', updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(nowSeconds(), reservationId)
    .run();
  try {
    await env.PROJECTS.put(objectKey, bytes, { httpMetadata: { contentType: SKF_MEDIA_TYPE } });
  } catch (error) {
    await releaseStorageReservation(env, user.id, reservationId, byteDelta);
    throw error;
  }
  const updated = await env.DB.prepare(
    "UPDATE projects SET r2_object_key = ?, size_bytes = ?, version = version + 1, updated_at = ? WHERE id = ? AND owner_user_id = ? AND version = ? AND deleted_at IS NULL",
  ).bind(objectKey, bytes.byteLength, now, project.id, user.id, expectedVersion).run();
  if (updated.meta.changes !== 1) {
    await releaseStorageReservation(env, user.id, reservationId, byteDelta);
    await env.PROJECTS.delete(objectKey);
    throw apiError(409, "PROJECT_VERSION_CONFLICT", "This project changed on another device. Reload before saving.");
  }
  await finalizeStorageReservation(env, reservationId, project.id, project.r2_object_key);
  return json({ ok: true, version: expectedVersion + 1, sizeBytes: bytes.byteLength });
}

async function renameProject(request: Request, env: Env, projectId: string) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  await enforceMutationRateLimit(env, user.id, `project-rename:${projectId}`);
  if (!userEntitlement(user).canWriteProjects) throw apiError(402, "WRITE_ENTITLEMENT_REQUIRED", "Renaming requires an active subscription.");
  await ownedProject(env, user.id, projectId);
  const body = await requestJson(request, 4096);
  const name = normalizeProjectName(body.name);
  const renamed = await env.DB.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL")
    .bind(name, nowSeconds(), projectId, user.id)
    .run();
  if (renamed.meta.changes !== 1) {
    throw apiError(409, "PROJECT_RENAME_CONFLICT", "The project changed before it could be renamed. Try again.");
  }
  return json({ ok: true, name });
}

async function deleteProject(request: Request, env: Env, projectId: string) {
  assertSameOrigin(request);
  const { user } = await requireSession(request, env);
  requireLegalAcceptance(user, env);
  await enforceMutationRateLimit(env, user.id, `project-delete:${projectId}`);
  if (!userEntitlement(user).canWriteProjects) throw apiError(402, "WRITE_ENTITLEMENT_REQUIRED", "Deleting projects requires an active subscription.");
  const now = nowSeconds();
  let project: ProjectRow | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = await ownedProject(env, user.id, projectId);
    const deleted = await env.DB.prepare(
      `UPDATE projects
       SET deleted_at = ?, object_deletion_status = 'pending', updated_at = ?, version = version + 1
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL AND version = ?
         AND thumbnail_object_key IS ? AND thumbnail_updated_at IS ?`,
    ).bind(
      now,
      now,
      candidate.id,
      user.id,
      candidate.version,
      candidate.thumbnail_object_key,
      candidate.thumbnail_updated_at,
    ).run();
    if (deleted.meta.changes === 1) {
      project = candidate;
      break;
    }
  }
  if (!project) throw apiError(409, "PROJECT_VERSION_CONFLICT", "This project changed before it could be deleted. Try again.");
  try {
    await env.DB.prepare(
      "UPDATE users SET storage_used_bytes = MAX(0, storage_used_bytes - ?), project_count = MAX(0, project_count - 1), updated_at = ? WHERE id = ?",
    ).bind(project.size_bytes + project.thumbnail_size_bytes, now, user.id).run();
  } catch {
    logEvent("warn", "deleted_project_counter_reconciliation_pending", { projectId: project.id });
  }
  try {
    await deleteProjectObjectSet(env, project);
    await hardDeleteProjectMetadata(env, project);
  } catch (error) {
    await env.DB.prepare("UPDATE projects SET object_deletion_status = 'retry_required' WHERE id = ?").bind(project.id).run();
    logEvent("error", "project_deletion_incomplete", {
      projectId: project.id,
      code: error instanceof Error ? error.message.slice(0, 120) : "PROJECT_DELETION_INCOMPLETE",
    });
    throw apiError(503, "PROJECT_DELETION_INCOMPLETE", "The project deletion could not be completed. Please try again.");
  }
  return json({ ok: true, databaseDeleted: true, objectsDeleted: true });
}

async function exportAccount(request: Request, env: Env) {
  const { user } = await requireSession(request, env);
  const projects = await env.DB.prepare(
    "SELECT * FROM projects WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?",
  ).bind(user.id, MAX_PROJECTS_PER_USER).all<ProjectRow>();
  const origin = new URL(request.url).origin;
  return json({
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
      legalAcceptedAt: user.legal_accepted_at,
      termsVersion: user.terms_version,
      privacyVersion: user.privacy_version,
      subscriptionStatus: user.subscription_status,
      subscriptionPeriodEnd: user.subscription_period_end,
      storageUsedBytes: user.storage_used_bytes,
      storageAllocatedBytes: user.storage_allocated_bytes,
      storageQuotaBytes: CLOUD_STORAGE_QUOTA_BYTES,
    },
    projects: projects.results.map((project) => ({
      ...projectPayload(project),
      downloadUrl: `${origin}/api/cloud/projects/${project.id}/export`,
    })),
    projectLimit: MAX_PROJECTS_PER_USER,
    truncated: user.project_count > projects.results.length,
  });
}

async function requestAccountDeletion(request: Request, env: Env) {
  assertSameOrigin(request);
  const { session, user } = await requireSession(request, env);
  await enforceMutationRateLimit(env, user.id, "account-deletion-request");
  if (nowSeconds() - session.authenticated_at > 10 * 60) {
    throw apiError(403, "RECENT_AUTHENTICATION_REQUIRED", "Sign out and sign in again before requesting deletion.");
  }
  const body = await requestJson(request, 4096);
  if (body.confirmation !== "DELETE" || typeof body.email !== "string" || body.email.toLowerCase() !== user.email.toLowerCase()) {
    throw apiError(400, "DELETION_CONFIRMATION_REQUIRED", "Type DELETE and your account email to confirm.");
  }
  const existingRequest = await env.DB.prepare(
    "SELECT id, status, execute_after FROM account_deletion_requests WHERE user_id = ? AND status <> 'completed' ORDER BY requested_at DESC LIMIT 1",
  ).bind(user.id).first<{ id: string; status: string; execute_after: number | null }>();
  const now = nowSeconds();
  const responseStatus = existingRequest?.status === "processing" ? "processing" : "approved";
  const requestStatement = existingRequest
    ? existingRequest.status === "processing"
      ? env.DB.prepare("UPDATE account_deletion_requests SET execute_after = ? WHERE id = ? AND status = 'processing'")
        .bind(now, existingRequest.id)
      : env.DB.prepare(
        "UPDATE account_deletion_requests SET status = 'approved', execute_after = ?, last_error_code = NULL WHERE id = ? AND status IN ('requested', 'cancel_scheduled', 'approved', 'failed')",
      ).bind(now, existingRequest.id)
    : env.DB.prepare(
      "INSERT INTO account_deletion_requests (id, user_id, requested_at, status, execute_after) VALUES (?, ?, ?, 'approved', ?)",
    ).bind(crypto.randomUUID(), user.id, now, now);
  await env.DB.batch([
    requestStatement,
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare(
      `UPDATE users SET
        google_subject = 'deleted:' || id,
        email = 'deleted+' || id || '@deleted.invalid',
        email_verified = 0,
        display_name = NULL,
        avatar_url = NULL,
        deletion_requested_at = COALESCE(deletion_requested_at, ?),
        deleted_at = COALESCE(deleted_at, ?),
        updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`,
    ).bind(now, now, now, user.id),
  ]);
  return json({ ok: true, status: responseStatus, executeAfter: now }, 202, {
    "Set-Cookie": cookieHeader(sessionCookieName(isSecureRequest(request)), "", {
      maxAge: 0,
      secure: isSecureRequest(request),
    }),
  });
}

async function pruneMaintenanceRows(env: Env) {
  const now = nowSeconds();
  const reservations = await env.DB.prepare(
    `SELECT id FROM storage_reservations
     WHERE updated_at < ? AND ((status = 'released' AND new_object_key IS NULL) OR (status = 'committed' AND old_object_key IS NULL))
     LIMIT ?`,
  ).bind(now - 30 * 24 * 60 * 60, MAINTENANCE_BATCH_SIZE).all<{ id: string }>();
  const stripeEvents = await env.DB.prepare(
    "SELECT event_id FROM stripe_events WHERE received_at < ? AND status IN ('processed', 'ignored') LIMIT ?",
  ).bind(now - 90 * 24 * 60 * 60, MAINTENANCE_BATCH_SIZE).all<{ event_id: string }>();
  const sessions = await env.DB.prepare("SELECT id_hash FROM sessions WHERE expires_at <= ? LIMIT ?")
    .bind(now, MAINTENANCE_BATCH_SIZE)
    .all<{ id_hash: string }>();
  const statements: D1PreparedStatement[] = [];
  for (const row of reservations.results) statements.push(env.DB.prepare("DELETE FROM storage_reservations WHERE id = ?").bind(row.id));
  for (const row of stripeEvents.results) statements.push(env.DB.prepare("DELETE FROM stripe_events WHERE event_id = ?").bind(row.event_id));
  for (const row of sessions.results) statements.push(env.DB.prepare("DELETE FROM sessions WHERE id_hash = ? AND expires_at <= ?").bind(row.id_hash, now));
  if (statements.length) await env.DB.batch(statements);
  return statements.length;
}

async function deleteAllAccountProjectObjects(env: Env, userId: string) {
  let afterId = "";
  while (true) {
    const projects = await env.DB.prepare(
      "SELECT * FROM projects WHERE owner_user_id = ? AND id > ? ORDER BY id LIMIT ?",
    ).bind(userId, afterId, MAINTENANCE_BATCH_SIZE).all<ProjectRow>();
    if (!projects.results.length) break;
    for (const project of projects.results) await deleteProjectObjectSet(env, project);
    afterId = projects.results.at(-1)!.id;
  }
  let afterReservationId = "";
  while (true) {
    const reservations = await env.DB.prepare(
      "SELECT id, old_object_key, new_object_key FROM storage_reservations WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?",
    ).bind(userId, afterReservationId, MAINTENANCE_BATCH_SIZE).all<{
      id: string;
      old_object_key: string | null;
      new_object_key: string | null;
    }>();
    if (!reservations.results.length) break;
    const keys = new Set<string>();
    for (const reservation of reservations.results) {
      if (reservation.old_object_key) keys.add(reservation.old_object_key);
      if (reservation.new_object_key) keys.add(reservation.new_object_key);
    }
    if (keys.size) await env.PROJECTS.delete([...keys]);
    afterReservationId = reservations.results.at(-1)!.id;
  }
  while (true) {
    const page = await env.PROJECTS.list({ prefix: `users/${userId}/`, limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (!keys.length) break;
    await env.PROJECTS.delete(keys);
  }
}

async function deleteStripeCustomer(env: Env, customerId: string) {
  try {
    const result = await stripeRequest<StripeObject & { deleted?: boolean }>(
      env,
      "DELETE",
      `/v1/customers/${encodeURIComponent(customerId)}`,
    );
    if (result.deleted !== true) throw new Error("STRIPE_CUSTOMER_DELETE_NOT_CONFIRMED");
  } catch (error) {
    if (error instanceof Error && error.message === "STRIPE_resource_missing") return;
    throw error;
  }
}

export async function processApprovedAccountDeletions(env: Env) {
  if (env.ACCOUNT_DELETION_PROCESSING_ENABLED !== "true") return { enabled: false, processed: 0 };
  const now = nowSeconds();
  const requests = await env.DB.prepare(
    `SELECT id, user_id FROM account_deletion_requests
     WHERE status IN ('approved', 'failed') AND (execute_after IS NULL OR execute_after <= ?)
     ORDER BY requested_at LIMIT 10`,
  ).bind(now).all<{ id: string; user_id: string }>();
  let processed = 0;
  for (const deletion of requests.results) {
    const claimed = await env.DB.prepare(
      "UPDATE account_deletion_requests SET status = 'processing', last_error_code = NULL WHERE id = ? AND status IN ('approved', 'failed')",
    ).bind(deletion.id).run();
    if (claimed.meta.changes !== 1) continue;
    try {
      const user = await env.DB.prepare("SELECT stripe_customer_id FROM users WHERE id = ?")
        .bind(deletion.user_id)
        .first<{ stripe_customer_id: string | null }>();
      if (user?.stripe_customer_id) {
        await deleteStripeCustomer(env, user.stripe_customer_id);
        await env.DB.prepare(
          `UPDATE users SET
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            subscription_status = NULL,
            subscription_period_start = NULL,
            subscription_period_end = NULL,
            cancel_at_period_end = 0,
            subscription_cancel_at = NULL,
            subscription_ended_at = NULL,
            retention_delete_eligible_at = NULL,
            updated_at = ?
          WHERE id = ?`,
        ).bind(now, deletion.user_id).run();
      }
      await deleteAllAccountProjectObjects(env, deletion.user_id);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(deletion.user_id),
        env.DB.prepare("DELETE FROM legal_acceptances WHERE user_id = ?").bind(deletion.user_id),
        env.DB.prepare("DELETE FROM checkout_sessions WHERE user_id = ?").bind(deletion.user_id),
        env.DB.prepare("DELETE FROM storage_reservations WHERE user_id = ?").bind(deletion.user_id),
        env.DB.prepare(
          `UPDATE projects SET
            name = 'Deleted project',
            r2_object_key = 'deleted/' || id,
            size_bytes = 0,
            thumbnail_object_key = NULL,
            thumbnail_updated_at = NULL,
            thumbnail_size_bytes = 0,
            deleted_at = COALESCE(deleted_at, ?),
            object_deletion_status = 'deleted',
            updated_at = ?
          WHERE owner_user_id = ?`,
        ).bind(now, now, deletion.user_id),
        env.DB.prepare(
          `UPDATE users SET
            google_subject = 'deleted:' || id,
            email = 'deleted+' || id || '@deleted.invalid',
            email_verified = 0,
            display_name = NULL,
            avatar_url = NULL,
            terms_version = NULL,
            privacy_version = NULL,
            legal_accepted_at = NULL,
            stripe_customer_id = NULL,
            stripe_subscription_id = NULL,
            subscription_status = NULL,
            subscription_period_start = NULL,
            subscription_period_end = NULL,
            cancel_at_period_end = 0,
            subscription_cancel_at = NULL,
            subscription_ended_at = NULL,
            retention_delete_eligible_at = NULL,
            storage_used_bytes = 0,
            storage_allocated_bytes = 1073741824,
            project_count = 0,
            deleted_at = ?,
            updated_at = ?
          WHERE id = ?`,
        ).bind(now, now, deletion.user_id),
        env.DB.prepare(
          "UPDATE account_deletion_requests SET status = 'completed', last_error_code = NULL WHERE id = ? AND status = 'processing'",
        ).bind(deletion.id),
      ]);
      processed += 1;
    } catch (error) {
      const errorCode = error instanceof Error ? error.message.slice(0, 120) : "ACCOUNT_DELETION_FAILED";
      await env.DB.prepare(
        "UPDATE account_deletion_requests SET status = 'failed', last_error_code = ? WHERE id = ? AND status = 'processing'",
      ).bind(errorCode, deletion.id).run();
      logEvent("error", "account_deletion_failed", { deletionRequestId: deletion.id, errorCode });
    }
  }
  return { enabled: true, processed };
}

export async function runMaintenance(env: Env) {
  const userIds = await env.DB.prepare(
    `SELECT DISTINCT user_id FROM storage_reservations
     WHERE status IN ('pending', 'reserved')
        OR (status = 'committed' AND old_object_key IS NOT NULL)
        OR (status = 'released' AND new_object_key IS NOT NULL)
     UNION
     SELECT DISTINCT owner_user_id AS user_id FROM projects
     WHERE deleted_at IS NOT NULL AND object_deletion_status IN ('pending', 'retry_required')
     LIMIT ?`,
  ).bind(MAINTENANCE_BATCH_SIZE).all<{ user_id: string }>();
  for (const { user_id: userId } of userIds.results) {
    await reconcileStaleStorageReservations(env, userId, true);
    await retryDeletedProjectObjectsForUser(env, userId);
  }
  const pruned = await pruneMaintenanceRows(env);
  const accountDeletion = await processApprovedAccountDeletions(env);
  return { usersReconciled: userIds.results.length, pruned, accountDeletion };
}

async function routeApi(request: Request, env: Env, path: string) {
  if (path === "/api/cloud/turnstile/config" && request.method === "GET") return turnstileConfig(env);
  if (path === "/api/cloud/auth/google" && request.method === "POST") return startGoogleAuth(request, env);
  if (path === "/api/cloud/auth/google/callback" && request.method === "GET") return finishGoogleAuth(request, env);
  if (path === "/api/cloud/auth/logout" && request.method === "POST") return logout(request, env);
  if (path === "/api/cloud/status" && request.method === "GET") {
    const context = await getSessionContext(request, env);
    return context ? json(await accountPayload(context.user, env)) : json({ authenticated: false }, 401);
  }
  if (path === "/api/cloud/legal/accept" && request.method === "POST") return acceptLegal(request, env);
  if (path === "/api/cloud/billing/checkout" && request.method === "POST") return createCheckout(request, env);
  if (path === "/api/cloud/billing/portal" && request.method === "POST") return createPortal(request, env);
  if (path === "/api/cloud/stripe/webhook" && request.method === "POST") return stripeWebhook(request, env);
  if (path === "/api/cloud/projects" && request.method === "GET") return listProjects(request, env);
  if (path === "/api/cloud/projects" && request.method === "POST") return createProject(request, env);
  if (path === "/api/cloud/account/export" && request.method === "GET") return exportAccount(request, env);
  if (path === "/api/cloud/account/delete-request" && request.method === "POST") return requestAccountDeletion(request, env);

  const projectMatch = path.match(/^\/api\/cloud\/projects\/([0-9a-f-]{36})(?:\/(export|thumbnail))?$/i);
  if (projectMatch && projectMatch[2] === "thumbnail" && request.method === "GET") return loadProjectThumbnail(request, env, projectMatch[1]);
  if (projectMatch && projectMatch[2] === "thumbnail" && request.method === "PUT") return saveProjectThumbnail(request, env, projectMatch[1]);
  if (projectMatch && request.method === "GET") return loadProject(request, env, projectMatch[1], projectMatch[2] === "export");
  if (projectMatch && request.method === "PUT" && !projectMatch[2]) return saveProject(request, env, projectMatch[1]);
  if (projectMatch && request.method === "PATCH" && !projectMatch[2]) return renameProject(request, env, projectMatch[1]);
  if (projectMatch && request.method === "DELETE" && !projectMatch[2]) return deleteProject(request, env, projectMatch[1]);
  throw apiError(404, "API_NOT_FOUND", "API route not found.");
}

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  if (env.APP_ENV === "staging" && ["sketchforge3d.com", "www.sketchforge3d.com"].includes(url.hostname.toLowerCase())) {
    throw apiError(421, "STAGING_HOST_FORBIDDEN", "This staging Worker cannot serve the production domain.");
  }
  if (url.pathname.startsWith("/api/cloud/")) {
    assertRuntimeConfiguration(env);
    return routeApi(request, env, url.pathname);
  }
  const asset = await env.ASSETS.fetch(request);
  if (env.APP_ENV !== "staging") return asset;
  const headers = new Headers(asset.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error, requestId);
      const code = error instanceof Error ? error.message.slice(0, 120) : "INTERNAL_ERROR";
      logEvent("error", "request_failed", { requestId, path: new URL(request.url).pathname, code });
      return errorResponse(apiError(500, "INTERNAL_ERROR", "The request could not be completed."), requestId);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runMaintenance(env).catch((error) => {
      const code = error instanceof Error ? error.message.slice(0, 120) : "MAINTENANCE_FAILED";
      logEvent("error", "maintenance_failed", { code });
    }));
  },
};
