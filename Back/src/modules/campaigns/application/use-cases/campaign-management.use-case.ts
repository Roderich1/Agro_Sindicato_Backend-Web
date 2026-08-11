import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, CalendarEventStatus, CalendarEventType, CampaignStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { CampaignContextService } from '../services/campaign-context.service';

type TxClient = Prisma.TransactionClient;

export interface CreateCampaignInput {
  name: string;
  startDate: string | Date;
  estimatedEndDate?: string | Date | null;
  notes?: string | null;
}

export interface CloseCampaignInput {
  notes?: string | null;
}

export interface ListCampaignsInput {
  status?: CampaignStatus;
  search?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  startDate?: string | Date;
  estimatedEndDate?: string | Date | null;
  notes?: string | null;
}

@Injectable()
export class CampaignManagementUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async listCampaigns(tenantId: string, input: ListCampaignsInput = {}) {
    const campaigns = await this.prisma.agriculturalCampaign.findMany({
      where: {
        tenantId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.search?.trim()
          ? { name: { contains: input.search.trim(), mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
      include: this.summaryInclude(),
    });

    return campaigns.map((campaign) => this.mapCampaign(campaign));
  }

  async getActiveCampaign(tenantId: string) {
    const campaign = await this.prisma.agriculturalCampaign.findFirst({
      where: {
        tenantId,
        isActive: true,
        status: CampaignStatus.ABIERTA,
      },
      orderBy: { startDate: 'desc' },
      include: this.summaryInclude(),
    });

    return campaign ? this.mapCampaign(campaign) : null;
  }

  async createCampaign(
    tenantId: string,
    actorUserId: string,
    actorRole: UserRole,
    input: CreateCampaignInput,
  ) {
    this.assertCanManageCampaign(actorRole);
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('El nombre de la campana es obligatorio.');
    }

    const startDate = this.toDate(input.startDate, 'La fecha de inicio de campana es invalida.');
    const estimatedEndDate = input.estimatedEndDate
      ? this.toDate(input.estimatedEndDate, 'La fecha estimada de cierre de campana es invalida.')
      : null;

    if (estimatedEndDate && estimatedEndDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('La fecha estimada de cierre no puede ser anterior al inicio.');
    }

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.agriculturalCampaign.create({
        data: {
          tenantId,
          name,
          startDate,
          estimatedEndDate,
          notes: input.notes?.trim() || null,
          createdById: actorUserId,
        },
        include: this.summaryInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId,
        campaignId: campaign.id,
        action: AuditAction.CREAR,
        entityName: 'AgriculturalCampaign',
        entityId: campaign.id,
        summary: `Campana creada: ${campaign.name}`,
        after: campaign,
      });

      return this.mapCampaign(campaign);
    });
  }

  async updateCampaign(
    tenantId: string,
    actorUserId: string,
    actorRole: UserRole,
    campaignId: string,
    input: UpdateCampaignInput,
  ) {
    this.assertCanManageCampaign(actorRole);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.findCampaignOrThrow(tx, tenantId, campaignId);
      if (campaign.status === CampaignStatus.CERRADA || campaign.status === CampaignStatus.CANCELADA) {
        throw new BadRequestException('No se puede editar una campana cerrada o cancelada.');
      }

      const data: Prisma.AgriculturalCampaignUpdateInput = {};
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) throw new BadRequestException('El nombre de la campana es obligatorio.');
        data.name = name;
      }
      if (input.startDate !== undefined) {
        data.startDate = this.toDate(input.startDate, 'La fecha de inicio de campana es invalida.');
      }
      if (input.estimatedEndDate !== undefined) {
        data.estimatedEndDate = input.estimatedEndDate
          ? this.toDate(input.estimatedEndDate, 'La fecha estimada de cierre de campana es invalida.')
          : null;
      }
      if (input.notes !== undefined) {
        data.notes = input.notes?.trim() || null;
      }

      const nextStartDate = data.startDate instanceof Date ? data.startDate : campaign.startDate;
      const nextEstimatedEndDate =
        data.estimatedEndDate instanceof Date
          ? data.estimatedEndDate
          : data.estimatedEndDate === null
            ? null
            : campaign.estimatedEndDate;
      if (nextEstimatedEndDate && nextEstimatedEndDate.getTime() < nextStartDate.getTime()) {
        throw new BadRequestException('La fecha estimada de cierre no puede ser anterior al inicio.');
      }

      const updatedCampaign = await tx.agriculturalCampaign.update({
        where: { id: campaign.id },
        data,
        include: this.summaryInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId,
        campaignId: updatedCampaign.id,
        action: AuditAction.ACTUALIZAR,
        entityName: 'AgriculturalCampaign',
        entityId: updatedCampaign.id,
        summary: `Campana actualizada: ${updatedCampaign.name}`,
        before: campaign,
        after: updatedCampaign,
      });

      return this.mapCampaign(updatedCampaign);
    });
  }

  async openCampaign(tenantId: string, actorUserId: string, actorRole: UserRole, campaignId: string) {
    this.assertCanManageCampaign(actorRole);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.findCampaignOrThrow(tx, tenantId, campaignId);
      if (campaign.status === CampaignStatus.CERRADA || campaign.status === CampaignStatus.CANCELADA) {
        throw new BadRequestException('No se puede abrir una campana cerrada o cancelada.');
      }

      await this.campaignContext.ensureNoOtherActiveCampaign(tenantId, campaignId, tx);

      const openedCampaign = await tx.agriculturalCampaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.ABIERTA,
          isActive: true,
        },
        include: this.summaryInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId,
        campaignId: openedCampaign.id,
        action: AuditAction.ABRIR_CAMPANA,
        entityName: 'AgriculturalCampaign',
        entityId: openedCampaign.id,
        summary: `Campana abierta: ${openedCampaign.name}`,
        before: campaign,
        after: openedCampaign,
      });

      return this.mapCampaign(openedCampaign);
    });
  }

  async closeCampaign(
    tenantId: string,
    actorUserId: string,
    actorRole: UserRole,
    campaignId: string,
    input: CloseCampaignInput = {},
  ) {
    this.assertCanManageCampaign(actorRole);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.findCampaignOrThrow(tx, tenantId, campaignId);
      if (campaign.status !== CampaignStatus.ABIERTA || !campaign.isActive) {
        throw new BadRequestException('Solo se puede cerrar una campana abierta y activa.');
      }

      const closedCampaign = await tx.agriculturalCampaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.CERRADA,
          isActive: false,
          closedAt: new Date(),
          closedById: actorUserId,
          notes: input.notes?.trim() || campaign.notes,
        },
        include: this.summaryInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId,
        campaignId: closedCampaign.id,
        action: AuditAction.CERRAR_CAMPANA,
        entityName: 'AgriculturalCampaign',
        entityId: closedCampaign.id,
        summary: `Campana cerrada: ${closedCampaign.name}`,
        before: campaign,
        after: closedCampaign,
      });

      await this.upsertCampaignClosingEvent(tx, {
        tenantId,
        campaignId: closedCampaign.id,
        title: `Campana cerrada: ${closedCampaign.name}`,
        description: input.notes?.trim() || closedCampaign.notes,
        eventDate: closedCampaign.closedAt ?? new Date(),
      });

      return this.mapCampaign(closedCampaign);
    });
  }

  assertCanManageCampaign(role: UserRole) {
    if (role !== UserRole.DIRECTIVA && role !== UserRole.ADMINISTRADOR) {
      throw new ForbiddenException('No tiene permisos para administrar campanas.');
    }
  }

  private async findCampaignOrThrow(tx: TxClient, tenantId: string, campaignId: string) {
    const campaign = await tx.agriculturalCampaign.findFirst({
      where: { id: campaignId, tenantId },
    });
    if (!campaign) {
      throw new NotFoundException('La campana no existe en este sindicato.');
    }

    return campaign;
  }

  private summaryInclude() {
    return {
      _count: {
        select: {
          plotCropAssignments: true,
          purchases: true,
          stockMovements: true,
          agrochemicalApplications: true,
          payableAccounts: true,
        },
      },
    } satisfies Prisma.AgriculturalCampaignInclude;
  }

  private mapCampaign(campaign: {
    id: string;
    name: string;
    status: CampaignStatus;
    isActive: boolean;
    startDate: Date;
    estimatedEndDate: Date | null;
    closedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: {
      plotCropAssignments: number;
      purchases: number;
      stockMovements: number;
      agrochemicalApplications: number;
      payableAccounts: number;
    };
  }) {
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      isActive: campaign.isActive,
      startDate: campaign.startDate.toISOString(),
      estimatedEndDate: campaign.estimatedEndDate?.toISOString() ?? null,
      closedAt: campaign.closedAt?.toISOString() ?? null,
      notes: campaign.notes,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      summary: {
        plotCropAssignments: campaign._count?.plotCropAssignments ?? 0,
        purchases: campaign._count?.purchases ?? 0,
        stockMovements: campaign._count?.stockMovements ?? 0,
        agrochemicalApplications: campaign._count?.agrochemicalApplications ?? 0,
        payableAccounts: campaign._count?.payableAccounts ?? 0,
      },
    };
  }

  private async recordAudit(
    tx: TxClient,
    data: {
      tenantId: string;
      actorUserId: string;
      campaignId: string;
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
        action: data.action,
        entityName: data.entityName,
        entityId: data.entityId,
        summary: data.summary,
        before: this.toJsonValue(data.before),
        after: this.toJsonValue(data.after),
      },
    });
  }

  private async upsertCampaignClosingEvent(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId: string;
      title: string;
      description: string | null | undefined;
      eventDate: Date;
    },
  ) {
    const existing = await tx.calendarEvent.findFirst({
      where: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        type: CalendarEventType.CIERRE_CAMPANA,
        sourceEntity: 'AgriculturalCampaign',
        sourceEntityId: data.campaignId,
      },
    });

    if (existing) {
      await tx.calendarEvent.update({
        where: { id: existing.id },
        data: {
          status: CalendarEventStatus.COMPLETADO,
          title: data.title,
          description: data.description,
          eventDate: data.eventDate,
        },
      });
      return;
    }

    await tx.calendarEvent.create({
      data: {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        type: CalendarEventType.CIERRE_CAMPANA,
        status: CalendarEventStatus.COMPLETADO,
        title: data.title,
        description: data.description,
        eventDate: data.eventDate,
        sourceEntity: 'AgriculturalCampaign',
        sourceEntityId: data.campaignId,
        isAutoGenerated: true,
      },
    });
  }

  private toJsonValue(value: unknown) {
    if (value === undefined) return Prisma.JsonNull;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private toDate(value: string | Date, errorMessage: string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }
}
