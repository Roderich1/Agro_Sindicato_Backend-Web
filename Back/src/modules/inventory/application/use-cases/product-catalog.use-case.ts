import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from '../dto/product-catalog.dto';

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

  async create(tenantId: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
    });

    if (existing) {
      throw new ConflictException('Ya existe un producto con ese nombre en este sindicato.');
    }

    const qrCodeValue = dto.qrCodeValue?.trim() || this.generateQrCodeValue();
    await this.ensureQrCodeAvailable(tenantId, qrCodeValue);

    const product = await this.prisma.product.create({
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

  async update(tenantId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

    if (dto.name && dto.name.trim() !== product.name) {
      const duplicated = await this.prisma.product.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name.trim() } },
      });
      if (duplicated) throw new ConflictException('Ya existe un producto con ese nombre.');
    }

    if (dto.qrCodeValue !== undefined) {
      const qrCodeValue = this.optionalText(dto.qrCodeValue);
      if (qrCodeValue && qrCodeValue !== product.qrCodeValue) {
        await this.ensureQrCodeAvailable(tenantId, qrCodeValue, product.id);
      }
    }

    const updated = await this.prisma.product.update({
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

    return this.map(updated);
  }

  async deactivate(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('El producto no existe en este sindicato.');

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    return this.map(updated);
  }

  private async ensureQrCodeAvailable(tenantId: string, qrCodeValue: string, currentProductId?: string) {
    const duplicated = await this.prisma.product.findFirst({
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
      currentStock: product.currentStock.toString(),
      expirationWarningDays: product.expirationWarningDays,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
