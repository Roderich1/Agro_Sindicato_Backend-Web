import { createHmac } from "node:crypto";
import type { SyncV1Envelope } from "./envelope";

/**
 * Canonical vector of contract §5, as compact JSON. The values allowed by the
 * closed schema are ASCII, so `JSON.stringify` needs no extra escaping.
 */
export function canonicalVector(envelope: SyncV1Envelope): string {
  return JSON.stringify([
    envelope.contractVersion,
    envelope.operationId,
    envelope.projectionType,
    envelope.action,
    envelope.causal.predecessorOperationId,
    envelope.causal.reconciliationReference,
    envelope.payload.campaign_ref,
    envelope.payload.product_ref,
    envelope.payload.base_unit,
    envelope.payload.quantity_base,
  ]);
}

export const MIN_FINGERPRINT_KEY_BYTES = 32;

export class FingerprintKeyringError extends Error {
  constructor(reason: string) {
    super(`Invalid Sync v1 fingerprint keyring: ${reason}`);
  }
}

/**
 * HMAC keys by internal version. The current version signs new intentions;
 * previous versions only verify journals created before a rotation, for the
 * whole replay horizon (contract §5, §12). Keys are never logged or exposed.
 */
export class FingerprintKeyring {
  private readonly keys = new Map<number, Buffer>();

  constructor(
    readonly currentVersion: number,
    currentKey: Buffer,
    previous: ReadonlyMap<number, Buffer> = new Map(),
  ) {
    if (!Number.isSafeInteger(currentVersion) || currentVersion <= 0)
      throw new FingerprintKeyringError("version must be a positive integer");
    for (const [version, key] of [
      ...previous.entries(),
      [currentVersion, currentKey] as const,
    ]) {
      if (!Number.isSafeInteger(version) || version <= 0)
        throw new FingerprintKeyringError("version must be a positive integer");
      if (key.byteLength < MIN_FINGERPRINT_KEY_BYTES)
        throw new FingerprintKeyringError("key shorter than 32 bytes");
      this.keys.set(version, Buffer.from(key));
    }
  }

  /**
   * Parses `SYNC_V1_FINGERPRINT_KEY` (base64), its version and the optional
   * `SYNC_V1_FINGERPRINT_PREVIOUS_KEYS` (`version=base64`, comma separated).
   * Returns null when no key is configured: admission then stays closed.
   */
  static fromEnvironment(env: {
    key?: string;
    version?: number;
    previous?: string;
  }): FingerprintKeyring | null {
    if (!env.key) return null;
    if (env.version === undefined)
      throw new FingerprintKeyringError("SYNC_V1_FINGERPRINT_KEY_VERSION missing");
    const previous = new Map<number, Buffer>();
    for (const entry of (env.previous ?? "").split(",")) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0)
        throw new FingerprintKeyringError("previous key entry malformed");
      const version = Number(trimmed.slice(0, separator));
      if (version === env.version)
        throw new FingerprintKeyringError("previous key reuses current version");
      previous.set(version, decodeKey(trimmed.slice(separator + 1)));
    }
    return new FingerprintKeyring(env.version, decodeKey(env.key), previous);
  }

  /** Null if that key version is no longer available. */
  fingerprint(envelope: SyncV1Envelope, version = this.currentVersion) {
    const key = this.keys.get(version);
    if (!key) return null;
    return createHmac("sha256", key)
      .update(canonicalVector(envelope), "utf8")
      .digest();
  }
}

function decodeKey(value: string): Buffer {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed))
    throw new FingerprintKeyringError("key is not base64");
  return Buffer.from(trimmed, "base64");
}
