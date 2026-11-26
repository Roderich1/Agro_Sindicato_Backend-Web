import { Module } from "@nestjs/common";
import { CollectiveHistoryController } from "./api/rest/collective-history.controller";
import { CollectiveController } from "./api/rest/collective.controller";
import { JointPurchaseProposalsController } from "./api/rest/joint-purchase-proposals.controller";
import { CollectiveConfig } from "./application/collective-config";
import { CollectivePolicyActivation } from "./application/collective-policy-activation";
import { CollectiveSealUseCase } from "./application/collective-seal.use-case";
import { CollectiveSummaryUseCase } from "./application/collective-summary.use-case";
import { CollectiveTrendsUseCase } from "./application/collective-trends.use-case";
import { JointPurchaseProposalUseCase } from "./application/joint-purchase-proposal.use-case";

/** Totales colectivos, borradores y registro histórico fijado al cerrar la campaña. */
@Module({
  controllers: [CollectiveController, JointPurchaseProposalsController, CollectiveHistoryController],
  providers: [
    CollectiveConfig,
    CollectivePolicyActivation,
    CollectiveSummaryUseCase,
    JointPurchaseProposalUseCase,
    CollectiveSealUseCase,
    CollectiveTrendsUseCase,
  ],
  // F12 reads the disclosure mode in force before building a series, and
  // F12-EST-08 shows its reference next to a proposal it reads from here.
  exports: [CollectiveConfig, JointPurchaseProposalUseCase, CollectiveSealUseCase],
})
export class CollectiveModule {}
