import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from '../dto/supplier.dto';

@Injectable()
export class SuppliersUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: ListSuppliersQueryDto) {
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        tenantId,
        ...(query.search
          ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        purchases: {
          select: { id: true, totalAmount: true, paymentMode: true, purchasedAt: true },
          orderBy: { purchasedAt: 'desc' },
          take: 3,
        },
      },
    });

    return suppliers.map((supplier) => this.map(supplier));
  }

  async create(tenantId: string, dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name.trim() } },
    });

    if (existing) throw new ConflictException('Ya existe un proveedor con ese nombre.');

    const supplier = await this.prisma.supplier.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
        notes: dto.notes?.trim(),
      },
      include: { purchases: true },
    });

    return this.map(supplier);
  }

  async update(tenantId: string, supplierId: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('El proveedor no existe en este sindicato.');

    if (dto.name && dto.name.trim() !== supplier.name) {
      const duplicated = await this.prisma.supplier.findUnique({
        where: { tenantId_name: { tenantId, name: dto.name.trim() } },
      });
      if (duplicated) throw new ConflictException('Ya existe un proveedor con ese nombre.');
    }

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: {
        purchases: {
          select: { id: true, totalAmount: true, paymentMode: true, purchasedAt: true },
          orderBy: { purchasedAt: 'desc' },
          take: 3,
        },
      },
    });

    return this.map(updated);
  }

  private map(supplier: {
    id: string;
    tenantId: string;
    name: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    purchases?: { id: string; totalAmount: Prisma.Decimal; paymentMode: string; purchasedAt: Date }[];
  }) {
    return {
      id: supplier.id,
      tenantId: supplier.tenantId,
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      notes: supplier.notes,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
      recentPurchases: supplier.purchases?.map((purchase) => ({
        id: purchase.id,
        totalAmount: purchase.totalAmount.toString(),
        paymentMode: purchase.paymentMode,
        purchasedAt: purchase.purchasedAt.toISOString(),
      })) ?? [],
    };
  }
}
