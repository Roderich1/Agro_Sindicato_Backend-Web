import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma, SyncV1BaseUnit } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { JointPurchaseProposalUseCase, ProposalView } from "../../collective/application/joint-purchase-proposal.use-case";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { baseUnitForCentralUnit } from "../../sync-v1/domain/units";
import {
  compare,
  Comparison,
  derivedJobRequestId,
  LineEstimationState,
  lineEstimationState,
  LinkState,
} from "../domain/proposal-link";
import { canonicalJson } from "@/modules/estimation/domain/run-content";
import { EstimationJobsUseCase } from "@/modules/estimation/application/estimation-jobs.use-case";
import { EstimationReadsUseCase } from "@/modules/estimation/application/estimation-reads.use-case";

type Tx = Prisma.TransactionClient;
type Mode = "INITIAL" | "UPDATE";
type Action = "LINK_EXISTING_RUN" | "REUSE_JOB" | "REQUEST_JOB" | "CLEAR";
export type PrepareOutcome = "EXISTING" | "LINKED_EXISTING_RUN" | "REUSED_JOB" | "REQUESTED_JOB" | "CLEARED" | "NOT_CALCULABLE";
export type NotCalculableReason = "TARGET_CAMPAIGN_NOT_ELIGIBLE" | "TARGET_CAMPAIGN_NOT_CLASSIFIED" | "NO_ESTIMABLE_PRODUCTS";
type UpdateReason = "NEWER_RUN" | "OUTDATED" | "FAILED" | "NOT_EXECUTED" | "INCOMPLETE";

export const LINK_NOTICE =
  "Consumo estimado: referencia fijada para este borrador. No se suma a la necesidad declarada ni a la cantidad confirmada en una convocatoria, no cambia las líneas ni la huella del borrador y sólo se actualiza a pedido.";

const OUTCOME_OF: Record<Action, PrepareOutcome> = {
  LINK_EXISTING_RUN: "LINKED_EXISTING_RUN",
  REUSE_JOB: "REUSED_JOB",
  REQUEST_JOB: "REQUESTED_JOB",
  CLEAR: "CLEARED",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSACTION = { maxWait: 10_000, timeout: 60_000 } as const;
const MAX_SELECTION = 200;

/** Closed error body of the E3 routes: `{ errorCode, view? | selection? }`; nothing from the request is echoed. */
export class LinkHttpError extends HttpException {
  constructor(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
    super({ errorCode, ...extra }, status);
  }
}

const invalid = () => new LinkHttpError(HttpStatus.BAD_REQUEST, "PAYLOAD_INVALID");
const notFound = () => new LinkHttpError(HttpStatus.NOT_FOUND, "PROPOSAL_NOT_FOUND");

/** A conflict decided inside the transaction; the view is rendered after it rolls back. */
class ConflictWithView extends Error {
  constructor(readonly errorCode: "REFERENCE_CHANGED" | "REFERENCE_UP_TO_DATE") {
    super(errorCode);
  }
}

interface ProposalHead {
  id: string;
  tenantId: string;
  campaignId: string;
  lines: { position: number; canonicalProductId: string; baseUnit: SyncV1BaseUnit }[];
}

interface EstimableLine {
  position: number;
  productId: string;
  baseUnit: SyncV1BaseUnit;
}

const LINK_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  run: { select: { id: true, outcome: true, failureCode: true } },
  job: {
    select: {
      id: true,
      status: true,
      stopCode: true,
      run: { select: { id: true, outcome: true, failureCode: true } },
    },
  },
} satisfies Prisma.JointPurchaseProposalEstimationLinkInclude;

type StoredLink = Prisma.JointPurchaseProposalEstimationLinkGetPayload<{ include: typeof LINK_INCLUDE }>;
type RunFacts = NonNullable<Awaited<ReturnType<EstimationReadsUseCase["resultFacts"]>>>;

/**
 * E3: the consumption estimate fixed as a reference of a draft joint purchase
 * proposal, and the selection of products for a call.
 * - Reading never calculates nor writes (E3-D2). The figures are derived as
 *   F12 derives them now (`EstimationReadsUseCase.resultFacts`, the same
 *   `Reading.facts`): a fixed reference never escapes a withdrawal nor the
 *   policy (E3-D10).
 * - `prepare` and `clear` are idempotent by `request_id` and serialized per
 *   draft with a transaction lock (E3-D3). They write one immutable link, or
 *   nothing; the only F12 write is a queued job through
 *   `EstimationJobsUseCase.request` (E3 §7).
 * - The draft, its lines and its fingerprint are never touched; neither are
 *   needs, calls, participations, purchases, stock, accounts nor payments.
 */
@Injectable()
export class ProposalEstimationLinkUseCase {
  private readonly logger = new Logger("ProposalEstimationLink");

  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: EstimationReadsUseCase,
    private readonly jobs: EstimationJobsUseCase,
    private readonly proposals: JointPurchaseProposalUseCase,
    private readonly collective: CollectiveConfig,
  ) {}

  // ------------------------------------------------------------------ reads

  async view(principal: AuthenticatedPrincipal, proposalId: string) {
    const proposal = await this.requireProposal(principal.tenantId, proposalId);
    return this.render(principal, proposal);
  }

  async selection(principal: AuthenticatedPrincipal, proposalId: string) {
    const proposal = await this.requireProposal(principal.tenantId, proposalId);
    return this.selectionOf(this.prisma, proposal.id);
  }

  // ----------------------------------------------------------------- writes

  async prepare(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await this.requireProposal(principal.tenantId, proposalId);
    const command = parsePrepare(body);
    const requestHash = hashOf({ kind: "PREPARE", mode: command.mode, expected_link_ref: command.expectedLinkRef });
    let decided: { outcome: PrepareOutcome; reason?: NotCalculableReason };
    try {
      decided = await this.prisma.$transaction(async (tx) => {
        await lockProposal(tx, proposal.id);
        const repeated = await this.repetition(tx, proposal.id, command.requestId, requestHash);
        if (repeated) return { outcome: repeated };
        if (this.collective.mode === "POLICY_PENDING") throw new LinkHttpError(HttpStatus.CONFLICT, "POLICY_PENDING");
        const current = await this.currentLink(tx, proposal.id);
        const active = current && current.action !== "CLEAR" ? current : null;
        if (command.mode === "INITIAL") {
          if (active) return { outcome: "EXISTING" as const };
        } else {
          if (!current || current.id !== command.expectedLinkRef) throw new ConflictWithView("REFERENCE_CHANGED");
          const estimable = await estimableLines(tx, proposal);
          const update = await this.updateOf(principal.tenantId, proposal, current, estimable);
          if (!update.available) throw new ConflictWithView("REFERENCE_UP_TO_DATE");
        }
        const estimable = await estimableLines(tx, proposal);
        if (estimable.length === 0) return { outcome: "NOT_CALCULABLE" as const, reason: "NO_ESTIMABLE_PRODUCTS" as const };
        const write = (action: Exclude<Action, "CLEAR">, target: { runId?: string; jobId?: string }) =>
          this.insertLink(tx, principal, proposal, current, command.requestId, requestHash, command.mode, action, target);

        const compatible = await this.compatibleRun(principal.tenantId, proposal, estimable);
        if (compatible) {
          await write("LINK_EXISTING_RUN", { runId: compatible });
          return { outcome: "LINKED_EXISTING_RUN" as const };
        }
        const blocker = await campaignBlocker(tx, proposal);
        if (blocker) return { outcome: "NOT_CALCULABLE" as const, reason: blocker };
        const reusable = await reusableJob(tx, proposal, estimable);
        if (reusable && reusable !== active?.jobId) {
          await write("REUSE_JOB", { jobId: reusable });
          return { outcome: "REUSED_JOB" as const };
        }
        const job = await this.requestJob(principal, proposal, command.requestId, estimable);
        if ("reason" in job) return { outcome: "NOT_CALCULABLE" as const, reason: job.reason };
        await write("REQUEST_JOB", { jobId: job.jobId });
        return { outcome: "REQUESTED_JOB" as const };
      }, TRANSACTION);
    } catch (error) {
      throw await this.withView(error, principal, proposal);
    }
    if (decided.outcome !== "EXISTING" && decided.outcome !== "NOT_CALCULABLE") {
      this.logger.log(`[E3 PREPARE] tenant=${principal.tenantId} proposal=${proposal.id} outcome=${decided.outcome}`);
    }
    return { outcome: decided.outcome, ...(decided.reason ? { reason: decided.reason } : {}), view: await this.render(principal, proposal) };
  }

  /** Removes the reference: a CLEAR link; a job in progress no longer has an effect on the draft. */
  async clear(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await this.requireProposal(principal.tenantId, proposalId);
    const command = parseClear(body);
    const requestHash = hashOf({ kind: "CLEAR", expected_link_ref: command.expectedLinkRef });
    let outcome: PrepareOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        await lockProposal(tx, proposal.id);
        const repeated = await this.repetition(tx, proposal.id, command.requestId, requestHash);
        if (repeated) return repeated;
        const current = await this.currentLink(tx, proposal.id);
        if (!current || current.id !== command.expectedLinkRef) throw new ConflictWithView("REFERENCE_CHANGED");
        if (current.action === "CLEAR") throw new ConflictWithView("REFERENCE_UP_TO_DATE");
        await tx.jointPurchaseProposalEstimationLink.create({
          data: {
            proposalId: proposal.id,
            tenantId: proposal.tenantId,
            sequence: current.sequence + 1,
            requestId: command.requestId,
            requestHash,
            mode: "CLEAR",
            action: "CLEAR",
            createdByUserId: principal.sub,
            createdByRole: principal.role,
          },
        });
        return "CLEARED" as const;
      }, TRANSACTION);
    } catch (error) {
      throw await this.withView(error, principal, proposal);
    }
    return { outcome, view: await this.render(principal, proposal) };
  }

  /**
   * E3 §6: the products of the draft to take to a call, with optimistic
   * control. A product that is not a line of the draft is 422
   * PRODUCT_NOT_IN_PROPOSAL; another revision is 409 SELECTION_STALE with the
   * one in force. Each change leaves an AuditLog entry; the same list again
   * writes nothing.
   */
  async putSelection(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await this.requireProposal(principal.tenantId, proposalId);
    const command = parseSelection(body);
    const inProposal = new Map(proposal.lines.map((line) => [line.canonicalProductId, line.position]));
    if (command.productRefs.some((ref) => !inProposal.has(ref))) {
      throw new LinkHttpError(HttpStatus.UNPROCESSABLE_ENTITY, "PRODUCT_NOT_IN_PROPOSAL");
    }
    const ordered = [...command.productRefs].sort((a, b) => inProposal.get(a)! - inProposal.get(b)!);
    await this.prisma.$transaction(async (tx) => {
      await lockProposal(tx, proposal.id);
      const current = await this.selectionOf(tx, proposal.id);
      if (current.revision !== command.expectedRevision) {
        throw new LinkHttpError(HttpStatus.CONFLICT, "SELECTION_STALE", { selection: current });
      }
      if (current.revision > 0 && sameList(current.product_refs, ordered)) return;
      const now = new Date();
      const data = { productRefs: ordered, updatedAt: now, updatedByUserId: principal.sub };
      if (current.revision === 0) {
        await tx.jointPurchaseProposalSelection.create({
          data: { proposalId: proposal.id, tenantId: proposal.tenantId, revision: 1, ...data },
        });
      } else {
        await tx.jointPurchaseProposalSelection.update({
          where: { proposalId: proposal.id },
          data: { revision: current.revision + 1, ...data },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: proposal.tenantId,
          campaignId: proposal.campaignId,
          actorUserId: principal.sub,
          ownerUserId: null,
          action: "OTRO",
          entityName: "JointPurchaseProposalSelection",
          entityId: proposal.id,
          summary: `Selección de productos del borrador de propuesta actualizada (${ordered.length} productos).`,
          metadata: { revision: current.revision + 1, productRefs: ordered },
        },
      });
    }, TRANSACTION);
    return this.selectionOf(this.prisma, proposal.id);
  }

  // ---------------------------------------------------------------- helpers

  private async requireProposal(tenantId: string, proposalId: string): Promise<ProposalHead> {
    if (!UUID.test(proposalId)) throw notFound();
    const proposal = await this.prisma.jointPurchaseProposal.findFirst({
      where: { id: proposalId, tenantId },
      select: {
        id: true,
        tenantId: true,
        campaignId: true,
        lines: { orderBy: { position: "asc" }, select: { position: true, canonicalProductId: true, baseUnit: true } },
      },
    });
    // Another tenant's draft is indistinguishable from a missing one.
    if (!proposal) throw notFound();
    return proposal;
  }

  private async selectionOf(db: Tx | PrismaService, proposalId: string) {
    const row = await db.jointPurchaseProposalSelection.findUnique({ where: { proposalId } });
    return {
      contract_version: 1 as const,
      proposal_ref: proposalId,
      revision: row?.revision ?? 0,
      product_refs: row ? (row.productRefs as string[]) : [],
      updated_at: row?.updatedAt.toISOString() ?? null,
    };
  }

  private async repetition(tx: Tx, proposalId: string, requestId: string, requestHash: string): Promise<PrepareOutcome | null> {
    const existing = await tx.jointPurchaseProposalEstimationLink.findUnique({
      where: { proposalId_requestId: { proposalId, requestId } },
      select: { requestHash: true, action: true },
    });
    if (!existing) return null;
    if (existing.requestHash !== requestHash) throw new LinkHttpError(HttpStatus.CONFLICT, "REQUEST_ID_REUSED");
    return OUTCOME_OF[existing.action as Action];
  }

  private currentLink(db: Tx | PrismaService, proposalId: string): Promise<StoredLink | null> {
    return db.jointPurchaseProposalEstimationLink.findFirst({
      where: { proposalId },
      orderBy: { sequence: "desc" },
      include: LINK_INCLUDE,
    });
  }

  private async insertLink(
    tx: Tx,
    principal: AuthenticatedPrincipal,
    proposal: ProposalHead,
    current: StoredLink | null,
    requestId: string,
    requestHash: string,
    mode: Mode,
    action: Exclude<Action, "CLEAR">,
    target: { runId?: string; jobId?: string },
  ) {
    await tx.jointPurchaseProposalEstimationLink.create({
      data: {
        proposalId: proposal.id,
        tenantId: proposal.tenantId,
        sequence: (current?.sequence ?? 0) + 1,
        requestId,
        requestHash,
        mode,
        action,
        runId: target.runId ?? null,
        jobId: target.jobId ?? null,
        createdByUserId: principal.sub,
        createdByRole: principal.role,
      },
    });
  }

  /**
   * E3-D4: the latest CALCULATED run of the chain of the draft's campaign, if
   * it has a result for every estimable line (same canonical product and base
   * unit) and none of them has its sources changed, its classification
   * corrected or a source withdrawn. The policy in force is checked by the
   * caller (prepare refuses under POLICY_PENDING).
   */
  private async compatibleRun(tenantId: string, proposal: ProposalHead, estimable: EstimableLine[]): Promise<string | null> {
    const latest = await this.reads.latestCalculatedRunId(tenantId, proposal.campaignId);
    if (!latest) return null;
    const facts = await this.reads.resultFacts(tenantId, latest);
    if (!facts || facts.policy_pending) return null;
    for (const line of estimable) {
      const result = facts.results.find((r) => r.product_ref === line.productId && r.base_unit === line.baseUnit);
      if (!result) return null;
      if (result.facts.sourcesChanged || result.facts.classificationCorrected || result.facts.sourcesWithdrawn) return null;
    }
    return latest;
  }

  /** E3-D5: the F12 job, through `EstimationJobsUseCase.request` with the derived request_id. */
  private async requestJob(
    principal: AuthenticatedPrincipal,
    proposal: ProposalHead,
    requestId: string,
    estimable: EstimableLine[],
  ): Promise<{ jobId: string } | { reason: NotCalculableReason }> {
    try {
      const { job } = await this.jobs.request(principal, {
        requestId: derivedJobRequestId(proposal.id, requestId),
        targetCampaignId: proposal.campaignId,
        productRefs: [...new Set(estimable.map((line) => line.productId))],
      });
      return { jobId: job.job_ref };
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        const message = error.message;
        if (message === "TARGET_CAMPAIGN_NOT_ELIGIBLE" || message === "TARGET_CAMPAIGN_NOT_CLASSIFIED") return { reason: message };
        if (message === "PRODUCT_NOT_ESTIMABLE") return { reason: "NO_ESTIMABLE_PRODUCTS" };
      }
      if (error instanceof ConflictException && (error.message === "POLICY_PENDING" || error.message === "REQUEST_ID_REUSED")) {
        throw new LinkHttpError(HttpStatus.CONFLICT, error.message);
      }
      if (error instanceof BadRequestException) throw invalid();
      throw error;
    }
  }

  private async withView(error: unknown, principal: AuthenticatedPrincipal, proposal: ProposalHead): Promise<unknown> {
    if (error instanceof ConflictWithView) {
      return new LinkHttpError(HttpStatus.CONFLICT, error.errorCode, { view: await this.render(principal, proposal) });
    }
    return error;
  }

  /** `update` of the view: whether «Actualizar referencia» is offered, and why. */
  private async updateOf(
    tenantId: string,
    proposal: ProposalHead,
    current: StoredLink | null,
    estimable: EstimableLine[],
    resolved?: { state: LinkState; facts: RunFacts | null },
  ): Promise<{ available: boolean; reason: UpdateReason | null }> {
    const { state, facts } = resolved ?? (await this.resolve(tenantId, current));
    if (state === "UNAVAILABLE") {
      return { available: true, reason: current?.job?.status === "NOT_EXECUTED" ? "NOT_EXECUTED" : "FAILED" };
    }
    if (state !== "LINKED" || !facts) return { available: false, reason: null };
    if (facts.later_calculated_run) return { available: true, reason: "NEWER_RUN" };
    const results = estimable.map((line) => facts.results.find((r) => r.product_ref === line.productId && r.base_unit === line.baseUnit));
    if (results.some((r) => r && (r.facts.sourcesChanged || r.facts.classificationCorrected || r.facts.sourcesWithdrawn))) {
      return { available: true, reason: "OUTDATED" };
    }
    if (results.some((r) => !r)) return { available: true, reason: "INCOMPLETE" };
    return { available: false, reason: null };
  }

  /** The state of the link in force, and the facts of its run (if any). */
  private async resolve(tenantId: string, current: StoredLink | null): Promise<{ state: LinkState; facts: RunFacts | null; runId: string | null }> {
    if (!current || current.action === "CLEAR") return { state: "NONE", facts: null, runId: null };
    const run = current.run ?? current.job?.run ?? null;
    const facts = run ? await this.reads.resultFacts(tenantId, run.id) : null;
    if (this.collective.mode === "POLICY_PENDING") return { state: "RESTRICTED", facts, runId: run?.id ?? null };
    if (!run) {
      return { state: current.job?.status === "NOT_EXECUTED" ? "UNAVAILABLE" : "CALCULATING", facts: null, runId: null };
    }
    return { state: run.outcome === "FAILED" ? "UNAVAILABLE" : "LINKED", facts, runId: run.id };
  }

  /** Why a reference cannot be obtained now, or null. */
  private async prepareBlocker(
    tx: Tx | PrismaService,
    tenantId: string,
    proposal: ProposalHead,
    estimable: EstimableLine[],
  ): Promise<"POLICY_PENDING" | NotCalculableReason | null> {
    if (this.collective.mode === "POLICY_PENDING") return "POLICY_PENDING";
    if (estimable.length === 0) return "NO_ESTIMABLE_PRODUCTS";
    if (await this.compatibleRun(tenantId, proposal, estimable)) return null;
    return campaignBlocker(tx, proposal);
  }

  /** The whole view: GET …/estimation-link and the `view` of every answer. */
  private async render(principal: AuthenticatedPrincipal, proposal: ProposalHead) {
    const tenantId = principal.tenantId;
    const links = await this.prisma.jointPurchaseProposalEstimationLink.findMany({
      where: { proposalId: proposal.id },
      orderBy: { sequence: "asc" },
      include: LINK_INCLUDE,
    });
    const current = links[links.length - 1] ?? null;
    const need: ProposalView = await this.proposals.view(tenantId, proposal.id);
    const estimable = await estimableLines(this.prisma, proposal);
    const resolved = await this.resolve(tenantId, current);
    const update = await this.updateOf(tenantId, proposal, current, estimable, resolved);
    const blocker = await this.prepareBlocker(this.prisma, tenantId, proposal, estimable);
    const run = resolved.facts?.run ?? null;
    const policyPending = this.collective.mode === "POLICY_PENDING";
    const lines = need.lines.map((line) => {
      const result =
        resolved.facts?.results.find((r) => r.product_ref === line.product_ref && r.base_unit === line.base_unit) ?? null;
      const state: LineEstimationState = lineEstimationState(
        resolved.state,
        result ? { status: result.status, validity: result.validity, validityReason: result.validity_reason } : null,
      );
      const shows = state === "AVAILABLE" || state === "OUTDATED";
      const estimation = {
        state,
        status: result?.status ?? null,
        reason_code: result?.reason_code ?? null,
        estimate_base: shows ? (result?.estimate_base ?? null) : null,
        validity: result?.validity ?? null,
        validity_reason: result?.validity_reason ?? null,
      };
      const comparison: Comparison = compare({
        need: {
          productRef: line.product_ref,
          baseUnit: line.base_unit,
          campaignRef: proposal.campaignId,
          quantityBase: line.status === "DISCLOSED" ? line.quantity_base : null,
        },
        estimate:
          result && run
            ? {
                productRef: result.product_ref,
                baseUnit: result.base_unit,
                targetCampaignRef: run.target.campaign_ref,
                estimateBase: estimation.estimate_base,
                current: state === "AVAILABLE" && !policyPending,
              }
            : null,
        // E3-P1: no metadata allows checking that both cover the same people.
        populationVerified: false,
      });
      return {
        position: line.position,
        product: { product_ref: line.product_ref, name: line.product_name },
        base_unit: line.base_unit,
        presentation_unit: line.presentation_unit,
        need: { status: line.status, quantity_base: line.quantity_base, quantity_presentation: line.quantity_presentation },
        estimation,
        comparison,
      };
    });
    return {
      contract_version: 1 as const,
      proposal_ref: proposal.id,
      target_campaign_ref: proposal.campaignId,
      state: resolved.state,
      link: current && current.action !== "CLEAR" ? linkView(current) : null,
      run: run
        ? {
            run_ref: run.run_ref,
            job_ref: run.job_ref,
            generated_at: run.generated_at,
            outcome: run.outcome,
            failure_code: run.failure_code,
            method: run.method,
            method_version: run.method_version,
            season: run.season,
            target: run.target,
            disclosure: run.disclosure,
          }
        : null,
      update,
      prepare_blocker: blocker,
      lines,
      history: links.map((link) => ({ ...linkView(link), current: link.id === current?.id })),
      evaluated_at: new Date().toISOString(),
      notice: LINK_NOTICE,
    };
  }
}

function linkView(link: StoredLink) {
  const run = link.run ?? link.job?.run ?? null;
  return {
    link_ref: link.id,
    sequence: link.sequence,
    mode: link.mode as Mode | "CLEAR",
    action: link.action as Action,
    created_at: link.createdAt.toISOString(),
    created_by: { user_ref: link.createdBy.id, name: link.createdBy.name, role: link.createdByRole },
    run_ref: run?.id ?? null,
    job_ref: link.job?.id ?? null,
    job_status: link.job?.status ?? null,
    stop_code: link.job?.stopCode ?? null,
    failure_code: run?.failureCode ?? null,
  };
}

/** E3-D3: prepare, clear and the selection of one draft are serialized. */
async function lockProposal(tx: Tx, proposalId: string): Promise<void> {
  const key = `e3-proposal:${proposalId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Lines F12 can estimate now: the product of the tenant with a unit that maps
 * to the line's base unit, and not a denomination of another product (the
 * same checks as `EstimationJobsUseCase`).
 */
async function estimableLines(db: Tx | PrismaService, proposal: ProposalHead): Promise<EstimableLine[]> {
  const ids = [...new Set(proposal.lines.map((line) => line.canonicalProductId))];
  const products = await db.product.findMany({ where: { tenantId: proposal.tenantId, id: { in: ids } }, select: { id: true, unit: true } });
  const denominations = await db.productCanonicalAssociation.findMany({
    where: { tenantId: proposal.tenantId, productId: { in: ids }, validTo: null },
    select: { productId: true, canonicalProductId: true },
  });
  const aliased = new Set(denominations.filter((d) => d.canonicalProductId !== d.productId).map((d) => d.productId));
  const unitOf = new Map(products.map((p) => [p.id, baseUnitForCentralUnit(p.unit)]));
  return proposal.lines
    .filter((line) => unitOf.get(line.canonicalProductId) === line.baseUnit && !aliased.has(line.canonicalProductId))
    .map((line) => ({ position: line.position, productId: line.canonicalProductId, baseUnit: line.baseUnit }));
}

/** The checks of F12-EST-05 on the target campaign, before queuing (nothing is written when they fail). */
async function campaignBlocker(db: Tx | PrismaService, proposal: ProposalHead): Promise<NotCalculableReason | null> {
  const campaign = await db.agriculturalCampaign.findFirst({ where: { id: proposal.campaignId, tenantId: proposal.tenantId }, select: { id: true, status: true } });
  if (!campaign || (campaign.status !== "PLANIFICADA" && campaign.status !== "ABIERTA")) return "TARGET_CAMPAIGN_NOT_ELIGIBLE";
  const classified = await db.campaignSeasonClassification.count({
    where: { tenantId: proposal.tenantId, campaignId: campaign.id, nextClassification: { is: null }, seasonId: { not: null } },
  });
  return classified === 0 ? "TARGET_CAMPAIGN_NOT_CLASSIFIED" : null;
}

/**
 * E3-D5: a QUEUED or RUNNING job of the same tenant and campaign whose
 * requested products include every estimable line. A job without explicit
 * products (F12 default: products with published consumption) is not reused:
 * it may leave out a line without consumption.
 */
async function reusableJob(db: Tx | PrismaService, proposal: ProposalHead, estimable: EstimableLine[]): Promise<string | null> {
  const jobs = await db.estimationJob.findMany({
    where: { tenantId: proposal.tenantId, targetCampaignId: proposal.campaignId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: [{ enqueuedAt: "asc" }, { id: "asc" }],
    select: { id: true, productRefs: true },
  });
  const needed = estimable.map((line) => line.productId);
  const found = jobs.find((job) => Array.isArray(job.productRefs) && needed.every((id) => (job.productRefs as string[]).includes(id)));
  return found?.id ?? null;
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
}

function parsePrepare(body: unknown): { requestId: string; mode: Mode; expectedLinkRef: string | null } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["request_id", "mode", "expected_link_ref"]);
  const { request_id: requestId, mode, expected_link_ref: expected } = body;
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw invalid();
  if (mode !== "INITIAL" && mode !== "UPDATE") throw invalid();
  if (expected !== undefined && expected !== null && (typeof expected !== "string" || !UUID.test(expected))) throw invalid();
  if (mode === "UPDATE" && typeof expected !== "string") throw invalid();
  return { requestId: requestId.toLowerCase(), mode, expectedLinkRef: typeof expected === "string" ? expected.toLowerCase() : null };
}

function parseClear(body: unknown): { requestId: string; expectedLinkRef: string } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["request_id", "expected_link_ref"]);
  const { request_id: requestId, expected_link_ref: expected } = body;
  if (typeof requestId !== "string" || !UUID.test(requestId)) throw invalid();
  if (typeof expected !== "string" || !UUID.test(expected)) throw invalid();
  return { requestId: requestId.toLowerCase(), expectedLinkRef: expected.toLowerCase() };
}

function parseSelection(body: unknown): { expectedRevision: number; productRefs: string[] } {
  if (!isRecord(body)) throw invalid();
  onlyKeys(body, ["expected_revision", "product_refs"]);
  const { expected_revision: revision, product_refs: refs } = body;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) throw invalid();
  if (!Array.isArray(refs) || refs.length > MAX_SELECTION) throw invalid();
  if (refs.some((ref) => typeof ref !== "string" || ref.length < 1 || ref.length > 64)) throw invalid();
  if (new Set(refs).size !== refs.length) throw invalid();
  return { expectedRevision: revision, productRefs: refs as string[] };
}

export type ProposalEstimationLinkView = Awaited<ReturnType<ProposalEstimationLinkUseCase["view"]>>;
