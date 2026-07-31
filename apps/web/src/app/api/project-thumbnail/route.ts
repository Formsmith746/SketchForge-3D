import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const revalidate = false;

const THUMBNAIL_DIR = path.join(process.cwd(), ".codex", "project-thumbnails");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_THUMBNAIL_REQUEST_BYTES = Math.ceil((MAX_THUMBNAIL_BYTES * 4) / 3) + PNG_DATA_URL_PREFIX.length + 2048;

function safeProjectId(projectId: string) {
  const clean = projectId.replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || null;
}

function thumbnailPath(projectId: string) {
  const safeId = safeProjectId(projectId);
  if (!safeId) {
    return null;
  }
  return path.join(THUMBNAIL_DIR, `${safeId}.png`);
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
      if (!LOCAL_HOSTS.has(originUrl.hostname) || originUrl.port !== requestUrl.port || originUrl.protocol !== requestUrl.protocol) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
}

function decodedBase64ByteLength(value: string) {
  if (value.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export async function GET(request: Request) {
  if (!isLocalSameOriginRequest(request)) {
    return new NextResponse("Project thumbnails are only available from this localhost app", { status: 403 });
  }

  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  const filePath = thumbnailPath(projectId);
  if (!filePath) {
    return new NextResponse("Invalid project id", { status: 400 });
  }

  try {
    const image = await fs.readFile(filePath);
    return new NextResponse(image, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "image/png",
      },
    });
  } catch {
    return new NextResponse("Thumbnail not found", { status: 404 });
  }
}

export async function POST(request: Request) {
  if (!isLocalSameOriginRequest(request)) {
    return NextResponse.json({ error: "Project thumbnails are only available from this localhost app" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_THUMBNAIL_REQUEST_BYTES) {
    return NextResponse.json({ error: "Thumbnail image is too large" }, { status: 413 });
  }

  let body: { dataUrl?: unknown; projectId?: unknown };
  try {
    body = (await request.json()) as { dataUrl?: unknown; projectId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid thumbnail request" }, { status: 400 });
  }

  try {
    if (typeof body.projectId !== "string" || typeof body.dataUrl !== "string") {
      return NextResponse.json({ error: "Invalid thumbnail request" }, { status: 400 });
    }

    const filePath = thumbnailPath(body.projectId);
    if (!filePath || !body.dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
      return NextResponse.json({ error: "Invalid thumbnail image" }, { status: 400 });
    }

    const encodedImage = body.dataUrl.slice(PNG_DATA_URL_PREFIX.length);
    const decodedBytes = decodedBase64ByteLength(encodedImage);
    if (decodedBytes === null) {
      return NextResponse.json({ error: "Invalid thumbnail image" }, { status: 400 });
    }
    if (decodedBytes > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json({ error: "Thumbnail image is too large" }, { status: 413 });
    }

    await fs.mkdir(THUMBNAIL_DIR, { recursive: true });
    await fs.rm(filePath, { force: true });
    await fs.writeFile(filePath, Buffer.from(encodedImage, "base64"));

    return NextResponse.json({ version: Date.now() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save thumbnail" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isLocalSameOriginRequest(request)) {
    return NextResponse.json({ error: "Project thumbnails are only available from this localhost app" }, { status: 403 });
  }

  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  const filePath = thumbnailPath(projectId);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  await fs.rm(filePath, { force: true });
  return NextResponse.json({ deleted: true });
}
