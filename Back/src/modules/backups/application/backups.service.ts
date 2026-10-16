import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BackupMetadata } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { finished } from "node:stream";
import type { Readable } from "node:stream";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import {
  BACKUP_STORAGE,
  BackupObjectMissingError,
  BackupStorage,
} from "../domain/backup-storage.port";
import { BackupHttpError, BackupOwnerContext } from "./backup-http-error";
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
   * declared one and the object is committed. Any failure leaves the row
   * FAILED (never listed) and no staged or committed bytes; earlier AVAILABLE
   * copies are untouched.
   */
  async upload(
    owner: BackupOwnerContext,
    headers: BackupUploadHeaders,
    body: Readable,
  ): Promise<BackupView> {
    const storage = this.requireStorage();
    const declared = this.parseUploadHeaders(headers);
    const row = await this.reserve(owner, declared);

    const meter = new Sha256Meter(this.config.maxBytes);
    // `pipe`, not `pipeline`: an oversized body must not destroy the request
    // socket before the 413 is sent. A client that disconnects mid-transfer
    // ends the meter with an error instead of leaving the write pending.
    finished(body, (error) => {
      if (error) meter.destroy(new BackupTransferIncompleteError());
    });
    body.pipe(meter);
    let staged;
    try {
      staged = await storage.stage(row.storageKey, meter);
    } catch (error) {
      body.unpipe(meter);
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

    try {
      await staged.commit();
    } catch (error) {
      await this.fail(row.id, "STORAGE_COMMIT_FAILED");
      this.logger.error(`Backup storage commit failed (${(error as Error).name})`);
      throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    }

    const completed = await this.prisma.backupMetadata.updateMany({
      where: { id: row.id, status: "UPLOADING" },
      data: { status: "AVAILABLE", sizeBytes: BigInt(meter.bytes), completedAt: new Date() },
    });
    if (completed.count !== 1) {
      // Marked abandoned meanwhile: the bytes must not outlive their row.
      await storage.remove(row.storageKey);
      throw new BackupHttpError(503, "BACKUP_STORAGE_UNAVAILABLE");
    }
    return toView(await this.prisma.backupMetadata.findUniqueOrThrow({ where: { id: row.id } }));
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
        this.logger.error("Backup integrity check failed before download");
        throw new BackupHttpError(500, "BACKUP_INTEGRITY_FAILED");
      }
      throw error;
    }
  }

  async remove(owner: BackupOwnerContext, id: string): Promise<void> {
    const storage = this.requireStorage();
    const row = await this.findOwnedAvailable(owner, id);
    const deleted = await this.prisma.backupMetadata.updateMany({
      where: { id: row.id, tenantId: owner.tenantId, memberId: owner.memberId, status: "AVAILABLE" },
      data: { status: "DELETED", deletedAt: new Date() },
    });
    if (deleted.count !== 1) throw NOT_FOUND();
    try {
      await storage.remove(row.storageKey);
    } catch (error) {
      // Logically deleted: never listed or served again. The orphan object is
      // a declared limitation until retention (#40) adds reconciliation.
      this.logger.warn(`Backup object removal failed (${(error as Error).name})`);
    }
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
    return {
      sha256,
      formatVersion: Number(headers.formatVersion),
      schemaVersion: Number(headers.schemaVersion),
    };
  }

  /**
   * Reserves an UPLOADING row under a per-Member lock: abandoned uploads are
   * closed and the quota of copies in use is enforced atomically.
   */
  private async reserve(
    owner: BackupOwnerContext,
    declared: { sha256: string; formatVersion: number; schemaVersion: number },
  ) {
    const abandoned: string[] = [];
    const row = await this.prisma.$transaction(async (tx) => {
      const lockKey = `backup:${owner.tenantId}:${owner.memberId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const stale = await tx.backupMetadata.findMany({
        where: {
          tenantId: owner.tenantId,
          memberId: owner.memberId,
          status: "UPLOADING",
          createdAt: { lt: new Date(Date.now() - BACKUP_UPLOAD_ABANDON_MS) },
        },
        select: { id: true, storageKey: true },
      });
      if (stale.length > 0) {
        await tx.backupMetadata.updateMany({
          where: { id: { in: stale.map((s) => s.id) }, status: "UPLOADING" },
          data: { status: "FAILED", failureCode: "ABANDONED", completedAt: new Date() },
        });
        abandoned.push(...stale.map((s) => s.storageKey));
      }
      const inUse = await tx.backupMetadata.count({
        where: {
          tenantId: owner.tenantId,
          memberId: owner.memberId,
          status: { in: ["UPLOADING", "AVAILABLE"] },
        },
      });
      if (inUse >= this.config.maxActivePerMember)
        throw new BackupHttpError(409, "BACKUP_QUOTA_EXCEEDED");
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
    for (const key of abandoned) {
      await this.storage?.discardStaged(key).catch(() => undefined);
    }
    return row;
  }

  private async fail(id: string, failureCode: string): Promise<void> {
    try {
      await this.prisma.backupMetadata.updateMany({
        where: { id, status: "UPLOADING" },
        data: { status: "FAILED", failureCode, completedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Backup failure could not be recorded (${(error as Error).name})`);
    }
  }
}
