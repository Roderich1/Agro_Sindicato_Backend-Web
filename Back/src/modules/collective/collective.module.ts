import { Module } from "@nestjs/common";
import { CollectiveController } from "./api/rest/collective.controller";
import { JointPurchaseProposalsController } from "./api/rest/joint-purchase-proposals.controller";
import { CollectiveConfig } from "./application/collective-config";
import { CollectiveSummaryUseCase } from "./application/collective-summary.use-case";
import { JointPurchaseProposalUseCase } from "./application/joint-purchase-proposal.use-case";

/**
 * F06 #21: consolidation over Sync v1 contributions (read-only on them) and
 * the provisional disclosure policy F07-POL-01 (#107), disabled for real
 * figures until that policy is approved. F07 #26/#27: draft joint purchase
 * proposals over the same decisions.
 */
@Module({
  controllers: [CollectiveController, JointPurchaseProposalsController],
  providers: [CollectiveConfig, CollectiveSummaryUseCase, JointPurchaseProposalUseCase],
})
export class CollectiveModule {}
