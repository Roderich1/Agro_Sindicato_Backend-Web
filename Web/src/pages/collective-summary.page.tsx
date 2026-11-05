import { useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, Notice, secondaryButtonClass } from '../components/app-shell';
import {
  CollectiveToolbar,
  CoverageBanner,
  DisclosureNotice,
  PendingChangesNote,
  ProductCell,
  QuantityCell,
  SealBanner,
  SectionHeader,
} from '../components/collective-ui';
import { SealPanel } from '../components/seal-panel';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, ProjectionType, SummaryCell } from '../types/collective';

const SECTIONS: { type: ProjectionType; title: string; description: string }[] = [
  {
    type: 'DECLARED_NEED',
    title: 'Necesidad declarada',
    description: 'Lo que cada agricultor declaró que necesita para la campaña. No es pronóstico ni recomendación.',
  },
  {
    type: 'CONSUMPTION_TOTAL',
    title: 'Consumo registrado',
    description: 'Consumo que los agricultores registraron y publicaron desde la app. Se muestra aparte: no se resta de la necesidad.',
  },
];

/**
 * F07-WEB-02 (#24): resumen colectivo por campaña y producto canónico. Sólo
 * presenta lo que decidió el servidor (F07-POL-01): no suma, no resta y no
 * deduce cifras ocultas. F07 (2026-10-23): muestra la versión sellada, si la
 * hay, y el panel de revisión y sellado.
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
    <AppShell title="Resumen colectivo" section="Colectivo">
      <div className="space-y-5">
        <CollectiveToolbar campaigns={campaigns} selected={selected} onSelect={select}>
          {selected && (
            <button type="button" className={secondaryButtonClass} onClick={() => void load(selected)} disabled={loading}>
              Actualizar
            </button>
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
  return (
    <div className="space-y-5">
      <DisclosureNotice mode={disclosure.mode} threshold={disclosure.threshold} />
      {summary.seal && <SealBanner seal={summary.seal} />}
      {summary.coverage && (
        <CoverageBanner
          coverage={summary.coverage}
          campaignName={summary.campaign.name}
          sealedAt={summary.seal?.sealed_at}
        />
      )}
      {disclosure.mode === 'PROVISIONAL_SYNTHETIC' &&
        SECTIONS.map((section) => (
          <CellsTable
            key={section.type}
            title={section.title}
            description={section.description}
            cells={summary.cells.filter((cell) => cell.projection_type === section.type)}
            threshold={disclosure.threshold}
          />
        ))}
    </div>
  );
}

function CellsTable({
  title,
  description,
  cells,
  threshold,
}: {
  title: string;
  description: string;
  cells: SummaryCell[];
  threshold: number | null;
}) {
  return (
    <section className="glass-card overflow-hidden" aria-label={title}>
      <SectionHeader title={title} note={description} />
      {cells.length === 0 ? (
        <EmptyState
          compact
          title="Sin aportaciones publicadas"
          description="Ningún agricultor publicó datos de este tipo en la campaña. Eso no significa cero."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Producto (canónico)</th>
                <th className="px-5 py-2.5">Total publicado</th>
                <th className="px-5 py-2.5 text-right">Aportantes</th>
              </tr>
            </thead>
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
                  <td className="px-5 py-3 text-right tabular-nums">{cell.status === 'DISCLOSED' ? cell.contributors : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
