import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, buttonClass, EmptyState, Notice } from '../components/app-shell';
import {
  CollectiveToolbar,
  ComparisonBars,
  CoverageBanner,
  DisclosureNotice,
  PendingChangesNote,
  ProductCell,
  QuantityCell,
  SealBanner,
  SectionHeader,
  type BarRow,
} from '../components/collective-ui';
import { SealPanel } from '../components/seal-panel';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, SummaryCell } from '../types/collective';

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico. Sólo presenta
 * lo que decidió el servidor (F07-POL-01): no suma, no resta y no deduce cifras
 * ocultas. F07 (2026-10-23): versión sellada y panel de sellado.
 *
 * Panel de la defensa (2026-11-05): la campaña consultada y una sola acción
 * primaria («Revisar borrador»); la cobertura en una tarjeta compacta con
 * enlace; «Necesidad declarada» como primer bloque de datos, con producto,
 * cantidad con unidad y aportantes en cada fila; «Consumo publicado» aparte.
 * «Oculto por privacidad», «Sin cifra publicada» y un cero divulgado se
 * distinguen sin inferir cantidades ni aportantes suprimidos.
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
      const data = await collectiveService.summary(campaignId);
      reportDisclosureMode(data.disclosure.mode);
      setSummary(data);
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
    <AppShell title="Resumen colectivo" section="Colectivo">
      <div className="space-y-4">
        <CollectiveToolbar campaigns={campaigns} selected={selected} onSelect={select}>
          {selected && (
            <>
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
                onClick={() => void load(selected)}
                disabled={loading}
              >
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
    <div className="space-y-4">
      <DisclosureNotice mode={disclosure.mode} threshold={disclosure.threshold} />
      {summary.seal && <SealBanner seal={summary.seal} />}
      {summary.coverage && (
        <CoverageBanner
          coverage={summary.coverage}
          campaignName={summary.campaign.name}
          sealedAt={summary.seal?.sealed_at}
          link={`${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}
        />
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

/** «2 productos con cifra publicada · 1 oculto por privacidad · 1 sin cifra publicada», sólo con lo que hay. */
function countsNote(cells: SummaryCell[]): string {
  const published = cells.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = cells.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = cells.length - published - privacy;
  const parts = [`${published} ${published === 1 ? 'producto' : 'productos'} con cifra publicada`];
  if (privacy > 0) parts.push(`${privacy} ${privacy === 1 ? 'oculto' : 'ocultos'} por privacidad`);
  if (other > 0) parts.push(`${other} sin cifra publicada`);
  return parts.join(' · ');
}

function NeedsSection({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
  const units = (['L', 'KG'] as const).filter((unit) => cells.some((cell) => cell.presentation_unit === unit));
  return (
    <section className="glass-card overflow-hidden" aria-label="Necesidad declarada">
      <SectionHeader
        title="Necesidad declarada"
        note={
          cells.length === 0
            ? 'Lo que cada agricultor declaró que necesita para la campaña. No es pronóstico, consumo ni cantidad comprada.'
            : `${countsNote(cells)}. Lo que cada agricultor declaró que necesita; no es pronóstico, consumo ni cantidad comprada.`
        }
      />
      {cells.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">Ningún agricultor publicó una necesidad declarada en esta campaña. Eso no significa cero.</p>
      ) : (
        units.map((unit) => (
          <div key={unit}>
            {units.length > 1 && (
              <p className="bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">En {unit}</p>
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
    <section className="glass-card overflow-hidden" aria-label="Consumo publicado">
      <SectionHeader
        title="Consumo publicado"
        note="Consumo que los agricultores registraron y publicaron desde la app. Es un dato distinto de la necesidad declarada: no se resta ni se compara con ella."
      />
      {cells.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-600">Sin consumo publicado en esta campaña. Eso no significa cero.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {cells.map((cell) => (
              <tr key={`${cell.product_ref}|${cell.base_unit}`} data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
                <td className="px-5 py-2.5">
                  <ProductCell name={cell.product_name} unit={cell.presentation_unit} status={cell.status} threshold={threshold} />
                </td>
                <td className="px-5 py-2.5">
                  <QuantityCell
                    status={cell.status}
                    base={cell.total_base}
                    serverPresentation={cell.total_presentation}
                    unit={cell.base_unit}
                    threshold={threshold}
                    asOf={cell.data_as_of}
                    size="lg"
                  />
                  {cell.status === 'DISCLOSED' && cell.pending_changes && <PendingChangesNote />}
                </td>
                <td className="px-5 py-2.5 text-right text-sm text-slate-600 tabular-nums">
                  {cell.status === 'DISCLOSED' ? `${cell.contributors} aportantes` : <span className="text-slate-400">aportantes no revelados</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
