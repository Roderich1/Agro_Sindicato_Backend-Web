import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CropsController } from './api/rest/crops.controller';
import { PlotCropAssignmentsController } from './api/rest/plot-crop-assignments.controller';
import { PlotsController } from './api/rest/plots.controller';
import { PlotFlowUseCase } from './application/use-cases/plot-flow.use-case';

@Module({
  imports: [CampaignsModule],
  controllers: [PlotsController, CropsController, PlotCropAssignmentsController],
  providers: [PlotFlowUseCase],
  exports: [PlotFlowUseCase],
})
export class PlotsModule {}
