import { Module } from "@nestjs/common";
import { CollectiveModule } from "../collective/collective.module";
import { EstimationModule } from "../estimation/estimation.module";
import { ProposalEstimationLinkController } from "./api/rest/proposal-estimation-link.controller";
import { ProposalEstimationLinkUseCase } from "./application/proposal-estimation-link.use-case";

/**
 * E3 (E3_ESTIMACION_EN_BORRADOR_CONTRATO.md): the estimate fixed as a
 * reference of a draft joint purchase proposal (immutable links, explicit and
 * idempotent prepare/clear) and the products chosen for a call.
 *
 * It lives outside the estimation module on purpose: F12 guarantees that
 * module writes only estimation tables and exposes no PUT, PATCH or DELETE
 * (F12_EST_01 §4, §7; `estimation/application/insert-only.spec.ts`). E3 writes
 * its own tables (links, selection, AuditLog) and only asks for estimations
 * through the F12 use cases it imports: `EstimationJobsUseCase.request` to
 * queue a job and `EstimationReadsUseCase` to read runs with their derived
 * validity. No other engine, no other storage of figures.
 */
@Module({
  imports: [CollectiveModule, EstimationModule],
  controllers: [ProposalEstimationLinkController],
  providers: [ProposalEstimationLinkUseCase],
})
export class ProposalEstimationModule {}
