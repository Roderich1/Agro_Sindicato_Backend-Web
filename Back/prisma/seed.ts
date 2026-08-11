import {
  AgrochemicalApplicationStatus,
  AuditAction,
  CalendarEventStatus,
  CalendarEventType,
  CampaignStatus,
  CropAssignmentStatus,
  InventoryLotStatus,
  PayableStatus,
  Prisma,
  PrismaClient,
  PurchaseParticipantStatus,
  PurchasePaymentMode,
  PurchaseStatus,
  PurchaseType,
  StockMovementReasonType,
  StockMovementType,
  SyncOperationStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const DEMO_MARKER = 'massive-flow-v1';

const farmersSeed = [
  ['Juan Perez', 'juan.perez@agro.local'],
  ['Maria Choque', 'maria.choque@agro.local'],
  ['Pedro Mamani', 'pedro.mamani@agro.local'],
  ['Rosa Vargas', 'rosa.vargas@agro.local'],
  ['Luis Rojas', 'luis.rojas@agro.local'],
  ['Elena Suarez', 'elena.suarez@agro.local'],
  ['Carlos Gutierrez', 'carlos.gutierrez@agro.local'],
  ['Ana Flores', 'ana.flores@agro.local'],
  ['Miguel Aguilera', 'miguel.aguilera@agro.local'],
  ['Carmen Rivero', 'carmen.rivero@agro.local'],
  ['Jose Salvatierra', 'jose.salvatierra@agro.local'],
  ['Lucia Mercado', 'lucia.mercado@agro.local'],
] as const;

const cropNames = ['Soya', 'Maiz', 'Arroz', 'Girasol', 'Sorgo', 'Trigo', 'Frejol', 'Mani'];

const productSeed = [
  ['Glifosato 48 SL', 'Herbicida', 'Glifosato', 'IV - Poco peligroso', 'L'],
  ['2,4-D Amina 72', 'Herbicida', '2,4-D', 'II - Moderadamente peligroso', 'L'],
  ['Atrazina 90 WG', 'Herbicida', 'Atrazina', 'III - Ligeramente peligroso', 'kg'],
  ['Cipermetrina 25 EC', 'Insecticida', 'Cipermetrina', 'II - Moderadamente peligroso', 'L'],
  ['Lambda Cihalotrina 5 EC', 'Insecticida', 'Lambda cihalotrina', 'II - Moderadamente peligroso', 'L'],
  ['Imidacloprid 70 WG', 'Insecticida', 'Imidacloprid', 'II - Moderadamente peligroso', 'kg'],
  ['Mancozeb 80 WP', 'Fungicida', 'Mancozeb', 'III - Ligeramente peligroso', 'kg'],
  ['Tebuconazole 25 EW', 'Fungicida', 'Tebuconazole', 'III - Ligeramente peligroso', 'L'],
  ['Paraquat 20 SL', 'Herbicida', 'Paraquat', 'Ib - Altamente peligroso', 'L'],
  ['Abamectina 1.8 EC', 'Insecticida', 'Abamectina', 'II - Moderadamente peligroso', 'L'],
  ['Clorpirifos 48 EC', 'Insecticida', 'Clorpirifos', 'II - Moderadamente peligroso', 'L'],
  ['Metalaxil + Mancozeb', 'Fungicida', 'Metalaxil + Mancozeb', 'III - Ligeramente peligroso', 'kg'],
  ['Aceite Agricola Mineral', 'Coadyuvante', 'Aceite mineral', 'IV - Poco peligroso', 'L'],
  ['Adherente Siliconado', 'Coadyuvante', 'Organosiliconado', 'IV - Poco peligroso', 'L'],
] as const;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

function qty(value: number) {
  return new Prisma.Decimal(value.toFixed(4));
}

async function upsertUser(
  tenantId: string,
  passwordHash: string,
  name: string,
  email: string,
  role: UserRole,
) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role, isActive: true },
    create: { tenantId, name, email, role, passwordHash },
  });
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: { name: 'Sindicato 19 de Agosto' },
    create: {
      name: 'Sindicato 19 de Agosto',
      slug: 'default',
    },
  });

  const passwordHash = await bcrypt.hash('Admin123!', 12);

  const admin = await upsertUser(tenant.id, passwordHash, 'Administrador', 'admin@agro.local', UserRole.ADMINISTRADOR);
  const directiva = await upsertUser(tenant.id, passwordHash, 'Directiva General', 'directiva@agro.local', UserRole.DIRECTIVA);
  const tecnico = await upsertUser(tenant.id, passwordHash, 'Tecnico Operativo', 'tecnico@agro.local', UserRole.DIRECTIVA);

  const farmers = [];
  for (const [name, email] of farmersSeed) {
    farmers.push(await upsertUser(tenant.id, passwordHash, name, email, UserRole.AGRICULTOR));
  }

  await prisma.agriculturalCampaign.updateMany({
    where: { tenantId: tenant.id, isActive: true },
    data: { isActive: false },
  });

  const previousCampaign = await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Invierno 2025' } },
    update: { status: CampaignStatus.CERRADA, isActive: false },
    create: {
      tenantId: tenant.id,
      name: 'Campana Invierno 2025',
      status: CampaignStatus.CERRADA,
      isActive: false,
      startDate: new Date('2025-05-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2025-09-30T00:00:00.000Z'),
      closedAt: new Date('2025-10-05T00:00:00.000Z'),
      createdById: directiva.id,
      closedById: directiva.id,
      notes: 'Campana cerrada con datos historicos.',
    },
  });

  const activeCampaign = await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Verano 2026' } },
    update: { status: CampaignStatus.ABIERTA, isActive: true },
    create: {
      tenantId: tenant.id,
      name: 'Campana Verano 2026',
      status: CampaignStatus.ABIERTA,
      isActive: true,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2026-06-30T00:00:00.000Z'),
      createdById: directiva.id,
      notes: 'Campana activa para demostracion completa del flujo.',
    },
  });

  await prisma.agriculturalCampaign.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Campana Invierno 2026' } },
    update: { status: CampaignStatus.PLANIFICADA, isActive: false },
    create: {
      tenantId: tenant.id,
      name: 'Campana Invierno 2026',
      status: CampaignStatus.PLANIFICADA,
      isActive: false,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      estimatedEndDate: new Date('2026-11-30T00:00:00.000Z'),
      createdById: directiva.id,
      notes: 'Campana planificada para reportes y calendario.',
    },
  });

  const marker = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, entityName: 'SeedDemo', entityId: DEMO_MARKER },
  });

  const crops = [];
  for (const name of cropNames) {
    crops.push(await prisma.crop.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: { isActive: true },
      create: { tenantId: tenant.id, name },
    }));
  }

  const suppliers = [];
  for (const [index, name] of [
    'Agroservicios San Julian',
    'Insumos Oriente',
    'Casa Agricola El Surco',
    'Agroquimicos Bolivia',
    'Distribuidora Norte Verde',
    'Tecnocampo SRL',
  ].entries()) {
    suppliers.push(await prisma.supplier.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: { isActive: true },
      create: {
        tenantId: tenant.id,
        name,
        phone: `7700-10${index}${index}`,
        address: `Av. Agricola bloque ${index + 1}`,
        notes: 'Proveedor demo para compras individuales y conjuntas.',
      },
    }));
  }

  const products = [];
  for (const [index, item] of productSeed.entries()) {
    const [name, category, activeIngredient, toxicology, unit] = item;
    products.push(await prisma.product.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {
        category,
        activeIngredient,
        toxicologicalCategory: toxicology,
        unit,
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        name,
        commercialName: name,
        activeIngredient,
        category,
        toxicologicalCategory: toxicology,
        safetyDataSheetUrl: `https://example.com/fds/${name.toLowerCase().replaceAll(' ', '-')}.pdf`,
        safetyDataSheetName: `FDS ${name}`,
        safetyInstructions: 'Usar guantes, mascara, lentes y lavar equipo despues de aplicar.',
        qrCodeValue: `QR-PROD-${String(index + 1).padStart(3, '0')}`,
        unit,
        minimumStock: qty(20 + index * 3),
        expirationWarningDays: 90,
      },
    }));
  }

  if (marker) {
    console.log('Seed demo masivo ya estaba cargado. No se duplicaron datos.');
    return;
  }

  const allLots: Array<{ id: string; productId: string; ownerUserId: string; currentQuantity: Prisma.Decimal }> = [];
  const plotsByFarmer = new Map<string, Awaited<ReturnType<typeof prisma.plot.create>>[]>();
  const assignmentsByPlot = new Map<string, string>();

  for (const [farmerIndex, farmer] of farmers.entries()) {
    const warehouse = await prisma.warehouse.create({
      data: {
        tenantId: tenant.id,
        ownerUserId: farmer.id,
        name: `Almacen ${farmer.name.split(' ')[0]}`,
        location: `Comunidad zona ${farmerIndex + 1}`,
      },
    });

    const farmerPlots = [];
    for (let plotIndex = 0; plotIndex < 3; plotIndex++) {
      const plot = await prisma.plot.upsert({
        where: {
          tenantId_ownerUserId_name: {
            tenantId: tenant.id,
            ownerUserId: farmer.id,
            name: `Parcela ${plotIndex + 1}`,
          },
        },
        update: { status: plotIndex === 2 && farmerIndex % 4 === 0 ? 'INACTIVA' : 'ACTIVA' },
        create: {
          tenantId: tenant.id,
          ownerUserId: farmer.id,
          name: `Parcela ${plotIndex + 1}`,
          location: `Lote ${farmerIndex + 1}-${plotIndex + 1}, San Julian`,
          area: qty(8 + farmerIndex + plotIndex * 2),
          areaUnit: 'ha',
          status: plotIndex === 2 && farmerIndex % 4 === 0 ? 'INACTIVA' : 'ACTIVA',
          notes: 'Parcela demo con historial de campana.',
        },
      });
      farmerPlots.push(plot);

      const crop = crops[(farmerIndex + plotIndex) % crops.length];
      const assignment = await prisma.plotCropAssignment.create({
        data: {
          tenantId: tenant.id,
          campaignId: activeCampaign.id,
          plotId: plot.id,
          cropId: crop.id,
          ownerUserId: farmer.id,
          status: CropAssignmentStatus.ACTIVO,
          plantedArea: plot.area ?? qty(5),
          plantedAt: addDays(activeCampaign.startDate, 7 + plotIndex * 5),
          notes: 'Cultivo principal de campana activa.',
        },
      });
      assignmentsByPlot.set(plot.id, assignment.id);

      await prisma.plotCropAssignment.create({
        data: {
          tenantId: tenant.id,
          campaignId: previousCampaign.id,
          plotId: plot.id,
          cropId: crops[(farmerIndex + plotIndex + 2) % crops.length].id,
          ownerUserId: farmer.id,
          status: CropAssignmentStatus.CERRADO,
          plantedArea: plot.area ?? qty(5),
          plantedAt: addDays(previousCampaign.startDate, 6 + plotIndex * 4),
          changedAt: previousCampaign.closedAt,
          notes: 'Asignacion historica cerrada.',
        },
      }).catch(() => undefined);
    }
    plotsByFarmer.set(farmer.id, farmerPlots);

    for (let lotIndex = 0; lotIndex < 6; lotIndex++) {
      const product = products[(farmerIndex + lotIndex) % products.length];
      const initial = 45 + farmerIndex * 3 + lotIndex * 5;
      const current = initial - (lotIndex % 3) * 8;
      const lot = await prisma.inventoryLot.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: farmer.id,
          campaignId: activeCampaign.id,
          productId: product.id,
          warehouseId: warehouse.id,
          lotNumber: `L-${farmerIndex + 1}-${lotIndex + 1}-2026`,
          expirationDate: addDays(new Date('2026-06-18T00:00:00.000Z'), -20 + lotIndex * 45 + farmerIndex),
          initialQuantity: qty(initial),
          currentQuantity: qty(current),
          unitCost: money(35 + lotIndex * 7),
          status: current <= 0 ? InventoryLotStatus.AGOTADO : InventoryLotStatus.DISPONIBLE,
          qrCodeValue: `QR-LOT-${farmerIndex + 1}-${lotIndex + 1}`,
          receivedAt: addDays(activeCampaign.startDate, lotIndex * 8),
        },
      });
      allLots.push({ id: lot.id, productId: product.id, ownerUserId: farmer.id, currentQuantity: lot.currentQuantity });

      await prisma.stockMovement.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: farmer.id,
          campaignId: activeCampaign.id,
          productId: product.id,
          inventoryLotId: lot.id,
          warehouseId: warehouse.id,
          userId: farmer.id,
          type: StockMovementType.ENTRADA,
          reasonType: lotIndex % 2 === 0 ? StockMovementReasonType.COMPRA : StockMovementReasonType.ENTRADA_SIMPLE,
          quantity: qty(initial),
          reason: 'Ingreso demo de stock para campana activa.',
          occurredAt: addDays(activeCampaign.startDate, lotIndex * 8),
        },
      });
    }
  }

  for (const [farmerIndex, farmer] of farmers.entries()) {
    const farmerPlots = plotsByFarmer.get(farmer.id) ?? [];
    const farmerLots = allLots.filter((lot) => lot.ownerUserId === farmer.id);
    for (const [appIndex, plot] of farmerPlots.slice(0, 2).entries()) {
      const lot = farmerLots[(appIndex + farmerIndex) % farmerLots.length];
      const cropId = (await prisma.plotCropAssignment.findUnique({
        where: { campaignId_plotId: { campaignId: activeCampaign.id, plotId: plot.id } },
        select: { cropId: true },
      }))?.cropId;
      if (!cropId || !lot) continue;

      const app = await prisma.agrochemicalApplication.create({
        data: {
          tenantId: tenant.id,
          campaignId: activeCampaign.id,
          ownerUserId: farmer.id,
          appliedById: farmer.id,
          plotId: plot.id,
          cropId,
          plotCropAssignmentId: assignmentsByPlot.get(plot.id),
          productId: lot.productId,
          inventoryLotId: lot.id,
          quantity: qty(4 + appIndex),
          dose: `${1.5 + appIndex} L/ha`,
          targetPest: appIndex % 2 === 0 ? 'Malezas de hoja ancha' : 'Gusano cogollero',
          weatherConditions: 'Clima estable, sin lluvia inmediata.',
          responsibleName: farmer.name,
          notes: 'Aplicacion demo registrada desde flujo operativo.',
          status: appIndex === 1 && farmerIndex % 5 === 0 ? AgrochemicalApplicationStatus.ANULADA : AgrochemicalApplicationStatus.REGISTRADA,
          appliedAt: addDays(activeCampaign.startDate, 35 + farmerIndex + appIndex * 8),
        },
      });

      await prisma.stockMovement.create({
        data: {
          tenantId: tenant.id,
          ownerUserId: farmer.id,
          campaignId: activeCampaign.id,
          productId: lot.productId,
          inventoryLotId: lot.id,
          plotId: plot.id,
          cropId,
          applicationId: app.id,
          userId: farmer.id,
          type: StockMovementType.SALIDA,
          reasonType: StockMovementReasonType.APLICACION,
          quantity: app.quantity,
          reason: `Aplicacion en ${plot.name}`,
          occurredAt: app.appliedAt,
        },
      });

      await prisma.calendarEvent.create({
        data: {
          tenantId: tenant.id,
          campaignId: activeCampaign.id,
          ownerUserId: farmer.id,
          type: CalendarEventType.APLICACION,
          status: CalendarEventStatus.COMPLETADO,
          title: `Aplicacion ${plot.name}`,
          description: 'Evento demo generado por aplicacion.',
          eventDate: app.appliedAt,
          sourceEntity: 'AgrochemicalApplication',
          sourceEntityId: app.id,
        },
      });
    }
  }

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

  console.log(`Seed demo masivo completado: ${farmers.length} agricultores, ${products.length} productos, ${allLots.length} lotes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
