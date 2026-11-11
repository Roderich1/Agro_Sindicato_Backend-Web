import type { BaseUnit } from '../lib/quantity';
import type { ProposalLineStatus } from './collective';

/**
 * E2 (convocatorias de compra conjunta): formas de la API institucional
 * `/joint-purchase-calls` (contrato
 * `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` §4.1). Los
 * campos van en snake_case, tal como responde el servidor. Una participación
 * es una cantidad **solicitada**: no es una compra, una entrega ni una deuda.
 */
export type JointPurchaseCallStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type JointPurchaseCallEventKind = 'CREATED' | 'UPDATED' | 'OPENED' | 'CLOSED' | 'CANCELLED' | 'RESPONSIBLE_ASSIGNED';
export type JointPurchaseParticipationStatus = 'ACTIVE' | 'WITHDRAWN';
export type JointPurchaseCallCloseMode = 'MANUAL' | 'AUTOMATIC';

/** Usuario institucional (responsable, autor de una acción). Nunca un agricultor. */
export interface JointPurchaseCallUser {
  id: string;
  name: string;
  role?: 'DIRECTIVA' | 'ADMINISTRADOR' | string;
}

export interface JointPurchaseCallCampaign {
  campaign_ref: string;
  name: string;
  status?: string;
}

/** Fila de la lista (`GET /joint-purchase-calls`): sin identidades de agricultores. */
export interface JointPurchaseCallSummary {
  id: string;
  name: string;
  status: JointPurchaseCallStatus;
  campaign: JointPurchaseCallCampaign;
  deadline_at: string;
  opened_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  responsible: JointPurchaseCallUser | null;
  /** Personas con participación vigente (cada una cuenta una vez, E2-D8). */
  participant_count: number;
  product_count?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Cifra de la línea del borrador de propuesta del que salió el producto (E2-D14):
 * la cifra **ya divulgada** de esa línea, o `null` si estaba suprimida. Es una
 * referencia; nunca una cantidad comprometida.
 */
export interface JointPurchaseCallReference {
  source_proposal_ref: string;
  source_position: number;
  status: ProposalLineStatus;
  quantity_base: string | null;
  quantity_presentation?: string | null;
}

/** Total por producto según E2-D7: `null` cuando quien consulta no puede verlo. */
export interface JointPurchaseCallProductTotal {
  total_quantity_base: string | null;
  participant_count: number | null;
}

export interface JointPurchaseCallProduct {
  position: number;
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  unit?: 'L' | 'KG';
  reference: JointPurchaseCallReference | null;
  /** Ausente en un borrador; en una convocatoria abierta o cerrada, según E2-D7. */
  total?: JointPurchaseCallProductTotal | null;
}

export interface JointPurchaseCallEvent {
  at: string;
  kind: JointPurchaseCallEventKind;
  /** Usuario institucional; `null` en el cierre automático. */
  actor: { name: string } | null;
  detail: string | null;
}

export interface JointPurchaseCallDetail extends JointPurchaseCallSummary {
  products: JointPurchaseCallProduct[];
  source_proposal_ref: string | null;
  cancel_reason: string | null;
  /** Permiso específico E2-D6 de quien consulta (sólo el responsable, tras abrir). */
  can_view_participants: boolean;
  /** Umbral de E2-D7 (provisional, 3). */
  totals_threshold?: number | null;
  history: JointPurchaseCallEvent[];
  server_time?: string;
}

export interface JointPurchaseParticipantLine {
  product_ref: string;
  product_name?: string;
  base_unit: BaseUnit;
  quantity_base: string;
}

/** Participante identificado: sólo el nombre del usuario. Nunca correo ni otros datos personales. */
export interface JointPurchaseCallParticipant {
  participation_ref: string;
  name: string;
  status: JointPurchaseParticipationStatus;
  accepted_at: string;
  lines: JointPurchaseParticipantLine[];
}

export interface JointPurchaseCallClosingLine {
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  /** `null` cuando quien consulta no puede ver el total (E2-D7). */
  total_quantity_base: string | null;
  participant_count: number | null;
}

/** «Consolidado al cierre» (E2-D13): instantánea inmutable de cantidades **solicitadas**. */
export interface JointPurchaseCallClosing {
  call_id: string;
  mode: JointPurchaseCallCloseMode;
  cutoff_at: string;
  closed_at: string;
  closed_by: { name: string } | null;
  /** Personas incluidas en el consolidado. */
  participant_count: number;
  lines: JointPurchaseCallClosingLine[];
  /** Sólo con el permiso E2-D6; `null` o ausente en otro caso. */
  participants?: JointPurchaseCallParticipant[] | null;
}

export interface JointPurchaseCallProductInput {
  product_ref: string;
  /** Posición de la línea del borrador de propuesta de origen. */
  source_position?: number;
}

export interface CreateJointPurchaseCallBody {
  campaign_id: string;
  name: string;
  deadline_at: string;
  responsible_user_id: string;
  products: JointPurchaseCallProductInput[];
  source_proposal_id?: string | null;
}

export type UpdateJointPurchaseCallBody = Partial<Omit<CreateJointPurchaseCallBody, 'campaign_id'>>;

export interface EligibleResponsible {
  id: string;
  name: string;
  role: 'DIRECTIVA' | 'ADMINISTRADOR' | string;
}
