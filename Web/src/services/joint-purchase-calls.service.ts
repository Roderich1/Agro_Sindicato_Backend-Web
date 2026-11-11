import { api } from '../lib/axios';
import type {
  CreateJointPurchaseCallBody,
  EligibleResponsible,
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipant,
  JointPurchaseCallStatus,
  JointPurchaseCallSummary,
  UpdateJointPurchaseCallBody,
} from '../types/joint-purchase-calls';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;
const BASE = '/joint-purchase-calls';

/**
 * Las listas pueden llegar como arreglo o dentro de un sobre
 * (`{ calls }`, `{ participants }`, `{ items }`…). Se acepta cualquiera de las
 * formas; nada más se interpreta.
 */
function unwrap<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  const record = data as Record<string, unknown> | null | undefined;
  for (const key of [...keys, 'items']) {
    const inner = record?.[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

/** El servidor puede nombrar el id del usuario `id`, `user_ref` o `user_id`. */
function toResponsible(raw: unknown): EligibleResponsible | null {
  const row = raw as Record<string, unknown> | null;
  const id = row?.id ?? row?.user_ref ?? row?.user_id;
  if (typeof id !== 'string' || typeof row?.name !== 'string') return null;
  return { id, name: row.name, role: typeof row.role === 'string' ? row.role : '' };
}

export interface JointPurchaseCallFilter {
  campaignId?: string | null;
  status?: JointPurchaseCallStatus | null;
}

/**
 * E2 §4.1: rutas institucionales de convocatorias de compra conjunta (sólo
 * DIRECTIVA y ADMINISTRADOR del tenant, comprobado en el servidor). Online,
 * sin cola ni caché: cada acción de estado lleva `confirmed: true`.
 */
export const jointPurchaseCallsService = {
  list: ({ campaignId, status }: JointPurchaseCallFilter = {}) =>
    api
      .get<unknown>(BASE, {
        params: { ...(campaignId ? { campaignId } : {}), ...(status ? { status } : {}) },
      })
      .then((r) => unwrap<JointPurchaseCallSummary>(r.data, 'calls')),
  get: (id: string) => api.get<JointPurchaseCallDetail>(`${BASE}/${seg(id)}`).then((r) => r.data),
  create: (body: CreateJointPurchaseCallBody) => api.post<JointPurchaseCallDetail>(BASE, body).then((r) => r.data),
  update: (id: string, body: UpdateJointPurchaseCallBody) =>
    api.patch<JointPurchaseCallDetail>(`${BASE}/${seg(id)}`, body).then((r) => r.data),
  open: (id: string) =>
    api.post<unknown>(`${BASE}/${seg(id)}/open`, { confirmed: true }).then((r) => r.data),
  cancel: (id: string, reason: string) =>
    api.post<unknown>(`${BASE}/${seg(id)}/cancel`, { reason, confirmed: true }).then((r) => r.data),
  close: (id: string) =>
    api.post<unknown>(`${BASE}/${seg(id)}/close`, { confirmed: true }).then((r) => r.data),
  /** Sólo con el permiso E2-D6; sin él, 403 `PARTICIPANTS_FORBIDDEN`. */
  participants: (id: string) =>
    api
      .get<unknown>(`${BASE}/${seg(id)}/participants`)
      .then((r) => unwrap<JointPurchaseCallParticipant>(r.data, 'participants')),
  closing: (id: string) => api.get<JointPurchaseCallClosing>(`${BASE}/${seg(id)}/closing`).then((r) => r.data),
  eligibleResponsibles: () =>
    api
      .get<unknown>(`${BASE}/eligible-responsibles`)
      .then((r) =>
        unwrap<unknown>(r.data, 'responsibles', 'users')
          .map(toResponsible)
          .filter((row): row is EligibleResponsible => row !== null),
      ),
};
