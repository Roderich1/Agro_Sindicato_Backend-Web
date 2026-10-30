import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, EmptyState, Notice, secondaryButtonClass } from '../components/app-shell';
import {
  CampaignPicker,
  CoverageBanner,
  DisclosureNotice,
  PendingChangesNote,
  QuantityCell,
  SealBanner,
  StatusBadge,
} from '../components/collective-ui';
import { SealPanel } from '../components/seal-panel';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { latestDataAsOf } from '../lib/summary-csv';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, ProjectionType, SummaryCell } from '../types/collective';

const SECTIONS: { type: ProjectionType; title: string; description: string }[] = [
  {
    type: 'DECLARED_NEED',
    title: 'Necesidad declarada',
    description: 'Cantidad que cada agricultor declaró expresamente en la app. No es pronóstico ni recomendación.',
  },
  {
    type: 'CONSUMPTION_TOTAL',
    title: 'Consumo',
    description: 'Consumo confirmado que los agricultores publicaron desde la app. Se muestra aparte: no se resta de la necesidad.',
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
  const [csvBusy, setCsvBusy] = useState(false);
  // Última descarga: de qué campaña, cuándo se hizo y la fecha más reciente de
  // «datos aceptados hasta» entre las cifras del CSV (la descarga es una
  // lectura nueva). El aviso sólo se muestra para esa campaña.
  const [csvInfo, setCsvInfo] = useState<{ campaignId: string; at: string; acceptedUntil: string | null } | null>(null);
  // Campaña en pantalla en cada momento: una respuesta que llega después de
  // cambiar de campaña no coloca su aviso ni su error en la vista de otra.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

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

  // El aviso de la última descarga es de una campaña: no se arrastra a otra.
  const selectCampaign = (campaignId: string) => {
    // También de forma síncrona: una respuesta que llegue entre el cambio y
    // el efecto ya encuentra la campaña nueva.
    selectedRef.current = campaignId;
    setCsvInfo(null);
    select(campaignId);
  };

  /**
   * Descarga el CSV que genera el servidor con una lectura nueva (misma
   * política y memoria de divulgación que abrir el resumen). No se arma en el
   * navegador con lo que hay en pantalla: una cifra retirada no se exporta.
   */
  const downloadCsv = async (campaignId: string) => {
    setCsvBusy(true);
    setError(null);
    try {
      const blob = await collectiveService.summaryCsv(campaignId);
      const text = await blob.text();
      // La petición era de otra campaña: se descarta sin tocar la vista actual.
      if (selectedRef.current !== campaignId) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resumen-colectivo-${campaignId.slice(0, 8)}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCsvInfo({ campaignId, at: new Date().toISOString(), acceptedUntil: latestDataAsOf(text) });
    } catch (err) {
      if (selectedRef.current !== campaignId) return;
      setError(collectiveError(err, 'No fue posible descargar el CSV.'));
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <AppShell
      title="Resumen colectivo"
      section="Directiva"
      actions={
        selected ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButtonClass} onClick={() => void load(selected)} disabled={loading}>
              Actualizar
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void downloadCsv(selected)}
              disabled={loading || csvBusy}
              title="Lectura nueva del servidor, con la misma política de divulgación que esta pantalla"
            >
              Descargar CSV actualizado
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <CampaignPicker campaigns={campaigns} selected={selected} onSelect={selectCampaign} />
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {csvInfo && csvInfo.campaignId === selected && (
          <Notice kind="info">
            CSV descargado ({fmtDateTime(csvInfo.at)}). Es una lectura nueva del servidor, con la misma política de
            divulgación que esta pantalla; si hubo cambios, puede diferir de lo mostrado: pulse «Actualizar».
            {csvInfo.acceptedUntil
              ? ` La cifra más reciente del CSV incluye datos aceptados hasta ${fmtDateTime(csvInfo.acceptedUntil)}; no significa que todos los agricultores hayan publicado hasta esa fecha.`
              : ''}
          </Notice>
        )}
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
    <div className="space-y-6">
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
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {cells.length === 0 ? (
        <EmptyState
          title="Sin aportaciones publicadas"
          description="Ningún agricultor publicó datos de este tipo en la campaña. Eso no significa cero."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Producto (canónico)</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Aportantes</th>
                <th className="px-5 py-3">Datos aceptados hasta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cells.map((cell) => (
                <tr key={`${cell.product_ref}|${cell.base_unit}`} data-testid={`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {cell.product_name}
                    <span className="ml-1 text-xs text-slate-400">({cell.presentation_unit})</span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={cell.status} threshold={threshold} />
                  </td>
                  <td className="px-5 py-3">
                    <QuantityCell
                      status={cell.status}
                      base={cell.total_base}
                      serverPresentation={cell.total_presentation}
                      unit={cell.base_unit}
                      threshold={threshold}
                    />
                    {cell.status === 'DISCLOSED' && cell.pending_changes && <PendingChangesNote />}
                  </td>
                  <td className="px-5 py-3 tabular-nums">{cell.status === 'DISCLOSED' ? cell.contributors : '—'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{cell.status === 'DISCLOSED' ? fmtDateTime(cell.data_as_of) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
