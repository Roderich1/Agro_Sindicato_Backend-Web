import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListPurchasesQueryDto } from '../dto/list-purchases-query.dto';
import { isOwnShareView, purchaseShare } from '../joint-purchase-share';

@Injectable()
export class ListPurchasesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    userId: string,
    role: string,
    query: ListPurchasesQueryDto,
  ) {
    const purchases = await this.prisma.purchase.findMany({
      where: this.buildWhere(tenantId, userId, role, query),
      orderBy: { purchasedAt: 'desc' },
      include: this.includeSummary(),
      take: 100,
    });

    return purchases.map((purchase) => this.map(purchase, this.viewer(userId, role)));
  }

  async get(tenantId: string, userId: string, role: string, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: {
        id: purchaseId,
        ...this.buildWhere(tenantId, userId, role, {}),
      },
      include: this.includeSummary(),
    });

    if (!purchase) throw new NotFoundException('Compra no encontrada.');
    return this.map(purchase, this.viewer(userId, role));
  }

  private buildWhere(
    tenantId: string,
    userId: string,
    role: string,
    query: ListPurchasesQueryDto,
  ): Prisma.PurchaseWhereInput {
    return {
      tenantId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMode ? { paymentMode: query.paymentMode } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.from || query.to
        ? {
            purchasedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(role === UserRole.AGRICULTOR
        ? {
            OR: [
              { createdById: userId },
              { participants: { some: { userId } } },
            ],
          }
        : {}),
    };
  }

  private includeSummary() {
    return {
      supplier: true,
      campaign: {
        select: { id: true, name: true, status: true, isActive: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      items: {
        include: { product: true, allocations: { select: { userId: true, quantity: true, subtotal: true } } },
        orderBy: { id: 'asc' as const },
      },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
      payables: {
        include: {
          responsibleUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { dueDate: 'asc' as const },
      },
    };
  }

  /**
   * F10-SEC-02 (#45): a farmer who takes part in a legacy joint purchase sees
   * only their own participation and debt, not the other farmers'.
   */
  private viewer(userId: string, role: string): string | null {
    return role === UserRole.AGRICULTOR ? userId : null;
  }

  private map(
    purchase: Prisma.PurchaseGetPayload<{ include: ReturnType<ListPurchasesUseCase['includeSummary']> }>,
    viewer: string | null,
  ) {
    // F10-SEC-02 (#45): a participant sees their own share of a joint purchase.
    const share = isOwnShareView(purchase.type, viewer) ? purchaseShare(purchase.items, viewer) : null;
    return {
      id: purchase.id,
      campaignId: purchase.campaignId,
      campaign: purchase.campaign,
      type: purchase.type,
      paymentMode: purchase.paymentMode,
      status: purchase.status,
      supplier: {
        id: purchase.supplier.id,
        name: purchase.supplier.name,
        phone: purchase.supplier.phone,
      },
      createdBy: purchase.createdBy,
      ...(share ? { share: 'OWN' as const } : {}),
      totalAmount: (share?.totalAmount ?? purchase.totalAmount).toString(),
      discountAmount: (share?.discountAmount ?? purchase.discountAmount).toString(),
      purchasedAt: purchase.purchasedAt.toISOString(),
      expectedAt: purchase.expectedAt?.toISOString() ?? null,
      receivedAt: purchase.receivedAt?.toISOString() ?? null,
      notes: purchase.notes,
      items: (share ? share.items : purchase.items.map((item) => ({ item, quantity: item.quantity, subtotal: item.subtotal, discountAmount: item.discountAmount })))
        .map(({ item, quantity, subtotal, discountAmount }) => ({
          id: item.id,
          product: {
            id: item.product.id,
            name: item.product.name,
            unit: item.product.unit,
          },
          quantity: quantity.toString(),
          unitCost: item.unitCost.toString(),
          discountAmount: discountAmount.toString(),
          subtotal: subtotal.toString(),
        })),
      participants: purchase.participants.filter((participant) => viewer === null || participant.userId === viewer).map((participant) => ({
        id: participant.id,
        user: participant.user,
        status: participant.status,
        requestedAmount: participant.requestedAmount.toString(),
        allocatedAmount: participant.allocatedAmount.toString(),
      })),
      payables: purchase.payables.filter((payable) => viewer === null || payable.responsibleUserId === viewer).map((payable) => ({
        id: payable.id,
        campaignId: payable.campaignId,
        responsibleUser: payable.responsibleUser,
        dueDate: payable.dueDate.toISOString(),
        totalAmount: payable.totalAmount.toString(),
        paidAmount: payable.paidAmount.toString(),
        status: payable.status,
      })),
      createdAt: purchase.createdAt.toISOString(),
      updatedAt: purchase.updatedAt.toISOString(),
    };
  }
}
