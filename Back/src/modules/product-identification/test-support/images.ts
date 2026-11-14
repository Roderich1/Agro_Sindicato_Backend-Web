import type SharpFactory from "sharp";
import sharpCommonJs = require("sharp");

/**
 * Images for the E1 tests. The real ones (`jpeg`, `png` and the damaged or
 * refused variants) are encoded by sharp at test time from synthetic pixels:
 * a gradient with seeded noise, no camera data. The `headerOnly*` builders
 * write only the structure the header gate reads (signature, JPEG segments up
 * to the frame header, PNG IHDR) and are not decodable: they serve only the
 * tests of the header parser itself.
 */
const sharp = sharpCommonJs as unknown as typeof SharpFactory;

export interface ImageOptions {
  /** Changes the pixels (and so the SHA-256) of an image of equal size. */
  seed?: number;
}

/** Deterministic RGB pixels: a gradient plus seeded noise in 4 x 4 blocks. */
function pixels(width: number, height: number, seed: number): Buffer {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      let h = Math.imul(x >> 2, 73856093) ^ Math.imul(y >> 2, 19349663) ^ Math.imul(seed, 83492791);
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
      const noise = ((h ^ (h >>> 15)) >>> 0) & 0x1f;
      raw[at] = ((x * 255) / width + noise) & 0xff;
      raw[at + 1] = ((y * 255) / height + noise) & 0xff;
      raw[at + 2] = (seed * 37 + noise * 2) & 0xff;
    }
  }
  return raw;
}

function picture(width: number, height: number, seed: number) {
  return sharp(pixels(width, height, seed), { raw: { width, height, channels: 3 } });
}

/** A real baseline JPEG without metadata, as the app sends it. */
export function jpeg(width: number, height: number, options: ImageOptions = {}): Promise<Buffer> {
  return picture(width, height, options.seed ?? 1).jpeg({ quality: 82 }).toBuffer();
}

/** A real PNG without metadata. */
export function png(width: number, height: number, options: ImageOptions = {}): Promise<Buffer> {
  return picture(width, height, options.seed ?? 1).png().toBuffer();
}

/** A real JPEG cut short: valid header, scan ends before EOI. */
export async function truncatedJpeg(width = 800, height = 600): Promise<Buffer> {
  const whole = await jpeg(width, height);
  return whole.subarray(0, Math.floor(whole.length * 0.6));
}

/**
 * A real JPEG whose header is intact (it passes the header gate) and whose
 * entropy-coded scan is overwritten with garbage that breaks its structure.
 */
export async function corruptJpeg(width = 800, height = 600): Promise<Buffer> {
  const bytes = Buffer.from(await jpeg(width, height));
  const sos = bytes.indexOf(Buffer.from([0xff, 0xda]));
  const scan = sos + 2 + bytes.readUInt16BE(sos + 2);
  for (let i = scan + 32; i < bytes.length - 2; i += 7) bytes[i] = (bytes[i] * 31 + 7) & 0xff;
  return bytes;
}

/** A real JPEG carrying an EXIF block (as a camera would). */
export function jpegWithExif(width = 400, height = 300): Promise<Buffer> {
  return picture(width, height, 3)
    .jpeg({ quality: 82 })
    .withExif({ IFD0: { Make: "Sintetica", Copyright: "E1 test" } })
    .toBuffer();
}

/** A real JPEG carrying an XMP packet. */
export function jpegWithXmp(width = 400, height = 300): Promise<Buffer> {
  return picture(width, height, 4)
    .jpeg({ quality: 82 })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>')
    .toBuffer();
}

/**
 * A PNG of 4096 x 4096 px (the largest admitted) of a single colour: a few
 * tens of KiB that expand to 48 MiB of pixels when decoded.
 */
export function pngDecompressionBomb(): Promise<Buffer> {
  return sharp({ create: { width: 4096, height: 4096, channels: 3, background: "#000000" } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A small PNG beyond the pixel limit (4097 x 4097 px). */
export function oversizedPng(): Promise<Buffer> {
  return sharp({ create: { width: 4097, height: 4097, channels: 3, background: "#000000" } })
    .greyscale()
    .png({ compressionLevel: 9 })
    .toBuffer();
}

interface Chunk {
  type: string;
  data: Buffer;
}

function chunksOf(file: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset);
    chunks.push({ type: file.toString("latin1", offset + 4, offset + 8), data: file.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

function frameControl(sequence: number, width: number, height: number): Buffer {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(width, 4);
  data.writeUInt32BE(height, 8);
  data.writeUInt16BE(1, 20); // delay 1/10 s
  data.writeUInt16BE(10, 22);
  return chunk("fcTL", data);
}

/** A real two-frame animated PNG (APNG): the default image plus one `fdAT` frame. */
export async function animatedPng(width = 200, height = 150): Promise<Buffer> {
  const first = chunksOf(await png(width, height, { seed: 5 }));
  const second = chunksOf(await png(width, height, { seed: 6 }));
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2, 0); // frames
  control.writeUInt32BE(0, 4); // plays forever
  let sequence = 0;
  const parts: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  parts.push(chunk("IHDR", first.find((c) => c.type === "IHDR")!.data));
  parts.push(chunk("acTL", control));
  parts.push(frameControl(sequence++, width, height));
  for (const c of first.filter((c) => c.type === "IDAT")) parts.push(chunk("IDAT", c.data));
  parts.push(frameControl(sequence++, width, height));
  for (const c of second.filter((c) => c.type === "IDAT")) {
    const seq = Buffer.alloc(4);
    seq.writeUInt32BE(sequence++);
    parts.push(chunk("fdAT", Buffer.concat([seq, c.data])));
  }
  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Appends bytes after the end marker (a polyglot-style payload). */
export function withTrailingBytes(image: Buffer, count = 64): Buffer {
  return Buffer.concat([image, Buffer.alloc(count, 0x50)]);
}

// --- Header-only structures (not decodable), for the header parser tests ---

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

export interface HeaderOnlyJpegOptions {
  /** Frame marker (default SOF0 = 0xC0). */
  sof?: number;
  /** Bytes of an APPn segment before the frame header (default a JFIF APP0). */
  appPayload?: number;
  /** Variation byte inside the scan, to change the SHA-256. */
  seed?: number;
}

/** Segments up to a frame header and a token scan: passes the header gate, never decodes. */
export function headerOnlyJpeg(width: number, height: number, options: HeaderOnlyJpegOptions = {}): Buffer {
  const app = Buffer.alloc(options.appPayload ?? 14, 0x41);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe0]),
    u16(app.length + 2),
    app,
    Buffer.from([0xff, options.sof ?? 0xc0]),
    u16(17),
    Buffer.from([0x08]),
    u16(height),
    u16(width),
    Buffer.from([0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]),
    Buffer.from([0xff, 0xda]),
    u16(12),
    Buffer.from([0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]),
    Buffer.from([0x12, 0x34, options.seed ?? 0x56, 0x78]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** Signature, IHDR (with a zero CRC) and IEND: passes the header gate, never decodes. */
export function headerOnlyPng(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    u32(13),
    Buffer.from("IHDR", "latin1"),
    u32(width),
    u32(height),
    Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]),
    u32(0),
    u32(0),
    Buffer.from("IEND", "latin1"),
    Buffer.from([0xae, 0x42, 0x60, 0x82]),
  ]);
}
