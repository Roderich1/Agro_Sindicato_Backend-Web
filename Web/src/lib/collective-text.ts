import axios from 'axios';
import type { ProposalLineStatus } from '../types/collective';

/** Motivo comprensible, sin cantidad ni conteo exacto de aportantes. */
export function statusReason(status: ProposalLineStatus, threshold?: number | null): string | null {
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
      return 'La cifra se retiró después de generar este borrador. Genere uno nuevo para ver el estado vigente.';
    case 'POLICY_PENDING':
      return 'La política de divulgación no está aprobada: no se muestran cifras.';
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
    if (status === 409) return 'POLICY_PENDING';
    if (status === 422) return 'Datos no válidos: revise la confirmación y el motivo.';
  }
  return fallback;
}

export function fmtDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
}
