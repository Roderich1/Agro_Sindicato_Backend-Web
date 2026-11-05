import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, buttonClass, EmptyState, Notice, secondaryButtonClass } from '../components/app-shell';
import {
  CollectiveToolbar,
  ComparisonBars,
  DisclosureNotice,
  PendingChangesNote,
  ProductCell,
  QuantityCell,
  SealBanner,
  SectionHeader,
  StatTile,
  type BarRow,
} from '../components/collective-ui';
import { SealPanel } from '../components/seal-panel';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, Coverage, SummaryCell } from '../types/collective';

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico. Sólo presenta
 * lo que decidió el servidor (F07-POL-01): no suma, no resta y no deduce cifras
 * ocultas. F07 (2026-10-23): versión sellada y panel de sellado.
 *
 * Jerarquía (defensa, 2026-11-05): primero la campaña y tres indicadores
 * (productos con necesidad publicada, cobertura, productos sin cifra); después
 * la comparación de necesidades con barras por producto y unidad; el consumo
 * registrado aparte y, si no hay, en una sola línea. «Revisar borrador» lleva a
 * la propuesta de compra conjunta de la misma campaña.
 */
export function CollectiveSummaryPage() {
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Cambia en cada recarga para que el panel de sellado relea su estado.
  const [reloads, setReloads] = useState(0);

  const load = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    setReloads((value) => value + 1);
    try {
      setSummary(await collectiveService.summary(campaignId));
    } catch (err) {
      setSummary(null);
      setError(collectiveError(err, 'No fue posible cargar el resumen colectivo.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected) void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  return (
    <AppShell title="Resumen de campaña" section="Colectivo">
      <div className="space-y-5">
        <CollectiveToolbar campaigns={campaigns} selected={selected} onSelect={select}>
          {selected && (
            <>
              <button type="button" className={secondaryButtonClass} onClick={() => void load(selected)} disabled={loading}>
                Actualizar
              </button>
              <Link to={`${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(selected)}`} className={buttonClass}>
                Revisar borrador
              </Link>
            </>
          )}
        </CollectiveToolbar>
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {loading && <p className="text-sm text-slate-500">Cargando…</p>}
        {summary && !loading && <SummaryBody summary={summary} />}
        {selected && summary && !loading && !summary.seal && (
          <SealPanel key={`${selected}:${reloads}`} campaignId={selected} onSealed={() => void load(selected)} />
        )}
        {!selected && !campaignsError && <EmptyState title="No hay campañas" description="Cree o abra una campaña compartida." />}
      </div>
    </AppShell>
  );
}

function SummaryBody({ summary }: { summary: CollectiveSummary }) {
  const { disclosure } = summary;
  const needs = summary.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED');
  const consumption = summary.cells.filter((cell) => cell.projection_type === 'CONSUMPTION_TOTAL');
  return (
    <div className="space-y-5">
      <DisclosureNotice mode={disclosure.mode} threshold={disclosure.threshold} />
      {summary.seal && <SealBanner seal={summary.seal} />}
      {summary.coverage && (
        <Indicators needs={needs} coverage={summary.coverage} campaignName={summary.campaign.name} sealedAt={summary.seal?.sealed_at} />
      )}
      {disclosure.mode === 'PROVISIONAL_SYNTHETIC' && (
        <>
          <NeedsSection cells={needs} threshold={disclosure.threshold} />
          <ConsumptionSection cells={consumption} threshold={disclosure.threshold} />
        </>
      )}
    </div>
  );
}

function Indicators({ needs, coverage, campaignName, sealedAt }: { needs: SummaryCell[]; coverage: Coverage; campaignName: string; sealedAt?: string }) {
  const published = needs.filter((cell) => cell.status === 'DISCLOSED').length;
  const hidden = needs.length - published;
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Indicadores de la campaña">
      <StatTile
        label="Con necesidad publicada"
        value={published}
        note={published === 1 ? 'producto con cifra publicada' : 'productos con cifra publicada'}
      />
      <StatTile
        testId="coverage"
        label={sealedAt ? `Cobertura al sellar (${fmtDateTime(sealedAt)})` : 'Cobertura'}
        value={`${coverage.members_with_contribution} de ${coverage.linked_members}`}
        note={
          <>
            {' '}agricultores vinculados con cifras publicadas · {campaignName}.{' '}
            {sealedAt && 'Fijada al sellar; no se recalcula. '}
            {coverage.suppressed_cells && 'Hay filas sin cifra (bajo el umbral o en revisión) cuyos aportes no se cuentan. '}
            Ausencia de aporte = desconocido, no cero. No es el total del sindicato.
          </>
        }
      />
      <StatTile
        tone="muted"
        label="Sin cifra publicada"
        value={hidden}
        note={hidden === 0 ? 'ninguna fila oculta' : 'bajo el umbral o en revisión: no significa cero'}
      />
    </div>
  );
}

function toRows(cells: SummaryCell[]): BarRow[] {
  return cells.map((cell) => ({
    key: `${cell.product_ref}|${cell.base_unit}`,
    testId: `cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`,
    name: cell.product_name,
    unit: cell.presentation_unit,
    status: cell.status,
    base: cell.total_base,
    presentation: cell.total_presentation,
    contributors: cell.contributors,
    asOf: cell.data_as_of,
    pending: cell.pending_changes,
  }));
}

function NeedsSection({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
  const units = (['L', 'KG'] as const).filter((unit) => cells.some((cell) => cell.presentation_unit === unit));
  return (
    <section className="glass-card overflow-hidden" aria-label="Necesidad declarada">
      <SectionHeader
        title="Necesidad declarada"
        note="Lo que cada agricultor declaró que necesita para la campaña, por producto y unidad. No es pronóstico, ni consumo, ni cantidad comprada."
      />
      {cells.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-600">Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero.</p>
      ) : (
        units.map((unit) => (
          <div key={unit}>
            {units.length > 1 && (
              <p className="bg-slate-50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">En {unit}</p>
            )}
            <ComparisonBars rows={toRows(cells.filter((cell) => cell.presentation_unit === unit))} unit={unit} threshold={threshold} />
          </div>
        ))
      )}
    </section>
  );
}

function ConsumptionSection({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
  return (
    <section className="glass-card overflow-hidden" aria-label="Consumo registrado">
      <SectionHeader
        title="Consumo registrado"
        note="Consumo que los agricultores registraron y publicaron desde la app. Se muestra aparte: no se resta de la necesidad declarada."
      />
      {cells.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">Sin consumo registrado publicado en esta campaña. Eso no significa cero.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {cells.map((cell) => (
              <tr key={`${cell.product_ref}|${cell.base_unit}`} data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
                <td className="px-5 py-3">
                  <ProductCell name={cell.product_name} unit={cell.presentation_unit} status={cell.status} threshold={threshold} />
                </td>
                <td className="px-5 py-3">
                  <QuantityCell
                    status={cell.status}
                    base={cell.total_base}
                    serverPresentation={cell.total_presentation}
                    unit={cell.base_unit}
                    threshold={threshold}
                    asOf={cell.data_as_of}
                  />
                  {cell.status === 'DISCLOSED' && cell.pending_changes && <PendingChangesNote />}
                </td>
                <td className="px-5 py-3 text-right text-sm text-slate-600 tabular-nums">
                  {cell.status === 'DISCLOSED' ? `${cell.contributors} aportantes` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
