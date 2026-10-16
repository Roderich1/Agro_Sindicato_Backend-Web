import { Injectable } from "@nestjs/common";
import type { SyncV1ContributionStatus } from "@prisma/client";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { ackFromJournal, SyncV1Ack } from "../domain/ack";
import { UUID_V4 } from "../domain/envelope";
import { PrismaSyncV1JournalRepository } from "../infrastructure/prisma-sync-v1-journal.repository";
import { SyncV1Context, SyncV1HttpError } from "./sync-v1-http-error";

/** Exactly `{ack, contribution}`; contribution has exactly three keys (§9). */
export interface SyncV1OperationView {
  ack: SyncV1Ack;
  contribution: {
    status: SyncV1ContributionStatus;
    headOperationId: string | null;
    reconciliationReference: string | null;
  } | null;
}

/**
 * Owner-scoped lookup on the authoritative store (contract §9). Searches by
 * tenant, Member and operationId only: another owner's or an unknown ID is
 * the same 404. No quantity or payload is ever returned.
 */
@Injectable()
export class GetOperationUseCase {
  private readonly journal: PrismaSyncV1JournalRepository;

  constructor(private readonly prisma: PrismaService) {
    this.journal = new PrismaSyncV1JournalRepository(prisma);
  }

  async execute(
    context: SyncV1Context,
    operationId: string,
  ): Promise<SyncV1OperationView> {
    if (!UUID_V4.test(operationId))
      throw new SyncV1HttpError(400, "INVALID_REQUEST");
    const journal = await this.journal.findByIdentity({
      tenantId: context.tenantId,
      memberId: context.memberId,
      operationId,
    });
    if (!journal) throw new SyncV1HttpError(404, "OPERATION_NOT_FOUND");
    if (journal.contractVersion !== 1)
      throw new SyncV1HttpError(422, "CONTRACT_VERSION_MISMATCH");
    const ack = ackFromJournal(journal);
    if (journal.processingState !== "FINAL" || !journal.contributionId)
      return { ack, contribution: null };
    const contribution = await this.prisma.syncV1Contribution.findFirst({
      where: {
        id: journal.contributionId,
        tenantId: context.tenantId,
        memberId: context.memberId,
      },
      select: {
        status: true,
        headOperationId: true,
        reconciliationReference: true,
      },
    });
    return { ack, contribution: contribution ?? null };
  }
}
