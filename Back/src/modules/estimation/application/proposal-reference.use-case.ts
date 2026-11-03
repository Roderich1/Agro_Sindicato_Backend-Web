import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { SyncV1BaseUnit } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { JointPurchaseProposalUseCase, ProposalCsvAppendix, proposalCsv } from "../../collective/application/joint-purchase-proposal.use-case";
import { AuthenticatedPrincipal } from "../../iam/application/types/authenticated-principal.type";
import { EstimationReadsUseCase } from "./estimation-reads.use-case";
import { presentationUnitOf } from "./estimation-views";

export const REFERENCE_LABEL = "Estimación del consumo";

export const REFERENCE_NOTICE =
  "Estimación del consumo: referencia separada para el mismo producto, unidad y campaña. No se suma a la necesidad declarada, no es la cantidad solicitada y no cambia las líneas, los totales ni la huella del borrador. Su vigencia se evalúa al consultar.";

/** Why a line has no result to show; never a zero. */
type Absence = "NO_RESULT" | "POLICY_PENDING";

interface ReferenceSource {
  proposal_ref: string;
  generated_at: Date;
  campaign_ref: string;
  lines: { position: number; product_ref: string; base_unit: SyncV1BaseUnit }[];
}

/**
 * F12-EST-08 (#181): the estimation as a separate reference next to a joint
 * purchase proposal (RN-29, prototype W3) and in its export.
 * - It is `GET /estimation/results` itself for the proposal's campaign: same
 *   selection, validity, policy and permissions; no other calculation nor
 *   storage. A line takes the result of the same canonical product and unit.
 * - It reads the proposal without the summary decision and never writes: the
 *   draft, its lines and its fingerprint stay as they are, also when the
 *   campaign is sealed. Nothing is added to the lines or their totals.
 * - The result belongs to a run and a moment: each line carries its run and
 *   whether it was generated before or after the draft, and the reading
 *   carries `evaluated_at`.
 */
@Injectable()
export class ProposalEstimationReferenceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: EstimationReadsUseCase,
    private readonly proposals: JointPurchaseProposalUseCase,
  ) {}

  async reference(principal: AuthenticatedPrincipal, proposalId: string) {
    const proposal = await this.prisma.jointPurchaseProposal.findFirst({
      where: { id: proposalId, tenantId: principal.tenantId },
      select: {
        id: true,
        generatedAt: true,
        campaignId: true,
        lines: { orderBy: { position: "asc" }, select: { position: true, canonicalProductId: true, baseUnit: true } },
      },
    });
    // Another tenant's proposal is indistinguishable from a missing one.
    if (!proposal) throw new NotFoundException("PROPOSAL_NOT_FOUND");
    return this.compose(principal, {
      proposal_ref: proposal.id,
      generated_at: proposal.generatedAt,
      campaign_ref: proposal.campaignId,
      lines: proposal.lines.map((l) => ({ position: l.position, product_ref: l.canonicalProductId, base_unit: l.baseUnit })),
    });
  }

  /** The proposal's own CSV, unchanged, with the reference appended in separate columns. */
  async csv(principal: AuthenticatedPrincipal, proposalId: string): Promise<string> {
    const view = await this.proposals.view(principal.tenantId, proposalId);
    const reference = await this.compose(principal, {
      proposal_ref: view.proposal_ref,
      generated_at: new Date(view.generated_at),
      campaign_ref: view.campaign.campaign_ref,
      lines: view.lines.map((l) => ({ position: l.position, product_ref: l.product_ref, base_unit: l.base_unit })),
    });
    return proposalCsv(view, appendixOf(reference));
  }

  private async compose(principal: AuthenticatedPrincipal, source: ReferenceSource) {
    let read: Awaited<ReturnType<EstimationReadsUseCase["results"]>> | null = null;
    try {
      read = await this.reads.results(principal, source.campaign_ref);
    } catch (error) {
      // Without a policy in force no figure is delivered (contract §4.3); the proposal is still shown.
      if (!(error instanceof ConflictException && error.message === "POLICY_PENDING")) throw error;
    }
    const byKey = new Map((read?.results ?? []).map((r) => [`${r.product.product_ref}|${r.base_unit}`, r]));
    return {
      contract_version: 1 as const,
      kind: "PROPOSAL_ESTIMATION_REFERENCE" as const,
      label: REFERENCE_LABEL,
      proposal_ref: source.proposal_ref,
      proposal_generated_at: source.generated_at.toISOString(),
      target_campaign_ref: source.campaign_ref,
      availability: read ? ("AVAILABLE" as const) : ("POLICY_PENDING" as const),
      evaluated_at: read?.evaluated_at ?? new Date().toISOString(),
      season: read?.season ?? null,
      lines: source.lines.map((line) => {
        const result = byKey.get(`${line.product_ref}|${line.base_unit}`);
        const absence: Absence | null = !read ? "POLICY_PENDING" : result ? null : "NO_RESULT";
        return {
          position: line.position,
          product_ref: line.product_ref,
          base_unit: line.base_unit,
          presentation_unit: presentationUnitOf(line.base_unit),
          absence,
          estimation: result
            ? {
                status: result.status,
                reason_code: result.reason_code,
                estimate_base: result.estimate_base,
                validity: result.validity,
                validity_reason: result.validity_reason,
                method: result.method,
                run_ref: result.run_ref,
                generated_at: result.generated_at,
                span_length: result.span_length,
                run_relation: new Date(result.generated_at) <= source.generated_at ? ("BEFORE_PROPOSAL" as const) : ("AFTER_PROPOSAL" as const),
              }
            : null,
        };
      }),
      notice: REFERENCE_NOTICE,
    };
  }
}

export type ProposalEstimationReference = Awaited<ReturnType<ProposalEstimationReferenceUseCase["reference"]>>;

/** The reference as columns after the proposal's own, prefixed `estimation_`. */
export function appendixOf(reference: ProposalEstimationReference): ProposalCsvAppendix {
  const byPosition = new Map(reference.lines.map((line) => [line.position, line]));
  return {
    head: {
      header: ["estimation_reference", "estimation_availability", "estimation_evaluated_at", "estimation_season", "estimation_notice"],
      values: [reference.label, reference.availability, reference.evaluated_at, reference.season?.key ?? null, reference.notice],
    },
    lineHeader: [
      "estimation_absence",
      "estimation_status",
      "estimation_reason_code",
      "estimation_estimate_base",
      "estimation_validity",
      "estimation_validity_reason",
      "estimation_method",
      "estimation_run_ref",
      "estimation_run_generated_at",
      "estimation_run_relation",
    ],
    line: (position) => {
      const line = byPosition.get(position);
      const e = line?.estimation ?? null;
      return [
        line?.absence ?? null,
        e?.status ?? null,
        e?.reason_code ?? null,
        e?.estimate_base ?? null,
        e?.validity ?? null,
        e?.validity_reason ?? null,
        e?.method ?? null,
        e?.run_ref ?? null,
        e?.generated_at ?? null,
        e?.run_relation ?? null,
      ];
    },
  };
}
