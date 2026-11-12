import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallOriginKind,
  JointPurchaseCallStatus,
  JointPurchaseParticipationStatus,
  SyncV1BaseUnit,
  UserRole,
} from "@prisma/client";
import { CONSENT_V1_TEXT as CONSENT_V1_TEXT_LEGACY, CONSENT_V1_VERSION as CONSENT_V1_VERSION_LEGACY } from "../domain/consent";
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
  consent_scope?: { scope: "RESPONSIBLE_ONLY" | "COLLABORATORS"; version: string; decided_at: string; received_at: string; sequence: number };
}

export interface ParticipationRow {
  status: JointPurchaseParticipationStatus;
  lastSequence: number;
  lastOperationId: string;
  acceptedAt: Date;
  consentVersion: string;
  consentAcceptedAt: Date;
  consentReceivedAt: Date;
  consentScope: "RESPONSIBLE_ONLY" | "COLLABORATORS";
  consentScopeVersion: string;
  consentScopeDecidedAt: Date;
  consentScopeReceivedAt: Date;
  consentScopeSequence: number;
  lines: { productId: string; baseUnit: SyncV1BaseUnit; quantityBase: bigint }[];
}

export function toParticipationView(row: ParticipationRow | null): ParticipationView | null {
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

export interface FarmerCallView {
  call_id: string;
  name: string;
  status: Exclude<JointPurchaseCallStatus, "DRAFT">;
  campaign: { campaign_ref: string; name: string };
  opened_at: string | null;
  deadline_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  server_time: string;
  /** OPEN and `server_time < deadline_at`: an operation sent now can be accepted. */
  accepts_operations: boolean;
  responsible: { name: string };
  products: CallProductView[];
  participation: ParticipationView | null;
  closing: FarmerClosingView | null;
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

export interface InstitutionalCallProductView extends CallProductView {
  position: number;
  is_active: boolean;
  reference: ProposalReferenceView | null;
  totals: ProductTotalView;
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

export interface CallDetailView {
  contractVersion: 1;
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
  responsible: UserRefView & { role: UserRole | null; eligible: boolean };
  created_by: UserRefView;
  opened_by: UserRefView | null;
  cancelled_by: UserRefView | null;
  source_proposal_ref: string | null;
  participant_count: number;
  /** Totals come from the closing snapshot when CLOSED; otherwise live (provisional while OPEN). */
  totals_source: "NONE" | "LIVE" | "CLOSING";
  totals_threshold: number;
  can_view_participants: boolean;
  is_responsible: boolean;
  /** §10.2: the responsible or MANAGE (edit the draft, open, cancel, close). */
  can_manage: boolean;
  /** §10.2: equal to can_manage (N2, a fallback by role, was rejected on 2026-11-12). Kept for the Web. */
  can_cancel_or_close: boolean;
  /** m6: the responsible is not eligible, so the permissions she granted are suspended (not deleted). */
  delegations_suspended: boolean;
  /** Grants this user holds now (the responsible holds MANAGE by being the responsible). */
  my_grants: ("MANAGE" | "PARTICIPANTS")[];
  /** Users with a grant from the responsible now (never farmers). */
  collaborator_count: number;
  products: InstitutionalCallProductView[];
  /** E3-P2: null for calls created before the origin was recorded (never reconstructed). */
  origin: CallOriginView | null;
  /** The current products (any order) are not those of the origin; false without an origin. */
  origin_differs_from_current: boolean;
  history: HistoryEntryView[];
}

export interface ParticipantView {
  participation_ref: string;
  name: string;
  status: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: (ParticipationLineView & { product_name: string })[];
}

export interface ParticipantsView {
  contractVersion: 1;
  call_id: string;
  status: JointPurchaseCallStatus;
  provisional: boolean;
  notice: string | null;
  /** Every current (ACTIVE) participation, seen or not. */
  participant_count: number;
  /** §10.2: CONV-1 participations a collaborator may not see by name (0 for the responsible). */
  hidden_participant_count: number;
  hidden_notice: string | null;
  participants: ParticipantView[];
}

export interface ClosingLineView extends ProductTotalView {
  product_ref: string;
  product_name: string;
  unit: PresentationUnit;
  base_unit: SyncV1BaseUnit;
}

export interface ClosingParticipantView {
  participation_ref: string;
  name: string;
  accepted_at: string;
  lines: (ParticipationLineView & { product_name: string })[];
}

export interface ClosingView {
  contractVersion: 1;
  call_id: string;
  name: string;
  status: "CLOSED";
  label: string;
  mode: JointPurchaseCallCloseMode;
  cutoff_at: string;
  closed_at: string;
  closed_by: UserRefView | null;
  participant_count: number;
  totals_threshold: number;
  can_view_participants: boolean;
  lines: ClosingLineView[];
  /** Only with PARTICIPANTS (E2-D6, §10.3); null otherwise. A collaborator gets only the CONV-2 ones. */
  participants: ClosingParticipantView[] | null;
  /** §10.2: frozen participations hidden from this collaborator (0 otherwise). */
  hidden_participant_count: number;
  hidden_notice: string | null;
}

// ------------------------------------------------------------ collaborators (§10.2)

export interface CollaboratorGrantView {
  grant: "PARTICIPANTS" | "MANAGE";
  label: string;
  granted_at: string;
  granted_by: UserRefView;
}

export interface CollaboratorView {
  user_ref: string;
  name: string;
  role: UserRole | null;
  grants: CollaboratorGrantView[];
}

export interface AccessHistoryEntryView {
  at: string;
  action: "GRANTED" | "REVOKED";
  grant: "PARTICIPANTS" | "MANAGE";
  user: UserRefView;
  actor: UserRefView;
}

export interface CollaboratorsView {
  contractVersion: 1;
  call_id: string;
  status: JointPurchaseCallStatus;
  responsible: UserRefView;
  /** Only the responsible grants and revokes. */
  can_grant: boolean;
  collaborators: CollaboratorView[];
  history: AccessHistoryEntryView[];
}

export const GRANT_LABEL: Record<"PARTICIPANTS" | "MANAGE", string> = {
  PARTICIPANTS: "Consultar participantes y cantidades",
  MANAGE: "Administrar la convocatoria",
};

export function hiddenNotice(count: number): string | null {
  if (count === 0) return null;
  return count === 1
    ? "1 participación aceptada con un consentimiento anterior: sólo la ve la persona responsable."
    : `${count} participaciones aceptadas con un consentimiento anterior: sólo las ve la persona responsable.`;
}

export const CLOSING_LABEL = "Consolidado al cierre: cantidades solicitadas";
export const PROVISIONAL_NOTICE = "Lista provisional: puede cambiar hasta el cierre";
export const REFERENCE_DISCLOSED_LABEL = "Cifra divulgada en el borrador";
export const REFERENCE_NO_FIGURE_LABEL = "Sin cifra";

export { iso };

// ------------------------------------------------- contract 1 (N7, 2026-11-12)

/**
 * N7: the answer for phones that do not send `X-Joint-Purchase-Contract: 2`
 * (the versions published before §10.6, which reject any key or consent they
 * do not know). It is the same data in the contract 1 shape:
 * - `contractVersion: 1` and the `CONV-1` consent (only the responsible),
 *   which is the text those versions show and the scope a first confirmation
 *   with it gets: no newer consent is passed off as the old one, and nobody
 *   gains access to keep the old phone working;
 * - without `history` (those versions did not know it; the finished calls
 *   older than 180 days were never in their list) nor `consent_scope`.
 * Their operations (with `CONV-1`) are still accepted as they are.
 */
export function toLegacyFarmerBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const source = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  if ("contractVersion" in out) out.contractVersion = 1;
  if ("consent" in out && "calls" in out) out.consent = { version: CONSENT_V1_VERSION_LEGACY, text: CONSENT_V1_TEXT_LEGACY };
  delete out.history;
  if (Array.isArray(out.calls)) {
    out.calls = (out.calls as Record<string, unknown>[]).map((call) => ({ ...call, participation: legacyParticipation(call.participation) }));
  }
  if ("participation" in out) out.participation = legacyParticipation(out.participation);
  return out;
}

function legacyParticipation(participation: unknown): unknown {
  if (!participation || typeof participation !== "object") return participation;
  const { consent_scope: _scope, ...rest } = participation as Record<string, unknown>;
  return rest;
}
