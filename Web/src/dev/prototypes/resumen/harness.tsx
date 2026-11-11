import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../../components/app-shell';
import { SegmentedControl } from '../../../components/ui';
import { AuthContext, type AuthContextValue } from '../../../contexts/auth.context';
import { CampaignContext, type CampaignContextValue } from '../../../contexts/campaign.context';
import { reportDisclosureMode } from '../../../lib/data-mode';
import { AnaliticaComparativa } from './analitica-comparativa';
import { DATASETS, datasetFor, type ResumenDataset } from './fixtures';
import { OperativaCompacta } from './operativa-compacta';
import { ProtoPicker } from './picker';
import type { VariantProps } from './variant-props';

/**
 * `/prototipos/resumen` (sólo `import.meta.env.DEV`): dos variantes del Resumen
 * con el MISMO fixture, una a la vez, a tamaño real dentro del armazón. Sin
 * sesión ni API: la sesión y la campaña activa son sintéticas y viven sólo en
 * este árbol. El cambio de variante es instantáneo.
 */
const VARIANTS: { name: string; Component: (props: VariantProps) => JSX.Element }[] = [
  { name: 'Operativa compacta', Component: OperativaCompacta },
  { name: 'Analítica comparativa', Component: AnaliticaComparativa },
];

const PROTO_AUTH: AuthContextValue = {
  user: {
    id: 'u-proto',
    name: 'Usuaria sintética',
    email: 'prototipo@example.test',
    role: 'DIRECTIVA',
    tenantId: 't-proto',
    tenant: { id: 't-proto', name: 'Sindicato sintético de productores del valle', slug: 'sintetico' },
  },
  isLoading: false,
  login: async () => undefined,
  logout: async () => undefined,
};

const NARROW = '(max-width: 1023px)';
function subscribeNarrow(listener: () => void) {
  const query = window.matchMedia?.(NARROW);
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
const readNarrow = () => Boolean(window.matchMedia?.(NARROW).matches);

export default function ResumenPrototypes() {
  const [params, setParams] = useSearchParams();
  const dataset = datasetFor(params.get('datos'));
  const parsed = parseInt(params.get('v') ?? '', 10);
  const current = parsed >= 1 && parsed <= VARIANTS.length ? parsed - 1 : 0;
  const [mount, setMount] = useState(0);
  // En el teléfono la barra inferior ocupa el centro de abajo: el selector sube (única modificación admitida).
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);

  const update = useCallback(
    (changes: Record<string, string>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const select = useCallback((index: number) => update({ v: String(index + 1) }), [update]);
  const replay = useCallback(() => setMount((value) => value + 1), []);

  const summaryMode = Object.values(dataset.summaries)[0]?.disclosure.mode ?? null;
  useEffect(() => {
    reportDisclosureMode(summaryMode);
    return () => reportDisclosureMode(null);
  }, [summaryMode]);

  const active = dataset.campaigns.find((campaign) => campaign.isActive) ?? null;
  const campaignValue = useMemo<CampaignContextValue>(
    () => ({ activeCampaign: active, isLoading: false, error: null, refreshActiveCampaign: async () => undefined, hasActiveCampaign: Boolean(active) }),
    [active],
  );
  const Variant = VARIANTS[current]!.Component;

  return (
    <AuthContext.Provider value={PROTO_AUTH}>
      <CampaignContext.Provider value={campaignValue}>
        <AppShell title="Resumen" section="Prototipo · sólo desarrollo">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-card border border-dashed border-slate-300 bg-surface px-4 py-3" data-testid="proto-data">
            <SegmentedControl
              label="Datos del prototipo (sintéticos)"
              options={DATASETS.map((entry) => ({ value: entry.key, label: entry.label }))}
              value={dataset.key}
              onChange={(value) => update({ datos: value })}
            />
            <p className="max-w-md text-xs text-slate-600">
              Variante {current + 1} de {VARIANTS.length}: {VARIANTS[current]!.name}. Teclas 1–{VARIANTS.length} o ←/→ para cambiar. Ninguna petición al servidor.
            </p>
          </div>
          <Stage key={`${dataset.key}:${current}:${mount}`} dataset={dataset} Variant={Variant} />
        </AppShell>
        <ProtoPicker names={VARIANTS.map((variant) => variant.name)} current={current} onSelect={select} onReplay={replay} position={narrow ? 'top' : undefined} />
      </CampaignContext.Provider>
    </AuthContext.Provider>
  );
}

/** Campaña elegida dentro del prototipo (estado local, sin URL ni servidor). */
function Stage({ dataset, Variant }: { dataset: ResumenDataset; Variant: (props: VariantProps) => JSX.Element }) {
  const initial = dataset.campaigns.find((campaign) => campaign.isActive)?.id ?? dataset.campaigns[0]?.id ?? null;
  const [selected, setSelected] = useState<string | null>(initial);
  const summary = selected ? (dataset.summaries[selected] ?? null) : null;
  return <Variant campaigns={dataset.campaigns} selected={selected} onSelect={setSelected} summary={summary} />;
}
