import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import {
  CONTENT_TYPE,
  deadline,
  isDefinitiveRefusal,
  isNotFound,
  md5,
  sendS3Command,
  SHA256_META,
  SIZE_META,
} from "./s3-backup-protocol";
import { listVersions, purgeVersions } from "./s3-backup-reconciliation";
import { AttemptUpload, S3_PART_BYTES, S3ClientContext } from "./s3-backup-storage.types";

export interface StagingStreamState {
  hash: ReturnType<typeof createHash>;
  bytes: number;
  upload: AttemptUpload;
  parts: { ETag?: string; PartNumber: number }[];
}

export async function uploadStagingStream(
  ctx: S3ClientContext,
  name: string,
  source: Readable,
  signal: AbortSignal,
  state: StagingStreamState,
  onProviderError: (error: unknown) => void,
): Promise<string> {
  const uploadPart = async (uploadId: string, body: Buffer) => {
    const partNumber = state.parts.length + 1;
    const out = await sendS3Command<{ ETag?: string }>(
      ctx,
      new UploadPartCommand({
        Bucket: ctx.bucket,
        Key: name,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: body.length,
        ContentMD5: md5(body),
      }),
      signal,
    );
    state.parts.push({ ETag: out.ETag, PartNumber: partNumber });
  };

  let pending: Buffer[] = [];
  let pendingBytes = 0;
  for await (const chunk of source) {
    try {
      const buffer = chunk as Buffer;
      state.hash.update(buffer);
      state.bytes += buffer.length;
      pending.push(buffer);
      pendingBytes += buffer.length;
      while (pendingBytes > S3_PART_BYTES) {
        const all = Buffer.concat(pending);
        pending = [all.subarray(S3_PART_BYTES)];
        pendingBytes = all.length - S3_PART_BYTES;
        if (state.upload.state !== "known") {
          state.upload = { state: "unknown" };
          const created = await sendS3Command<{ UploadId?: string }>(
            ctx,
            new CreateMultipartUploadCommand({
              Bucket: ctx.bucket,
              Key: name,
              ContentType: CONTENT_TYPE,
              ServerSideEncryption: "AES256",
            }),
            signal,
          ).catch((error: unknown) => {
            if (isDefinitiveRefusal(error)) state.upload = { state: "none" };
            throw error;
          });
          if (!created.UploadId) throw new Error("S3_MULTIPART_NOT_CREATED");
          state.upload = { state: "known", uploadId: created.UploadId };
        }
        await uploadPart(state.upload.uploadId, all.subarray(0, S3_PART_BYTES));
      }
    } catch (error) {
      onProviderError(error);
      throw error;
    }
  }

  const last = Buffer.concat(pending);
  let versionId: string | undefined;
  if (state.upload.state !== "known") {
    const out = await sendS3Command<{ VersionId?: string }>(
      ctx,
      new PutObjectCommand({
        Bucket: ctx.bucket,
        Key: name,
        Body: last,
        ContentLength: last.length,
        ContentMD5: md5(last),
        ContentType: CONTENT_TYPE,
        ServerSideEncryption: "AES256",
      }),
      signal,
    );
    versionId = out.VersionId;
  } else {
    await uploadPart(state.upload.uploadId, last);
    const out = await sendS3Command<{ VersionId?: string }>(
      ctx,
      new CompleteMultipartUploadCommand({
        Bucket: ctx.bucket,
        Key: name,
        UploadId: state.upload.uploadId,
        MultipartUpload: { Parts: state.parts },
      }),
      signal,
    );
    state.upload = { state: "none" };
    versionId = out.VersionId;
  }
  if (!versionId) throw new Error("S3_VERSION_MISSING");
  return versionId;
}

export async function commitStagedObject(
  ctx: S3ClientContext,
  final: string,
  staged: string,
  stagedVersion: string,
  bytes: number,
  sha256: string,
): Promise<void> {
  const limit = deadline(ctx.limits.commitMs);
  let copied = false;
  try {
    if ((await listVersions(ctx, final, limit.signal)).some((v) => v.name === final))
      throw new Error("S3_OBJECT_ALREADY_EXISTS");
    copied = true;
    let copyError: unknown;
    try {
      await sendS3Command(
        ctx,
        new CopyObjectCommand({
          Bucket: ctx.bucket,
          Key: final,
          CopySource: `${ctx.bucket}/${staged}?versionId=${encodeURIComponent(stagedVersion)}`,
          MetadataDirective: "REPLACE",
          Metadata: { [SHA256_META]: sha256, [SIZE_META]: String(bytes) },
          ContentType: CONTENT_TYPE,
          ServerSideEncryption: "AES256",
        }),
        limit.signal,
      );
    } catch (error) {
      copyError = error;
    }
    const head = await headObject(ctx, final, limit.signal).catch((error: unknown) => {
      throw copyError ?? error;
    });
    if (!head || head.sizeBytes !== bytes || head.sha256 !== sha256 || !head.versionId)
      throw copyError ?? new Error("S3_COPY_NOT_VERIFIED");
    await purgeVersions(ctx, (n) => n === staged, staged, limit.signal);
    await purgeVersions(ctx, (n) => n === final, final, limit.signal, head.versionId);
  } catch (error) {
    await purgeVersions(ctx, (n) => n === staged, staged, limit.signal).catch(() => undefined);
    if (copied) await purgeVersions(ctx, (n) => n === final, final, limit.signal).catch(() => undefined);
    throw error;
  } finally {
    limit.clear();
  }
}

async function headObject(
  ctx: S3ClientContext,
  name: string,
  signal: AbortSignal,
): Promise<{ sizeBytes: number; sha256?: string; versionId?: string } | null> {
  try {
    const out = await sendS3Command<{
      ContentLength?: number;
      Metadata?: Record<string, string>;
      VersionId?: string;
    }>(ctx, new HeadObjectCommand({ Bucket: ctx.bucket, Key: name }), signal);
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
