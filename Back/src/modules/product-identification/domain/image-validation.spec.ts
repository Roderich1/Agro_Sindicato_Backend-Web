import { jpeg, png } from "../test-support/images";
import {
  dimensionsAllowed,
  imageSignature,
  readImageDimensions,
} from "./image-validation";

describe("E1-D9 image validation", () => {
  it("recognises JPEG and PNG by signature, nothing else", () => {
    expect(imageSignature(jpeg(800, 600))).toBe("image/jpeg");
    expect(imageSignature(png(800, 600))).toBe("image/png");
    expect(imageSignature(Buffer.from("GIF89a-not-an-image"))).toBeNull();
    expect(imageSignature(Buffer.from("%PDF-1.7"))).toBeNull();
    expect(imageSignature(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(imageSignature(Buffer.alloc(0))).toBeNull();
    // A text file named .jpg is still text.
    expect(imageSignature(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
  });

  it("reads JPEG dimensions from SOF0, SOF1 and SOF2 after other segments", () => {
    expect(readImageDimensions(jpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(readImageDimensions(jpeg(640, 480, { sof: 0xc1 }))).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(jpeg(300, 200, { sof: 0xc2, appPayload: 5000 }))).toEqual({ width: 300, height: 200 });
  });

  it("refuses unsupported or unreadable JPEG headers", () => {
    // Lossless frame (SOF3): not produced by the app.
    expect(readImageDimensions(jpeg(100, 100, { sof: 0xc3 }))).toBeNull();
    // Truncated inside the frame header.
    expect(readImageDimensions(jpeg(100, 100).subarray(0, 24))).toBeNull();
    // A segment length running past the end.
    const broken = Buffer.from(jpeg(100, 100));
    broken.writeUInt16BE(0xfff0, 4);
    expect(readImageDimensions(broken)).toBeNull();
    // Only SOI and EOI.
    expect(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    // Zero width.
    expect(readImageDimensions(jpeg(0, 100))).toBeNull();
  });

  it("reads PNG dimensions from IHDR and refuses a broken first chunk", () => {
    expect(readImageDimensions(png(4096, 64))).toEqual({ width: 4096, height: 64 });
    const wrongChunk = Buffer.from(png(100, 100));
    wrongChunk.write("IDAT", 12, "latin1");
    expect(readImageDimensions(wrongChunk)).toBeNull();
    expect(readImageDimensions(png(100, 100).subarray(0, 20))).toBeNull();
    expect(readImageDimensions(png(0, 100))).toBeNull();
  });

  it("admits dimensions between 64 and 4096 px on both sides", () => {
    expect(dimensionsAllowed({ width: 64, height: 4096 })).toBe(true);
    expect(dimensionsAllowed({ width: 63, height: 100 })).toBe(false);
    expect(dimensionsAllowed({ width: 100, height: 4097 })).toBe(false);
  });
});
