import { Module } from "@nestjs/common";
import { CollectiveFarmersController } from "./api/rest/collective-farmers.controller";
import { CollectiveHistoryController } from "./api/rest/collective-history.controller";
import { CollectiveController } from "./api/rest/collective.controller";
import { JointPurchaseProposalsController } from "./api/rest/joint-purchase-proposals.controller";
import { CollectiveConfig } from "./application/collective-config";
import { CollectiveSealUseCase } from "./application/collective-seal.use-case";
import { CollectiveSummaryUseCase } from "./application/collective-summary.use-case";
import { CollectiveTrendsUseCase } from "./application/collective-trends.use-case";
import { FarmerSyncStatusUseCase } from "./application/farmer-sync-status.use-case";
import { JointPurchaseProposalUseCase } from "./application/joint-purchase-proposal.use-case";

/**
 * F06 #21: consolidation over Sync v1 contributions (read-only on them) and
 * the provisional disclosure policy F07-POL-01 (#107), disabled for real
 * figures until that policy is approved. F07 #26/#27: draft joint purchase
 * proposals over the same decisions. F07 (2026-10-23): manual seal of a
 * campaign's collective version and trends over sealed versions. F07-WEB-03
 * (#25, 2026-11-05): linked farmers and their latest accepted send.
 */
@Module({
  controllers: [
    CollectiveController,
    JointPurchaseProposalsController,
    CollectiveHistoryController,
    CollectiveFarmersController,
  ],
  providers: [
    CollectiveConfig,
    CollectiveSummaryUseCase,
    JointPurchaseProposalUseCase,
    CollectiveSealUseCase,
    CollectiveTrendsUseCase,
    FarmerSyncStatusUseCase,
  ],
  // F12 reads the disclosure mode in force before building a series, and
  // F12-EST-08 shows its reference next to a proposal it reads from here.
  exports: [CollectiveConfig, JointPurchaseProposalUseCase],
})
export class CollectiveModule {}
