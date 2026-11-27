import { Module } from "@nestjs/common";
import { CollectiveConfig } from "./application/collective-config";
import { CollectivePolicyActivation } from "./application/collective-policy-activation";
import { CollectiveSealUseCase } from "./application/collective-seal.use-case";
import { CollectiveSummaryUseCase } from "./application/collective-summary.use-case";

@Module({
  providers: [CollectiveConfig, CollectivePolicyActivation, CollectiveSummaryUseCase, CollectiveSealUseCase],
  exports: [CollectiveConfig, CollectiveSummaryUseCase, CollectiveSealUseCase],
})
export class CollectiveResultsModule {}
