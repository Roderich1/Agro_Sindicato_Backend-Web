import { Injectable } from '@nestjs/common';
import { CampaignContextService } from '@/modules/campaigns/application/services/campaign-context.service';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  createAssignment,
  listAssignments,
  updateAssignment,
} from './plot-flow/plot-assignment.operations';
import {
  createCrop,
  createPlot,
  deactivatePlot,
  listCrops,
  listPlots,
  updateCrop,
  updatePlot,
} from './plot-flow/plot-catalog.operations';
import {
  Actor,
  CreateAssignmentInput,
  CreateCropInput,
  CreatePlotInput,
  ListAssignmentsInput,
  ListCropsInput,
  ListPlotsInput,
  UpdateAssignmentInput,
  UpdateCropInput,
  UpdatePlotInput,
} from './plot-flow/plot-flow.types-and-mappers';

@Injectable()
export class PlotFlowUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignContext: CampaignContextService,
  ) {}

  async listPlots(tenantId: string, actor: Actor, input: ListPlotsInput = {}) {
    return listPlots(this.prisma, tenantId, actor, input);
  }

  async createPlot(tenantId: string, actor: Actor, input: CreatePlotInput) {
    return createPlot(this.prisma, tenantId, actor, input);
  }

  async updatePlot(tenantId: string, actor: Actor, plotId: string, input: UpdatePlotInput) {
    return updatePlot(this.prisma, tenantId, actor, plotId, input);
  }

  async deactivatePlot(tenantId: string, actor: Actor, plotId: string) {
    return deactivatePlot(this.prisma, tenantId, actor, plotId);
  }

  async listCrops(tenantId: string, input: ListCropsInput = {}) {
    return listCrops(this.prisma, tenantId, input);
  }

  async createCrop(tenantId: string, actor: Actor, input: CreateCropInput) {
    return createCrop(this.prisma, tenantId, actor, input);
  }

  async updateCrop(tenantId: string, actor: Actor, cropId: string, input: UpdateCropInput) {
    return updateCrop(this.prisma, tenantId, actor, cropId, input);
  }

  async listAssignments(tenantId: string, actor: Actor, input: ListAssignmentsInput = {}) {
    return listAssignments(this.prisma, tenantId, actor, input);
  }

  async createAssignment(tenantId: string, actor: Actor, input: CreateAssignmentInput) {
    return createAssignment(this.prisma, this.campaignContext, tenantId, actor, input);
  }

  async updateAssignment(
    tenantId: string,
    actor: Actor,
    assignmentId: string,
    input: UpdateAssignmentInput,
  ) {
    return updateAssignment(
      this.prisma,
      this.campaignContext,
      tenantId,
      actor,
      assignmentId,
      input,
    );
  }
}
