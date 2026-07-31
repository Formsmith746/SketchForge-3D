import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultMediaTypeForSource, sha256Hex, sourceFormatForFileName } from "@/lib/projectAssets";

const utf8 = new TextEncoder();

describe("project asset hashing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("computes SHA-256 without Web Crypto for %j", async (input, expected) => {
    vi.stubGlobal("crypto", {});
    await expect(sha256Hex(utf8.encode(input))).resolves.toBe(expected);
  });

  it.each([55, 56, 63, 64, 65, 1024, 4097])("matches Node SHA-256 for %i binary bytes", async (length) => {
    const bytes = Uint8Array.from({ length }, (_value, index) => (index * 37 + 11) & 0xff);
    const expected = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal("crypto", {});
    await expect(sha256Hex(bytes)).resolves.toBe(expected);
  });
});

describe("project asset formats", () => {
  it("recognizes 3MF files and their media type", () => {
    expect(sourceFormatForFileName("printer-part.3MF")).toBe("3mf");
    expect(defaultMediaTypeForSource("3mf")).toBe("model/3mf");
  });
});
