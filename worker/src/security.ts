import { apiError } from "./errors";

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}

export async function sha256(value: string | ArrayBuffer) {
  const data = typeof value === "string" ? encoder.encode(value) : value;
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacBase64Url(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function timingSafeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

export async function signValue(secret: string, value: string) {
  return `${value}.${await hmacBase64Url(secret, value)}`;
}

export async function verifySignedValue(secret: string, signed: string) {
  const separator = signed.lastIndexOf(".");
  if (separator < 1) return null;
  const value = signed.slice(0, separator);
  const signature = signed.slice(separator + 1);
  const expected = await hmacBase64Url(secret, value);
  return timingSafeEqual(signature, expected) ? value : null;
}

export function parseCookies(request: Request) {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    try {
      cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Ignore malformed cookie values instead of turning an unauthenticated request into a 500.
    }
  }
  return cookies;
}

export function sessionCookieName(isSecure: boolean) {
  return isSecure ? "__Host-sketchforge_session" : "sketchforge_session";
}

export function oauthCookieName(isSecure: boolean) {
  return isSecure ? "__Host-sketchforge_oauth" : "sketchforge_oauth";
}

export function cookieHeader(name: string, value: string, options: { maxAge?: number; secure: boolean }) {
  const pieces = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.secure) pieces.push("Secure");
  if (typeof options.maxAge === "number") pieces.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  return pieces.join("; ");
}

export function assertSameOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || origin !== url.origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    throw apiError(403, "CROSS_ORIGIN_REQUEST_REJECTED", "Cross-origin request rejected.");
  }
}

export function decodeJwtPart(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Record<string, unknown>;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string, expectedNonce: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed Google ID token.");
  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Unsupported Google ID token.");

  const keysResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!keysResponse.ok) throw new Error("Google signing keys unavailable.");
  const keys = (await keysResponse.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = keys.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error("Invalid Google ID token signature.");

  const now = Math.floor(Date.now() / 1000);
  const issuer = claims.iss;
  if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") throw new Error("Invalid Google issuer.");
  if (claims.aud !== clientId || typeof claims.exp !== "number" || claims.exp <= now || claims.nonce !== expectedNonce) {
    throw new Error("Invalid Google ID token claims.");
  }
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new Error("Google account claims missing.");
  return claims as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
}
