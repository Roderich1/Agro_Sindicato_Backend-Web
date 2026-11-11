import { afterEach, beforeEach } from "@jest/globals";
import { Logger } from "@nestjs/common";
import {
  animatedPng,
  corruptJpeg,
  headerOnlyJpeg,
  headerOnlyPng,
  jpeg,
  jpegWithExif,
  jpegWithXmp,
  oversizedPng,
  png,
  pngDecompressionBomb,
  truncatedJpeg,
  withTrailingBytes,
} from "../test-support/images";
import { imageSignature, readImageDimensions } from "../domain/image-validation";
import { decodeImageFully, DecodeLimiter, MAX_CONCURRENT_DECODES } from "./image-decoder";

// Images are encoded with sharp at test time; under the full parallel suite
// that can exceed Jest's default 5 s per test.
jest.setTimeout(30_000);

describe("E1-D9 full decode of a label photo", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("accepts a real JPEG and PNG with their decoded format and dimensions", async () => {
    expect(await decodeImageFully(await jpeg(1600, 1200))).toEqual({ format: "jpeg", width: 1600, height: 1200 });
    expect(await decodeImageFully(await png(300, 200))).toEqual({ format: "png", width: 300, height: 200 });
    expect(await decodeImageFully(await jpeg(64, 4096))).toEqual({ format: "jpeg", width: 64, height: 4096 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses truncated and corrupt files whose header passes the header gate", async () => {
    for (const damaged of [await truncatedJpeg(), await corruptJpeg()]) {
      // The cheap gate cannot tell: signature and frame header are intact.
      expect(imageSignature(damaged)).toBe("image/jpeg");
      expect(readImageDimensions(damaged)).toEqual({ width: 800, height: 600 });
      expect(await decodeImageFully(damaged)).toBeNull();
    }
    const whole = await png(300, 200);
    expect(await decodeImageFully(whole.subarray(0, Math.floor(whole.length * 0.7)))).toBeNull();
  });

  it("refuses header-only structures that are not pictures", async () => {
    expect(await decodeImageFully(headerOnlyJpeg(800, 600))).toBeNull();
    expect(await decodeImageFully(headerOnlyPng(800, 600))).toBeNull();
    expect(await decodeImageFully(Buffer.from("texto con extension jpg"))).toBeNull();
  });

  it("refuses EXIF and XMP metadata (location must never be stored)", async () => {
    expect(await decodeImageFully(await jpegWithExif())).toBeNull();
    expect(await decodeImageFully(await jpegWithXmp())).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.every((call) => String(call[0]).endsWith("(metadata)"))).toBe(true);
  });

  it("refuses animated PNG and bytes after the end marker", async () => {
    const apng = await animatedPng();
    expect(imageSignature(apng)).toBe("image/png");
    expect(await decodeImageFully(apng)).toBeNull();
    expect(await decodeImageFully(withTrailingBytes(await jpeg(200, 150)))).toBeNull();
    expect(await decodeImageFully(withTrailingBytes(await png(200, 150)))).toBeNull();
    // Refused for what they are, not because the files are malformed.
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      "Product photo decode rejected (animated)",
      "Product photo decode rejected (trailing)",
      "Product photo decode rejected (trailing)",
    ]);
  });

  it("refuses dimensions beyond the limits even without the header gate", async () => {
    expect(await decodeImageFully(await oversizedPng())).toBeNull();
    expect(await decodeImageFully(await png(63, 200))).toBeNull();
    expect(await decodeImageFully(await jpeg(4097, 64))).toBeNull();
  });

  it("decodes a small file that expands to the largest admitted image within bounds", async () => {
    const bomb = await pngDecompressionBomb();
    expect(bomb.length).toBeLessThan(256 * 1024);
    // Bounded by libvips' own timeout (5 s): a decode past it would be null.
    expect(await decodeImageFully(bomb)).toEqual({ format: "png", width: 4096, height: 4096 });
  });

  it("logs only a reason token, never library messages or bytes", async () => {
    await decodeImageFully(await corruptJpeg());
    await decodeImageFully(await jpegWithExif());
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines).toEqual(["Product photo decode rejected (decode Error)", "Product photo decode rejected (metadata)"]);
  });

  it("runs at most two decodes at once; the others wait their turn", async () => {
    expect(MAX_CONCURRENT_DECODES).toBe(2);
    const limiter = new DecodeLimiter(MAX_CONCURRENT_DECODES);
    const images = await Promise.all([1, 2, 3, 4, 5, 6].map((seed) => jpeg(400, 300, { seed })));
    const decodes = images.map((image) => decodeImageFully(image, limiter));
    expect(limiter.running).toBe(2);
    expect(limiter.queued).toBe(4);
    const results = await Promise.all(decodes);
    expect(results.every((r) => r?.format === "jpeg")).toBe(true);
    expect(limiter.peak).toBe(2);
    expect(limiter.running).toBe(0);
    expect(limiter.queued).toBe(0);
  });

  it("the limiter releases its slot when a task fails", async () => {
    const limiter = new DecodeLimiter(1);
    const order: string[] = [];
    const failing = limiter.run(async () => {
      order.push("a");
      throw new Error("x");
    });
    const next = limiter.run(async () => {
      order.push("b");
      return "ok";
    });
    await expect(failing).rejects.toThrow("x");
    await expect(next).resolves.toBe("ok");
    expect(order).toEqual(["a", "b"]);
    expect(limiter.peak).toBe(1);
    expect(limiter.running).toBe(0);
  });
});
