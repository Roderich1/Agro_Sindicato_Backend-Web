import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
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
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type { S3Sender } from "../infrastructure/s3-backup-storage";

/**
 * «Doble S3 en memoria» (F08-BKP-07): an in-memory imitation of the part of
 * the S3 API that `S3BackupStorage` uses, with a versioned bucket ("Keep all
 * versions"), delete markers, multipart uploads, Content-MD5 checks and
 * paginated listings. It is a test double: **it is not Backblaze B2** and
 * proves nothing about the real provider.
 *
 * Stricter than S3 where B2 is uncertain: a multipart upload must have at
 * least two parts.
 */
export const MIN_PART_BYTES = 5_000_000;

export interface StoredVersionRecord {
  versionId: string;
  deleteMarker: boolean;
  body: Buffer;
  metadata: Record<string, string>;
  lastModified: Date;
}

interface UploadRecord {
  key: string;
  parts: Map<number, Buffer>;
  initiated: Date;
}

export interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

/** Hook run before a command; it may throw, or hang until the call is aborted. */
export type CommandHook = (
  command: SentCommand,
  signal: AbortSignal,
) => void | Promise<void>;

export function s3Error(name: string, status: number): Error {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });
}

/** What the SDK rejects an aborted call with: a generic AbortError, not the reason. */
export function abortError(): Error {
  return Object.assign(new Error("Request aborted"), { name: "AbortError" });
}

/** Never settles unless the call is aborted: a hung request. */
export function hang(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => reject(abortError());
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export class InMemoryS3 implements S3Sender {
  readonly objects = new Map<string, StoredVersionRecord[]>();
  readonly uploads = new Map<string, UploadRecord>();
  readonly sent: SentCommand[] = [];
  /** Page size of the listings (small values exercise pagination). */
  pageSize = 1000;
  before?: CommandHook;
  /** Run after the command took effect (e.g. a timeout after the copy). */
  after?: CommandHook;
  private clock = 0;

  constructor(readonly bucket: string) {}

  /** Every version and marker of `key`, oldest first. */
  versionsOf(key: string): StoredVersionRecord[] {
    return this.objects.get(key) ?? [];
  }

  /** Every name with at least one version or marker under `prefix`. */
  names(prefix = ""): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix) && this.versionsOf(k).length).sort();
  }

  /** Total stored versions and markers, plus unfinished uploads. */
  totalEntries(): number {
    let total = this.uploads.size;
    for (const versions of this.objects.values()) total += versions.length;
    return total;
  }

  /** Writes a version directly, bypassing the adapter (a third party). */
  putDirect(key: string, body: Buffer, metadata: Record<string, string> = {}): string {
    return this.addVersion(key, { deleteMarker: false, body, metadata });
  }

  /** A delete marker written directly (a third party deleting without a version id). */
  hideDirect(key: string): string {
    return this.addVersion(key, { deleteMarker: true, body: Buffer.alloc(0), metadata: {} });
  }

  private addVersion(
    key: string,
    record: Pick<StoredVersionRecord, "deleteMarker" | "body" | "metadata">,
  ): string {
    const versionId = randomUUID().replace(/-/g, "");
    const versions = this.objects.get(key) ?? [];
    versions.push({ ...record, versionId, lastModified: new Date(Date.UTC(2026, 9, 19) + ++this.clock) });
    this.objects.set(key, versions);
    return versionId;
  }

  private latest(key: string): StoredVersionRecord | undefined {
    const versions = this.versionsOf(key);
    return versions[versions.length - 1];
  }

  async send(command: object, options: { abortSignal: AbortSignal }): Promise<unknown> {
    const signal = options.abortSignal;
    const input = (command as { input: Record<string, unknown> }).input;
    const sent = { name: command.constructor.name, input };
    this.sent.push(sent);
    if (signal.aborted) throw abortError();
    if (input["Bucket"] !== this.bucket) throw s3Error("NoSuchBucket", 404);
    await this.before?.(sent, signal);
    if (signal.aborted) throw abortError();
    const result = this.apply(command, input);
    await this.after?.(sent, signal);
    return result;
  }

  private checkMd5(input: Record<string, unknown>, body: Buffer) {
    const declared = input["ContentMD5"];
    if (typeof declared !== "string") throw s3Error("MissingContentMD5", 400);
    if (createHash("md5").update(body).digest("base64") !== declared) throw s3Error("BadDigest", 400);
    if (input["ContentLength"] !== body.length) throw s3Error("IncompleteBody", 400);
  }

  private apply(command: object, input: Record<string, unknown>): unknown {
    const key = input["Key"] as string;
    if (command instanceof PutObjectCommand) {
      const body = input["Body"] as Buffer;
      this.checkMd5(input, body);
      return { VersionId: this.addVersion(key, { deleteMarker: false, body, metadata: {} }) };
    }
    if (command instanceof CreateMultipartUploadCommand) {
      const uploadId = randomUUID();
      this.uploads.set(uploadId, { key, parts: new Map(), initiated: new Date(Date.UTC(2026, 9, 19) + ++this.clock) });
      return { UploadId: uploadId };
    }
    if (command instanceof UploadPartCommand) {
      const upload = this.uploads.get(input["UploadId"] as string);
      if (!upload || upload.key !== key) throw s3Error("NoSuchUpload", 404);
      const body = input["Body"] as Buffer;
      this.checkMd5(input, body);
      upload.parts.set(input["PartNumber"] as number, body);
      return { ETag: `"${createHash("md5").update(body).digest("hex")}"` };
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      const uploadId = input["UploadId"] as string;
      const upload = this.uploads.get(uploadId);
      if (!upload || upload.key !== key) throw s3Error("NoSuchUpload", 404);
      const listed = ((input["MultipartUpload"] as { Parts?: { PartNumber?: number }[] }).Parts ?? []).map(
        (p) => p.PartNumber!,
      );
      if (listed.length < 2) throw s3Error("EntityTooSmall", 400);
      const bodies = listed.map((n) => {
        const body = upload.parts.get(n);
        if (!body) throw s3Error("InvalidPart", 400);
        return body;
      });
      if (bodies.slice(0, -1).some((b) => b.length < MIN_PART_BYTES)) throw s3Error("EntityTooSmall", 400);
      this.uploads.delete(uploadId);
      return {
        VersionId: this.addVersion(key, { deleteMarker: false, body: Buffer.concat(bodies), metadata: {} }),
      };
    }
    if (command instanceof AbortMultipartUploadCommand) {
      const uploadId = input["UploadId"] as string;
      if (!this.uploads.has(uploadId)) throw s3Error("NoSuchUpload", 404);
      this.uploads.delete(uploadId);
      return {};
    }
    if (command instanceof CopyObjectCommand) {
      const source = /^([^/]+)\/([^?]+)\?versionId=(.+)$/.exec(input["CopySource"] as string);
      if (!source || source[1] !== this.bucket) throw s3Error("InvalidArgument", 400);
      const from = this.versionsOf(source[2]).find(
        (v) => v.versionId === decodeURIComponent(source[3]) && !v.deleteMarker,
      );
      if (!from) throw s3Error("NoSuchVersion", 404);
      const metadata =
        input["MetadataDirective"] === "REPLACE"
          ? { ...((input["Metadata"] as Record<string, string>) ?? {}) }
          : { ...from.metadata };
      return { VersionId: this.addVersion(key, { deleteMarker: false, body: from.body, metadata }) };
    }
    if (command instanceof HeadObjectCommand || command instanceof GetObjectCommand) {
      const latest = this.latest(key);
      if (!latest || latest.deleteMarker)
        throw s3Error(command instanceof HeadObjectCommand ? "NotFound" : "NoSuchKey", 404);
      return {
        ContentLength: latest.body.length,
        Metadata: { ...latest.metadata },
        VersionId: latest.versionId,
        ...(command instanceof GetObjectCommand ? { Body: Readable.from([latest.body]) } : {}),
      };
    }
    if (command instanceof DeleteObjectCommand) {
      const versionId = input["VersionId"] as string | undefined;
      if (versionId === undefined) {
        // S3 semantics in a versioned bucket: only a marker; bytes remain.
        return { DeleteMarker: true, VersionId: this.hideDirect(key) };
      }
      const left = this.versionsOf(key).filter((v) => v.versionId !== versionId);
      if (left.length) this.objects.set(key, left);
      else this.objects.delete(key);
      return {};
    }
    if (command instanceof ListObjectVersionsCommand) return this.listVersions(input);
    if (command instanceof ListMultipartUploadsCommand) return this.listUploads(input);
    if (command instanceof ListPartsCommand) {
      const upload = this.uploads.get(input["UploadId"] as string);
      if (!upload || upload.key !== key) throw s3Error("NoSuchUpload", 404);
      return {
        Parts: [...upload.parts.entries()]
          .sort(([a], [b]) => a - b)
          .map(([n, b]) => ({ PartNumber: n, Size: b.length })),
        IsTruncated: false,
      };
    }
    throw new Error(`InMemoryS3: unsupported command ${command.constructor.name}`);
  }

  /** Key ascending, newest version first, as S3 lists them. */
  private listVersions(input: Record<string, unknown>) {
    const prefix = (input["Prefix"] as string | undefined) ?? "";
    const all = this.names(prefix).flatMap((key) =>
      [...this.versionsOf(key)].reverse().map((v, i) => ({ key, v, latest: i === 0 })),
    );
    const keyMarker = input["KeyMarker"] as string | undefined;
    const versionIdMarker = input["VersionIdMarker"] as string | undefined;
    let start = 0;
    if (keyMarker !== undefined) {
      start = versionIdMarker
        ? all.findIndex((e) => e.key === keyMarker && e.v.versionId === versionIdMarker) + 1
        : all.findIndex((e) => e.key > keyMarker);
      if (start < 0) start = all.length;
    }
    const page = all.slice(start, start + this.pageSize);
    const truncated = start + this.pageSize < all.length;
    const last = page[page.length - 1];
    return {
      Versions: page
        .filter((e) => !e.v.deleteMarker)
        .map((e) => ({
          Key: e.key,
          VersionId: e.v.versionId,
          IsLatest: e.latest,
          Size: e.v.body.length,
          LastModified: e.v.lastModified,
        })),
      DeleteMarkers: page
        .filter((e) => e.v.deleteMarker)
        .map((e) => ({ Key: e.key, VersionId: e.v.versionId, IsLatest: e.latest, LastModified: e.v.lastModified })),
      IsTruncated: truncated,
      NextKeyMarker: truncated ? last.key : undefined,
      NextVersionIdMarker: truncated ? last.v.versionId : undefined,
    };
  }

  private listUploads(input: Record<string, unknown>) {
    const prefix = (input["Prefix"] as string | undefined) ?? "";
    const all = [...this.uploads.entries()]
      .filter(([, u]) => u.key.startsWith(prefix))
      .map(([uploadId, u]) => ({ uploadId, ...u }))
      .sort((a, b) => a.key.localeCompare(b.key) || a.uploadId.localeCompare(b.uploadId));
    const keyMarker = input["KeyMarker"] as string | undefined;
    const uploadIdMarker = input["UploadIdMarker"] as string | undefined;
    let start = 0;
    if (keyMarker !== undefined) {
      start = all.findIndex((u) => u.key === keyMarker && u.uploadId === uploadIdMarker) + 1;
      if (start <= 0) start = all.findIndex((u) => u.key > keyMarker);
      if (start < 0) start = all.length;
    }
    const page = all.slice(start, start + this.pageSize);
    const truncated = start + this.pageSize < all.length;
    const last = page[page.length - 1];
    return {
      Uploads: page.map((u) => ({ Key: u.key, UploadId: u.uploadId, Initiated: u.initiated })),
      IsTruncated: truncated,
      NextKeyMarker: truncated ? last.key : undefined,
      NextUploadIdMarker: truncated ? last.uploadId : undefined,
    };
  }
}
