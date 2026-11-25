import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PlotStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  Actor,
  assertAgriculturist,
  assertCatalogManager,
  CreateCropInput,
  CreatePlotInput,
  ListCropsInput,
  ListPlotsInput,
  mapCrop,
  mapPlot,
  optionalText,
  plotInclude,
  recordAudit,
  requiredText,
  resolveReadableOwner,
  TxClient,
  UpdateCropInput,
  UpdatePlotInput,
} from './plot-flow.types-and-mappers';

export async function listPlots(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  input: ListPlotsInput = {},
) {
  const ownerUserId = resolveReadableOwner(actor, input.ownerUserId);
  const plots = await prisma.plot.findMany({
    where: {
      tenantId,
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search?.trim()
        ? { name: { contains: input.search.trim(), mode: Prisma.QueryMode.insensitive } }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: plotInclude(),
  });

  return plots.map((plot) => mapPlot(plot));
}

export function createPlot(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  input: CreatePlotInput,
) {
  assertAgriculturist(actor);
  const name = requiredText(input.name, 'El nombre de la parcela es obligatorio.');

  return prisma.$transaction(async (tx) => {
    await ensurePlotNameAvailable(tx, tenantId, actor.userId, name);

    const plot = await tx.plot.create({
      data: {
        tenantId,
        ownerUserId: actor.userId,
        name,
        location: optionalText(input.location),
        area: input.area ?? null,
        areaUnit: optionalText(input.areaUnit) ?? 'ha',
        notes: optionalText(input.notes),
      },
      include: plotInclude(),
    });

    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      ownerUserId: actor.userId,
      action: AuditAction.CREAR,
      entityName: 'Plot',
      entityId: plot.id,
      summary: `Parcela creada: ${plot.name}`,
      after: plot,
    });

    return mapPlot(plot);
  });
}

export function updatePlot(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  plotId: string,
  input: UpdatePlotInput,
) {
  assertAgriculturist(actor);

  return prisma.$transaction(async (tx) => {
    const plot = await findOwnedPlotOrThrow(tx, tenantId, actor.userId, plotId);
    if (plot.status !== PlotStatus.ACTIVA) {
      throw new BadRequestException('No se puede editar una parcela inactiva.');
    }

    const data: Prisma.PlotUpdateInput = {};
    if (input.name !== undefined) {
      const name = requiredText(input.name, 'El nombre de la parcela es obligatorio.');
      await ensurePlotNameAvailable(tx, tenantId, actor.userId, name, plot.id);
      data.name = name;
    }
    if (input.location !== undefined) data.location = optionalText(input.location);
    if (input.area !== undefined) data.area = input.area;
    if (input.areaUnit !== undefined) data.areaUnit = optionalText(input.areaUnit) ?? 'ha';
    if (input.notes !== undefined) data.notes = optionalText(input.notes);

    const updatedPlot = await tx.plot.update({
      where: { id: plot.id },
      data,
      include: plotInclude(),
    });

    await recordAudit(tx, {
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

    return mapPlot(updatedPlot);
  });
}

export function deactivatePlot(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  plotId: string,
) {
  assertAgriculturist(actor);

  return prisma.$transaction(async (tx) => {
    const plot = await findOwnedPlotOrThrow(tx, tenantId, actor.userId, plotId);
    if (plot.status === PlotStatus.INACTIVA) {
      return mapPlot({ ...plot, _count: { cropAssignments: 0, agrochemicalApplications: 0 } });
    }

    const deactivatedPlot = await tx.plot.update({
      where: { id: plot.id },
      data: { status: PlotStatus.INACTIVA },
      include: plotInclude(),
    });

    await recordAudit(tx, {
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

    return mapPlot(deactivatedPlot);
  });
}

export async function listCrops(
  prisma: PrismaService,
  tenantId: string,
  input: ListCropsInput = {},
) {
  const crops = await prisma.crop.findMany({
    where: {
      tenantId,
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search?.trim()
        ? { name: { contains: input.search.trim(), mode: Prisma.QueryMode.insensitive } }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  return crops.map((crop) => mapCrop(crop));
}

export function createCrop(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  input: CreateCropInput,
) {
  assertCatalogManager(actor);
  const name = requiredText(input.name, 'El nombre del cultivo es obligatorio.');

  return prisma.$transaction(async (tx) => {
    await ensureCropNameAvailable(tx, tenantId, name);
    const crop = await tx.crop.create({
      data: {
        tenantId,
        name,
        variety: optionalText(input.variety),
        notes: optionalText(input.notes),
      },
    });

    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: AuditAction.CREAR,
      entityName: 'Crop',
      entityId: crop.id,
      summary: `Cultivo creado: ${crop.name}`,
      after: crop,
    });

    return mapCrop(crop);
  });
}

export function updateCrop(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  cropId: string,
  input: UpdateCropInput,
) {
  assertCatalogManager(actor);

  return prisma.$transaction(async (tx) => {
    const crop = await tx.crop.findFirst({ where: { id: cropId, tenantId } });
    if (!crop) throw new NotFoundException('El cultivo no existe en este sindicato.');

    const data: Prisma.CropUpdateInput = {};
    if (input.name !== undefined) {
      const name = requiredText(input.name, 'El nombre del cultivo es obligatorio.');
      await ensureCropNameAvailable(tx, tenantId, name, crop.id);
      data.name = name;
    }
    if (input.variety !== undefined) data.variety = optionalText(input.variety);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.notes !== undefined) data.notes = optionalText(input.notes);

    const updatedCrop = await tx.crop.update({
      where: { id: crop.id },
      data,
    });

    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: AuditAction.ACTUALIZAR,
      entityName: 'Crop',
      entityId: updatedCrop.id,
      summary: `Cultivo actualizado: ${updatedCrop.name}`,
      before: crop,
      after: updatedCrop,
    });

    return mapCrop(updatedCrop);
  });
}

export async function findOwnedPlotOrThrow(
  tx: TxClient,
  tenantId: string,
  ownerUserId: string,
  plotId: string,
) {
  const plot = await tx.plot.findFirst({ where: { id: plotId, tenantId, ownerUserId } });
  if (!plot) {
    throw new NotFoundException('La parcela no existe para este agricultor.');
  }

  return plot;
}

export async function findActiveCropOrThrow(tx: TxClient, tenantId: string, cropId: string) {
  const crop = await tx.crop.findFirst({ where: { id: cropId, tenantId, isActive: true } });
  if (!crop) {
    throw new NotFoundException('El cultivo no existe o esta inactivo.');
  }

  return crop;
}

async function ensurePlotNameAvailable(
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

async function ensureCropNameAvailable(
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
