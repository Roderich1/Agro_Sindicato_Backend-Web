import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CropAssignmentStatus,
  CampaignStatus,
  PlotStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

interface Actor {
  userId: string;
  role: UserRole;
}

interface ListPlotsInput {
  search?: string;
  status?: PlotStatus;
  ownerUserId?: string;
}

interface CreatePlotInput {
  name: string;
  location?: string | null;
  area?: number | null;
  areaUnit?: string | null;
  notes?: string | null;
}

interface UpdatePlotInput {
  name?: string;
  location?: string | null;
  area?: number | null;
  areaUnit?: string | null;
  notes?: string | null;
}

interface ListCropsInput {
  search?: string;
  isActive?: boolean;
}

interface CreateCropInput {
  name: string;
  variety?: string | null;
  notes?: string | null;
}

interface UpdateCropInput {
  name?: string;
  variety?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

interface ListAssignmentsInput {
  campaignId?: string;
  plotId?: string;
  ownerUserId?: string;
  status?: CropAssignmentStatus;
}

interface CreateAssignmentInput {
  campaignId?: string | null;
  plotId: string;
  cropId: string;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}

interface UpdateAssignmentInput {
  cropId?: string;
  status?: CropAssignmentStatus;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}

@Injectable()
export class PlotFlowUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async listPlots(tenantId: string, actor: Actor, input: ListPlotsInput = {}) {
    const ownerUserId = this.resolveReadableOwner(actor, input.ownerUserId);
    const plots = await this.prisma.plot.findMany({
      where: {
        tenantId,
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search?.trim()
          ? { name: { contains: input.search.trim(), mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: this.plotInclude(),
    });

    return plots.map((plot) => this.mapPlot(plot));
  }

  async createPlot(tenantId: string, actor: Actor, input: CreatePlotInput) {
    this.assertAgriculturist(actor);
    const name = this.requiredText(input.name, 'El nombre de la parcela es obligatorio.');

    return this.prisma.$transaction(async (tx) => {
      await this.ensurePlotNameAvailable(tx, tenantId, actor.userId, name);

      const plot = await tx.plot.create({
        data: {
          tenantId,
          ownerUserId: actor.userId,
          name,
          location: this.optionalText(input.location),
          area: input.area ?? null,
          areaUnit: this.optionalText(input.areaUnit) ?? 'ha',
          notes: this.optionalText(input.notes),
        },
        include: this.plotInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.CREAR,
        entityName: 'Plot',
        entityId: plot.id,
        summary: `Parcela creada: ${plot.name}`,
        after: plot,
      });

      return this.mapPlot(plot);
    });
  }

  async updatePlot(tenantId: string, actor: Actor, plotId: string, input: UpdatePlotInput) {
    this.assertAgriculturist(actor);

    return this.prisma.$transaction(async (tx) => {
      const plot = await this.findOwnedPlotOrThrow(tx, tenantId, actor.userId, plotId);
      if (plot.status !== PlotStatus.ACTIVA) {
        throw new BadRequestException('No se puede editar una parcela inactiva.');
      }

      const data: Prisma.PlotUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.requiredText(input.name, 'El nombre de la parcela es obligatorio.');
        await this.ensurePlotNameAvailable(tx, tenantId, actor.userId, name, plot.id);
        data.name = name;
      }
      if (input.location !== undefined) data.location = this.optionalText(input.location);
      if (input.area !== undefined) data.area = input.area;
      if (input.areaUnit !== undefined) data.areaUnit = this.optionalText(input.areaUnit) ?? 'ha';
      if (input.notes !== undefined) data.notes = this.optionalText(input.notes);

      const updatedPlot = await tx.plot.update({
        where: { id: plot.id },
        data,
        include: this.plotInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.ACTUALIZAR,
        entityName: 'Plot',
        entityId: updatedPlot.id,
        summary: `Parcela actualizada: ${updatedPlot.name}`,
        before: plot,
        after: updatedPlot,
      });

      return this.mapPlot(updatedPlot);
    });
  }

  async deactivatePlot(tenantId: string, actor: Actor, plotId: string) {
    this.assertAgriculturist(actor);

    return this.prisma.$transaction(async (tx) => {
      const plot = await this.findOwnedPlotOrThrow(tx, tenantId, actor.userId, plotId);
      if (plot.status === PlotStatus.INACTIVA) {
        return this.mapPlot({ ...plot, _count: { cropAssignments: 0, agrochemicalApplications: 0 } });
      }

      const deactivatedPlot = await tx.plot.update({
        where: { id: plot.id },
        data: { status: PlotStatus.INACTIVA },
        include: this.plotInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.INACTIVAR,
        entityName: 'Plot',
        entityId: deactivatedPlot.id,
        summary: `Parcela inactivada: ${deactivatedPlot.name}`,
        before: plot,
        after: deactivatedPlot,
      });

      return this.mapPlot(deactivatedPlot);
    });
  }

  async listCrops(tenantId: string, input: ListCropsInput = {}) {
    const crops = await this.prisma.crop.findMany({
      where: {
        tenantId,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.search?.trim()
          ? { name: { contains: input.search.trim(), mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: this.cropInclude(),
    });

    return crops.map((crop) => this.mapCrop(crop));
  }

  async createCrop(tenantId: string, actor: Actor, input: CreateCropInput) {
    this.assertCatalogManager(actor);
    const name = this.requiredText(input.name, 'El nombre del cultivo es obligatorio.');

    return this.prisma.$transaction(async (tx) => {
      await this.ensureCropNameAvailable(tx, tenantId, name);
      const crop = await tx.crop.create({
        data: {
          tenantId,
          name,
          variety: this.optionalText(input.variety),
          notes: this.optionalText(input.notes),
        },
        include: this.cropInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId: actor.userId,
        action: AuditAction.CREAR,
        entityName: 'Crop',
        entityId: crop.id,
        summary: `Cultivo creado: ${crop.name}`,
        after: crop,
      });

      return this.mapCrop(crop);
    });
  }

  async updateCrop(tenantId: string, actor: Actor, cropId: string, input: UpdateCropInput) {
    this.assertCatalogManager(actor);

    return this.prisma.$transaction(async (tx) => {
      const crop = await tx.crop.findFirst({ where: { id: cropId, tenantId } });
      if (!crop) throw new NotFoundException('El cultivo no existe en este sindicato.');

      const data: Prisma.CropUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.requiredText(input.name, 'El nombre del cultivo es obligatorio.');
        await this.ensureCropNameAvailable(tx, tenantId, name, crop.id);
        data.name = name;
      }
      if (input.variety !== undefined) data.variety = this.optionalText(input.variety);
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.notes !== undefined) data.notes = this.optionalText(input.notes);

      const updatedCrop = await tx.crop.update({
        where: { id: crop.id },
        data,
        include: this.cropInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        actorUserId: actor.userId,
        action: AuditAction.ACTUALIZAR,
        entityName: 'Crop',
        entityId: updatedCrop.id,
        summary: `Cultivo actualizado: ${updatedCrop.name}`,
        before: crop,
        after: updatedCrop,
      });

      return this.mapCrop(updatedCrop);
    });
  }

  async listAssignments(tenantId: string, actor: Actor, input: ListAssignmentsInput = {}) {
    const ownerUserId = this.resolveReadableOwner(actor, input.ownerUserId);
    const assignments = await this.prisma.plotCropAssignment.findMany({
      where: {
        tenantId,
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.plotId ? { plotId: input.plotId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: this.assignmentInclude(),
    });

    return assignments.map((assignment) => this.mapAssignment(assignment));
  }

  async createAssignment(tenantId: string, actor: Actor, input: CreateAssignmentInput) {
    this.assertAgriculturist(actor);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await this.campaignContext.resolveCampaignForOperation(
        tenantId,
        input.campaignId,
        tx,
      );
      const plot = await this.findOwnedPlotOrThrow(tx, tenantId, actor.userId, input.plotId);
      if (plot.status !== PlotStatus.ACTIVA) {
        throw new BadRequestException('Solo se puede asignar cultivo a parcelas activas.');
      }
      const crop = await this.findActiveCropOrThrow(tx, tenantId, input.cropId);

      const existingAssignment = await tx.plotCropAssignment.findUnique({
        where: { campaignId_plotId: { campaignId: campaign.id, plotId: plot.id } },
      });
      if (existingAssignment) {
        throw new ConflictException('La parcela ya tiene un cultivo asignado en esta campana.');
      }

      const assignment = await tx.plotCropAssignment.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          plotId: plot.id,
          cropId: crop.id,
          ownerUserId: actor.userId,
          status: CropAssignmentStatus.ACTIVO,
          plantedArea: input.plantedArea ?? null,
          plantedAt: input.plantedAt ? this.toDate(input.plantedAt, 'La fecha de siembra es invalida.') : null,
          notes: this.optionalText(input.notes),
        },
        include: this.assignmentInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        campaignId: campaign.id,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.CREAR,
        entityName: 'PlotCropAssignment',
        entityId: assignment.id,
        summary: `Cultivo ${crop.name} asignado a parcela ${plot.name}`,
        after: assignment,
      });

      return this.mapAssignment(assignment);
    });
  }

  async updateAssignment(
    tenantId: string,
    actor: Actor,
    assignmentId: string,
    input: UpdateAssignmentInput,
  ) {
    this.assertAgriculturist(actor);

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.plotCropAssignment.findFirst({
        where: { id: assignmentId, tenantId, ownerUserId: actor.userId },
        include: { campaign: true },
      });
      if (!assignment) {
        throw new NotFoundException('La asignacion de cultivo no existe para este agricultor.');
      }
      this.campaignContext.ensureCampaignIsOpen(assignment.campaign);

      const data: Prisma.PlotCropAssignmentUpdateInput = {};
      if (input.cropId !== undefined) {
        const crop = await this.findActiveCropOrThrow(tx, tenantId, input.cropId);
        data.crop = { connect: { id: crop.id } };
        data.changedAt = new Date();
        data.status = CropAssignmentStatus.CAMBIADO;
      }
      if (input.status !== undefined) {
        data.status = input.status;
        if (input.status === CropAssignmentStatus.CAMBIADO) data.changedAt = new Date();
      }
      if (input.plantedArea !== undefined) data.plantedArea = input.plantedArea;
      if (input.plantedAt !== undefined) {
        data.plantedAt = input.plantedAt
          ? this.toDate(input.plantedAt, 'La fecha de siembra es invalida.')
          : null;
      }
      if (input.notes !== undefined) data.notes = this.optionalText(input.notes);

      const updatedAssignment = await tx.plotCropAssignment.update({
        where: { id: assignment.id },
        data,
        include: this.assignmentInclude(),
      });

      await this.recordAudit(tx, {
        tenantId,
        campaignId: assignment.campaignId,
        actorUserId: actor.userId,
        ownerUserId: actor.userId,
        action: AuditAction.ACTUALIZAR,
        entityName: 'PlotCropAssignment',
        entityId: updatedAssignment.id,
        summary: 'Asignacion de cultivo actualizada.',
        before: assignment,
        after: updatedAssignment,
      });

      return this.mapAssignment(updatedAssignment);
    });
  }

  private resolveReadableOwner(actor: Actor, requestedOwnerUserId?: string) {
    if (actor.role === UserRole.AGRICULTOR) {
      return actor.userId;
    }

    return requestedOwnerUserId;
  }

  private assertAgriculturist(actor: Actor) {
    if (actor.role !== UserRole.AGRICULTOR) {
      throw new ForbiddenException('Solo el agricultor puede modificar sus parcelas en este flujo.');
    }
  }

  private assertCatalogManager(actor: Actor) {
    if (actor.role !== UserRole.DIRECTIVA && actor.role !== UserRole.ADMINISTRADOR) {
      throw new ForbiddenException('No tiene permisos para administrar el catalogo de cultivos.');
    }
  }

  private async findOwnedPlotOrThrow(tx: TxClient, tenantId: string, ownerUserId: string, plotId: string) {
    const plot = await tx.plot.findFirst({ where: { id: plotId, tenantId, ownerUserId } });
    if (!plot) {
      throw new NotFoundException('La parcela no existe para este agricultor.');
    }

    return plot;
  }

  private async findActiveCropOrThrow(tx: TxClient, tenantId: string, cropId: string) {
    const crop = await tx.crop.findFirst({ where: { id: cropId, tenantId, isActive: true } });
    if (!crop) {
      throw new NotFoundException('El cultivo no existe o esta inactivo.');
    }

    return crop;
  }

  private async ensurePlotNameAvailable(
    tx: TxClient,
    tenantId: string,
    ownerUserId: string,
    name: string,
    currentPlotId?: string,
  ) {
    const existingPlot = await tx.plot.findFirst({
      where: {
        tenantId,
        ownerUserId,
        name,
        ...(currentPlotId ? { id: { not: currentPlotId } } : {}),
      },
    });
    if (existingPlot) {
      throw new ConflictException('Ya existe una parcela con ese nombre para este agricultor.');
    }
  }

  private async ensureCropNameAvailable(
    tx: TxClient,
    tenantId: string,
    name: string,
    currentCropId?: string,
  ) {
    const existingCrop = await tx.crop.findFirst({
      where: {
        tenantId,
        name,
        ...(currentCropId ? { id: { not: currentCropId } } : {}),
      },
    });
    if (existingCrop) {
      throw new ConflictException('Ya existe un cultivo con ese nombre en el sindicato.');
    }
  }

  private plotInclude() {
    return {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { cropAssignments: true, agrochemicalApplications: true } },
    } satisfies Prisma.PlotInclude;
  }

  private cropInclude() {
    return {
      _count: { select: { cropAssignments: true, agrochemicalApplications: true } },
    } satisfies Prisma.CropInclude;
  }

  private assignmentInclude() {
    return {
      campaign: { select: { id: true, name: true, status: true, isActive: true } },
      plot: { select: { id: true, name: true, status: true, area: true, areaUnit: true } },
      crop: { select: { id: true, name: true, variety: true, isActive: true } },
      owner: { select: { id: true, name: true, email: true } },
    } satisfies Prisma.PlotCropAssignmentInclude;
  }

  private mapPlot(plot: {
    id: string;
    ownerUserId: string;
    name: string;
    location: string | null;
    area: Prisma.Decimal | number | null;
    areaUnit: string;
    status: PlotStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    owner?: { id: string; name: string; email: string };
    _count?: { cropAssignments: number; agrochemicalApplications: number };
  }) {
    return {
      id: plot.id,
      ownerUserId: plot.ownerUserId,
      owner: plot.owner ?? null,
      name: plot.name,
      location: plot.location,
      area: plot.area === null ? null : Number(plot.area),
      areaUnit: plot.areaUnit,
      status: plot.status,
      notes: plot.notes,
      createdAt: plot.createdAt.toISOString(),
      updatedAt: plot.updatedAt.toISOString(),
      summary: {
        cropAssignments: plot._count?.cropAssignments ?? 0,
        agrochemicalApplications: plot._count?.agrochemicalApplications ?? 0,
      },
    };
  }

  private mapCrop(crop: {
    id: string;
    name: string;
    variety: string | null;
    isActive: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { cropAssignments: number; agrochemicalApplications: number };
  }) {
    return {
      id: crop.id,
      name: crop.name,
      variety: crop.variety,
      isActive: crop.isActive,
      notes: crop.notes,
      createdAt: crop.createdAt.toISOString(),
      updatedAt: crop.updatedAt.toISOString(),
      summary: {
        cropAssignments: crop._count?.cropAssignments ?? 0,
        agrochemicalApplications: crop._count?.agrochemicalApplications ?? 0,
      },
    };
  }

  private mapAssignment(assignment: {
    id: string;
    campaignId: string;
    plotId: string;
    cropId: string;
    ownerUserId: string;
    status: CropAssignmentStatus;
    plantedArea: Prisma.Decimal | number | null;
    plantedAt: Date | null;
    changedAt: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    campaign?: { id: string; name: string; status: CampaignStatus; isActive: boolean };
    plot?: { id: string; name: string; status: PlotStatus; area: Prisma.Decimal | number | null; areaUnit: string };
    crop?: { id: string; name: string; variety: string | null; isActive: boolean };
    owner?: { id: string; name: string; email: string };
  }) {
    return {
      id: assignment.id,
      campaignId: assignment.campaignId,
      campaign: assignment.campaign ?? null,
      plotId: assignment.plotId,
      plot: assignment.plot
        ? {
            ...assignment.plot,
            area: assignment.plot.area === null ? null : Number(assignment.plot.area),
          }
        : null,
      cropId: assignment.cropId,
      crop: assignment.crop ?? null,
      ownerUserId: assignment.ownerUserId,
      owner: assignment.owner ?? null,
      status: assignment.status,
      plantedArea: assignment.plantedArea === null ? null : Number(assignment.plantedArea),
      plantedAt: assignment.plantedAt?.toISOString() ?? null,
      changedAt: assignment.changedAt?.toISOString() ?? null,
      notes: assignment.notes,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  private async recordAudit(
    tx: TxClient,
    data: {
      tenantId: string;
      campaignId?: string;
      actorUserId: string;
      ownerUserId?: string;
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

  private requiredText(value: string, errorMessage: string) {
    const text = value.trim();
    if (!text) throw new BadRequestException(errorMessage);
    return text;
  }

  private optionalText(value?: string | null) {
    const text = value?.trim();
    return text || null;
  }

  private toDate(value: string, errorMessage: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }
}
