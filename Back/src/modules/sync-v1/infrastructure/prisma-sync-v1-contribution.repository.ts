import {
  Prisma,
  SyncV1BaseUnit,
  SyncV1Contribution,
  SyncV1ProjectionType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { PredecessorInfo } from "../domain/causal-decision";

export interface ContributionKey {
  tenantId: string;
  memberId: string;
  projectionType: SyncV1ProjectionType;
  campaignId: string;
  productId: string;
  baseUnit: SyncV1BaseUnit;
}

/**
 * R_CURRENT contribution store (contract §6, §10). Every transition of one
 * contribution runs under its row lock, so two intentions that continue the
 * same head are decided one after the other and never both accepted.
 */
export class PrismaSyncV1ContributionRepository {
  /** Creates the NEVER_PUBLISHED row if absent and locks it until commit. */
  async lockOrCreate(
    tx: Prisma.TransactionClient,
    key: ContributionKey,
  ): Promise<SyncV1Contribution> {
    await tx.syncV1Contribution.createMany({
      data: { id: randomUUID(), ...key },
      skipDuplicates: true,
    });
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "SyncV1Contribution"
      WHERE "tenantId" = ${key.tenantId}
        AND "memberId" = ${key.memberId}
        AND "projectionType" = ${key.projectionType}::"SyncV1ProjectionType"
        AND "campaignId" = ${key.campaignId}
        AND "productId" = ${key.productId}
        AND "baseUnit" = ${key.baseUnit}::"SyncV1BaseUnit"
      FOR UPDATE`;
    if (locked.length !== 1) throw new Error("Contribution lock not acquired.");
    return tx.syncV1Contribution.findUniqueOrThrow({
      where: { id: locked[0].id },
    });
  }

  /** Existing contribution, without creating or locking it. */
  find(tx: Prisma.TransactionClient, key: ContributionKey) {
    return tx.syncV1Contribution.findUnique({
      where: {
        tenantId_memberId_projectionType_campaignId_productId_baseUnit: key,
      },
    });
  }

  /**
   * Classifies the predecessor against the locked contribution. Only an
   * APPLIED transition of this same owner and contribution counts as accepted;
   * an unknown, foreign, rejected or conflicting ID does not.
   */
  async predecessorInfo(
    tx: Prisma.TransactionClient,
    owner: { tenantId: string; memberId: string },
    contribution: SyncV1Contribution,
    predecessorOperationId: string | null,
  ): Promise<PredecessorInfo> {
    if (predecessorOperationId === null) return { kind: "NONE" };
    const predecessor = await tx.syncV1OperationJournal.findUnique({
      where: {
        tenantId_memberId_operationId: {
          ...owner,
          operationId: predecessorOperationId,
        },
      },
    });
    if (
      !predecessor ||
      predecessor.outcome !== "APPLIED" ||
      predecessor.contributionId !== contribution.id ||
      predecessor.contributionSequence === null
    ) {
      return { kind: "NOT_ACCEPTED_HERE" };
    }
    const isHead = predecessorOperationId === contribution.headOperationId;
    let isParentOfHead = false;
    if (!isHead && contribution.headOperationId) {
      const head = await tx.syncV1OperationJournal.findUnique({
        where: {
          tenantId_memberId_operationId: {
            ...owner,
            operationId: contribution.headOperationId,
          },
        },
        select: { predecessorOperationId: true },
      });
      isParentOfHead = head?.predecessorOperationId === predecessorOperationId;
    }
    return {
      kind: "ACCEPTED",
      sequence: predecessor.contributionSequence,
      isHead,
      isParentOfHead,
    };
  }
}
