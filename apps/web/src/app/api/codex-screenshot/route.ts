import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const revalidate = false;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_SCREENSHOT_REQUEST_BYTES = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + PNG_DATA_URL_PREFIX.length + 2048;

function sanitizeFileName(value: unknown) {
  const fallback = `codex-screenshot-${Date.now()}.png`;
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.replace(/[^a-z0-9_.-]+/gi, "_").replace(/^_+|_+$/g, "");
  return cleaned.endsWith(".png") ? cleaned : `${cleaned || fallback}.png`;
}

function isLocalSameOriginRequest(request: Request) {
  const requestUrl = new URL(request.url);
  if (!LOCAL_HOSTS.has(requestUrl.hostname)) {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.origin !== requestUrl.origin || !LOCAL_HOSTS.has(originUrl.hostname)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

function decodedBase64ByteLength(value: string) {
  if (value.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Codex screenshot capture is only available in local development." }, { status: 404 });
  }

  if (!isLocalSameOriginRequest(request)) {
    return NextResponse.json({ error: "Codex screenshot capture only accepts local requests." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SCREENSHOT_REQUEST_BYTES) {
    return NextResponse.json({ error: "Screenshot image is too large." }, { status: 413 });
  }

  let body: { dataUrl?: unknown; name?: unknown };
  try {
    body = (await request.json()) as { dataUrl?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid screenshot request." }, { status: 400 });
  }

  if (typeof body.dataUrl !== "string" || !body.dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    return NextResponse.json({ error: "Expected a PNG data URL." }, { status: 400 });
  }

  const encodedImage = body.dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  const decodedBytes = decodedBase64ByteLength(encodedImage);
  if (decodedBytes === null) {
    return NextResponse.json({ error: "Expected a PNG data URL." }, { status: 400 });
  }
  if (decodedBytes > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: "Screenshot image is too large." }, { status: 413 });
  }

  const bytes = Buffer.from(encodedImage, "base64");
  const directory = path.join(process.cwd(), ".codex", "screenshots");
  await mkdir(directory, { recursive: true });

  const filePath = path.join(directory, sanitizeFileName(body.name));
  await writeFile(filePath, bytes);
  return NextResponse.json({ path: filePath, bytes: bytes.length });
}
