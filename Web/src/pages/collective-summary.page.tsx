import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeroCoverage } from '../components/a/coverage-figure';
import { AppShell } from '../components/app-shell';
import { ExportButtons } from '../components/export-buttons';
import { SealPanel } from '../components/seal-panel';
import {
  buttonClassFor,
  Card,
  Chip,
  DataState,
  dataStateKindForError,
  HeroPanel,
  ICON,
  Icon,
  IconButton,
  StatusChip,
  type DataStateKind,
} from '../components/ui';
import { useIdentificationPending } from '../contexts/identification-pending';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { CAMPAIGNS_PATH, COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { CollectiveSummary } from '../types/collective';
import { heroStats } from './collective-summary/summary-helpers';
import { ConsumptionCard, NeedsSection, PendingActions, SummaryError, VersionCard } from './collective-summary/summary-sections';

/**
 * F07-WEB-02 (#24): resumen de la campaña por producto canónico.
 * `GET …/summary` sobre una campaña sin sellar ejecuta la decisión de
 * divulgación en el servidor: una sola llamada por campaña y visita.
 */
export function CollectiveSummaryPage() {
  const { user, logout } = useAuth();
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const { activeCampaign, isLoading: activeLoading, error: activeError } = useCampaign();
  const pendingIdentification = useIdentificationPending();
  const [summary, setSummary] = useState<CollectiveSummary | null>(null);
  const [error, setError] = useState<{ kind: DataStateKind; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
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
                  <NeedsSection needs={needs} policy={summary.disclosure.policy} threshold={summary.disclosure.threshold} />
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
