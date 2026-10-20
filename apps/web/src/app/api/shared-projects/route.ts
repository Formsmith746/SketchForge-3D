import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { inspectSkfProjectPackage, SKF_LIMITS, SKF_MEDIA_TYPE } from "@/lib/skfProject";

export const runtime = "nodejs";
export const revalidate = false;

const SHARED_PROJECTS_ENV = "SKETCHFORGE_SHARED_PROJECTS_DIR";
const SHARED_THUMBNAILS_DIR = ".thumbnails";
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type SharedProjectFile = {
  fileName: string;
  name: string;
  updatedAt: number;
  size: number;
  revision: string;
  thumbnailUrl?: string;
};

function sharedProjectsDirectory() {
  const configured = process.env[SHARED_PROJECTS_ENV]?.trim();
  return configured ? path.resolve(configured) : null;
}

function safeProjectFileName(requestedName: string) {
  const withoutExtension = requestedName.replace(/\.skf$/i, "");
  const stem = path.basename(withoutExtension)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 115);
  return `${stem || "Untitled project"}.skf`;
}

function revisionForStat(stat: { size: number; mtimeMs: number }) {
  return `${stat.size.toString(16)}-${Math.round(stat.mtimeMs * 1000).toString(16)}`;
}

function sharedThumbnailPath(root: string, fileName: string, revision: string) {
  return path.join(root, SHARED_THUMBNAILS_DIR, `${fileName}.${revision}.png`);
}

function sharedThumbnailUrl(fileName: string, revision: string) {
  const query = new URLSearchParams({ fileName, thumbnail: "1", v: revision });
  return `/api/shared-projects?${query.toString()}`;
}

function projectRecord(fileName: string, stat: { size: number; mtimeMs: number }, hasThumbnail = false): SharedProjectFile {
  const revision = revisionForStat(stat);
  return {
    fileName,
    name: fileName.replace(/\.skf$/i, ""),
    updatedAt: stat.mtimeMs,
    size: stat.size,
    revision,
    ...(hasThumbnail ? { thumbnailUrl: sharedThumbnailUrl(fileName, revision) } : {}),
  };
}

function isPng(bytes: Uint8Array) {
  return bytes.byteLength >= PNG_SIGNATURE.byteLength
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

async function sharedProjectRequestBytes(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { projectBytes: new Uint8Array(await request.arrayBuffer()), thumbnailBytes: null as Uint8Array | null };
  }

  const formData = await request.formData();
  const project = formData.get("project");
  const thumbnail = formData.get("thumbnail");
  if (!(project instanceof Blob)) throw new Error("Shared project upload is missing its .skf file");
  if (!(thumbnail instanceof Blob)) throw new Error("Shared project upload is missing its thumbnail");
  const projectBytes = new Uint8Array(await project.arrayBuffer());
  const thumbnailBytes = new Uint8Array(await thumbnail.arrayBuffer());
  if (thumbnailBytes.byteLength > MAX_THUMBNAIL_BYTES) throw new Error("Shared project thumbnail exceeds the 5 MB size limit");
  if (!isPng(thumbnailBytes)) throw new Error("Shared project thumbnail must be a PNG image");
  return { projectBytes, thumbnailBytes };
}

function unquoteEtag(value: string | null) {
  if (!value) return null;
  return value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
}

function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || requestUrl.host;
    const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "");
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

async function regularFileStat(filePath: string) {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function disabledResponse() {
  return NextResponse.json(
    { enabled: false, projects: [], error: `${SHARED_PROJECTS_ENV} is not configured` },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return disabledResponse();
  try {
    await fs.mkdir(root, { recursive: true });
    const requestUrl = new URL(request.url);
    const requestedFile = requestUrl.searchParams.get("fileName");
    if (requestedFile) {
      const fileName = safeProjectFileName(requestedFile);
      if (fileName !== requestedFile) return NextResponse.json({ error: "Invalid shared project name" }, { status: 400 });
      const filePath = path.join(root, fileName);
      const stat = await regularFileStat(filePath);
      if (!stat) return NextResponse.json({ error: "Shared project was not found" }, { status: 404 });
      if (requestUrl.searchParams.get("thumbnail") === "1") {
        const revision = revisionForStat(stat);
        const requestedRevision = requestUrl.searchParams.get("v");
        if (requestedRevision && requestedRevision !== revision) {
          return new NextResponse("Shared project thumbnail revision is stale", { status: 404 });
        }
        const imagePath = sharedThumbnailPath(root, fileName, revision);
        const imageStat = await regularFileStat(imagePath);
        if (!imageStat) return new NextResponse("Shared project thumbnail was not found", { status: 404 });
        const image = await fs.readFile(imagePath);
        return new NextResponse(image, {
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Length": String(image.byteLength),
            "Content-Type": "image/png",
            ETag: `"${revision}"`,
          },
        });
      }
      const bytes = await fs.readFile(filePath);
      return new Response(bytes, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          "Content-Length": String(bytes.byteLength),
          "Content-Type": SKF_MEDIA_TYPE,
          ETag: `"${revisionForStat(stat)}"`,
        },
      });
    }

    const entries = await fs.readdir(root, { withFileTypes: true });
    const projects = await Promise.all(entries
      .filter((entry) => entry.isFile() && /\.skf$/i.test(entry.name))
      .map(async (entry) => {
        const stat = await regularFileStat(path.join(root, entry.name));
        if (!stat) return null;
        const revision = revisionForStat(stat);
        const thumbnailStat = await regularFileStat(sharedThumbnailPath(root, entry.name, revision));
        return projectRecord(entry.name, stat, Boolean(thumbnailStat));
      }));
    return NextResponse.json(
      { enabled: true, projects: projects.filter((entry): entry is SharedProjectFile => Boolean(entry)).sort((a, b) => b.updatedAt - a.updatedAt) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ enabled: true, projects: [], error: error instanceof Error ? error.message : "Could not read shared projects" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return NextResponse.json({ error: "Shared project storage is disabled" }, { status: 404 });
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Shared projects only accept same-origin deletes" }, { status: 403 });

  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  let lockPath = "";
  try {
    const requestUrl = new URL(request.url);
    const requestedFile = requestUrl.searchParams.get("fileName");
    if (!requestedFile) return NextResponse.json({ error: "Shared project name is required" }, { status: 400 });
    const fileName = safeProjectFileName(requestedFile);
    if (fileName !== requestedFile) return NextResponse.json({ error: "Invalid shared project name" }, { status: 400 });

    await fs.mkdir(root, { recursive: true });
    const filePath = path.join(root, fileName);
    lockPath = `${filePath}.lock`;

    try {
      lockHandle = await fs.open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return NextResponse.json({ error: "This shared project is currently being changed by someone else" }, { status: 409 });
      }
      throw error;
    }

    const currentStat = await regularFileStat(filePath);
    if (!currentStat) return NextResponse.json({ error: "Shared project was not found" }, { status: 404 });

    const currentRevision = revisionForStat(currentStat);
    const expectedRevision = unquoteEtag(request.headers.get("if-match"));
    if (!expectedRevision) {
      return NextResponse.json(
        { error: "Reload shared projects before deleting so the current revision can be verified", currentRevision },
        { status: 428 },
      );
    }
    if (expectedRevision !== currentRevision) {
      return NextResponse.json(
        { error: "The shared project changed after you loaded it. Refresh the shared projects list and try again.", currentRevision },
        { status: 409 },
      );
    }

    const thumbnailPath = sharedThumbnailPath(root, fileName, currentRevision);
    await fs.unlink(filePath);
    await fs.unlink(thumbnailPath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    return NextResponse.json(
      { deleted: true, fileName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete shared project" }, { status: 500 });
  } finally {
    if (lockHandle) await lockHandle.close().catch(() => undefined);
    if (lockPath) await fs.unlink(lockPath).catch(() => undefined);
  }
}

export async function POST(request: Request) {
  const root = sharedProjectsDirectory();
  if (!root) return NextResponse.json({ error: "Shared project storage is disabled" }, { status: 404 });
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Shared projects only accept same-origin saves" }, { status: 403 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  const multipartRequest = request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data") ?? false;
  const requestLimit = SKF_LIMITS.archiveBytes + (multipartRequest ? MAX_THUMBNAIL_BYTES + MAX_MULTIPART_OVERHEAD_BYTES : 0);
  if (Number.isFinite(declaredLength) && declaredLength > requestLimit) {
    return NextResponse.json({ error: ".skf file exceeds the shared storage size limit" }, { status: 413 });
  }

  let lockHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  let lockPath = "";
  let temporaryPath = "";
  let temporaryThumbnailPath = "";
  try {
    const { projectBytes: bytes, thumbnailBytes } = await sharedProjectRequestBytes(request);
    if (bytes.byteLength > SKF_LIMITS.archiveBytes) return NextResponse.json({ error: ".skf file exceeds the shared storage size limit" }, { status: 413 });
    const summary = await inspectSkfProjectPackage(bytes);
    const requestUrl = new URL(request.url);
    const fileName = safeProjectFileName(requestUrl.searchParams.get("fileName") ?? summary.projectName);
    await fs.mkdir(root, { recursive: true });
    const filePath = path.join(root, fileName);
    lockPath = `${filePath}.lock`;
    temporaryPath = path.join(root, `.${fileName}.${randomUUID()}.tmp`);

    try {
      lockHandle = await fs.open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return NextResponse.json({ error: "This shared project is currently being saved by someone else" }, { status: 409 });
      }
      throw error;
    }

    const currentStat = await regularFileStat(filePath);
    const currentRevision = currentStat ? revisionForStat(currentStat) : null;
    const expectedRevision = unquoteEtag(request.headers.get("if-match"));
    const createOnly = request.headers.get("if-none-match") === "*";
    if (currentStat && (createOnly || !expectedRevision || expectedRevision !== currentRevision)) {
      return NextResponse.json(
        { error: "The shared project changed after you opened it. Reload it or save under a different name.", currentRevision },
        { status: 409 },
      );
    }
    if (!currentStat && expectedRevision) {
      return NextResponse.json({ error: "The shared project no longer exists. Save it under a different name." }, { status: 409 });
    }

    const temporaryHandle = await fs.open(temporaryPath, "wx");
    try {
      await temporaryHandle.writeFile(bytes);
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    const pendingStat = await fs.stat(temporaryPath);
    const savedRevision = revisionForStat(pendingStat);
    let savedThumbnailPath = "";
    if (thumbnailBytes) {
      const thumbnailsRoot = path.join(root, SHARED_THUMBNAILS_DIR);
      await fs.mkdir(thumbnailsRoot, { recursive: true });
      savedThumbnailPath = sharedThumbnailPath(root, fileName, savedRevision);
      temporaryThumbnailPath = path.join(thumbnailsRoot, `.${fileName}.${randomUUID()}.tmp`);
      const thumbnailHandle = await fs.open(temporaryThumbnailPath, "wx");
      try {
        await thumbnailHandle.writeFile(thumbnailBytes);
        await thumbnailHandle.sync();
      } finally {
        await thumbnailHandle.close();
      }
      await fs.rename(temporaryThumbnailPath, savedThumbnailPath);
      temporaryThumbnailPath = "";
    }
    await fs.rename(temporaryPath, filePath);
    temporaryPath = "";
    const savedStat = await fs.stat(filePath);
    const project = projectRecord(fileName, savedStat, Boolean(thumbnailBytes));
    if (currentRevision && currentRevision !== project.revision) {
      await fs.unlink(sharedThumbnailPath(root, fileName, currentRevision)).catch(() => undefined);
    }
    return NextResponse.json(
      { project: { ...project, name: summary.projectName } },
      { status: currentStat ? 200 : 201, headers: { "Cache-Control": "no-store", ETag: `"${project.revision}"` } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save shared project" }, { status: 400 });
  } finally {
    if (lockHandle) await lockHandle.close().catch(() => undefined);
    if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined);
    if (temporaryThumbnailPath) await fs.unlink(temporaryThumbnailPath).catch(() => undefined);
    if (lockPath) await fs.unlink(lockPath).catch(() => undefined);
  }
}
