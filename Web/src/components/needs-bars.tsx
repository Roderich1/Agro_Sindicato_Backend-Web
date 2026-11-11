import { fmtDateTime, statusReason } from '../lib/collective-text';
import { formatQuantity, isBaseQuantity } from '../lib/quantity';
import type { SummaryCell } from '../types/collective';
import { PendingChangesNote } from './collective-ui';
import { StatusChip } from './ui';

type Unit = 'L' | 'KG';

const UNIT_TITLE: Record<Unit, string> = { L: 'Litros (L)', KG: 'Kilogramos (KG)' };
const UNIT_LIST: Record<Unit, string> = { L: 'En litros', KG: 'En kilogramos' };
const COUNT = new Intl.NumberFormat('es-BO');

/**
 * Cifras por producto agrupadas por unidad (variante «Analítica comparativa»
 * del Resumen, elegida por el autor el 2026-11-10). Presentación pura: no suma,
 * no resta ni deduce nada.
 *
 * - L y KG en grupos y escalas separadas; nunca se comparan entre sí.
 * - Orden por nombre del producto, nunca por cantidad (no es una prioridad).
 * - Una cifra publicada se escribe exacta y grande; con `bars`, una barra en la
 *   escala de su unidad, sólo si es mayor que cero («0 L» va sin barra).
 * - Una fila sin cifra publicada muestra su estado y su motivo, sin número,
 *   barra ni cero, y «aportantes no revelados».
 * - En pantallas estrechas la cifra pasa a su propia línea; nombres largos y
 *   cifras como «123.456.789,012 L» se parten (`min-w-0`, `overflow-wrap`).
 */
export function NeedsBars({ cells, threshold, bars = true }: { cells: SummaryCell[]; threshold: number | null; bars?: boolean }) {
  const groups = (['L', 'KG'] as const)
    .map((unit) => ({ unit, cells: sortByName(cells.filter((cell) => cell.presentation_unit === unit)) }))
    .filter((group) => group.cells.length > 0);
  return (
    <div className={`grid divide-y divide-slate-100 ${groups.length > 1 ? '2xl:grid-cols-2 2xl:divide-x 2xl:divide-y-0' : ''}`}>
      {groups.map((group) => (
        <UnitGroup key={group.unit} unit={group.unit} cells={group.cells} threshold={threshold} bars={bars} />
      ))}
    </div>
  );
}

function sortByName(cells: SummaryCell[]): SummaryCell[] {
  return [...cells].sort((a, b) => a.product_name.localeCompare(b.product_name, 'es', { sensitivity: 'base' }));
}

function UnitGroup({ unit, cells, threshold, bars }: { unit: Unit; cells: SummaryCell[]; threshold: number | null; bars: boolean }) {
  const values = cells.map((cell) => (cell.status === 'DISCLOSED' && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : null));
  const max = values.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
  return (
    <div className="min-w-0 px-5 py-4">
      <h3 className="text-xs font-semibold text-slate-600">{UNIT_TITLE[unit]}</h3>
      <ul className="mt-2 space-y-4" aria-label={UNIT_LIST[unit]}>
        {cells.map((cell, index) => {
          const value = values[index] ?? null;
          const share = bars && value !== null && value > 0n && max > 0n ? Math.max(Number((value * 1000n) / max) / 10, 1) : null;
          return <FigureRow key={`${cell.product_ref}|${cell.base_unit}`} cell={cell} threshold={threshold} share={share} />;
        })}
      </ul>
    </div>
  );
}

function FigureRow({ cell, threshold, share }: { cell: SummaryCell; threshold: number | null; share: number | null }) {
  const disclosed = cell.status === 'DISCLOSED';
  const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
  return (
    <li className="min-w-0" data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 basis-48 text-sm font-semibold text-ink [overflow-wrap:anywhere]">
          {cell.product_name} <span className="whitespace-nowrap text-xs font-normal text-slate-600">{cell.presentation_unit}</span>{' '}
          <span className="inline-block align-middle">
            <StatusChip status={cell.status} threshold={threshold} />
          </span>
        </p>
        {disclosed &&
          (text === null ? (
            <span className="text-sm font-semibold text-red-800">Dato no válido recibido del servidor; no se muestra.</span>
          ) : (
            <span className="min-w-0 text-2xl font-bold leading-tight tabular-nums text-ink [overflow-wrap:anywhere]" data-figure>
              {text}
            </span>
          ))}
      </div>
      {disclosed ? (
        <>
          {share !== null && text !== null && (
            <div className="mt-2 h-2.5 rounded-full bg-slate-100" aria-hidden="true" data-bar-track>
              <div className="h-2.5 rounded-full bg-brand-700" style={{ width: `${share}%` }} />
            </div>
          )}
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            {cell.contributors !== null && (
              <>
                {COUNT.format(cell.contributors)} {cell.contributors === 1 ? 'aportante' : 'aportantes'} ·{' '}
              </>
            )}
            datos hasta {fmtDateTime(cell.data_as_of)}
          </p>
          {cell.pending_changes && <PendingChangesNote />}
        </>
      ) : (
        <>
          <p className="mt-1 text-xs leading-snug text-slate-600">{statusReason(cell.status, threshold)}</p>
          <p className="mt-0.5 text-xs text-slate-500">aportantes no revelados</p>
        </>
      )}
    </li>
  );
}
