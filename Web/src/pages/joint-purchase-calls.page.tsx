import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { SubstitutionPermissionsStrip } from '../components/b/substitution-permissions';
import { buttonClassFor, CampaignPill, Chip, DataState, FilterChips, ICON, Icon, Notice, PageHeader, StatusChip, surfaceClass } from '../components/ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { CAMPAIGN_STATUS_TEXT } from '../lib/collective-text';
import {
  CALL_STATUS_CHIP,
  CALL_STATUS_LABEL,
  callError,
  fmtDay,
  fmtWhen,
  PREPARE_CALL_PARAMS,
  readPreparedCall,
} from '../lib/joint-purchase-call-text';
import { jointPurchaseCallPath } from '../lib/navigation';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import type { JointPurchaseCallStatus, JointPurchaseCallSummary } from '../types/joint-purchase-calls';
import { JointPurchaseCallForm } from './joint-purchase-call-form';
import { useAuth } from '../hooks/use-auth';

type Filter = 'ALL' | JointPurchaseCallStatus;

const FILTER_LABEL: Record<Filter, string> = {
  ALL: 'Todas',
  OPEN: 'Abiertas',
  DRAFT: 'Borradores',
  CLOSED: 'Cerradas',
  CANCELLED: 'Canceladas',
};
const FILTER_ORDER: Filter[] = ['ALL', 'OPEN', 'DRAFT', 'CLOSED', 'CANCELLED'];

/** N1 (E2 §11.4): se crean y editan borradores en una campaña planificada o abierta; abrir exige que esté abierta. */
const CAMPAIGN_ACCEPTS_DRAFTS = new Set(['PLANIFICADA', 'ABIERTA']);

/**
 * E2 §6: «Compras conjuntas» (`/colectivo/compras-conjuntas`, láminas 09 y 37).
 * Lista las convocatorias de la campaña elegida (`?campaign=`) con una sola
 * llamada; los filtros y sus contadores se calculan en el navegador sobre esa
 * lista (B.1). La lista no muestra identidades de agricultores: sólo cuántas
 * personas participan. Crear un borrador no lo muestra a nadie hasta abrirlo.
 *
 * «Preparar convocatoria» (`?nueva=1&campana=&propuesta=&productos=`, desde un
 * borrador de compra, U.1): abre el formulario de creación con esa campaña, ese
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
  const keyRef = useRef(selected);
  useEffect(() => {
    keyRef.current = selected;
  }, [selected]);

  const load = useCallback(async (campaignId: string) => {
    setCalls(null);
    setProblem(null);
    try {
      // Una sola lectura de la campaña: los filtros y contadores salen de ella (sin filtro de estado en el servidor).
      const list = await jointPurchaseCallsService.list({ campaignId, status: null });
      if (keyRef.current === campaignId) setCalls(list);
    } catch (err) {
      if (keyRef.current !== campaignId) return;
      setProblem({
        message: callError(err, 'No fue posible cargar las convocatorias.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    void Promise.resolve().then(() => load(selected));
  }, [selected, load]);

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
      setPrepareProblem('No se pudo preparar la convocatoria: la campaña o el borrador de compra indicados no están disponibles.');
      clearPrepared(null);
    });
  }, [invalidPrepare, clearPrepared]);

  const campaign = campaigns.find((item) => item.id === selected) ?? null;
  const retry = selected ? () => void load(selected) : undefined;
  const canCreate = Boolean(selected && campaign && CAMPAIGN_ACCEPTS_DRAFTS.has(campaign.status));

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { ALL: 0, OPEN: 0, DRAFT: 0, CLOSED: 0, CANCELLED: 0 };
    for (const call of calls ?? []) {
      result.ALL += 1;
      result[call.status] += 1;
    }
    return result;
  }, [calls]);
  const shown = (calls ?? []).filter((call) => filter === 'ALL' || call.status === filter);
  const open = shown.filter((call) => call.status === 'OPEN');
  const drafts = shown.filter((call) => call.status === 'DRAFT');
  const finished = shown.filter((call) => call.status === 'CLOSED' || call.status === 'CANCELLED');
  const detailPath = (id: string) => `${jointPurchaseCallPath(id)}?campaign=${encodeURIComponent(selected ?? '')}`;

  return (
    <AppShell title="Compras conjuntas" section="Colectivo">
      <div className="flex flex-col gap-6 pb-4">
        <PageHeader
          attachToHeader
          title="Compras conjuntas"
          testId="calls-header"
          eyebrow={
            campaigns.length > 0 ? (
              <div className="mb-2">
                <CampaignPill campaigns={campaigns} selected={selected} onSelect={select} id="calls-campaign" />
              </div>
            ) : undefined
          }
          subtitle="Los agricultores piden desde su aplicación. Pedir no es comprar ni genera deuda."
          primaryAction={{ label: 'Nueva convocatoria', onClick: () => setCreating(true), disabled: !canCreate }}
          actions={
            selected && campaign && !canCreate ? (
              <p className="w-full text-sm text-on-ink-muted lg:w-auto lg:text-ink-muted" data-testid="calls-create-note">
                La campaña está {(CAMPAIGN_STATUS_TEXT[campaign.status] ?? campaign.status).toLowerCase()}: no admite convocatorias nuevas.
              </p>
            ) : undefined
          }
        />

        {message && <Notice kind="ok">{message}</Notice>}
        {prepareProblem && (
          <Notice kind="warn">
            <span data-testid="prepare-problem">{prepareProblem}</span>
          </Notice>
        )}

        {campaignsError ? (
          <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} />
        ) : !selected ? (
          <DataState state="empty" title="Sin campañas" description="Cree una campaña para preparar convocatorias de compra conjunta." />
        ) : problem ? (
          <DataState
            state={problem.forbidden ? 'forbidden' : 'error'}
            description={problem.message}
            onRetry={problem.forbidden ? undefined : retry}
            testId="calls-error"
          />
        ) : !calls ? (
          <DataState state="loading" skeletonRows={3} testId="calls-loading" />
        ) : calls.length === 0 ? (
          <DataState
            state="empty"
            title="Sin convocatorias"
            description="Todavía no hay convocatorias de compra conjunta en esta campaña. Eso no significa cero pedidos: nadie convocó todavía."
            testId="calls-empty"
          />
        ) : (
          <>
            <FilterChips
              label="Filtrar por estado"
              testId="call-status-filter"
              value={filter}
              onChange={setFilter}
              options={FILTER_ORDER.map((value) => ({ value, label: FILTER_LABEL[value], count: counts[value] }))}
            />
            {shown.length === 0 && filter !== 'ALL' ? (
              <DataState
                state="no-match"
                description={`No hay convocatorias en estado «${CALL_STATUS_LABEL[filter]}» en esta campaña.`}
                onClearFilters={() => setFilter('ALL')}
                testId="calls-no-match"
              />
            ) : (
              <>
                {open.length > 0 && (
                  <ListGroup title="Abiertas · reciben pedidos" count={filter === 'ALL' ? null : open.length}>
                    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {open.map((call) => (
                        <OpenCallCard key={call.call_id} call={call} mine={call.responsible.user_ref === user?.id} to={detailPath(call.call_id)} />
                      ))}
                    </ul>
                  </ListGroup>
                )}
                {drafts.length > 0 && (
                  <ListGroup title="Borradores · los agricultores aún no los ven">
                    <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`}>
                      {drafts.map((call) => (
                        <DraftRow key={call.call_id} call={call} mine={call.responsible.user_ref === user?.id} to={detailPath(call.call_id)} />
                      ))}
                    </ul>
                  </ListGroup>
                )}
                {finished.length > 0 && (
                  <ListGroup title="Terminadas">
                    <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`}>
                      {finished.map((call) => (
                        <FinishedRow key={call.call_id} call={call} to={detailPath(call.call_id)} />
                      ))}
                    </ul>
                  </ListGroup>
                )}
              </>
            )}
          </>
        )}

        {/* P-A A1 (§12) y U.4: la Directiva consulta aquí quién tiene «Sustituir responsable». */}
        <SubstitutionPermissionsStrip userId={user?.id ?? null} />
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
              void load(preparedCampaign.id);
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
              void load(selected);
            }
          }}
        />
      )}
    </AppShell>
  );
}

function ListGroup({ title, count = null, children }: { title: string; count?: number | null; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">
        {title}
        {count !== null && ` · ${count}`}
      </h2>
      {children}
    </section>
  );
}

/** Tarjeta de una convocatoria abierta (láminas 09 y 37). El nombre es el enlace; la tarjeta entera responde al clic. */
function OpenCallCard({ call, mine, to }: { call: JointPurchaseCallSummary; mine: boolean; to: string }) {
  return (
    <li className={`${surfaceClass} relative flex min-w-0 flex-col px-5 py-5 hover:border-ink`} data-testid={`call-row-${call.call_id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} />
        {mine && <Chip>Usted es responsable</Chip>}
      </div>
      <h3 className="mt-3 flex-1 text-xl font-bold leading-snug text-ink">
        <Link
          to={to}
          className="[overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {call.name}
        </Link>
      </h3>
      <div className="mt-4 flex items-end justify-between gap-4 border-t border-line pt-4">
        <div className="min-w-0">
          <p className="text-sm text-ink-muted">Cierra</p>
          <p className="font-semibold text-ink">{fmtWhen(call.deadline_at, 'always')}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-muted">Participan</p>
          <p className="font-display text-3xl font-extrabold leading-none text-ink tabular-nums">{call.participant_count}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-muted [overflow-wrap:anywhere]">
        Responsable: <span>{call.responsible.name}</span>
      </p>
    </li>
  );
}

function DraftRow({ call, mine, to }: { call: JointPurchaseCallSummary; mine: boolean; to: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-6" data-testid={`call-row-${call.call_id}`}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold text-ink [overflow-wrap:anywhere]">{call.name}</p>
        <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
          Responsable: <span>{call.responsible.name}</span>
          {mine ? ' (usted)' : ''} · fecha límite {fmtWhen(call.deadline_at, 'always')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} />
        <Link to={to} className={buttonClassFor('primary', 'sm')} aria-label={`Revisar y abrir «${call.name}»`}>
          Revisar y abrir
        </Link>
      </div>
    </li>
  );
}

/** Cerrada o cancelada. H-11: se muestra la responsable, no quién cerró o canceló (la lista no lo trae). */
function FinishedRow({ call, to }: { call: JointPurchaseCallSummary; to: string }) {
  const when =
    call.status === 'CANCELLED'
      ? `Cancelada el ${fmtDay(call.cancelled_at)} · sin consolidado`
      : `Cerrada el ${fmtDay(call.closed_at)} · ${call.participant_count === 1 ? '1 participante' : `${call.participant_count} participantes`}`;
  return (
    <li className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 hover:bg-canvas sm:px-6" data-testid={`call-row-${call.call_id}`}>
      <div className="min-w-0 flex-1 basis-64">
        <Link
          to={to}
          className="font-semibold text-ink [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {call.name}
        </Link>
        <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
          {when} · Responsable: <span>{call.responsible.name}</span>
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <StatusChip status={CALL_STATUS_CHIP[call.status] ?? call.status} />
        <Icon d={ICON.chevronRight} className="h-5 w-5 text-ink-muted" />
      </div>
    </li>
  );
}
