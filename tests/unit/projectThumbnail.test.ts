import { describe, expect, it } from "vitest";
import {
  projectThumbnailDimensions,
  projectThumbnailSceneChanged,
} from "@/lib/projectThumbnail";

describe("project thumbnails", () => {
  it("reduces a high-DPI editor canvas to the thumbnail bounds", () => {
    expect(projectThumbnailDimensions(2048, 992)).toEqual({ width: 512, height: 248 });
    expect(projectThumbnailDimensions(800, 1200)).toEqual({ width: 213, height: 320 });
    expect(projectThumbnailDimensions(320, 180)).toEqual({ width: 320, height: 180 });
  });

  it("captures only changed scenes within the same project", () => {
    const original = { projectId: "project-1", fingerprint: "scene-a" };
    expect(projectThumbnailSceneChanged(null, original)).toBe(false);
    expect(projectThumbnailSceneChanged(original, original)).toBe(false);
    expect(projectThumbnailSceneChanged(original, { ...original, fingerprint: "scene-b" })).toBe(true);
    expect(projectThumbnailSceneChanged(original, { projectId: "project-2", fingerprint: "scene-b" })).toBe(false);
  });
});
