import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { baseUnitForCentralUnit } from "@/modules/sync-v1/domain/units";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";

export interface AssociateProductCommand {
  productId: string;
  canonicalProductId: string;
  reason: string;
  /** RF-33: nothing is associated without an explicit confirmation. */
  confirmed: boolean;
}

export interface CloseAssociationCommand {
  productId: string;
  reason: string;
  confirmed: boolean;
}

export interface AssociationView {
  association_ref: string;
  product_ref: string;
  product_name: string;
  canonical_product_ref: string;
  canonical_product_name: string;
  valid_from: string;
  valid_to: string | null;
  actor_ref: string;
  actor_name: string;
  reason: string;
  closed_by_ref: string | null;
  closed_by_name: string | null;
  close_reason: string | null;
}

/** Bitácora codes of the association changes (RF-25, D-01), in `metadata.event`. */
export type ProductAliasAuditEvent = "PRODUCT_ALIAS_ASSOCIATED" | "PRODUCT_ALIAS_CORRECTED" | "PRODUCT_ALIAS_UNDONE";

const AUDIT_ENTITY = "ProductCanonicalAssociation";

/** A catalogue denomination: name and unit only, no stock or other legacy data. */
export interface CatalogEntryView {
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: "ML" | "G" | null;
  is_active: boolean;
}

/**
 * F07-REC-01 (#108), backend base: explicit association of a catalogue
 * denomination with its canonical product, by the Directiva of the effective
 * tenant (or its ADMINISTRADOR, RU-18). History is immutable (RF-34, RNF-12):
 * a correction closes the current row and opens another; product names are
 * never rewritten and nothing is associated automatically (RF-33). Units of
 * different dimensions (L/KG) are never associated.
 */
@Injectable()
export class ProductReconciliationUseCase {
  private readonly logger = new Logger(ProductReconciliationUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<{ current: AssociationView[]; history: AssociationView[] }> {
    const rows = await this.prisma.productCanonicalAssociation.findMany({
      where: { tenantId },
      orderBy: [{ validFrom: "desc" }, { id: "asc" }],
      include: {
        product: { select: { name: true } },
        canonicalProduct: { select: { name: true } },
        actor: { select: { name: true } },
        closedBy: { select: { name: true } },
      },
    });
    const views = rows.map(view);
    return {
      current: views.filter((row) => row.valid_to === null),
      history: views.filter((row) => row.valid_to !== null),
    };
  }

  /** Denominations of the tenant to choose from (F07-REC-01 screen). */
  async catalog(tenantId: string): Promise<CatalogEntryView[]> {
    const rows = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, unit: true, isActive: true },
    });
    return rows.map((row) => ({
      product_ref: row.id,
      product_name: row.name,
      unit: row.unit,
      base_unit: baseUnitForCentralUnit(row.unit),
      is_active: row.isActive,
    }));
  }

  async associate(tenantId: string, actorUserId: string, command: AssociateProductCommand) {
    const reason = requireConfirmation(command.confirmed, command.reason);
    if (command.productId === command.canonicalProductId) {
      throw new UnprocessableEntityException("SELF_ASSOCIATION");
    }
    return this.serialised(tenantId, async (tx) => {
      const products = await tx.product.findMany({
        where: { tenantId, id: { in: [command.productId, command.canonicalProductId] } },
        select: { id: true, name: true, unit: true },
      });
      const product = products.find((row) => row.id === command.productId);
      const canonical = products.find((row) => row.id === command.canonicalProductId);
      // Another tenant's product is indistinguishable from a missing one.
      if (!product || !canonical) throw new NotFoundException("PRODUCT_NOT_FOUND");
      const unit = baseUnitForCentralUnit(product.unit);
      const canonicalUnit = baseUnitForCentralUnit(canonical.unit);
      if (!unit || !canonicalUnit) throw new UnprocessableEntityException("PRODUCT_NOT_LINKABLE");
      if (unit !== canonicalUnit) throw new UnprocessableEntityException("UNIT_DIMENSION_MISMATCH");
      const active = await tx.productCanonicalAssociation.findMany({
        where: {
          tenantId,
          validTo: null,
          OR: [
            { productId: { in: [command.productId, command.canonicalProductId] } },
            { canonicalProductId: command.productId },
          ],
        },
      });
      // No chains: the canonical is not an alias, and an alias has no aliases.
      if (active.some((row) => row.productId === command.canonicalProductId)) {
        throw new UnprocessableEntityException("CANONICAL_IS_ALIAS");
      }
      if (active.some((row) => row.canonicalProductId === command.productId)) {
        throw new UnprocessableEntityException("PRODUCT_IS_CANONICAL");
      }
      const current = active.find((row) => row.productId === command.productId);
      if (current?.canonicalProductId === command.canonicalProductId) {
        return { changed: false, association: current.id };
      }
      const now = new Date();
      let previousCanonicalName: string | null = null;
      if (current) {
        await tx.productCanonicalAssociation.update({
          where: { id: current.id },
          data: { validTo: now, closedByUserId: actorUserId, closeReason: reason },
        });
        const previous = await tx.product.findFirst({
          where: { tenantId, id: current.canonicalProductId },
          select: { name: true },
        });
        previousCanonicalName = previous?.name ?? null;
      }
      const created = await tx.productCanonicalAssociation.create({
        data: {
          tenantId,
          productId: command.productId,
          canonicalProductId: command.canonicalProductId,
          validFrom: now,
          actorUserId,
          reason,
        },
      });
      const after = { canonicalProductRef: canonical.id, associationRef: created.id };
      if (current) {
        await this.audit(tx, tenantId, actorUserId, created.id, {
          action: AuditAction.ACTUALIZAR,
          event: "PRODUCT_ALIAS_CORRECTED",
          summary: previousCanonicalName
            ? `Unión del nombre «${product.name}» corregida: ahora con «${canonical.name}» (antes con «${previousCanonicalName}»).`
            : `Unión del nombre «${product.name}» corregida: ahora con «${canonical.name}».`,
          before: { canonicalProductRef: current.canonicalProductId, associationRef: current.id },
          after,
          productRef: product.id,
          reason,
        });
      } else {
        await this.audit(tx, tenantId, actorUserId, created.id, {
          action: AuditAction.CREAR,
          event: "PRODUCT_ALIAS_ASSOCIATED",
          summary: `Nombre «${product.name}» unido con «${canonical.name}».`,
          after,
          productRef: product.id,
          reason,
        });
      }
      this.logger.log(
        `[PRODUCT ASSOCIATION] tenant=${tenantId} actor=${actorUserId} product=${command.productId} canonical=${command.canonicalProductId} replaced=${current?.id ?? "-"}`,
      );
      return { changed: true, association: created.id };
    });
  }

  /** The product becomes its own canonical again; the row stays in history. */
  async close(tenantId: string, actorUserId: string, command: CloseAssociationCommand) {
    const reason = requireConfirmation(command.confirmed, command.reason);
    return this.serialised(tenantId, async (tx) => {
      const current = await tx.productCanonicalAssociation.findFirst({
        where: { tenantId, productId: command.productId, validTo: null },
        include: { product: { select: { name: true } }, canonicalProduct: { select: { name: true } } },
      });
      if (!current) throw new NotFoundException("ASSOCIATION_NOT_FOUND");
      await tx.productCanonicalAssociation.update({
        where: { id: current.id },
        data: { validTo: new Date(), closedByUserId: actorUserId, closeReason: reason },
      });
      await this.audit(tx, tenantId, actorUserId, current.id, {
        action: AuditAction.INACTIVAR,
        event: "PRODUCT_ALIAS_UNDONE",
        summary: `Unión del nombre «${current.product.name}» con «${current.canonicalProduct.name}» deshecha.`,
        before: { canonicalProductRef: current.canonicalProductId, associationRef: current.id },
        after: { canonicalProductRef: null, associationRef: null },
        productRef: current.productId,
        reason,
      });
      this.logger.log(
        `[PRODUCT ASSOCIATION CLOSE] tenant=${tenantId} actor=${actorUserId} product=${command.productId} association=${current.id}`,
      );
      return { changed: true, association: current.id };
    });
  }

  /**
   * RF-25 (D-01): institutional Bitácora entry (`ownerUserId: null`) in the
   * transaction of the change, with its actor, code, product and reason.
   */
  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    associationId: string,
    entry: {
      action: AuditAction;
      event: ProductAliasAuditEvent;
      summary: string;
      before?: Prisma.InputJsonObject;
      after: Prisma.InputJsonObject;
      productRef: string;
      reason: string;
    },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        ownerUserId: null,
        action: entry.action,
        entityName: AUDIT_ENTITY,
        entityId: associationId,
        summary: entry.summary,
        ...(entry.before ? { before: entry.before } : {}),
        after: entry.after,
        metadata: { event: entry.event, productRef: entry.productRef, reason: entry.reason },
      },
    });
  }

  /** One association change at a time per tenant (no lost corrections). */
  private serialised<T>(tenantId: string, body: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`product-association:${tenantId}`}, 0))`;
      try {
        return await body(tx);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("ASSOCIATION_CHANGED");
        }
        throw error;
      }
    });
  }
}

function requireConfirmation(confirmed: boolean, reason: string): string {
  if (confirmed !== true) throw new UnprocessableEntityException("CONFIRMATION_REQUIRED");
  const trimmed = (reason ?? "").trim();
  if (!trimmed || trimmed.length > 280) throw new UnprocessableEntityException("REASON_REQUIRED");
  return trimmed;
}

function view(row: {
  id: string;
  productId: string;
  canonicalProductId: string;
  validFrom: Date;
  validTo: Date | null;
  actorUserId: string;
  reason: string;
  closedByUserId: string | null;
  closeReason: string | null;
  product: { name: string };
  canonicalProduct: { name: string };
  actor: { name: string };
  closedBy: { name: string } | null;
}): AssociationView {
  return {
    association_ref: row.id,
    product_ref: row.productId,
    product_name: row.product.name,
    canonical_product_ref: row.canonicalProductId,
    canonical_product_name: row.canonicalProduct.name,
    valid_from: row.validFrom.toISOString(),
    valid_to: row.validTo?.toISOString() ?? null,
    actor_ref: row.actorUserId,
    actor_name: row.actor.name,
    reason: row.reason,
    closed_by_ref: row.closedByUserId,
    closed_by_name: row.closedBy?.name ?? null,
    close_reason: row.closeReason,
  };
}
