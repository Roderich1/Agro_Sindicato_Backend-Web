import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";

/**
 * Two states only. The server keeps evidence of accepted sends (Sync v1
 * journal, `outcome = APPLIED` with `serverAcceptedAt`), not of connections,
 * logins or attempts, so it cannot tell "never tried" from "tried and failed".
 */
export type FarmerSyncState = "WITH_ACCEPTED_SENDS" | "NO_SYNC_RECORD";

export const FARMER_SYNC_STATE_LABEL: Record<FarmerSyncState, string> = {
  WITH_ACCEPTED_SENDS: "Con envíos aceptados",
  NO_SYNC_RECORD: "Sin registro de sincronización",
};

export interface FarmerSyncStatusRow {
  display_name: string;
  state: FarmerSyncState;
  state_label: string;
  /** Server time of the latest accepted send; null when there is none. */
  last_accepted_send_at: string | null;
}

export interface FarmerSyncStatus {
  contractVersion: 1;
  /** What the date means: the source only confirms an accepted send. */
  basis: "SYNC_V1_ACCEPTED_SEND";
  date_label: "Último envío aceptado";
  generated_at: string;
  farmers: FarmerSyncStatusRow[];
}

/**
 * F07-WEB-03 (#25, 2026-11-05): linked farmers of the caller's tenant with the
 * date of their latest accepted Sync v1 send, for its DIRECTIVA and
 * ADMINISTRADOR (ADR-003). Read only.
 *
 * - "Linked" is the coverage denominator of the collective summary: active
 *   AGRICULTOR Members whose User is active (F10-SEC-02 M5).
 * - The date is `max(serverAcceptedAt)` over the Member's journal rows with
 *   `outcome = APPLIED` (F06 §5: central acceptance time). A replay
 *   (ALREADY_APPLIED) does not add a row, and CONFLICT/REJECTED rows carry no
 *   acceptance time, so neither moves the date. Logins (`User.lastLoginAt`),
 *   sessions, device `lastSeenAt`, the legacy `SyncOperation` queue and the
 *   release time of a collective figure are deliberately not used.
 * - No quantities, products, campaigns, projection types, Member/User ids or
 *   live connection state (F06 §5: the IAM listing is not joined to
 *   individual quantities).
 */
@Injectable()
export class FarmerSyncStatusUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(tenantId: string, now: Date = new Date()): Promise<FarmerSyncStatus> {
    const [members, accepted] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where: { tenantId, role: "AGRICULTOR", isActive: true, user: { isActive: true } },
        select: { id: true, user: { select: { name: true } } },
        orderBy: { id: "asc" },
      }),
      this.prisma.syncV1OperationJournal.groupBy({
        by: ["memberId"],
        where: { tenantId, outcome: "APPLIED", serverAcceptedAt: { not: null } },
        _max: { serverAcceptedAt: true },
        orderBy: { memberId: "asc" },
      }),
    ]);
    const lastAccepted = new Map(accepted.map((row) => [row.memberId, row._max?.serverAcceptedAt ?? null]));
    const farmers = members
      .map((member): FarmerSyncStatusRow => {
        const at = lastAccepted.get(member.id) ?? null;
        const state: FarmerSyncState = at ? "WITH_ACCEPTED_SENDS" : "NO_SYNC_RECORD";
        return {
          display_name: member.user.name,
          state,
          state_label: FARMER_SYNC_STATE_LABEL[state],
          last_accepted_send_at: at ? at.toISOString() : null,
        };
      })
      // By name, never by date: the order must not add information.
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "es", { sensitivity: "base" }));
    return {
      contractVersion: 1,
      basis: "SYNC_V1_ACCEPTED_SEND",
      date_label: "Último envío aceptado",
      generated_at: now.toISOString(),
      farmers,
    };
  }
}
