import { createHash, randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import {
  assertStorageKey,
  BackupObjectMissingError,
  BackupStorage,
  BackupStorageInventory,
  StagedBackupObject,
  StoredBackupFile,
  stagingKey,
} from "../domain/backup-storage.port";
import { DEADLINE_EXCEEDED, deadline, failureOf, isNotFound, statusOf } from "./s3/s3-backup-protocol";
import {
  abortMatchingUploads,
  absentByListing,
  cleanupStagingAttempt,
  listStoredBackups,
  purgeVersions,
} from "./s3/s3-backup-reconciliation";
import { commitStagedObject, StagingStreamState, uploadStagingStream } from "./s3/s3-backup-stage";
import {
  S3_LIMITS,
  S3BackupStorageSettings,
  S3ClientContext,
  S3Limits,
  S3Sender,
  S3StagingCleanupReport,
} from "./s3/s3-backup-storage.types";

export { createS3Client, S3_LIMITS, S3_PART_BYTES, S3ListingError } from "./s3/s3-backup-storage.types";
export type {
  S3BackupStorageSettings,
  S3Limits,
  S3Sender,
  S3StagingCleanupReport,
  S3StagingPending,
} from "./s3/s3-backup-storage.types";

/**
 * F08-BKP-07: `BackupStorage` on an S3-compatible bucket (Backblaze B2,
 * "Keep all versions").
 *
 * Layout under the prefix: `objects/<key>` (committed) and
 * `staging/<key>.<random>.part`. Existence and visibility come from version
 * listings, never from a 404 or from IsLatest alone (#151).
 */
export class S3BackupStorage implements BackupStorage, BackupStorageInventory {
  private readonly ctx: S3ClientContext;

  constructor(
    private readonly s3: S3Sender,
    settings: Pick<S3BackupStorageSettings, "bucket" | "prefix">,
    private readonly limits: S3Limits = S3_LIMITS,
    private readonly onStagingCleanup?: (report: S3StagingCleanupReport) => void,
  ) {
    this.ctx = { s3, bucket: settings.bucket, prefix: settings.prefix, limits };
  }

  private objectName(key: string): string {
    assertStorageKey(key);
    return `${this.ctx.prefix}objects/${key}`;
  }

  private stagingPrefix(key: string): string {
    assertStorageKey(key);
    return `${this.ctx.prefix}staging/${key}.`;
  }

  private isStagingNameOf(key: string, name: string): boolean {
    const local = name.slice(`${this.ctx.prefix}staging/`.length);
    return name.startsWith(this.stagingPrefix(key)) && stagingKey(local) === key;
  }

  async stage(key: string, source: Readable): Promise<StagedBackupObject> {
    const name = `${this.stagingPrefix(key)}${randomBytes(8).toString("hex")}.part`;
    let failure: { origin: "provider" | "source"; error: unknown } | undefined;
    const controller = new AbortController();
    const onSourceError = (error: unknown) => {
      failure ??= { origin: "source", error };
      controller.abort(error);
    };
    source.once("error", onSourceError);

    const state: StagingStreamState = {
      hash: createHash("sha256"),
      bytes: 0,
      upload: { state: "none" },
      parts: [],
    };
    let versionId: string;
    try {
      versionId = await uploadStagingStream(this.ctx, name, source, controller.signal, state, (err) => {
        failure ??= { origin: "provider", error: err };
      });
      if (failure) throw failure.error;
    } catch (error) {
      failure ??= { origin: "provider", error };
      controller.abort(failure.error);
      const pending = await cleanupStagingAttempt(this.ctx, name, state.upload);
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

    const sha256 = state.hash.digest("hex");
    let settled = false;
    return {
      commit: async () => {
        if (settled) throw new Error("Staged backup object already settled");
        settled = true;
        await commitStagedObject(this.ctx, this.objectName(key), name, versionId, state.bytes, sha256);
      },
      discard: async () => {
        settled = true;
        const pending = await cleanupStagingAttempt(this.ctx, name, { state: "none" });
        this.report({ trigger: "DISCARDED", complete: pending.length === 0, pending });
      },
    };
  }

  /** A reporter that fails never changes the outcome of the operation. */
  private report(report: S3StagingCleanupReport): void {
    try {
      this.onStagingCleanup?.(report);
    } catch {
      // Observation only, never part of the result.
    }
  }

  async open(key: string): Promise<{ sizeBytes: number; stream: Readable }> {
    const name = this.objectName(key);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(DEADLINE_EXCEEDED)),
      this.limits.openMs,
    );
    timer.unref?.();
    try {
      const out = (await this.s3.send(new GetObjectCommand({ Bucket: this.ctx.bucket, Key: name }), {
        abortSignal: controller.signal,
      })) as { ContentLength?: number; Body?: unknown };
      if (out.ContentLength === undefined || !out.Body) throw new Error("S3_EMPTY_RESPONSE");
      return { sizeBytes: out.ContentLength, stream: out.Body as Readable };
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (isNotFound(error)) throw new BackupObjectMissingError();
      if (statusOf(error) === 403 && (await absentByListing(this.ctx, name, controller.signal)))
        throw new BackupObjectMissingError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async remove(key: string): Promise<void> {
    const name = this.objectName(key);
    const limit = deadline(this.limits.purgeMs);
    try {
      await purgeVersions(this.ctx, (n) => n === name, name, limit.signal);
    } finally {
      limit.clear();
    }
  }

  async discardStaged(key: string): Promise<void> {
    const prefix = this.stagingPrefix(key);
    const limit = deadline(this.limits.purgeMs);
    try {
      await abortMatchingUploads(this.ctx, (n) => this.isStagingNameOf(key, n), prefix, limit.signal);
      await purgeVersions(this.ctx, (n) => this.isStagingNameOf(key, n), prefix, limit.signal);
    } finally {
      limit.clear();
    }
  }

  async list(): Promise<StoredBackupFile[]> {
    return listStoredBackups(this.ctx);
  }

  async removeStagedFile(name: string): Promise<void> {
    if (stagingKey(name) === null) throw new Error("Not a backup staging file");
    const full = `${this.ctx.prefix}staging/${name}`;
    const limit = deadline(this.limits.purgeMs);
    try {
      await abortMatchingUploads(this.ctx, (n) => n === full, full, limit.signal);
      await purgeVersions(this.ctx, (n) => n === full, full, limit.signal);
    } finally {
      limit.clear();
    }
  }
}
