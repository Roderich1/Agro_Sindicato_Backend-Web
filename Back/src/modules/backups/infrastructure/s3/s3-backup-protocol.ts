import { createHash } from "node:crypto";
import {
  ListedPage,
  ListedVersion,
  S3ClientContext,
  S3ListingError,
  S3StagingCleanupReport,
  StoredVersion,
} from "./s3-backup-storage.types";

export const SHA256_META = "agro-sha256";
export const SIZE_META = "agro-size";
export const CONTENT_TYPE = "application/octet-stream";
export const DEADLINE_EXCEEDED = "S3_DEADLINE_EXCEEDED";

/**
 * Content-MD5 of a request body: the S3 protocol's transport check (the
 * provider rejects a body that does not match), not a cryptographic use. The
 * integrity of a copy is given by its SHA-256.
 */
export function md5(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("base64"); // NOSONAR: S3 Content-MD5 transport check, not cryptographic
}

export function statusOf(error: unknown): number | undefined {
  // A rejection need not be an object (null, a string): never a TypeError that hides it.
  return (error as { $metadata?: { httpStatusCode?: number } } | null | undefined)?.$metadata
    ?.httpStatusCode;
}

export function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null | undefined)?.name;
  return name === "NoSuchKey" || name === "NotFound" || statusOf(error) === 404;
}

/**
 * A CreateMultipartUpload the provider refused on its only attempt (4xx other
 * than 408 and 429): it created nothing. After an SDK retry, or with a
 * retryable 408/429, an earlier attempt may have created the upload and lost
 * its answer, so the outcome stays unknown (#151 5b, note m1 of B).
 */
export function isDefinitiveRefusal(error: unknown): boolean {
  const status = statusOf(error);
  const attempts = (error as { $metadata?: { attempts?: number } } | null | undefined)?.$metadata
    ?.attempts;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429 &&
    attempts === 1
  );
}

export function failureOf(
  origin: "provider" | "source",
  error: unknown,
): NonNullable<S3StagingCleanupReport["failure"]> {
  const name = error instanceof Error ? error.name : typeof error;
  const status = statusOf(error);
  const hitDeadline =
    origin === "provider" && error instanceof Error && error.message === DEADLINE_EXCEEDED;
  return { origin: hitDeadline ? "deadline" : origin, name, ...(status === undefined ? {} : { status }) };
}

/** Aborts after `ms` (or with `parent`); `clear` must always be called. */
export function deadline(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(DEADLINE_EXCEEDED)), ms);
  timer.unref?.();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  return { signal, clear: () => clearTimeout(timer) };
}

/** One SDK call, bounded by `callMs` and by the operation's signal. */
export async function sendS3Command<T>(
  ctx: Pick<S3ClientContext, "s3" | "limits">,
  command: object,
  signal: AbortSignal,
): Promise<T> {
  const limit = deadline(ctx.limits.callMs, signal);
  try {
    return (await ctx.s3.send(command, { abortSignal: limit.signal })) as T;
  } catch (error) {
    // The SDK rejects an aborted call with a generic AbortError: report
    // why it was aborted (the source's own error, or the deadline).
    if (limit.signal.aborted && limit.signal.reason !== undefined) throw limit.signal.reason;
    throw error;
  } finally {
    limit.clear();
  }
}

/**
 * The versions and delete markers of one page listed under `prefix`. Any
 * entry without a name or version id, outside the prefix, without a date or
 * (a version) without a size makes the page invalid: it is never skipped.
 */
export function versionsOfPage(page: ListedPage, prefix: string, index: number): StoredVersion[] {
  const entry = (v: ListedVersion, deleteMarker: boolean): StoredVersion => {
    const valid =
      typeof v === "object" &&
      v !== null &&
      typeof v.Key === "string" &&
      v.Key.startsWith(prefix) &&
      typeof v.VersionId === "string" &&
      v.VersionId.length > 0 &&
      v.LastModified instanceof Date &&
      !Number.isNaN(v.LastModified.getTime()) &&
      (v.IsLatest === undefined || typeof v.IsLatest === "boolean") &&
      (deleteMarker || (Number.isSafeInteger(v.Size) && v.Size! >= 0));
    if (!valid) throw new S3ListingError("S3_LISTING_INVALID");
    return {
      name: v.Key!,
      versionId: v.VersionId!,
      flaggedLatest: v.IsLatest === true,
      deleteMarker,
      sizeBytes: deleteMarker ? 0 : v.Size!,
      modifiedAt: v.LastModified!,
      page: index,
    };
  };
  const list = (entries: unknown): ListedVersion[] => {
    if (entries === undefined) return [];
    if (!Array.isArray(entries)) throw new S3ListingError("S3_LISTING_INVALID");
    return entries as ListedVersion[];
  };
  return [
    ...list(page.Versions).map((v) => entry(v, false)),
    ...list(page.DeleteMarkers).map((m) => entry(m, true)),
  ];
}

/**
 * The current entry (version or delete marker) of each name of a complete
 * listing, without trusting IsLatest alone. A listing starts at the newest
 * entry of each name, so the current one is in the first page where its name
 * appears, and it must be the only entry flagged IsLatest for that name in
 * that page; flags in later pages are ignored. B2 was observed (#151,
 * 2026-10-24, with the trial's keys) to flag the first entry of each name in
 * every page. The version id is never compared. Fails closed when a name has
 * no such entry, more than one, or one older (LastModified) than another
 * entry of its name.
 */
export function currentEntries(entries: StoredVersion[]): Map<string, StoredVersion> {
  const firstPage = new Map<string, number>();
  for (const v of entries) if (!firstPage.has(v.name)) firstPage.set(v.name, v.page);
  const current = new Map<string, StoredVersion>();
  for (const v of entries) {
    if (v.page !== firstPage.get(v.name) || !v.flaggedLatest) continue;
    if (current.has(v.name)) throw new S3ListingError("S3_LISTING_INCONSISTENT");
    current.set(v.name, v);
  }
  for (const v of entries) {
    const head = current.get(v.name);
    if (!head || v.modifiedAt.getTime() > head.modifiedAt.getTime())
      throw new S3ListingError("S3_LISTING_INCONSISTENT");
  }
  return current;
}
