import axios from 'axios';
import { OFFLINE_MESSAGE } from './format';
import type { FailureCode, JobStatus, ReasonCode, ResultStatus, StopCode, Validity, ValidityReason } from '../types/estimation';

/** F12-EST-06 (#179): textos de INT-09 para personas, sin códigos internos a la vista. */

export const RESULT_STATUS_TEXT: Record<ResultStatus, string> = {
  ESTIMATED: 'Estimado',
  INSUFFICIENT_DATA: 'Datos insuficientes',
  INCOMPATIBLE_DATA: 'Datos incompatibles',
  CALCULATION_FAILED: 'Cálculo fallido',
};

export const REASON_TEXT: Record<ReasonCode, string> = {
  LAST_RELEVANT_CAMPAIGN_NOT_VERIFIED: 'La campaña comparable inmediatamente anterior no tiene consumo comprobado.',
  SPAN_TOO_SHORT: 'Hay menos de tres campañas comparables consecutivas con consumo comprobado.',
  NO_SERIES: 'No hay serie de consumo de este producto.',
  MIXED_UNITS: 'Las cifras selladas de este producto están en unidades distintas: masa y volumen no se mezclan.',
  NO_COMPARABLE_CAMPAIGNS: 'No hay campañas comparables anteriores con las que estimar.',
  COVERAGE_UNKNOWN: 'Alguna campaña del tramo no tiene la cobertura identificada.',
  CALCULATION_ERROR: 'El cálculo de este producto falló.',
};

export const VALIDITY_TEXT: Record<Validity, string> = {
  CURRENT: 'Vigente',
  OUTDATED: 'Desactualizado',
  SUPERSEDED: 'Sustituido',
  NOT_USABLE: 'No utilizable',
};

export const VALIDITY_REASON_TEXT: Record<ValidityReason, string> = {
  RUN_FAILED: 'La ejecución falló: no tiene cifras.',
  NO_FIGURE: 'Este resultado no tiene cifra.',
  LATER_RUN: 'Una ejecución calculada posterior lo reemplaza.',
  SOURCES_CHANGED: 'Las cifras, las campañas o las asociaciones de la serie cambiaron desde el cálculo.',
  CLASSIFICATION_CORRECTED: 'Se corrigió la clasificación de una campaña que se usó.',
  SOURCES_WITHDRAWN: 'Una cifra que se usó ya no se divulga: la estimación no se muestra.',
};

export const JOB_STATUS_TEXT: Record<JobStatus, string> = {
  QUEUED: 'En cola',
  RUNNING: 'Procesándose',
  COMPLETED: 'Terminado',
  NOT_EXECUTED: 'No se ejecutó',
};

export const STOP_TEXT: Record<StopCode, string> = {
  POLICY_PENDING: 'La política de divulgación dejó de permitirlo antes de calcular. No se calculó nada.',
  REQUESTER_NOT_AUTHORIZED: 'Quien lo pidió perdió el permiso antes de calcular. No se calculó nada.',
  TARGET_CAMPAIGN_NOT_ELIGIBLE:
    'La campaña dejó de estar planificada o abierta, o perdió su clasificación, antes de calcular. No se calculó nada.',
};

export const FAILURE_TEXT: Record<FailureCode, string> = {
  CALCULATION_FAILED: 'El cálculo falló. La ejecución queda registrada, sin cifras.',
  RETRIES_EXHAUSTED: 'Se agotaron los reintentos ante errores transitorios. La ejecución queda registrada, sin cifras.',
};

/**
 * Clase de un error de INT-09. Cada una se muestra distinto:
 * - offline: sin respuesta del servidor, o el proxy (nginx, Vite) no alcanza la API: 502 o 504 (los datos ya
 *   mostrados no se borran, se marcan como no actualizados);
 * - session: la sesión venció (el cliente HTTP intenta renovarla y, si no puede, lleva al inicio de sesión);
 * - forbidden: el rol ya no tiene acceso;
 * - policy: la política de divulgación está pendiente (409 POLICY_PENDING);
 * - not-found: la referencia no existe o es de otra organización;
 * - invalid: la petición no es admisible (400, 422);
 * - other: cualquier otro.
 * Las cuatro primeras tras `offline` retiran de la pantalla los datos institucionales.
 */
export type EstimationErrorKind = 'offline' | 'session' | 'forbidden' | 'policy' | 'not-found' | 'invalid' | 'other';

export interface EstimationError {
  kind: EstimationErrorKind;
  message: string;
}

const CODE_TEXT: Record<string, string> = {
  TARGET_CAMPAIGN_NOT_FOUND: 'La campaña no existe o no pertenece a su organización.',
  PRODUCT_NOT_FOUND: 'Un producto elegido no existe o no pertenece a su organización.',
  JOB_NOT_FOUND: 'El trabajo no existe o no pertenece a su organización.',
  RUN_NOT_FOUND: 'La ejecución no existe o no pertenece a su organización.',
  TARGET_CAMPAIGN_NOT_ELIGIBLE: 'Sólo se estima para una campaña planificada o abierta.',
  TARGET_CAMPAIGN_NOT_CLASSIFIED:
    'La campaña no está clasificada en una temporada de comparabilidad: no hay campañas comparables con las que estimar.',
  PRODUCT_NOT_ESTIMABLE: 'Un producto elegido no es canónico o su unidad no es comparable: no se estima.',
  REQUEST_ID_REUSED: 'La solicitud no coincide con la que se envió antes con el mismo identificador. Vuelva a solicitar.',
};

export const POLICY_PENDING_TEXT =
  'La política de divulgación no está aprobada: no se solicita ni se muestra ninguna estimación.';

export function estimationError(err: unknown, fallback: string): EstimationError {
  if (axios.isAxiosError(err)) {
    if (!err.response) return { kind: 'offline', message: OFFLINE_MESSAGE };
    const status = err.response.status;
    if (status === 502 || status === 504) return { kind: 'offline', message: 'El servidor de la API no responde. Vuelva a intentarlo en unos minutos.' };
    const raw = (err.response.data as { message?: unknown } | undefined)?.message;
    const code = typeof raw === 'string' ? raw : null;
    if (status === 401) return { kind: 'session', message: 'Su sesión venció. Vuelva a iniciar sesión.' };
    if (status === 403) return { kind: 'forbidden', message: 'Su rol ya no tiene acceso a la estimación del consumo.' };
    if (status === 409 && code === 'POLICY_PENDING') return { kind: 'policy', message: POLICY_PENDING_TEXT };
    if (status === 404) return { kind: 'not-found', message: (code && CODE_TEXT[code]) ?? 'No existe o no pertenece a su organización.' };
    if (status === 422 || status === 400) return { kind: 'invalid', message: (code && CODE_TEXT[code]) ?? 'La solicitud no es válida.' };
    if (status === 409) return { kind: 'other', message: (code && CODE_TEXT[code]) ?? fallback };
  }
  return { kind: 'other', message: fallback };
}

/** Errores tras los que no se conserva a la vista ningún dato institucional de la consulta anterior. */
export function clearsInstitutionalData(kind: EstimationErrorKind): boolean {
  return kind === 'session' || kind === 'forbidden' || kind === 'policy' || kind === 'not-found';
}

/** Identificador de la solicitud (UUID v4), también fuera de un contexto seguro. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
