import { describe, expect, it } from "vitest";
import { MAX_THUMBNAIL_BYTES, thumbnailByteLength, thumbnailBytesFromDataUrl } from "../../worker/src/thumbnails";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("Cloud project thumbnails", () => {
  it("accepts a valid PNG data URL", () => {
    expect(thumbnailByteLength(ONE_PIXEL_PNG)).toBeGreaterThan(8);
    expect(thumbnailBytesFromDataUrl(ONE_PIXEL_PNG)?.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("rejects non-PNG data and oversized previews", () => {
    expect(thumbnailBytesFromDataUrl("data:text/plain;base64,SGVsbG8=")).toBeNull();
    const oversized = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_THUMBNAIL_BYTES * 4) / 3) + 8)}`;
    expect(thumbnailBytesFromDataUrl(oversized)).toBeNull();
  });
});
