import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Readable } from "node:stream";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";
import {
  BackupObjectMissingError,
  BackupStorage,
} from "@/modules/backups/domain/backup-storage.port";
import { ProductCatalogUseCase } from "@/modules/inventory/application/use-cases/product-catalog.use-case";
import { createHash } from "node:crypto";
import { IdentificationHttpError } from "../domain/identification-error";
import {
  HistoryEntryView,
  InstitutionalRequestView,
  toHistoryEntry,
  toInstitutionalView,
} from "../domain/identification-views";
import { IMAGE_MAX_BYTES, ImageContentType } from "../domain/image-validation";
import { CandidateView, similarity } from "../domain/name-similarity";
import { requireConfirmation, SERVER_ID } from "../domain/request-input";
import { PRODUCT_PHOTO_STORAGE } from "../infrastructure/product-photo-storage";
import { lockTenant, VIEW_INCLUDE } from "./identification-store";

export type IdentificationListFilter = "PENDING" | "LINKED" | "ALL";
/** Same limits as the product catalogue (`CreateProductDto`). */
export const PRODUCT_NAME_MIN = 2;
export const PRODUCT_NAME_MAX = 160;

export interface LinkCommand {
  product_ref: string;
  reason?: unknown;
  confirmed?: unknown;
}

export interface CreateProductCommand {
  name: string;
  active_ingredient?: string | null;
  reason?: unknown;
  confirmed?: unknown;
}

export interface DeferCommand {
  note?: unknown;
  confirmed?: unknown;
}

export interface DecisionResult {
  changed: boolean;
  request: InstitutionalRequestView;
}

export interface PhotoDownload {
  content: Buffer;
  contentType: ImageContentType;
  sha256: string;
}

const REQUEST_NOT_FOUND = () => new IdentificationHttpError(404, "REQUEST_NOT_FOUND");
const PHOTO_NOT_FOUND = () => new IdentificationHttpError(404, "PHOTO_NOT_FOUND");
const ENTITY_NAME = "ProductIdentificationRequest";

/**
 * E1 §4.2: the Directiva (or the ADMINISTRADOR of the same tenant, RU-18/
 * RU-19) identifies reported products. Views never carry the farmer's
 * identity (E1-D5). Every decision is explicit (confirmation and reason),
 * serialised per tenant, recorded as an event with its actor and as an
 * AuditLog entry with `ownerUserId: null` (E1-D13). Identifying a product
 * writes nothing on the phone and touches no published or sealed figure
 * (E1-D4, E1-D14).
 */
@Injectable()
export class InstitutionalIdentificationUseCase {
  private readonly logger = new Logger("ProductIdentification");

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogUseCase,
    @Inject(PRODUCT_PHOTO_STORAGE) private readonly storage: BackupStorage | null,
  ) {}

  async list(
    tenantId: string,
    filter: IdentificationListFilter = "PENDING",
  ): Promise<{ contractVersion: 1; requests: InstitutionalRequestView[] }> {
    const rows = await this.prisma.productIdentificationRequest.findMany({
      where: { tenantId, ...(filter === "ALL" ? {} : { status: filter }) },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      include: VIEW_INCLUDE,
    });
    return { contractVersion: 1, requests: rows.map(toInstitutionalView) };
  }

  /** E1-D7: suggestions only; this method never writes. */
  async candidates(tenantId: string, id: string): Promise<{ contractVersion: 1; candidates: CandidateView[] }> {
    const request = await this.findRequest(this.prisma, tenantId, id);
    const [products, associations] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, name: true, unit: true, isActive: true, activeIngredient: true },
      }),
      this.prisma.productCanonicalAssociation.findMany({
        where: { tenantId, validTo: null },
        select: { productId: true, canonicalProductId: true },
      }),
    ]);
    const canonicalOf = new Map(associations.map((row) => [row.productId, row.canonicalProductId]));
    return {
      contractVersion: 1,
      candidates: similarity(
        {
          localName: request.localName,
          activeIngredient: request.activeIngredient,
          baseUnit: request.baseUnit,
        },
        products.map((product) => ({
          ...product,
          canonicalProductId: canonicalOf.get(product.id) ?? null,
        })),
      ),
    };
  }

  async history(tenantId: string, id: string): Promise<{ contractVersion: 1; events: HistoryEntryView[] }> {
    const request = await this.findRequest(this.prisma, tenantId, id);
    const events = await this.prisma.productIdentificationEvent.findMany({
      where: { requestId: request.id },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      select: {
        at: true,
        kind: true,
        detail: true,
        productId: true,
        actor: { select: { name: true } },
        product: { select: { name: true } },
      },
    });
    return { contractVersion: 1, events: events.map(toHistoryEntry) };
  }

  /**
   * The stored photo, hashed again before a byte is served: an object that
   * no longer matches its metadata is never delivered as valid.
   */
  async photo(tenantId: string, id: string): Promise<PhotoDownload> {
    if (!this.storage) throw new IdentificationHttpError(503, "PHOTO_STORAGE_UNAVAILABLE");
    if (!SERVER_ID.test(id)) throw PHOTO_NOT_FOUND();
    const row = await this.prisma.productIdentificationRequest.findFirst({
      where: { id, tenantId, photoState: "STORED" },
      select: { photoStorageKey: true, photoSha256: true, photoContentType: true, photoSizeBytes: true },
    });
    if (!row?.photoStorageKey || !row.photoSha256 || !row.photoContentType) throw PHOTO_NOT_FOUND();
    let content: Buffer;
    try {
      const object = await this.storage.open(row.photoStorageKey);
      content = await readAtMost(object.stream, IMAGE_MAX_BYTES + 1);
    } catch (error) {
      if (error instanceof BackupObjectMissingError) {
        this.logger.error("Product photo object missing for a stored photo");
        throw PHOTO_NOT_FOUND();
      }
      this.logger.error(`Product photo read failed (${error instanceof Error ? error.name : typeof error})`);
      throw new IdentificationHttpError(503, "PHOTO_STORAGE_UNAVAILABLE");
    }
    const intact =
      content.length === row.photoSizeBytes &&
      createHash("sha256").update(content).digest("hex") === row.photoSha256;
    if (!intact) {
      this.logger.error("Product photo integrity check failed before download");
      throw new IdentificationHttpError(500, "PHOTO_INTEGRITY_FAILED");
    }
    return { content, contentType: row.photoContentType as ImageContentType, sha256: row.photoSha256 };
  }

  /** Link (or correct the link of) a request to an existing product. */
  async link(tenantId: string, actorUserId: string, id: string, command: LinkCommand): Promise<DecisionResult> {
    const reason = requireConfirmation(command.confirmed, command.reason);
    return this.serialised(tenantId, async (tx) => {
      const request = await this.findRequest(tx, tenantId, id);
      const product = await tx.product.findFirst({
        where: { id: command.product_ref, tenantId },
        select: { id: true, name: true, unit: true, isActive: true },
      });
      // Another tenant's product is indistinguishable from a missing one.
      if (!product) throw new IdentificationHttpError(404, "PRODUCT_NOT_FOUND");
      if (request.status === "LINKED" && request.productId === product.id) {
        return { changed: false, request: toInstitutionalView(request) };
      }
      if (!product.isActive) throw new IdentificationHttpError(422, "PRODUCT_INACTIVE");
      if (baseUnitForCentralUnit(product.unit) !== request.baseUnit) {
        throw new IdentificationHttpError(422, "UNIT_DIMENSION_MISMATCH");
      }
      const relink = request.status === "LINKED";
      const updated = await this.resolve(tx, request.id, actorUserId, {
        productId: product.id,
        resolution: "LINKED_EXISTING",
        reason,
        kind: relink ? "RELINKED" : "LINKED",
      });
      await this.audit(tx, tenantId, actorUserId, request.id, {
        summary: relink
          ? `Identificación de producto corregida: ahora vinculada a «${product.name}».`
          : `Identificación de producto vinculada a «${product.name}».`,
        productRef: product.id,
        reason,
      });
      this.logger.log(
        `[IDENTIFICATION ${relink ? "RELINKED" : "LINKED"}] tenant=${tenantId} actor=${actorUserId} request=${request.id} product=${product.id}`,
      );
      return { changed: true, request: toInstitutionalView(updated) };
    });
  }

  /**
   * Create the collective product (unit = the request's) through the
   * catalogue use case, in the same transaction, and link the request to it.
   */
  async createProduct(
    tenantId: string,
    actorUserId: string,
    id: string,
    command: CreateProductCommand,
  ): Promise<DecisionResult & { product_ref: string }> {
    const reason = requireConfirmation(command.confirmed, command.reason);
    const name = command.name.trim();
    if (name.length < PRODUCT_NAME_MIN || name.length > PRODUCT_NAME_MAX) {
      throw new IdentificationHttpError(400, "PAYLOAD_INVALID");
    }
    const activeIngredient = command.active_ingredient?.trim() || null;
    if (activeIngredient && activeIngredient.length > PRODUCT_NAME_MAX) {
      throw new IdentificationHttpError(400, "PAYLOAD_INVALID");
    }
    return this.serialised(tenantId, async (tx) => {
      const request = await this.findRequest(tx, tenantId, id);
      // Case-insensitive: "Glifosato" and "glifosato" are one name for the
      // Directiva; the Web offers to link the existing product instead.
      const taken = await tx.product.findFirst({
        where: { tenantId, name: { equals: name, mode: Prisma.QueryMode.insensitive } },
        select: { id: true },
      });
      if (taken) throw new IdentificationHttpError(409, "PRODUCT_NAME_TAKEN");
      let product: { id: string; name: string };
      try {
        product = await this.catalog.create(
          tenantId,
          { name, activeIngredient: activeIngredient ?? undefined, unit: request.unit },
          tx,
        );
      } catch (error) {
        if (
          error instanceof ConflictException ||
          (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        ) {
          throw new IdentificationHttpError(409, "PRODUCT_NAME_TAKEN");
        }
        throw error;
      }
      const updated = await this.resolve(tx, request.id, actorUserId, {
        productId: product.id,
        resolution: "CREATED_PRODUCT",
        reason,
        kind: "PRODUCT_CREATED",
      });
      await this.audit(tx, tenantId, actorUserId, request.id, {
        summary: `Producto colectivo «${product.name}» creado y vinculado a una solicitud de identificación.`,
        productRef: product.id,
        reason,
      });
      this.logger.log(
        `[IDENTIFICATION PRODUCT_CREATED] tenant=${tenantId} actor=${actorUserId} request=${request.id} product=${product.id}`,
      );
      return { changed: true, product_ref: product.id, request: toInstitutionalView(updated) };
    });
  }

  /** Keep the request pending, with a note for the farmer (author not shown to them). */
  async defer(tenantId: string, actorUserId: string, id: string, command: DeferCommand): Promise<DecisionResult> {
    const note = requireConfirmation(command.confirmed, command.note);
    return this.serialised(tenantId, async (tx) => {
      const request = await this.findRequest(tx, tenantId, id);
      // E1-P3: a link can be corrected to another product, not undone.
      if (request.status === "LINKED") throw new IdentificationHttpError(409, "REQUEST_ALREADY_LINKED");
      const updated = await tx.productIdentificationRequest.update({
        where: { id: request.id },
        data: {
          pendingNote: note,
          pendingNoteByUserId: actorUserId,
          pendingNoteAt: new Date(),
          events: { create: { kind: "NOTE", actorUserId, detail: note } },
        },
        include: VIEW_INCLUDE,
      });
      await this.audit(tx, tenantId, actorUserId, request.id, {
        summary: "Solicitud de identificación de producto dejada pendiente con una nota.",
        productRef: null,
        reason: note,
      });
      return { changed: true, request: toInstitutionalView(updated) };
    });
  }

  private async findRequest(client: Prisma.TransactionClient | PrismaService, tenantId: string, id: string) {
    if (!SERVER_ID.test(id)) throw REQUEST_NOT_FOUND();
    const request = await client.productIdentificationRequest.findFirst({
      where: { id, tenantId },
      include: VIEW_INCLUDE,
    });
    if (!request) throw REQUEST_NOT_FOUND();
    return request;
  }

  private resolve(
    tx: Prisma.TransactionClient,
    requestId: string,
    actorUserId: string,
    decision: {
      productId: string;
      resolution: "LINKED_EXISTING" | "CREATED_PRODUCT";
      reason: string;
      kind: "LINKED" | "RELINKED" | "PRODUCT_CREATED";
    },
  ) {
    return tx.productIdentificationRequest.update({
      where: { id: requestId },
      data: {
        status: "LINKED",
        resolution: decision.resolution,
        productId: decision.productId,
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
        resolutionReason: decision.reason,
        // The note belonged to the pending state; it stays in the history.
        pendingNote: null,
        pendingNoteByUserId: null,
        pendingNoteAt: null,
        events: {
          create: {
            kind: decision.kind,
            actorUserId,
            productId: decision.productId,
            detail: decision.reason,
          },
        },
      },
      include: VIEW_INCLUDE,
    });
  }

  /** Institutional record (E1-D13): never the farmer's identity. */
  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    requestId: string,
    entry: { summary: string; productRef: string | null; reason: string },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        ownerUserId: null,
        action: "OTRO",
        entityName: ENTITY_NAME,
        entityId: requestId,
        summary: entry.summary,
        metadata: { productRef: entry.productRef, reason: entry.reason },
      },
    });
  }

  private serialised<T>(tenantId: string, body: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      return body(tx);
    });
  }
}

/** Reads a stream into memory, failing as soon as it exceeds `limit` bytes. */
async function readAtMost(stream: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > limit) {
      stream.destroy();
      break;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
