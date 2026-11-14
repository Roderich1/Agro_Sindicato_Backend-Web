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

/**
 * F06 #21: consolidation over Sync v1 contributions (read-only on them) and
 * the provisional disclosure policy F07-POL-01 (#107), disabled for real
 * figures until that policy is approved. F07 #26/#27: draft joint purchase
 * proposals over the same decisions. F07 (2026-10-23): manual seal of a
 * campaign's collective version and trends over sealed versions. E4 §5.1:
 * F07-POL-02 (no farmer threshold) only after its explicit, traced activation.
 */
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
  exports: [CollectiveConfig, JointPurchaseProposalUseCase],
})
export class CollectiveModule {}
