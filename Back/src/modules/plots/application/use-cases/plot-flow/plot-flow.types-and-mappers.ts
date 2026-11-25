import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  AuditAction,
  CampaignStatus,
  CropAssignmentStatus,
  PlotStatus,
  Prisma,
  UserRole,
} from '@prisma/client';

export type TxClient = Prisma.TransactionClient;

export interface Actor {
  userId: string;
  role: UserRole;
}

export interface ListPlotsInput {
  search?: string;
  status?: PlotStatus;
  ownerUserId?: string;
}

export interface CreatePlotInput {
  name: string;
  location?: string | null;
  area?: number | null;
  areaUnit?: string | null;
  notes?: string | null;
}

export interface UpdatePlotInput {
  name?: string;
  location?: string | null;
  area?: number | null;
  areaUnit?: string | null;
  notes?: string | null;
}

export interface ListCropsInput {
  search?: string;
  isActive?: boolean;
}

export interface CreateCropInput {
  name: string;
  variety?: string | null;
  notes?: string | null;
}

export interface UpdateCropInput {
  name?: string;
  variety?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

export interface ListAssignmentsInput {
  campaignId?: string;
  plotId?: string;
  ownerUserId?: string;
  status?: CropAssignmentStatus;
}

export interface CreateAssignmentInput {
  campaignId?: string | null;
  plotId: string;
  cropId: string;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}

export interface UpdateAssignmentInput {
  cropId?: string;
  status?: CropAssignmentStatus;
  plantedArea?: number | null;
  plantedAt?: string | null;
  notes?: string | null;
}

export function resolveReadableOwner(actor: Actor, requestedOwnerUserId?: string) {
  if (actor.role === UserRole.AGRICULTOR) {
    return actor.userId;
  }

  return requestedOwnerUserId;
}

export function assertAgriculturist(actor: Actor) {
  if (actor.role !== UserRole.AGRICULTOR) {
    throw new ForbiddenException('Solo el agricultor puede modificar sus parcelas en este flujo.');
  }
}

export function assertCatalogManager(actor: Actor) {
  if (actor.role !== UserRole.DIRECTIVA && actor.role !== UserRole.ADMINISTRADOR) {
    throw new ForbiddenException('No tiene permisos para administrar el catalogo de cultivos.');
  }
}

export function plotInclude() {
  return {
    owner: { select: { id: true, name: true, email: true } },
    _count: { select: { cropAssignments: true, agrochemicalApplications: true } },
  } satisfies Prisma.PlotInclude;
}

export function assignmentInclude() {
  return {
    campaign: { select: { id: true, name: true, status: true, isActive: true } },
    plot: { select: { id: true, name: true, status: true, area: true, areaUnit: true } },
    crop: { select: { id: true, name: true, variety: true, isActive: true } },
    owner: { select: { id: true, name: true, email: true } },
  } satisfies Prisma.PlotCropAssignmentInclude;
}

export function mapPlot(plot: {
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

export function mapCrop(crop: {
  id: string;
  name: string;
  variety: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: crop.id,
    name: crop.name,
    variety: crop.variety,
    isActive: crop.isActive,
    notes: crop.notes,
    createdAt: crop.createdAt.toISOString(),
    updatedAt: crop.updatedAt.toISOString(),
    // F10-SEC-02 (#45): the shared crop catalog carries no tenant-wide counts
    // of farmers' private assignments and applications.
  };
}

export function mapAssignment(assignment: {
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

export async function recordAudit(
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
      before: toJsonValue(data.before),
      after: toJsonValue(data.after),
    },
  });
}

function toJsonValue(value: unknown) {
  if (value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function requiredText(value: string, errorMessage: string) {
  const text = value.trim();
  if (!text) throw new BadRequestException(errorMessage);
  return text;
}

export function optionalText(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

export function toDate(value: string, errorMessage: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(errorMessage);
  }

  return date;
}
