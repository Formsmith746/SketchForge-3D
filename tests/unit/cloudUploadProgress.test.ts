import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudApiError, cloudUploadJson, type CloudUploadProgress } from "@/lib/cloudApi";

class FakeXmlHttpRequest {
  static status = 200;
  static response = JSON.stringify({ ok: true });

  status = FakeXmlHttpRequest.status;
  responseText = FakeXmlHttpRequest.response;
  upload: {
    onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open() {}
  setRequestHeader() {}
  set withCredentials(_value: boolean) {}

  send(body: string) {
    const total = new TextEncoder().encode(body).byteLength;
    this.upload.onprogress?.({ loaded: Math.floor(total / 2), total, lengthComputable: true });
    this.upload.onload?.();
    this.onload?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXmlHttpRequest.status = 200;
  FakeXmlHttpRequest.response = JSON.stringify({ ok: true });
});

describe("Cloud JSON upload progress", () => {
  it("reports actual request upload bytes from zero through completion", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXmlHttpRequest);
    const progress: CloudUploadProgress[] = [];

    await expect(cloudUploadJson<{ ok: true }>("/api/cloud/projects/project-1", { shapes: [1, 2, 3] }, {
      onProgress: (event) => progress.push(event),
    })).resolves.toEqual({ ok: true });

    expect(progress[0]).toMatchObject({ loadedBytes: 0, percent: 0 });
    expect(progress.some((event) => event.percent > 0 && event.percent < 100)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ percent: 100 });
    expect(progress.at(-1)?.loadedBytes).toBe(progress.at(-1)?.totalBytes);
  });

  it("preserves structured Cloud API errors after upload", async () => {
    FakeXmlHttpRequest.status = 413;
    FakeXmlHttpRequest.response = JSON.stringify({ error: "PROJECT_TOO_LARGE", message: "Too large." });
    vi.stubGlobal("XMLHttpRequest", FakeXmlHttpRequest);

    const request = cloudUploadJson("/api/cloud/projects/project-1", { shapes: [] });
    await expect(request).rejects.toMatchObject<Partial<CloudApiError>>({
      status: 413,
      code: "PROJECT_TOO_LARGE",
      message: "Too large.",
    });
  });
});
