import type { HeroStatItem } from '../../components/a/coverage-figure';
import { fmtDateTime } from '../../lib/collective-text';
import type { SummaryCell } from '../../types/collective';

export const COUNT = new Intl.NumberFormat('es-BO');

export function plural(count: number, one: string, many: string): string {
  return `${COUNT.format(count)} ${count === 1 ? one : many}`;
}

/**
 * Indicadores de la cabecera: recuentos de filas por estado (nunca cantidades)
 * y «Cifra más reciente». Sin cifras publicadas no hay «Cifra más reciente».
 */
export function heroStats(needs: SummaryCell[], cells: SummaryCell[]): HeroStatItem[] {
  const published = needs.filter((cell) => cell.status === 'DISCLOSED').length;
  const previous = needs.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = needs.length - published - previous;
  const stats: HeroStatItem[] = [
    {
      key: 'published',
      label: 'Necesidades publicadas',
      value: needs.length === 0 ? 'Ninguna todavía' : plural(published, 'producto', 'productos'),
      testId: 'needs-published',
    },
  ];
  if (previous > 0) stats.push({ key: 'previous', label: 'Sin cifra (F07-POL-01)', value: plural(previous, 'producto', 'productos'), testId: 'needs-hidden' });
  if (other > 0) stats.push({ key: 'other', label: 'Sin cifra publicada', value: plural(other, 'producto', 'productos'), testId: 'needs-other' });
  const latest = latestDataAsOf(cells);
  if (latest) stats.push({ key: 'latest', label: 'Cifra más reciente', value: fmtDateTime(latest), testId: 'latest-figure' });
  return stats;
}

function latestDataAsOf(cells: SummaryCell[]): string | null {
  let latest: { at: number; value: string } | null = null;
  for (const cell of cells) {
    if (cell.status !== 'DISCLOSED' || !cell.data_as_of) continue;
    const at = Date.parse(cell.data_as_of);
    if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, value: cell.data_as_of };
  }
  return latest?.value ?? null;
}

export type NeedsFilter = 'all' | 'L' | 'KG' | 'hidden';

export const FILTERS: { value: NeedsFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'L', label: 'Litros' },
  { value: 'KG', label: 'Kilogramos' },
  { value: 'hidden', label: 'Sin cifra' },
];

export const STEPS = [
  { key: 'ABIERTA', label: 'Abierta' },
  { key: 'CERRADA', label: 'Cerrada' },
  { key: 'SELLADA', label: 'Sellada' },
];
