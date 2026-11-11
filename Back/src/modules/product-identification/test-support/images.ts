/**
 * Hand-built minimal image headers for E1 tests. They are not decodable
 * pictures: only the structure the server reads (signature, JPEG segments up
 * to the frame header, PNG IHDR) is real. Synthetic, no camera data.
 */

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

export interface JpegOptions {
  /** Frame marker (default SOF0 = 0xC0). */
  sof?: number;
  /** Bytes of an APPn segment before the frame header (default a JFIF APP0). */
  appPayload?: number;
  /** Bytes appended after EOI, to make distinct files of equal dimensions. */
  padding?: number;
  /** Variation byte inside the scan, to change the SHA-256. */
  seed?: number;
}

export function jpeg(width: number, height: number, options: JpegOptions = {}): Buffer {
  const app = Buffer.alloc(options.appPayload ?? 14, 0x41);
  const parts = [
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
  ];
  if (options.padding) parts.push(Buffer.alloc(options.padding, 0x00));
  return Buffer.concat(parts);
}

export function png(width: number, height: number, padding = 0): Buffer {
  const parts = [
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
  ];
  if (padding) parts.push(Buffer.alloc(padding, 0x00));
  return Buffer.concat(parts);
}
