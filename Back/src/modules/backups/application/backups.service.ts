import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BackupMetadata, Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { finished } from "node:stream";
import type { Readable } from "node:stream";
import { clearTimeout, setTimeout } from "node:timers";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  BACKUP_STORAGE,
  BackupObjectMissingError,
  BackupStorage,
} from "../domain/backup-storage.port";
import { BackupHttpError, BackupOwnerContext } from "./backup-http-error";
import { purgePending } from "./backup-retention";
import {
  ACCEPTED_FORMATS,
  ENVELOPE_HEADER_BYTES,
  FORMAT_PLAIN_CONTAINER,
  hasDeclaredShape,
} from "./backup-format";
import { BACKUP_UPLOAD_ABANDON_MS, BackupsConfig } from "./backups-config";
import {
  BackupTooLargeError,
  BackupTransferIncompleteError,
  Sha256Meter,
} from "./sha256-meter";

export const BACKUP_CONTENT_TYPE = "application/octet-stream";
const SHA256_HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORMAT_VERSION = /^[1-9][0-9]{0,3}$/;
const SCHEMA_VERSION = /^(0|[1-9][0-9]{0,3})$/;

/** Public view of a backup: no storage key, owner, tenant or file name. */
export interface BackupView {
  id: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
}

export interface BackupUploadHeaders {
  contentType: string | undefined;
  contentLength: string | undefined;
  sha256: string | undefined;
  formatVersion: string | undefined;
  schemaVersion: string | undefined;
}

export interface BackupDownload {
  view: BackupView;
  stream: Readable;
}

const NOT_FOUND = () => new BackupHttpError(404, "BACKUP_NOT_FOUND");

/** The upload outlived BACKUP_UPLOAD_DEADLINE_MS: its transfer is cut. */
class BackupUploadDeadlineError extends Error {
  constructor() {
    super("BACKUP_UPLOAD_DEADLINE");
  }
}

/** Serialises reservation, completion and deletion of one Member's copies. */
async function lockOwner(tx: Prisma.TransactionClient, owner: BackupOwnerContext) {
  const lockKey = `backup:${owner.tenantId}:${owner.memberId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

export function uploadHeadersOf(request: IncomingMessage): BackupUploadHeaders {
  return {
    contentType: single(request.headers["content-type"]),
    contentLength: single(request.headers["content-length"]),
    sha256: single(request.headers["x-content-sha256"]),
    formatVersion: single(request.headers["x-backup-format-version"]),
    schemaVersion: single(request.headers["x-backup-schema-version"]),
  };
}

function toView(row: BackupMetadata): BackupView {
  return {
    id: row.id,
    sha256: row.sha256,
    sizeBytes: Number(row.sizeBytes ?? 0n),
    contentType: row.contentType,
    formatVersion: row.formatVersion,
    schemaVersion: row.schemaVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * F08-BKP-01/02/03 (#37, #38, #39): private, owner-scoped backups.
 *
 * Every query is scoped by the authenticated tenant and Member: a backup of
 * another Member or tenant is indistinguishable from a missing one (404).
 * Nothing here reads or writes Sync v1 or collective tables (F06 §8).
 *
 * Retention (F08-BKP-06, #40; `docs/architecture/F08_BKP_06_RETENCION.md`):
 * the N most recent verified copies are kept (N =
 * `BACKUP_MAX_ACTIVE_PER_MEMBER`). A copy is retired only in the transaction
 * that makes a newer one AVAILABLE, never by age, never the last one. At most
 * one upload per Member is in progress, and AVAILABLE + UPLOADING + rows
 * pending purge never exceed N + 1.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger("Backups");

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: BackupsConfig,
    @Inject(BACKUP_STORAGE) private readonly storage: BackupStorage | null,
  ) {}

  private requireStorage(): BackupStorage {
    if (!this.storage) throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    return this.storage;
  }

  async list(owner: BackupOwnerContext): Promise<{ backups: BackupView[] }> {
    this.requireStorage();
    const rows = await this.prisma.backupMetadata.findMany({
      where: { tenantId: owner.tenantId, memberId: owner.memberId, status: "AVAILABLE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { backups: rows.map(toView) };
  }

  /**
   * Streams the body to staging while hashing and counting it. The copy
   * becomes AVAILABLE only after the server-computed SHA-256 matches the
   * declared one and the object is committed; in that same transaction the
   * copies beyond the N most recent are retired. Any failure leaves the row
   * FAILED (never listed) with its bytes pending purge, and no earlier
   * AVAILABLE copy is retired.
   */
  async upload(
    owner: BackupOwnerContext,
    headers: BackupUploadHeaders,
    body: Readable,
  ): Promise<BackupView> {
    const storage = this.requireStorage();
    const declared = this.parseUploadHeaders(headers);
    await this.closeAbandoned(owner);
    await this.purgeOwner(storage, owner);
    const row = await this.reserve(owner, declared);

    const meter = new Sha256Meter(this.config.maxBytes, ENVELOPE_HEADER_BYTES);
    // `pipe`, not `pipeline`: an oversized body must not destroy the request
    // socket before the 413 is sent. A client that disconnects mid-transfer
    // ends the meter with an error instead of leaving the write pending.
    finished(body, (error) => {
      if (error) meter.destroy(new BackupTransferIncompleteError());
    });
    body.pipe(meter);
    // Own deadline of the transfer, below BACKUP_UPLOAD_ABANDON_MS: once a
    // row is old enough to be closed as abandoned, nothing writes for it
    // (the adapters' own budgets bound the commit that follows).
    const deadline = setTimeout(
      () => meter.destroy(new BackupUploadDeadlineError()),
      this.config.uploadDeadlineMs,
    );
    deadline.unref?.();
    let staged;
    try {
      staged = await storage.stage(row.storageKey, meter);
    } catch (error) {
      body.unpipe(meter);
      if (error instanceof BackupUploadDeadlineError) {
        await this.fail(row.id, "UPLOAD_DEADLINE");
        this.logger.warn("Backup upload cut at its deadline");
        throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE", { Connection: "close" });
      }
      if (error instanceof BackupTooLargeError) {
        await this.fail(row.id, "TOO_LARGE");
        throw new BackupHttpError(413, "BACKUP_TOO_LARGE", { Connection: "close" });
      }
      if (error instanceof BackupTransferIncompleteError) {
        await this.fail(row.id, "TRANSFER_INCOMPLETE");
        throw new BackupHttpError(400, "BACKUP_TRANSFER_INCOMPLETE", { Connection: "close" });
      }
      await this.fail(row.id, "STORAGE_WRITE_FAILED");
      this.logger.error(`Backup storage write failed (${(error as Error).name})`);
      throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    } finally {
      clearTimeout(deadline);
    }

    if (meter.bytes === 0) {
      await staged.discard();
      await this.fail(row.id, "EMPTY");
      throw new BackupHttpError(400, "INVALID_REQUEST");
    }
    if (meter.sha256 !== declared.sha256) {
      await staged.discard();
      await this.fail(row.id, "SHA256_MISMATCH");
      throw new BackupHttpError(422, "BACKUP_SHA256_MISMATCH");
    }
    // Outer shape only: the server never has the key and does not claim to
    // have checked the decrypted content (F08-ADR-003 §5.1).
    if (!hasDeclaredShape(declared.formatVersion, meter.prefix, meter.bytes)) {
      await staged.discard();
      await this.fail(row.id, "FORMAT_INVALID");
      throw new BackupHttpError(422, "BACKUP_FORMAT_INVALID");
    }

    try {
      await staged.commit();
    } catch (error) {
      await this.fail(row.id, "STORAGE_COMMIT_FAILED");
      this.logger.error(`Backup storage commit failed (${(error as Error).name})`);
      throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    }

    let retired: string[] | null;
    try {
      retired = await this.completeAndRotate(owner, row.id, meter.bytes);
    } catch (error) {
      // An ambiguous failure may still have committed: read the row again
      // before removing anything, so an AVAILABLE copy never loses its bytes.
      // Completion and retirement share one transaction: if the row is
      // AVAILABLE, the retired rows are pending and the next upload purges them.
      const current = await this.prisma.backupMetadata
        .findUnique({ where: { id: row.id }, select: { status: true } })
        .catch(() => null);
      if (current?.status === "AVAILABLE") {
        return toView(await this.prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } }));
      }
      if (current === null) {
        // State unknown: keep the bytes (an orphan at worst, never a
        // listed copy without content) and report the failure.
        throw error;
      }
      await this.fail(row.id, "METADATA_UPDATE_FAILED");
      throw error;
    }
    if (retired === null) {
      // Marked abandoned meanwhile: the bytes must not outlive their row,
      // which is already FAILED and pending purge.
      await purgePending(this.prisma, storage, { id: row.id });
      throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    }
    if (retired.length > 0) {
      const purge = await purgePending(this.prisma, storage, { id: { in: retired } });
      if (purge.failed > 0) this.logger.warn("Backup retention purge pending");
    }
    return toView(await this.prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } }));
  }

  /**
   * One transaction under the Member lock: the verified copy becomes
   * AVAILABLE and, only then, the AVAILABLE copies beyond the N most recent
   * (oldest first, never the new one) are retired. Returns the retired ids,
   * or null if the upload was closed as abandoned meanwhile.
   */
  private async completeAndRotate(
    owner: BackupOwnerContext,
    id: string,
    bytes: number,
  ): Promise<string[] | null> {
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      const completed = await tx.backupMetadata.updateMany({
        where: { id, status: "UPLOADING" },
        data: { status: "AVAILABLE", sizeBytes: BigInt(bytes), completedAt: new Date() },
      });
      if (completed.count !== 1) return null;
      const surplus = await tx.backupMetadata.findMany({
        where: {
          tenantId: owner.tenantId,
          memberId: owner.memberId,
          status: "AVAILABLE",
          id: { not: id },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: this.config.maxActivePerMember - 1,
        select: { id: true },
      });
      if (surplus.length === 0) return [];
      const ids = surplus.map((s) => s.id);
      await tx.backupMetadata.updateMany({
        where: { id: { in: ids }, status: "AVAILABLE" },
        data: {
          status: "DELETED",
          deletedAt: new Date(),
          deletionReason: "RETENTION",
          purgePending: true,
        },
      });
      return ids;
    });
  }

  /**
   * The stored object is hashed again before a single byte is served: a copy
   * that no longer matches its metadata is reported, never delivered as valid.
   */
  async download(owner: BackupOwnerContext, id: string): Promise<BackupDownload> {
    const storage = this.requireStorage();
    const row = await this.findOwnedAvailable(owner, id);
    try {
      const check = await storage.open(row.storageKey);
      const hash = createHash("sha256");
      for await (const chunk of check.stream) hash.update(chunk as Buffer);
      const intact =
        BigInt(check.sizeBytes) === row.sizeBytes &&
        hash.digest("hex") === row.sha256;
      if (intact) {
        const served = await storage.open(row.storageKey);
        return { view: toView(row), stream: served.stream };
      }
      this.logger.error("Backup integrity check failed before download");
      throw new BackupHttpError(500, "BACKUP_INTEGRITY_FAILED");
    } catch (error) {
      if (error instanceof BackupObjectMissingError) {
        // Deleted meanwhile by its owner: same answer as any missing copy.
        const still = await this.prisma.backupMetadata.count({
          where: { id: row.id, status: "AVAILABLE" },
        });
        if (still === 0) throw NOT_FOUND();
        this.logger.error("Backup integrity check failed before download");
        throw new BackupHttpError(500, "BACKUP_INTEGRITY_FAILED");
      }
      throw error;
    }
  }

  /**
   * The owner's deletion (unchanged contract): any own copy, the last one
   * included. Under the Member lock, so it never races with a rotation.
   */
  async remove(owner: BackupOwnerContext, id: string): Promise<void> {
    const storage = this.requireStorage();
    const row = await this.findOwnedAvailable(owner, id);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      return tx.backupMetadata.updateMany({
        where: { id: row.id, tenantId: owner.tenantId, memberId: owner.memberId, status: "AVAILABLE" },
        data: { status: "DELETED", deletedAt: new Date(), deletionReason: "OWNER", purgePending: true },
      });
    });
    if (deleted.count !== 1) throw NOT_FOUND();
    const purge = await purgePending(this.prisma, storage, { id: row.id });
    // Logically deleted: never listed or served again. A failed purge stays
    // pending and is retried before the owner's next upload.
    if (purge.failed > 0) this.logger.warn("Backup object removal pending");
  }

  private async findOwnedAvailable(owner: BackupOwnerContext, id: string) {
    if (!UUID.test(id)) throw NOT_FOUND();
    const row = await this.prisma.backupMetadata.findFirst({
      where: { id, tenantId: owner.tenantId, memberId: owner.memberId, status: "AVAILABLE" },
    });
    if (!row) throw NOT_FOUND();
    return row;
  }

  private parseUploadHeaders(headers: BackupUploadHeaders) {
    const mediaType = headers.contentType?.split(";")[0]?.trim().toLowerCase();
    if (mediaType !== BACKUP_CONTENT_TYPE)
      throw new BackupHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
    if (headers.contentLength !== undefined) {
      if (!/^[0-9]{1,15}$/.test(headers.contentLength))
        throw new BackupHttpError(400, "INVALID_REQUEST");
      if (Number(headers.contentLength) > this.config.maxBytes)
        throw new BackupHttpError(413, "BACKUP_TOO_LARGE", { Connection: "close" });
    }
    const sha256 = headers.sha256?.toLowerCase();
    if (
      !sha256 ||
      !SHA256_HEX.test(sha256) ||
      !headers.formatVersion ||
      !FORMAT_VERSION.test(headers.formatVersion) ||
      !headers.schemaVersion ||
      !SCHEMA_VERSION.test(headers.schemaVersion)
    ) {
      throw new BackupHttpError(400, "INVALID_REQUEST");
    }
    const formatVersion = Number(headers.formatVersion);
    // Decided from the headers, before reading a byte of the body.
    if (!ACCEPTED_FORMATS.includes(formatVersion))
      throw new BackupHttpError(422, "BACKUP_FORMAT_INVALID", { Connection: "close" });
    if (formatVersion === FORMAT_PLAIN_CONTAINER && this.config.requireClientEncryption)
      throw new BackupHttpError(422, "BACKUP_ENCRYPTION_REQUIRED", { Connection: "close" });
    return {
      sha256,
      formatVersion,
      schemaVersion: Number(headers.schemaVersion),
    };
  }

  /**
   * Closes the Member's uploads older than BACKUP_UPLOAD_ABANDON_MS as FAILED
   * ABANDONED, with their bytes pending purge. The status change is
   * conditional, so a late completion of the same upload changes nothing.
   */
  private async closeAbandoned(owner: BackupOwnerContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      await tx.backupMetadata.updateMany({
        where: {
          tenantId: owner.tenantId,
          memberId: owner.memberId,
          status: "UPLOADING",
          createdAt: { lt: new Date(Date.now() - BACKUP_UPLOAD_ABANDON_MS) },
        },
        data: {
          status: "FAILED",
          failureCode: "ABANDONED",
          completedAt: new Date(),
          purgePending: true,
        },
      });
    });
  }

  /** Retries the Member's pending purges before admitting a new upload. */
  private async purgeOwner(storage: BackupStorage, owner: BackupOwnerContext): Promise<void> {
    const purge = await purgePending(this.prisma, storage, {
      tenantId: owner.tenantId,
      memberId: owner.memberId,
    });
    if (purge.failed > 0) this.logger.warn("Backup purge still pending");
  }

  /**
   * Reserves an UPLOADING row under the Member lock. One upload at a time
   * (409 BACKUP_UPLOAD_IN_PROGRESS), and only while AVAILABLE + pending purge
   * leave room for it within N + 1 objects (otherwise 503: the storage has
   * not yet accepted earlier purges).
   */
  private async reserve(
    owner: BackupOwnerContext,
    declared: { sha256: string; formatVersion: number; schemaVersion: number },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      const mine = { tenantId: owner.tenantId, memberId: owner.memberId };
      const uploading = await tx.backupMetadata.count({ where: { ...mine, status: "UPLOADING" } });
      if (uploading > 0) throw new BackupHttpError(409, "BACKUP_UPLOAD_IN_PROGRESS");
      const available = await tx.backupMetadata.count({ where: { ...mine, status: "AVAILABLE" } });
      const pending = await tx.backupMetadata.count({ where: { ...mine, purgePending: true } });
      if (available + pending > this.config.maxActivePerMember) {
        this.logger.warn("Backup upload refused: purges pending above the limit");
        throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
      }
      return tx.backupMetadata.create({
        data: {
          id: randomUUID(),
          tenantId: owner.tenantId,
          memberId: owner.memberId,
          storageKey: randomUUID(),
          contentType: BACKUP_CONTENT_TYPE,
          formatVersion: declared.formatVersion,
          schemaVersion: declared.schemaVersion,
          sha256: declared.sha256,
        },
      });
    });
  }

  /**
   * Closes the upload as FAILED with its bytes pending purge, then purges
   * them (staged and committed, both idempotent). Never throws.
   */
  private async fail(id: string, failureCode: string): Promise<void> {
    try {
      await this.prisma.backupMetadata.updateMany({
        where: { id, status: "UPLOADING" },
        data: { status: "FAILED", failureCode, completedAt: new Date(), purgePending: true },
      });
    } catch (error) {
      this.logger.error(`Backup failure could not be recorded (${(error as Error).name})`);
      return;
    }
    const purge = await purgePending(this.prisma, this.requireStorage(), { id }).catch(() => null);
    if (!purge || purge.failed > 0) this.logger.warn("Backup failed upload purge pending");
  }
}
