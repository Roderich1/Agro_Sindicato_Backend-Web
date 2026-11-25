import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { cellId, CellKey, EligibleContribution } from "../../domain/consolidation";
import { PriorRelease } from "../../domain/disclosure-policy";
import { toSealRef } from "./collective-summary.formatters";
import {
  SEALED_VERSION_INCLUDE,
  SealedVersion,
  SealRef,
  Tx,
} from "./collective-summary.types";

export async function findLatestSealRef(
  db: Tx | PrismaService,
  tenantId: string,
  campaignId: string,
): Promise<SealRef | null> {
  const seal = await db.collectiveSeal.findFirst({
    where: { tenantId, campaignId },
    orderBy: { version: "desc" },
    include: { sealedBy: { select: { id: true, name: true } } },
  });
  return seal ? toSealRef(seal) : null;
}

export async function loadSealedVersion(
  tx: Tx,
  tenantId: string,
  campaignId: string,
): Promise<SealedVersion | null> {
  return tx.collectiveSeal.findFirst({
    where: { tenantId, campaignId },
    orderBy: { version: "desc" },
    include: SEALED_VERSION_INCLUDE,
  });
}

/**
 * ACTIVE contributions with a quantity, from active farmers with active
 * accounts: the same scope as `linkedMembers`, the coverage denominator.
 * F10-SEC-02 M5 (#45): a Member that stops being AGRICULTOR leaves the figures.
 */
export async function fetchEligibleContributions(
  tx: Tx,
  tenantId: string,
  campaignId: string,
): Promise<EligibleContribution[]> {
  const rows = await tx.syncV1Contribution.findMany({
    where: {
      tenantId,
      campaignId,
      status: "ACTIVE",
      quantityBase: { not: null },
      member: { role: "AGRICULTOR", isActive: true, user: { isActive: true } },
    },
    select: {
      id: true,
      memberId: true,
      projectionType: true,
      productId: true,
      baseUnit: true,
      quantityBase: true,
      lastSequence: true,
      acceptedAt: true,
    },
  });
  return rows.map((row) => ({
    contributionId: row.id,
    memberId: row.memberId,
    projectionType: row.projectionType,
    productId: row.productId,
    baseUnit: row.baseUnit,
    quantityBase: row.quantityBase!,
    sequence: row.lastSequence,
    acceptedAt: row.acceptedAt,
  }));
}

/** Current associations only: corrections never rewrite earlier rows. */
export async function fetchCanonicalMap(
  tx: Tx,
  tenantId: string,
): Promise<Map<string, string>> {
  const rows = await tx.productCanonicalAssociation.findMany({
    where: { tenantId, validTo: null },
    select: { productId: true, canonicalProductId: true },
  });
  return new Map(rows.map((row) => [row.productId, row.canonicalProductId]));
}

/** Every disclosure of each cell, newest first (withdrawn ones included). */
export async function fetchReleaseHistories(
  tx: Tx,
  tenantId: string,
  campaignId: string,
): Promise<Map<string, { key: CellKey; history: PriorRelease[] }>> {
  const releases = await tx.collectiveRelease.findMany({
    where: { tenantId, campaignId },
    orderBy: [{ releasedAt: "desc" }, { id: "desc" }],
    include: { items: { include: { contribution: { select: { memberId: true } } } } },
  });
  const histories = new Map<string, { key: CellKey; history: PriorRelease[] }>();
  for (const release of releases) {
    const key: CellKey = {
      projectionType: release.projectionType,
      canonicalProductId: release.canonicalProductId,
      baseUnit: release.baseUnit,
    };
    const entry = histories.get(cellId(key)) ?? { key, history: [] };
    histories.set(cellId(key), entry);
    entry.history.push({
      id: release.id,
      totalBase: release.totalBase,
      contributorCount: release.contributorCount,
      dataAsOf: release.dataAsOf,
      releasedAt: release.releasedAt,
      withdrawnAt: release.withdrawnAt,
      items: new Map(release.items.map((item) => [item.contributionId, item.quantityBase])),
      memberOf: new Map(release.items.map((item) => [item.contributionId, item.contribution.memberId])),
    });
  }
  return histories;
}

export async function fetchProductNames(
  tx: Tx,
  ids: string[],
): Promise<Map<string, string>> {
  const rows = await tx.product.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Active farmers of the tenant: who could contribute (coverage). */
export async function fetchLinkedMembers(
  tx: Tx,
  tenantId: string,
): Promise<Set<string>> {
  const rows = await tx.member.findMany({
    where: { tenantId, role: "AGRICULTOR", isActive: true, user: { isActive: true } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
