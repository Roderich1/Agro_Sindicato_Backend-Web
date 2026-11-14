import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from '../dto/product-catalog.dto';

/** Bitácora codes of the institutional catalogue changes (RF-25, D-01), in `metadata.event`. */
export type ProductAuditEvent = 'PRODUCT_CREATED' | 'PRODUCT_UPDATED' | 'PRODUCT_DEACTIVATED';

const AUDIT_ENTITY = 'Product';

type ProductView = ReturnType<ProductCatalogUseCase['map']>;
type Tx = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ProductCatalogUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListProductsQueryDto) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        ...(query.search
          ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
          : {}),
        ...(query.category
          ? { category: { equals: query.category, mode: Prisma.QueryMode.insensitive } }
          : {}),
        ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => this.map(product));
  }

  /**
   * Catalogue creation by the Directiva or the Administración: the product and
   * its Bitácora entry are one transaction (RF-25, D-01).
   */
  async create(tenantId: string, actorUserId: string, dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.createWithin(tenantId, dto, tx);
      await this.audit(tx, tenantId, actorUserId, product.id, {
        action: AuditAction.CREAR,
        event: 'PRODUCT_CREATED',
        summary: `Producto «${product.name}» creado en el catálogo.`,
        after: auditFields(product),
      });
      return product;
    });
  }

  /**
   * Creates the product inside the caller's transaction, without an entry of
   * its own: E1 create-product (the product and its link are one unit of work)
   * writes its own Bitácora entry for the whole operation.
   */
  async createWithin(tenantId: string, dto: CreateProductDto, client: Tx) {
    const existing = await client.product.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
    });

    if (existing) {
      throw new ConflictException('Ya existe un producto con ese nombre en este sindicato.');
    }

    const qrCodeValue = dto.qrCodeValue?.trim() || this.generateQrCodeValue();
    await this.ensureQrCodeAvailable(tenantId, qrCodeValue, undefined, client);

    const product = await client.product.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        commercialName: this.optionalText(dto.commercialName),
        activeIngredient: this.optionalText(dto.activeIngredient),
        category: this.optionalText(dto.category),
        toxicologicalCategory: this.optionalText(dto.toxicologicalCategory),
        safetyDataSheetUrl: this.optionalText(dto.safetyDataSheetUrl),
        safetyDataSheetName: this.optionalText(dto.safetyDataSheetName),
        safetyInstructions: this.optionalText(dto.safetyInstructions),
        qrCodeValue,
        unit: dto.unit.trim(),
        minimumStock: this.toDecimal(dto.minimumStock ?? 0),
        expirationWarningDays: dto.expirationWarningDays ?? 90,
      },
    });

    return this.map(product);
  }

  async update(tenantId: string, actorUserId: string, productId: string, dto: UpdateProductDto) {
    return this.prisma.$transaction((tx) => this.updateWithin(tx, tenantId, actorUserId, productId, dto));
  }

  private async updateWithin(tx: Tx, tenantId: string, actorUserId: string, productId: string, dto: UpdateProductDto) {
    const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

    if (dto.name && dto.name.trim() !== product.name) {
      const duplicated = await tx.product.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name.trim() } },
      });
      if (duplicated) throw new ConflictException('Ya existe un producto con ese nombre.');
    }

    if (dto.qrCodeValue !== undefined) {
      const qrCodeValue = this.optionalText(dto.qrCodeValue);
      if (qrCodeValue && qrCodeValue !== product.qrCodeValue) {
        await this.ensureQrCodeAvailable(tenantId, qrCodeValue, product.id, tx);
      }
    }

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.commercialName !== undefined ? { commercialName: this.optionalText(dto.commercialName) } : {}),
        ...(dto.activeIngredient !== undefined ? { activeIngredient: this.optionalText(dto.activeIngredient) } : {}),
        ...(dto.category !== undefined ? { category: this.optionalText(dto.category) } : {}),
        ...(dto.toxicologicalCategory !== undefined
          ? { toxicologicalCategory: this.optionalText(dto.toxicologicalCategory) }
          : {}),
        ...(dto.safetyDataSheetUrl !== undefined
          ? { safetyDataSheetUrl: this.optionalText(dto.safetyDataSheetUrl) }
          : {}),
        ...(dto.safetyDataSheetName !== undefined
          ? { safetyDataSheetName: this.optionalText(dto.safetyDataSheetName) }
          : {}),
        ...(dto.safetyInstructions !== undefined
          ? { safetyInstructions: this.optionalText(dto.safetyInstructions) }
          : {}),
        ...(dto.qrCodeValue !== undefined ? { qrCodeValue: this.optionalText(dto.qrCodeValue) } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
        ...(dto.minimumStock !== undefined ? { minimumStock: this.toDecimal(dto.minimumStock) } : {}),
        ...(dto.expirationWarningDays !== undefined ? { expirationWarningDays: dto.expirationWarningDays } : {}),
      },
    });

    const before = auditFields(this.map(product));
    const after = auditFields(this.map(updated));
    const changed = Object.keys(after).filter((key) => before[key] !== after[key]);
    // Saving the same values changes nothing and leaves no entry.
    if (changed.length > 0) {
      await this.audit(tx, tenantId, actorUserId, updated.id, {
        action: AuditAction.ACTUALIZAR,
        event: 'PRODUCT_UPDATED',
        summary:
          product.name === updated.name
            ? `Producto «${updated.name}» actualizado en el catálogo.`
            : `Producto «${product.name}» actualizado en el catálogo (ahora «${updated.name}»).`,
        before: Object.fromEntries(changed.map((key) => [key, before[key]])),
        after: Object.fromEntries(changed.map((key) => [key, after[key]])),
      });
    }

    return this.map(updated);
  }

  async deactivate(tenantId: string, actorUserId: string, productId: string) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
      if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

      const updated = await tx.product.update({
        where: { id: productId },
        data: { isActive: false },
      });
      // An already inactive product is not deactivated again: no entry.
      if (product.isActive) {
        await this.audit(tx, tenantId, actorUserId, updated.id, {
          action: AuditAction.INACTIVAR,
          event: 'PRODUCT_DEACTIVATED',
          summary: `Producto «${updated.name}» inactivado en el catálogo.`,
          before: { isActive: true },
          after: { isActive: false },
        });
      }

      return this.map(updated);
    });
  }

  /** Institutional Bitácora entry (`ownerUserId: null`), in the change's transaction. */
  private async audit(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    productId: string,
    entry: {
      action: AuditAction;
      event: ProductAuditEvent;
      summary: string;
      before?: Prisma.InputJsonObject;
      after: Prisma.InputJsonObject;
    },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        ownerUserId: null,
        action: entry.action,
        entityName: AUDIT_ENTITY,
        entityId: productId,
        summary: entry.summary,
        ...(entry.before ? { before: entry.before } : {}),
        after: entry.after,
        metadata: { event: entry.event },
      },
    });
  }

  private async ensureQrCodeAvailable(
    tenantId: string,
    qrCodeValue: string,
    currentProductId?: string,
    client: Tx = this.prisma,
  ) {
    const duplicated = await client.product.findFirst({
      where: {
        tenantId,
        qrCodeValue,
        ...(currentProductId ? { id: { not: currentProductId } } : {}),
      },
    });
    if (duplicated) {
      throw new ConflictException('Ya existe un producto con ese QR en este sindicato.');
    }
  }

  private generateQrCodeValue() {
    return `AGRO-PRODUCT-${randomUUID()}`;
  }

  private optionalText(value?: string | null) {
    const text = value?.trim();
    return text || null;
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toString());
  }

  private map(product: {
    id: string;
    tenantId: string;
    name: string;
    commercialName: string | null;
    activeIngredient: string | null;
    category: string | null;
    toxicologicalCategory: string | null;
    safetyDataSheetUrl: string | null;
    safetyDataSheetName: string | null;
    safetyInstructions: string | null;
    qrCodeValue: string | null;
    unit: string;
    minimumStock: Prisma.Decimal;
    currentStock: Prisma.Decimal;
    expirationWarningDays: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: product.id,
      tenantId: product.tenantId,
      name: product.name,
      commercialName: product.commercialName,
      activeIngredient: product.activeIngredient,
      category: product.category,
      toxicologicalCategory: product.toxicologicalCategory,
      safetyDataSheetUrl: product.safetyDataSheetUrl,
      safetyDataSheetName: product.safetyDataSheetName,
      safetyInstructions: product.safetyInstructions,
      qrCodeValue: product.qrCodeValue,
      unit: product.unit,
      minimumStock: product.minimumStock.toString(),
      // F10-SEC-02 (#45): `currentStock` (the sum of every farmer's private lots)
      // is not served by the shared catalog.
      expirationWarningDays: product.expirationWarningDays,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}

/** The catalogue fields an entry compares: no identifiers or timestamps. */
function auditFields(view: ProductView): Record<string, string | number | boolean | null> {
  const { id: _id, tenantId: _tenantId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = view;
  return fields;
}
