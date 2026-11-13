/* Textos y tonos de StatusChip, separados del componente. */

/** `hidden`: sin cifra (candado y borde discontinuo; no es cero). */
export type ChipTone = 'positive' | 'neutral' | 'attention' | 'critical' | 'hidden';

/**
 * Texto y tono de cada estado. Los de divulgación (F07-POL-01) añaden el
 * motivo de `statusReason` en `title`. El color nunca es el único portador:
 * la etiqueta siempre dice el estado.
 */
export const STATUS_CHIP: Record<string, { label: string; tone: ChipTone }> = {
  // Divulgación (AnyStatus)
  DISCLOSED: { label: 'Publicado', tone: 'positive' },
  // E4 §5.1: estado histórico de F07-POL-01; se rotula con su política, no como «oculto por privacidad».
  SUPPRESSED_UNDER_THRESHOLD: { label: 'Sin cifra (F07-POL-01)', tone: 'hidden' },
  SUPPRESSED_REVISION: { label: 'Sin cifra publicada', tone: 'attention' },
  OVERFLOW: { label: 'Fuera de rango', tone: 'critical' },
  WITHDRAWN: { label: 'Retirado', tone: 'attention' },
  SUPERSEDED: { label: 'Sustituido', tone: 'attention' },
  POLICY_PENDING: { label: 'Política pendiente', tone: 'neutral' },
  WITHDRAWN_AFTER_SEAL: { label: 'Retirado tras sellar', tone: 'attention' },
  NO_DATA: { label: 'Sin cifra publicada', tone: 'neutral' },
  NOT_SEALED: { label: 'Sin sellar', tone: 'neutral' },
  // Campaña (CampaignStatus)
  PLANIFICADA: { label: 'Planificada', tone: 'neutral' },
  ABIERTA: { label: 'Abierta', tone: 'positive' },
  CERRADA: { label: 'Cerrada', tone: 'neutral' },
  CANCELADA: { label: 'Cancelada', tone: 'critical' },
  // Otros textos ya usados por la Web (legacy y bitácora)
  PENDIENTE: { label: 'Pendiente', tone: 'attention' },
  PARCIAL: { label: 'Parcial', tone: 'neutral' },
  PAGADA: { label: 'Pagada', tone: 'positive' },
  VENCIDA: { label: 'Vencida', tone: 'critical' },
  ACTIVA: { label: 'Activa', tone: 'positive' },
  INACTIVA: { label: 'Inactiva', tone: 'neutral' },
  ACTIVO: { label: 'Activo', tone: 'positive' },
  CAMBIADO: { label: 'Cambiado', tone: 'neutral' },
  FINALIZADO: { label: 'Finalizado', tone: 'neutral' },
  ENTRADA: { label: 'Entrada', tone: 'positive' },
  SALIDA: { label: 'Salida', tone: 'critical' },
  AJUSTE: { label: 'Ajuste', tone: 'attention' },
  REGISTRADA: { label: 'Registrada', tone: 'positive' },
  ANULADA: { label: 'Anulada', tone: 'critical' },
  BORRADOR: { label: 'Borrador', tone: 'neutral' },
  PROGRAMADA: { label: 'Programada', tone: 'neutral' },
  CONFIRMADA: { label: 'Confirmada', tone: 'positive' },
  RECIBIDA_PARCIAL: { label: 'Recepción parcial', tone: 'attention' },
  RECIBIDA: { label: 'Recibida', tone: 'positive' },
  COMPLETADO: { label: 'Completado', tone: 'positive' },
  CANCELADO: { label: 'Cancelado', tone: 'critical' },
  CREAR: { label: 'Crear', tone: 'positive' },
  ACTUALIZAR: { label: 'Actualizar', tone: 'neutral' },
  INACTIVAR: { label: 'Inactivar', tone: 'neutral' },
  ELIMINAR: { label: 'Eliminar', tone: 'critical' },
  ABRIR_CAMPANA: { label: 'Abrir campaña', tone: 'positive' },
  CERRAR_CAMPANA: { label: 'Cerrar campaña', tone: 'neutral' },
  AJUSTAR_STOCK: { label: 'Ajustar stock', tone: 'attention' },
  REGISTRAR_PAGO: { label: 'Registrar pago', tone: 'neutral' },
  SINCRONIZAR: { label: 'Sincronizar', tone: 'neutral' },
  OTRO: { label: 'Otro', tone: 'neutral' },
};

/** true si el estado tiene texto propio (no se mostraría el código en bruto). */
export function isKnownStatus(status: string): boolean {
  return Object.prototype.hasOwnProperty.call(STATUS_CHIP, status);
}

/** Texto y tono de un estado; uno desconocido se muestra tal cual, en tono neutro. */
export function statusChipEntry(status: string): { label: string; tone: ChipTone } {
  return isKnownStatus(status) ? STATUS_CHIP[status]! : { label: status, tone: 'neutral' };
}

/** Texto del estado para personas (también para exportaciones). */
export function statusChipLabel(status: string): string {
  return statusChipEntry(status).label;
}
