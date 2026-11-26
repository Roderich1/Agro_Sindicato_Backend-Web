import { useState, type ReactNode } from 'react';
import { NeedsBars } from '../../components/needs-bars';
import {
  AttentionList,
  buttonClassFor,
  Chip,
  DataState,
  FilterChips,
  ICON,
  Icon,
  SearchInput,
  StatusChip,
  Stepper,
  type AttentionItem,
  type DataStateKind,
} from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import { CAMPAIGNS_PATH, COLLECTIVE_PATHS } from '../../lib/navigation';
import type { CollectiveSummary, SealRef, SummaryCell } from '../../types/collective';
import { COUNT, FILTERS, plural, STEPS, type NeedsFilter } from './summary-helpers';

/** Estados 6–9 de la lámina 05, distinguidos por el error de la llamada (sin API nueva). */
export function SummaryError({ kind, text, onRetry, onLogout }: { kind: DataStateKind; text: string; onRetry?: () => void; onLogout: () => void }) {
  if (kind === 'forbidden') {
    return (
      <DataState
        state="forbidden"
        title="Su rol no tiene acceso a esta información"
        description="La información colectiva es solo para la Directiva y la Administración."
        action={
          <button type="button" className={buttonClassFor('secondary')} onClick={onLogout}>
            Cerrar sesión
          </button>
        }
        testId="summary-error"
      />
    );
  }
  if (kind === 'offline' || kind === 'busy') return <DataState state={kind} onRetry={onRetry} testId="summary-error" />;
  return (
    <DataState
      state="error"
      title="No se pudo cargar el resumen"
      description={text === 'No fue posible cargar el resumen colectivo.' ? 'El servidor no respondió como se esperaba. Vuelva a intentarlo en un momento.' : text}
      onRetry={onRetry}
      testId="summary-error"
    />
  );
}

/** «Necesidades declaradas»: buscador y filtros en el navegador sobre la respuesta ya recibida. */
export function NeedsSection({ needs }: Readonly<{ needs: SummaryCell[] }>) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NeedsFilter>('all');
  const term = query.trim().toLocaleLowerCase('es');
  const visible = needs.filter(
    (cell) =>
      (filter === 'all' || (filter === 'hidden' ? cell.status !== 'DISCLOSED' : cell.presentation_unit === filter)) &&
      (!term || cell.product_name.toLocaleLowerCase('es').includes(term)),
  );
  const published = needs.filter((cell) => cell.status === 'DISCLOSED').length;
  return (
    <section aria-labelledby="necesidades-declaradas" className="rounded-card border border-line bg-surface px-5 py-6 shadow-card sm:px-8" data-testid="needs-section">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="necesidades-declaradas" className="text-2xl font-bold text-ink sm:text-[1.75rem]">
          Necesidades declaradas
        </h2>
        <p className="text-sm text-ink-muted sm:text-base">Lo que cada agricultor dijo que necesita</p>
      </div>
      {needs.length === 0 ? (
        <div className="mt-4">
          <DataState
            state="empty"
            title="Aún no hay cifras publicadas"
            description="Ningún agricultor publicó necesidades en esta campaña. Eso no significa cero."
            testId="needs-empty"
          />
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-60">
              <SearchInput label="Buscar producto" placeholder="Buscar producto" value={query} onChange={setQuery} />
            </div>
            <FilterChips label="Filtrar por unidad o estado" options={FILTERS} value={filter} onChange={setFilter} testId="needs-filters" />
          </div>
          {published === 0 && (
            <div className="mt-5 rounded-field bg-sunken p-4" data-testid="all-hidden">
              <DataState
                state="restricted"
                compact
                title="Hay productos, pero ninguna cifra se puede mostrar"
                description="Revise el estado de cada producto."
              />
            </div>
          )}
          <div className="mt-5">
            {visible.length === 0 ? (
              <DataState
                state="no-match"
                description={`Ningún producto coincide con el filtro aplicado${term ? ` («${query.trim()}»)` : ''}.`}
                onClearFilters={() => {
                  setQuery('');
                  setFilter('all');
                }}
              />
            ) : (
              <NeedsBars cells={visible} />
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-muted" data-testid="needs-footnote">
            <Icon d={ICON.info} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sin datos disponibles y cero son estados distintos. Las barras comparan solo productos de la misma unidad.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

/** «Consumo publicado» (H-22): otro dato; no se resta ni se compara con la necesidad. */
export function ConsumptionCard({ cells }: Readonly<{ cells: SummaryCell[] }>) {
  return (
    <section aria-labelledby="consumo-publicado" className="rounded-card border border-line bg-surface px-5 py-6 shadow-card sm:px-7" data-testid="consumption">
      <h2 id="consumo-publicado" className="text-2xl font-bold text-ink">
        Consumo publicado
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">Lo que registraron. No se resta de la necesidad.</p>
      {cells.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Sin consumo publicado en esta campaña. Eso no significa cero.</p>
      ) : (
        <div className="mt-2">
          <NeedsBars cells={cells} bars={false} />
        </div>
      )}
    </section>
  );
}

/** «Versión de las cifras» (H-05). */
export function VersionCard({ seal, status, sealPanel }: { seal: SealRef | null; status: string; sealPanel: ReactNode }) {
  const current = seal ? 2 : status === 'CERRADA' ? 1 : status === 'ABIERTA' ? 0 : -1;
  const note = seal
    ? null
    : status === 'ABIERTA'
      ? 'Los resultados se fijan al cerrar la campaña.'
      : status === 'CERRADA'
        ? 'Sin resultados históricos disponibles.'
        : null;
  return (
    <section aria-labelledby="version-cifras" className="space-y-4 rounded-card border border-line bg-surface px-5 py-6 shadow-card sm:px-7" data-testid={seal ? 'seal-banner' : 'version-tile'}>
      <h2 id="version-cifras" className="text-2xl font-bold text-ink">
        Versión de las cifras
      </h2>
      {current >= 0 ? (
        <Stepper label="Versión de las cifras" steps={STEPS} current={current} note={note} testId="version-steps" />
      ) : (
        <p className="text-sm text-ink-muted">
          <StatusChip status={status} /> <span className="ml-1">Sin resultados históricos disponibles.</span>
        </p>
      )}
      {seal && (
        <div className="space-y-2 border-t border-line pt-4">
          <Chip tone="lime" dot size="md">
            Histórico disponible
          </Chip>
          <h3 className="text-xl font-bold text-ink">Cifras fijadas</h3>
          <p className="text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
            Resultados fijados el {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} (
            {seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}). Datos aceptados hasta {fmtDateTime(seal.accepted_until)}.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Los datos que pierdan su autorización dejan de mostrarse.
          </p>
        </div>
      )}
      {sealPanel && <div className="border-t border-line pt-4">{sealPanel}</div>}
    </section>
  );
}

/** «Para atender» (H-07): sólo asuntos que un dato del servidor sustenta. */
export function PendingActions({
  summary,
  noActive,
  campaignId,
  proposalsUrl,
  pendingIdentification,
}: {
  summary: CollectiveSummary | null;
  noActive: boolean;
  campaignId: string | null;
  proposalsUrl: string;
  pendingIdentification: number | null;
}) {
  const items: AttentionItem[] = [];
  if (noActive) {
    items.push({
      id: 'no-active',
      to: CAMPAIGNS_PATH,
      text: (
        <span data-testid="action-no-active">
          Sin campaña activa: los agricultores no pueden registrar hasta que se abra una. <span className="font-semibold">Ir a Campañas</span>
        </span>
      ),
    });
  }
  if (summary && campaignId) {
    items.push({ id: 'review', to: proposalsUrl, text: <span data-testid="action-review">Revisar el borrador de compra</span> });
    const pending = summary.cells.filter((cell) => cell.pending_changes).length;
    if (pending > 0) {
      items.push({
        id: 'pending-changes',
        text: (
          <span data-testid="action-pending-changes">
            {pending === 1 ? '1 cifra muestra el valor anterior' : `${COUNT.format(pending)} cifras muestran el valor anterior`}: hay cambios recibidos sin publicar
          </span>
        ),
      });
    }
  }
  if (pendingIdentification !== null && pendingIdentification > 0) {
    items.push({
      id: 'identification',
      to: `${COLLECTIVE_PATHS.catalog}?vista=identificacion`,
      text: <span data-testid="action-identification">{plural(pendingIdentification, 'producto por identificar', 'productos por identificar')}</span>,
    });
  }
  return <AttentionList items={items} testId="pending-actions" />;
}
