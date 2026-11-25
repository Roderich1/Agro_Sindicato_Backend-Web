import { Prisma } from "@prisma/client";
import { CallHttpError, FarmerContext } from "../../domain/call-error";
import { notOpenReason } from "../../domain/call-state";
import { CONSENT_HELP, CONSENT_TEXT } from "../../domain/consent";
import {
  FarmerCallViewV4,
  FarmerConsentV4,
  iso,
  ParticipationView,
  ParticipationViewV4,
  presentationUnit,
  toParticipationView,
} from "../call-views";

/**
 * E2-P2 (§10.1): presentation filter of the default view. Closed or cancelled
 * calls the farmer took part in that ended within this many days are
 * «recientes»; older ones are served by `history`. Nothing is deleted.
 */
export const RECENT_FINISHED_DAYS = 180;
export const HISTORY_PAGE_DEFAULT = 20;
export const HISTORY_PAGE_MAX = 50;

export interface AcceptedResponse {
  outcome: "ACCEPTED";
  participation: ParticipationView | null;
}

/**
 * E4 §7: the contract the phone declared (`X-Joint-Purchase-Contract`).
 */
export type FarmerContract = 1 | 2 | 3 | 4;

/** E4 §4.1: the consent every read serves. */
export const FARMER_CONSENT: FarmerConsentV4 = {
  version: "CONV-4",
  text: CONSENT_TEXT,
  help: CONSENT_HELP,
};

/** What the journal keeps for an operation decided under the lock. */
export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

export const PARTICIPATION_INCLUDE = {
  lines: { select: { productId: true, baseUnit: true, quantityBase: true } },
} as const;

export type CurrentParticipation = Prisma.JointPurchaseParticipationGetPayload<{
  include: typeof PARTICIPATION_INCLUDE;
}>;

const DAY_MS = 24 * 3600 * 1000;

export function recentSince(now: Date): Date {
  return new Date(now.getTime() - RECENT_FINISHED_DAYS * DAY_MS);
}

/** Finished calls of the farmer that ended before the recent window (`history`). */
export function olderWhere(context: FarmerContext, since: Date): Prisma.JointPurchaseCallWhereInput {
  return {
    tenantId: context.tenantId,
    participations: { some: { memberId: context.memberId } },
    OR: [
      { status: "CLOSED", closedAt: { lt: since } },
      { status: "CANCELLED", cancelledAt: { lt: since } },
    ],
  };
}

export function farmerCallInclude(memberId: string) {
  return {
    campaign: { select: { id: true, name: true } },
    responsible: { select: { name: true } },
    products: { orderBy: { position: "asc" as const }, include: { product: { select: { name: true } } } },
    participations: { where: { memberId }, include: PARTICIPATION_INCLUDE },
    closing: {
      select: {
        cutoffAt: true,
        closedAt: true,
        participants: { where: { memberId }, include: { lines: true } },
      },
    },
  } satisfies Prisma.JointPurchaseCallInclude;
}

export type FarmerCallRow = Prisma.JointPurchaseCallGetPayload<{
  include: ReturnType<typeof farmerCallInclude>;
}>;

/** One call as the farmer sees it (contract 4): never another farmer's data. */
export function toFarmerCallView(row: FarmerCallRow, now: Date): FarmerCallViewV4 {
  const baseOf = new Map(row.products.map((p) => [p.productId, p.baseUnit]));
  const own = row.closing?.participants[0] ?? null;
  return {
    call_id: row.id,
    name: row.name,
    status: row.status as FarmerCallViewV4["status"],
    campaign: { campaign_ref: row.campaign.id, name: row.campaign.name },
    opened_at: iso(row.openedAt),
    deadline_at: row.deadlineAt.toISOString(),
    closed_at: iso(row.closedAt),
    cancelled_at: iso(row.cancelledAt),
    server_time: now.toISOString(),
    accepts_operations: notOpenReason(row, now) === null,
    responsible: { name: row.responsible.name },
    products: row.products.map((p) => ({
      product_ref: p.productId,
      name: p.product.name,
      unit: presentationUnit(p.baseUnit),
      base_unit: p.baseUnit,
    })),
    participation: toParticipationView(row.participations[0] ?? null) as ParticipationViewV4 | null,
    closing: row.closing
      ? {
          cutoff_at: row.closing.cutoffAt.toISOString(),
          closed_at: row.closing.closedAt.toISOString(),
          included: own !== null,
          lines: own
            ? [...own.lines]
                .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
                .map((line) => ({
                  product_ref: line.productId,
                  base_unit: baseOf.get(line.productId) ?? "ML",
                  quantity_base: line.quantityBase.toString(),
                }))
            : [],
        }
      : null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function encodeHistoryCursor(endedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify(["E2H1", endedAt.toISOString(), id]), "utf8").toString("base64url");
}

/** A cursor this route did not issue is a bad request, never a silent first page. */
export function decodeHistoryCursor(cursor: string): { endedAt: Date; id: string } {
  let parsed: unknown = null;
  if (/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) {
    try {
      parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    } catch {
      parsed = null;
    }
  }
  if (
    Array.isArray(parsed) &&
    parsed.length === 3 &&
    parsed[0] === "E2H1" &&
    typeof parsed[1] === "string" &&
    typeof parsed[2] === "string" &&
    UUID.test(parsed[2])
  ) {
    const endedAt = new Date(parsed[1]);
    if (!Number.isNaN(endedAt.getTime()) && endedAt.toISOString() === parsed[1]) return { endedAt, id: parsed[2] };
  }
  throw new CallHttpError(400, "PAYLOAD_INVALID");
}
