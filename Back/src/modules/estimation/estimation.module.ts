import { Module } from "@nestjs/common";
import { CollectiveModule } from "../collective/collective.module";
import { EstimationController } from "./api/rest/estimation.controller";
import { ProposalEstimationReferenceController } from "./api/rest/proposal-reference.controller";
import { ConsumptionSeriesUseCase } from "./application/consumption-series.use-case";
import { EstimationClassificationsUseCase } from "./application/estimation-classifications.use-case";
import { EstimationConfig } from "./application/estimation-config";
import { EstimationJobsUseCase } from "./application/estimation-jobs.use-case";
import { EstimationReadsUseCase } from "./application/estimation-reads.use-case";
import { EstimationWorker } from "./application/estimation-worker";
import { ProposalEstimationReferenceUseCase } from "./application/proposal-reference.use-case";

/**
 * F12 estimation (INT-09, F12_EST_01_ESTIMATION_CONTRACT.md):
 * - F12-EST-02 and F12-EST-03 (#175, #176): sources, consumption series and
 *   their reading for a target campaign;
 * - F12-EST-04 (#177): the SES/naive engine (domain/ses-naive.ts);
 * - F12-EST-05 (#178): jobs, the batch worker, insert-only runs and results,
 *   the reading with derived validity and the correction of classifications;
 * - contract §4.1 (EST-D-02): seasons and the first classification of a
 *   campaign (continuation of #190, Refs #175).
 * - F12-EST-08 (#181): the estimation as a separate reference next to a
 *   joint purchase proposal and in its CSV export.
 */
@Module({
  imports: [CollectiveModule],
  controllers: [EstimationController, ProposalEstimationReferenceController],
  providers: [
    ConsumptionSeriesUseCase,
    EstimationConfig,
    EstimationJobsUseCase,
    EstimationReadsUseCase,
    EstimationClassificationsUseCase,
    EstimationWorker,
    ProposalEstimationReferenceUseCase,
  ],
  exports: [ConsumptionSeriesUseCase],
})
export class EstimationModule {}
