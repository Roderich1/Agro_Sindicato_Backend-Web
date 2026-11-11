/**
 * E1-D9: server-side checks of a label photo, first gate. Real type by
 * signature, dimensions read from the header (JPEG SOF0/1/2, PNG IHDR). It is
 * cheap and runs before anything else; a header proves nothing about the
 * rest of the file, so a photo that passes it is then decoded in full
 * (`infrastructure/image-decoder.ts`) and must agree with it
 * (`decodedMatchesHeader`).
 */

export type ImageContentType = "image/jpeg" | "image/png";

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MIN_SIDE = 64;
export const IMAGE_MAX_SIDE = 4096;

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Content type by magic number, or null for anything else. */
export function imageSignature(bytes: Buffer): ImageContentType | null {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (bytes.length >= JPEG_SIGNATURE.length && bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Dimensions from the header of a JPEG or PNG; null if it cannot be read. */
export function readImageDimensions(bytes: Buffer): ImageDimensions | null {
  switch (imageSignature(bytes)) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    default:
      return null;
  }
}

export function dimensionsAllowed(dimensions: ImageDimensions): boolean {
  return (
    dimensions.width >= IMAGE_MIN_SIDE &&
    dimensions.width <= IMAGE_MAX_SIDE &&
    dimensions.height >= IMAGE_MIN_SIDE &&
    dimensions.height <= IMAGE_MAX_SIDE
  );
}

/** First chunk must be IHDR with length 13 (PNG specification §11.2.2). */
function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  // signature (8) + length (4) + type (4) + IHDR data (13) + CRC (4)
  if (bytes.length < 33) return null;
  if (bytes.readUInt32BE(8) !== 13) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

/** Markers without a length field (TEM, RST0..RST7). */
function standalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

/**
 * Walks the segments after SOI until a baseline, extended or progressive
 * frame header (SOF0/SOF1/SOF2). Other frame types (lossless, arithmetic),
 * a scan or the end of image before the frame header, or a segment that runs
 * past the buffer make the header unreadable.
 */
function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Fill bytes: any number of 0xFF before the marker code.
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (standalone(marker)) continue;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      // length (2) precision (1) height (2) width (2) components (1)
      if (length < 8) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // Lossless / arithmetic-coded frames: not produced by the app.
      return null;
    }
    offset += length;
  }
  return null;
}

/**
 * The full decode must confirm the header gate: same type as the signature
 * and the same dimensions as the header. Anything else is refused.
 */
export function decodedMatchesHeader(
  contentType: ImageContentType,
  header: ImageDimensions,
  decoded: { format: "jpeg" | "png"; width: number; height: number },
): boolean {
  return (
    `image/${decoded.format}` === contentType &&
    decoded.width === header.width &&
    decoded.height === header.height
  );
}
