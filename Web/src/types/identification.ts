import type { BaseUnit } from '../lib/quantity';

/**
 * E1 (identificación de productos reportados por el agricultor): formas de la
 * API institucional (`/catalog/identification-requests`, contrato
 * `docs/architecture/E1_IDENTIFICACION_PRODUCTOS_CONTRATO.md` §4.2). Los
 * campos van en snake_case, tal como responde el servidor. Ninguno identifica
 * al agricultor que reportó el producto (E1-D5): la API no lo envía.
 */
export type IdentificationStatus = 'PENDING' | 'LINKED';
/** Filtro de `GET /?status=` (por defecto `PENDING`). */
export type IdentificationStatusFilter = IdentificationStatus | 'ALL';
export type IdentificationUnit = 'L' | 'KG';
export type IdentificationResolutionKind = 'LINKED_EXISTING' | 'CREATED_PRODUCT';
export type IdentificationPhotoState = 'NONE' | 'STORED' | 'REMOVED';
export type IdentificationEventKind =
  | 'RECEIVED'
  | 'UPDATED'
  | 'PHOTO_RECEIVED'
  | 'PHOTO_REPLACED'
  | 'PHOTO_REMOVED'
  | 'LINKED'
  | 'RELINKED'
  | 'PRODUCT_CREATED'
  | 'NOTE';
/** Parecido calculado por el servidor (E1-D7). Sólo sugiere; nunca decide. */
export type IdentificationSimilarity = 'ALTA' | 'MEDIA' | 'BAJA';

export interface IdentificationPhoto {
  state: IdentificationPhotoState;
  sha256: string | null;
  consent_version: string | null;
  /** Sólo en la vista institucional. */
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  stored_at?: string | null;
}

export interface IdentificationResolution {
  kind: IdentificationResolutionKind;
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: BaseUnit;
  is_active: boolean;
  resolved_at: string;
}

export interface IdentificationPendingNote {
  text: string;
  at: string;
}

/** Vista institucional de una solicitud (§4.1 + `id` y metadatos de la foto). */
export interface IdentificationRequest {
  contractVersion: 1;
  /** Id del servidor: el que usan las rutas institucionales. */
  id: string;
  /** UUID del teléfono; no se muestra. */
  request_id: string;
  status: IdentificationStatus;
  local_name: string;
  active_ingredient: string | null;
  unit: IdentificationUnit;
  base_unit: BaseUnit;
  received_at: string;
  updated_at: string;
  photo: IdentificationPhoto;
  resolution: IdentificationResolution | null;
  pending_note: IdentificationPendingNote | null;
}

export interface IdentificationRequestList {
  contractVersion: 1;
  requests: IdentificationRequest[];
}

export interface IdentificationCandidate {
  product_ref: string;
  product_name: string;
  unit: string;
  base_unit: BaseUnit;
  is_active: boolean;
  is_alias: boolean;
  canonical_product_ref: string | null;
  similarity: IdentificationSimilarity;
  /** Qué coincidió: `name` y/o `active_ingredient`. */
  matched_on: string[];
}

export interface IdentificationEvent {
  at: string;
  kind: IdentificationEventKind;
  /** Sólo en decisiones institucionales; `null` cuando el evento es del agricultor (nunca se nombra). */
  actor: { name: string } | null;
  product_ref: string | null;
  product_name: string | null;
  detail: string | null;
}

export interface LinkIdentificationBody {
  product_ref: string;
  reason: string;
  confirmed: true;
}

export interface CreateProductIdentificationBody {
  name: string;
  active_ingredient: string | null;
  reason: string;
  confirmed: true;
}

export interface DeferIdentificationBody {
  note: string;
  confirmed: true;
}

/** Respuesta de `link`, `create-product` y `defer`: la vista vigente, o `{ changed: false }` si el vínculo ya era ése. */
export type IdentificationActionResult = IdentificationRequest | { changed: false };
