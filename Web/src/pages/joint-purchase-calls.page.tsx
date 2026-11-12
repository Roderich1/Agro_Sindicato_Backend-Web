import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import {
  Button,
  CampaignSelector,
  DataState,
  DataTable,
  Notice,
  PageHeader,
  Section,
  SegmentedControl,
  StatusChip,
} from '../components/ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { fmtDateTime } from '../lib/collective-text';
import {
  CALL_STATUS_CHIP,
  CALL_STATUS_LABEL,
  callError,
  PREPARE_CALL_PARAMS,
  readPreparedCall,
} from '../lib/joint-purchase-call-text';
import { jointPurchaseCallPath } from '../lib/navigation';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type { JointPurchaseCallStatus, JointPurchaseCallSummary } from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';
import { SubstitutionPermissionsSection } from './substitution-permissions-section';
import { useAuth } from '../hooks/use-auth';

type Filter = 'ALL' | JointPurchaseCallStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'DRAFT', label: CALL_STATUS_LABEL.DRAFT },
  { value: 'OPEN', label: CALL_STATUS_LABEL.OPEN },
  { value: 'CLOSED', label: CALL_STATUS_LABEL.CLOSED },
  { value: 'CANCELLED', label: CALL_STATUS_LABEL.CANCELLED },
];

/**
 * E2 §6: «Compras conjuntas» (`/colectivo/compras-conjuntas`). Lista las
 * convocatorias de la campaña elegida (`?campaign=`), filtradas por estado.
 * La lista no muestra identidades de agricultores: sólo cuántas personas
 * participan. Crear un borrador no lo muestra a nadie hasta abrirlo.
 *
 * «Preparar convocatoria» (`?nueva=1&campana=&propuesta=&productos=`, desde un
 * borrador de propuesta): abre el formulario de creación con esa campaña, ese
 * borrador y sus líneas de esos productos. No crea nada por sí solo; al cerrar
 * el formulario se quitan esos parámetros de la URL.
 */
export function JointPurchaseCallsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [calls, setCalls] = useState<JointPurchaseCallSummary[] | null>(null);
  const [problem, setProblem] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const prepared = readPreparedCall(params);
  const preparing = params.get('nueva') === '1';
  const preparedCampaign = prepared ? (campaigns.find((item) => item.id === prepared.campaignId) ?? null) : null;
  const [prepareProblem, setPrepareProblem] = useState<string | null>(null);
  const key = `${selected ?? ''}|${filter}`;
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const load = useCallback(async (campaignId: string, status: Filter, at: string) => {
    setCalls(null);
    setProblem(null);
    try {
      const list = await jointPurchaseCallsService.list({ campaignId, status: status === 'ALL' ? null : status });
      if (keyRef.current === at) setCalls(list);
    } catch (err) {
      if (keyRef.current !== at) return;
      setProblem({
        message: callError(err, 'No fue posible cargar las convocatorias.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    void Promise.resolve().then(() => load(selected, filter, key));
  }, [selected, filter, key, load]);

  /** Quita los parámetros de «Preparar convocatoria»; la lista queda en la campaña elegida (`keep`). */
  const clearPrepared = useCallback(
    (keep: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const name of PREPARE_CALL_PARAMS) next.delete(name);
          if (keep) next.set('campaign', keep);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // «Preparar convocatoria»: la lista muestra la campaña del borrador; si los datos no sirven, se avisa y se quitan.
  const preparedCampaignId = preparedCampaign?.id ?? null;
  const requestedCampaign = params.get('campaign');
  const invalidPrepare = preparing && (!prepared || (campaigns.length > 0 && !preparedCampaign));
  useEffect(() => {
    if (preparedCampaignId && requestedCampaign !== preparedCampaignId) {
      void Promise.resolve().then(() =>
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set('campaign', preparedCampaignId);
            return next;
          },
          { replace: true },
        ),
      );
    }
  }, [preparedCampaignId, requestedCampaign, setParams]);
  useEffect(() => {
    if (!invalidPrepare) return;
    void Promise.resolve().then(() => {
      setPrepareProblem('No se pudo preparar la convocatoria: la campaña o el borrador de propuesta indicados no están disponibles.');
      clearPrepared(null);
    });
  }, [invalidPrepare, clearPrepared]);

  const campaign = campaigns.find((item) => item.id === selected) ?? null;
  const retry = selected ? () => void load(selected, filter, key) : undefined;

  return (
    <AppShell title="Compras conjuntas" section="Colectivo">
      <div className="space-y-5">
        <PageHeader
          title="Compras conjuntas"
          subtitle="Convocatorias para que los agricultores indiquen, desde su aplicación, cuánto quieren solicitar de cada producto. Una participación es una cantidad solicitada: no es una compra ni una deuda."
          campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />}
          actions={
            <Button onClick={() => setCreating(true)} disabled={!selected || !campaign}>
              Nueva convocatoria
            </Button>
          }
        />
        {message && <Notice kind="ok">{message}</Notice>}
        {prepareProblem && (
          <Notice kind="warn">
            <span data-testid="prepare-problem">{prepareProblem}</span>
          </Notice>
        )}

        {campaignsError ? (
          <Section>
            <DataState compact state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} />
          </Section>
        ) : !selected ? (
          <Section>
            <DataState compact state="empty" title="Sin campañas" description="Cree una campaña para preparar convocatorias de compra conjunta." />
          </Section>
        ) : (
          <Section
            title="Convocatorias"
            note={campaign ? `Campaña «${campaign.name}»` : undefined}
            actions={<SegmentedControl label="Estado" options={FILTERS} value={filter} onChange={setFilter} testId="call-status-filter" />}
          >
            {problem ? (
              <DataState
                compact
                state={problem.forbidden ? 'forbidden' : 'error'}
                description={problem.message}
                onRetry={problem.forbidden ? undefined : retry}
                testId="calls-error"
              />
            ) : !calls ? (
              <DataState compact state="loading" testId="calls-loading" />
            ) : calls.length === 0 ? (
              filter === 'ALL' ? (
                <DataState
                  compact
                  state="empty"
                  title="Sin convocatorias"
                  description="Todavía no hay convocatorias de compra conjunta en esta campaña."
                  testId="calls-empty"
                />
              ) : (
                <DataState
                  compact
                  state="no-match"
                  description={`No hay convocatorias en estado «${CALL_STATUS_LABEL[filter]}» en esta campaña.`}
                  onClearFilters={() => setFilter('ALL')}
                  testId="calls-no-match"
                />
              )
            ) : (
              <DataTable caption="Convocatorias de compra conjunta" minWidth={760}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Campaña</th>
                    <th>Fecha límite</th>
                    <th>Responsable</th>
                    <th className="ui-num">Participantes</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.call_id} data-testid={`call-row-${call.call_id}`}>
                      <td>
                        <Link
                          to={`${jointPurchaseCallPath(call.call_id)}?campaign=${encodeURIComponent(selected)}`}
                          className="font-semibold text-brand-800 underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                        >
                          {call.name}
                        </Link>
                      </td>
                      <td>
                        <StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} />
                      </td>
                      <td className="[overflow-wrap:anywhere]">{call.campaign?.name ?? campaign?.name ?? '—'}</td>
                      <td>{fmtDateTime(call.deadline_at)}</td>
                      <td className="[overflow-wrap:anywhere]">{call.responsible.name}</td>
                      <td className="ui-num">{call.participant_count}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Section>
        )}
        {/* P-A A1 (§12): el permiso del sindicato «Sustituir responsable». */}
        <SubstitutionPermissionsSection userId={user?.id ?? null} />
      </div>

      {prepared && preparedCampaign && !creating && (
        <JointPurchaseCallForm
          campaignId={preparedCampaign.id}
          campaignName={preparedCampaign.name}
          preset={{ proposalId: prepared.proposalId, productRefs: prepared.productRefs }}
          onClose={() => clearPrepared(preparedCampaign.id)}
          onSaved={({ id, text }) => {
            if (id) navigate(`${jointPurchaseCallPath(id)}?campaign=${encodeURIComponent(preparedCampaign.id)}`, { state: { message: text } });
            else {
              setMessage(text);
              clearPrepared(preparedCampaign.id);
              void load(preparedCampaign.id, filter, `${preparedCampaign.id}|${filter}`);
            }
          }}
        />
      )}
      {creating && selected && campaign && (
        <JointPurchaseCallForm
          campaignId={selected}
          campaignName={campaign.name}
          onClose={() => setCreating(false)}
          onSaved={({ id, text }) => {
            setCreating(false);
            if (id) navigate(`${jointPurchaseCallPath(id)}?campaign=${encodeURIComponent(selected)}`, { state: { message: text } });
            else {
              setMessage(text);
              void load(selected, filter, key);
            }
          }}
        />
      )}
    </AppShell>
  );
}
