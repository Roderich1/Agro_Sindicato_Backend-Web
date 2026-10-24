import { Injectable } from "@nestjs/common";
import type { CampaignStatus, SyncV1BaseUnit, SyncV1ProjectionType } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { PROVISIONAL_THRESHOLD } from "../domain/disclosure-policy";
import { csvField } from "../domain/proposal";
import { CollectiveConfig, DisclosureMode } from "./collective-config";
import {
  CellStatus,
  CollectiveSummary,
  SEALED_VERSION_INCLUDE,
  SealRef,
  servedSealed,
  SummaryCell,
  toSealRef,
} from "./collective-summary.use-case";

/**
 * State of one campaign in a series. Besides the sealed states: `NO_DATA` —
 * the sealed version has no such cell (unknown, never zero); `NOT_SEALED` —
 * the campaign has no sealed version, so a historical query shows nothing.
 */
export type TrendPointStatus = CellStatus | "NO_DATA" | "NOT_SEALED";

export interface TrendCampaign {
  campaign_ref: string;
  name: string;
  status: CampaignStatus;
  start_date: string;
  seal: SealRef | null;
  /** Coverage stored at the seal; null if not sealed or without disclosure. */
  coverage: CollectiveSummary["coverage"];
}

export interface TrendPoint {
  campaign_ref: string;
  status: TrendPointStatus;
  total_base: string | null;
  total_presentation: string | null;
  contributors: number | null;
  data_as_of: string | null;
  pending_changes: boolean;
}

export interface TrendSeries {
  projection_type: SyncV1ProjectionType;
  product_ref: string;
  product_name: string;
  base_unit: SyncV1BaseUnit;
  presentation_unit: "L" | "KG";
  /** One point per campaign, in the order of `campaigns`. */
  points: TrendPoint[];
}

export interface CollectiveTrends {
  contractVersion: 1;
  disclosure: { mode: DisclosureMode; policy: "F07-POL-01"; approved: false; threshold: number | null };
  projection_type: SyncV1ProjectionType | null;
  campaigns: TrendCampaign[];
  series: TrendSeries[];
  notice: string;
}

export const TRENDS_NOTICE =
  "Sólo versiones selladas, celda por celda. No suma, resta ni promedia entre campañas, productos, unidades o tipos. Una ausencia o una cifra oculta no es cero. Un cambio de cobertura no prueba un cambio del consumo de cada agricultor. Sin pronósticos ni recomendaciones.";

const EMPTY: Omit<TrendPoint, "campaign_ref" | "status"> = {
  total_base: null,
  total_presentation: null,
  contributors: null,
  data_as_of: null,
  pending_changes: false,
};

/**
 * F07 first trends query (F07_SEALED_HISTORY_CONTRACT §8): declared need,
 * published consumption, and coverage/availability of figures per campaign,
 * product and unit. Only sealed versions provide figures, through the same
 * served view as the summary (policy in force, withdrawals, threshold); an
 * unsealed campaign is never decided from here. Pure read: no write, no
 * `CollectiveReleaseItem`, no total across campaigns.
 */
@Injectable()
export class CollectiveTrendsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CollectiveConfig,
  ) {}

  async execute(tenantId: string, projectionType: SyncV1ProjectionType | null): Promise<CollectiveTrends> {
    const campaigns = await this.prisma.agriculturalCampaign.findMany({
      where: { tenantId, status: { not: "CANCELADA" } },
      orderBy: [{ startDate: "asc" }, { name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, status: true, startDate: true },
    });
    const seals = await this.prisma.collectiveSeal.findMany({
      where: { tenantId },
      orderBy: { version: "desc" },
      include: SEALED_VERSION_INCLUDE,
    });
    const sealOf = new Map<string, (typeof seals)[number]>();
    for (const seal of seals) if (!sealOf.has(seal.campaignId)) sealOf.set(seal.campaignId, seal);
    const authorized = this.config.mode === "PROVISIONAL_SYNTHETIC";

    const served = new Map<string, { cells: SummaryCell[]; coverage: CollectiveSummary["coverage"] }>();
    if (authorized) {
      for (const [campaignId, seal] of sealOf) {
        const { cells, coverage } = servedSealed(seal);
        served.set(campaignId, {
          cells: cells.filter((cell) => projectionType === null || cell.projection_type === projectionType),
          coverage,
        });
      }
    }

    const series = new Map<string, TrendSeries>();
    const cellOf = new Map<string, SummaryCell>();
    for (const [campaignId, { cells }] of served) {
      for (const cell of cells) {
        const key = `${cell.projection_type}|${cell.product_ref}|${cell.base_unit}`;
        cellOf.set(`${campaignId}#${key}`, cell);
        if (!series.has(key)) {
          series.set(key, {
            projection_type: cell.projection_type,
            product_ref: cell.product_ref,
            product_name: cell.product_name,
            base_unit: cell.base_unit,
            presentation_unit: cell.presentation_unit,
            points: [],
          });
        }
      }
    }
    for (const [key, line] of series) {
      line.points = campaigns.map((campaign) => {
        if (!sealOf.has(campaign.id)) return { campaign_ref: campaign.id, status: "NOT_SEALED", ...EMPTY };
        const cell = cellOf.get(`${campaign.id}#${key}`);
        if (!cell) return { campaign_ref: campaign.id, status: "NO_DATA", ...EMPTY };
        if (cell.status !== "DISCLOSED") return { campaign_ref: campaign.id, status: cell.status, ...EMPTY };
        return {
          campaign_ref: campaign.id,
          status: cell.status,
          total_base: cell.total_base,
          total_presentation: cell.total_presentation,
          contributors: cell.contributors,
          data_as_of: cell.data_as_of,
          pending_changes: cell.pending_changes,
        };
      });
    }

    return {
      contractVersion: 1,
      disclosure: authorized
        ? { mode: "PROVISIONAL_SYNTHETIC", policy: "F07-POL-01", approved: false, threshold: PROVISIONAL_THRESHOLD }
        : { mode: "POLICY_PENDING", policy: "F07-POL-01", approved: false, threshold: null },
      projection_type: projectionType,
      campaigns: campaigns.map((campaign) => {
        const seal = sealOf.get(campaign.id);
        return {
          campaign_ref: campaign.id,
          name: campaign.name,
          status: campaign.status,
          start_date: campaign.startDate.toISOString(),
          seal: seal ? toSealRef(seal) : null,
          coverage: served.get(campaign.id)?.coverage ?? null,
        };
      }),
      series: [...series.values()].sort(
        (a, b) =>
          a.projection_type.localeCompare(b.projection_type) ||
          a.product_name.localeCompare(b.product_name) ||
          a.product_ref.localeCompare(b.product_ref) ||
          a.base_unit.localeCompare(b.base_unit),
      ),
      notice: TRENDS_NOTICE,
    };
  }
}

/** The same trends as CSV: the same states and figures, nothing more. */
export function trendsCsv(trends: CollectiveTrends): string {
  const row = (values: (string | number | boolean | null)[]) => values.map(csvField).join(",");
  const campaignOf = new Map(trends.campaigns.map((campaign) => [campaign.campaign_ref, campaign]));
  const lines = [
    row(["disclosure", "policy", "approved", "threshold", "projection_type"]),
    row([trends.disclosure.mode, trends.disclosure.policy, trends.disclosure.approved, trends.disclosure.threshold, trends.projection_type]),
    row(["notice", trends.notice]),
    "",
    row(["campaign_ref", "campaign", "campaign_status", "start_date", "seal_ref", "seal_version", "sealed_at", "linked_members", "members_with_contribution", "suppressed_cells"]),
    ...trends.campaigns.map((campaign) =>
      row([
        campaign.campaign_ref,
        campaign.name,
        campaign.status,
        campaign.start_date,
        campaign.seal?.seal_ref ?? null,
        campaign.seal?.version ?? null,
        campaign.seal?.sealed_at ?? null,
        campaign.coverage?.linked_members ?? null,
        campaign.coverage?.members_with_contribution ?? null,
        campaign.coverage?.suppressed_cells ?? null,
      ]),
    ),
    "",
    row(["projection_type", "product_ref", "product_name", "base_unit", "presentation_unit", "campaign_ref", "campaign", "seal_ref", "status", "total_base", "total_presentation", "contributors", "data_as_of", "pending_changes"]),
    ...trends.series.flatMap((line) =>
      line.points.map((point) =>
        row([
          line.projection_type,
          line.product_ref,
          line.product_name,
          line.base_unit,
          line.presentation_unit,
          point.campaign_ref,
          campaignOf.get(point.campaign_ref)?.name ?? null,
          campaignOf.get(point.campaign_ref)?.seal?.seal_ref ?? null,
          point.status,
          point.total_base,
          point.total_presentation,
          point.contributors,
          point.data_as_of,
          point.pending_changes,
        ]),
      ),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
