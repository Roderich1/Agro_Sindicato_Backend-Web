import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CalendarEventStatus,
  CalendarEventType,
  CampaignStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListCalendarEventsQueryDto } from '../dto/calendar-event.dto';

interface Actor {
  userId: string;
  role: UserRole;
}

@Injectable()
export class CalendarEventsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, actor: Actor, query: ListCalendarEventsQueryDto = {}) {
    await this.syncAutomaticEvents(tenantId, actor, query);

    const events = await this.prisma.calendarEvent.findMany({
      where: this.buildVisibleWhere(tenantId, actor, query),
      orderBy: [{ eventDate: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });

    return events.map((event) => this.mapEvent(event));
  }

  async complete(tenantId: string, actor: Actor, eventId: string) {
    const event = await this.findVisibleEvent(tenantId, actor, eventId);
    const updated = await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: { status: CalendarEventStatus.COMPLETADO },
    });

    return this.mapEvent(updated);
  }

  async cancel(tenantId: string, actor: Actor, eventId: string) {
    const event = await this.findVisibleEvent(tenantId, actor, eventId);
    const updated = await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: { status: CalendarEventStatus.CANCELADO },
    });

    return this.mapEvent(updated);
  }

  private async syncAutomaticEvents(tenantId: string, actor: Actor, query: ListCalendarEventsQueryDto) {
    await this.syncLotExpirationEvents(tenantId, actor, query);
    await this.syncLowStockEvents(tenantId, actor, query);
    await this.syncCampaignClosingEvents(tenantId, actor, query);
  }

  private async syncLotExpirationEvents(tenantId: string, actor: Actor, query: ListCalendarEventsQueryDto) {
    if (query.type && query.type !== CalendarEventType.VENCIMIENTO_LOTE) return;

    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
        ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { ownerUserId: query.ownerUserId } : {}),
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        expirationDate: { not: null },
        currentQuantity: { gt: new Prisma.Decimal(0) },
      },
      include: { product: true },
      take: 300,
    });

    for (const lot of lots) {
      if (!lot.expirationDate) continue;
      await this.ensureAutomaticEvent({
        tenantId,
        campaignId: lot.campaignId,
        ownerUserId: lot.ownerUserId,
        type: CalendarEventType.VENCIMIENTO_LOTE,
        title: `Vencimiento de ${lot.product.name}`,
        description: lot.lotNumber ? `Lote: ${lot.lotNumber}` : null,
        eventDate: lot.expirationDate,
        sourceEntity: 'InventoryLot',
        sourceEntityId: lot.id,
        metadata: {
          productId: lot.productId,
          lotNumber: lot.lotNumber,
          currentQuantity: lot.currentQuantity.toString(),
        },
      });
    }
  }

  private async syncLowStockEvents(tenantId: string, actor: Actor, query: ListCalendarEventsQueryDto) {
    if (query.type && query.type !== CalendarEventType.STOCK_BAJO) return;

    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ...(actor.role === UserRole.AGRICULTOR ? { ownerUserId: actor.userId } : {}),
        ...(query.ownerUserId && actor.role !== UserRole.AGRICULTOR ? { ownerUserId: query.ownerUserId } : {}),
        currentQuantity: { gt: new Prisma.Decimal(0) },
      },
      include: { product: true },
      take: 1000,
    });

    const grouped = new Map<string, { ownerUserId: string; product: typeof lots[number]['product']; total: Prisma.Decimal }>();
    for (const lot of lots) {
      const key = `${lot.ownerUserId}:${lot.productId}`;
      const current = grouped.get(key) ?? {
        ownerUserId: lot.ownerUserId,
        product: lot.product,
        total: new Prisma.Decimal(0),
      };
      current.total = current.total.plus(lot.currentQuantity);
      grouped.set(key, current);
    }

    for (const [sourceEntityId, item] of grouped.entries()) {
      if (item.total.greaterThan(item.product.minimumStock)) continue;
      await this.ensureAutomaticEvent({
        tenantId,
        campaignId: null,
        ownerUserId: item.ownerUserId,
        type: CalendarEventType.STOCK_BAJO,
        title: `Stock bajo de ${item.product.name}`,
        description: `Stock actual: ${item.total.toString()} ${item.product.unit}`,
        eventDate: new Date(),
        sourceEntity: 'ProductStock',
        sourceEntityId,
        metadata: {
          productId: item.product.id,
          currentStock: item.total.toString(),
          minimumStock: item.product.minimumStock.toString(),
        },
      });
    }
  }

  private async syncCampaignClosingEvents(tenantId: string, actor: Actor, query: ListCalendarEventsQueryDto) {
    if (query.type && query.type !== CalendarEventType.CIERRE_CAMPANA) return;
    if (actor.role === UserRole.AGRICULTOR) return;

    const campaigns = await this.prisma.agriculturalCampaign.findMany({
      where: {
        tenantId,
        ...(query.campaignId ? { id: query.campaignId } : {}),
        status: CampaignStatus.ABIERTA,
        estimatedEndDate: { not: null },
      },
      take: 100,
    });

    for (const campaign of campaigns) {
      if (!campaign.estimatedEndDate) continue;
      await this.ensureAutomaticEvent({
        tenantId,
        campaignId: campaign.id,
        ownerUserId: null,
        type: CalendarEventType.CIERRE_CAMPANA,
        title: `Cierre estimado de ${campaign.name}`,
        description: campaign.notes,
        eventDate: campaign.estimatedEndDate,
        sourceEntity: 'AgriculturalCampaign',
        sourceEntityId: campaign.id,
        metadata: { campaignStatus: campaign.status },
      });
    }
  }

  private async ensureAutomaticEvent(data: {
    tenantId: string;
    campaignId: string | null;
    ownerUserId: string | null;
    type: CalendarEventType;
    title: string;
    description: string | null;
    eventDate: Date;
    sourceEntity: string;
    sourceEntityId: string;
    metadata: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.calendarEvent.findFirst({
      where: {
        tenantId: data.tenantId,
        sourceEntity: data.sourceEntity,
        sourceEntityId: data.sourceEntityId,
        type: data.type,
      },
    });

    if (existing) {
      await this.prisma.calendarEvent.update({
        where: { id: existing.id },
        data: {
          campaignId: data.campaignId,
          ownerUserId: data.ownerUserId,
          title: data.title,
          description: data.description,
          eventDate: data.eventDate,
          metadata: data.metadata,
        },
      });
      return;
    }

    await this.prisma.calendarEvent.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        ownerUserId: data.ownerUserId,
        type: data.type,
        status: CalendarEventStatus.PENDIENTE,
        title: data.title,
        description: data.description,
        eventDate: data.eventDate,
        sourceEntity: data.sourceEntity,
        sourceEntityId: data.sourceEntityId,
        isAutoGenerated: true,
        metadata: data.metadata,
      },
    });
  }

  private async findVisibleEvent(tenantId: string, actor: Actor, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        ...this.buildVisibleWhere(tenantId, actor, {}),
      },
    });
    if (!event) {
      throw new NotFoundException('El evento no existe o no es visible para el usuario.');
    }

    return event;
  }

  private buildVisibleWhere(
    tenantId: string,
    actor: Actor,
    query: ListCalendarEventsQueryDto,
  ): Prisma.CalendarEventWhereInput {
    return {
      tenantId,
      ...(actor.role === UserRole.AGRICULTOR
        ? { OR: [{ ownerUserId: actor.userId }, { ownerUserId: null }] }
        : query.ownerUserId
          ? { ownerUserId: query.ownerUserId }
          : {}),
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            eventDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  private mapEvent(event: {
    id: string;
    campaignId: string | null;
    ownerUserId: string | null;
    type: CalendarEventType;
    status: CalendarEventStatus;
    title: string;
    description: string | null;
    eventDate: Date;
    sourceEntity: string | null;
    sourceEntityId: string | null;
    isAutoGenerated: boolean;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: event.id,
      campaignId: event.campaignId,
      ownerUserId: event.ownerUserId,
      type: event.type,
      status: event.status,
      title: event.title,
      description: event.description,
      eventDate: event.eventDate.toISOString(),
      sourceEntity: event.sourceEntity,
      sourceEntityId: event.sourceEntityId,
      isAutoGenerated: event.isAutoGenerated,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
