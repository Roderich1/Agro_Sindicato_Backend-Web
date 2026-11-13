import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallOriginKind,
  JointPurchaseCallStatus,
  JointPurchaseParticipationStatus,
  SyncV1BaseUnit,
  UserRole,
} from "@prisma/client";
import { ParticipationScope } from "../domain/consent";
import { ProductTotalView } from "../domain/visibility";

export type PresentationUnit = "L" | "KG";

export function presentationUnit(baseUnit: SyncV1BaseUnit): PresentationUnit {
  return baseUnit === "ML" ? "L" : "KG";
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

// ---------------------------------------------------------------- farmer views

export interface ParticipationLineView {
  product_ref: string;
  base_unit: SyncV1BaseUnit;
  quantity_base: string;
}

/** The farmer's own participation as the server accepted it (E2-D8, E2-D10). */
export interface ParticipationView {
  status: JointPurchaseParticipationStatus;
  lines: ParticipationLineView[];
  last_sequence: number;
  last_operation_id: string;
  accepted_at: string;
  /** The text accepted when the participation was first confirmed (never rewritten). */
  consent: { version: string; accepted_at: string; received_at: string };
  /**
   * §10.6 (P-C): the scope in force and the decision that set it (`sequence`
   * 0 = the first acceptance). Only in contract 2: `toLegacyFarmerBody`
   * removes it for phones that do not ask for it.
   */
  consent_scope?: { scope: ParticipationScope; version: string; decided_at: string; received_at: string; sequence: number };
  /**
   * P-A C1 (§12, contract 3 only): whether the farmer authorized the call's
   * CURRENT responsible (`authorized`) and which responsible version the
   * farmer's authorization covers (`version`, null if none). Filled by the
   * caller, which knows the call; removed for contracts 1 and 2.
   */
  responsible_authorization?: { authorized: boolean; version: number | null };
}

export interface ParticipationRow {
  status: JointPurchaseParticipationStatus;
  lastSequence: number;
  lastOperationId: string;
  acceptedAt: Date;
  consentVersion: string;
  consentAcceptedAt: Date;
  consentReceivedAt: Date;
  consentScope: ParticipationScope;
  consentScopeVersion: string;
  consentScopeDecidedAt: Date;
  consentScopeReceivedAt: Date;
  consentScopeSequence: number;
  consentResponsibleVersion: number | null;
  lines: { productId: string; baseUnit: SyncV1BaseUnit; quantityBase: bigint }[];
}

/**
 * The farmer's own participation. `responsibleVersion` is the call's current
 * one (P-A C1); without it the view carries no authorization (callers that
 * answer an operation always pass it).
 */
export function toParticipationView(row: ParticipationRow | null, responsibleVersion?: number): ParticipationView | null {
  if (!row) return null;
  return {
    status: row.status,
    lines: [...row.lines]
      .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
      .map((line) => ({
        product_ref: line.productId,
        base_unit: line.baseUnit,
        quantity_base: line.quantityBase.toString(),
      })),
    last_sequence: row.lastSequence,
    last_operation_id: row.lastOperationId,
    accepted_at: row.acceptedAt.toISOString(),
    consent: {
      version: row.consentVersion,
      accepted_at: row.consentAcceptedAt.toISOString(),
      received_at: row.consentReceivedAt.toISOString(),
    },
    consent_scope: {
      scope: row.consentScope,
      version: row.consentScopeVersion,
      decided_at: row.consentScopeDecidedAt.toISOString(),
      received_at: row.consentScopeReceivedAt.toISOString(),
      sequence: row.consentScopeSequence,
    },
    ...(responsibleVersion !== undefined
      ? {
          responsible_authorization: {
            authorized: row.consentResponsibleVersion === responsibleVersion,
            version: row.consentResponsibleVersion,
          },
        }
      : {}),
  };
}

export interface CallProductView {
  product_ref: string;
  name: string;
  unit: PresentationUnit;
  base_unit: SyncV1BaseUnit;
}

export interface FarmerClosingView {
  cutoff_at: string;
  closed_at: string;
  /** False: «no incluida» (no active participation with lines at the cutoff). */
  included: boolean;
  lines: ParticipationLineView[];
}

// ---------------------------------------------------------- institutional views

export interface UserRefView {
  user_ref: string;
  name: string;
}

export interface CallSummaryView {
  call_id: string;
  name: string;
  status: JointPurchaseCallStatus;
  campaign: { campaign_ref: string; name: string };
  deadline_at: string;
  opened_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  responsible: UserRefView;
  product_count: number;
  participant_count: number;
}

export interface ProposalReferenceView {
  proposal_ref: string;
  position: number;
  /** DISCLOSED: figure disclosed in the draft and still served; NO_FIGURE: «sin cifra». */
  status: "DISCLOSED" | "NO_FIGURE";
  label: string;
  quantity_base: string | null;
  contributors: number | null;
  released_at: string | null;
}

export interface HistoryEntryView {
  at: string;
  kind: JointPurchaseCallEventKind;
  actor: UserRefView | null;
  detail: string | null;
}

export interface CallOriginProductView {
  position: number;
  product_ref: string;
  product_name: string;
  base_unit: SyncV1BaseUnit;
  /** Line of the source draft the product came from; null if it did not come from a line. */
  proposal_position: number | null;
}

/**
 * E3-P2: the products and their provenance as the call was created, written
 * once in the creating transaction and never changed. Never a quantity, a
 * disclosed figure, a contributor, an identity of a farmer or an estimate.
 */
export interface CallOriginView {
  kind: JointPurchaseCallOriginKind;
  proposal_ref: string | null;
  /** When that draft was generated (drafts are immutable); null in CATALOG. */
  proposal_generated_at: string | null;
  /**
   * Fingerprint of the draft when the call was created. Served under the
   * rule of the call's figures (E2-D14): null when disclosure is not
   * authorized or a disclosed figure of that draft has been withdrawn, so it
   * cannot be used to test candidate values of a figure no longer served.
   */
  proposal_fingerprint: string | null;
  /** Revision of the draft's saved selection then; null if none was ever saved (or CATALOG). */
  selection_revision: number | null;
  /** The call's products then were exactly those of that selection (any order); null without one. */
  selection_matched: boolean | null;
  recorded_at: string;
  recorded_by: UserRefView;
  products: CallOriginProductView[];
}

export interface ResponsibleChangeView {
  version: number;
  at: string;
  previous: UserRefView;
  next: UserRefView;
  actor: UserRefView;
  reason: string;
  call_status: JointPurchaseCallStatus;
  suspended_delegations: number;
}

export interface ParticipantView {
  participation_ref: string;
  name: string;
  status: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: (ParticipationLineView & { product_name: string })[];
}

export interface ClosingParticipantView {
  participation_ref: string;
  name: string;
  accepted_at: string;
  lines: (ParticipationLineView & { product_name: string })[];
}

export const GRANT_LABEL: Record<"PARTICIPANTS" | "MANAGE", string> = {
  PARTICIPANTS: "Consultar participantes y cantidades",
  MANAGE: "Administrar la convocatoria",
};

// =====================================================================
// E4 (2026-11-13): access by role and totals without a farmer threshold.
// Institutional contract v2 and farmer contract 4. Examples of every
// answer: docs/architecture/E4_EJEMPLOS_RESPUESTAS.md.
// =====================================================================

/** E4 §5.2: the totals of a product as rule T decides them (`domain/visibility.ts`). */
export type ProductTotalViewV2 = ProductTotalView;
export type { TotalVisibility as TotalVisibilityV2, TotalsBasis } from "../domain/visibility";

export interface InstitutionalCallProductViewV2 extends CallProductView {
  position: number;
  is_active: boolean;
  reference: ProposalReferenceView | null;
  totals: ProductTotalViewV2;
}

/**
 * E4 §3.1: `GET /joint-purchase-calls/{id}` (and the answers of create,
 * patch, open, cancel and substitute). Withdrawn: `totals_threshold`,
 * `has_substitution_permission`, `pending_authorization_count`.
 */
export interface CallDetailViewV2 {
  contractVersion: 2;
  call_id: string;
  name: string;
  status: JointPurchaseCallStatus;
  campaign: { campaign_ref: string; name: string; status: string };
  deadline_at: string;
  opened_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  server_time: string;
  /** Who coordinates. Being the responsible gives no access to identified data (E4 §6.1). */
  responsible: UserRefView & { role: UserRole | null; eligible: boolean; version: number };
  created_by: UserRefView;
  opened_by: UserRefView | null;
  cancelled_by: UserRefView | null;
  source_proposal_ref: string | null;
  participant_count: number;
  /** LIVE (provisional, OPEN/CANCELLED), CLOSING (consolidated) or NONE (draft). */
  totals_source: "NONE" | "LIVE" | "CLOSING";
  /** E4 §2: this user is an eligible ADMINISTRADOR of the tenant now (read at this request). */
  can_view_participants: boolean;
  is_responsible: boolean;
  /** The responsible or a MANAGE in force (edit the draft, open, cancel, close). */
  can_manage: boolean;
  /** Equal to can_manage. */
  can_cancel_or_close: boolean;
  /** m6: the responsible is not eligible, so the MANAGE she granted is suspended. */
  delegations_suspended: boolean;
  /** Only MANAGE (the responsible holds it by being the responsible). */
  my_grants: "MANAGE"[];
  /** Users with a MANAGE in force from the responsible now. */
  collaborator_count: number;
  /** E4 §3.1: eligible ADMINISTRADOR, responsible not eligible and the call not CANCELLED. */
  can_substitute_responsible: boolean;
  /** MANAGE delegations of earlier responsible versions waiting for the successor's review. */
  pending_delegation_reviews: number;
  /** E4 §3.1: counted participations whose consent does not cover the new scope (`ADMINISTRATION`). A count, never names. */
  pending_consent_count: number;
  responsible_changes: ResponsibleChangeView[];
  products: InstitutionalCallProductViewV2[];
  origin: CallOriginView | null;
  origin_differs_from_current: boolean;
  history: HistoryEntryView[];
}

/** E4 §3.1: `GET /{id}/participants`, only for an eligible ADMINISTRADOR (else 403 PARTICIPANTS_FORBIDDEN). */
export interface ParticipantsViewV2 {
  contractVersion: 2;
  call_id: string;
  status: JointPurchaseCallStatus;
  provisional: boolean;
  notice: string | null;
  /** Every current (ACTIVE) participation, listed or not. */
  participant_count: number;
  /** ACTIVE participations whose scope is not `ADMINISTRATION` (not listed; never named). */
  pending_consent_count: number;
  pending_consent_notice: string | null;
  /** Only ACTIVE participations with scope `ADMINISTRATION`. */
  participants: ParticipantView[];
}

export interface ClosingLineViewV2 extends ProductTotalViewV2 {
  product_ref: string;
  product_name: string;
  unit: PresentationUnit;
  base_unit: SyncV1BaseUnit;
}

/** E4 §3.1: `GET /{id}/closing` (and the answer of `POST /{id}/close`). */
export interface ClosingViewV2 {
  contractVersion: 2;
  call_id: string;
  name: string;
  status: "CLOSED";
  label: string;
  mode: JointPurchaseCallCloseMode;
  cutoff_at: string;
  closed_at: string;
  closed_by: UserRefView | null;
  participant_count: number;
  /** Eligible ADMINISTRADOR now. */
  can_view_participants: boolean;
  lines: ClosingLineViewV2[];
  /** Only for an eligible ADMINISTRADOR: the frozen participations with scope `ADMINISTRATION`. Null otherwise. */
  participants: ClosingParticipantView[] | null;
  /** Frozen participations whose scope is not `ADMINISTRATION` (a count). */
  pending_consent_count: number;
  pending_consent_notice: string | null;
}

export interface CollaboratorGrantViewV2 {
  grant: "MANAGE";
  label: string;
  granted_at: string;
  granted_by: UserRefView;
  status: "IN_FORCE" | "SUSPENDED" | "PENDING_REVIEW";
  responsible_version: number;
}

export interface CollaboratorViewV2 {
  user_ref: string;
  name: string;
  role: UserRole | null;
  grants: CollaboratorGrantViewV2[];
}

/** E4 §3.1: a stored view permission (`PARTICIPANTS`), kept only as history. It gives no access. */
export interface RetiredGrantView {
  grant: "PARTICIPANTS";
  label: string;
  user: UserRefView;
  granted_at: string;
  /** Null: created by the system for the responsible at opening or substitution. */
  granted_by: UserRefView | null;
  responsible_version: number;
  retired: true;
  /** «Permiso de visualización retirado el AAAA-MM-DD; no da acceso». */
  notice: string;
}

export interface AccessHistoryEntryViewV2 {
  at: string;
  action: "GRANTED" | "REVOKED" | "SUSPENDED" | "CONFIRMED";
  grant: "PARTICIPANTS" | "MANAGE";
  user: UserRefView;
  actor: UserRefView;
  /** True for every `PARTICIPANTS` event. */
  retired: boolean;
  /** The notice of a retired permission; null for MANAGE. */
  notice: string | null;
}

/** E4 §3.1: `GET /{id}/collaborators` (and the answers of grant, revoke and review with MANAGE). */
export interface CollaboratorsViewV2 {
  contractVersion: 2;
  call_id: string;
  status: JointPurchaseCallStatus;
  responsible: UserRefView;
  /** Only the responsible grants and revokes MANAGE. */
  can_grant: boolean;
  /** The current, eligible responsible reviews the MANAGE delegations of earlier versions. */
  can_review: boolean;
  responsible_version: number;
  /** Only MANAGE. */
  collaborators: CollaboratorViewV2[];
  /** Stored PARTICIPANTS rows, as history only. */
  retired_grants: RetiredGrantView[];
  history: AccessHistoryEntryViewV2[];
}

/** E4 §3.2: `GET /joint-purchase-substitution-permissions`, read-only history. */
export interface SubstitutionPermissionsHistoryView {
  contractVersion: 2;
  /** When the permission stopped being used in this environment (the E4 migration). */
  retired_at: string;
  /** «Ya no se usa: sustituye la Administración habilitada». */
  notice: string;
  /** Always false. */
  can_grant: false;
  /** Who held it when it was retired (rows kept, never deleted). */
  holders: {
    user_ref: string;
    name: string;
    role: UserRole | null;
    granted_at: string;
    granted_by: UserRefView;
    reason: string;
  }[];
  history: {
    at: string;
    action: "GRANTED" | "REVOKED";
    user: UserRefView;
    actor: UserRefView;
    reason: string | null;
  }[];
}

// ------------------------------------------------- farmer contract 4 (E4 §3.3)

/** E4 §4.1: the consent served to contract 4 (and, as the only honest text, to every read). */
export interface FarmerConsentV4 {
  version: "CONV-4";
  text: string;
  help: string;
}

export interface ParticipationViewV4 {
  status: JointPurchaseParticipationStatus;
  lines: ParticipationLineView[];
  last_sequence: number;
  last_operation_id: string;
  accepted_at: string;
  /** The text accepted when the participation was first confirmed (never rewritten). */
  consent: { version: string; accepted_at: string; received_at: string };
  /** The scope in force and the decision that set it (`sequence` 0 = the first acceptance). */
  consent_scope: {
    scope: "RESPONSIBLE_ONLY" | "COLLABORATORS" | "ADMINISTRATION" | "TOTALS_ONLY";
    version: string;
    decided_at: string;
    received_at: string;
    sequence: number;
  };
}

/** One call as the farmer sees it in contract 4: no `responsible.version`, no `responsible_authorization`. */
export interface FarmerCallViewV4 {
  call_id: string;
  name: string;
  status: Exclude<JointPurchaseCallStatus, "DRAFT">;
  campaign: { campaign_ref: string; name: string };
  opened_at: string | null;
  deadline_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  server_time: string;
  accepts_operations: boolean;
  responsible: { name: string };
  products: CallProductView[];
  participation: ParticipationViewV4 | null;
  closing: FarmerClosingView | null;
}

/** `GET /me/joint-purchase-calls`: served with this shape to every contract (E4 §7.1). */
export interface FarmerListViewV4 {
  contractVersion: 4;
  server_time: string;
  consent: FarmerConsentV4;
  calls: FarmerCallViewV4[];
  history: { older_count: number };
}

/** `GET /me/joint-purchase-calls/history`: served with this shape to every contract. */
export interface FarmerHistoryViewV4 {
  contractVersion: 4;
  server_time: string;
  consent: FarmerConsentV4;
  calls: FarmerCallViewV4[];
  next_cursor: string | null;
}

/** The answer of an accepted farmer write in contract 4 (contracts 1–3 get their own shape, E4 §7.2). */
export interface AcceptedViewV4 {
  outcome: "ACCEPTED";
  participation: ParticipationViewV4 | null;
}

/** E4 §3.1: never names anyone; the count is of participations, not of persons per product. */
export function pendingConsentNotice(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran."
    : `${count} participaciones sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.`;
}

/** E4 §3.1: the notice of a stored view permission (`date` = AAAA-MM-DD of the E4 migration in this environment). */
export function retiredGrantNotice(date: string): string {
  return `Permiso de visualización retirado el ${date}; no da acceso.`;
}

/** E4 §3.2. */
export const SUBSTITUTION_PERMISSION_RETIRED_NOTICE = "Ya no se usa: sustituye la Administración habilitada";

export const CLOSING_LABEL = "Consolidado al cierre: cantidades solicitadas";
export const PROVISIONAL_NOTICE = "Lista provisional: puede cambiar hasta el cierre";
export const REFERENCE_DISCLOSED_LABEL = "Cifra divulgada en el borrador";
export const REFERENCE_NO_FIGURE_LABEL = "Sin cifra";

export { iso };

// ------------------------------------------- write answers by contract (E4 §7.2)

/**
 * E4 §7.2: an accepted write is decided once and answered in the shape of
 * the contract the phone declared. Reads are not shaped: every contract gets
 * the shape of contract 4 (§7.1). The participation of a contract 1–3 answer
 * never carries a new scope (the use case refuses those writes with 409
 * APP_UPDATE_REQUIRED before deciding).
 */

/** Contract 4: without `responsible_authorization` (P-A C1 no longer decides access). */
export function toContract4FarmerBody(body: unknown): unknown {
  return withoutAuthorization(body);
}

/**
 * Contract 2 (the §10.6 versions, which validate keys strictly): without the
 * key of contract 3 (`responsible_authorization`).
 */
export function toContract2FarmerBody(body: unknown): unknown {
  return withoutAuthorization(body);
}

function withoutAuthorization(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  if ("participation" in out) out.participation = dropKey(out.participation, "responsible_authorization");
  return out;
}

/**
 * Contract 1 (N7: the versions published before §10.6, which reject any key
 * they do not know): also without `consent_scope`.
 */
export function toLegacyFarmerBody(body: unknown): unknown {
  const out = withoutAuthorization(body);
  if (!out || typeof out !== "object") return out;
  const shaped: Record<string, unknown> = { ...(out as Record<string, unknown>) };
  if ("participation" in shaped) shaped.participation = dropKey(shaped.participation, "consent_scope");
  return shaped;
}

function dropKey(participation: unknown, key: string): unknown {
  if (!participation || typeof participation !== "object") return participation;
  const rest: Record<string, unknown> = { ...(participation as Record<string, unknown>) };
  delete rest[key];
  return rest;
}
