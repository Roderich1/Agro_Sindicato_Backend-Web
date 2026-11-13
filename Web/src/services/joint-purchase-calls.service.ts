import { api } from '../lib/axios';
import type {
  CreateJointPurchaseCallBody,
  EligibleResponsible,
  JointPurchaseCallClosing,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallGrant,
  JointPurchaseCallList,
  JointPurchaseCallParticipants,
  JointPurchaseCallStatus,
  JointPurchaseCallSummary,
  SubstitutionPermissionsHistory,
  UpdateJointPurchaseCallBody,
} from '../types/joint-purchase-calls';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;
const BASE = '/joint-purchase-calls';
const PERMISSIONS = '/joint-purchase-substitution-permissions';

export interface JointPurchaseCallFilter {
  campaignId?: string | null;
  status?: JointPurchaseCallStatus | null;
}

/**
 * E2 §4.1 y E4 §3: rutas institucionales de convocatorias de compra conjunta
 * (sólo DIRECTIVA y ADMINISTRADOR del tenant, comprobado en el servidor).
 * Online, sin cola ni caché: cada acción de estado lleva `confirmed: true`. Las
 * formas son las del servidor (`call-views.ts`, contrato institucional 2).
 * Los permisos de visualización y el permiso «Sustituir responsable» ya no se
 * conceden ni se retiran desde la Web (E4 §3.1–§3.2): sólo queda su historia.
 */
export const jointPurchaseCallsService = {
  /** `{ contractVersion, calls }`; filtros `campaignId` y `status` (query). */
  list: ({ campaignId, status }: JointPurchaseCallFilter = {}): Promise<JointPurchaseCallSummary[]> =>
    api
      .get<JointPurchaseCallList>(BASE, {
        params: { ...(campaignId ? { campaignId } : {}), ...(status ? { status } : {}) },
      })
      .then((r) => r.data.calls),
  get: (id: string) => api.get<JointPurchaseCallDetail>(`${BASE}/${seg(id)}`).then((r) => r.data),
  /** 201 con el detalle; su `call_id` identifica el borrador creado. */
  create: (body: CreateJointPurchaseCallBody) => api.post<JointPurchaseCallDetail>(BASE, body).then((r) => r.data),
  update: (id: string, body: UpdateJointPurchaseCallBody) =>
    api.patch<JointPurchaseCallDetail>(`${BASE}/${seg(id)}`, body).then((r) => r.data),
  open: (id: string) =>
    api.post<JointPurchaseCallDetail>(`${BASE}/${seg(id)}/open`, { confirmed: true }).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post<JointPurchaseCallDetail>(`${BASE}/${seg(id)}/cancel`, { reason, confirmed: true }).then((r) => r.data),
  /** Devuelve el consolidado al cierre, como lo ve quien cierra. */
  close: (id: string) =>
    api.post<JointPurchaseCallClosing>(`${BASE}/${seg(id)}/close`, { confirmed: true }).then((r) => r.data),
  /** E4 §2: sólo la Administración habilitada; si no, 403 `PARTICIPANTS_FORBIDDEN`. */
  participants: (id: string) =>
    api.get<JointPurchaseCallParticipants>(`${BASE}/${seg(id)}/participants`).then((r) => r.data),
  closing: (id: string) => api.get<JointPurchaseCallClosing>(`${BASE}/${seg(id)}/closing`).then((r) => r.data),
  /** `{ contractVersion, users }`: DIRECTIVA o ADMINISTRADOR activos del tenant. */
  eligibleResponsibles: (): Promise<EligibleResponsible[]> =>
    api
      .get<{ contractVersion: 1; users: EligibleResponsible[] }>(`${BASE}/eligible-responsibles`)
      .then((r) => r.data.users),
  /** `MANAGE` vigentes, permisos de visualización retirados (historia) e historial (sin datos de agricultores). */
  collaborators: (id: string) =>
    api.get<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators`).then((r) => r.data),
  /** Sólo la responsable (403 `COLLABORATORS_FORBIDDEN`); idempotente. Responde la lista actualizada. */
  grant: (id: string, userRef: string, grant: JointPurchaseCallGrant) =>
    api
      .post<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators`, { user_ref: userRef, grant, confirmed: true })
      .then((r) => r.data),
  /** La responsable retira, o el propio colaborador renuncia; idempotente. Responde la lista actualizada. */
  revoke: (id: string, userRef: string, grant: JointPurchaseCallGrant) =>
    api
      .post<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators/revoke`, { user_ref: userRef, grant })
      .then((r) => r.data),
  /** P-A §12: la responsable actual revisa un `MANAGE` de una responsable anterior. */
  reviewDelegation: (id: string, userRef: string, grant: JointPurchaseCallGrant, decision: 'CONFIRM' | 'RETIRE') =>
    api
      .post<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators/review`, { user_ref: userRef, grant, decision })
      .then((r) => r.data),
  /**
   * E4 §6.3: la Administración habilitada sustituye a una responsable que ya no
   * está habilitada. `requestId` hace idempotente el reintento;
   * `expectedVersion` es la versión que se vio (otra → 409
   * `RESPONSIBLE_CHANGED`, nunca se sobrescribe en silencio).
   */
  substituteResponsible: (id: string, body: { requestId: string; expectedVersion: number; newResponsibleRef: string; reason: string }) =>
    api
      .post<JointPurchaseCallDetail>(`${BASE}/${seg(id)}/responsible`, {
        request_id: body.requestId,
        expected_responsible_version: body.expectedVersion,
        new_responsible_ref: body.newResponsibleRef,
        reason: body.reason,
        confirmed: true,
      })
      .then((r) => r.data),
  /** E4 §3.2: historia de sólo lectura del permiso «Sustituir responsable», que ya no se usa. */
  substitutionPermissionsHistory: () => api.get<SubstitutionPermissionsHistory>(PERMISSIONS).then((r) => r.data),
};
