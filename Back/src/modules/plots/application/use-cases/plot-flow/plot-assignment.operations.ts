import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, CropAssignmentStatus, PlotStatus, Prisma } from '@prisma/client';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { findActiveCropOrThrow, findOwnedPlotOrThrow } from './plot-catalog.operations';
import {
  Actor,
  assertAgriculturist,
  assignmentInclude,
  CreateAssignmentInput,
  ListAssignmentsInput,
  mapAssignment,
  optionalText,
  recordAudit,
  resolveReadableOwner,
  toDate,
  UpdateAssignmentInput,
} from './plot-flow.types-and-mappers';

export async function listAssignments(
  prisma: PrismaService,
  tenantId: string,
  actor: Actor,
  input: ListAssignmentsInput = {},
) {
  const ownerUserId = resolveReadableOwner(actor, input.ownerUserId);
  const assignments = await prisma.plotCropAssignment.findMany({
    where: {
      tenantId,
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
      ...(input.plotId ? { plotId: input.plotId } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: assignmentInclude(),
  });

  return assignments.map((assignment) => mapAssignment(assignment));
}

export function createAssignment(
  prisma: PrismaService,
  campaignContext: CampaignContextService,
  tenantId: string,
  actor: Actor,
  input: CreateAssignmentInput,
) {
  assertAgriculturist(actor);

  return prisma.$transaction(async (tx) => {
    const campaign = await campaignContext.resolveCampaignForOperation(
      tenantId,
      input.campaignId,
      tx,
    );
    const plot = await findOwnedPlotOrThrow(tx, tenantId, actor.userId, input.plotId);
    if (plot.status !== PlotStatus.ACTIVA) {
      throw new BadRequestException('Solo se puede asignar cultivo a parcelas activas.');
    }
    const crop = await findActiveCropOrThrow(tx, tenantId, input.cropId);

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
        plantedAt: input.plantedAt ? toDate(input.plantedAt, 'La fecha de siembra es invalida.') : null,
        notes: optionalText(input.notes),
      },
      include: assignmentInclude(),
    });

    await recordAudit(tx, {
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

    return mapAssignment(assignment);
  });
}

export function updateAssignment(
  prisma: PrismaService,
  campaignContext: CampaignContextService,
  tenantId: string,
  actor: Actor,
  assignmentId: string,
  input: UpdateAssignmentInput,
) {
  assertAgriculturist(actor);

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.plotCropAssignment.findFirst({
      where: { id: assignmentId, tenantId, ownerUserId: actor.userId },
      include: { campaign: true },
    });
    if (!assignment) {
      throw new NotFoundException('La asignacion de cultivo no existe para este agricultor.');
    }
    campaignContext.ensureCampaignIsOpen(assignment.campaign);

    const data: Prisma.PlotCropAssignmentUpdateInput = {};
    if (input.cropId !== undefined) {
      const crop = await findActiveCropOrThrow(tx, tenantId, input.cropId);
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
        ? toDate(input.plantedAt, 'La fecha de siembra es invalida.')
        : null;
    }
    if (input.notes !== undefined) data.notes = optionalText(input.notes);

    const updatedAssignment = await tx.plotCropAssignment.update({
      where: { id: assignment.id },
      data,
      include: assignmentInclude(),
    });

    await recordAudit(tx, {
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

    return mapAssignment(updatedAssignment);
  });
}
