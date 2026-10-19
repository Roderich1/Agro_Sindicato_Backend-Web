import type { Prisma, PrismaClient } from "@prisma/client";
import type { BackupStorage } from "../domain/backup-storage.port";

/**
 * F08-BKP-06 (#40): purge of the bytes of retired, deleted and failed
 * copies (`docs/architecture/F08_BKP_06_RETENCION.md` §6).
 *
 * A row with `purgePending` is DELETED or FAILED (a CHECK forbids it on any
 * other status), and both are terminal: no purge can ever reach an AVAILABLE
 * copy. The flag is cleared only after the storage confirms that no byte of
 * the key remains (`remove`, and `discardStaged` first for a FAILED upload).
 * Every step is idempotent: two processes may reconcile the same row.
 */
export type PurgeReason = "OWNER" | "RETENTION" | "FAILED";

export interface PurgeReport {
  /** Rows still pending, by reason, before this run. */
  pending: Record<PurgeReason, number>;
  /** Rows whose purge the storage confirmed in this run. */
  confirmed: number;
  /** Rows whose purge failed again; they stay pending. */
  failed: number;
}

type Metadata = Pick<PrismaClient, "backupMetadata">;

export function reasonOf(row: { status: string; deletionReason: string | null }): PurgeReason {
  if (row.status === "FAILED") return "FAILED";
  return row.deletionReason === "RETENTION" ? "RETENTION" : "OWNER";
}

/**
 * Retries the purge of the pending rows that match `where` (an owner, some
 * ids, or every row). Without `apply` it only counts them. Never throws for a
 * storage failure: the row simply stays pending.
 */
export async function purgePending(
  prisma: Metadata,
  storage: BackupStorage,
  where: Prisma.BackupMetadataWhereInput,
  apply = true,
): Promise<PurgeReport> {
  const rows = await prisma.backupMetadata.findMany({
    where: { ...where, purgePending: true, status: { in: ["DELETED", "FAILED"] } },
    select: { id: true, storageKey: true, status: true, deletionReason: true },
  });
  const report: PurgeReport = {
    pending: { OWNER: 0, RETENTION: 0, FAILED: 0 },
    confirmed: 0,
    failed: 0,
  };
  for (const row of rows) report.pending[reasonOf(row)] += 1;
  if (!apply) return report;
  for (const row of rows) {
    try {
      if (row.status === "FAILED") await storage.discardStaged(row.storageKey);
      await storage.remove(row.storageKey);
    } catch {
      report.failed += 1;
      continue;
    }
    const cleared = await prisma.backupMetadata.updateMany({
      where: { id: row.id, status: row.status, purgePending: true },
      data: { purgePending: false },
    });
    report.confirmed += cleared.count;
  }
  return report;
}
