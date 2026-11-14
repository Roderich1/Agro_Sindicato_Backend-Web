import axios from 'axios';
import type { AnyStatus, DisclosurePolicy, SealBlock } from '../types/collective';

/** Estado de una campaña, para personas. */
export const CAMPAIGN_STATUS_TEXT: Record<string, string> = {
  PLANIFICADA: 'Planificada',
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

/**
 * E4 §5.1: rótulo de la política con que se decidió una cifra, para mostrarla
 * junto a lo sellado, los borradores, las tendencias y el Excel. `threshold`
 * es el umbral que trae la respuesta (3 con `F07-POL-01`, `null` con `F07-POL-02`).
 */
export function policyText(policy: DisclosurePolicy | string, threshold?: number | null): string {
  if (policy === 'F07-POL-01') return `F07-POL-01 (mínimo de ${threshold ?? 3} aportantes por cifra)`;
  if (policy === 'F07-POL-02') return 'F07-POL-02 (totales sin nombres, sin mínimo de aportantes)';
  return policy;
}

/** E4 §5.1 y ayuda de CONV-4: el riesgo aceptado de los totales sin umbral, dicho sin «anónimo». */
export const SMALL_GROUP_NOTE =
  'Son datos agregados, sin nombres. Con pocas personas aportando, quien sepa quién participó podría deducir cuánto aportó cada una.';

/** Cifra anterior a la vista mientras hay cambios sin publicar (sólo con `F07-POL-01`; con `F07-POL-02` no ocurre). */
export const PENDING_CHANGES_TEXT = 'Hay cambios recibidos que todavía no se publican: se muestra la cifra anterior.';

/**
 * Motivo comprensible, sin cantidad ni conteo exacto de aportantes.
 * `SUPPRESSED_UNDER_THRESHOLD` sólo lo produce `F07-POL-01` (en lo sellado o
 * en los borradores anteriores es un estado histórico): se rotula con esa
 * política, sin «oculto por privacidad» ni «anónimo» (E4 §5.1).
 */
export function statusReason(status: AnyStatus, threshold?: number | null): string | null {
  switch (status) {
    case 'SUPPRESSED_UNDER_THRESHOLD':
      return `Sin cifra según la política F07-POL-01 (mínimo de ${threshold ?? 3} aportantes).`;
    case 'SUPPRESSED_REVISION':
      return 'La cifra anterior se retiró por una baja, una disputa o una reagrupación, y aún no hay cambios suficientes para publicar otra.';
    case 'OVERFLOW':
      return 'El total supera el rango numérico admitido; no se trunca ni se redondea.';
    case 'WITHDRAWN':
      return 'El resumen ya no publica una cifra para este producto. Genere un borrador nuevo para ver el estado vigente.';
    case 'SUPERSEDED':
      return 'El resumen publica ahora una cifra más reciente. Genere un borrador nuevo para verla.';
    case 'POLICY_PENDING':
      return 'La política de divulgación no está aprobada: no se muestran cifras.';
    case 'WITHDRAWN_AFTER_SEAL':
      return 'Un aportante retiró su aporte después del sellado: la cifra sellada ya no se muestra. El dato sellado no cambió.';
    case 'NO_DATA':
      return 'La versión sellada de esta campaña no tiene datos de este producto y unidad. No significa cero.';
    case 'NOT_SEALED':
      return 'Esta campaña no tiene una versión sellada: las tendencias sólo usan versiones selladas.';
    default:
      return null;
  }
}

/** Mensaje de error sin detalles internos. */
export function collectiveError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Sin conexión con el servidor. La Web no guarda operaciones para después: vuelva a intentarlo en línea.';
    const status = err.response.status;
    if (status === 403) return 'Su rol no tiene acceso a la información colectiva.';
    if (status === 404) return 'No existe o no pertenece a su organización.';
    if (status === 409) {
      const message = (err.response.data as { message?: unknown } | undefined)?.message;
      if (message === 'POLICY_PENDING') return 'POLICY_PENDING';
      if (message === 'SEALING_DISABLED' || message === 'CAMPAIGN_NOT_CLOSED') return sealBlockText(message);
      if (message === 'SEAL_REVIEW_STALE')
        return 'Los datos cambiaron después de su revisión: no se selló nada. Revise de nuevo y confirme.';
      return 'Los datos cambiaron mientras tanto. Recargue la página y vuelva a intentarlo.';
    }
    if (status === 422) return 'Datos no válidos: revise la confirmación y el motivo.';
  }
  return fallback;
}

/** Por qué no se puede sellar todavía, en palabras simples. */
export function sealBlockText(block: SealBlock): string {
  switch (block) {
    case 'SEALING_DISABLED':
      return 'El sellado está desactivado en este servidor hasta que la app móvil en uso sepa tratar una campaña sellada.';
    case 'POLICY_PENDING':
      return 'La política de divulgación no está aprobada: no se sella una versión sin cifras autorizadas.';
    case 'CAMPAIGN_NOT_CLOSED':
      return 'Sólo se sella una campaña cerrada. Cerrar y sellar son pasos distintos.';
  }
}

export function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
}
