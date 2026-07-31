import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const revalidate = false;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const MAX_TEXT_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BINARY_DOWNLOAD_BYTES = 512 * 1024 * 1024;

function safeFileName(filename: string) {
  const base = path.basename(filename).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  return base || "download.txt";
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

export async function POST(request: Request) {
  try {
    if (!isLocalSameOriginRequest(request)) {
      return NextResponse.json({ error: "Local folder downloads are only available from this localhost app" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let filename: string;
    let folder: string;
    let content: string | Buffer;
    if (contentType.toLowerCase().startsWith("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const requestedName = formData.get("filename");
      const requestedFolder = formData.get("folder");
      if (!(file instanceof Blob) || typeof requestedName !== "string" || typeof requestedFolder !== "string") {
        return NextResponse.json({ error: "Invalid binary download request" }, { status: 400 });
      }
      if (file.size > MAX_BINARY_DOWNLOAD_BYTES) {
        return NextResponse.json({ error: "File is too large for local folder download" }, { status: 413 });
      }
      filename = requestedName;
      folder = requestedFolder;
      content = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await request.json()) as { content?: unknown; filename?: unknown; folder?: unknown };
      if (typeof body.content !== "string" || typeof body.filename !== "string" || typeof body.folder !== "string") {
        return NextResponse.json({ error: "Invalid download request" }, { status: 400 });
      }
      if (Buffer.byteLength(body.content, "utf8") > MAX_TEXT_DOWNLOAD_BYTES) {
        return NextResponse.json({ error: "File is too large for local folder download" }, { status: 413 });
      }
      filename = body.filename;
      folder = body.folder;
      content = body.content;
    }

    const trimmedFolder = folder.trim();
    if (!trimmedFolder) {
      return NextResponse.json({ error: "Choose a folder first" }, { status: 400 });
    }

    const targetDirectory = path.resolve(path.isAbsolute(trimmedFolder) ? trimmedFolder : path.join(process.cwd(), trimmedFolder));
    await fs.mkdir(targetDirectory, { recursive: true });
    const targetPath = path.resolve(targetDirectory, safeFileName(filename));
    const relativeTarget = path.relative(targetDirectory, targetPath);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (typeof content === "string") await fs.writeFile(targetPath, content, "utf8");
    else await fs.writeFile(targetPath, content);

    return NextResponse.json({ path: targetPath });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save file" }, { status: 500 });
  }
}
