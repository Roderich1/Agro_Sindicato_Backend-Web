import type {
  JointPurchaseCallCloseMode,
  JointPurchaseCallEventKind,
  JointPurchaseCallStatus,
  JointPurchaseParticipationStatus,
  SyncV1BaseUnit,
  UserRole,
} from "@prisma/client";
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
  consent: { version: string; accepted_at: string; received_at: string };
}

export interface ParticipationRow {
  status: JointPurchaseParticipationStatus;
  lastSequence: number;
  lastOperationId: string;
  acceptedAt: Date;
  consentVersion: string;
  consentAcceptedAt: Date;
  consentReceivedAt: Date;
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
  responsible: UserRefView & { role: UserRole | null };
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
  products: InstitutionalCallProductView[];
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
  participant_count: number;
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
  /** Only with the specific permission (E2-D6); null otherwise. */
  participants: ClosingParticipantView[] | null;
}

export const CLOSING_LABEL = "Consolidado al cierre: cantidades solicitadas";
export const PROVISIONAL_NOTICE = "Lista provisional: puede cambiar hasta el cierre";
export const REFERENCE_DISCLOSED_LABEL = "Cifra divulgada en el borrador";
export const REFERENCE_NO_FIGURE_LABEL = "Sin cifra";

export { iso };
