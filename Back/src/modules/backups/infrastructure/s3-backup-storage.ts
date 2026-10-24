import { createHash, randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectVersionsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  assertStorageKey,
  BackupObjectMissingError,
  BackupStorage,
  BackupStorageInventory,
  objectKey,
  StagedBackupObject,
  StoredBackupFile,
  stagingKey,
} from "../domain/backup-storage.port";

/** Connection settings of an S3-compatible provider (B2), from the environment. */
export interface S3BackupStorageSettings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** One segment ending in `/` (e.g. `ensayo-f08/`); nothing is written outside it. */
  prefix: string;
}

/** Up to this size a copy is one `PutObject`; above it, multipart with parts of this size. */
export const S3_PART_BYTES = 8 * 1024 * 1024;

/**
 * Time limits (ms), and the work limit of a listing. Every call that does not
 * carry the client's body is bounded.
 */
export interface S3Limits {
  /** One SDK call, its retries included. */
  callMs: number;
  /** Whole `commit`: existence listing, copy, head, purge of staging and of duplicates. */
  commitMs: number;
  /** Whole `remove`, `discardStaged` or `removeStagedFile`. */
  purgeMs: number;
  /** `open` until the response headers arrive. */
  openMs: number;
  /** Pages of one `ListObjectVersions` listing; past them it is incomplete. */
  listPages: number;
}

export const S3_LIMITS: S3Limits = {
  callMs: 120_000,
  commitMs: 180_000,
  purgeMs: 120_000,
  openMs: 60_000,
  listPages: 1_000,
};

/**
 * A version listing that cannot be taken as complete and true: past its page
 * limit, stalled, with an invalid page, or with flags that contradict its
 * order. It never means "absent" nor "nothing left".
 */
export class S3ListingError extends Error {
  constructor(
    code: "S3_LISTING_INCOMPLETE" | "S3_LISTING_INVALID" | "S3_LISTING_INCONSISTENT" | "S3_PAGINATION_STALLED",
  ) {
    super(code);
    this.name = "S3ListingError";
  }
}

/** What a cleanup of one attempt's staging could not settle; codes only. */
export type S3StagingPending =
  /** Listing this attempt's multipart uploads failed: whether one is left is unknown. */
  | "MULTIPART_LISTING_FAILED"
  /** More than one upload under this attempt's name: none is aborted. */
  | "MULTIPART_OWNERSHIP_AMBIGUOUS"
  /** A CreateMultipartUpload without an answer and nothing listed: it may still appear. */
  | "MULTIPART_CREATION_UNKNOWN"
  /** An upload of this attempt is still listed after its abort. */
  | "MULTIPART_REMAINS"
  /** The versions of this attempt's staging name could not be purged and checked. */
  | "STAGING_PURGE_FAILED";

/**
 * The cleanup of one attempt's staging (#151 5b, H3), reported apart from the
 * error that `stage` rethrows: codes, an error name and an HTTP status only,
 * never names, keys or provider messages. `complete` only when nothing of the
 * attempt is left, checked by listing; otherwise what is pending is left for
 * reconciliation (`discardStaged`, the F10 inventory).
 */
export interface S3StagingCleanupReport {
  trigger: "STAGE_FAILED" | "DISCARDED";
  /** The cause of a failed stage: the provider, the adapter's call deadline, or the source. */
  failure?: { origin: "provider" | "deadline" | "source"; name: string; status?: number };
  complete: boolean;
  pending: S3StagingPending[];
}

/** What the adapter needs from the SDK client; `S3Client` satisfies it. */
export interface S3Sender {
  send(command: object, options: { abortSignal: AbortSignal }): Promise<unknown>;
}

/**
 * SDK client for the provider. Credentials are passed explicitly (never the
 * default chain); no logger is given, so the SDK logs nothing; the default
 * CRC checksums are limited to the operations that require them, since
 * integrity is given by Content-MD5 on every write and by SHA-256.
 */
export function createS3Client(settings: S3BackupStorageSettings): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
    maxAttempts: 3,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 60_000 },
  });
}

/** A version (or delete marker) of one exact name, as listed. */
interface StoredVersion {
  name: string;
  versionId: string;
  /** The provider's IsLatest; only trusted as `currentEntries` describes. */
  flaggedLatest: boolean;
  deleteMarker: boolean;
  sizeBytes: number;
  modifiedAt: Date;
  /** Page of the listing it came in, from 0. */
  page: number;
}

const SHA256_META = "agro-sha256";
const SIZE_META = "agro-size";
const CONTENT_TYPE = "application/octet-stream";

/**
 * Content-MD5 of a request body: the S3 protocol's transport check (the
 * provider rejects a body that does not match), not a cryptographic use. The
 * integrity of a copy is given by its SHA-256.
 */
function md5(bytes: Buffer): string {
  return createHash("md5").update(bytes).digest("base64"); // NOSONAR: S3 Content-MD5 transport check, not cryptographic
}

function statusOf(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  return name === "NoSuchKey" || name === "NotFound" || statusOf(error) === 404;
}

/**
 * A CreateMultipartUpload the provider refused on its only attempt (4xx other
 * than 408 and 429): it created nothing. After an SDK retry, or with a
 * retryable 408/429, an earlier attempt may have created the upload and lost
 * its answer, so the outcome stays unknown (#151 5b, note m1 of B).
 */
function isDefinitiveRefusal(error: unknown): boolean {
  const status = statusOf(error);
  const attempts = (error as { $metadata?: { attempts?: number } }).$metadata?.attempts;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429 &&
    attempts === 1
  );
}

const DEADLINE_EXCEEDED = "S3_DEADLINE_EXCEEDED";

function failureOf(
  origin: "provider" | "source",
  error: unknown,
): NonNullable<S3StagingCleanupReport["failure"]> {
  const name = error instanceof Error ? error.name : typeof error;
  const status = statusOf(error ?? {});
  const deadline = origin === "provider" && error instanceof Error && error.message === DEADLINE_EXCEEDED;
  return { origin: deadline ? "deadline" : origin, name, ...(status === undefined ? {} : { status }) };
}

/** A multipart upload of one attempt: none, its UploadId, or created without an answer. */
type AttemptUpload = { state: "none" } | { state: "known"; uploadId: string } | { state: "unknown" };

/** Aborts after `ms` (or with `parent`); `clear` must always be called. */
function deadline(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(DEADLINE_EXCEEDED)), ms);
  timer.unref?.();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  return { signal, clear: () => clearTimeout(timer) };
}

/** One entry of a `ListObjectVersions` page (a version or a delete marker). */
interface ListedVersion {
  Key?: string;
  VersionId?: string;
  IsLatest?: boolean;
  Size?: number;
  LastModified?: Date;
}

/** One `ListObjectVersions` page, before it is checked. */
interface ListedPage {
  Versions?: ListedVersion[];
  DeleteMarkers?: ListedVersion[];
  IsTruncated?: boolean;
  NextKeyMarker?: string;
  NextVersionIdMarker?: string;
}

/**
 * The versions and delete markers of one page listed under `prefix`. Any
 * entry without a name or version id, outside the prefix, without a date or
 * (a version) without a size makes the page invalid: it is never skipped.
 */
function versionsOfPage(page: ListedPage, prefix: string, index: number): StoredVersion[] {
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
function currentEntries(entries: StoredVersion[]): Map<string, StoredVersion> {
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

/**
 * F08-BKP-07: `BackupStorage` on an S3-compatible bucket (Backblaze B2,
 * "Keep all versions").
 *
 * Layout under the prefix: `objects/<key>` (committed) and
 * `staging/<key>.<random>.part`. There is no rename: a copy is staged under
 * its own name and `commit` copies exactly that staged version to the final
 * name (with its SHA-256 as metadata), checks it, and purges the staging.
 * Removal deletes every version and delete marker of the exact name, by
 * version id, and lists again: in a versioned bucket a name that is no longer
 * listed is not proof that its bytes are gone. A delete without a version id
 * (which would only add a marker) is never sent.
 *
 * Existence and visibility come from version listings, never from a 404 or
 * from IsLatest alone (#151); a listing that is denied, invalid or incomplete
 * fails closed.
 *
 * Nothing is logged here; errors are rethrown for the service to close, and
 * the cleanup of a failed or discarded staging goes to `onStagingCleanup`.
 */
export class S3BackupStorage implements BackupStorage, BackupStorageInventory {
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(
    private readonly s3: S3Sender,
    settings: Pick<S3BackupStorageSettings, "bucket" | "prefix">,
    private readonly limits: S3Limits = S3_LIMITS,
    private readonly onStagingCleanup?: (report: S3StagingCleanupReport) => void,
  ) {
    this.bucket = settings.bucket;
    this.prefix = settings.prefix;
  }

  private objectName(key: string): string {
    assertStorageKey(key);
    return `${this.prefix}objects/${key}`;
  }

  private stagingPrefix(key: string): string {
    assertStorageKey(key);
    return `${this.prefix}staging/${key}.`;
  }

  private isStagingNameOf(key: string, name: string): boolean {
    const local = name.slice(`${this.prefix}staging/`.length);
    return name.startsWith(this.stagingPrefix(key)) && stagingKey(local) === key;
  }

  /** One SDK call, bounded by `callMs` and by the operation's signal. */
  private async call<T>(command: object, signal: AbortSignal): Promise<T> {
    const limit = deadline(this.limits.callMs, signal);
    try {
      return (await this.s3.send(command, { abortSignal: limit.signal })) as T;
    } catch (error) {
      // The SDK rejects an aborted call with a generic AbortError: report
      // why it was aborted (the source's own error, or the deadline).
      if (limit.signal.aborted && limit.signal.reason !== undefined) throw limit.signal.reason;
      throw error;
    } finally {
      limit.clear();
    }
  }

  async stage(key: string, source: Readable): Promise<StagedBackupObject> {
    // One name per attempt: its random part, which only this attempt knows,
    // is what proves that an upload listed under it is this attempt's.
    const name = `${this.stagingPrefix(key)}${randomBytes(8).toString("hex")}.part`;
    // The first failure is the cause, whatever follows it. Leaving the loop
    // after a provider failure destroys the source, which then fails with a
    // generic AbortError (#151 H3): that one must not replace the provider's.
    let failure: { origin: "provider" | "source"; error: unknown } | undefined;
    // Aborts whatever is in flight as soon as the source fails (413 of the
    // meter, client cut, service deadline), so nothing keeps uploading.
    const controller = new AbortController();
    const onSourceError = (error: unknown) => {
      failure ??= { origin: "source", error };
      controller.abort(error);
    };
    source.once("error", onSourceError);
    const hash = createHash("sha256");
    let bytes = 0;
    let upload: AttemptUpload = { state: "none" };
    const parts: { ETag?: string; PartNumber: number }[] = [];
    let versionId: string | undefined;

    const uploadPart = async (uploadId: string, body: Buffer) => {
      const partNumber = parts.length + 1;
      const out = await this.call<{ ETag?: string }>(
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: name,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
          ContentLength: body.length,
          ContentMD5: md5(body),
        }),
        controller.signal,
      );
      parts.push({ ETag: out.ETag, PartNumber: partNumber });
    };

    try {
      let pending: Buffer[] = [];
      let pendingBytes = 0;
      for await (const chunk of source) {
        try {
          const buffer = chunk as Buffer;
          hash.update(buffer);
          bytes += buffer.length;
          pending.push(buffer);
          pendingBytes += buffer.length;
          // Strictly more than one part: the first S3_PART_BYTES are a
          // non-final part, so a multipart always has at least two parts.
          while (pendingBytes > S3_PART_BYTES) {
            const all = Buffer.concat(pending);
            pending = [all.subarray(S3_PART_BYTES)];
            pendingBytes = all.length - S3_PART_BYTES;
            if (upload.state !== "known") {
              // Until its answer arrives, the upload may exist (#151 5b).
              upload = { state: "unknown" };
              const created = await this.call<{ UploadId?: string }>(
                new CreateMultipartUploadCommand({
                  Bucket: this.bucket,
                  Key: name,
                  ContentType: CONTENT_TYPE,
                  ServerSideEncryption: "AES256",
                }),
                controller.signal,
              ).catch((error: unknown) => {
                if (isDefinitiveRefusal(error)) upload = { state: "none" };
                throw error;
              });
              if (!created.UploadId) throw new Error("S3_MULTIPART_NOT_CREATED");
              upload = { state: "known", uploadId: created.UploadId };
            }
            await uploadPart(upload.uploadId, all.subarray(0, S3_PART_BYTES));
          }
        } catch (error) {
          // Here, before the loop exit destroys the source.
          failure ??= { origin: "provider", error };
          throw error;
        }
      }
      if (failure) throw failure.error;
      const last = Buffer.concat(pending);
      if (upload.state !== "known") {
        const out = await this.call<{ VersionId?: string }>(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: name,
            Body: last,
            ContentLength: last.length,
            ContentMD5: md5(last),
            ContentType: CONTENT_TYPE,
            ServerSideEncryption: "AES256",
          }),
          controller.signal,
        );
        versionId = out.VersionId;
      } else {
        await uploadPart(upload.uploadId, last);
        const out = await this.call<{ VersionId?: string }>(
          new CompleteMultipartUploadCommand({
            Bucket: this.bucket,
            Key: name,
            UploadId: upload.uploadId,
            MultipartUpload: { Parts: parts },
          }),
          controller.signal,
        );
        upload = { state: "none" };
        versionId = out.VersionId;
      }
      if (!versionId) throw new Error("S3_VERSION_MISSING");
    } catch (error) {
      failure ??= { origin: "provider", error };
      controller.abort(failure.error);
      // A second error of the cleanup never replaces the cause: it is reported apart.
      const pending = await this.cleanupStaging(name, upload);
      this.report({
        trigger: "STAGE_FAILED",
        failure: failureOf(failure.origin, failure.error),
        complete: pending.length === 0,
        pending,
      });
      throw failure.error;
    } finally {
      source.off("error", onSourceError);
    }

    const sha256 = hash.digest("hex");
    const stagedVersion = versionId;
    let settled = false;
    return {
      commit: async () => {
        if (settled) throw new Error("Staged backup object already settled");
        settled = true;
        await this.commitStaged(key, name, stagedVersion, bytes, sha256);
      },
      discard: async () => {
        settled = true;
        const pending = await this.cleanupStaging(name, { state: "none" });
        this.report({ trigger: "DISCARDED", complete: pending.length === 0, pending });
      },
    };
  }

  /** A reporter that fails never changes the outcome of the operation. */
  private report(report: S3StagingCleanupReport): void {
    try {
      this.onStagingCleanup?.(report);
    } catch {
      // Nothing to do: the report is an observation, not part of the result.
    }
  }

  /**
   * Removes what one attempt staged under its own `name`, and says what it
   * could not settle (empty: nothing left, checked by listing). It never
   * throws: the service later calls `discardStaged`, and the F10 inventory
   * reconciles what is pending.
   */
  private async cleanupStaging(name: string, upload: AttemptUpload): Promise<S3StagingPending[]> {
    const limit = deadline(this.limits.purgeMs);
    const pending: S3StagingPending[] = [];
    try {
      if (upload.state !== "none")
        pending.push(...(await this.abortAttemptUpload(name, upload, limit.signal)));
      await this.purge((n) => n === name, name, limit.signal).catch(() => {
        pending.push("STAGING_PURGE_FAILED");
      });
    } finally {
      limit.clear();
    }
    return pending;
  }

  /**
   * Aborts the multipart upload of one attempt and checks by listing that
   * none is left under its name. Without its UploadId (the stage left before
   * the answer to CreateMultipartUpload, #151 5b) it is looked up by the
   * attempt's exact name, and aborted only if it is the one upload listed
   * there. Uploads of other names (other attempts of the same key, other
   * keys) are never listed as candidates nor aborted; whatever is uncertain
   * stays, reported as pending.
   */
  private async abortAttemptUpload(
    name: string,
    upload: Exclude<AttemptUpload, { state: "none" }>,
    signal: AbortSignal,
  ): Promise<S3StagingPending[]> {
    const listed = async () => (await this.uploads(name, signal)).filter((u) => u.name === name);
    let uploadId: string;
    if (upload.state === "known") uploadId = upload.uploadId;
    else {
      let found;
      try {
        found = await listed();
      } catch {
        return ["MULTIPART_LISTING_FAILED"];
      }
      if (found.length === 0) return ["MULTIPART_CREATION_UNKNOWN"];
      if (found.length > 1) return ["MULTIPART_OWNERSHIP_AMBIGUOUS"];
      uploadId = found[0].uploadId;
    }
    // A failed abort is seen by the listing that follows.
    await this.call(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: name, UploadId: uploadId }),
      signal,
    ).catch(() => undefined);
    try {
      return (await listed()).length === 0 ? [] : ["MULTIPART_REMAINS"];
    } catch {
      return ["MULTIPART_LISTING_FAILED"];
    }
  }

  private async commitStaged(
    key: string,
    staged: string,
    stagedVersion: string,
    bytes: number,
    sha256: string,
  ): Promise<void> {
    const final = this.objectName(key);
    const limit = deadline(this.limits.commitMs);
    let copied = false;
    try {
      // Server UUID keys are unique per copy: a final name that already has
      // any version or marker is never written. The listing is a check, not
      // an atomic reservation: a writer of the same name between it and the
      // copy would not be detected, and the purges of this commit (the one
      // that keeps only the verified version, and the one of the catch once
      // `copied` is set) would delete that writer's versions. That the
      // window stays empty rests on the server's UUID keys, not on this check.
      if (await this.exists(final, limit.signal)) throw new Error("S3_OBJECT_ALREADY_EXISTS");
      copied = true;
      let copyError: unknown;
      try {
        await this.call(
          new CopyObjectCommand({
            Bucket: this.bucket,
            Key: final,
            CopySource: `${this.bucket}/${staged}?versionId=${encodeURIComponent(stagedVersion)}`,
            MetadataDirective: "REPLACE",
            Metadata: { [SHA256_META]: sha256, [SIZE_META]: String(bytes) },
            ContentType: CONTENT_TYPE,
            ServerSideEncryption: "AES256",
          }),
          limit.signal,
        );
      } catch (error) {
        // Ambiguous (e.g. a timeout after the copy): the head decides.
        copyError = error;
      }
      // A head that fails after a failed copy reports the copy's error.
      const head = await this.head(final, limit.signal).catch((error: unknown) => {
        throw copyError ?? error;
      });
      if (!head || head.sizeBytes !== bytes || head.sha256 !== sha256 || !head.versionId)
        throw copyError ?? new Error("S3_COPY_NOT_VERIFIED");
      // Only one physical version of the final name, and no staging left:
      // otherwise the commit fails (an AVAILABLE copy never leaves residue).
      await this.purge((n) => n === staged, staged, limit.signal);
      await this.purge((n) => n === final, final, limit.signal, head.versionId);
    } catch (error) {
      await this.purge((n) => n === staged, staged, limit.signal).catch(() => undefined);
      if (copied) await this.purge((n) => n === final, final, limit.signal).catch(() => undefined);
      throw error;
    } finally {
      limit.clear();
    }
  }

  /**
   * Whether the exact name has any version or delete marker, by listing it.
   * Not by HeadObject: with the #151 trial's keys, B2 answered 403, not 404,
   * for an absent name. A name that merely starts with this one proves
   * nothing. A denied, invalid or incomplete listing throws: never "absent".
   */
  private async exists(name: string, signal: AbortSignal): Promise<boolean> {
    return (await this.versions(name, signal)).some((v) => v.name === name);
  }

  /** The current version of an existing name; null only on a 404. */
  private async head(
    name: string,
    signal: AbortSignal,
  ): Promise<{ sizeBytes: number; sha256?: string; versionId?: string } | null> {
    try {
      const out = await this.call<{
        ContentLength?: number;
        Metadata?: Record<string, string>;
        VersionId?: string;
      }>(new HeadObjectCommand({ Bucket: this.bucket, Key: name }), signal);
      return {
        sizeBytes: out.ContentLength ?? -1,
        sha256: out.Metadata?.[SHA256_META],
        versionId: out.VersionId,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async open(key: string): Promise<{ sizeBytes: number; stream: Readable }> {
    const name = this.objectName(key);
    // The limit covers the headers only; the body then depends on the
    // socket inactivity timeout, so a long download is not cut.
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(DEADLINE_EXCEEDED)),
      this.limits.openMs,
    );
    timer.unref?.();
    try {
      const out = (await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: name }), {
        abortSignal: controller.signal,
      })) as { ContentLength?: number; Body?: unknown };
      if (out.ContentLength === undefined || !out.Body) throw new Error("S3_EMPTY_RESPONSE");
      return { sizeBytes: out.ContentLength, stream: out.Body as Readable };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (isNotFound(error)) throw new BackupObjectMissingError();
      if (statusOf(error) === 403 && (await this.absentByListing(name, controller.signal)))
        throw new BackupObjectMissingError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * After a 403 to a GetObject (B2 with the #151 trial's keys answered 403
   * for an absent name): true only if a complete, coherent listing of the
   * exact name shows no current version (nothing, or a delete marker on
   * top). A name with a current version, or a listing that is denied,
   * invalid or incomplete, gives false: the caller rethrows the 403.
   */
  private async absentByListing(name: string, signal: AbortSignal): Promise<boolean> {
    try {
      const versions = await this.versions(name, signal);
      const current = currentEntries(versions).get(name);
      return current === undefined || current.deleteMarker;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    const name = this.objectName(key);
    const limit = deadline(this.limits.purgeMs);
    try {
      await this.purge((n) => n === name, name, limit.signal);
    } finally {
      limit.clear();
    }
  }

  async discardStaged(key: string): Promise<void> {
    const prefix = this.stagingPrefix(key);
    const limit = deadline(this.limits.purgeMs);
    try {
      await this.abortUploads((n) => this.isStagingNameOf(key, n), prefix, limit.signal);
      await this.purge((n) => this.isStagingNameOf(key, n), prefix, limit.signal);
    } finally {
      limit.clear();
    }
  }

  /**
   * Deletes, by version id, every version and marker of the names that
   * `match` selects under `prefix` (except `keep`), then lists again and
   * fails if any is left. It works on the whole version inventory, never on
   * IsLatest: `keep` must end as the only entry of its name, and a version.
   */
  private async purge(
    match: (name: string) => boolean,
    prefix: string,
    signal: AbortSignal,
    keep?: string,
  ): Promise<void> {
    const doomed = (await this.versions(prefix, signal)).filter(
      (v) => match(v.name) && v.versionId !== keep,
    );
    for (const version of doomed) {
      await this.call(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: version.name,
          VersionId: version.versionId,
        }),
        signal,
      );
    }
    const left = (await this.versions(prefix, signal)).filter((v) => match(v.name));
    if (left.some((v) => v.versionId !== keep)) throw new Error("S3_VERSIONS_REMAIN");
    if (keep !== undefined && !left.some((v) => v.versionId === keep && !v.deleteMarker))
      throw new Error("S3_VERIFIED_VERSION_MISSING");
  }

  /**
   * Every version and delete marker under `prefix`, all pages, in listing
   * order: the inventory that purges work on. It says nothing about which
   * entry is current (see `currentEntries`). Fails closed (S3ListingError)
   * past `listPages`, on a stalled or invalid page, or on an entry listed
   * twice: an incomplete listing is never returned as complete.
   */
  private async versions(prefix: string, signal: AbortSignal): Promise<StoredVersion[]> {
    const found: StoredVersion[] = [];
    const seen = new Set<string>();
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    for (let index = 0; ; index++) {
      if (index >= this.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
      const page = await this.call<ListedPage | null>(
        new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
        signal,
      );
      if (typeof page !== "object" || page === null || typeof page.IsTruncated !== "boolean")
        throw new S3ListingError("S3_LISTING_INVALID");
      for (const version of versionsOfPage(page, prefix, index)) {
        const id = JSON.stringify([version.name, version.versionId]);
        if (seen.has(id)) throw new S3ListingError("S3_LISTING_INCONSISTENT");
        seen.add(id);
        found.push(version);
      }
      if (!page.IsTruncated) return found;
      if (
        (!page.NextKeyMarker && !page.NextVersionIdMarker) ||
        (page.NextKeyMarker === keyMarker && page.NextVersionIdMarker === versionIdMarker)
      )
        throw new S3ListingError("S3_PAGINATION_STALLED");
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    }
  }

  /**
   * Unfinished multipart uploads under `prefix`, all pages, with the same
   * checks as `versions`: an entry without a name or upload id, outside the
   * prefix or without a valid `Initiated` makes the page invalid (never
   * skipped, never dated 1970: an upload in progress must not look old to
   * the F10 cleanup); a repeated entry, a stalled page or the page limit
   * fail closed.
   */
  private async uploads(
    prefix: string,
    signal: AbortSignal,
  ): Promise<{ name: string; uploadId: string; initiated: Date }[]> {
    const found: { name: string; uploadId: string; initiated: Date }[] = [];
    const seen = new Set<string>();
    let keyMarker: string | undefined;
    let uploadIdMarker: string | undefined;
    for (let index = 0; ; index++) {
      if (index >= this.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
      const page = await this.call<{
        Uploads?: unknown;
        IsTruncated?: boolean;
        NextKeyMarker?: string;
        NextUploadIdMarker?: string;
      } | null>(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
        signal,
      );
      if (
        typeof page !== "object" ||
        page === null ||
        typeof page.IsTruncated !== "boolean" ||
        (page.Uploads !== undefined && !Array.isArray(page.Uploads))
      )
        throw new S3ListingError("S3_LISTING_INVALID");
      for (const u of (page.Uploads ?? []) as { Key?: unknown; UploadId?: unknown; Initiated?: unknown }[]) {
        const valid =
          typeof u === "object" &&
          u !== null &&
          typeof u.Key === "string" &&
          u.Key.startsWith(prefix) &&
          typeof u.UploadId === "string" &&
          u.UploadId.length > 0 &&
          u.Initiated instanceof Date &&
          !Number.isNaN(u.Initiated.getTime());
        if (!valid) throw new S3ListingError("S3_LISTING_INVALID");
        const id = JSON.stringify([u.Key, u.UploadId]);
        if (seen.has(id)) throw new S3ListingError("S3_LISTING_INCONSISTENT");
        seen.add(id);
        found.push({ name: u.Key as string, uploadId: u.UploadId as string, initiated: u.Initiated as Date });
      }
      if (!page.IsTruncated) return found;
      if (
        (!page.NextKeyMarker && !page.NextUploadIdMarker) ||
        (page.NextKeyMarker === keyMarker && page.NextUploadIdMarker === uploadIdMarker)
      )
        throw new S3ListingError("S3_PAGINATION_STALLED");
      keyMarker = page.NextKeyMarker;
      uploadIdMarker = page.NextUploadIdMarker;
    }
  }

  private async abortUploads(
    match: (name: string) => boolean,
    prefix: string,
    signal: AbortSignal,
  ): Promise<void> {
    for (const upload of (await this.uploads(prefix, signal)).filter((u) => match(u.name))) {
      await this.call(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: upload.name,
          UploadId: upload.uploadId,
        }),
        signal,
      );
    }
    if ((await this.uploads(prefix, signal)).some((u) => match(u.name)))
      throw new Error("S3_UPLOADS_REMAIN");
  }

  /**
   * Sum of the parts of an unfinished multipart upload. A part without a
   * valid size, a page without IsTruncated, a stalled page or the page limit
   * fail closed: the size is never undercounted.
   */
  private async uploadedBytes(name: string, uploadId: string, signal: AbortSignal): Promise<number> {
    let total = 0;
    let marker: string | undefined;
    for (let index = 0; ; index++) {
      if (index >= this.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
      const page = await this.call<{
        Parts?: unknown;
        IsTruncated?: boolean;
        NextPartNumberMarker?: string;
      } | null>(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: name,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
        signal,
      );
      if (
        typeof page !== "object" ||
        page === null ||
        typeof page.IsTruncated !== "boolean" ||
        (page.Parts !== undefined && !Array.isArray(page.Parts))
      )
        throw new S3ListingError("S3_LISTING_INVALID");
      for (const part of (page.Parts ?? []) as { Size?: unknown }[]) {
        const size = typeof part === "object" && part !== null ? part.Size : undefined;
        if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0)
          throw new S3ListingError("S3_LISTING_INVALID");
        total += size;
      }
      if (!page.IsTruncated) return total;
      if (!page.NextPartNumberMarker || page.NextPartNumberMarker === marker)
        throw new S3ListingError("S3_PAGINATION_STALLED");
      marker = page.NextPartNumberMarker;
    }
  }

  /**
   * Every version, delete marker and unfinished upload under `objects/` and
   * `staging/` (F10 inventory, #40), one entry each. Only the current entry
   * of a name, when it is a version, is visible (`hidden: false`). A listing
   * that is incomplete or contradicts itself throws (S3ListingError): it is
   * never reported as a complete inventory.
   */
  async list(): Promise<StoredBackupFile[]> {
    const limit = deadline(this.limits.purgeMs);
    try {
      const found: StoredBackupFile[] = [];
      for (const area of ["objects", "staging"] as const) {
        const base = `${this.prefix}${area}/`;
        const versions = await this.versions(base, limit.signal);
        const current = currentEntries(versions);
        for (const version of versions) {
          const name = version.name.slice(base.length);
          if (name.length === 0) continue;
          found.push({
            area,
            name,
            key: area === "objects" ? objectKey(name) : stagingKey(name),
            sizeBytes: version.sizeBytes,
            modifiedAt: version.modifiedAt,
            versionId: version.versionId,
            hidden: version.deleteMarker || current.get(version.name) !== version,
            deleteMarker: version.deleteMarker,
          });
        }
      }
      const base = `${this.prefix}staging/`;
      for (const upload of await this.uploads(base, limit.signal)) {
        const name = upload.name.slice(base.length);
        if (name.length === 0) continue;
        found.push({
          area: "staging",
          name,
          key: stagingKey(name),
          sizeBytes: await this.uploadedBytes(upload.name, upload.uploadId, limit.signal),
          modifiedAt: upload.initiated,
          incompleteUpload: true,
        });
      }
      return found;
    } finally {
      limit.clear();
    }
  }

  async removeStagedFile(name: string): Promise<void> {
    if (stagingKey(name) === null) throw new Error("Not a backup staging file");
    const full = `${this.prefix}staging/${name}`;
    const limit = deadline(this.limits.purgeMs);
    try {
      await this.abortUploads((n) => n === full, full, limit.signal);
      await this.purge((n) => n === full, full, limit.signal);
    } finally {
      limit.clear();
    }
  }
}
