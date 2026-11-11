import { fmtCalendarDate } from '../lib/format';
import type { Campaign } from '../types/campaigns';

/**
 * Fechas de campaña (sesión B, 2026-11-10).
 *
 * `startDate` y `estimatedEndDate` son días de calendario: el servidor guarda
 * `new Date('2026-10-15')`, medianoche UTC (`campaign-management.use-case.ts:79-80`).
 * Formatearlos en la zona local (UTC−4) mostraría el día anterior, así que se
 * formatean en UTC con `fmtCalendarDate` (`lib/format.ts`). `closedAt` sí es un
 * instante (hora del servidor al cerrar) y se muestra con `fmtDateTime`.
 */
export function fmtCampaignDay(value: string | null | undefined): string | null {
  return fmtCalendarDate(value);
}

/** Texto literal de la regla de presentación «fin estimado vencido». */
export const OVERDUE_TEXT = 'Fin estimado vencido · sin cierre registrado';

/**
 * Regla de presentación declarada (matriz C4: el servidor no la calcula):
 * una campaña `ABIERTA` cuyo día de fin estimado ya pasó (anterior al día de
 * hoy en el navegador) y sin cierre registrado. No cierra nada ni sugiere
 * cerrar: cerrar es explícito (F07 sellado:24,29).
 */
export function isEstimatedEndOverdue(campaign: Pick<Campaign, 'status' | 'estimatedEndDate' | 'closedAt'>, now: Date = new Date()): boolean {
  if (campaign.status !== 'ABIERTA' || campaign.closedAt || !campaign.estimatedEndDate) return false;
  const end = campaign.estimatedEndDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const pad = (value: number) => String(value).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return end < today;
}
