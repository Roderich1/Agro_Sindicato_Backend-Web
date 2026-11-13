import type { BaseUnit } from '../lib/quantity';

/**
 * E2 (convocatorias de compra conjunta): formas de la API institucional
 * `/joint-purchase-calls`, tal como las responde el servidor
 * (`Back/src/modules/joint-purchase-calls/application/call-views.ts`). Desde
 * E4 (2026-11-13) es el contrato institucional 2
 * (`docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md` §3.1): el
 * detalle identificado sólo lo recibe la Administración habilitada y los
 * totales siguen la regla T (§5.2), sin umbral de personas.
 * Los campos van en snake_case. Una participación es una cantidad
 * **solicitada**: no es una compra, una entrega ni una deuda.
 */
export type JointPurchaseCallStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type JointPurchaseCallEventKind =
  | 'CREATED'
  | 'UPDATED'
  | 'OPENED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'RESPONSIBLE_ASSIGNED'
  | 'ACCESS_GRANTED'
  | 'ACCESS_REVOKED'
  | 'RESPONSIBLE_REPLACED'
  | 'ACCESS_CONFIRMED';
export type JointPurchaseParticipationStatus = 'ACTIVE' | 'WITHDRAWN';
export type JointPurchaseCallCloseMode = 'MANUAL' | 'AUTOMATIC';

/**
 * E4 §5.2 (regla T), igual para la Directiva y la Administración: `VISIBLE`
 * con el total y su base; `PENDING_CONSENT` cuando alguna participación
 * contada no autorizó todavía los totales con la autorización nueva. Fuera de
 * `VISIBLE` el total llega como `null`, nunca como 0. `UNDER_THRESHOLD`,
 * `RESPONSIBLE_ONLY` y `RESTRICTED` ya no se emiten.
 */
export type JointPurchaseCallTotalVisibility = 'VISIBLE' | 'PENDING_CONSENT';

/**
 * E4 §5.2: por qué se ve un total.
 * - `ROLE_CONSENT`: todas las participaciones contadas autorizan los totales,
 *   con cualquier número de personas, en vivo o al cierre.
 * - `PREVIOUS_POLICY_K3`: sólo en un consolidado, con 3 o más personas y
 *   alguna con una autorización anterior, para quien no ve a nadie por nombre:
 *   el total ya era visible con la regla anterior y lo sigue siendo.
 */
export type JointPurchaseCallTotalsBasis = 'ROLE_CONSENT' | 'PREVIOUS_POLICY_K3';

/**
 * E4 §2: el único permiso operativo por convocatoria es `MANAGE`
 * («Administrar la convocatoria»). Lo concede sólo la persona responsable.
 */
export type JointPurchaseCallGrant = 'MANAGE';

/**
 * Permisos tal como aparecen en el historial. `PARTICIPANTS` («Consultar
 * participantes y cantidades») se retiró con E4: queda sólo como historia y no
 * da acceso.
 */
export type JointPurchaseCallHistoryGrant = 'PARTICIPANTS' | 'MANAGE';

/** Usuario institucional (responsable, autor de una acción). Nunca un agricultor. */
export interface JointPurchaseCallUserRef {
  user_ref: string;
  name: string;
}

/** Fila de la lista (`GET /joint-purchase-calls`): sin totales ni identidades de agricultores. */
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

/** Total por producto según la regla T (E4 §5.2): `null` fuera de `VISIBLE`. */
export interface JointPurchaseCallProductTotal {
  /** Personas contadas en el producto (un recuento, siempre visible). */
  participant_count: number;
  total_quantity_base: string | null;
  visibility: JointPurchaseCallTotalVisibility;
  /** `null` con `PENDING_CONSENT`. */
  totals_basis: JointPurchaseCallTotalsBasis | null;
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

/** E3-P2: producto tal como quedó al crear la convocatoria. */
export interface JointPurchaseCallOriginProduct {
  position: number;
  product_ref: string;
  product_name: string;
  base_unit: BaseUnit;
  /** Línea del borrador de propuesta de la que venía; `null` si no venía de una línea. */
  proposal_position: number | null;
}

/**
 * E3-P2: productos y procedencia al crear la convocatoria, registrados una
 * vez y nunca modificados. Sin cantidades, cifras, aportantes ni estimaciones.
 */
export interface JointPurchaseCallOrigin {
  kind: 'PROPOSAL' | 'CATALOG';
  proposal_ref: string | null;
  proposal_generated_at: string | null;
  /** `null` en CATALOG o si el servidor no puede servirla (cifra retirada, divulgación no autorizada). */
  proposal_fingerprint: string | null;
  /** Revisión de la selección guardada del borrador al crear; `null` si nunca se guardó. */
  selection_revision: number | null;
  /** Los productos al crear eran exactamente los de esa selección; `null` sin selección. */
  selection_matched: boolean | null;
  recorded_at: string;
  recorded_by: JointPurchaseCallUserRef;
  products: JointPurchaseCallOriginProduct[];
}

/** Detalle (`GET`/`PATCH /:id`, y la respuesta de crear, abrir, cancelar y sustituir). */
export interface JointPurchaseCallDetail {
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
  /**
   * Quién coordina. Serlo no da acceso al detalle identificado (E4 §6.1).
   * `eligible: false`: dejó de ser un usuario activo (cuenta, Member o rol).
   * `version` sube con cada sustitución (P-A).
   */
  responsible: JointPurchaseCallUserRef & { role: string | null; eligible: boolean; version: number };
  created_by: JointPurchaseCallUserRef;
  opened_by: JointPurchaseCallUserRef | null;
  cancelled_by: JointPurchaseCallUserRef | null;
  source_proposal_ref: string | null;
  participant_count: number;
  /** `CLOSING` (consolidado al cierre), `LIVE` (provisional mientras está abierta) o `NONE` (borrador). */
  totals_source: 'NONE' | 'LIVE' | 'CLOSING';
  /** E4 §2: quien consulta es ahora una persona de la Administración habilitada (se lee en cada consulta). */
  can_view_participants: boolean;
  is_responsible: boolean;
  /** Responsable o `MANAGE` vigente (editar el borrador, abrir, cancelar y cerrar). */
  can_manage: boolean;
  /** Igual a `can_manage` (ningún rol cancela ni cierra por defecto). */
  can_cancel_or_close: boolean;
  /** m6: la responsable no está habilitada; los `MANAGE` que concedió no se ejercen. */
  delegations_suspended: boolean;
  /** E4 §3.1: Administración habilitada, responsable no habilitada y convocatoria no cancelada. */
  can_substitute_responsible: boolean;
  /** P-A: `MANAGE` de una responsable anterior pendientes de la revisión de la actual. */
  pending_delegation_reviews: number;
  /**
   * E4 §3.1: participaciones contadas cuyo consentimiento no cubre todavía la
   * autorización nueva. Un recuento, para la Directiva y la Administración; nunca nombres.
   */
  pending_consent_count: number;
  /** P-A: sustituciones de la persona responsable, de la más antigua a la más reciente. */
  responsible_changes: JointPurchaseResponsibleChange[];
  /** `MANAGE` si quien consulta lo tiene ahora (la responsable lo tiene por serlo). */
  my_grants: JointPurchaseCallGrant[];
  /** Usuarios con un `MANAGE` vigente de la responsable (nunca agricultores). */
  collaborator_count: number;
  products: JointPurchaseCallProduct[];
  /** E3-P2: `null` en convocatorias anteriores al registro del origen; ausente si el servidor no lo envía. */
  origin?: JointPurchaseCallOrigin | null;
  /** Los productos actuales no son los del origen (sin importar el orden). */
  origin_differs_from_current?: boolean;
  history: JointPurchaseCallEvent[];
}

/** P-A (§12): una sustitución de la persona responsable. Sin datos de agricultores. */
export interface JointPurchaseResponsibleChange {
  version: number;
  at: string;
  previous: JointPurchaseCallUserRef;
  next: JointPurchaseCallUserRef;
  actor: JointPurchaseCallUserRef;
  reason: string;
  call_status: 'DRAFT' | 'OPEN' | 'CLOSED';
  suspended_delegations: number;
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

/** `GET /:id/participants`: sólo para la Administración habilitada (si no, 403 `PARTICIPANTS_FORBIDDEN`). */
export interface JointPurchaseCallParticipants {
  contractVersion: 2;
  call_id: string;
  status: JointPurchaseCallStatus;
  provisional: boolean;
  /** Aviso del servidor (p. ej. «Lista provisional…» mientras está abierta), o `null`. */
  notice: string | null;
  /** Todas las participaciones vigentes, se listen o no. */
  participant_count: number;
  /** Participaciones vigentes sin la autorización nueva: no se listan ni se nombran. */
  pending_consent_count: number;
  /** Aviso del servidor sobre esas participaciones, sin nombres, o `null`. */
  pending_consent_notice: string | null;
  /** Sólo las participaciones vigentes con la autorización nueva. */
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
  contractVersion: 2;
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
  /** Administración habilitada ahora. */
  can_view_participants: boolean;
  lines: JointPurchaseCallClosingLine[];
  /** Sólo para la Administración habilitada: las participaciones congeladas con la autorización nueva. `null` en otro caso. */
  participants: JointPurchaseCallClosingParticipant[] | null;
  /** Participaciones congeladas sin la autorización nueva (un recuento). */
  pending_consent_count: number;
  pending_consent_notice: string | null;
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

/** Un `MANAGE` vigente de un colaborador: quién lo concedió y cuándo. */
export interface JointPurchaseCallCollaboratorGrant {
  grant: JointPurchaseCallGrant;
  label: string;
  granted_at: string;
  granted_by: JointPurchaseCallUserRef;
  /** m6 / P-A: vigente, suspendido (responsable inhabilitada) o pendiente de la revisión de la nueva responsable. */
  status: 'IN_FORCE' | 'SUSPENDED' | 'PENDING_REVIEW';
  responsible_version: number;
}

/** Colaborador vigente (usuario institucional, nunca un agricultor). */
export interface JointPurchaseCallCollaborator {
  user_ref: string;
  name: string;
  role: string | null;
  grants: JointPurchaseCallCollaboratorGrant[];
}

/** E4 §3.1: un permiso de visualización (`PARTICIPANTS`) guardado antes de E4, sólo como historia. No da acceso. */
export interface JointPurchaseCallRetiredGrant {
  grant: 'PARTICIPANTS';
  label: string;
  user: JointPurchaseCallUserRef;
  granted_at: string;
  /** `null`: lo creó el sistema para la responsable al abrir o al sustituir. */
  granted_by: JointPurchaseCallUserRef | null;
  responsible_version: number;
  retired: true;
  /** «Permiso de visualización retirado el AAAA-MM-DD; no da acceso.» */
  notice: string;
}

/** Concesión o revocación registrada (`JointPurchaseCallAccessEvent`). */
export interface JointPurchaseCallAccessEvent {
  at: string;
  action: 'GRANTED' | 'REVOKED' | 'SUSPENDED' | 'CONFIRMED';
  grant: JointPurchaseCallHistoryGrant;
  user: JointPurchaseCallUserRef;
  actor: JointPurchaseCallUserRef;
  /** `true` en todos los eventos de `PARTICIPANTS` (historia, sin acceso). */
  retired: boolean;
  /** Aviso del permiso retirado; `null` en `MANAGE`. */
  notice: string | null;
}

/** `GET /:id/collaborators` y las respuestas de conceder, retirar y revisar `MANAGE` (E4 §3.1). */
export interface JointPurchaseCallCollaborators {
  contractVersion: 2;
  call_id: string;
  status: JointPurchaseCallStatus;
  responsible: JointPurchaseCallUserRef;
  /** Sólo la responsable concede y retira `MANAGE`. */
  can_grant: boolean;
  /** P-A: la responsable actual y habilitada revisa los `MANAGE` de una responsable anterior. */
  can_review: boolean;
  responsible_version: number;
  /** Sólo `MANAGE`. */
  collaborators: JointPurchaseCallCollaborator[];
  /** Filas `PARTICIPANTS` guardadas, sólo como historia. */
  retired_grants: JointPurchaseCallRetiredGrant[];
  history: JointPurchaseCallAccessEvent[];
}

/**
 * E4 §3.2: `GET /joint-purchase-substitution-permissions`, historia de sólo
 * lectura del permiso «Sustituir responsable», que ya no se usa (sustituye la
 * Administración habilitada). Conceder y retirar responden 409
 * `SUBSTITUTION_PERMISSION_RETIRED`. Sin datos de agricultores.
 */
export interface SubstitutionPermissionsHistory {
  contractVersion: 2;
  /** Cuándo dejó de usarse en este entorno (la migración de E4). */
  retired_at: string;
  /** «Ya no se usa: sustituye la Administración habilitada». */
  notice: string;
  can_grant: false;
  /** Quién lo tenía al retirarse (las filas se conservan). */
  holders: {
    user_ref: string;
    name: string;
    role: string | null;
    granted_at: string;
    granted_by: JointPurchaseCallUserRef;
    reason: string;
  }[];
  history: {
    at: string;
    action: 'GRANTED' | 'REVOKED';
    user: JointPurchaseCallUserRef;
    actor: JointPurchaseCallUserRef;
    reason: string | null;
  }[];
}
