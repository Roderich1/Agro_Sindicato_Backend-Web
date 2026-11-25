import {
  AgrochemicalApplicationStatus,
  CalendarEventStatus,
  CalendarEventType,
  CropAssignmentStatus,
  InventoryLotStatus,
  Prisma,
  PrismaClient,
  StockMovementReasonType,
  StockMovementType,
} from '@prisma/client';
import type { SeedBaseContext } from './seed-base';
import { addDays, money, qty } from './seed-helpers';

export type SeededLot = {
  id: string;
  productId: string;
  ownerUserId: string;
  currentQuantity: Prisma.Decimal;
};

export async function seedFarmFlows(prisma: PrismaClient, base: SeedBaseContext): Promise<SeededLot[]> {
  const { tenant, farmers, crops, products, activeCampaign, previousCampaign } = base;
  const allLots: SeededLot[] = [];
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

      await prisma.plotCropAssignment
        .create({
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
        })
        .catch(() => undefined);
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
      const cropId = (
        await prisma.plotCropAssignment.findUnique({
          where: { campaignId_plotId: { campaignId: activeCampaign.id, plotId: plot.id } },
          select: { cropId: true },
        })
      )?.cropId;
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

  return allLots;
}
