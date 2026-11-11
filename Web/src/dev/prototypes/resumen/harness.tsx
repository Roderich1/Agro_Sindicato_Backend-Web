import axios from 'axios';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../../components/app-shell';
import { SealPanel } from '../../../components/seal-panel';
import { CampaignProvider } from '../../../contexts/campaign.context';
import { useCampaign } from '../../../hooks/use-campaign';
import { useSelectedCampaign } from '../../../hooks/use-selected-campaign';
import { collectiveError } from '../../../lib/collective-text';
import { reportDisclosureMode } from '../../../lib/data-mode';
import { CollectiveSummaryPage } from '../../../pages/collective-summary.page';
import { auditLogsService } from '../../../services/audit-logs.service';
import { collectiveService } from '../../../services/collective.service';
import { estimationService } from '../../../services/estimation.service';
import type { CollectiveSummary } from '../../../types/collective';
import { Accion } from './accion';
import { Comparacion } from './comparacion';
import { DATASETS, datasetFor, type ResumenDataset } from './datasets';
import { Ejecutivo } from './ejecutivo';
import { estimationView, type ActivityView, type EstimationView } from './model';
import { Panorama } from './panorama';
import { ProtoPicker } from './picker';
import type { LoadState, VariantProps } from './parts';

/**
 * Arnés de los prototipos del Resumen (2026-11-11), sólo en desarrollo: las
 * variantes y la vista actual («Actual» = `CollectiveSummaryPage` real) con el
 * MISMO conjunto de datos sintético, una a la vez, a tamaño real dentro del
 * armazón. Los servicios están sustituidos (`stubs.ts`): ninguna petición sale
 * a un servidor y toda escritura se rechaza. `?v=` y `?datos=` viven en la
 * URL; `?campaign=` funciona como en la vista real. «Ejecutivo» (2026-11-11,
 * tarde) responde a la propuesta de tablero del autor con los datos que la API
 * sirve hoy a la Directiva: añade la lectura de la bitácora de la campaña.
 */
export const VARIANTS: { name: string; slug: string; Component: ((props: VariantProps) => JSX.Element) | null; estimation: boolean; activity: boolean }[] = [
  { name: 'Actual', slug: 'actual', Component: null, estimation: false, activity: false },
  { name: 'Panorama', slug: 'panorama', Component: Panorama, estimation: false, activity: false },
  { name: 'Acción', slug: 'accion', Component: Accion, estimation: false, activity: false },
  { name: 'Comparación', slug: 'comparacion', Component: Comparacion, estimation: true, activity: false },
  { name: 'Ejecutivo', slug: 'ejecutivo', Component: Ejecutivo, estimation: true, activity: true },
];

const NARROW = '(max-width: 1023px)';
function subscribeNarrow(listener: () => void) {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
const readNarrow = () => Boolean(window.matchMedia?.(NARROW).matches);

export function ResumenPrototypes({ onDataset }: { onDataset: (dataset: ResumenDataset) => void }) {
  const [params, setParams] = useSearchParams();
  const dataset = datasetFor(params.get('datos'));
  const parsed = parseInt(params.get('v') ?? '', 10);
  const current = parsed >= 1 && parsed <= VARIANTS.length ? parsed - 1 : 1;
  const [mount, setMount] = useState(0);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  // Antes de que el proveedor de campañas pida la lista (efecto pasivo), los servicios sustituidos ya leen este conjunto.
  useLayoutEffect(() => onDataset(dataset), [dataset, onDataset]);

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  // Cada conjunto trae su campaña (`?campaign=`), como lo haría un enlace a la vista real.
  const campaignParam = params.get('campaign');
  useEffect(() => {
    if (dataset.selected && !campaignParam) update({ campaign: dataset.selected });
  }, [dataset, campaignParam, update]);
  const select = useCallback((index: number) => update({ v: String(index + 1) }), [update]);
  const replay = useCallback(() => setMount((value) => value + 1), []);
  const variant = VARIANTS[current]!;

  return (
    <CampaignProvider key={dataset.key}>
      <AppShell title="Resumen" section="Prototipo · sólo desarrollo">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-600" data-testid="proto-data">
          <span className="font-semibold">Datos sintéticos:</span>
          <span className="inline-flex flex-wrap gap-1" role="group" aria-label="Datos del prototipo">
            {DATASETS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={entry.key === dataset.key}
                onClick={() => update({ datos: entry.key, campaign: entry.selected ?? null })}
                className={`rounded-control px-2 py-0.5 font-semibold ${entry.key === dataset.key ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {entry.label}
              </button>
            ))}
          </span>
          <span>
            Variante {current + 1} de {VARIANTS.length}: {variant.name} · teclas 1–{VARIANTS.length} o ←/→ · ninguna petición al servidor
          </span>
        </div>
        <div data-variant={variant.slug} key={`${dataset.key}:${variant.slug}:${mount}`}>
          {variant.Component ? <Stage Variant={variant.Component} withEstimation={variant.estimation} withActivity={variant.activity} /> : <CollectiveSummaryPageInner />}
        </div>
      </AppShell>
      <ProtoPicker names={VARIANTS.map((entry) => entry.name)} current={current} onSelect={select} onReplay={replay} position={narrow ? 'top' : undefined} />
    </CampaignProvider>
  );
}

/** La vista actual, tal cual, con los mismos datos (comparación antes/después). Trae su propio AppShell: se oculta el duplicado con CSS. */
function CollectiveSummaryPageInner() {
  return (
    <div className="proto-nested-shell">
      <CollectiveSummaryPage />
    </div>
  );
}

/**
 * Carga del resumen y de la referencia con las mismas reglas que la vista real:
 * una lectura por campaña y visita (también bajo StrictMode), «Actualizar» y
 * «Reintentar» explícitos, nunca un sondeo, ninguna escritura al abrir.
 */
function Stage({ Variant, withEstimation, withActivity }: { Variant: (props: VariantProps) => JSX.Element; withEstimation: boolean; withActivity: boolean }) {
  const { campaigns, selected, select, error: campaignsError, refresh } = useSelectedCampaign();
  const { activeCampaign, isLoading: activeLoading, error: activeError, campaignsLoading } = useCampaign();
  const [state, setState] = useState<LoadState>({ kind: 'idle' });
  const [estimation, setEstimation] = useState<EstimationView | null>(null);
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [reloads, setReloads] = useState(0);
  const current = useRef<string | null>(null);
  const requested = useRef<string | null>(null);

  const load = useCallback(
    async (campaignId: string) => {
      setState({ kind: 'loading' });
      setEstimation(withEstimation ? { kind: 'loading' } : null);
      setActivity(withActivity ? { kind: 'loading' } : null);
      setReloads((value) => value + 1);
      // La bitácora de la campaña (C14) no depende del resumen: se pide a la vez, una sola vez por campaña.
      if (withActivity) {
        void auditLogsService
          .list({ campaignId })
          .then((logs) => current.current === campaignId && setActivity({ kind: 'ready', logs }))
          .catch((err: unknown) => current.current === campaignId && setActivity({ kind: 'error', text: collectiveError(err, 'No fue posible consultar la bitácora.') }));
      }
      const readSummary = async (): Promise<CollectiveSummary | null> => {
        try {
          const data = await collectiveService.summary(campaignId);
          if (current.current !== campaignId) return null;
          reportDisclosureMode(data.disclosure.mode);
          setState({ kind: 'ready', summary: data });
          return data;
        } catch (err) {
          if (current.current !== campaignId) return null;
          const forbidden = axios.isAxiosError(err) && err.response?.status === 403;
          setState({ kind: forbidden ? 'forbidden' : 'error', text: collectiveError(err, 'No fue posible cargar el resumen colectivo.') });
          setEstimation(null);
          return null;
        }
      };
      const summary = await readSummary();
      if (!summary) return;
      if (!withEstimation || summary.disclosure.mode === 'POLICY_PENDING') {
        setEstimation(withEstimation ? { kind: 'policy' } : null);
        return;
      }
      try {
        const results = await estimationService.results(campaignId);
        if (current.current !== campaignId) return;
        setEstimation(results.results.length === 0 ? { kind: 'none' } : estimationView(results, summary));
      } catch (err) {
        if (current.current !== campaignId) return;
        const policy = axios.isAxiosError(err) && err.response?.status === 409;
        setEstimation(policy ? { kind: 'policy' } : { kind: 'error', text: collectiveError(err, 'No fue posible consultar la estimación del consumo.') });
      }
    },
    [withEstimation, withActivity],
  );

  useEffect(() => {
    current.current = selected;
    if (!selected || requested.current === selected) return;
    requested.current = selected;
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  // «Sin campaña activa» sólo cuando el servidor ya respondió (la lista y la activa se piden juntas): nunca en el primer pintado.
  const noActive = !activeLoading && !campaignsLoading && !activeError && activeCampaign === null;
  const summary = state.kind === 'ready' ? state.summary : null;
  const seal = useMemo(
    () => (selected && summary && summary.campaign.campaign_ref === selected && !summary.seal ? <SealPanel key={`${selected}:${reloads}`} campaignId={selected} onSealed={() => void load(selected)} /> : null),
    [selected, summary, reloads, load],
  );

  return (
    <Variant
      campaigns={campaigns}
      selected={selected}
      onSelect={select}
      campaignsError={campaignsError}
      onRetryCampaigns={() => void refresh()}
      noActive={noActive}
      state={state}
      onReload={() => selected && void load(selected)}
      estimation={estimation}
      seal={seal}
      activity={activity}
    />
  );
}
