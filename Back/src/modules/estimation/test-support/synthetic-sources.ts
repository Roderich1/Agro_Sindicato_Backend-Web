import type { PrismaClient, SyncV1BaseUnit } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * Synthetic estimation sources for PostgreSQL tests (F12-EST-01; for
 * F12-EST-02 to F12-EST-04). Only synthetic data: no real campaign, Member or
 * figure.
 *
 * Each campaign is CERRADA, has one published CONSUMPTION_TOTAL figure of the
 * product and a version 1 seal whose entry discloses it, so it is a valid
 * source of a verified point (EST-D-03).
 *
 * - Without `coverage`: a seal as written before the consumption coverage
 *   existed (unknown coverage). Only possible on a base before
 *   20261102020000_f07_seal_consumption_coverage, which requires the coverage
 *   of every new seal at commit.
 * - With `coverage`: a seal written after it, with its participation coverage
 *   (F07 §5.3) in the same transaction.
 */
export interface SyntheticSourceOptions {
  tenantId: string;
  sealedByUserId: string;
  canonicalProductId: string;
  baseUnit: SyncV1BaseUnit;
  /** Year of the first campaign; one campaign per year, in order. */
  firstYear: number;
  /** Published figure of each campaign, in the base unit (0 is a verified zero). */
  quantities: bigint[];
  namePrefix: string;
  linkedMembers?: number;
  /** Members of each figure (3 by default, the provisional k). */
  contributors?: number;
  /**
   * Coverage written with the seal. With one consumption figure per campaign,
   * an IDENTIFIED N cannot exceed `contributors`.
   */
  coverage?: { status: "IDENTIFIED"; membersInPublishedFigures: number } | { status: "POPULATION_MISMATCH" };
  /** E4 §4.4: the policy of the seals (F07-POL-01 with threshold 3 by default; F07-POL-02 with threshold NULL). */
  policy?: "F07-POL-01" | "F07-POL-02";
}

export interface SyntheticSource {
  campaignId: string;
  releaseId: string;
  sealId: string;
  quantityBase: bigint;
}

export async function sealedConsumptionCampaigns(db: PrismaClient, options: SyntheticSourceOptions): Promise<SyntheticSource[]> {
  const linkedMembers = options.linkedMembers ?? 5;
  const contributors = options.contributors ?? 3;
  if (options.coverage?.status === "IDENTIFIED" && options.coverage.membersInPublishedFigures > contributors) {
    throw new Error("Synthetic coverage: N exceeds the Members of the only consumption figure");
  }
  const sources: SyntheticSource[] = [];
  for (const [index, quantityBase] of options.quantities.entries()) {
    const year = options.firstYear + index;
    const campaignId = randomUUID();
    await db.agriculturalCampaign.create({
      data: {
        id: campaignId, tenantId: options.tenantId, name: `${options.namePrefix} ${year}`, status: "CERRADA", isActive: false,
        startDate: new Date(`${year}-09-01T00:00:00.000Z`), closedAt: new Date(`${year + 1}-03-01T00:00:00.000Z`),
      },
    });
    const release = await db.collectiveRelease.create({
      data: {
        tenantId: options.tenantId, campaignId, canonicalProductId: options.canonicalProductId, projectionType: "CONSUMPTION_TOTAL",
        baseUnit: options.baseUnit, totalBase: quantityBase, contributorCount: contributors,
        ...(options.policy ? { policy: options.policy } : {}),
      },
    });
    const coverage = options.coverage;
    const seal = await db.collectiveSeal.create({
      data: {
        tenantId: options.tenantId, campaignId, sealedAt: new Date(), sealedByUserId: options.sealedByUserId, sealedByRole: "DIRECTIVA",
        disclosureMode: "PROVISIONAL_SYNTHETIC",
        policy: options.policy ?? "F07-POL-01",
        threshold: options.policy === "F07-POL-02" ? null : 3,
        linkedMembers,
        membersWithContribution: 3,
        suppressedCells: false, openDisputes: false, reviewRef: "b".repeat(64),
        entries: {
          create: [{ projectionType: "CONSUMPTION_TOTAL", canonicalProductId: options.canonicalProductId, baseUnit: options.baseUnit, status: "DISCLOSED", releaseId: release.id }],
        },
        ...(coverage
          ? {
              consumptionCoverage: {
                create:
                  coverage.status === "IDENTIFIED"
                    ? { status: "IDENTIFIED", linkedMembers, membersInPublishedFigures: coverage.membersInPublishedFigures }
                    : { status: "POPULATION_MISMATCH" },
              },
            }
          : {}),
      },
    });
    sources.push({ campaignId, releaseId: release.id, sealId: seal.id, quantityBase });
  }
  return sources;
}
