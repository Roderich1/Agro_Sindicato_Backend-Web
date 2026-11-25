import { S3Client } from "@aws-sdk/client-s3";

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
    code:
      | "S3_LISTING_INCOMPLETE"
      | "S3_LISTING_INVALID"
      | "S3_LISTING_INCONSISTENT"
      | "S3_PAGINATION_STALLED",
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

/** Internal execution context passed across S3 backup helpers. */
export interface S3ClientContext {
  readonly s3: S3Sender;
  readonly bucket: string;
  readonly prefix: string;
  readonly limits: S3Limits;
}

/** A version (or delete marker) of one exact name, as listed. */
export interface StoredVersion {
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

/** A multipart upload of one attempt: none, its UploadId, or created without an answer. */
export type AttemptUpload =
  | { state: "none" }
  | { state: "known"; uploadId: string }
  | { state: "unknown" };

/** One entry of a `ListObjectVersions` page (a version or a delete marker). */
export interface ListedVersion {
  Key?: string;
  VersionId?: string;
  IsLatest?: boolean;
  Size?: number;
  LastModified?: Date;
}

/** One `ListObjectVersions` page, before it is checked. */
export interface ListedPage {
  Versions?: ListedVersion[];
  DeleteMarkers?: ListedVersion[];
  IsTruncated?: boolean;
  NextKeyMarker?: string;
  NextVersionIdMarker?: string;
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
