import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AgrochemicalApplicationStatus,
  AuditAction,
  CalendarEventStatus,
  CalendarEventType,
  CropAssignmentStatus,
  Prisma,
  StockMovementReasonType,
  StockMovementType,
  UserRole,
} from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

interface Actor {
  userId: string;
  role: UserRole;
}

interface ListApplicationsInput {
  campaignId?: string;
  plotId?: string;
  productId?: string;
  ownerUserId?: string;
  status?: AgrochemicalApplicationStatus;
}

interface CreateApplicationInput {
  campaignId?: string | null;
  plotId: string;
  productId: string;
  inventoryLotId?: string | null;
  quantity: number;
  dose?: string | null;
  targetPest?: string | null;
  weatherConditions?: string | null;
  responsibleName?: string | null;
  appliedAt?: string | null;
  notes?: string | null;
}

@Injectable()
export class ApplicationsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async list(tenantId: string, actor: Actor, input: ListApplicationsInput = {}) {
    const ownerUserId = this.resolveReadableOwner(actor, input.ownerUserId);
    const applications = await this.prisma.agrochemicalApplication.findMany({
      where: {
        tenantId,
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.plotId ? { plotId: input.plotId } : {}),
        ...(input.productId ? { productId: input.productId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: { appliedAt: 'desc' },
      include: this.applicationInclude(),
    });

    return applications.map((application) => this.mapApplication(application));
  }

  async get(tenantId: string, actor: Actor, applicationId: string) {
    const application = await this.prisma.agrochemicalApplication.findFirst({
      where: {
        id: applicationId,
        tenantId,
        ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
      },
      include: this.applicationInclude(),
    });
    if (!application) {
      throw new NotFoundException('La aplicacion no existe o no es visible para el usuario.');
    }

    return this.mapApplication(application);
  }

  async create(tenantId: string, actor: Actor, input: CreateApplicationInput) {
    this.assertAgriculturist(actor);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.campaignContext.resolveCampaignForOperation(
        tenantId,
        input.campaignId,
        tx,
      );
      const plotAssignment = await tx.plotCropAssignment.findFirst({
        where: {
          tenantId,
          campaignId: campaign.id,
          plotId: input.plotId,
          ownerUserId: actor.userId,
          status: { in: [CropAssignmentStatus.ACTIVO, CropAssignmentStatus.PLANIFICADO] },
          plot: { ownerUserId: actor.userId },
        },
        include: { plot: true, crop: true },
      });
      if (!plotAssignment) {
        throw new NotFoundException('La parcela no pertenece al agricultor o no tiene cultivo asignado en la campana.');
      }

      const product = await tx.product.findFirst({
        where: { id: input.productId, tenantId, isActive: true },
      });
      if (!product) {
        throw new NotFoundException('El producto no existe o esta inactivo.');
      }

      const quantity = this.toDecimal(input.quantity);
      const lots = await tx.inventoryLot.findMany({
        where: {
          tenantId,
          ownerUserId: actor.userId,
          productId: input.productId,
          ...(input.inventoryLotId ? { id: input.inventoryLotId } : {}),
          currentQuantity: { gt: new Prisma.Decimal(0) },
        },
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }],
        include: { product: true, warehouse: true },
      });
      const available = lots.reduce((total, lot) => total.plus(lot.currentQuantity), new Prisma.Decimal(0));
      if (available.lessThan(quantity)) {
        throw new BadRequestException(`Stock insuficiente. Disponible: ${available.toString()} ${product.unit}.`);
      }

      const appliedAt = input.appliedAt
        ? this.toDate(input.appliedAt, 'La fecha de aplicacion es invalida.')
        : new Date();
      const application = await tx.agrochemicalApplication.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          ownerUserId: actor.userId,
          appliedById: actor.userId,
          plotId: plotAssignment.plotId,
          cropId: plotAssignment.cropId,
          plotCropAssignmentId: plotAssignment.id,
          productId: product.id,
          inventoryLotId: input.inventoryLotId ?? null,
          quantity,
          dose: this.optionalText(input.dose),
          targetPest: this.optionalText(input.targetPest),
          weatherConditions: this.optionalText(input.weatherConditions),
          responsibleName: this.optionalText(input.responsibleName),
          notes: this.optionalText(input.notes),
          appliedAt,
        },
        include: this.applicationInclude(),
      });

      const movements = await this.discountStockForApplication(tx, {
        tenantId,
        ownerUserId: actor.userId,
        userId: actor.userId,
        campaignId: campaign.id,
        productId: product.id,
        applicationId: application.id,
        quantity,
        lots,
        reason: `Aplicacion en parcela ${plotAssignment.plot.name}`,
      });

      await tx.calendarEvent.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          ownerUserId: actor.userId,
          type: CalendarEventType.APLICACION,
          status: CalendarEventStatus.COMPLETADO,
          title: `Aplicacion de ${product.name}`,
          description: `Parcela: ${plotAssignment.plot.name}. Cultivo: ${plotAssignment.crop.name}.`,
          eventDate: appliedAt,
          sourceEntity: 'AgrochemicalApplication',
          sourceEntityId: application.id,
          metadata: this.toJsonValue({
            productId: product.id,
            plotId: plotAssignment.plotId,
            cropId: plotAssignment.cropId,
            quantity: quantity.toString(),
          }),
        },
      });

      await this.recordAudit(tx, {
        tenantId,
        campaignId: campaign.id,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.CREAR,
        entityName: 'AgrochemicalApplication',
        entityId: application.id,
        summary: `Aplicacion registrada: ${product.name} en ${plotAssignment.plot.name}`,
        after: { application, movements: movements.map((item) => item.id) },
      });

      return {
        message: 'Aplicacion de agroquimico registrada correctamente.',
        application: this.mapApplication(application),
        movements: movements.map((movement) => this.mapMovement(movement)),
      };
    });
  }

  async cancel(tenantId: string, actor: Actor, applicationId: string, reason: string) {
    this.assertAgriculturist(actor);
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Debe indicar el motivo de anulacion.');
    }

    return this.prisma.$transaction(async (tx) => {
      const application = await tx.agrochemicalApplication.findFirst({
        where: { id: applicationId, tenantId, ownerUserId: actor.userId },
      });
      if (!application) {
        throw new NotFoundException('La aplicacion no existe para este agricultor.');
      }
      if (application.status === AgrochemicalApplicationStatus.ANULADA) {
        throw new BadRequestException('La aplicacion ya fue anulada.');
      }

      const campaign = await tx.agriculturalCampaign.findFirst({
        where: { id: application.campaignId, tenantId },
      });
      if (!campaign) {
        throw new NotFoundException('La campana asociada a la aplicacion no existe.');
      }
      this.campaignContext.ensureCampaignIsOpen(campaign);

      const cancelled = await tx.agrochemicalApplication.update({
        where: { id: application.id },
        data: {
          status: AgrochemicalApplicationStatus.ANULADA,
          notes: application.notes
            ? `${application.notes}\nAnulacion: ${trimmedReason}`
            : `Anulacion: ${trimmedReason}`,
        },
        include: this.applicationInclude(),
      });

      await tx.calendarEvent.updateMany({
        where: {
          tenantId,
          sourceEntity: 'AgrochemicalApplication',
          sourceEntityId: application.id,
        },
        data: { status: CalendarEventStatus.CANCELADO },
      });

      await this.recordAudit(tx, {
        tenantId,
        campaignId: application.campaignId,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.ACTUALIZAR,
        entityName: 'AgrochemicalApplication',
        entityId: application.id,
        summary: `Aplicacion anulada: ${trimmedReason}`,
        before: application,
        after: cancelled,
      });

      return {
        message: 'Aplicacion anulada correctamente.',
        application: this.mapApplication(cancelled),
      };
    });
  }

  private async discountStockForApplication(
    tx: TxClient,
    input: {
      tenantId: string;
      ownerUserId: string;
      userId: string;
      campaignId: string;
      productId: string;
      applicationId: string;
      quantity: Prisma.Decimal;
      lots: Array<{
        id: string;
        warehouseId: string | null;
        currentQuantity: Prisma.Decimal;
      }>;
      reason: string;
    },
  ) {
    let remaining = input.quantity;
    const movements = [];

    for (const lot of input.lots) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const deducted = lot.currentQuantity.lessThan(remaining) ? lot.currentQuantity : remaining;
      const updatedLot = await tx.inventoryLot.updateMany({
        where: {
          id: lot.id,
          tenantId: input.tenantId,
          ownerUserId: input.ownerUserId,
          currentQuantity: { gte: deducted },
        },
        data: { currentQuantity: { decrement: deducted } },
      });
      if (updatedLot.count !== 1) {
        throw new BadRequestException(
          'Stock insuficiente. El inventario fue actualizado por otra operacion, vuelve a intentarlo.',
        );
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          ownerUserId: input.ownerUserId,
          campaignId: input.campaignId,
          productId: input.productId,
          inventoryLotId: lot.id,
          warehouseId: lot.warehouseId,
          applicationId: input.applicationId,
          userId: input.userId,
          type: StockMovementType.SALIDA,
          reasonType: StockMovementReasonType.APLICACION,
          quantity: deducted,
          reason: input.reason,
        },
        include: { product: true, inventoryLot: true, warehouse: true, user: true },
      });
      movements.push(movement);
      remaining = remaining.minus(deducted);
    }

    const updatedProduct = await tx.product.updateMany({
      where: {
        id: input.productId,
        tenantId: input.tenantId,
        currentStock: { gte: input.quantity },
      },
      data: { currentStock: { decrement: input.quantity } },
    });
    if (updatedProduct.count !== 1) {
      throw new BadRequestException(
        'Stock global insuficiente. El inventario fue actualizado por otra operacion, vuelve a intentarlo.',
      );
    }

    return movements;
  }

  private resolveReadableOwner(actor: Actor, requestedOwnerUserId?: string) {
    if (actor.role === UserRole.AGRICULTOR) return actor.userId;
    return requestedOwnerUserId;
  }

  private assertAgriculturist(actor: Actor) {
    if (actor.role !== UserRole.AGRICULTOR) {
      throw new ForbiddenException('Solo el agricultor puede registrar o anular sus aplicaciones.');
    }
  }

  private applicationInclude() {
    return {
      campaign: { select: { id: true, name: true, status: true, isActive: true } },
      plot: { select: { id: true, name: true, location: true } },
      crop: { select: { id: true, name: true, variety: true } },
      product: { select: { id: true, name: true, unit: true, toxicologicalCategory: true } },
      inventoryLot: { select: { id: true, lotNumber: true, expirationDate: true } },
      owner: { select: { id: true, name: true, email: true } },
      appliedBy: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.AgrochemicalApplicationInclude;
  }

  private mapApplication(application: {
    id: string;
    campaignId: string;
    ownerUserId: string;
    appliedById: string | null;
    plotId: string;
    cropId: string;
    plotCropAssignmentId: string | null;
    productId: string;
    inventoryLotId: string | null;
    quantity: Prisma.Decimal | number;
    dose: string | null;
    targetPest: string | null;
    weatherConditions: string | null;
    responsibleName: string | null;
    notes: string | null;
    status: AgrochemicalApplicationStatus;
    appliedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    campaign?: { id: string; name: string; status: string; isActive: boolean };
    plot?: { id: string; name: string; location: string | null };
    crop?: { id: string; name: string; variety: string | null };
    product?: { id: string; name: string; unit: string; toxicologicalCategory: string | null };
    inventoryLot?: { id: string; lotNumber: string | null; expirationDate: Date | null } | null;
    owner?: { id: string; name: string; email: string };
    appliedBy?: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: application.id,
      campaignId: application.campaignId,
      campaign: application.campaign ?? null,
      ownerUserId: application.ownerUserId,
      owner: application.owner ?? null,
      appliedById: application.appliedById,
      appliedBy: application.appliedBy ?? null,
      plotId: application.plotId,
      plot: application.plot ?? null,
      cropId: application.cropId,
      crop: application.crop ?? null,
      plotCropAssignmentId: application.plotCropAssignmentId,
      productId: application.productId,
      product: application.product ?? null,
      inventoryLotId: application.inventoryLotId,
      inventoryLot: application.inventoryLot
        ? {
            ...application.inventoryLot,
            expirationDate: application.inventoryLot.expirationDate?.toISOString() ?? null,
          }
        : null,
      quantity: application.quantity.toString(),
      dose: application.dose,
      targetPest: application.targetPest,
      weatherConditions: application.weatherConditions,
      responsibleName: application.responsibleName,
      notes: application.notes,
      status: application.status,
      appliedAt: application.appliedAt.toISOString(),
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private mapMovement(movement: {
    id: string;
    ownerUserId: string;
    campaignId: string | null;
    type: StockMovementType;
    reasonType: StockMovementReasonType | null;
    quantity: Prisma.Decimal;
    reason: string | null;
    occurredAt: Date;
    createdAt: Date;
    product: { id: string; name: string; unit: string };
    inventoryLot: { id: string; lotNumber: string | null; expirationDate: Date | null } | null;
    warehouse: { id: string; name: string } | null;
    user: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: movement.id,
      ownerUserId: movement.ownerUserId,
      campaignId: movement.campaignId,
      type: movement.type,
      reasonType: movement.reasonType,
      quantity: movement.quantity.toString(),
      reason: movement.reason,
      occurredAt: movement.occurredAt.toISOString(),
      createdAt: movement.createdAt.toISOString(),
      product: movement.product,
      lot: movement.inventoryLot
        ? {
            id: movement.inventoryLot.id,
            lotNumber: movement.inventoryLot.lotNumber,
            expirationDate: movement.inventoryLot.expirationDate?.toISOString() ?? null,
          }
        : null,
      warehouse: movement.warehouse,
      registeredBy: movement.user,
    };
  }

  private async recordAudit(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId: string;
      actorUserId: string;
      ownerUserId: string;
      action: AuditAction;
      entityName: string;
      entityId: string;
      summary: string;
      before?: unknown;
      after?: unknown;
    },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        actorUserId: data.actorUserId,
        ownerUserId: data.ownerUserId,
        action: data.action,
        entityName: data.entityName,
        entityId: data.entityId,
        summary: data.summary,
        before: this.toJsonValue(data.before),
        after: this.toJsonValue(data.after),
      },
    });
  }

  private toJsonValue(value: unknown) {
    if (value === undefined) return Prisma.JsonNull;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private optionalText(value?: string | null) {
    const text = value?.trim();
    return text || null;
  }

  private toDecimal(value: number) {
    return new Prisma.Decimal(value.toString());
  }

  private toDate(value: string, errorMessage: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }
    return date;
  }
}
