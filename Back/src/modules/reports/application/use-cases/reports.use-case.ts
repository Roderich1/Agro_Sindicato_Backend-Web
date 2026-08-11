import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  InventoryLotStatus,
  PayableStatus,
  Prisma,
  PurchaseType,
  StockMovementReasonType,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ReportQueryDto } from '../dto/report-query.dto';

interface Actor {
  userId: string;
  role: UserRole;
}

@Injectable()
export class ReportsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async inventoryCurrent(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: this.inventoryWhere(tenantId, actor, query),
      orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'desc' }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true, status: true } },
        product: true,
        warehouse: true,
      },
    });

    const rows = lots.map((lot) => this.mapLot(lot));
    return {
      totals: this.inventoryTotals(rows),
      rows,
    };
  }

  async inventoryByCampaign(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: this.inventoryWhere(tenantId, actor, query),
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        product: { select: { id: true, name: true, unit: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return this.groupBy(lots, (lot) => lot.campaignId ?? 'SIN_CAMPANA', (lot) => ({
      campaign: lot.campaign ?? null,
      product: lot.product,
      owner: lot.owner,
      quantity: lot.currentQuantity,
    }));
  }

  async inventoryByFarmer(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const lots = await this.prisma.inventoryLot.findMany({
      where: this.inventoryWhere(tenantId, actor, query),
      include: {
        owner: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true, unit: true } },
      },
    });

    return this.groupBy(lots, (lot) => lot.ownerUserId, (lot) => ({
      owner: lot.owner,
      product: lot.product,
      quantity: lot.currentQuantity,
    }));
  }

  async purchasesByCampaign(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const purchases = await this.prisma.purchase.findMany({
      where: this.purchaseWhere(tenantId, actor, query),
      orderBy: { purchasedAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
    });

    const rows = purchases.map((purchase) => this.mapPurchase(purchase));
    return {
      totals: {
        purchases: rows.length,
        totalAmount: this.sumStrings(rows.map((row) => row.totalAmount)),
        discountAmount: this.sumStrings(rows.map((row) => row.discountAmount)),
      },
      byCampaign: this.sumRows(rows, (row) => row.campaignId ?? 'SIN_CAMPANA', 'totalAmount'),
      rows,
    };
  }

  async jointPurchases(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        ...this.purchaseWhere(tenantId, actor, query),
        type: PurchaseType.CONJUNTA,
      },
      orderBy: { purchasedAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        supplier: { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
    });

    return {
      totals: {
        purchases: purchases.length,
        totalAmount: this.decimalSum(purchases.map((purchase) => purchase.totalAmount)).toString(),
        participants: purchases.reduce((total, purchase) => total + purchase.participants.length, 0),
      },
      rows: purchases.map((purchase) => ({
        ...this.mapPurchase(purchase),
        participants: purchase.participants.map((participant) => ({
          id: participant.id,
          user: participant.user,
          status: participant.status,
          requestedAmount: participant.requestedAmount.toString(),
          allocatedAmount: participant.allocatedAmount.toString(),
        })),
      })),
    };
  }

  async applicationsByPlotCrop(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const applications = await this.prisma.agrochemicalApplication.findMany({
      where: this.applicationWhere(tenantId, actor, query),
      orderBy: { appliedAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        plot: { select: { id: true, name: true } },
        crop: { select: { id: true, name: true, variety: true } },
        product: { select: { id: true, name: true, unit: true } },
      },
    });

    const rows = applications.map((application) => this.mapApplication(application));
    return {
      totals: {
        applications: rows.length,
        quantity: this.sumStrings(rows.map((row) => row.quantity)),
      },
      byPlot: this.sumRows(rows, (row) => row.plotId, 'quantity'),
      byCrop: this.sumRows(rows, (row) => row.cropId, 'quantity'),
      rows,
    };
  }

  async consumptionByProduct(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const applications = await this.prisma.agrochemicalApplication.findMany({
      where: this.applicationWhere(tenantId, actor, query),
      include: {
        product: { select: { id: true, name: true, unit: true } },
        owner: { select: { id: true, name: true } },
      },
    });

    return this.groupBy(applications, (application) => application.productId, (application) => ({
      product: application.product,
      owner: application.owner,
      quantity: application.quantity,
    }));
  }

  async consumptionByCrop(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const applications = await this.prisma.agrochemicalApplication.findMany({
      where: this.applicationWhere(tenantId, actor, query),
      include: {
        crop: { select: { id: true, name: true, variety: true } },
        product: { select: { id: true, name: true, unit: true } },
      },
    });

    return this.groupBy(applications, (application) => application.cropId, (application) => ({
      crop: application.crop,
      product: application.product,
      quantity: application.quantity,
    }));
  }

  async expiredProducts(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const now = new Date();
    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        ...this.inventoryWhere(tenantId, actor, query),
        expirationDate: { not: null },
      },
      orderBy: { expirationDate: 'asc' },
      include: {
        owner: { select: { id: true, name: true } },
        product: true,
        warehouse: true,
      },
    });

    const rows = lots.map((lot) => {
      const warningLimit = new Date(now);
      warningLimit.setDate(warningLimit.getDate() + lot.product.expirationWarningDays);
      const status = lot.expirationDate && lot.expirationDate.getTime() < now.getTime()
        ? 'VENCIDO'
        : lot.expirationDate && lot.expirationDate.getTime() <= warningLimit.getTime()
          ? 'POR_VENCER'
          : 'OK';
      return { ...this.mapLot(lot), expirationStatus: status };
    }).filter((row) => row.expirationStatus !== 'OK');

    return {
      totals: {
        expired: rows.filter((row) => row.expirationStatus === 'VENCIDO').length,
        expiringSoon: rows.filter((row) => row.expirationStatus === 'POR_VENCER').length,
      },
      rows,
    };
  }

  async payablesAndPayments(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const payables = await this.prisma.payableAccount.findMany({
      where: this.payableWhere(tenantId, actor, query),
      orderBy: { dueDate: 'asc' },
      include: {
        responsibleUser: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true } },
        purchase: { include: { supplier: { select: { id: true, name: true } } } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    const rows = payables.map((payable) => {
      const balance = payable.totalAmount.minus(payable.paidAmount);
      return {
        id: payable.id,
        campaignId: payable.campaignId,
        campaign: payable.campaign,
        responsibleUser: payable.responsibleUser,
        purchaseId: payable.purchaseId,
        supplier: payable.purchase.supplier,
        dueDate: payable.dueDate.toISOString(),
        totalAmount: payable.totalAmount.toString(),
        paidAmount: payable.paidAmount.toString(),
        balance: balance.toString(),
        status: payable.status,
        payments: payable.payments.map((payment) => ({
          id: payment.id,
          campaignId: payment.campaignId,
          amount: payment.amount.toString(),
          paidAt: payment.paidAt.toISOString(),
          notes: payment.notes,
        })),
      };
    });

    return {
      totals: {
        accounts: rows.length,
        totalAmount: this.sumStrings(rows.map((row) => row.totalAmount)),
        paidAmount: this.sumStrings(rows.map((row) => row.paidAmount)),
        balance: this.sumStrings(rows.map((row) => row.balance)),
        pending: rows.filter((row) => row.status !== PayableStatus.PAGADA).length,
      },
      byFarmer: this.sumRows(rows, (row) => row.responsibleUser?.id ?? 'SIN_RESPONSABLE', 'balance'),
      rows,
    };
  }

  async auditByCampaign(tenantId: string, actor: Actor, query: ReportQueryDto = {}) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
        ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { ownerUserId: query.ownerUserId } : {}),
        ...(query.from || query.to
          ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
        owner: { select: { id: true, name: true, email: true } },
        campaign: { select: { id: true, name: true, status: true } },
      },
    });

    const rows = logs.map((log) => ({
      id: log.id,
      campaignId: log.campaignId,
      campaign: log.campaign,
      actor: log.actor,
      owner: log.owner,
      action: log.action,
      entityName: log.entityName,
      entityId: log.entityId,
      summary: log.summary,
      createdAt: log.createdAt.toISOString(),
    }));

    return {
      totals: {
        events: rows.length,
        byAction: rows.reduce<Record<AuditAction, number>>((totals, row) => {
          totals[row.action] = (totals[row.action] ?? 0) + 1;
          return totals;
        }, {} as Record<AuditAction, number>),
      },
      rows,
    };
  }

  private inventoryWhere(tenantId: string, actor: Actor, query: ReportQueryDto): Prisma.InventoryLotWhereInput {
    return {
      tenantId,
      currentQuantity: { gt: new Prisma.Decimal(0) },
      ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
      ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.from || query.to
        ? { receivedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
  }

  private purchaseWhere(tenantId: string, actor: Actor, query: ReportQueryDto): Prisma.PurchaseWhereInput {
    return {
      tenantId,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.from || query.to
        ? { purchasedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
      ...(actor.role === UserRole.AGRICULTOR
        ? { OR: [{ createdById: actor.userId }, { participants: { some: { userId: actor.userId } } }] }
        : query.ownerUserId
          ? { OR: [{ createdById: query.ownerUserId }, { participants: { some: { userId: query.ownerUserId } } }] }
          : {}),
    };
  }

  private applicationWhere(tenantId: string, actor: Actor, query: ReportQueryDto): Prisma.AgrochemicalApplicationWhereInput {
    return {
      tenantId,
      ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
      ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { ownerUserId: query.ownerUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.cropId ? { cropId: query.cropId } : {}),
      ...(query.plotId ? { plotId: query.plotId } : {}),
      ...(query.from || query.to
        ? { appliedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
  }

  private payableWhere(tenantId: string, actor: Actor, query: ReportQueryDto): Prisma.PayableAccountWhereInput {
    return {
      tenantId,
      ...(actor.role === UserRole.AGRICULTOR ? { responsibleUserId: actor.userId } : {}),
      ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { responsibleUserId: query.ownerUserId } : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.from || query.to
        ? { dueDate: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
  }

  private inventoryTotals(rows: Array<{ currentQuantity: string; product: { id: string } }>) {
    return {
      lots: rows.length,
      quantity: this.sumStrings(rows.map((row) => row.currentQuantity)),
      products: new Set(rows.map((row) => row.product.id)).size,
    };
  }

  private mapLot(lot: {
    id: string;
    campaignId: string | null;
    ownerUserId: string;
    lotNumber: string | null;
    expirationDate: Date | null;
    currentQuantity: Prisma.Decimal;
    status?: InventoryLotStatus;
    receivedAt: Date;
    owner?: { id: string; name: string; email?: string } | null;
    campaign?: { id: string; name: string; status: string } | null;
    product: { id: string; name: string; unit: string; activeIngredient?: string | null; category?: string | null };
    warehouse: { id: string; name: string; location: string | null } | null;
  }) {
    return {
      id: lot.id,
      campaignId: lot.campaignId,
      campaign: lot.campaign ?? null,
      ownerUserId: lot.ownerUserId,
      owner: lot.owner ?? null,
      product: lot.product,
      warehouse: lot.warehouse,
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate?.toISOString() ?? null,
      currentQuantity: lot.currentQuantity.toString(),
      status: lot.status ?? null,
      receivedAt: lot.receivedAt.toISOString(),
    };
  }

  private mapPurchase(purchase: {
    id: string;
    campaignId: string | null;
    type: PurchaseType;
    paymentMode: string;
    status: string;
    totalAmount: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    purchasedAt: Date;
    expectedAt: Date | null;
    receivedAt: Date | null;
    campaign?: { id: string; name: string; status: string } | null;
    supplier: { id: string; name: string };
    createdBy?: { id: string; name: string; email: string } | null;
    items: Array<{ id: string; quantity: Prisma.Decimal; subtotal: Prisma.Decimal; product: { id: string; name: string; unit: string } }>;
  }) {
    return {
      id: purchase.id,
      campaignId: purchase.campaignId,
      campaign: purchase.campaign ?? null,
      type: purchase.type,
      paymentMode: purchase.paymentMode,
      status: purchase.status,
      supplier: purchase.supplier,
      createdBy: purchase.createdBy ?? null,
      totalAmount: purchase.totalAmount.toString(),
      discountAmount: purchase.discountAmount.toString(),
      purchasedAt: purchase.purchasedAt.toISOString(),
      expectedAt: purchase.expectedAt?.toISOString() ?? null,
      receivedAt: purchase.receivedAt?.toISOString() ?? null,
      items: purchase.items.map((item) => ({
        id: item.id,
        product: item.product,
        quantity: item.quantity.toString(),
        subtotal: item.subtotal.toString(),
      })),
    };
  }

  private mapApplication(application: {
    id: string;
    campaignId: string;
    ownerUserId: string;
    plotId: string;
    cropId: string;
    productId: string;
    quantity: Prisma.Decimal;
    appliedAt: Date;
    campaign?: { id: string; name: string } | null;
    owner?: { id: string; name: string } | null;
    plot: { id: string; name: string };
    crop: { id: string; name: string; variety: string | null };
    product: { id: string; name: string; unit: string };
  }) {
    return {
      id: application.id,
      campaignId: application.campaignId,
      campaign: application.campaign ?? null,
      ownerUserId: application.ownerUserId,
      owner: application.owner ?? null,
      plotId: application.plotId,
      plot: application.plot,
      cropId: application.cropId,
      crop: application.crop,
      productId: application.productId,
      product: application.product,
      quantity: application.quantity.toString(),
      appliedAt: application.appliedAt.toISOString(),
    };
  }

  private groupBy<T>(
    items: T[],
    keyFn: (item: T) => string,
    mapFn: (item: T) => { quantity: Prisma.Decimal; [key: string]: unknown },
  ) {
    const groups = new Map<string, { key: string; quantity: Prisma.Decimal; rows: unknown[] }>();
    for (const item of items) {
      const key = keyFn(item);
      const mapped = mapFn(item);
      const current = groups.get(key) ?? { key, quantity: new Prisma.Decimal(0), rows: [] };
      current.quantity = current.quantity.plus(mapped.quantity);
      current.rows.push({ ...mapped, quantity: mapped.quantity.toString() });
      groups.set(key, current);
    }

    return Array.from(groups.values()).map((group) => ({
      key: group.key,
      quantity: group.quantity.toString(),
      rows: group.rows,
    }));
  }

  private sumRows<T extends Record<string, unknown>>(
    rows: T[],
    keyFn: (row: T) => string,
    field: keyof T,
  ) {
    const totals = new Map<string, Prisma.Decimal>();
    for (const row of rows) {
      const key = keyFn(row);
      const current = totals.get(key) ?? new Prisma.Decimal(0);
      totals.set(key, current.plus(String(row[field] ?? 0)));
    }

    return Array.from(totals.entries()).map(([key, total]) => ({ key, total: total.toString() }));
  }

  private sumStrings(values: string[]) {
    return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0)).toString();
  }

  private decimalSum(values: Prisma.Decimal[]) {
    return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
  }
}
