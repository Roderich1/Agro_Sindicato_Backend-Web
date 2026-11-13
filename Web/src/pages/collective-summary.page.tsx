import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HeroCoverage, type HeroStatItem } from '../components/a/coverage-figure';
import { AppShell } from '../components/app-shell';
import { ExportButtons } from '../components/export-buttons';
import { NeedsBars } from '../components/needs-bars';
import { SealPanel } from '../components/seal-panel';
import {
  AttentionList,
  buttonClassFor,
  Card,
  Chip,
  DataState,
  dataStateKindForError,
  FilterChips,
  HeroPanel,
  ICON,
  Icon,
  IconButton,
  SearchInput,
  StatusChip,
  Stepper,
  type AttentionItem,
  type DataStateKind,
} from '../components/ui';
import { useIdentificationPending } from '../contexts/identification-pending';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { CAMPAIGNS_PATH, COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary, SealRef, SummaryCell } from '../types/collective';

const COUNT = new Intl.NumberFormat('es-BO');

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico. Sólo presenta
 * lo que decidió el servidor (F07-POL-01): no suma, no resta y no deduce cifras
 * ocultas. F07 (2026-10-23): versión sellada y panel de sellado.
 *
 * Rediseño v2 (láminas 03, 05 §1–11 y 35):
 * - cabecera oscura con el selector de campaña, sus chips, «Actualizar»,
 *   «Descargar Excel», «Revisar borrador →», la cobertura en grande y
 *   recuentos de filas por estado (nunca cantidades);
 * - «Necesidades declaradas» con buscador y filtros en el navegador, L y KG en
 *   columnas y escalas separadas, y el chip de cada estado (H-06);
 * - columna lateral: «Para atender» (sólo con datos, H-07), «Consumo
 *   publicado» y «Versión de las cifras» (H-05: sólo lo que da el servidor).
 *
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por campaña y visita, sin
 * sondeo; «Actualizar» y «Reintentar» son acciones explícitas. Cargar la vista
 * no escribe nada.
 */
export function CollectiveSummaryPage() {
  const { user, logout } = useAuth();
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const { activeCampaign, isLoading: activeLoading, error: activeError } = useCampaign();
  const pendingIdentification = useIdentificationPending();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<{ kind: DataStateKind; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Cambia en cada recarga para que el panel de sellado relea su estado.
  const [reloads, setReloads] = useState(0);
  const current = useRef<string | null>(null);
  const requested = useRef<string | null>(null);

  const load = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setReloads((value) => value + 1);
    try {
      const data = await collectiveService.summary(campaignId);
      if (current.current !== campaignId) return;
      reportDisclosureMode(data.disclosure.mode);
      setSummary(data);
    } catch (err) {
      if (current.current !== campaignId) return;
      setError({ kind: dataStateKindForError(err), text: collectiveError(err, 'No fue posible cargar el resumen colectivo.') });
    } finally {
      if (current.current === campaignId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    current.current = selected;
    // Una sola lectura por campaña aunque el efecto se repita (StrictMode).
    if (!selected || requested.current === selected) return;
    requested.current = selected;
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

  const campaign = campaigns.find((entry) => entry.id === selected) ?? null;
  const noActive = !activeLoading && !activeError && activeCampaign === null;
  const status = summary?.campaign.status ?? campaign?.status ?? null;
  const isActiveCampaign = Boolean(selected && activeCampaign && activeCampaign.id === selected);
  const proposalsUrl = selected ? `${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(selected)}` : COLLECTIVE_PATHS.proposals;
  const tenant = user?.tenant?.name;
  const policyPending = summary?.disclosure.mode === 'POLICY_PENDING';
  const needs = useMemo(() => summary?.cells.filter((cell) => cell.projection_type === 'DECLARED_NEED') ?? [], [summary]);
  const consumption = useMemo(() => summary?.cells.filter((cell) => cell.projection_type === 'CONSUMPTION_TOTAL') ?? [], [summary]);

  return (
    <AppShell title="Resumen colectivo" section="Colectivo">
      <div className="space-y-6">
        <HeroPanel
          attachToHeader
          testId="toolbar"
          title="Resumen de la campaña"
          breadcrumb={tenant ? `${tenant} · Resumen de la campaña` : 'Resumen de la campaña'}
          select={
            selected && campaigns.length > 0
              ? { label: 'Campaña', id: 'campaign-selector', value: selected, options: campaigns.map((entry) => ({ value: entry.id, label: entry.name })), onChange: select }
              : undefined
          }
          chips={
            selected && status ? (
              <>
                <StatusChip status={status} />
                {isActiveCampaign && <Chip tone="on-dark" size="md">Campaña activa</Chip>}
              </>
            ) : undefined
          }
          actions={
            selected ? (
              <>
                <IconButton label="Actualizar" icon={ICON.refresh} variant="on-dark" onClick={() => void load(selected)} disabled={loading} />
                <ExportButtons kind="summary" reference={selected} disabled={!summary || loading || policyPending} variant="on-dark" shortLabel />
              </>
            ) : undefined
          }
          primaryAction={
            selected ? (
              <Link to={proposalsUrl} className={buttonClassFor('accent', 'lg')}>
                Revisar borrador <Icon d={ICON.arrowRight} className="h-5 w-5" />
              </Link>
            ) : undefined
          }
        >
          {summary && !loading && (
            <HeroCoverage
              coverage={summary.coverage}
              sealedAt={summary.seal?.sealed_at}
              link={`${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(summary.campaign.campaign_ref)}`}
              stats={policyPending ? [] : heroStats(needs, summary.cells)}
            />
          )}
        </HeroPanel>

        {campaignsError && <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />}

        {!selected && !campaignsError && (
          <Card>
            <DataState
              state="empty"
              title="Todavía no hay campañas"
              description="Cree o abra una campaña para ver su resumen."
              action={
                <Link to={CAMPAIGNS_PATH} className={buttonClassFor('primary')}>
                  Ir a Campañas
                </Link>
              }
              testId="no-campaigns"
            />
          </Card>
        )}

        {loading && (
          <Card>
            <DataState state="loading" title={campaign?.name ?? 'Cargando…'} description="Cargando el resumen…" skeletonRows={3} />
          </Card>
        )}

        {error && !loading && (
          <Card>
            <SummaryError kind={error.kind} text={error.text} onRetry={selected ? () => void load(selected) : undefined} onLogout={() => void logout()} />
          </Card>
        )}

        {(summary || noActive) && !loading && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] xl:grid-rows-[auto_1fr] xl:items-start">
            <div className="min-w-0 xl:col-start-2 xl:row-start-1">
              <PendingActions summary={summary} noActive={noActive} campaignId={selected} proposalsUrl={proposalsUrl} pendingIdentification={pendingIdentification} />
            </div>
            {summary && (
              <div className="min-w-0 xl:col-start-1 xl:row-start-1 xl:row-span-2">
                {policyPending ? (
                  <Card>
                    <DataState
                      state="policy-pending"
                      description="El sindicato no aprobó aún la política de publicación. Cuando se apruebe, aquí aparecerán las necesidades y el consumo."
                      testId="policy-pending"
                    />
                  </Card>
                ) : (
                  <NeedsSection needs={needs} threshold={summary.disclosure.threshold} />
                )}
              </div>
            )}
            {summary && (
              <div className="min-w-0 space-y-6 xl:col-start-2 xl:row-start-2">
                {!policyPending && <ConsumptionCard cells={consumption} threshold={summary.disclosure.threshold} />}
                <VersionCard
                  seal={summary.seal}
                  status={summary.campaign.status}
                  sealPanel={
                    selected && !summary.seal ? (
                      <div id="sellado" tabIndex={-1} className="scroll-mt-24 outline-none">
                        <SealPanel key={`${selected}:${reloads}`} campaignId={selected} closedAt={campaign?.closedAt} onSealed={() => void load(selected)} />
                      </div>
                    ) : null
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${COUNT.format(count)} ${count === 1 ? one : many}`;
}

/**
 * Indicadores de la cabecera: recuentos de filas por estado (nunca cantidades)
 * y «Cifra más reciente» (regla de presentación declarada: el máximo de
 * `data_as_of` entre las cifras publicadas; el resumen no tiene marca global,
 * R11). Sin cifras publicadas no hay «Cifra más reciente».
 */
function heroStats(needs: SummaryCell[], cells: SummaryCell[]): HeroStatItem[] {
  const published = needs.filter((cell) => cell.status === 'DISCLOSED').length;
  const privacy = needs.filter((cell) => cell.status === 'SUPPRESSED_UNDER_THRESHOLD').length;
  const other = needs.length - published - privacy;
  const stats: HeroStatItem[] = [
    {
      key: 'published',
      label: 'Necesidades publicadas',
      value: needs.length === 0 ? 'Ninguna todavía' : plural(published, 'producto', 'productos'),
      testId: 'needs-published',
    },
  ];
  if (privacy > 0) stats.push({ key: 'privacy', label: 'Ocultas por privacidad', value: plural(privacy, 'producto', 'productos'), testId: 'needs-hidden' });
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

/** Estados 6–9 de la lámina 05, distinguidos por el error de la llamada (sin API nueva). */
function SummaryError({ kind, text, onRetry, onLogout }: { kind: DataStateKind; text: string; onRetry?: () => void; onLogout: () => void }) {
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

type NeedsFilter = 'all' | 'L' | 'KG' | 'hidden';

const FILTERS: { value: NeedsFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'L', label: 'Litros' },
  { value: 'KG', label: 'Kilogramos' },
  { value: 'hidden', label: 'Ocultas' },
];

/** «Necesidades declaradas»: buscador y filtros en el navegador sobre la respuesta ya recibida. */
function NeedsSection({ needs, threshold }: { needs: SummaryCell[]; threshold: number | null }) {
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
                description={`${threshold ? `Cada cifra necesita al menos ${threshold} agricultores.` : 'Cada cifra necesita el mínimo de agricultores de la política.'} Hay ${plural(needs.length, 'producto declarado que aún no llega', 'productos declarados que aún no llegan')}.`}
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
              <NeedsBars cells={visible} threshold={threshold} />
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
            <Icon d={ICON.info} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {threshold
                ? `Una cifra se oculta cuando aportaron menos de ${threshold} agricultores.`
                : 'Una cifra se oculta cuando aportaron menos agricultores que el umbral de la política.'}{' '}
              Oculta no es cero. Las barras comparan solo productos de la misma unidad.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

/** «Consumo publicado» (H-22): otro dato; no se resta ni se compara con la necesidad. */
function ConsumptionCard({ cells, threshold }: { cells: SummaryCell[]; threshold: number | null }) {
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
          <NeedsBars cells={cells} threshold={threshold} bars={false} />
        </div>
      )}
    </section>
  );
}

const STEPS = [
  { key: 'ABIERTA', label: 'Abierta' },
  { key: 'CERRADA', label: 'Cerrada' },
  { key: 'SELLADA', label: 'Sellada' },
];

/**
 * «Versión de las cifras» (H-05). El paso «Cerrada» es el estado de la
 * campaña; «Sellada», el `seal` del resumen. Con PLANIFICADA o CANCELADA no se
 * dibuja la línea de pasos: se muestra el estado.
 */
function VersionCard({ seal, status, sealPanel }: { seal: SealRef | null; status: string; sealPanel: ReactNode }) {
  const current = seal ? 2 : status === 'CERRADA' ? 1 : status === 'ABIERTA' ? 0 : -1;
  const note = seal
    ? null
    : status === 'ABIERTA'
      ? 'Las cifras pueden cambiar. Se sellan cuando la campaña esté cerrada.'
      : status === 'CERRADA'
        ? 'La campaña está cerrada; sus cifras todavía no están selladas. Cerrar no es sellar.'
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
          <StatusChip status={status} /> <span className="ml-1">Esta campaña no tiene versiones de cifras para sellar.</span>
        </p>
      )}
      {seal && (
        <div className="space-y-2 border-t border-line pt-4">
          <Chip tone="lime" dot size="md">
            Sellada · versión {seal.version}
          </Chip>
          <h3 className="text-xl font-bold text-ink">Cifras fijadas</h3>
          <p className="text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
            Versión {seal.version} sellada el {fmtDateTime(seal.sealed_at)} por {seal.sealed_by.name} (
            {seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'}). Datos aceptados hasta {fmtDateTime(seal.accepted_until)} · ref.{' '}
            <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>.
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Ya no cambian. Si un agricultor retira su aporte, esa cifra deja de mostrarse. Cada cifra indica su propia fecha; el servidor no
            puede asegurar que todos los teléfonos publicaron todo.
          </p>
        </div>
      )}
      {sealPanel && <div className="border-t border-line pt-4">{sealPanel}</div>}
    </section>
  );
}

/**
 * «Para atender» (H-07): sólo asuntos que un dato del servidor sustenta;
 * ninguno se deduce de cantidades. «N productos por identificar» sólo con un
 * recuento real (U.5): sin dato (`null`) no se muestra.
 */
function PendingActions({
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
    if (summary.campaign.status === 'CERRADA' && summary.seal === null) {
      items.push({
        id: 'closed-unsealed',
        onClick: () => {
          const target = document.getElementById('sellado');
          target?.scrollIntoView({ block: 'start' });
          target?.focus({ preventScroll: true });
        },
        text: (
          <span data-testid="action-closed-unsealed">
            Campaña cerrada sin sellar: revise la versión y, si corresponde, séllela. <span className="font-semibold">Ir al sellado</span>
          </span>
        ),
      });
    }
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
