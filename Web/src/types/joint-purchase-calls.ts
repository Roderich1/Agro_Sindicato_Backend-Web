import type { BaseUnit } from '../lib/quantity';

/**
 * E2 (convocatorias de compra conjunta): formas de la API institucional
 * `/joint-purchase-calls` (contrato
 * `docs/architecture/E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` §4.1), tal
 * como las responde el servidor (`Back/src/modules/joint-purchase-calls/application/call-views.ts`).
 * Los campos van en snake_case. Una participación es una cantidad
 * **solicitada**: no es una compra, una entrega ni una deuda.
 */
export type JointPurchaseCallStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type JointPurchaseCallEventKind = 'CREATED' | 'UPDATED' | 'OPENED' | 'CLOSED' | 'CANCELLED' | 'RESPONSIBLE_ASSIGNED';
export type JointPurchaseParticipationStatus = 'ACTIVE' | 'WITHDRAWN';
export type JointPurchaseCallCloseMode = 'MANUAL' | 'AUTOMATIC';

/**
 * E2-D7 / E2-P1: `VISIBLE` con el total; `UNDER_THRESHOLD` (sólo al cierre)
 * cuando menos del umbral de personas pidieron el producto; `RESPONSIBLE_ONLY`
 * mientras la convocatoria está abierta, para quien no tiene el permiso del
 * responsable. Fuera de `VISIBLE` el total llega como `null`, nunca como 0.
 */
export type JointPurchaseCallTotalVisibility = 'VISIBLE' | 'UNDER_THRESHOLD' | 'RESPONSIBLE_ONLY';

/** Usuario institucional (responsable, autor de una acción). Nunca un agricultor. */
export interface JointPurchaseCallUserRef {
  user_ref: string;
  name: string;
}

/** Fila de la lista (`GET /joint-purchase-calls`): sin identidades de agricultores. */
export interface JointPurchaseCallSummary {
  call_id: string;
  name: string;
  status: JointPurchaseCallStatus;
  campaign: { campaign_ref: string; name: string };
  deadline_at: string;
  opened_at: string | null;
  closed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  responsible: JointPurchaseCallUserRef;
  product_count: number;
  /** Personas con participación vigente (cada una cuenta una vez, E2-D8). */
  participant_count: number;
}

export interface JointPurchaseCallList {
  contractVersion: 1;
  calls: JointPurchaseCallSummary[];
}

/**
 * Referencia de la línea del borrador de propuesta del que salió el producto
 * (E2-D14): la cifra **ya divulgada** (`DISCLOSED`) o «sin cifra»
 * (`NO_FIGURE`). Nunca una cantidad comprometida.
 */
export interface JointPurchaseCallReference {
  proposal_ref: string;
  position: number;
  status: 'DISCLOSED' | 'NO_FIGURE';
  label: string;
  quantity_base: string | null;
  contributors: number | null;
  released_at: string | null;
}

/** Total por producto según E2-D7 / E2-P1: `null` cuando quien consulta no puede verlo. */
export interface JointPurchaseCallProductTotal {
  participant_count: number;
  total_quantity_base: string | null;
  visibility: JointPurchaseCallTotalVisibility;
}

export interface JointPurchaseCallProduct {
  position: number;
  product_ref: string;
  name: string;
  unit: 'L' | 'KG';
  base_unit: BaseUnit;
  is_active: boolean;
  reference: JointPurchaseCallReference | null;
  totals: JointPurchaseCallProductTotal;
}

export interface JointPurchaseCallEvent {
  at: string;
  kind: JointPurchaseCallEventKind;
  /** Usuario institucional; `null` en el cierre automático. */
  actor: JointPurchaseCallUserRef | null;
  detail: string | null;
}

/** Detalle (`GET`/`PATCH /:id`, y la respuesta de crear, abrir y cancelar). */
export interface JointPurchaseCallDetail {
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
  responsible: JointPurchaseCallUserRef & { role: string | null };
  created_by: JointPurchaseCallUserRef;
  opened_by: JointPurchaseCallUserRef | null;
  cancelled_by: JointPurchaseCallUserRef | null;
  source_proposal_ref: string | null;
  participant_count: number;
  /** `CLOSING` (instantánea del cierre), `LIVE` (provisional mientras está abierta) o `NONE` (borrador). */
  totals_source: 'NONE' | 'LIVE' | 'CLOSING';
  /** Umbral de E2-D7 (provisional, 3). */
  totals_threshold: number;
  /** Permiso específico E2-D6 de quien consulta (sólo el responsable, tras abrir). */
  can_view_participants: boolean;
  is_responsible: boolean;
  products: JointPurchaseCallProduct[];
  history: JointPurchaseCallEvent[];
}

export interface JointPurchaseParticipantLine {
  product_ref: string;
  product_name: string;
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

/** `GET /:id/participants` (sólo con el permiso E2-D6). */
export interface JointPurchaseCallParticipants {
  contractVersion: 1;
  call_id: string;
  status: JointPurchaseCallStatus;
  provisional: boolean;
  /** Aviso del servidor (p. ej. «Lista provisional…» mientras está abierta), o `null`. */
  notice: string | null;
  participant_count: number;
  participants: JointPurchaseCallParticipant[];
}

export interface JointPurchaseCallClosingLine extends JointPurchaseCallProductTotal {
  product_ref: string;
  product_name: string;
  unit: 'L' | 'KG';
  base_unit: BaseUnit;
}

export interface JointPurchaseCallClosingParticipant {
  participation_ref: string;
  name: string;
  accepted_at: string;
  lines: JointPurchaseParticipantLine[];
}

/** «Consolidado al cierre» (E2-D13, `GET /:id/closing` y `POST /:id/close`): instantánea inmutable de cantidades **solicitadas**. */
export interface JointPurchaseCallClosing {
  contractVersion: 1;
  call_id: string;
  name: string;
  status: 'CLOSED';
  label: string;
  mode: JointPurchaseCallCloseMode;
  cutoff_at: string;
  closed_at: string;
  closed_by: JointPurchaseCallUserRef | null;
  /** Personas incluidas en el consolidado. */
  participant_count: number;
  totals_threshold: number;
  can_view_participants: boolean;
  lines: JointPurchaseCallClosingLine[];
  /** Sólo con el permiso E2-D6; `null` en otro caso. */
  participants: JointPurchaseCallClosingParticipant[] | null;
}

/** Producto pedido al crear o editar: sólo su referencia (el servidor deduce la línea del borrador de origen). */
export interface JointPurchaseCallProductInput {
  product_ref: string;
}

/** `CreateCallDto` del servidor: cualquier otra clave se rechaza con 400 `PAYLOAD_INVALID`. */
export interface CreateJointPurchaseCallBody {
  campaign_id: string;
  name: string;
  deadline_at: string;
  responsible_user_id: string;
  products: JointPurchaseCallProductInput[];
  source_proposal_id?: string | null;
}

/** `PatchCallDto`: lo mismo sin la campaña; `source_proposal_id: null` quita el origen. */
export type UpdateJointPurchaseCallBody = Partial<Omit<CreateJointPurchaseCallBody, 'campaign_id'>>;

export interface EligibleResponsible {
  user_ref: string;
  name: string;
  role: string;
}
