import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ApplicationsController } from './api/rest/applications.controller';
import { ApplicationsUseCase } from './application/use-cases/applications.use-case';

@Module({
  imports: [CampaignsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsUseCase],
  exports: [ApplicationsUseCase],
})
export class ApplicationsModule {}
