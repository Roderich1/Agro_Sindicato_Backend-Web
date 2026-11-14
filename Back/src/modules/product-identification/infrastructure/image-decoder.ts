import { Logger } from "@nestjs/common";
import type SharpFactory from "sharp";
import sharpCommonJs = require("sharp");
import { IMAGE_MAX_SIDE, IMAGE_MIN_SIDE } from "../domain/image-validation";

/**
 * E1-D9: full decode of a label photo on the server, after the cheap header
 * gate (signature, header dimensions, size, SHA-256). The client already
 * re-encodes the photo (E1-D10); this does not rely on it.
 *
 * Limits (technical, not business rules):
 * - at most IMAGE_MAX_PIXELS = 4096 x 4096 pixels (libvips refuses larger
 *   input before decoding a pixel), and 64..4096 px per side;
 * - one frame/page only: animated or multi-page input is refused (an APNG is
 *   recognised by its `acTL` chunk, which libvips would silently ignore);
 * - `failOn: "warning"`: truncated or structurally corrupt data is refused;
 * - every pixel is decoded through a streaming, sequential pipeline that
 *   shrinks to a single pixel, so no full raw buffer is allocated;
 * - a decode is killed by libvips after DECODE_TIMEOUT_SECONDS;
 * - at most MAX_CONCURRENT_DECODES decodes at once in this process (the
 *   others wait), libvips cache off and one libvips thread per decode, so
 *   photo uploads cannot exhaust CPU or memory;
 * - nothing after the end marker (JPEG EOI, PNG IEND): no appended payload
 *   (polyglot files) is stored.
 *
 * Metadata rule (defence in depth): the client strips every metadata block
 * and location must never be stored, so an image carrying EXIF, XMP or IPTC
 * is refused rather than stored or silently rewritten.
 *
 * Declared limit of any decoder: corrupt entropy-coded data that still forms
 * valid codes decodes into wrong pixels without an error; only structural
 * damage (truncation, broken segments or chunks, bad CRC) is detectable.
 *
 * Nothing is logged but a fixed reason token or an error class name: never
 * bytes, names or library messages (they could echo content).
 */
export interface DecodedImage {
  format: "jpeg" | "png";
  width: number;
  height: number;
}

export const IMAGE_MAX_PIXELS = 4096 * 4096;
export const MAX_CONCURRENT_DECODES = 2;
export const DECODE_TIMEOUT_SECONDS = 5;

/**
 * sharp's CommonJS entry exports the factory itself; without
 * `esModuleInterop` TypeScript reads its ESM typings (a default export), so
 * the CommonJS value is typed explicitly.
 */
const sharp = sharpCommonJs as unknown as typeof SharpFactory;

type SharpOptions = NonNullable<Parameters<typeof sharp>[1]>;

const SHARP_OPTIONS: SharpOptions = {
  failOn: "warning",
  limitInputPixels: IMAGE_MAX_PIXELS,
  sequentialRead: true,
  pages: 1,
  autoOrient: false,
};

sharp.cache(false);
sharp.concurrency(1);

const logger = new Logger("ProductPhotos");

/** Small FIFO semaphore: at most `max` holders, the rest wait in order. */
export class DecodeLimiter {
  private active = 0;
  private peakActive = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  /** Highest number of simultaneous holders seen since creation or `resetPeak`. */
  get peak(): number {
    return this.peakActive;
  }

  resetPeak(): void {
    this.peakActive = this.active;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    this.peakActive = Math.max(this.peakActive, this.active);
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      // The slot passes directly to the next waiter: `active` is unchanged.
      if (next) next();
      else this.active -= 1;
    }
  }
}

/** The limiter shared by every photo upload of this process. */
export const decodeLimiter = new DecodeLimiter(MAX_CONCURRENT_DECODES);

type Rejection =
  | "format"
  | "pages"
  | "metadata"
  | "dimensions"
  | "trailing"
  | "animated"
  | "decode";

class DecodeRejected extends Error {
  constructor(readonly reason: Rejection) {
    super(reason);
    this.name = "DecodeRejected";
  }
}

/**
 * Decodes the whole image under the limits above. The decoded format and
 * dimensions, or null for anything that is not a single, complete,
 * metadata-free JPEG or PNG within the limits.
 */
export async function decodeImageFully(
  content: Buffer,
  limiter: DecodeLimiter = decodeLimiter,
): Promise<DecodedImage | null> {
  try {
    return await limiter.run(() => decode(content));
  } catch (error) {
    const reason = error instanceof DecodeRejected ? error.reason : "decode";
    const kind = error instanceof DecodeRejected ? "" : ` ${error instanceof Error ? error.name : typeof error}`;
    logger.warn(`Product photo decode rejected (${reason}${kind})`);
    return null;
  }
}

async function decode(content: Buffer): Promise<DecodedImage> {
  // Header-level facts first (no pixel is decoded).
  const metadata = await sharp(content, SHARP_OPTIONS).metadata();
  const format = metadata.format;
  if (format !== "jpeg" && format !== "png") throw new DecodeRejected("format");
  if ((metadata.pages ?? 1) !== 1) throw new DecodeRejected("pages");
  if (metadata.exif || metadata.xmp || metadata.iptc) throw new DecodeRejected("metadata");
  const { width, height } = metadata;
  if (!width || !height || !sideAllowed(width) || !sideAllowed(height) || width * height > IMAGE_MAX_PIXELS) {
    throw new DecodeRejected("dimensions");
  }
  if (!endsWithEndMarker(content, format)) throw new DecodeRejected("trailing");
  if (format === "png" && pngIsAnimated(content)) throw new DecodeRejected("animated");

  // Every pixel, streamed: the box shrink to 1x1 reads all of them without
  // holding the decoded image; libvips stops after the timeout.
  await sharp(content, SHARP_OPTIONS)
    .timeout({ seconds: DECODE_TIMEOUT_SECONDS })
    .resize({ width: 1, height: 1, fit: "fill", fastShrinkOnLoad: false })
    .raw()
    .toBuffer();
  return { format, width, height };
}

function sideAllowed(side: number): boolean {
  return Number.isInteger(side) && side >= IMAGE_MIN_SIDE && side <= IMAGE_MAX_SIDE;
}

const JPEG_EOI = Buffer.from([0xff, 0xd9]);
// Length 0, "IEND", CRC of "IEND".
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function endsWithEndMarker(content: Buffer, format: "jpeg" | "png"): boolean {
  const marker = format === "jpeg" ? JPEG_EOI : PNG_IEND;
  return content.length >= marker.length && content.subarray(content.length - marker.length).equals(marker);
}

/** An `acTL` chunk before the first `IDAT` marks an animated PNG (APNG). */
function pngIsAnimated(content: Buffer): boolean {
  let offset = 8;
  while (offset + 8 <= content.length) {
    const length = content.readUInt32BE(offset);
    const type = content.toString("latin1", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length;
  }
  return false;
}
