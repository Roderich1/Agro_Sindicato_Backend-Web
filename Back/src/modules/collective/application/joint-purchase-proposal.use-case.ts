import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CampaignStatus, Prisma, SyncV1BaseUnit } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { cellId } from "../domain/consolidation";
import { csvField, ProposalCellStatus, proposalFingerprint } from "../domain/proposal";
import { CollectiveConfig, DisclosureMode } from "./collective-config";
import {
  CollectiveSummary,
  CollectiveSummaryUseCase,
  DecidedSummary,
  presentation,
} from "./collective-summary.use-case";

type Tx = Prisma.TransactionClient;

/**
 * State of a line when it is served. Besides the summary states:
 * `WITHDRAWN` — the figure was disclosed when the draft was generated but the
 * summary no longer shows any figure for that cell; `SUPERSEDED` — the summary
 * now shows a newer figure for the cell; `POLICY_PENDING` — no disclosure is
 * authorized now. None of them carries a figure.
 */
export type ProposalLineStatus = ProposalCellStatus | "WITHDRAWN" | "SUPERSEDED" | "POLICY_PENDING";

export interface ProposalLineView {
  position: number;
  product_ref: string;
  product_name: string;
  base_unit: SyncV1BaseUnit;
  presentation_unit: "L" | "KG";
  status: ProposalLineStatus;
  quantity_base: string | null;
  quantity_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  released_at: string | null;
  pending_changes: boolean;
}

export interface ProposalView {
  contractVersion: 1;
  proposal_ref: string;
  status: "DRAFT";
  basis: "DECLARED_NEED";
  campaign: { campaign_ref: string; name: string; status: CampaignStatus };
  generated_at: string;
  generated_by: { user_ref: string; name: string };
  /** Null whenever a figure of the draft is not served (it would cover it). */
  inputs_fingerprint: string | null;
  disclosure: { mode: DisclosureMode; policy: "F07-POL-01"; approved: false };
  coverage: { linked_members: number; members_with_contribution: number } | null;
  lines: ProposalLineView[];
  notice: string;
}

export interface ProposalSummaryView {
  proposal_ref: string;
  status: "DRAFT";
  generated_at: string;
  generated_by: { user_ref: string; name: string };
  inputs_fingerprint: string | null;
  line_count: number;
}

export const PROPOSAL_NOTICE =
  "Borrador para revisión humana. Usa la necesidad declarada, no resta stock y no es necesidad neta. No crea compras, lotes, movimientos, deudas ni pagos.";

/**
 * F07 #26/#27: draft joint purchase proposal from the DECLARED_NEED cells of
 * the collective summary. It never computes its own totals: each line takes
 * the state the summary decided and, when DISCLOSED, a reference to the
 * release that backs the figure. Every read re-runs the summary decision and
 * a line keeps its figure only while the summary shows that same release for
 * its cell; the proposal, its history and its CSV therefore never serve a
 * figure the summary does not show now, nor any figure when the current mode
 * does not authorize disclosure. Generation writes only the proposal and its lines: no
 * purchase, lot, movement, payable account or payment.
 */
@Injectable()
export class JointPurchaseProposalUseCase {
  private readonly logger = new Logger(JointPurchaseProposalUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
    private readonly summary: CollectiveSummaryUseCase,
  ) {}

  async generate(tenantId: string, actorUserId: string, campaignId: string): Promise<ProposalView> {
    let created: string | null = null;
    // 404 for another tenant's campaign comes from the summary itself.
    const decided = await this.summary.decide(tenantId, campaignId, async (tx, { summary, releaseOf }) => {
      created = await this.persist(tx, tenantId, actorUserId, summary, releaseOf);
    });
    if (decided.summary.disclosure.mode === "POLICY_PENDING" || created === null) {
      // Without an authorized disclosure nothing is stored (F07-POL-01 R8).
      throw new ConflictException("POLICY_PENDING");
    }
    this.logger.log(`[JOINT PROPOSAL] tenant=${tenantId} campaign=${campaignId} proposal=${created} actor=${actorUserId}`);
    return this.view(tenantId, created);
  }

  async list(tenantId: string, campaignId: string): Promise<ProposalSummaryView[]> {
    const load = (db: Tx | PrismaService) =>
      db.jointPurchaseProposal.findMany({
        where: { tenantId, campaignId },
        orderBy: [{ generatedAt: "desc" }, { id: "asc" }],
        include: {
          generatedBy: { select: { id: true, name: true } },
          lines: { select: { status: true, releaseId: true, canonicalProductId: true, baseUnit: true } },
        },
      });
    let rows: Awaited<ReturnType<typeof load>> = [];
    let current: CurrentCells | null = null;
    // 404 for another tenant's campaign comes from the summary itself.
    const decided = await this.summary.decide(tenantId, campaignId, async (tx, d) => {
      rows = await load(tx);
      current = currentCells(d);
    });
    if (decided.summary.disclosure.mode === "POLICY_PENDING") rows = await load(this.prisma);
    return rows.map((row) => ({
      proposal_ref: row.id,
      status: row.status,
      generated_at: row.generatedAt.toISOString(),
      generated_by: { user_ref: row.generatedBy.id, name: row.generatedBy.name },
      inputs_fingerprint: fingerprintVisible(row.lines, current) ? row.inputsFingerprint : null,
      line_count: row.lines.length,
    }));
  }

  async view(tenantId: string, proposalId: string): Promise<ProposalView> {
    const head = await this.prisma.jointPurchaseProposal.findFirst({
      where: { id: proposalId, tenantId },
      select: { campaignId: true },
    });
    // Another tenant's proposal is indistinguishable from a missing one.
    if (!head) throw new NotFoundException("PROPOSAL_NOT_FOUND");
    if (this.config.mode === "POLICY_PENDING") {
      return this.render(this.prisma, tenantId, proposalId, null);
    }
    // Same decision as the summary, in its lock: a line shows a figure only
    // if the summary shows that very release for its cell right now.
    let result: ProposalView | null = null;
    await this.summary.decide(tenantId, head.campaignId, async (tx, decided) => {
      result = await this.render(tx, tenantId, proposalId, currentCells(decided));
    });
    return result!;
  }

  async csv(tenantId: string, proposalId: string): Promise<string> {
    return proposalCsv(await this.view(tenantId, proposalId));
  }

  private async persist(
    tx: Tx,
    tenantId: string,
    actorUserId: string,
    summary: CollectiveSummary,
    releaseOf: ReadonlyMap<string, string>,
  ): Promise<string> {
    const cells = summary.cells.filter((cell) => cell.projection_type === "DECLARED_NEED");
    const coverage = summary.coverage!;
    const fingerprint = proposalFingerprint({
      campaign_ref: summary.campaign.campaign_ref,
      coverage,
      cells,
    });
    const proposal = await tx.jointPurchaseProposal.create({
      data: {
        tenantId,
        campaignId: summary.campaign.campaign_ref,
        inputsFingerprint: fingerprint,
        linkedMembers: coverage.linked_members,
        membersWithContribution: coverage.members_with_contribution,
        generatedByUserId: actorUserId,
        lines: {
          create: cells.map((cell, position) => ({
            position,
            canonicalProductId: cell.product_ref,
            baseUnit: cell.base_unit,
            status: cell.status,
            releaseId:
              cell.status === "DISCLOSED"
                ? requireRelease(releaseOf, cell.product_ref, cell.base_unit)
                : null,
            pendingChanges: cell.status === "DISCLOSED" && cell.pending_changes,
          })),
        },
      },
      select: { id: true },
    });
    return proposal.id;
  }

  private async render(
    db: Tx | PrismaService,
    tenantId: string,
    proposalId: string,
    current: CurrentCells | null,
  ): Promise<ProposalView> {
    const row = await db.jointPurchaseProposal.findFirstOrThrow({
      where: { id: proposalId, tenantId },
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        generatedBy: { select: { id: true, name: true } },
        lines: {
          orderBy: { position: "asc" },
          include: {
            canonicalProduct: { select: { name: true } },
            release: {
              select: { totalBase: true, contributorCount: true, dataAsOf: true, releasedAt: true },
            },
          },
        },
      },
    });
    const authorized = current !== null;
    return {
      contractVersion: 1,
      proposal_ref: row.id,
      status: row.status,
      basis: "DECLARED_NEED",
      campaign: { campaign_ref: row.campaign.id, name: row.campaign.name, status: row.campaign.status },
      generated_at: row.generatedAt.toISOString(),
      generated_by: { user_ref: row.generatedBy.id, name: row.generatedBy.name },
      // The fingerprint covers the figures: hidden whenever one is not served.
      inputs_fingerprint: fingerprintVisible(row.lines, current) ? row.inputsFingerprint : null,
      disclosure: { mode: authorized ? "PROVISIONAL_SYNTHETIC" : "POLICY_PENDING", policy: "F07-POL-01", approved: false },
      coverage: authorized
        ? { linked_members: row.linkedMembers, members_with_contribution: row.membersWithContribution }
        : null,
      lines: row.lines.map((line) => {
        const base = {
          position: line.position,
          product_ref: line.canonicalProductId,
          product_name: line.canonicalProduct.name,
          base_unit: line.baseUnit,
          presentation_unit: line.baseUnit === "ML" ? ("L" as const) : ("KG" as const),
        };
        const hidden = {
          quantity_base: null,
          quantity_presentation: null,
          contributors: null,
          data_as_of: null,
          released_at: null,
          pending_changes: false,
        };
        if (!current) return { ...base, status: "POLICY_PENDING" as const, ...hidden };
        if (line.status !== "DISCLOSED") return { ...base, status: line.status, ...hidden };
        const served = servedState(line, current);
        if (served !== "SERVED") return { ...base, status: served, ...hidden };
        const release = line.release!;
        return {
          ...base,
          status: "DISCLOSED" as const,
          quantity_base: release.totalBase.toString(),
          quantity_presentation: presentation(release.totalBase),
          contributors: release.contributorCount,
          data_as_of: release.dataAsOf?.toISOString() ?? null,
          released_at: release.releasedAt.toISOString(),
          // Pending changes as of now, from the current cell.
          pending_changes: current.pendingOf.get(lineCell(line)) ?? false,
        };
      }),
      notice: PROPOSAL_NOTICE,
    };
  }
}

/** What the summary shows right now for each DECLARED_NEED cell. */
interface CurrentCells {
  /** cellId → release whose figure the summary shows now. */
  releaseOf: ReadonlyMap<string, string>;
  pendingOf: ReadonlyMap<string, boolean>;
}

function currentCells({ summary, releaseOf }: DecidedSummary): CurrentCells {
  const pendingOf = new Map<string, boolean>();
  for (const cell of summary.cells) {
    if (cell.projection_type !== "DECLARED_NEED" || cell.status !== "DISCLOSED") continue;
    pendingOf.set(
      cellId({ projectionType: "DECLARED_NEED", canonicalProductId: cell.product_ref, baseUnit: cell.base_unit }),
      cell.pending_changes,
    );
  }
  return { releaseOf, pendingOf };
}

type StoredLine = { status: string; releaseId: string | null; canonicalProductId: string; baseUnit: SyncV1BaseUnit };

function lineCell(line: StoredLine): string {
  return cellId({ projectionType: "DECLARED_NEED", canonicalProductId: line.canonicalProductId, baseUnit: line.baseUnit });
}

/**
 * A DISCLOSED line keeps its figure only while the summary shows that same
 * release for its cell (F07-POL-01 R4/R8). Otherwise the summary hides the
 * cell (`WITHDRAWN`) or shows a newer figure (`SUPERSEDED`); the older one is
 * never served from the proposal.
 */
function servedState(line: StoredLine, current: CurrentCells): "SERVED" | "WITHDRAWN" | "SUPERSEDED" {
  const now = current.releaseOf.get(lineCell(line));
  if (now === undefined) return "WITHDRAWN";
  return now === line.releaseId ? "SERVED" : "SUPERSEDED";
}

/** The fingerprint is shown only if every disclosed figure of the draft is still served. */
function fingerprintVisible(lines: StoredLine[], current: CurrentCells | null): boolean {
  if (!current) return false;
  return lines.every((line) => line.status !== "DISCLOSED" || servedState(line, current) === "SERVED");
}

function requireRelease(releaseOf: ReadonlyMap<string, string>, productRef: string, baseUnit: SyncV1BaseUnit) {
  const id = releaseOf.get(cellId({ projectionType: "DECLARED_NEED", canonicalProductId: productRef, baseUnit }));
  // A DISCLOSED cell always comes from a release; anything else is a bug.
  if (!id) throw new Error("DISCLOSED cell without release");
  return id;
}

/** Same view as JSON, as CSV: same states, no other figure (R8). */
export function proposalCsv(view: ProposalView): string {
  const row = (values: (string | number | boolean | null)[]) => values.map(csvField).join(",");
  const lines = [
    row(["proposal_ref", "status", "basis", "campaign_ref", "campaign", "generated_at", "generated_by", "inputs_fingerprint", "disclosure", "policy", "approved", "linked_members", "members_with_contribution"]),
    row([
      view.proposal_ref,
      view.status,
      view.basis,
      view.campaign.campaign_ref,
      view.campaign.name,
      view.generated_at,
      view.generated_by.name,
      view.inputs_fingerprint,
      view.disclosure.mode,
      view.disclosure.policy,
      view.disclosure.approved,
      view.coverage?.linked_members ?? null,
      view.coverage?.members_with_contribution ?? null,
    ]),
    row(["notice", view.notice]),
    "",
    row(["position", "product_ref", "product_name", "base_unit", "presentation_unit", "status", "quantity_base", "quantity_presentation", "contributors", "data_as_of", "released_at", "pending_changes"]),
    ...view.lines.map((line) =>
      row([
        line.position,
        line.product_ref,
        line.product_name,
        line.base_unit,
        line.presentation_unit,
        line.status,
        line.quantity_base,
        line.quantity_presentation,
        line.contributors,
        line.data_as_of,
        line.released_at,
        line.pending_changes,
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
