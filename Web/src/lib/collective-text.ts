import axios from 'axios';
import type { AnyStatus, SealBlock } from '../types/collective';

/** Motivo comprensible, sin cantidad ni conteo exacto de aportantes. */
export function statusReason(status: AnyStatus, threshold?: number | null): string | null {
  switch (status) {
    case 'SUPPRESSED_UNDER_THRESHOLD':
      return threshold
        ? `Menos de ${threshold} agricultores aportaron: la cifra no se publica para no revelar aportes individuales.`
        : 'Menos aportantes que el umbral de la política: la cifra no se publica para no revelar aportes individuales.';
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
