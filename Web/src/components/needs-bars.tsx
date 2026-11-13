import { fmtDateTime, statusReason } from '../lib/collective-text';
import { formatQuantity, isBaseQuantity } from '../lib/quantity';
import type { CellStatus, SummaryCell } from '../types/collective';
import { QuantityFigure } from './a/quantity-figure';
import { Chip, ICON, PrivacyChip, statusChipLabel } from './ui';

type Unit = 'L' | 'KG';

const UNIT_TITLE: Record<Unit, string> = { L: 'En litros', KG: 'En kilogramos' };
const COUNT = new Intl.NumberFormat('es-BO');

/**
 * Cifras por producto agrupadas por unidad (láminas 03 y 35). Presentación
 * pura: no suma, no resta ni deduce nada.
 *
 * - L y KG en columnas y escalas separadas; nunca se comparan entre sí. Las
 *   dos columnas aparecen lado a lado sólo si la tarjeta es ancha (consulta de
 *   contenedor); si no, una debajo de la otra.
 * - Orden por nombre del producto, nunca por cantidad (no es una prioridad).
 * - Una cifra publicada se escribe exacta y grande; con `bars`, una barra en la
 *   escala de su unidad, sólo si es mayor que cero («0 L» va sin barra).
 * - Una fila sin cifra muestra el chip punteado con el texto de su estado
 *   (H-06: «Oculta por privacidad» sólo para el umbral), su motivo y
 *   «aportantes no revelados»: sin número, barra ni cero.
 * - Sin `bars` (consumo publicado, columna lateral) es una lista compacta.
 */
export function NeedsBars({ cells, threshold, bars = true }: { cells: SummaryCell[]; threshold: number | null; bars?: boolean }) {
  const groups = (['L', 'KG'] as const)
    .map((unit) => ({ unit, cells: sortByName(cells.filter((cell) => cell.presentation_unit === unit)) }))
    .filter((group) => group.cells.length > 0);
  if (!bars) {
    return (
      <ul className="divide-y divide-line" aria-label="Por producto">
        {groups.flatMap((group) => group.cells.map((cell) => <CompactRow key={`${cell.product_ref}|${cell.base_unit}`} cell={cell} threshold={threshold} />))}
      </ul>
    );
  }
  return (
    <div className="@container">
      <div className={`grid gap-x-8 gap-y-6 ${groups.length > 1 ? '@[40rem]:grid-cols-2' : ''}`}>
        {groups.map((group) => (
          <UnitGroup key={group.unit} unit={group.unit} cells={group.cells} threshold={threshold} />
        ))}
      </div>
    </div>
  );
}

function sortByName(cells: SummaryCell[]): SummaryCell[] {
  return [...cells].sort((a, b) => a.product_name.localeCompare(b.product_name, 'es', { sensitivity: 'base' }));
}

/** «4 con cifra · 3 ocultas · 1 sin cifra»: recuento de filas por estado, nunca una cantidad. */
function groupCounts(cells: SummaryCell[]): string {
  const published = cells.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = cells.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = cells.length - published - privacy;
  const parts: string[] = [];
  if (published > 0) parts.push(`${COUNT.format(published)} con cifra`);
  if (privacy > 0) parts.push(`${COUNT.format(privacy)} ${privacy === 1 ? 'oculta' : 'ocultas'}`);
  if (other > 0) parts.push(`${COUNT.format(other)} sin cifra publicada`);
  return parts.join(' · ');
}

function UnitGroup({ unit, cells, threshold }: { unit: Unit; cells: SummaryCell[]; threshold: number | null }) {
  const values = cells.map((cell) => (cell.status === 'DISCLOSED' && isBaseQuantity(cell.total_base) ? BigInt(cell.total_base) : null));
  const max = values.reduce<bigint>((top, value) => (value !== null && value > top ? value : top), 0n);
  return (
    <div className="min-w-0">
      <h3 className="flex flex-wrap items-baseline gap-x-3 border-b-2 border-ink pb-2 text-sm">
        <span className="font-bold uppercase tracking-wider text-ink">{UNIT_TITLE[unit]}</span>
        <span className="text-ink-muted">{groupCounts(cells)}</span>
      </h3>
      <ul className="divide-y divide-line" aria-label={UNIT_TITLE[unit]}>
        {cells.map((cell, index) => {
          const value = values[index] ?? null;
          const share = value !== null && value > 0n && max > 0n ? Math.max(Number((value * 1000n) / max) / 10, 1) : null;
          return <FigureRow key={`${cell.product_ref}|${cell.base_unit}`} cell={cell} threshold={threshold} share={share} />;
        })}
      </ul>
    </div>
  );
}

/**
 * Motivo de una fila sin cifra, en una línea. El umbral ya se explica al pie de
 * la sección: aquí basta «Menos de N agricultores aportaron» (H-24, sin conteo
 * exacto). Los demás estados llevan su motivo completo (`statusReason`).
 */
function hiddenReason(status: CellStatus, threshold: number | null): string {
  if (status === 'SUPPRESSED_UNDER_THRESHOLD') {
    return `${threshold ? `Menos de ${threshold} agricultores aportaron` : 'Aportaron menos agricultores que el umbral'} · aportantes no revelados.`;
  }
  return `${statusReason(status, threshold) ?? 'Sin cifra publicada.'} (aportantes no revelados)`;
}

/** Chip punteado con el texto propio del estado (H-06). */
export function HiddenChip({ status, short = false }: { status: CellStatus; short?: boolean }) {
  if (status === 'SUPPRESSED_UNDER_THRESHOLD') return <PrivacyChip label={short ? 'Oculta' : 'Oculta por privacidad'} />;
  return (
    <Chip tone="hidden" icon={ICON.lock}>
      {statusChipLabel(status)}
    </Chip>
  );
}

function FigureRow({ cell, threshold, share }: { cell: SummaryCell; threshold: number | null; share: number | null }) {
  const disclosed = cell.status === 'DISCLOSED';
  const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
  return (
    <li className="min-w-0 py-4" data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-32 text-base font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{cell.product_name}</p>
        {disclosed ? (
          text === null ? (
            <span className="text-sm font-semibold text-danger-ink">Dato no válido recibido del servidor; no se muestra.</span>
          ) : (
            <QuantityFigure text={text} />
          )
        ) : (
          <span className="shrink-0"><HiddenChip status={cell.status} /></span>
        )}
      </div>
      {disclosed ? (
        <>
          {share !== null && text !== null && (
            <div className="mt-2 h-2 rounded-full bg-track" aria-hidden="true" data-bar-track>
              <div className="h-2 rounded-full bg-ink" style={{ width: `${share}%` }} />
            </div>
          )}
          <p className="mt-2 text-sm text-ink-muted tabular-nums">
            {cell.contributors !== null && (
              <>
                {COUNT.format(cell.contributors)} {cell.contributors === 1 ? 'agricultor' : 'agricultores'} ·{' '}
              </>
            )}
            datos hasta {fmtDateTime(cell.data_as_of)}
          </p>
          {cell.pending_changes && <PendingChip />}
        </>
      ) : (
        <p className="mt-1.5 text-sm leading-snug text-ink-muted">
          {hiddenReason(cell.status, threshold)}
        </p>
      )}
    </li>
  );
}

/** «Cifra anterior · hay cambios sin publicar» (H-21): ámbar, siempre con texto. */
export function PendingChip() {
  return (
    <span className="mt-2 inline-block rounded-full bg-warn-bg px-3 py-0.5 text-sm font-semibold text-warn-ink" data-testid="pending-chip">
      Cifra anterior · hay cambios sin publicar
      <span className="sr-only">: hay cambios recibidos que aún no alcanzan el umbral; se muestra la cifra publicada antes.</span>
    </span>
  );
}

function CompactRow({ cell, threshold }: { cell: SummaryCell; threshold: number | null }) {
  const disclosed = cell.status === 'DISCLOSED';
  const text = disclosed ? formatQuantity(cell.total_base, cell.base_unit, cell.total_presentation) : null;
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3.5" data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
      <div className="min-w-0 flex-1 basis-32">
        <p className="text-base font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{cell.product_name}</p>
        {disclosed ? (
          <p className="text-sm text-ink-muted tabular-nums">
            {cell.contributors !== null && `${COUNT.format(cell.contributors)} ${cell.contributors === 1 ? 'agricultor' : 'agricultores'} · `}
            datos hasta {fmtDateTime(cell.data_as_of)}
          </p>
        ) : (
          <p className="text-sm leading-snug text-ink-muted">
            {cell.status === 'SUPPRESSED_UNDER_THRESHOLD' ? (threshold ? `Menos de ${threshold} agricultores: ` : 'Menos agricultores que el umbral: ') : `${statusReason(cell.status, threshold) ?? ''} `}aportantes no revelados.
          </p>
        )}
        {disclosed && cell.pending_changes && <PendingChip />}
      </div>
      {disclosed ? (
        text === null ? (
          <span className="text-sm font-semibold text-danger-ink">Dato no válido recibido del servidor; no se muestra.</span>
        ) : (
          <QuantityFigure text={text} size="md" />
        )
      ) : (
        <HiddenChip status={cell.status} short />
      )}
    </li>
  );
}
