import { headerOnlyJpeg, headerOnlyPng, jpeg, png } from "../test-support/images";
import {
  decodedMatchesHeader,
  dimensionsAllowed,
  imageSignature,
  readImageDimensions,
} from "./image-validation";

// Images are encoded with sharp at test time; under the full parallel suite
// that can exceed Jest's default 5 s per test.
jest.setTimeout(30_000);

describe("E1-D9 image validation (header gate)", () => {
  it("recognises JPEG and PNG by signature, nothing else", () => {
    expect(imageSignature(headerOnlyJpeg(800, 600))).toBe("image/jpeg");
    expect(imageSignature(headerOnlyPng(800, 600))).toBe("image/png");
    expect(imageSignature(Buffer.from("GIF89a-not-an-image"))).toBeNull();
    expect(imageSignature(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(imageSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(imageSignature(Buffer.alloc(0))).toBeNull();
    // A text file named .jpg is still text.
    expect(imageSignature(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
  });

  it("reads JPEG dimensions from SOF0, SOF1 and SOF2 after other segments", () => {
    expect(readImageDimensions(headerOnlyJpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(readImageDimensions(headerOnlyJpeg(640, 480, { sof: 0xc1 }))).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(headerOnlyJpeg(300, 200, { sof: 0xc2, appPayload: 5000 }))).toEqual({ width: 300, height: 200 });
  });

  it("refuses unsupported or unreadable JPEG headers", () => {
    // Lossless frame (SOF3): not produced by the app.
    expect(readImageDimensions(headerOnlyJpeg(100, 100, { sof: 0xc3 }))).toBeNull();
    // Truncated inside the frame header.
    expect(readImageDimensions(headerOnlyJpeg(100, 100).subarray(0, 24))).toBeNull();
    // A segment length running past the end.
    const broken = Buffer.from(headerOnlyJpeg(100, 100));
    broken.writeUInt16BE(0xfff0, 4);
    expect(readImageDimensions(broken)).toBeNull();
    // Only SOI and EOI.
    expect(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    // Zero width.
    expect(readImageDimensions(headerOnlyJpeg(0, 100))).toBeNull();
  });

  it("reads PNG dimensions from IHDR and refuses a broken first chunk", () => {
    expect(readImageDimensions(headerOnlyPng(4096, 64))).toEqual({ width: 4096, height: 64 });
    const wrongChunk = Buffer.from(headerOnlyPng(100, 100));
    wrongChunk.write("IDAT", 12, "latin1");
    expect(readImageDimensions(wrongChunk)).toBeNull();
    expect(readImageDimensions(headerOnlyPng(100, 100).subarray(0, 20))).toBeNull();
    expect(readImageDimensions(headerOnlyPng(0, 100))).toBeNull();
  });

  it("admits dimensions between 64 and 4096 px on both sides", () => {
    expect(dimensionsAllowed({ width: 64, height: 4096 })).toBe(true);
    expect(dimensionsAllowed({ width: 63, height: 100 })).toBe(false);
    expect(dimensionsAllowed({ width: 100, height: 4097 })).toBe(false);
  });

  it("reads the header of real encoded images", async () => {
    expect(readImageDimensions(await jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(readImageDimensions(await png(300, 200))).toEqual({ width: 300, height: 200 });
  });

  it("the full decode must agree with the signature and the header", () => {
    const header = { width: 800, height: 600 };
    expect(decodedMatchesHeader("image/jpeg", header, { format: "jpeg", width: 800, height: 600 })).toBe(true);
    expect(decodedMatchesHeader("image/png", header, { format: "jpeg", width: 800, height: 600 })).toBe(false);
    expect(decodedMatchesHeader("image/jpeg", header, { format: "png", width: 800, height: 600 })).toBe(false);
    expect(decodedMatchesHeader("image/jpeg", header, { format: "jpeg", width: 600, height: 800 })).toBe(false);
    expect(decodedMatchesHeader("image/jpeg", header, { format: "jpeg", width: 800, height: 601 })).toBe(false);
  });
});
