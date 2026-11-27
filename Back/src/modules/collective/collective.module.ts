import { Module } from "@nestjs/common";
import { CollectiveHistoryController } from "./api/rest/collective-history.controller";
import { CollectiveController } from "./api/rest/collective.controller";
import { JointPurchaseProposalsController } from "./api/rest/joint-purchase-proposals.controller";
import { CollectiveTrendsUseCase } from "./application/collective-trends.use-case";
import { JointPurchaseProposalUseCase } from "./application/joint-purchase-proposal.use-case";
import { CollectiveResultsModule } from "./collective-results.module";

/** Totales colectivos, borradores y registro histórico fijado al cerrar la campaña. */
@Module({
  imports: [CollectiveResultsModule],
  controllers: [CollectiveController, JointPurchaseProposalsController, CollectiveHistoryController],
  providers: [JointPurchaseProposalUseCase, CollectiveTrendsUseCase],
  // F12 reads the disclosure mode in force before building a series, and
  // F12-EST-08 shows its reference next to a proposal it reads from here.
  exports: [CollectiveResultsModule, JointPurchaseProposalUseCase],
})
export class CollectiveModule {}
