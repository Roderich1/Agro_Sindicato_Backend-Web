import { EstimationReadsUseCase } from "@/modules/estimation/application/estimation-reads.use-case";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CollectiveConfig } from "../../../collective/application/collective-config";
import {
  JointPurchaseProposalUseCase,
  ProposalView,
} from "../../../collective/application/joint-purchase-proposal.use-case";
import { AuthenticatedPrincipal } from "../../../iam/application/types/authenticated-principal.type";
import {
  compare,
  Comparison,
  EstimateScope,
  estimateScope,
  LineEstimationState,
  lineEstimationState,
  LinkState,
  showsEstimateScope,
} from "../../domain/proposal-link";
import {
  Action,
  EstimableLine,
  LINK_INCLUDE,
  LINK_NOTICE,
  Mode,
  NotCalculableReason,
  ProposalHead,
  RunFacts,
  StoredLink,
  Tx,
  UpdateReason,
} from "./proposal-link.parsers";
import {
  campaignBlocker,
  estimableLines,
  findCompatibleRun,
} from "./proposal-link.queries";

export interface LinkRenderDeps {
  readonly prisma: PrismaService;
  readonly reads: EstimationReadsUseCase;
  readonly proposals: JointPurchaseProposalUseCase;
  readonly collective: CollectiveConfig;
}

export async function resolveLinkState(
  deps: Pick<LinkRenderDeps, "reads" | "collective">,
  tenantId: string,
  current: StoredLink | null,
): Promise<{ state: LinkState; facts: RunFacts | null; runId: string | null }> {
  if (!current || current.action === "CLEAR") return { state: "NONE", facts: null, runId: null };
  const run = current.run ?? current.job?.run ?? null;
  const facts = run ? await deps.reads.resultFacts(tenantId, run.id) : null;
  if (deps.collective.mode === "POLICY_PENDING") return { state: "RESTRICTED", facts, runId: run?.id ?? null };
  if (!run) {
    return { state: current.job?.status === "NOT_EXECUTED" ? "UNAVAILABLE" : "CALCULATING", facts: null, runId: null };
  }
  return { state: run.outcome === "FAILED" ? "UNAVAILABLE" : "LINKED", facts, runId: run.id };
}

export async function computeUpdateAvailability(
  deps: Pick<LinkRenderDeps, "reads" | "collective">,
  tenantId: string,
  current: StoredLink | null,
  estimable: EstimableLine[],
  resolved?: { state: LinkState; facts: RunFacts | null },
): Promise<{ available: boolean; reason: UpdateReason | null }> {
  const { state, facts } = resolved ?? (await resolveLinkState(deps, tenantId, current));
  if (state === "UNAVAILABLE") {
    return { available: true, reason: current?.job?.status === "NOT_EXECUTED" ? "NOT_EXECUTED" : "FAILED" };
  }
  if (state !== "LINKED" || !facts) return { available: false, reason: null };
  if (facts.later_calculated_run) return { available: true, reason: "NEWER_RUN" };
  const results = estimable.map((line) =>
    facts.results.find((r) => r.product_ref === line.productId && r.base_unit === line.baseUnit),
  );
  if (results.some((r) => r && (r.facts.sourcesChanged || r.facts.classificationCorrected || r.facts.sourcesWithdrawn))) {
    return { available: true, reason: "OUTDATED" };
  }
  if (results.some((r) => !r)) return { available: true, reason: "INCOMPLETE" };
  return { available: false, reason: null };
}

async function fetchEstimateScopes(
  prisma: PrismaService,
  tenantId: string,
  resolved: { state: LinkState; runId: string | null },
): Promise<Map<string, EstimateScope>> {
  const scopes = new Map<string, EstimateScope>();
  if (resolved.state !== "LINKED" || !resolved.runId) return scopes;
  const results = await prisma.estimationResult.findMany({
    where: { runId: resolved.runId, run: { tenantId }, status: "ESTIMATED" },
    select: {
      canonicalProductId: true,
      baseUnit: true,
      spanFirstPosition: true,
      spanLastPosition: true,
      series: { select: { points: { select: { position: true, sourceRelease: { select: { contributorCount: true } } } } } },
    },
  });
  for (const result of results) {
    const scope = estimateScope(
      { first: result.spanFirstPosition, last: result.spanLastPosition },
      (result.series?.points ?? []).map((p) => ({ position: p.position, contributors: p.sourceRelease?.contributorCount ?? null })),
    );
    if (scope) scopes.set(`${result.canonicalProductId}|${result.baseUnit}`, scope);
  }
  return scopes;
}

async function prepareBlocker(
  deps: Pick<LinkRenderDeps, "reads" | "collective">,
  tx: Tx | PrismaService,
  tenantId: string,
  proposal: ProposalHead,
  estimable: EstimableLine[],
): Promise<"POLICY_PENDING" | NotCalculableReason | null> {
  if (deps.collective.mode === "POLICY_PENDING") return "POLICY_PENDING";
  if (estimable.length === 0) return "NO_ESTIMABLE_PRODUCTS";
  if (await findCompatibleRun(deps.reads, tenantId, proposal, estimable)) return null;
  return campaignBlocker(tx, proposal);
}

export async function renderLinkView(
  deps: LinkRenderDeps,
  principal: AuthenticatedPrincipal,
  proposal: ProposalHead,
) {
  const tenantId = principal.tenantId;
  const links = await deps.prisma.jointPurchaseProposalEstimationLink.findMany({
    where: { proposalId: proposal.id },
    orderBy: { sequence: "asc" },
    include: LINK_INCLUDE,
  });
  const current = links[links.length - 1] ?? null;
  const need: ProposalView = await deps.proposals.view(tenantId, proposal.id);
  const estimable = await estimableLines(deps.prisma, proposal);
  const resolved = await resolveLinkState(deps, tenantId, current);
  const update = await computeUpdateAvailability(deps, tenantId, current, estimable, resolved);
  const blocker = await prepareBlocker(deps, deps.prisma, tenantId, proposal, estimable);
  const run = resolved.facts?.run ?? null;
  const policyPending = deps.collective.mode === "POLICY_PENDING";
  const scopes = await fetchEstimateScopes(deps.prisma, tenantId, resolved);

  const lines = need.lines.map((line) => {
    const result =
      resolved.facts?.results.find((r) => r.product_ref === line.product_ref && r.base_unit === line.base_unit) ?? null;
    const state: LineEstimationState = lineEstimationState(
      resolved.state,
      result
        ? {
            status: result.status,
            validity: result.validity,
            validityReason: result.validity_reason,
            figureDelivered: result.status !== "ESTIMATED" || result.estimate_base !== null,
          }
        : null,
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
      scope: {
        need_contributors: line.status === "DISCLOSED" ? line.contributors : null,
        estimate: showsEstimateScope(state, estimation.estimate_base)
          ? (scopes.get(`${line.product_ref}|${line.base_unit}`) ?? null)
          : null,
      },
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
