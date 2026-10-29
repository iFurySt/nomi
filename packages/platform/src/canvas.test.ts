import { describe, it, expect } from "vitest";
import { canvasAssetDigest, canvasImageMime } from "./canvas";
describe("canvas attachment boundary", () => {
  it("hashes original bytes independently of filename or reported type", async () => {
    const blob = new Blob(["abc"], { type: "image/png" });
    expect(await canvasAssetDigest(blob)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await canvasImageMime(blob)).toBeUndefined();
  });
  it("recognizes raster headers and leaves active formats as attachments", async () => {
    expect(
      await canvasImageMime(
        new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])]),
      ),
    ).toBe("image/png");
    expect(await canvasImageMime(new Blob(["GIF89a"]))).toBe("image/gif");
    expect(
      await canvasImageMime(
        new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/svg+xml" }),
      ),
    ).toBeUndefined();
    expect(
      await canvasImageMime(new Blob(["<html>"], { type: "image/png" })),
    ).toBeUndefined();
  });
  it("rejects oversized originals before hashing", async () => {
    await expect(
      canvasAssetDigest(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)])),
    ).rejects.toThrow(/20 MiB/);
  });
});
