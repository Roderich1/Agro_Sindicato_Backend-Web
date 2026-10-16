import { Module } from "@nestjs/common";
import { CollectiveController } from "./api/rest/collective.controller";
import { CollectiveConfig } from "./application/collective-config";
import { CollectiveSummaryUseCase } from "./application/collective-summary.use-case";

/**
 * F06 #21: consolidation over Sync v1 contributions (read-only on them) and
 * the provisional disclosure policy F07-POL-01 (#107), disabled for real
 * figures until that policy is approved.
 */
@Module({
  controllers: [CollectiveController],
  providers: [CollectiveConfig, CollectiveSummaryUseCase],
})
export class CollectiveModule {}
