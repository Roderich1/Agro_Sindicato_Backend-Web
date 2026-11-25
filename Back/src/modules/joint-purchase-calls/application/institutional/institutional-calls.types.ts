import { Logger } from "@nestjs/common";
import { JointPurchaseCallStatus, SyncV1BaseUnit } from "@prisma/client";
import { CollectiveConfig } from "@/modules/collective/application/collective-config";
import { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import { CallHttpError } from "../../domain/call-error";
import { ParticipationForVisibility } from "../../domain/visibility";
import { CallClosingService } from "../call-closing.service";
import { ACCESS_PARTICIPANTS, CALL_GRANTS, CallGrant } from "../call-store";
import { HistoryEntryView } from "../call-views";
import { Clock } from "../clock";

export const NAME_MAX = 120;
export const REASON_MAX = 280;
export const MAX_PRODUCTS = 50;

export const DRAFT_CAMPAIGN = new Set(["PLANIFICADA", "ABIERTA"]);
export const OPEN_CAMPAIGN = new Set(["ABIERTA"]);

/** E4 §3.1: the opening grants nothing (the detail is consulted by role). Earlier events keep their text. */
export const OPENED_DETAIL = "Convocatoria abierta.";

export interface DraftCommand {
  campaign_id: string;
  name: string;
  deadline_at: string;
  responsible_user_id: string;
  products: { product_ref: string }[];
  source_proposal_id?: string | null;
}

export type PatchCommand = Partial<Omit<DraftCommand, "campaign_id">>;

export interface ConfirmCommand {
  confirmed?: unknown;
}

export interface CancelCommand extends ConfirmCommand {
  reason?: unknown;
}

export interface GrantCommand {
  user_ref?: unknown;
  grant?: unknown;
  confirmed?: unknown;
}

export interface ListFilter {
  campaignId?: string;
  status?: JointPurchaseCallStatus;
}

export const NOT_FOUND = () => new CallHttpError(404, "CALL_NOT_FOUND");
export const INVALID = () => new CallHttpError(400, "PAYLOAD_INVALID");

export interface ResolvedProduct {
  productId: string;
  baseUnit: SyncV1BaseUnit;
  sourceProposalId: string | null;
  sourcePosition: number | null;
}

export interface ProductTotals {
  total: bigint;
  count: number;
  participations: ParticipationForVisibility[];
}

export interface CallTotals {
  source: "NONE" | "LIVE" | "CLOSING";
  participantCount: number;
  /** Every participation counted (live: ACTIVE; closing: frozen), for the counts of §12. */
  all: ParticipationForVisibility[];
  byProduct: Map<string, ProductTotals>;
}

export interface InstitutionalCallDeps {
  readonly prisma: PrismaService;
  readonly collective: CollectiveConfig;
  readonly closing: CallClosingService;
  readonly clock: Clock;
  readonly logger: Logger;
}

export function parseGrant(command: GrantCommand): { userRef: string; grant: CallGrant } {
  const userRef = command.user_ref;
  const grant = command.grant;
  if (typeof userRef !== "string" || userRef.length < 1 || userRef.length > 64) throw INVALID();
  if (typeof grant !== "string" || !(CALL_GRANTS as readonly string[]).includes(grant)) throw INVALID();
  return { userRef, grant: grant as CallGrant };
}

/** E4 §3.1: the view permission is retired from every active flow (grant, revoke, review). */
export function requireNotRetired(command: { grant?: unknown }) {
  if (command.grant === ACCESS_PARTICIPANTS) throw new CallHttpError(409, "GRANT_RETIRED");
}

export function requireConfirmed(confirmed: unknown) {
  if (confirmed !== true) throw new CallHttpError(422, "CONFIRMATION_REQUIRED");
}

export function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") throw INVALID();
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) throw INVALID();
  return name;
}

export function parseDeadline(raw: unknown): Date {
  if (typeof raw !== "string") throw INVALID();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw INVALID();
  return date;
}

export function truncate(text: string): string {
  return text.length <= REASON_MAX ? text : `${text.slice(0, REASON_MAX - 1)}…`;
}

const KIND_ORDER = [
  "CREATED",
  "RESPONSIBLE_ASSIGNED",
  "UPDATED",
  "ACCESS_GRANTED",
  "ACCESS_REVOKED",
  "OPENED",
  "RESPONSIBLE_REPLACED",
  "ACCESS_CONFIRMED",
  "CLOSED",
  "CANCELLED",
];

export function sortHistory(entries: HistoryEntryView[]): HistoryEntryView[] {
  return [...entries].sort((a, b) =>
    a.at === b.at ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) : a.at < b.at ? -1 : 1,
  );
}

/** Same products, in any order (product refs are unique within a call). */
export function sameProducts(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((ref) => set.has(ref));
}
