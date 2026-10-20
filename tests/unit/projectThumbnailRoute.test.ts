import { describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/project-thumbnail/route";

function missingThumbnailRequest(url: string, headers?: HeadersInit) {
  return new Request(`${url}/api/project-thumbnail?projectId=missing-thumbnail`, { headers });
}

describe("project thumbnail request origins", () => {
  it("allows same-origin requests on a public HTTPS host", async () => {
    const response = await GET(missingThumbnailRequest("https://projects.example.test", {
      Origin: "https://projects.example.test",
      "Sec-Fetch-Site": "same-origin",
    }));

    expect(response.status).toBe(404);
  });

  it("uses forwarded host and protocol behind a TLS reverse proxy", async () => {
    const response = await GET(missingThumbnailRequest("http://localhost:3000", {
      Origin: "https://projects.example.test",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-Host": "projects.example.test",
      "X-Forwarded-Proto": "https",
    }));

    expect(response.status).toBe(404);
  });

  it("rejects a different origin", async () => {
    const response = await GET(missingThumbnailRequest("https://projects.example.test", {
      Origin: "https://other.example.test",
      "Sec-Fetch-Site": "cross-site",
    }));

    expect(response.status).toBe(403);
  });

  it("allows same-origin uploads to proceed to request validation", async () => {
    const response = await POST(new Request("https://projects.example.test/api/project-thumbnail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://projects.example.test",
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid thumbnail request" });
  });
});
