import { ENVELOPE_HEADER_BYTES } from "../application/backup-format";

/** Outer header of format 2 (F08-ADR-003 §4) for a plaintext of `plaintext` bytes. */
export function envelopeHeader(plaintext: number, patch: (h: Buffer) => void = () => {}): Buffer {
  const header = Buffer.alloc(ENVELOPE_HEADER_BYTES);
  Buffer.from("AGROENC\0", "latin1").copy(header, 0);
  header.writeUInt16BE(2, 8);
  header[10] = 1;
  header[11] = 0;
  header.fill(7, 12, 72); // key id, salt and nonce: not checked by the server
  header.writeBigUInt64BE(BigInt(plaintext), 72);
  patch(header);
  return header;
}
