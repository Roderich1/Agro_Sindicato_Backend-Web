import {
  AuditAction,
  CalendarEventStatus,
  CalendarEventType,
  PayableStatus,
  PrismaClient,
  PurchaseParticipantStatus,
  PurchasePaymentMode,
  PurchaseStatus,
  PurchaseType,
  SyncOperationStatus,
} from '@prisma/client';
import type { SeedBaseContext } from './seed-base';
import type { SeededLot } from './seed-farm-flows';
import { DEMO_MARKER, addDays, money, qty } from './seed-helpers';

export async function seedJointAndOps(prisma: PrismaClient, base: SeedBaseContext, allLots: SeededLot[]): Promise<void> {
  const { tenant, admin, directiva, tecnico, farmers, suppliers, products, activeCampaign, previousCampaign } = base;

  for (const [purchaseIndex, farmer] of farmers.entries()) {
    const supplier = suppliers[purchaseIndex % suppliers.length];
    const product = products[purchaseIndex % products.length];
    const secondProduct = products[(purchaseIndex + 3) % products.length];
    const paymentMode = purchaseIndex % 3 === 0 ? PurchasePaymentMode.CREDITO : PurchasePaymentMode.CONTADO;
    const purchase = await prisma.purchase.create({
      data: {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        supplierId: supplier.id,
        createdById: farmer.id,
        type: PurchaseType.INDIVIDUAL,
        paymentMode,
        status: purchaseIndex % 4 === 0 ? PurchaseStatus.RECIBIDA_PARCIAL : PurchaseStatus.RECIBIDA,
        purchasedAt: addDays(activeCampaign.startDate, 12 + purchaseIndex),
        receivedAt: addDays(activeCampaign.startDate, 16 + purchaseIndex),
        totalAmount: money(980 + purchaseIndex * 145),
        discountAmount: money(purchaseIndex % 2 === 0 ? 30 : 0),
        notes: 'Compra individual demo.',
      },
    });

    await prisma.purchaseItem.createMany({
      data: [
        {
          tenantId: tenant.id,
          purchaseId: purchase.id,
          productId: product.id,
          quantity: qty(12 + purchaseIndex),
          unitCost: money(45),
          subtotal: money((12 + purchaseIndex) * 45),
        },
        {
          tenantId: tenant.id,
          purchaseId: purchase.id,
          productId: secondProduct.id,
          quantity: qty(8 + purchaseIndex),
          unitCost: money(58),
          subtotal: money((8 + purchaseIndex) * 58),
        },
      ],
    });

    if (paymentMode === PurchasePaymentMode.CREDITO) {
      const total = 980 + purchaseIndex * 145;
      const paid = purchaseIndex % 2 === 0 ? total * 0.35 : 0;
      const payable = await prisma.payableAccount.create({
        data: {
          tenantId: tenant.id,
          campaignId: activeCampaign.id,
          purchaseId: purchase.id,
          responsibleUserId: farmer.id,
          dueDate: addDays(new Date('2026-06-18T00:00:00.000Z'), 10 + purchaseIndex * 2),
          totalAmount: money(total),
          paidAmount: money(paid),
          status: paid > 0 ? PayableStatus.PARCIAL : PayableStatus.PENDIENTE,
        },
      });

      if (paid > 0) {
        await prisma.payment.create({
          data: {
            tenantId: tenant.id,
            campaignId: activeCampaign.id,
            payableAccountId: payable.id,
            registeredById: farmer.id,
            amount: money(paid),
            paidAt: addDays(activeCampaign.startDate, 55 + purchaseIndex),
            notes: 'Pago parcial demo.',
          },
        });
      }

      await prisma.calendarEvent.create({
        data: {
          tenantId: tenant.id,
          campaignId: activeCampaign.id,
          ownerUserId: farmer.id,
          type: CalendarEventType.PAGO_PROXIMO,
          status: CalendarEventStatus.PENDIENTE,
          title: `Pago pendiente ${supplier.name}`,
          description: `Saldo por compra a credito: ${total - paid} Bs.`,
          eventDate: payable.dueDate,
          sourceEntity: 'PayableAccount',
          sourceEntityId: payable.id,
        },
      });
    }
  }

  const jointPurchase = await prisma.purchase.create({
    data: {
      tenantId: tenant.id,
      campaignId: activeCampaign.id,
      supplierId: suppliers[0].id,
      createdById: directiva.id,
      type: PurchaseType.CONJUNTA,
      paymentMode: PurchasePaymentMode.CREDITO,
      status: PurchaseStatus.CONFIRMADA,
      purchasedAt: addDays(activeCampaign.startDate, 70),
      expectedAt: addDays(new Date('2026-06-18T00:00:00.000Z'), 14),
      totalAmount: money(28400),
      discountAmount: money(900),
      notes: 'Compra conjunta demo para agricultores activos.',
    },
  });

  const jointItem = await prisma.purchaseItem.create({
    data: {
      tenantId: tenant.id,
      purchaseId: jointPurchase.id,
      productId: products[0].id,
      quantity: qty(240),
      unitCost: money(95),
      discountAmount: money(900),
      subtotal: money(21900),
    },
  });

  for (const [index, farmer] of farmers.entries()) {
    await prisma.purchaseParticipant.create({
      data: {
        tenantId: tenant.id,
        purchaseId: jointPurchase.id,
        userId: farmer.id,
        status: index % 4 === 0 ? PurchaseParticipantStatus.PENDIENTE : PurchaseParticipantStatus.CONFIRMADO,
        requestedAmount: money(1800 + index * 50),
        allocatedAmount: money(1700 + index * 45),
        notes: 'Participacion demo en compra conjunta.',
      },
    });
    await prisma.purchaseItemAllocation.create({
      data: {
        tenantId: tenant.id,
        purchaseItemId: jointItem.id,
        userId: farmer.id,
        quantity: qty(20),
        subtotal: money(1825),
      },
    });
  }

  await prisma.calendarEvent.create({
    data: {
      tenantId: tenant.id,
      campaignId: activeCampaign.id,
      type: CalendarEventType.COMPRA_PROGRAMADA,
      status: CalendarEventStatus.PENDIENTE,
      title: 'Recepcion compra conjunta Glifosato',
      description: 'Compra programada por directiva.',
      eventDate: jointPurchase.expectedAt ?? addDays(new Date(), 14),
      sourceEntity: 'Purchase',
      sourceEntityId: jointPurchase.id,
    },
  });

  for (const lot of allLots.slice(0, 24)) {
    await prisma.calendarEvent.create({
      data: {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        ownerUserId: lot.ownerUserId,
        type: CalendarEventType.VENCIMIENTO_LOTE,
        status: CalendarEventStatus.PENDIENTE,
        title: 'Lote por vencer',
        description: 'Revisar fecha de vencimiento del producto.',
        eventDate: addDays(new Date('2026-06-18T00:00:00.000Z'), 15),
        sourceEntity: 'InventoryLot',
        sourceEntityId: lot.id,
      },
    });
  }

  for (const product of products) {
    const total = await prisma.inventoryLot.aggregate({
      where: { tenantId: tenant.id, productId: product.id },
      _sum: { currentQuantity: true },
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { currentStock: total._sum.currentQuantity ?? qty(0) },
    });
  }

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        actorUserId: directiva.id,
        action: AuditAction.ABRIR_CAMPANA,
        entityName: 'AgriculturalCampaign',
        entityId: activeCampaign.id,
        summary: 'Directiva abrio campana demo masiva.',
        after: { campaign: activeCampaign.name },
      },
      {
        tenantId: tenant.id,
        campaignId: previousCampaign.id,
        actorUserId: directiva.id,
        action: AuditAction.CERRAR_CAMPANA,
        entityName: 'AgriculturalCampaign',
        entityId: previousCampaign.id,
        summary: 'Directiva cerro campana historica demo.',
      },
      {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        actorUserId: tecnico.id,
        action: AuditAction.AJUSTAR_STOCK,
        entityName: 'StockMovement',
        entityId: DEMO_MARKER,
        summary: 'Carga masiva de movimientos demo.',
        metadata: { lots: allLots.length, farmers: farmers.length },
      },
      {
        tenantId: tenant.id,
        actorUserId: admin.id,
        action: AuditAction.OTRO,
        entityName: 'SeedDemo',
        entityId: DEMO_MARKER,
        summary: 'Seed demo masivo cargado correctamente.',
        metadata: {
          farmers: farmers.length,
          products: products.length,
          campaigns: 3,
          generatedAt: new Date().toISOString(),
        },
      },
    ],
  });

  await prisma.syncOperation.createMany({
    data: [
      {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        userId: farmers[0].id,
        clientId: 'web-demo-device-001',
        entityName: 'STOCK_ENTRY',
        entityId: 'offline-demo-aplicada',
        operation: 'STOCK_ENTRY',
        payload: { product: { productId: products[0].id }, quantity: 5, entryReason: 'COMPRA' },
        status: SyncOperationStatus.APLICADA,
        appliedAt: new Date(),
      },
      {
        tenantId: tenant.id,
        campaignId: activeCampaign.id,
        userId: farmers[1].id,
        clientId: 'web-demo-device-002',
        entityName: 'AGROCHEMICAL_APPLICATION',
        entityId: 'offline-demo-conflicto',
        operation: 'AGROCHEMICAL_APPLICATION',
        payload: { plotId: 'demo', quantity: 9999 },
        status: SyncOperationStatus.CONFLICTO,
        errorMessage: 'Stock insuficiente para aplicar producto.',
      },
    ],
  });

  const conflictOperation = await prisma.syncOperation.findFirst({
    where: { tenantId: tenant.id, entityId: 'offline-demo-conflicto' },
  });
  if (conflictOperation) {
    await prisma.syncConflict.create({
      data: {
        syncOperationId: conflictOperation.id,
        clientSnapshot: { quantity: 9999 },
        serverSnapshot: { message: 'Stock insuficiente', available: 12 },
      },
    });
  }
}
