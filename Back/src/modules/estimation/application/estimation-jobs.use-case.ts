import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { baseUnitForCentralUnit } from "../../sync-v1/domain/units";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { canonicalJson } from "../domain/run-content";
import { EstimationConfig } from "./estimation-config";
import { campaignRefOf } from "./estimation-views";

export interface GenerateCommand {
  requestId: string;
  targetCampaignId: string;
  productRefs?: string[];
}

const GENERATORS: UserRole[] = [UserRole.DIRECTIVA, UserRole.ADMINISTRADOR];

/**
 * F12-EST-05 (#178; contract §4.2): asking for an estimation only validates
 * and queues a job; the worker calculates it later. If a check fails nothing
 * is written. `request_id` makes the request idempotent: the same identifier
 * with the same canonical request (target and products) returns the same
 * job, without queuing another; with another request it is REQUEST_ID_REUSED.
 * A repetition is answered before the other checks, so a retried request
 * finds its job even if the campaign or the policy changed since.
 */
@Injectable()
export class EstimationJobsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: EstimationConfig,
    private readonly collective: CollectiveConfig,
  ) {}

  async request(principal: AuthenticatedPrincipal, command: GenerateCommand): Promise<{ created: boolean; job: JobView }> {
    if (!GENERATORS.includes(principal.role)) throw new ForbiddenException();
    const productRefs = command.productRefs ? [...new Set(command.productRefs)].sort() : null;
    const requestHash = createHash("sha256")
      .update(canonicalJson({ target_campaign_ref: command.targetCampaignId, product_refs: productRefs }))
      .digest("hex");

    const repeated = await this.repetition(principal.tenantId, command.requestId, requestHash);
    if (repeated) return { created: false, job: repeated };

    const campaign = await this.prisma.agriculturalCampaign.findFirst({
      where: { id: command.targetCampaignId, tenantId: principal.tenantId },
      select: { id: true, status: true },
    });
    if (!campaign) throw new NotFoundException("TARGET_CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "PLANIFICADA" && campaign.status !== "ABIERTA") throw new UnprocessableEntityException("TARGET_CAMPAIGN_NOT_ELIGIBLE");
    const classified = await this.prisma.campaignSeasonClassification.count({
      where: { tenantId: principal.tenantId, campaignId: campaign.id, nextClassification: { is: null }, seasonId: { not: null } },
    });
    if (classified === 0) throw new UnprocessableEntityException("TARGET_CAMPAIGN_NOT_CLASSIFIED");
    if (productRefs) {
      if (productRefs.length > this.config.maxProducts) throw new BadRequestException([`product_refs: como mucho ${this.config.maxProducts} productos`]);
      for (const productId of productRefs) await this.checkEstimable(principal.tenantId, productId);
    }
    if (this.collective.mode === "POLICY_PENDING") throw new ConflictException("POLICY_PENDING");

    try {
      const job = await this.prisma.estimationJob.create({
        data: {
          tenantId: principal.tenantId,
          requestId: command.requestId,
          requestHash,
          requestedByUserId: principal.sub,
          requestedByRole: principal.role,
          targetCampaignId: campaign.id,
          productRefs: productRefs ?? Prisma.DbNull,
          maxAttempts: this.config.maxAttempts,
        },
        select: { id: true },
      });
      return { created: true, job: await this.view(principal.tenantId, job.id) };
    } catch (error) {
      // Two identical requests at once: one inserts, the other finds it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const winner = await this.repetition(principal.tenantId, command.requestId, requestHash);
        if (winner) return { created: false, job: winner };
      }
      throw error;
    }
  }

  async get(tenantId: string, jobId: string): Promise<JobView> {
    const job = await this.prisma.estimationJob.findFirst({ where: { id: jobId, tenantId }, select: { id: true } });
    if (!job) throw new NotFoundException("JOB_NOT_FOUND");
    return this.view(tenantId, job.id);
  }

  private async repetition(tenantId: string, requestId: string, requestHash: string): Promise<JobView | null> {
    const existing = await this.prisma.estimationJob.findUnique({
      where: { tenantId_requestId: { tenantId, requestId } },
      select: { id: true, requestHash: true },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw new ConflictException("REQUEST_ID_REUSED");
    return this.view(tenantId, existing.id);
  }

  private async checkEstimable(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId }, select: { unit: true } });
    if (!product) throw new NotFoundException("PRODUCT_NOT_FOUND");
    const denomination = await this.prisma.productCanonicalAssociation.count({
      where: { tenantId, productId, validTo: null, canonicalProductId: { not: productId } },
    });
    if (denomination > 0 || !baseUnitForCentralUnit(product.unit)) throw new UnprocessableEntityException("PRODUCT_NOT_ESTIMABLE");
  }

  private async view(tenantId: string, jobId: string): Promise<JobView> {
    const job = await this.prisma.estimationJob.findFirstOrThrow({
      where: { id: jobId, tenantId },
      include: {
        targetCampaign: { select: { id: true, name: true, status: true, startDate: true, estimatedEndDate: true, closedAt: true } },
        run: { select: { id: true } },
      },
    });
    return {
      contract_version: 1,
      job_ref: job.id,
      request_id: job.requestId,
      scope: { tenant_ref: job.tenantId },
      requested_by_role: job.requestedByRole as "DIRECTIVA" | "ADMINISTRADOR",
      target: campaignRefOf(job.targetCampaign),
      product_refs: Array.isArray(job.productRefs) ? (job.productRefs as string[]) : null,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      enqueued_at: job.enqueuedAt.toISOString(),
      started_at: job.startedAt?.toISOString() ?? null,
      finished_at: job.finishedAt?.toISOString() ?? null,
      stop_code: (job.stopCode as JobView["stop_code"]) ?? null,
      stop_evidence: (job.stopEvidence as JobView["stop_evidence"]) ?? null,
      run_ref: job.run?.id ?? null,
    };
  }
}

export interface JobView {
  contract_version: 1;
  job_ref: string;
  request_id: string;
  scope: { tenant_ref: string };
  requested_by_role: "DIRECTIVA" | "ADMINISTRADOR";
  target: ReturnType<typeof campaignRefOf>;
  product_refs: string[] | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "NOT_EXECUTED";
  attempts: number;
  max_attempts: number;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
  stop_code: "POLICY_PENDING" | "REQUESTER_NOT_AUTHORIZED" | "TARGET_CAMPAIGN_NOT_ELIGIBLE" | null;
  stop_evidence: Record<string, unknown> | null;
  run_ref: string | null;
}
