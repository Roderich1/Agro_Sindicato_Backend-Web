/**
 * Backup formats the API accepts (F08-ADR-003, Mobile
 * `docs/adr/F08-ADR-003-respaldo-cifrado-y-previo.md`):
 *
 * - 1: the `.agrobackup` container as the phone wrote it before client-side
 *   encryption. Readable by whoever holds the storage. Still accepted unless
 *   `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`, so earlier copies and the
 *   synthetic B2 tool keep working.
 * - 2: the same container encrypted on the phone (ChaCha20-Poly1305 + HKDF)
 *   with the farmer's recovery key, which the server never has.
 *
 * The server checks only the outer shape of format 2 (magic, version,
 * algorithm, flags and exact length). It cannot and does not verify the
 * decrypted content: that is the phone's job.
 */
export const FORMAT_PLAIN_CONTAINER = 1;
export const FORMAT_ENCRYPTED = 2;
export const ACCEPTED_FORMATS: readonly number[] = [FORMAT_PLAIN_CONTAINER, FORMAT_ENCRYPTED];

const MAGIC = Buffer.from([0x41, 0x47, 0x52, 0x4f, 0x45, 0x4e, 0x43, 0x00]); // "AGROENC\0"
export const ENVELOPE_HEADER_BYTES = 80;
export const ENVELOPE_TAG_BYTES = 16;
const ALGORITHM_CHACHA20_POLY1305_HKDF = 1;

function startsWithMagic(prefix: Buffer): boolean {
  return prefix.length >= MAGIC.length && prefix.subarray(0, MAGIC.length).equals(MAGIC);
}

/**
 * Does the received body have the outer shape of its declared format?
 *
 * - Format 2: header with magic, version 2, algorithm 1, flags 0, and a
 *   total length of exactly header + declared plaintext length + tag.
 * - Format 1: anything that does not claim to be format 2 (an encrypted body
 *   labelled as plain is mislabelled). Its content is not inspected, as
 *   before.
 */
export function hasDeclaredShape(formatVersion: number, prefix: Buffer, totalBytes: number): boolean {
  if (formatVersion === FORMAT_PLAIN_CONTAINER) return !startsWithMagic(prefix);
  if (formatVersion !== FORMAT_ENCRYPTED) return false;
  if (prefix.length < ENVELOPE_HEADER_BYTES || !startsWithMagic(prefix)) return false;
  if (prefix.readUInt16BE(8) !== FORMAT_ENCRYPTED) return false;
  if (prefix[10] !== ALGORITHM_CHACHA20_POLY1305_HKDF || prefix[11] !== 0) return false;
  const plaintext = prefix.readBigUInt64BE(72);
  return (
    BigInt(totalBytes) ===
    BigInt(ENVELOPE_HEADER_BYTES) + plaintext + BigInt(ENVELOPE_TAG_BYTES)
  );
}
