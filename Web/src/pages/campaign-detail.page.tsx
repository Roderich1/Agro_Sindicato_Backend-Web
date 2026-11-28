import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { Facts } from '../components/c/bits';
import { ParticipationCard } from '../components/c/participation-card';
import { buttonClassFor, Chip, DataState, dataStateKindForError, HeroPanel, Icon, ICON, linkClass, Notice, StatusChip, Stepper, surfaceClass, type DataStateKind } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useCampaignList } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { CAMPAIGNS_PATH, COLLECTIVE_PATHS, isCollectiveRole } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { Campaign } from '../types/campaigns';
import type { CollectiveSummary, ProposalSummary } from '../types/collective';
import { fmtCampaignDay, isEstimatedEndOverdue } from './campaign-dates';
import { CampaignActions, OverdueNote } from './campaigns.page';

type Failure = { kind: DataStateKind; text: string };

const COUNT = new Intl.NumberFormat('es-BO');
function failure(err: unknown, fallback: string, text: (err: unknown, fallback: string) => string): Failure {
  return { kind: dataStateKindForError(err), text: text(err, fallback) };
}

const enc = encodeURIComponent;

/**
 * Detalle de una campaña (`/campaigns/:id`, lámina 29; diálogos 30.2, 30.3 y
 * 34.3). No existe `GET /campaigns/:id` (matriz C2): se compone con la fila de
 * `GET /campaigns`, `GET …/summary` (participación, cifras y sello),
 * `GET …/seal` sólo si no está sellada (lo pide `SealPanel`, de la sesión A)
 * y `GET …/proposals` (borradores de compra).
 *
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por visita, sin sondeo ni
 * recarga automática; «Reintentar» es una acción explícita. Ninguna lectura
 * escribe nada por sí misma.
 *
 * Uniones: «Ver resumen» → `/colectivo/resumen?campaign=` (U.7); el histórico
 * sellado → `/colectivo/historico?vista=tendencias&campaign=` (U.2); cada fila
 * de «Borradores de compra» → `/colectivo/propuestas?campaign=&borrador=`
 * (U.3) y «Abrir el más reciente» → `/colectivo/propuestas?campaign=`.
 *
 * «Versión de las cifras» (H-05): el paso «Cerrada» es el estado de la
 * campaña; con PLANIFICADA o CANCELADA no se dibuja la línea de pasos.
 */
export function CampaignDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const collective = isCollectiveRole(user?.role);
  const session = useCampaignList();
  const campaign: Campaign | null = session.campaigns.find((row) => row.id === id) ?? null;
  // Un id que no está en la lista de la sesión puede ser una campaña recién creada
  // en otra pestaña: se vuelve a pedir la lista una sola vez antes de decir que no existe.
  const [rechecked, setRechecked] = useState<string | null>(null);
  const recheckedRef = useRef<string | null>(null);
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [summaryError, setSummaryError] = useState<Failure | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [proposalsError, setProposalsError] = useState<Failure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const current = useRef(id);
  const requested = useRef<string | null>(null);

  const loadSummary = useCallback(async (campaignId: string) => {
    setSummary(null);
    setSummaryError(null);
    try {
      const data = await collectiveService.summary(campaignId);
      if (current.current !== campaignId) return;
      reportDisclosureMode(data.disclosure.mode);
      setSummary(data);
    } catch (err) {
      if (current.current === campaignId) setSummaryError(failure(err, 'No fue posible cargar la participación y la versión.', collectiveError));
    }
  }, []);

  const loadProposals = useCallback(async (campaignId: string) => {
    setProposals(null);
    setProposalsError(null);
    try {
      const data = await collectiveService.proposals(campaignId);
      if (current.current === campaignId) setProposals(data);
    } catch (err) {
      if (current.current === campaignId) setProposalsError(failure(err, 'No fue posible cargar los borradores.', collectiveError));
    }
  }, []);

  const found = Boolean(campaign);
  const { loading: listLoading, error: listError, refresh: refreshList } = session;
  useEffect(() => {
    current.current = id;
    if (listLoading || listError) return;
    if (!found) {
      if (recheckedRef.current !== id) {
        recheckedRef.current = id;
        void Promise.resolve().then(() => {
          setRechecked(id);
          return refreshList();
        });
      }
      return;
    }
    // Una sola visita por campaña aunque el efecto se repita (StrictMode).
    if (!collective || requested.current === id) return;
    requested.current = id;
    void Promise.resolve().then(() => Promise.all([loadSummary(id), loadProposals(id)]));
  }, [id, found, collective, listLoading, listError, refreshList, loadSummary, loadProposals]);

  const changed = async (text: string) => {
    setMessage(text);
    await Promise.all([refreshList(), loadSummary(id)]);
  };

  const backLink = (
    <Link to={CAMPAIGNS_PATH} className={`${buttonClassFor('on-dark', 'sm')} border-transparent bg-ink-raised`}>
      <Icon d={ICON.arrowRight} className="h-4 w-4 rotate-180" />
      Campañas
    </Link>
  );

  if (!campaign) {
    const waiting = listLoading || (!listError && rechecked !== id);
    return (
      <AppShell title="Campaña" section="Sindicato">
        <div className="flex flex-col gap-5">
          <HeroPanel attachToHeader title="Detalle de campaña" breadcrumb={backLink} />
          <div className={surfaceClass}>
            {waiting ? (
              <DataState state="loading" title="Cargando la campaña…" />
            ) : listError ? (
              <DataState state="error" description={listError} onRetry={() => void refreshList()} />
            ) : (
              <DataState state="empty" title="Campaña no encontrada" description="No existe o no pertenece a su organización." testId="campaign-missing" />
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  const summaryUrl = `${COLLECTIVE_PATHS.summary}?campaign=${enc(campaign.id)}`;
  const proposalsUrl = `${COLLECTIVE_PATHS.proposals}?campaign=${enc(campaign.id)}`;

  return (
    <AppShell title={campaign.name} section="Sindicato">
      <div className="flex flex-col gap-5">
        <HeroPanel
          attachToHeader
          title={campaign.name}
          testId="general"
          breadcrumb={backLink}
          chips={
            <>
              <StatusChip status={campaign.status} />
              {campaign.isActive && <Chip tone="on-dark">Campaña activa</Chip>}
            </>
          }
          stats={[
            { key: 'start', label: 'Empezó', value: fmtCampaignDay(campaign.startDate) ?? '—' },
            {
              key: 'end',
              label: 'Fin estimado',
              value: (
                <span data-testid="estimated-end">
                  {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
                  {isEstimatedEndOverdue(campaign) && <OverdueNote onDark />}
                </span>
              ),
            },
            {
              key: 'closed',
              label: 'Cierre',
              value: <span data-testid="closed-at">{campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}</span>,
            },
          ]}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            {campaign.notes?.trim() && (
              <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-on-ink-muted [overflow-wrap:anywhere]">
                <span className="font-semibold text-on-ink">Notas: </span>
                {campaign.notes}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:shrink-0" data-testid="detail-actions">
              <CampaignActions campaign={campaign} onChanged={changed} onDark />
              <Link to={summaryUrl} className={buttonClassFor('accent')}>
                Ver resumen
              </Link>
            </div>
          </div>
        </HeroPanel>
        {message && <Notice kind="ok">{message}</Notice>}

        {!collective ? (
          <div className={surfaceClass}>
            <DataState
              state="forbidden"
              description="La participación y los borradores están disponibles para Directiva y Administración."
              testId="collective-forbidden"
            />
          </div>
        ) : summaryError ? (
          <div className={surfaceClass}>
            <DataState state={summaryError.kind} description={summaryError.text} onRetry={() => void loadSummary(campaign.id)} testId="summary-error" />
          </div>
        ) : !summary ? (
          <div className={surfaceClass}>
            <DataState state="loading" title="Cargando participación y versión…" />
          </div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <ParticipationCard coverage={summary.coverage} sealedAt={summary.seal?.sealed_at} link={`${COLLECTIVE_PATHS.coverage}?campaign=${enc(campaign.id)}`} />
            <VersionCard campaign={campaign} summary={summary} />
          </div>
        )}

        {collective && (
          <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-8`} aria-labelledby="drafts-title" data-testid="detail-proposals">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <h2 id="drafts-title" className="font-display text-2xl font-bold text-ink">
                  Borradores de compra
                </h2>
              </div>
              {proposals && proposals.length > 0 && (
                <Link to={proposalsUrl} className={buttonClassFor('secondary', 'sm')}>
                  Abrir el más reciente
                </Link>
              )}
            </div>
            {proposalsError ? (
              <DataState state={proposalsError.kind} description={proposalsError.text} onRetry={() => void loadProposals(campaign.id)} />
            ) : proposals === null ? (
              <DataState state="loading" compact title="Cargando borradores…" />
            ) : proposals.length === 0 ? (
              <DataState state="empty" title="Sin borradores" description="Todavía no se generó ningún borrador para esta campaña." />
            ) : (
              <ul className="divide-y divide-line" aria-label="Borradores de la campaña">
                {proposals.map((proposal) => (
                  <li key={proposal.proposal_ref} className="relative flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 py-4 hover:bg-canvas">
                    <p className="min-w-0 flex-1 basis-44 font-semibold tabular-nums text-ink">{fmtDateTime(proposal.generated_at)}</p>
                    <p className="min-w-0 flex-1 basis-44 text-ink-muted [overflow-wrap:anywhere]">{proposal.generated_by.name}</p>
                    <p className="ml-auto text-ink-muted tabular-nums">
                      {COUNT.format(proposal.line_count)} {proposal.line_count === 1 ? 'producto' : 'productos'}
                    </p>
                    <Link
                      to={`${proposalsUrl}&borrador=${enc(proposal.proposal_ref)}`}
                      aria-label={`Abrir el borrador del ${fmtDateTime(proposal.generated_at)}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink after:absolute after:inset-0 after:content-[''] hover:bg-sunken focus-visible:outline-2"
                    >
                      <Icon d={ICON.chevronRight} className="h-5 w-5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

const VERSION_STEPS = [
  { key: 'open', label: 'Abierta' },
  { key: 'closed', label: 'Cerrada' },
  { key: 'history', label: 'Histórico fijado' },
];

function VersionCard({ campaign, summary }: Readonly<{ campaign: Campaign; summary: CollectiveSummary }>) {
  const history = summary.seal;
  const historyUrl = `${COLLECTIVE_PATHS.history}?vista=tendencias&campaign=${enc(campaign.id)}`;
  const showStepper = campaign.status === 'ABIERTA' || campaign.status === 'CERRADA';
  const currentStep = history ? 2 : campaign.status === 'CERRADA' ? 1 : 0;
  return (
    <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-8`} aria-labelledby="version-title" data-testid="detail-seal">
      <h2 id="version-title" className="font-display text-2xl font-bold text-ink">Resultados históricos</h2>
      <div className="mt-4 space-y-4">
        {showStepper && <Stepper label="Estado de los resultados históricos" steps={VERSION_STEPS} current={currentStep} testId="campaign-stepper" />}
        {history ? (
          <div data-testid="seal-banner">
            <Facts rows={[
              ['Fijados el', fmtDateTime(history.sealed_at)],
              ['Por', history.sealed_by.name],
            ]} />
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            {campaign.status === 'CERRADA' ? 'Sin resultados históricos disponibles.' : 'Los resultados se fijan al cerrar la campaña.'}
          </p>
        )}
        <Link to={historyUrl} className={`${linkClass} inline-flex min-h-11 items-center`}>Ver histórico de campañas</Link>
      </div>
    </section>
  );
}
