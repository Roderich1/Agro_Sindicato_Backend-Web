import { Module } from "@nestjs/common";
import { CollectiveModule } from "../collective/collective.module";
import { ConsumptionSeriesUseCase } from "./application/consumption-series.use-case";

/**
 * F12 estimation (INT-09, F12_EST_01_ESTIMATION_CONTRACT.md). F12-EST-02 and
 * F12-EST-03 (#175, #176): sources and consumption series, and their reading
 * for a target campaign. No controllers, worker, SES/naive engine or clients
 * yet (F12-EST-04 to F12-EST-07): nothing here is reachable over HTTP.
 */
@Module({
  imports: [CollectiveModule],
  providers: [ConsumptionSeriesUseCase],
  exports: [ConsumptionSeriesUseCase],
})
export class EstimationModule {}
