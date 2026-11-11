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
  UpdateJointPurchaseCallBody,
} from '../types/joint-purchase-calls';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;
const BASE = '/joint-purchase-calls';

export interface JointPurchaseCallFilter {
  campaignId?: string | null;
  status?: JointPurchaseCallStatus | null;
}

/**
 * E2 §4.1: rutas institucionales de convocatorias de compra conjunta (sólo
 * DIRECTIVA y ADMINISTRADOR del tenant, comprobado en el servidor). Online,
 * sin cola ni caché: cada acción de estado lleva `confirmed: true`. Las formas
 * son las del servidor (`call-views.ts`).
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
  /** Sólo con el permiso E2-D6; sin él, 403 `PARTICIPANTS_FORBIDDEN`. */
  participants: (id: string) =>
    api.get<JointPurchaseCallParticipants>(`${BASE}/${seg(id)}/participants`).then((r) => r.data),
  closing: (id: string) => api.get<JointPurchaseCallClosing>(`${BASE}/${seg(id)}/closing`).then((r) => r.data),
  /** `{ contractVersion, users }`: DIRECTIVA o ADMINISTRADOR activos del tenant. */
  eligibleResponsibles: (): Promise<EligibleResponsible[]> =>
    api
      .get<{ contractVersion: 1; users: EligibleResponsible[] }>(`${BASE}/eligible-responsibles`)
      .then((r) => r.data.users),
  /** §10.2: colaboradores vigentes e historial de concesiones y revocaciones (sin datos de agricultores). */
  collaborators: (id: string) =>
    api.get<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators`).then((r) => r.data),
  /** Sólo el responsable (403 `COLLABORATORS_FORBIDDEN`); idempotente. Responde la lista actualizada. */
  grant: (id: string, userRef: string, grant: JointPurchaseCallGrant) =>
    api
      .post<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators`, { user_ref: userRef, grant, confirmed: true })
      .then((r) => r.data),
  /** El responsable revoca, o el propio colaborador renuncia; idempotente. Responde la lista actualizada. */
  revoke: (id: string, userRef: string, grant: JointPurchaseCallGrant) =>
    api
      .post<JointPurchaseCallCollaborators>(`${BASE}/${seg(id)}/collaborators/revoke`, { user_ref: userRef, grant })
      .then((r) => r.data),
};
