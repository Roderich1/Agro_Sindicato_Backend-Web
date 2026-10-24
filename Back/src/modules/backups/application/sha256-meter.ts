import { createHash, Hash } from "node:crypto";
import { Transform, TransformCallback } from "node:stream";

export class BackupTooLargeError extends Error {
  constructor() {
    super("BACKUP_TOO_LARGE");
  }
}

/** The client stopped sending before the body was complete. */
export class BackupTransferIncompleteError extends Error {
  constructor() {
    super("BACKUP_TRANSFER_INCOMPLETE");
  }
}

/**
 * Pass-through that hashes (SHA-256) and counts the bytes that flow to
 * storage, and fails as soon as they exceed `maxBytes`: an oversized upload
 * is never fully read nor kept. It also keeps the first [prefixBytes] bytes,
 * so the outer format can be checked once the transfer has finished
 * (F08-ADR-003), without buffering the body.
 */
export class Sha256Meter extends Transform {
  private readonly hash: Hash = createHash("sha256");
  private count = 0;
  private result?: string;
  private readonly head: Buffer;
  private filled = 0;

  constructor(
    private readonly maxBytes: number,
    prefixBytes = 0,
  ) {
    super();
    this.head = Buffer.alloc(prefixBytes);
  }

  /** The first bytes received (at most `prefixBytes`). */
  get prefix(): Buffer {
    return this.head.subarray(0, this.filled);
  }

  get bytes(): number {
    return this.count;
  }

  /** Lowercase hex digest; available once the stream has finished. */
  get sha256(): string {
    if (this.result === undefined) throw new Error("Stream not finished");
    return this.result;
  }

  override _transform(chunk: Buffer, _encoding: string, done: TransformCallback): void {
    this.count += chunk.length;
    if (this.count > this.maxBytes) {
      done(new BackupTooLargeError());
      return;
    }
    if (this.filled < this.head.length) {
      const take = Math.min(chunk.length, this.head.length - this.filled);
      chunk.copy(this.head, this.filled, 0, take);
      this.filled += take;
    }
    this.hash.update(chunk);
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    this.result = this.hash.digest("hex");
    done();
  }
}
