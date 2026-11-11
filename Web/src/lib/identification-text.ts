import axios from 'axios';
import type {
  IdentificationEventKind,
  IdentificationResolutionKind,
  IdentificationSimilarity,
} from '../types/identification';
import { collectiveError } from './collective-text';

/** E1 §6: textos de la vista «Por identificar», sin códigos internos a la vista. */

export const EVENT_LABEL: Record<IdentificationEventKind, string> = {
  RECEIVED: 'Recibida',
  UPDATED: 'Datos actualizados',
  PHOTO_RECEIVED: 'Foto recibida',
  PHOTO_REPLACED: 'Foto reemplazada',
  PHOTO_REMOVED: 'Foto retirada',
  LINKED: 'Vinculada',
  RELINKED: 'Vínculo corregido',
  PRODUCT_CREATED: 'Producto colectivo creado',
  NOTE: 'Nota',
};

export const SIMILARITY_LABEL: Record<IdentificationSimilarity, string> = {
  ALTA: 'Parecido alto',
  MEDIA: 'Parecido medio',
  BAJA: 'Parecido bajo',
};

export const RESOLUTION_LABEL: Record<IdentificationResolutionKind, string> = {
  LINKED_EXISTING: 'Vinculada a un producto existente',
  CREATED_PRODUCT: 'Producto colectivo creado',
};

export const MATCHED_ON_LABEL: Record<string, string> = {
  name: 'nombre',
  active_ingredient: 'ingrediente activo',
};

export const PRODUCT_NAME_TAKEN_TEXT = 'Ya existe un producto con ese nombre; vincule con él en su lugar.';

const ERROR_TEXT: Record<string, string> = {
  CONFIRMATION_REQUIRED: 'Falta la confirmación: marque la casilla antes de guardar.',
  REASON_REQUIRED: 'Escriba el motivo (o la nota): es obligatorio y admite hasta 280 caracteres.',
  PRODUCT_NOT_FOUND: 'El producto elegido ya no existe en el catálogo del sindicato.',
  PRODUCT_INACTIVE: 'El producto elegido está inactivo: elija un producto activo.',
  UNIT_DIMENSION_MISMATCH: 'El producto elegido no es de la misma dimensión que la unidad reportada (L con L, KG con KG).',
  PRODUCT_NAME_TAKEN: PRODUCT_NAME_TAKEN_TEXT,
  PAYLOAD_INVALID: 'Datos no válidos: revise los campos e inténtelo de nuevo.',
};

/** `errorCode` del cuerpo de error (E1 §4), o `null`. */
export function identificationErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err) || !err.response) return null;
  const data = err.response.data as { errorCode?: unknown; message?: unknown } | undefined;
  if (typeof data?.errorCode === 'string') return data.errorCode;
  return typeof data?.message === 'string' && data.message in ERROR_TEXT ? data.message : null;
}

/** Mensaje en español por `errorCode`; lo desconocido, con el texto general de las vistas colectivas. */
export function identificationError(err: unknown, fallback: string): string {
  const code = identificationErrorCode(err);
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (axios.isAxiosError(err) && err.response?.status === 404) return 'La solicitud ya no existe o no pertenece a su organización.';
  return collectiveError(err, fallback);
}

/** Error al pedir la foto (el cuerpo de error llega como blob: se decide por el estado). */
export function photoError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 404) return 'La foto ya no está disponible: fue retirada o no existe.';
  if (axios.isAxiosError(err) && err.response?.status === 503) return 'El almacenamiento de fotos no está disponible en este momento.';
  return collectiveError(err, 'No fue posible cargar la foto.');
}
