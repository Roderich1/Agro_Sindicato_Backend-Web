import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { finished, Readable } from "node:stream";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { BackupStorage, StagedBackupObject } from "@/modules/backups/domain/backup-storage.port";
import {
  BackupTooLargeError,
  BackupTransferIncompleteError,
  Sha256Meter,
} from "@/modules/backups/application/sha256-meter";
import { FarmerContext, IdentificationHttpError } from "../domain/identification-error";
import { FarmerRequestView, toFarmerView } from "../domain/identification-views";
import {
  dimensionsAllowed,
  IMAGE_MAX_BYTES,
  imageSignature,
  readImageDimensions,
} from "../domain/image-validation";
import { CLIENT_REQUEST_ID, normalizeRequestInput, UpsertInput } from "../domain/request-input";
import { PRODUCT_PHOTO_STORAGE } from "../infrastructure/product-photo-storage";
import { lockTenant, PHOTO_TRANSACTION_OPTIONS, VIEW_INCLUDE } from "./identification-store";

export const PHOTO_CONTENT_TYPE = "application/octet-stream";
const SHA256_HEX = /^[0-9a-f]{64}$/;
const CONTENT_LENGTH = /^[0-9]{1,15}$/;

export interface PhotoUploadHeaders {
  contentType: string | undefined;
  contentLength: string | undefined;
  sha256: string | undefined;
}

export interface FarmerWriteResult {
  created: boolean;
  view: FarmerRequestView;
}

const NOT_FOUND = () => new IdentificationHttpError(404, "REQUEST_NOT_FOUND");
const INVALID = () => new IdentificationHttpError(400, "PAYLOAD_INVALID");
const UNAVAILABLE = () => new IdentificationHttpError(503, "PHOTO_STORAGE_UNAVAILABLE");

/**
 * E1 §4.1: the farmer reports a local product (data) and, with a separate
 * consent, a label photo. Separate from Sync v1 (E1-D2): nothing here reads
 * or writes Sync v1, collective or private-backup tables. Every query is
 * scoped by the authenticated tenant and Member; another Member's request
 * is indistinguishable from a missing one.
 *
 * Farmer events carry no actor (E1-D13) and no AuditLog entry is written for
 * them: the farmer is never named in institutional records.
 */
@Injectable()
export class FarmerIdentificationUseCase {
  private readonly logger = new Logger("ProductIdentification");

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_PHOTO_STORAGE) private readonly storage: BackupStorage | null,
  ) {}

  /** `PUT /{request_id}`: create, or resend (idempotent, E1-D3). */
  async upsert(context: FarmerContext, requestId: string, input: UpsertInput): Promise<FarmerWriteResult> {
    if (!CLIENT_REQUEST_ID.test(requestId)) throw INVALID();
    const data = normalizeRequestInput(input);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, context.tenantId);
      const sameId = await tx.productIdentificationRequest.findMany({
        where: { tenantId: context.tenantId, clientRequestId: requestId },
        include: VIEW_INCLUDE,
      });
      const own = sameId.find((row) => row.memberId === context.memberId);
      if (!own && sameId.length > 0) {
        throw new IdentificationHttpError(409, "REQUEST_ID_CONFLICT");
      }
      if (!own) {
        const created = await tx.productIdentificationRequest.create({
          data: {
            tenantId: context.tenantId,
            memberId: context.memberId,
            clientRequestId: requestId,
            localName: data.localName,
            activeIngredient: data.activeIngredient,
            unit: data.unit,
            baseUnit: data.baseUnit,
            photoConsentVersion: data.consent?.version ?? null,
            photoConsentAt: data.consent?.acceptedAt ?? null,
            events: {
              create: {
                kind: "RECEIVED",
                actorUserId: null,
                detail: data.consent
                  ? `Solicitud recibida con consentimiento de foto ${data.consent.version}.`
                  : "Solicitud recibida.",
              },
            },
          },
          include: VIEW_INCLUDE,
        });
        this.logger.log(`[IDENTIFICATION RECEIVED] tenant=${context.tenantId} request=${created.id}`);
        return { created: true, view: toFarmerView(created) };
      }
      if (own.unit !== data.unit) throw new IdentificationHttpError(409, "UNIT_IMMUTABLE");
      // An identified request does not change: the current state is returned.
      if (own.status === "LINKED") return { created: false, view: toFarmerView(own) };

      const update: Prisma.ProductIdentificationRequestUpdateInput = {};
      const details: string[] = [];
      if (own.localName !== data.localName || own.activeIngredient !== data.activeIngredient) {
        update.localName = data.localName;
        update.activeIngredient = data.activeIngredient;
        details.push("Nombre o ingrediente activo actualizados por el agricultor.");
      }
      // A registered consent is never cleared by a later PUT; a new one replaces it.
      if (
        data.consent &&
        (own.photoConsentVersion !== data.consent.version ||
          own.photoConsentAt?.getTime() !== data.consent.acceptedAt.getTime())
      ) {
        update.photoConsentVersion = data.consent.version;
        update.photoConsentAt = data.consent.acceptedAt;
        details.push(`Consentimiento de foto ${data.consent.version} registrado.`);
      }
      if (details.length === 0) return { created: false, view: toFarmerView(own) };
      const updated = await tx.productIdentificationRequest.update({
        where: { id: own.id },
        data: {
          ...update,
          events: { create: { kind: "UPDATED", actorUserId: null, detail: details.join(" ") } },
        },
        include: VIEW_INCLUDE,
      });
      return { created: false, view: toFarmerView(updated) };
    });
  }

  /** `GET /`: every own request, oldest first. */
  async listOwn(context: FarmerContext): Promise<{ contractVersion: 1; requests: FarmerRequestView[] }> {
    const rows = await this.prisma.productIdentificationRequest.findMany({
      where: { tenantId: context.tenantId, memberId: context.memberId },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      include: VIEW_INCLUDE,
    });
    return { contractVersion: 1, requests: rows.map(toFarmerView) };
  }

  private requireStorage(): BackupStorage {
    if (!this.storage) throw UNAVAILABLE();
    return this.storage;
  }

  /**
   * `PUT /{request_id}/photo`. The body is streamed to a private staging
   * object while it is hashed and counted (at most 2 MiB), then checked:
   * declared SHA-256, real type by signature and header dimensions. Only a
   * valid photo is committed; a replacement is committed before the previous
   * object is removed, and the same SHA-256 is a no-op.
   */
  async storePhoto(
    context: FarmerContext,
    requestId: string,
    headers: PhotoUploadHeaders,
    body: Readable,
  ): Promise<FarmerWriteResult> {
    const storage = this.requireStorage();
    if (!CLIENT_REQUEST_ID.test(requestId)) throw INVALID();
    const declared = parsePhotoHeaders(headers);
    const current = await this.findOwn(context, requestId);
    if (!current.photoConsentVersion) throw new IdentificationHttpError(409, "PHOTO_CONSENT_REQUIRED");

    const key = randomUUID();
    const { staged, bytes, sha256, content } = await this.stage(storage, key, declared.length, body);
    let committed = false;
    try {
      if (bytes !== declared.length) throw INVALID();
      if (sha256 !== declared.sha256) throw new IdentificationHttpError(422, "CONTENT_HASH_MISMATCH");
      const contentType = imageSignature(content);
      const dimensions = contentType ? readImageDimensions(content) : null;
      if (!contentType || !dimensions || !dimensionsAllowed(dimensions)) {
        throw new IdentificationHttpError(422, "IMAGE_INVALID");
      }
      if (current.photoState === "STORED" && current.photoSha256 === sha256) {
        // Same bytes as the stored photo: nothing is rewritten.
        await staged.discard();
        return { created: false, view: toFarmerView(current) };
      }
      await staged.commit();
      committed = true;

      const result = await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, context.tenantId);
        const row = await tx.productIdentificationRequest.findFirst({
          where: { tenantId: context.tenantId, memberId: context.memberId, clientRequestId: requestId },
          include: VIEW_INCLUDE,
        });
        if (!row) throw NOT_FOUND();
        if (!row.photoConsentVersion) throw new IdentificationHttpError(409, "PHOTO_CONSENT_REQUIRED");
        // A concurrent upload of the same bytes already stored them.
        if (row.photoState === "STORED" && row.photoSha256 === sha256) {
          return { created: false, view: toFarmerView(row), keep: false };
        }
        const previous = row.photoState === "STORED" ? row.photoStorageKey : null;
        const updated = await tx.productIdentificationRequest.update({
          where: { id: row.id },
          data: {
            photoState: "STORED",
            photoStorageKey: key,
            photoSha256: sha256,
            photoContentType: contentType,
            photoSizeBytes: bytes,
            photoWidth: dimensions.width,
            photoHeight: dimensions.height,
            photoStoredAt: new Date(),
            photoRemovedAt: null,
            events: {
              create: { kind: previous ? "PHOTO_REPLACED" : "PHOTO_RECEIVED", actorUserId: null },
            },
          },
          include: VIEW_INCLUDE,
        });
        // The new object is committed; the previous one goes in the same unit
        // of work, so a failure leaves the earlier state untouched.
        if (previous) await storage.remove(previous);
        return { created: true, view: toFarmerView(updated), keep: true };
      }, PHOTO_TRANSACTION_OPTIONS);
      if (!result.keep) await this.removeQuietly(storage, key);
      return { created: result.created, view: result.view };
    } catch (error) {
      if (committed) await this.removeQuietly(storage, key);
      else await staged.discard().catch(() => undefined);
      if (error instanceof IdentificationHttpError) throw error;
      this.logger.error(`Product photo store failed (${error instanceof Error ? error.name : typeof error})`);
      throw UNAVAILABLE();
    }
  }

  /** `DELETE /{request_id}/photo`: idempotent; the binary goes first. */
  async removePhoto(context: FarmerContext, requestId: string): Promise<void> {
    const storage = this.requireStorage();
    if (!CLIENT_REQUEST_ID.test(requestId)) throw INVALID();
    await this.findOwn(context, requestId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockTenant(tx, context.tenantId);
        const row = await tx.productIdentificationRequest.findFirst({
          where: { tenantId: context.tenantId, memberId: context.memberId, clientRequestId: requestId },
        });
        if (!row) throw NOT_FOUND();
        if (row.photoState !== "STORED" || !row.photoStorageKey) return;
        // Removed before the row changes: a failure leaves the photo listed
        // and the farmer retries; removing an absent object is not an error.
        await storage.remove(row.photoStorageKey);
        await tx.productIdentificationRequest.update({
          where: { id: row.id },
          data: {
            photoState: "REMOVED",
            photoStorageKey: null,
            photoSha256: null,
            photoContentType: null,
            photoSizeBytes: null,
            photoWidth: null,
            photoHeight: null,
            photoStoredAt: null,
            photoRemovedAt: new Date(),
            events: { create: { kind: "PHOTO_REMOVED", actorUserId: null } },
          },
        });
      }, PHOTO_TRANSACTION_OPTIONS);
    } catch (error) {
      if (error instanceof IdentificationHttpError) throw error;
      this.logger.error(`Product photo removal failed (${error instanceof Error ? error.name : typeof error})`);
      throw UNAVAILABLE();
    }
  }

  private async findOwn(context: FarmerContext, requestId: string) {
    const row = await this.prisma.productIdentificationRequest.findFirst({
      where: { tenantId: context.tenantId, memberId: context.memberId, clientRequestId: requestId },
      include: VIEW_INCLUDE,
    });
    if (!row) throw NOT_FOUND();
    return row;
  }

  /**
   * Streams the body through the meter into staging. `pipe`, not `pipeline`:
   * an oversized body must not destroy the socket before the 413 is sent.
   */
  private async stage(
    storage: BackupStorage,
    key: string,
    declaredLength: number,
    body: Readable,
  ): Promise<{ staged: StagedBackupObject; bytes: number; sha256: string; content: Buffer }> {
    // The whole photo (<= 2 MiB) is kept to read its header structure.
    const meter = new Sha256Meter(IMAGE_MAX_BYTES, declaredLength);
    finished(body, (error) => {
      if (error) meter.destroy(new BackupTransferIncompleteError());
    });
    body.pipe(meter);
    try {
      const staged = await storage.stage(key, meter);
      return { staged, bytes: meter.bytes, sha256: meter.sha256, content: meter.prefix };
    } catch (error) {
      body.unpipe(meter);
      if (error instanceof BackupTooLargeError) {
        throw new IdentificationHttpError(413, "IMAGE_TOO_LARGE", { Connection: "close" });
      }
      if (error instanceof BackupTransferIncompleteError) {
        throw new IdentificationHttpError(400, "PAYLOAD_INVALID", { Connection: "close" });
      }
      this.logger.error(`Product photo staging failed (${error instanceof Error ? error.name : typeof error})`);
      throw UNAVAILABLE();
    }
  }

  private async removeQuietly(storage: BackupStorage, key: string): Promise<void> {
    try {
      await storage.remove(key);
    } catch (error) {
      this.logger.warn(`Product photo object removal pending (${error instanceof Error ? error.name : typeof error})`);
    }
  }
}

/**
 * Headers decided before reading a byte: media type (415), mandatory
 * Content-Length of at most 2 MiB (413), lowercase SHA-256 (400).
 */
export function parsePhotoHeaders(headers: PhotoUploadHeaders): { length: number; sha256: string } {
  const mediaType = headers.contentType?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== PHOTO_CONTENT_TYPE) {
    throw new IdentificationHttpError(415, "UNSUPPORTED_MEDIA_TYPE", { Connection: "close" });
  }
  if (headers.contentLength === undefined) {
    throw new IdentificationHttpError(413, "IMAGE_TOO_LARGE", { Connection: "close" });
  }
  if (!CONTENT_LENGTH.test(headers.contentLength)) throw INVALID();
  const length = Number(headers.contentLength);
  if (length > IMAGE_MAX_BYTES) {
    throw new IdentificationHttpError(413, "IMAGE_TOO_LARGE", { Connection: "close" });
  }
  if (length === 0) throw new IdentificationHttpError(422, "IMAGE_INVALID");
  if (!headers.sha256 || !SHA256_HEX.test(headers.sha256)) throw INVALID();
  return { length, sha256: headers.sha256 };
}
