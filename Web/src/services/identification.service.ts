import { api } from '../lib/axios';
import type {
  CreateProductIdentificationBody,
  DeferIdentificationBody,
  IdentificationActionResult,
  IdentificationCandidate,
  IdentificationEvent,
  IdentificationRequest,
  IdentificationRequestList,
  IdentificationStatusFilter,
  LinkIdentificationBody,
} from '../types/identification';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;
const BASE = '/catalog/identification-requests';

/**
 * Las listas pueden llegar como arreglo o dentro de un sobre
 * (`{ contractVersion, requests }`, como `GET /` del agricultor). Se acepta
 * cualquiera de las dos formas; nada más se interpreta.
 */
function unwrap<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null | undefined)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * E1 §4.2: rutas institucionales de identificación de productos reportados
 * (sólo DIRECTIVA y ADMINISTRADOR del tenant, comprobado en el servidor).
 * Online, sin cola ni caché. La foto se pide como `blob` con la sesión: la
 * Web nunca usa una URL de la API en un `<img>`.
 */
export const identificationService = {
  list: (status: IdentificationStatusFilter = 'PENDING') =>
    api
      .get<IdentificationRequestList | IdentificationRequest[]>(BASE, { params: { status } })
      .then((r) => unwrap<IdentificationRequest>(r.data, 'requests')),
  candidates: (id: string) =>
    api.get<unknown>(`${BASE}/${seg(id)}/candidates`).then((r) => unwrap<IdentificationCandidate>(r.data, 'candidates')),
  history: (id: string) =>
    api.get<unknown>(`${BASE}/${seg(id)}/history`).then((r) => unwrap<IdentificationEvent>(r.data, 'events')),
  /** Binario autorizado (`Cache-Control: private, no-store`); quien lo muestre crea y revoca su URL local. */
  photoBlob: (id: string) =>
    api.get<Blob>(`${BASE}/${seg(id)}/photo`, { responseType: 'blob' }).then((r) => r.data),
  link: (id: string, body: LinkIdentificationBody) =>
    api.post<IdentificationActionResult>(`${BASE}/${seg(id)}/link`, body).then((r) => r.data),
  createProduct: (id: string, body: CreateProductIdentificationBody) =>
    api.post<IdentificationActionResult>(`${BASE}/${seg(id)}/create-product`, body).then((r) => r.data),
  defer: (id: string, body: DeferIdentificationBody) =>
    api.post<IdentificationActionResult>(`${BASE}/${seg(id)}/defer`, body).then((r) => r.data),
};
