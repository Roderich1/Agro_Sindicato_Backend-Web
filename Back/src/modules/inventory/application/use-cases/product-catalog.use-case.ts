import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        commercialName: dto.commercialName?.trim(),
        activeIngredient: dto.activeIngredient?.trim(),
        category: dto.category?.trim(),
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

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.commercialName !== undefined ? { commercialName: dto.commercialName?.trim() || null } : {}),
        ...(dto.activeIngredient !== undefined ? { activeIngredient: dto.activeIngredient?.trim() || null } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
        ...(dto.minimumStock !== undefined ? { minimumStock: this.toDecimal(dto.minimumStock) } : {}),
        ...(dto.expirationWarningDays !== undefined ? { expirationWarningDays: dto.expirationWarningDays } : {}),
      },
    });

    return this.map(updated);
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
    unit: string;
    minimumStock: Prisma.Decimal;
    currentStock: Prisma.Decimal;
    expirationWarningDays: number;
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
      unit: product.unit,
      minimumStock: product.minimumStock.toString(),
      currentStock: product.currentStock.toString(),
      expirationWarningDays: product.expirationWarningDays,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
