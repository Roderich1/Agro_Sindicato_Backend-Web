import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { EstimationJobsUseCase } from "@/modules/estimation/application/estimation-jobs.use-case";
import { EstimationReadsUseCase } from "@/modules/estimation/application/estimation-reads.use-case";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../collective/application/collective-config";
import { JointPurchaseProposalUseCase } from "../../collective/application/joint-purchase-proposal.use-case";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import {
  Action,
  ConflictWithView,
  hashOf,
  LinkHttpError,
  NotCalculableReason,
  parseClear,
  parsePrepare,
  parseSelection,
  PrepareOutcome,
  ProposalHead,
  sameList,
  TRANSACTION,
} from "./link/proposal-link.parsers";
import {
  campaignBlocker,
  currentLink,
  estimableLines,
  findCompatibleRun,
  findRepeatedOutcome,
  insertLink,
  lockProposal,
  requestEstimationJob,
  requireProposal,
  reusableJob,
  selectionOf,
} from "./link/proposal-link.queries";
import {
  computeUpdateAvailability,
  LinkRenderDeps,
  renderLinkView,
} from "./link/proposal-link.renderer";

export { LINK_NOTICE, LinkHttpError } from "./link/proposal-link.parsers";
export type { NotCalculableReason, PrepareOutcome } from "./link/proposal-link.parsers";

/**
 * E3: the consumption estimate fixed as a reference of a draft joint purchase
 * proposal, and the selection of products for a call.
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

  private renderDeps(): LinkRenderDeps {
    return {
      prisma: this.prisma,
      reads: this.reads,
      proposals: this.proposals,
      collective: this.collective,
    };
  }

  async view(principal: AuthenticatedPrincipal, proposalId: string) {
    const proposal = await requireProposal(this.prisma, principal.tenantId, proposalId);
    return renderLinkView(this.renderDeps(), principal, proposal);
  }

  async selection(principal: AuthenticatedPrincipal, proposalId: string) {
    const proposal = await requireProposal(this.prisma, principal.tenantId, proposalId);
    return selectionOf(this.prisma, proposal.id);
  }

  async prepare(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await requireProposal(this.prisma, principal.tenantId, proposalId);
    const command = parsePrepare(body);
    const requestHash = hashOf({ kind: "PREPARE", mode: command.mode, expected_link_ref: command.expectedLinkRef });
    let decided: { outcome: PrepareOutcome; reason?: NotCalculableReason };
    try {
      decided = await this.prisma.$transaction(async (tx) => {
        await lockProposal(tx, proposal.id);
        const repeated = await findRepeatedOutcome(tx, proposal.id, command.requestId, requestHash);
        if (repeated) return { outcome: repeated };
        if (this.collective.mode === "POLICY_PENDING") throw new LinkHttpError(HttpStatus.CONFLICT, "POLICY_PENDING");
        const current = await currentLink(tx, proposal.id);
        const active = current && current.action !== "CLEAR" ? current : null;
        if (command.mode === "INITIAL") {
          if (active) return { outcome: "EXISTING" as const };
        } else {
          if (!current || current.id !== command.expectedLinkRef) throw new ConflictWithView("REFERENCE_CHANGED");
          const estimable = await estimableLines(tx, proposal);
          const update = await computeUpdateAvailability(this.renderDeps(), principal.tenantId, current, estimable);
          if (!update.available) throw new ConflictWithView("REFERENCE_UP_TO_DATE");
        }
        const estimable = await estimableLines(tx, proposal);
        if (estimable.length === 0) return { outcome: "NOT_CALCULABLE" as const, reason: "NO_ESTIMABLE_PRODUCTS" as const };
        const write = (action: Exclude<Action, "CLEAR">, target: { runId?: string; jobId?: string }) =>
          insertLink(tx, principal, proposal, current, command.requestId, requestHash, command.mode, action, target);

        const compatible = await findCompatibleRun(this.reads, principal.tenantId, proposal, estimable);
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
        const job = await requestEstimationJob(this.jobs, principal, proposal, command.requestId, estimable);
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
    return {
      outcome: decided.outcome,
      ...(decided.reason ? { reason: decided.reason } : {}),
      view: await renderLinkView(this.renderDeps(), principal, proposal),
    };
  }

  /** Removes the reference: a CLEAR link; a job in progress no longer has an effect on the draft. */
  async clear(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await requireProposal(this.prisma, principal.tenantId, proposalId);
    const command = parseClear(body);
    const requestHash = hashOf({ kind: "CLEAR", expected_link_ref: command.expectedLinkRef });
    let outcome: PrepareOutcome;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        await lockProposal(tx, proposal.id);
        const repeated = await findRepeatedOutcome(tx, proposal.id, command.requestId, requestHash);
        if (repeated) return repeated;
        const current = await currentLink(tx, proposal.id);
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
    return { outcome, view: await renderLinkView(this.renderDeps(), principal, proposal) };
  }

  /** E3 §6: optimistic update of products selected from the draft for a call. */
  async putSelection(principal: AuthenticatedPrincipal, proposalId: string, body: unknown) {
    const proposal = await requireProposal(this.prisma, principal.tenantId, proposalId);
    const command = parseSelection(body);
    const inProposal = new Map(proposal.lines.map((line) => [line.canonicalProductId, line.position]));
    if (command.productRefs.some((ref) => !inProposal.has(ref))) {
      throw new LinkHttpError(HttpStatus.UNPROCESSABLE_ENTITY, "PRODUCT_NOT_IN_PROPOSAL");
    }
    const ordered = [...command.productRefs].sort((a, b) => inProposal.get(a)! - inProposal.get(b)!);
    await this.prisma.$transaction(async (tx) => {
      await lockProposal(tx, proposal.id);
      const current = await selectionOf(tx, proposal.id);
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
    return selectionOf(this.prisma, proposal.id);
  }

  private async withView(error: unknown, principal: AuthenticatedPrincipal, proposal: ProposalHead): Promise<unknown> {
    if (error instanceof ConflictWithView) {
      return new LinkHttpError(HttpStatus.CONFLICT, error.errorCode, {
        view: await renderLinkView(this.renderDeps(), principal, proposal),
      });
    }
    return error;
  }
}

export type ProposalEstimationLinkView = Awaited<ReturnType<ProposalEstimationLinkUseCase["view"]>>;
