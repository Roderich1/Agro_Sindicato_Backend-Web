import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { Facts } from '../components/c/bits';
import { ParticipationCard } from '../components/c/participation-card';
import { SealPanel } from '../components/seal-panel';
import { buttonClassFor, Chip, DataState, HeroPanel, Icon, ICON, linkClass, Notice, StatusChip, Stepper, surfaceClass } from '../components/ui';
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

type Failure = { kind: 'error' | 'forbidden'; text: string };

const COUNT = new Intl.NumberFormat('es-BO');
const STEPS = [
  { key: 'ABIERTA', label: 'Abierta' },
  { key: 'CERRADA', label: 'Cerrada' },
  { key: 'SELLADA', label: 'Sellada' },
];

function failure(err: unknown, fallback: string, text: (err: unknown, fallback: string) => string): Failure {
  return { kind: axios.isAxiosError(err) && err.response?.status === 403 ? 'forbidden' : 'error', text: text(err, fallback) };
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
    await refreshList();
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
          corner={
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
            <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-on-ink-muted [overflow-wrap:anywhere]">
              <span className="font-semibold text-on-ink">Notas: </span>
              {campaign.notes || 'Sin notas'}
            </p>
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0" data-testid="detail-actions">
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
              description="La participación, la versión sellada y los borradores sólo los consultan la Directiva y el Administrador."
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
            <VersionCard campaign={campaign} summary={summary} onSealed={() => void loadSummary(campaign.id)} />
          </div>
        )}

        {collective && (
          <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-8`} aria-labelledby="drafts-title" data-testid="detail-proposals">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <h2 id="drafts-title" className="font-display text-2xl font-bold text-ink">
                  Borradores de compra
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">Un borrador no crea compras, lotes, movimientos, deudas ni pagos.</p>
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

/** «Versión de las cifras» (lámina 29) con el panel de sellado de la sesión A (30.3), sin editarlo. */
function VersionCard({ campaign, summary, onSealed }: { campaign: Campaign; summary: CollectiveSummary; onSealed: () => void }) {
  const seal = summary.seal;
  const step = seal ? 2 : campaign.status === 'CERRADA' ? 1 : campaign.status === 'ABIERTA' ? 0 : -1;
  const historyUrl = `${COLLECTIVE_PATHS.history}?vista=tendencias&campaign=${enc(campaign.id)}`;
  return (
    <section className={`${surfaceClass} min-w-0 px-5 py-6 sm:px-8`} aria-labelledby="version-title" data-testid="detail-seal">
      <h2 id="version-title" className="font-display text-2xl font-bold text-ink">
        Versión de las cifras
      </h2>
      <div className="mt-4 space-y-4">
        {step >= 0 ? (
          <Stepper label="Versión de las cifras" steps={STEPS} current={step} />
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
            Estado de la campaña: <StatusChip status={campaign.status} />
          </p>
        )}
        {seal ? (
          <div data-testid="seal-banner" className="space-y-3">
            <Facts
              rows={[
                ['Versión', `Versión ${seal.version} sellada`],
                ['Sellada el', fmtDateTime(seal.sealed_at)],
                ['Por', `${seal.sealed_by.name} (${seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'})`],
                ['Datos aceptados hasta', fmtDateTime(seal.accepted_until)],
              ]}
            />
            <p className="text-sm leading-relaxed text-ink-muted">
              La versión sellada ya no se corrige. Cada cifra indica su propia fecha. El servidor no puede asegurar que todos los teléfonos publicaron todo.
              Referencia <code title={seal.seal_ref}>{seal.seal_ref.slice(0, 8)}</code>.
            </p>
          </div>
        ) : (
          <>
            <p className="text-base leading-relaxed text-ink-muted" data-testid="unsealed">
              <span className="font-semibold text-ink">Sin sellar.</span>{' '}
              {campaign.status === 'CERRADA'
                ? 'La campaña está cerrada: revise la cobertura y los avisos y selle la versión. Una vez sellada, ya no se corrige.'
                : 'Las cifras todavía pueden cambiar. Primero se cierra la campaña; después se sella la versión, y ya no se corrige. Cerrar no es sellar.'}
            </p>
            <div id="sellado">
              <SealPanel campaignId={campaign.id} onSealed={onSealed} />
            </div>
          </>
        )}
        <Link to={historyUrl} className={`${linkClass} inline-flex min-h-11 items-center`}>
          Ver el histórico sellado
        </Link>
      </div>
    </section>
  );
}
