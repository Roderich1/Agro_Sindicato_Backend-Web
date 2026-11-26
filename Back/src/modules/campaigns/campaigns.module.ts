import { Module } from '@nestjs/common';
import { CollectiveModule } from '../collective/collective.module';
import { CampaignsController } from './api/rest/campaigns.controller';
import { CampaignContextService } from './application/services/campaign-context.service';
import { CampaignManagementUseCase } from './application/use-cases/campaign-management.use-case';

@Module({
  imports: [CollectiveModule],
  controllers: [CampaignsController],
  providers: [CampaignContextService, CampaignManagementUseCase],
  exports: [CampaignContextService, CampaignManagementUseCase],
})
export class CampaignsModule {}
