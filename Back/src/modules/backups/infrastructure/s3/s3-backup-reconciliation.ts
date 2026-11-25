import {
  AbortMultipartUploadCommand,
  DeleteObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectVersionsCommand,
  ListPartsCommand,
} from "@aws-sdk/client-s3";
import { objectKey, stagingKey, StoredBackupFile } from "../../domain/backup-storage.port";
import { currentEntries, deadline, sendS3Command, versionsOfPage } from "./s3-backup-protocol";
import {
  AttemptUpload,
  ListedPage,
  S3ClientContext,
  S3ListingError,
  S3StagingPending,
  StoredVersion,
} from "./s3-backup-storage.types";

/**
 * Every version and delete marker under `prefix`, all pages, in listing order.
 * Fails closed (`S3ListingError`) past `listPages`, on a stalled or invalid
 * page, or on an entry listed twice.
 */
export async function listVersions(
  ctx: S3ClientContext,
  prefix: string,
  signal: AbortSignal,
): Promise<StoredVersion[]> {
  const found: StoredVersion[] = [];
  const seen = new Set<string>();
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  for (let index = 0; ; index++) {
    if (index >= ctx.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
    const page = await sendS3Command<ListedPage | null>(
      ctx,
      new ListObjectVersionsCommand({
        Bucket: ctx.bucket,
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

/** Unfinished multipart uploads under `prefix`, all pages, with fail-closed validation. */
export async function listUploads(
  ctx: S3ClientContext,
  prefix: string,
  signal: AbortSignal,
): Promise<{ name: string; uploadId: string; initiated: Date }[]> {
  const found: { name: string; uploadId: string; initiated: Date }[] = [];
  const seen = new Set<string>();
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;
  for (let index = 0; ; index++) {
    if (index >= ctx.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
    const page = await sendS3Command<{
      Uploads?: unknown;
      IsTruncated?: boolean;
      NextKeyMarker?: string;
      NextUploadIdMarker?: string;
    } | null>(
      ctx,
      new ListMultipartUploadsCommand({
        Bucket: ctx.bucket,
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

export async function abortMatchingUploads(
  ctx: S3ClientContext,
  match: (name: string) => boolean,
  prefix: string,
  signal: AbortSignal,
): Promise<void> {
  for (const upload of (await listUploads(ctx, prefix, signal)).filter((u) => match(u.name))) {
    await sendS3Command(
      ctx,
      new AbortMultipartUploadCommand({
        Bucket: ctx.bucket,
        Key: upload.name,
        UploadId: upload.uploadId,
      }),
      signal,
    );
  }
  if ((await listUploads(ctx, prefix, signal)).some((u) => match(u.name)))
    throw new Error("S3_UPLOADS_REMAIN");
}

/** Sum of the parts of an unfinished multipart upload; fails closed on invalid pages. */
export async function uploadedBytesForUpload(
  ctx: S3ClientContext,
  name: string,
  uploadId: string,
  signal: AbortSignal,
): Promise<number> {
  let total = 0;
  let marker: string | undefined;
  for (let index = 0; ; index++) {
    if (index >= ctx.limits.listPages) throw new S3ListingError("S3_LISTING_INCOMPLETE");
    const page = await sendS3Command<{
      Parts?: unknown;
      IsTruncated?: boolean;
      NextPartNumberMarker?: string;
    } | null>(
      ctx,
      new ListPartsCommand({
        Bucket: ctx.bucket,
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

/** Deletes by version id every matching version/marker under `prefix` except `keep`. */
export async function purgeVersions(
  ctx: S3ClientContext,
  match: (name: string) => boolean,
  prefix: string,
  signal: AbortSignal,
  keep?: string,
): Promise<void> {
  const doomed = (await listVersions(ctx, prefix, signal)).filter(
    (v) => match(v.name) && v.versionId !== keep,
  );
  for (const version of doomed) {
    await sendS3Command(
      ctx,
      new DeleteObjectCommand({
        Bucket: ctx.bucket,
        Key: version.name,
        VersionId: version.versionId,
      }),
      signal,
    );
  }
  const left = (await listVersions(ctx, prefix, signal)).filter((v) => match(v.name));
  if (left.some((v) => v.versionId !== keep)) throw new Error("S3_VERSIONS_REMAIN");
  if (keep !== undefined && !left.some((v) => v.versionId === keep && !v.deleteMarker))
    throw new Error("S3_VERIFIED_VERSION_MISSING");
}

async function abortAttemptUpload(
  ctx: S3ClientContext,
  name: string,
  upload: Exclude<AttemptUpload, { state: "none" }>,
  signal: AbortSignal,
): Promise<S3StagingPending[]> {
  const listed = async () => (await listUploads(ctx, name, signal)).filter((u) => u.name === name);
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
  await sendS3Command(
    ctx,
    new AbortMultipartUploadCommand({ Bucket: ctx.bucket, Key: name, UploadId: uploadId }),
    signal,
  ).catch(() => undefined);
  try {
    return (await listed()).length === 0 ? [] : ["MULTIPART_REMAINS"];
  } catch {
    return ["MULTIPART_LISTING_FAILED"];
  }
}

/** Removes what one attempt staged under its own `name`; never throws. */
export async function cleanupStagingAttempt(
  ctx: S3ClientContext,
  name: string,
  upload: AttemptUpload,
): Promise<S3StagingPending[]> {
  const limit = deadline(ctx.limits.purgeMs);
  const pending: S3StagingPending[] = [];
  try {
    if (upload.state !== "none")
      pending.push(...(await abortAttemptUpload(ctx, name, upload, limit.signal)));
    await purgeVersions(ctx, (n) => n === name, name, limit.signal).catch(() => {
      pending.push("STAGING_PURGE_FAILED");
    });
  } finally {
    limit.clear();
  }
  return pending;
}

/** True only if a complete listing shows no current version for `name`. */
export async function absentByListing(
  ctx: S3ClientContext,
  name: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    const versions = await listVersions(ctx, name, signal);
    const current = currentEntries(versions).get(name);
    return current === undefined || current.deleteMarker;
  } catch {
    return false;
  }
}

/** Lists every version, delete marker, and incomplete multipart upload under objects/ and staging/. */
export async function listStoredBackups(ctx: S3ClientContext): Promise<StoredBackupFile[]> {
  const limit = deadline(ctx.limits.purgeMs);
  try {
    const found: StoredBackupFile[] = [];
    for (const area of ["objects", "staging"] as const) {
      const base = `${ctx.prefix}${area}/`;
      const versions = await listVersions(ctx, base, limit.signal);
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
    const base = `${ctx.prefix}staging/`;
    for (const upload of await listUploads(ctx, base, limit.signal)) {
      const name = upload.name.slice(base.length);
      if (name.length === 0) continue;
      found.push({
        area: "staging",
        name,
        key: stagingKey(name),
        sizeBytes: await uploadedBytesForUpload(ctx, upload.name, upload.uploadId, limit.signal),
        modifiedAt: upload.initiated,
        incompleteUpload: true,
      });
    }
    return found;
  } finally {
    limit.clear();
  }
}
