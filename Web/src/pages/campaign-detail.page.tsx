import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { CoverageCard } from '../components/coverage-card';
import { SealPanel } from '../components/seal-panel';
import { buttonClassFor, DataState, DataTable, Notice, PageHeader, Section, StatusChip, surfaceClass } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { extractError } from '../lib/format';
import { COLLECTIVE_PATHS, isCollectiveRole } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import type { Campaign } from '../types/campaigns';
import type { CollectiveSummary, ProposalSummary } from '../types/collective';
import { fmtCampaignDay, isEstimatedEndOverdue } from './campaign-dates';
import { CampaignActions, OverdueNote } from './campaigns.page';

type Failure = { kind: 'error' | 'forbidden'; text: string };

const COUNT = new Intl.NumberFormat('es-BO');

function failure(err: unknown, fallback: string, text: (err: unknown, fallback: string) => string): Failure {
  return { kind: axios.isAxiosError(err) && err.response?.status === 403 ? 'forbidden' : 'error', text: text(err, fallback) };
}

/**
 * Detalle de una campaña (`/campaigns/:id`). No existe `GET /campaigns/:id`
 * (matriz C2): se compone con la fila de `GET /campaigns`, `GET …/summary`
 * (cobertura, cifras y sello), `GET …/seal` sólo si no está sellada (lo pide
 * `SealPanel`) y `GET …/proposals` (borradores vinculados).
 *
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por visita, sin sondeo ni
 * recarga automática; «Reintentar» es una acción explícita. Ninguna lectura
 * escribe nada por sí misma.
 */
export function CampaignDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const collective = isCollectiveRole(user?.role);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [rowState, setRowState] = useState<'loading' | 'found' | 'missing'>('loading');
  const [rowError, setRowError] = useState<Failure | null>(null);
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [summaryError, setSummaryError] = useState<Failure | null>(null);
  const [proposals, setProposals] = useState<ProposalSummary[] | null>(null);
  const [proposalsError, setProposalsError] = useState<Failure | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const current = useRef(id);
  const requested = useRef<string | null>(null);

  const loadRow = useCallback(async (campaignId: string) => {
    setRowError(null);
    try {
      const rows = await campaignsService.list();
      if (current.current !== campaignId) return null;
      const found = rows.find((row) => row.id === campaignId) ?? null;
      setCampaign(found);
      setRowState(found ? 'found' : 'missing');
      return found;
    } catch (err) {
      if (current.current !== campaignId) return null;
      setCampaign(null);
      setRowState('missing');
      setRowError(failure(err, 'No fue posible cargar la campaña.', extractError));
      return null;
    }
  }, []);

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

  const visit = useCallback(
    async (campaignId: string) => {
      setRowState('loading');
      const found = await loadRow(campaignId);
      if (!found || !collective) return;
      await Promise.all([loadSummary(campaignId), loadProposals(campaignId)]);
    },
    [collective, loadRow, loadSummary, loadProposals],
  );

  useEffect(() => {
    current.current = id;
    // Una sola visita por campaña aunque el efecto se repita (StrictMode).
    if (requested.current === id) return;
    requested.current = id;
    void Promise.resolve().then(() => visit(id));
  }, [id, visit]);

  const changed = async (text: string) => {
    setMessage(text);
    await loadRow(id);
  };

  const backLink = (
    <Link to="/campaigns" className={buttonClassFor('ghost')}>
      Volver a Campañas
    </Link>
  );

  if (rowState === 'loading' || rowState === 'missing' || !campaign) {
    return (
      <AppShell title="Campaña" section="Gestión">
        <div className="space-y-4">
          <PageHeader title="Detalle de campaña" actions={backLink} />
          <div className={surfaceClass}>
            {rowState === 'loading' ? (
              <DataState state="loading" title="Cargando la campaña…" />
            ) : rowError ? (
              <DataState
                state={rowError.kind}
                description={rowError.kind === 'forbidden' ? undefined : rowError.text}
                onRetry={() => void visit(id)}
              />
            ) : (
              <DataState state="empty" title="Campaña no encontrada" description="No existe o no pertenece a su organización." testId="campaign-missing" />
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Campaña" section="Gestión">
      <div className="space-y-4">
        <PageHeader
          title={campaign.name}
          subtitle="Detalle de la campaña: datos generales, participación, versión sellada y borradores vinculados."
          actions={
            <>
              {backLink}
              <Link to={`${COLLECTIVE_PATHS.summary}?campaign=${encodeURIComponent(campaign.id)}`} className={buttonClassFor('secondary')}>
                Ver resumen
              </Link>
            </>
          }
        />
        {message && <Notice kind="ok">{message}</Notice>}

        <Section title="Datos generales" actions={<div className="flex flex-wrap gap-2" data-testid="detail-actions"><CampaignActions campaign={campaign} onChanged={changed} /></div>}>
          <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="general">
            <Field label="Nombre"><span className="[overflow-wrap:anywhere]">{campaign.name}</span></Field>
            <Field label="Estado">
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusChip status={campaign.status} />
                {campaign.isActive && <span className="inline-flex items-center rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">Activa</span>}
              </span>
            </Field>
            <Field label="Campaña activa">{campaign.isActive ? 'Sí, es la campaña activa del sindicato' : 'No'}</Field>
            <Field label="Inicio">{fmtCampaignDay(campaign.startDate) ?? '—'}</Field>
            <Field label="Fin estimado" testId="estimated-end">
              {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
              {isEstimatedEndOverdue(campaign) && <OverdueNote />}
            </Field>
            <Field label="Cierre registrado" testId="closed-at">
              {campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}
            </Field>
            <Field label="Notas" className="sm:col-span-2 lg:col-span-3">
              <span className="whitespace-pre-line [overflow-wrap:anywhere]">{campaign.notes || 'Sin notas'}</span>
            </Field>
          </dl>
        </Section>

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
            <DataState
              state={summaryError.kind}
              description={summaryError.text}
              onRetry={() => void loadSummary(campaign.id)}
              testId="summary-error"
            />
          </div>
        ) : !summary ? (
          <div className={surfaceClass}>
            <DataState state="loading" title="Cargando participación y versión…" />
          </div>
        ) : (
          <>
            <Section
              title="Participación"
              note="Cuántos agricultores vinculados están dentro de las cifras publicadas de esta campaña. No se muestra quién aportó ni cuánto."
            >
              <div className="p-4">
                <CoverageCard
                  coverage={summary.coverage}
                  sealedAt={summary.seal?.sealed_at}
                  link={`${COLLECTIVE_PATHS.coverage}?campaign=${encodeURIComponent(campaign.id)}`}
                  variant="full"
                />
              </div>
            </Section>
            <Section title="Versión sellada" testId="detail-seal">
              {summary.seal ? (
                <div className="px-5 py-4" data-testid="seal-banner">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Field label="Versión">Versión {summary.seal.version} sellada</Field>
                  <Field label="Sellada el">{fmtDateTime(summary.seal.sealed_at)}</Field>
                  <Field label="Por">
                    <span className="[overflow-wrap:anywhere]">
                      {summary.seal.sealed_by.name} ({summary.seal.sealed_by.role === 'ADMINISTRADOR' ? 'Administrador' : 'Directiva'})
                    </span>
                  </Field>
                  <Field label="Datos aceptados hasta">{fmtDateTime(summary.seal.accepted_until)}</Field>
                </dl>
                  <p className="mt-3 text-xs leading-relaxed text-slate-600">
                    Cada cifra indica su propia fecha. El servidor no puede asegurar que todos los teléfonos publicaron todo. Referencia{' '}
                    <code title={summary.seal.seal_ref}>{summary.seal.seal_ref.slice(0, 8)}</code>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 px-5 py-4">
                  <p className="text-sm text-slate-700" data-testid="unsealed">
                    <span className="font-semibold text-ink">Sin sellar.</span> Las cifras pueden cambiar mientras la campaña no tenga una
                    versión sellada. Cerrar no es sellar.
                  </p>
                  <div id="sellado">
                    <SealPanel campaignId={campaign.id} onSealed={() => void loadSummary(campaign.id)} />
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        {collective && (
          <Section
            title="Propuestas vinculadas"
            note="Borradores de propuesta de compra conjunta generados para esta campaña. Un borrador no crea compras, lotes, movimientos, deudas ni pagos."
            actions={
              <Link to={`${COLLECTIVE_PATHS.proposals}?campaign=${encodeURIComponent(campaign.id)}`} className={buttonClassFor('secondary', 'sm')}>
                Abrir en Necesidades y propuestas
              </Link>
            }
            testId="detail-proposals"
          >
            {proposalsError ? (
              <DataState state={proposalsError.kind} description={proposalsError.text} onRetry={() => void loadProposals(campaign.id)} />
            ) : proposals === null ? (
              <DataState state="loading" compact title="Cargando borradores…" />
            ) : proposals.length === 0 ? (
              <DataState state="empty" title="Sin borradores" description="Todavía no se generó ningún borrador para esta campaña." />
            ) : (
              <DataTable caption="Borradores de la campaña" minWidth={560}>
                <thead>
                  <tr>
                    <th scope="col">Generado el</th>
                    <th scope="col">Por</th>
                    <th scope="col" className="ui-num">Líneas</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((proposal) => (
                    <tr key={proposal.proposal_ref}>
                      <td className="whitespace-nowrap tabular-nums">{fmtDateTime(proposal.generated_at)}</td>
                      <td className="max-w-[18rem] [overflow-wrap:anywhere]">{proposal.generated_by.name}</td>
                      <td className="ui-num">
                        {COUNT.format(proposal.line_count)} {proposal.line_count === 1 ? 'línea' : 'líneas'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Section>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, children, testId, className = '' }: { label: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs font-semibold text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-ink tabular-nums" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}
