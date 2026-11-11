/**
 * Presentación compartida por las dos variantes del Resumen (sólo desarrollo).
 * Nada se suma ni se deduce: se agrupa por unidad (L y KG nunca se mezclan),
 * se cuentan filas y se formatea lo que el servidor publicó.
 */
import { statusReason } from '../../../lib/collective-text';
import { fmtPercent } from '../../../lib/format';
import { COLLECTIVE_PATHS } from '../../../lib/navigation';
import { formatQuantity, isBaseQuantity } from '../../../lib/quantity';
import type { Campaign } from '../../../types/campaigns';
import type { CollectiveSummary, Coverage, SummaryCell } from '../../../types/collective';

export type Unit = 'L' | 'KG';

export const UNIT_LABEL: Record<Unit, string> = { L: 'Litros (L)', KG: 'Kilogramos (KG)' };

export interface NeedRow {
  key: string;
  testId: string;
  name: string;
  unit: Unit;
  status: SummaryCell['status'];
  /** Cifra publicada con unidad, o `null` si no se publica (o el dato no es válido). */
  text: string | null;
  /** El servidor publicó la cifra pero no supera la validación: se avisa, no se muestra. */
  invalid: boolean;
  /** Ancho relativo dentro de su unidad (0–100), sólo para cifras publicadas mayores que cero. */
  share: number | null;
  contributors: number | null;
  asOf: string | null;
  pending: boolean;
  reason: string | null;
}

/** Necesidades declaradas, agrupadas por unidad; cada unidad con su propia escala. */
export function needGroups(summary: CollectiveSummary): { unit: Unit; rows: NeedRow[] }[] {
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const threshold = summary.disclosure.threshold;
  return (['L', 'KG'] as const)
    .map((unit) => {
      const cells = needs.filter((cell) => cell.presentation_unit === unit);
      const values = cells.map((cell) => (cell.status === 'DISCLOSED' && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : null));
      const max = values.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
      const rows = cells.map((cell, index): NeedRow => {
        const disclosed = cell.status === 'DISCLOSED';
        const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
        const value = values[index] ?? null;
        return {
          key: `${cell.product_ref}|${cell.base_unit}`,
          testId: `need-${cell.product_ref}-${cell.base_unit}`,
          name: cell.product_name,
          unit,
          status: cell.status,
          text,
          invalid: disclosed && text === null,
          share: disclosed && value !== null && value > 0n && max > 0n ? Math.max(Number((value * 1000n) / max) / 10, 1) : null,
          contributors: disclosed ? cell.contributors : null,
          asOf: disclosed ? cell.data_as_of : null,
          pending: disclosed && cell.pending_changes,
          reason: disclosed ? null : statusReason(cell.status, threshold),
        };
      });
      return { unit, rows };
    })
    .filter((group) => group.rows.length > 0);
}

/** Conteo con plural explícito: «1 producto», «4 productos». */
export function plural(count: number, one: string, many: string): string {
  return `${new Intl.NumberFormat('es-BO').format(count)} ${count === 1 ? one : many}`;
}

/** «4 de 6 productos con cifra publicada»: conteo de filas, nunca de cantidades. */
export function publishedCount(summary: CollectiveSummary): { published: number; total: number } {
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  return { published: needs.filter((cell) => cell.status === 'DISCLOSED').length, total: needs.length };
}

/** Cobertura «6 de 9» y su porcentaje sólo cuando el denominador lo permite. */
export function coverageText(coverage: Coverage): { ratio: string; percent: string | null } {
  return {
    ratio: `${coverage.members_with_contribution} de ${coverage.linked_members}`,
    percent: fmtPercent(coverage.members_with_contribution, coverage.linked_members),
  };
}

export interface PendingAction {
  key: string;
  text: string;
  /** De qué dato sale: se muestra al lado para que nada parezca inventado. */
  source: string;
  link?: { to: string; label: string };
}

/**
 * Acciones pendientes que se desprenden de los datos recibidos, sin cálculos:
 * versión sin sellar, cifras con cambios pendientes, filas sin cifra y el
 * borrador (que se genera sólo con un botón explícito en su vista).
 */
export function pendingActions(summary: CollectiveSummary, campaign: Campaign | null): PendingAction[] {
  const query = `?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`;
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const pending = needs.filter((cell) => cell.status === 'DISCLOSED' && cell.pending_changes).length;
  const hidden = needs.filter((cell) => cell.status !== 'DISCLOSED').length;
  const actions: PendingAction[] = [];
  if (needs.length > 0) {
    actions.push({
      key: 'draft',
      text: 'Revisar el borrador de la propuesta conjunta con estas necesidades.',
      source: 'Necesidades declaradas publicadas',
      link: { to: `${COLLECTIVE_PATHS.proposals}${query}`, label: 'Revisar borrador' },
    });
  }
  if (pending > 0) {
    actions.push({
      key: 'pending',
      text: `${plural(pending, 'producto tiene', 'productos tienen')} cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.`,
      source: 'Cambios pendientes del servidor',
    });
  }
  if (hidden > 0) {
    actions.push({
      key: 'hidden',
      text: `${plural(hidden, 'producto', 'productos')} sin cifra publicada; el motivo está en su fila.`,
      source: 'Estado de divulgación',
    });
  }
  if (!summary.seal) {
    actions.push({
      key: 'seal',
      text:
        campaign?.status === 'CERRADA'
          ? 'La campaña está cerrada y no tiene versión sellada.'
          : 'Sin versión sellada. Sólo se sella una campaña cerrada: cerrar y sellar son pasos distintos.',
      source: 'Estado de la campaña y sellado',
      link: { to: COLLECTIVE_PATHS.campaignDetail(summary.campaign.campaign_ref), label: 'Ver campaña' },
    });
  }
  return actions;
}

export function coverageLink(summary: CollectiveSummary): string {
  return `${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`;
}
