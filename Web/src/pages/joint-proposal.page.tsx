import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DisclosureNotice, Fingerprint } from '../components/collective-ui';
import { Figure } from '../components/estimation-figure';
import { ExportButtons } from '../components/export-buttons';
import { Button, CampaignPill, Card, Chip, DataState, DataTable, ICON, Icon, Notice, PageHeader, PrivacyChip, statusChipLabel, surfaceClass, Tabs } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime, statusReason } from '../lib/collective-text';
import { formatBaseValue, formatDecimalQuantity, formatQuantity, formatRoundedEstimate } from '../lib/quantity';
import { prepareCallPath } from '../lib/joint-purchase-call-text';
import { reportDisclosureMode } from '../lib/data-mode';
import {
  ACTION_TEXT,
  comparisonMessages,
  estimateScopeText,
  hasEstimateFigure,
  LINK_POLL_MS,
  linkErrorOf,
  linkErrorText,
  MODE_TEXT,
  outcomeText,
  PREPARE_BLOCKER_TEXT,
  sameSelection,
  staleSelectionOf,
  UPDATE_REASON_TEXT,
} from '../lib/estimation-link-text';
import {
  FAILURE_TEXT,
  formatAlpha,
  JOB_STATUS_TEXT,
  newRequestId,
  REASON_TEXT,
  RESULT_STATUS_TEXT,
  STOP_TEXT,
  VALIDITY_REASON_TEXT,
} from '../lib/estimation-text';
import { fmtCalendarDate } from '../lib/format';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import type { Proposal, ProposalLine, ProposalSummary } from '../types/collective';
import type { FailureCode, ResultDetail, Run, StopCode } from '../types/estimation';
import type { EstimationLinkLine, EstimationLinkView } from '../types/estimation-link';

const POLICY_PENDING_MESSAGE =
  'La política de divulgación no está aprobada: no se genera ni se guarda ninguna propuesta con cifras.';

/** La referencia fijada del borrador mostrado: se carga aparte y su fallo no oculta el borrador. */
type LinkLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; view: EstimationLinkView };

/** La selección de productos del borrador mostrado: `saved` es la del servidor; `chosen`, la marcada. */
type SelectionLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; revision: number; saved: string[]; chosen: string[] };

interface Feedback {
  kind: 'ok' | 'info' | 'warn' | 'error';
  message: string;
}

type LinkIntent = 'INITIAL' | 'UPDATE' | 'CLEAR';

/** Un problema de la vista: el texto y el estado del §4 con el que se presenta. */
interface Problem {
  kind: 'error' | 'forbidden' | 'restricted';
  message: string;
  /** Falló la carga del historial: se ofrece «Reintentar». */
  retry: boolean;
}

/**
 * F07-JP-01/02 (#26, #27): borrador de propuesta de compra conjunta desde la
 * necesidad declarada que el servidor publicó. No crea compras, lotes,
 * movimientos, deudas ni pagos, y no calcula cantidades en el navegador.
 *
 * E3 (docs/architecture/E3_ESTIMACION_EN_BORRADOR_CONTRATO.md §8): la tabla
 * muestra Producto · Necesidad declarada · Consumo estimado, con la referencia
 * **fijada** en el borrador (no la vigente al consultar de F12-EST-08). Al
 * montar, recargar o cambiar de borrador sólo se lee (`GET estimation-link` y
 * `GET selection`); «Obtener referencia», «Actualizar referencia» y «Quitar
 * referencia» son las únicas escrituras de la referencia, cada una con un
 * `request_id` nuevo. Mientras se calcula, se vuelve a leer cada
 * `LINK_POLL_MS`. La diferencia sólo se escribe cuando el servidor dice que
 * las cifras son comparables (§5), con su propio texto: la Web no la calcula.
 * La selección «Llevar a convocatoria» es independiente de la estimación: un
 * resultado tardío no la toca. Una respuesta que llega después de cambiar de
 * campaña, de identidad o de borrador se descarta.
 *
 * Panel de la defensa (2026-11-05): al elegir una campaña con borradores se
 * carga y muestra el último por el flujo de consulta (nunca se crea uno al
 * entrar, refrescar o cambiar de campaña); si se abre un borrador histórico se
 * respeta esa elección.
 *
 * Rediseño v2 (láminas 06, 07, 08, 36 y 51): «Borrador de compra» con tres
 * pestañas (Borrador actual · Borradores anteriores (N) · Cómo se calculó),
 * franja de la referencia con sus estados (05 §12), tabla Llevar · Producto ·
 * Necesidad declarada · Consumo estimado y barra «Preparar convocatoria →».
 * U.3: `?borrador=<proposalId>` abre ese borrador si es de la campaña (sólo
 * lectura: se busca en la lista ya pedida, nunca se crea ni se escribe nada).
 * H-09: la diferencia porcentual no se muestra (E3-R7).
 */
export function JointProposalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaigns, selected, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
  const [history, setHistory] = useState<ProposalSummary[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [link, setLink] = useState<LinkLoad | null>(null);
  const [linkFeedback, setLinkFeedback] = useState<Feedback | null>(null);
  const [acting, setActing] = useState<LinkIntent | null>(null);
  /** Sube tras una consulta periódica fallida, para volver a intentarlo. */
  const [selection, setSelection] = useState<SelectionLoad | null>(null);
  const [selectionFeedback, setSelectionFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  /** Historial pedido y aún sin respuesta: sólo entonces se dice «Cargando…». */
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tab, setTab] = useState<ProposalTab>('actual');
  /** Aviso cuando `?borrador=` no es de la campaña elegida (se muestra el más reciente). */
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  /** U.3: el borrador pedido en la URL; se lee al cargar el historial de la campaña. */
  const wantedDraft = useRef<string | null>(params.get('borrador'));

  // El contexto de lo que se muestra: identidad y campaña. Cada respuesta se aplica sólo si sigue siendo el mismo.
  const context = `${user?.id ?? ''}|${user?.tenantId ?? ''}|${user?.role ?? ''}|${selected ?? ''}`;
  const contextRef = useRef(context);
  const shownRef = useRef<string | null>(null);
  /** Doble toque: una sola petición en vuelo por acción. */
  const actingRef = useRef(false);
  const savingRef = useRef(false);
  /** Cambia con cada acción sobre la referencia: una lectura iniciada antes no pisa su resultado. */
  const linkEpochRef = useRef(0);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  useEffect(() => {
    shownRef.current = proposal?.proposal_ref ?? null;
  }, [proposal]);

  const fail = (err: unknown, fallback: string, retry = false) => {
    const message = collectiveError(err, fallback);
    const forbidden = axios.isAxiosError(err) && err.response?.status === 403;
    if (message === 'POLICY_PENDING') setProblem({ kind: 'restricted', message: POLICY_PENDING_MESSAGE, retry: false });
    else setProblem({ kind: forbidden ? 'forbidden' : 'error', message, retry: retry && !forbidden });
  };

  /** Sólo lee la referencia fijada. `quiet`: consulta periódica, sin «Cargando…» ni borrar lo mostrado. */
  const loadLink = useCallback(async (proposalRef: string, at: string, quiet = false) => {
    if (!quiet) setLink({ status: 'loading' });
    const epoch = linkEpochRef.current;
    const current = () => contextRef.current === at && shownRef.current === proposalRef && linkEpochRef.current === epoch;
    try {
      const view = await collectiveService.estimationLink(proposalRef);
      if (current() && view.proposal_ref === proposalRef) {
        setLink({ status: 'ready', view });
        // Una consulta periódica que encuentra el cálculo terminado sustituye el aviso «consulta su estado…».
        if (quiet && view.state !== 'CALCULATING') {
          setLinkFeedback(
            view.state === 'LINKED'
              ? { kind: 'ok', message: 'Cálculo terminado: la referencia quedó fijada con su resultado. Sus elecciones del borrador no cambiaron.' }
              : { kind: 'warn', message: 'El cálculo terminó sin cifras utilizables; el motivo está en la franja.' },
          );
        }
      }
    } catch (err) {
      if (!current()) return;
      if (quiet) {
        // m10 (2026-11-12): un fallo detiene el sondeo; el cálculo sigue en el
        // servidor y se vuelve a consultar sólo con «Reintentar».
        setLinkFeedback(null);
        setLink({
          status: 'error',
          message: `${collectiveError(err, 'No fue posible consultar el estado del cálculo.')} El cálculo puede seguir en curso: pulse «Reintentar» para consultarlo.`,
        });
      } else {
        setLink({ status: 'error', message: collectiveError(err, 'No fue posible cargar la referencia de consumo estimado.') });
      }
    }
  }, []);

  /** Sólo lee la selección guardada. */
  const loadSelection = useCallback(async (proposalRef: string, at: string) => {
    setSelection({ status: 'loading' });
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    try {
      const data = await collectiveService.proposalSelection(proposalRef);
      if (current() && data.proposal_ref === proposalRef) {
        setSelection({ status: 'ready', revision: data.revision, saved: data.product_refs, chosen: data.product_refs });
      }
    } catch (err) {
      if (current()) setSelection({ status: 'error', message: collectiveError(err, 'No fue posible cargar la selección de productos.') });
    }
  }, []);

  /** Muestra un borrador y pide (sólo lectura) su referencia y su selección, si el contexto sigue siendo el mismo. */
  const show = useCallback(
    (shown: Proposal, at: string) => {
      if (contextRef.current !== at) return;
      shownRef.current = shown.proposal_ref;
      linkEpochRef.current += 1;
      reportDisclosureMode(shown.disclosure.mode);
      setProposal(shown);
      setLinkFeedback(null);
      setSelectionFeedback(null);
      void loadLink(shown.proposal_ref, at);
      void loadSelection(shown.proposal_ref, at);
    },
    [loadLink, loadSelection],
  );

  const open = useCallback(
    async (id: string, at: string) => {
      setBusy(true);
      setProblem(null);
      try {
        const shown = await collectiveService.proposal(id);
        if (shown) show(shown, at);
      } catch (err) {
        if (contextRef.current === at) fail(err, 'No fue posible abrir el borrador.');
      } finally {
        setBusy(false);
      }
    },
    [show],
  );

  /** Carga el historial y, si nada se muestra todavía, abre (sin crear) el último borrador. */
  const loadHistory = useCallback(
    async (campaignId: string, at: string) => {
      setLoadingHistory(true);
      try {
        const list = await collectiveService.proposals(campaignId);
        if (contextRef.current !== at) return;
        setHistory(list);
        setLoadingHistory(false);
        const wanted = wantedDraft.current;
        wantedDraft.current = null;
        const target = wanted ? list.find((entry) => entry.proposal_ref === wanted) : undefined;
        if (wanted && !target) {
          setDraftNotice('El borrador pedido no es de esta campaña o ya no existe: se muestra el más reciente.');
        }
        if (shownRef.current === null && (target ?? list[0])) await open((target ?? list[0])!.proposal_ref, at);
      } catch (err) {
        if (contextRef.current !== at) return;
        setHistory([]);
        fail(err, 'No fue posible cargar el historial de propuestas.', true);
      } finally {
        if (contextRef.current === at) setLoadingHistory(false);
      }
    },
    [open],
  );

  useEffect(() => {
    if (!selected) return;
    const at = context;
    void Promise.resolve().then(() => {
      shownRef.current = null;
      linkEpochRef.current += 1;
      setProposal(null);
      setLink(null);
      setLinkFeedback(null);
      setSelection(null);
      setSelectionFeedback(null);
      setProblem(null);
      setTab('actual');
      return loadHistory(selected, at);
    });
  }, [selected, context, loadHistory]);

  // Mientras se calcula, se vuelve a leer la referencia (sólo GET). m10: sólo con
  // la vista activa (pestaña visible) y el cálculo pendiente; se detiene al
  // terminar o fallar el cálculo, al fallar la consulta, al cambiar de borrador,
  // de campaña o de identidad, y al salir.
  const shownProposalRef = proposal?.proposal_ref ?? null;
  const calculating = link?.status === 'ready' && link.view.state === 'CALCULATING';
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (!calculating || !shownProposalRef || !pageVisible) return;
    const at = context;
    const timer = setTimeout(() => void loadLink(shownProposalRef, at, true), LINK_POLL_MS);
    return () => clearTimeout(timer);
  }, [calculating, shownProposalRef, context, link, loadLink, pageVisible]);

  /** Única escritura de la vista sobre el borrador: sólo con el botón, nunca al entrar, refrescar ni cambiar de campaña. */
  const generate = async () => {
    if (!selected) return;
    const at = context;
    setBusy(true);
    setProblem(null);
    try {
      const created = await collectiveService.generateProposal(selected);
      show(created, at);
      setTab('actual');
      setDraftNotice(null);
      setDraftParam(null);
      const list = await collectiveService.proposals(selected);
      if (contextRef.current === at) setHistory(list);
    } catch (err) {
      if (contextRef.current === at) fail(err, 'No fue posible generar el borrador.');
    } finally {
      setBusy(false);
    }
  };

  /** «Obtener», «Actualizar» o «Quitar referencia»: un `request_id` nuevo por pulsación; nunca dos en vuelo. */
  const actOnLink = async (intent: LinkIntent) => {
    if (!proposal || link?.status !== 'ready' || actingRef.current) return;
    const seen = link.view.link?.link_ref ?? null;
    if (intent !== 'INITIAL' && seen === null) return;
    const proposalRef = proposal.proposal_ref;
    const at = context;
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    actingRef.current = true;
    linkEpochRef.current += 1;
    setActing(intent);
    setLinkFeedback(null);
    try {
      const requestId = newRequestId();
      const result =
        intent === 'CLEAR'
          ? await collectiveService.clearEstimationLink(proposalRef, { request_id: requestId, expected_link_ref: seen! })
          : await collectiveService.prepareEstimationLink(
              proposalRef,
              intent === 'UPDATE' ? { request_id: requestId, mode: 'UPDATE', expected_link_ref: seen } : { request_id: requestId, mode: 'INITIAL' },
            );
      if (!current()) return;
      linkEpochRef.current += 1;
      if (result.view.proposal_ref === proposalRef) setLink({ status: 'ready', view: result.view });
      setLinkFeedback({ kind: result.outcome === 'NOT_CALCULABLE' ? 'warn' : 'ok', message: outcomeText(result.outcome, result.reason) });
    } catch (err) {
      if (!current()) return;
      linkEpochRef.current += 1;
      const body = linkErrorOf(err);
      if (body?.view && body.view.proposal_ref === proposalRef) setLink({ status: 'ready', view: body.view });
      const text = body ? linkErrorText(body.errorCode) : null;
      setLinkFeedback({
        kind: body?.errorCode === 'REFERENCE_CHANGED' || body?.errorCode === 'REFERENCE_UP_TO_DATE' ? 'warn' : 'error',
        message: text ?? collectiveError(err, 'No fue posible completar la acción sobre la referencia. El borrador no cambia.'),
      });
    } finally {
      actingRef.current = false;
      setActing(null);
    }
  };

  /** Marca o desmarca un producto. La estimación nunca cambia esta lista. */
  const toggleProduct = (productRef: string) => {
    if (!proposal) return;
    const order = productOrder(proposal);
    setSelection((state) => {
      if (state?.status !== 'ready') return state;
      const chosen = new Set(state.chosen);
      if (chosen.has(productRef)) chosen.delete(productRef);
      else chosen.add(productRef);
      return { ...state, chosen: order.filter((ref) => chosen.has(ref)) };
    });
    setSelectionFeedback(null);
  };

  /** Guarda la selección con la revisión vista; ante SELECTION_STALE carga la vigente y avisa. */
  const saveSelection = async () => {
    if (!proposal || selection?.status !== 'ready' || savingRef.current) return;
    const proposalRef = proposal.proposal_ref;
    const at = context;
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    savingRef.current = true;
    setSaving(true);
    setSelectionFeedback(null);
    try {
      const saved = await collectiveService.saveProposalSelection(proposalRef, {
        expected_revision: selection.revision,
        product_refs: selection.chosen,
      });
      if (!current()) return;
      setSelection({ status: 'ready', revision: saved.revision, saved: saved.product_refs, chosen: saved.product_refs });
      setSelectionFeedback({ kind: 'ok', message: 'Selección guardada. No inscribe a nadie ni asigna cantidades.' });
    } catch (err) {
      if (!current()) return;
      const stale = staleSelectionOf(err);
      const body = linkErrorOf(err);
      if (stale) {
        setSelection({ status: 'ready', revision: stale.revision, saved: stale.product_refs, chosen: stale.product_refs });
      } else if (body?.errorCode === 'SELECTION_STALE') {
        void loadSelection(proposalRef, at);
      }
      const text = body ? linkErrorText(body.errorCode) : null;
      setSelectionFeedback({
        kind: body?.errorCode === 'SELECTION_STALE' ? 'warn' : 'error',
        message: text ?? collectiveError(err, 'No fue posible guardar la selección.'),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /** Pone o quita `?borrador=` sin crear una entrada nueva del historial del navegador. */
  const setDraftParam = (proposalRef: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (proposalRef) next.set('borrador', proposalRef);
        else next.delete('borrador');
        return next;
      },
      { replace: true },
    );

  /** «Ver» un borrador de la lista: sólo lectura; vuelve a la pestaña del borrador. El que ya se muestra no se vuelve a pedir. */
  const openDraft = async (proposalRef: string) => {
    setDraftNotice(null);
    setTab('actual');
    if (proposalRef === shownRef.current) return;
    setDraftParam(proposalRef === history[0]?.proposal_ref ? null : proposalRef);
    await open(proposalRef, context);
  };

  /** Cambiar de campaña quita `?borrador=` (era de otra campaña). */
  const chooseCampaign = (id: string) => {
    wantedDraft.current = null;
    setDraftNotice(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('campaign', id);
      next.delete('borrador');
      return next;
    });
  };

  const prepareCall = () => {
    if (!proposal || selection?.status !== 'ready' || selection.saved.length === 0) return;
    navigate(prepareCallPath(proposal.campaign.campaign_ref, proposal.proposal_ref, selection.saved));
  };

  const retry = selected ? () => void loadHistory(selected, context) : undefined;
  const latestRef = history[0]?.proposal_ref ?? null;
  const shownIsLatest = proposal !== null && proposal.proposal_ref === latestRef;
  const shownCampaign = campaigns.find((campaign) => campaign.id === selected) ?? null;
  const view = link?.status === 'ready' ? link.view : null;
  const tabs: { value: ProposalTab; label: ReactNode; count?: number }[] = [
    { value: 'actual', label: shownIsLatest || history.length === 0 ? 'Borrador actual' : 'Borrador anterior' },
    {
      value: 'anteriores',
      label: (
        <>
          <span className="sm:hidden">Anteriores</span>
          <span className="hidden sm:inline">Borradores anteriores</span>
        </>
      ),
      count: history.length,
    },
    { value: 'calculo', label: 'Cómo se calculó' },
  ];
  return (
    <AppShell title="Necesidades y propuestas" section="Colectivo">
      <div className="space-y-5">
        <PageHeader
          eyebrow={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span>Necesidades y propuestas</span>
              <CampaignPill campaigns={campaigns} selected={selected} onSelect={chooseCampaign} />
            </span>
          }
          title="Borrador de compra"
          subtitle={proposal ? <GeneratedLine proposal={proposal} /> : 'Borrador basado en las necesidades declaradas publicadas. No ejecuta ninguna compra.'}
          testId="proposal-header"
        />
        <div className="flex flex-wrap items-center gap-3">
          {proposal && <ExportButtons kind="proposal" reference={proposal.proposal_ref} shortLabel />}
          <Button variant={proposal ? 'secondary' : 'primary'} onClick={() => void generate()} disabled={!selected || busy} busy={busy}>
            {busy ? 'Trabajando…' : proposal ? 'Generar borrador nuevo' : 'Generar borrador'}
          </Button>
        </div>
        {campaignsError && <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />}
        {problem && (
          <Card>
            <DataState
              state={problem.kind}
              title={problem.kind === 'error' ? 'No fue posible completar la consulta' : undefined}
              description={problem.message}
              onRetry={problem.retry ? retry : undefined}
              testId="proposal-problem"
            />
          </Card>
        )}
        {draftNotice && (
          <Notice kind="info" compact>
            {draftNotice}
          </Notice>
        )}
        {proposal || history.length > 0 ? (
          <>
            <Tabs label="Borrador de compra" idBase="borrador" variant="pill" tabs={tabs} value={tab} onChange={setTab} testId="proposal-tabs" />
            {/*
              Los tres paneles quedan montados y los inactivos se ocultan (`hidden`): así el detalle de la
              ejecución ya pedido, la selección marcada y la consulta periódica no se repiten al cambiar de pestaña.
            */}
            <ProposalTabPanel value="actual" active={tab === 'actual'}>
              {proposal ? (
                <ProposalDetail
                  proposal={proposal}
                  latest={shownIsLatest}
                  onShowLatest={latestRef && !shownIsLatest ? () => void openDraft(latestRef) : undefined}
                  link={link}
                  linkFeedback={linkFeedback}
                  acting={acting}
                  onAct={(intent) => void actOnLink(intent)}
                  onRetryLink={() => void loadLink(proposal.proposal_ref, context)}
                  selection={selection}
                  selectionFeedback={selectionFeedback}
                  saving={saving}
                  onToggle={toggleProduct}
                  onSave={() => void saveSelection()}
                  onRetrySelection={() => void loadSelection(proposal.proposal_ref, context)}
                  onPrepareCall={prepareCall}
                />
              ) : (
                <Card>
                  <DataState state={busy || loadingHistory ? 'loading' : 'empty'} title={busy || loadingHistory ? 'Cargando el borrador…' : 'Elija un borrador'} description={busy || loadingHistory ? undefined : 'Abra uno en «Borradores anteriores».'} />
                </Card>
              )}
            </ProposalTabPanel>
            <ProposalTabPanel value="anteriores" active={tab === 'anteriores'}>
              <HistoryList history={history} current={proposal} onOpen={(id) => void openDraft(id)} busy={busy} />
            </ProposalTabPanel>
            <ProposalTabPanel value="calculo" active={tab === 'calculo'}>
              {proposal ? (
                <HowCalculated proposal={proposal} link={link} view={view} campaignName={shownCampaign?.name ?? proposal.campaign.name} onRetry={() => void loadLink(proposal.proposal_ref, context)} />
              ) : (
                <Card>
                  <DataState state="empty" title="Sin borrador abierto" description="Abra un borrador para ver cómo se calculó su consumo estimado." />
                </Card>
              )}
            </ProposalTabPanel>
          </>
        ) : loadingHistory ? (
          <Card>
            <DataState state="loading" title="Cargando…" description="Cargando los borradores de la campaña…" skeletonRows={3} />
          </Card>
        ) : (
          selected &&
          !problem && (
            <Card>
              <DataState
                state="empty"
                title="Todavía no hay borradores para esta campaña"
                description="Genere el primero con «Generar borrador». Sin borrador no hay cifras que revisar: eso no significa cero."
              />
            </Card>
          )
        )}
      </div>
    </AppShell>
  );
}

type ProposalTab = 'actual' | 'anteriores' | 'calculo';

/** Panel de pestaña que sigue montado aunque no esté activo (oculto con `hidden`). Mismos ids que `Tabs`. */
function ProposalTabPanel({ value, active, children }: { value: ProposalTab; active: boolean; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`borrador-panel-${value}`}
      aria-labelledby={`borrador-tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className="focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      {children}
    </div>
  );
}

/**
 * «Generado el … por … · al generarlo, N de M agricultores tenían cifras
 * publicadas»: la cobertura guardada al generar el borrador, que no es la
 * actual. Un borrador anterior a F10-SEC-02 contaba también filas sin cifra
 * (`basis = ALL_CONTRIBUTORS`) y se rotula así; no se reescribe.
 */
function GeneratedLine({ proposal }: { proposal: Proposal }) {
  const coverage = proposal.coverage;
  return (
    <span>
      Generado el {fmtDateTime(proposal.generated_at)} por {proposal.generated_by.name}
      {coverage && (
        <span data-testid="coverage">
          {' '}
          · al generarlo ({fmtDateTime(proposal.generated_at)}),{' '}
          {coverage.basis === 'ALL_CONTRIBUTORS' ? (
            <>
              {fmtCount(coverage.members_with_contribution)} de {fmtCount(coverage.linked_members)} agricultores vinculados habían aportado datos en esa
              fecha (regla anterior a F10-SEC-02: contaba también filas sin cifra)
            </>
          ) : (
            <>
              {fmtCount(coverage.members_with_contribution)} de {fmtCount(coverage.linked_members)} agricultores vinculados con cifras publicadas en esa
              fecha
            </>
          )}
          . No es la cobertura actual.
        </span>
      )}
    </span>
  );
}

function fmtCount(value: number): string {
  return new Intl.NumberFormat('es-BO').format(value);
}

/** Los productos del borrador en el orden de sus líneas, sin repetir. */
function productOrder(proposal: Proposal): string[] {
  return [...new Set(proposal.lines.map((line) => line.product_ref))];
}

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad. */
function linkLineOf(link: LinkLoad | null, line: ProposalLine): EstimationLinkLine | null {
  if (link?.status !== 'ready') return null;
  const found = link.view.lines.find((l) => l.position === line.position);
  return found && found.product.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

interface DetailProps {
  proposal: Proposal;
  latest: boolean;
  onShowLatest?: () => void;
  link: LinkLoad | null;
  linkFeedback: Feedback | null;
  acting: LinkIntent | null;
  onAct: (intent: LinkIntent) => void;
  onRetryLink: () => void;
  selection: SelectionLoad | null;
  selectionFeedback: Feedback | null;
  saving: boolean;
  onToggle: (productRef: string) => void;
  onSave: () => void;
  onRetrySelection: () => void;
  onPrepareCall: () => void;
}

function ProposalDetail(props: DetailProps) {
  const { proposal, link, selection, saving, onToggle } = props;
  const view = link?.status === 'ready' ? link.view : null;
  const messages = view ? comparisonMessages(view) : { shared: null, perLine: new Map<number, string>() };
  const chosen = selection?.status === 'ready' ? new Set(selection.chosen) : null;
  return (
    <section className="space-y-5" aria-label="Detalle del borrador">
      {/* Encabezado para lectores de pantalla: la vista ya tiene el título visible «Borrador de compra». */}
      <h2 className="sr-only">Borrador · {proposal.campaign.name}</h2>
      <DisclosureNotice mode={proposal.disclosure.mode} />
      {!props.latest && (
        <Notice kind="info" compact action={props.onShowLatest && <Button variant="secondary" size="sm" onClick={props.onShowLatest}>Ver el actual</Button>}>
          Está viendo un borrador anterior, generado el {fmtDateTime(proposal.generated_at)}. Muestra las cifras de ese momento.
        </Notice>
      )}
      {proposal.lines.length > 0 && (
        <LinkBanner link={link} feedback={props.linkFeedback} acting={props.acting} onAct={props.onAct} onRetry={props.onRetryLink} />
      )}
      {proposal.lines.length === 0 ? (
        <Card>
          <DataState state="empty" title="Sin necesidades declaradas publicadas" description="Ausencia de declaración = desconocido, no cero." />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="space-y-1 px-5 pt-4 sm:px-8">
            <LinesSummary lines={proposal.lines} />
            {messages.shared && (
              <p className="text-sm text-ink-muted" data-testid="comparison-note">
                {messages.shared}
              </p>
            )}
          </div>
          {/* En un teléfono (< sm) cada línea se apila: casilla, producto, necesidad y consumo estimado, sin desplazamiento lateral. */}
          <div className="mt-2 [&_.ui-table-scroll]:rounded-none [&_.ui-table-scroll]:border-0 [&_.ui-table-scroll]:shadow-none">
            <DataTable caption="Líneas del borrador">
              <thead>
                <tr className="max-sm:hidden">
                  <th className="w-16 pl-5 sm:pl-8">Llevar</th>
                  <th>Producto</th>
                  <th className="ui-num">Necesidad declarada</th>
                  <th className="ui-num pr-5 sm:pr-8" data-testid="reference-header">
                    Consumo estimado
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.lines.map((line) => {
                  const marked = chosen?.has(line.product_ref) ?? false;
                  return (
                    <tr
                      key={line.position}
                      className={`max-sm:grid max-sm:grid-cols-[2.75rem_1fr] max-sm:gap-x-2 max-sm:border-b max-sm:border-line max-sm:px-4 max-sm:py-4 ${marked ? 'bg-lime-soft/40' : ''}`}
                      data-testid={`line-${line.product_name}-${line.base_unit}`}
                    >
                      <td className="align-middle max-sm:row-span-3 max-sm:border-0 max-sm:p-0 max-sm:pt-0.5 sm:pl-5 md:pl-8">
                        <input
                          type="checkbox"
                          className="h-6 w-6 cursor-pointer rounded accent-ink"
                          checked={marked}
                          disabled={!chosen || saving}
                          onChange={() => onToggle(line.product_ref)}
                          aria-label={`Llevar a convocatoria: ${line.product_name} (${line.presentation_unit})`}
                          data-testid="select-product"
                        />
                      </td>
                      <td className="max-sm:border-0 max-sm:p-0 [overflow-wrap:anywhere] sm:min-w-48">
                        <p className="text-base font-semibold text-ink">
                          {line.product_name} <span className="sr-only">({line.presentation_unit})</span>
                        </p>
                        <ProductNote line={line} />
                      </td>
                      <td className="align-middle max-sm:border-0 max-sm:p-0 max-sm:pt-3 sm:min-w-44 sm:text-right" data-testid="need">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted sm:hidden">Necesidad declarada</span>
                        <NeedCell line={line} />
                      </td>
                      <td className="align-middle max-sm:border-0 max-sm:p-0 max-sm:pt-3 sm:min-w-56 sm:pr-5 sm:text-right md:pr-8">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-ink-muted sm:hidden">Consumo estimado</span>
                        <div data-testid="reference">
                          <EstimateCell line={line} link={link} message={messages.perLine.get(line.position) ?? null} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </div>
          <ReferenceNote proposal={proposal} view={view} />
        </div>
      )}
      {proposal.lines.length > 0 && (
        <SelectionBar
          selection={selection}
          feedback={props.selectionFeedback}
          saving={saving}
          onSave={props.onSave}
          onRetry={props.onRetrySelection}
          onPrepareCall={props.onPrepareCall}
        />
      )}
      <p className="text-sm text-ink-muted">
        Borrador basado en las necesidades declaradas publicadas. Requiere revisión: no resta stock, no es una necesidad neta y no ejecuta
        ninguna compra. Huella del borrador: <Fingerprint value={proposal.inputs_fingerprint} />. Misma huella = mismas entradas autorizadas y mismas líneas. Cada
        borrador queda guardado tal como se generó; ninguno se modifica. No crea compras, lotes, movimientos, deudas ni pagos.
      </p>
    </section>
  );
}

/** Bajo el nombre: el aviso de cifra anterior (lámina 06). El motivo de una fila sin cifra va en su necesidad. */
function ProductNote({ line }: { line: ProposalLine }) {
  if (line.status === 'DISCLOSED') {
    return line.pending_changes ? (
      <p className="mt-0.5 text-sm text-ink-muted">
        Cifra anterior: hay cambios sin publicar<span className="sr-only">. Hay cambios recibidos que aún no alcanzan el umbral: se muestra la cifra anterior.</span>
      </p>
    ) : null;
  }
  return null;
}

/** Necesidad declarada: la cifra publicada o el motivo, nunca un número para una fila sin cifra. */
function NeedCell({ line }: { line: ProposalLine }) {
  const disclosed = line.status === 'DISCLOSED';
  const text = disclosed ? formatQuantity(line.quantity_base, line.base_unit, line.quantity_presentation) : null;
  return (
    <div className="space-y-1">
      {disclosed ? (
        text === null ? (
          <span className="text-sm font-semibold text-danger-ink">Dato no válido recibido del servidor; no se muestra.</span>
        ) : (
          <span className="block font-display text-2xl font-extrabold leading-tight tracking-tight text-ink tabular-nums">{text}</span>
        )
      ) : line.status === 'SUPPRESSED_UNDER_THRESHOLD' ? (
        <PrivacyChip />
      ) : (
        <Chip tone="hidden" icon={ICON.lock}>
          {statusChipLabel(line.status)}
        </Chip>
      )}
      {!disclosed && (
        <span className="block text-sm leading-snug text-ink-muted">
          {line.status === 'SUPPRESSED_UNDER_THRESHOLD' ? 'Menos aportantes que el umbral de privacidad.' : statusReason(line.status)}
        </span>
      )}
      {disclosed && <span className="block text-xs text-ink-muted">datos hasta {fmtDateTime(line.data_as_of)}</span>}
      <span className="block text-sm text-ink-muted" data-testid="contributors">
        {disclosed && line.contributors !== null ? `${line.contributors} ${line.contributors === 1 ? 'aportante' : 'aportantes'}` : 'Aportantes no revelados'}
      </span>
    </div>
  );
}

/**
 * Qué parte del borrador tiene cifra publicada: cuenta líneas (nunca suma
 * cantidades). El motivo de cada línea sin cifra está en su fila.
 */
function LinesSummary({ lines }: { lines: ProposalLine[] }) {
  const shown = lines.filter((line) => line.status === 'DISCLOSED').length;
  const hidden = lines.length - shown;
  return (
    <p className="text-sm text-ink-muted" data-testid="lines-summary">
      <span className="font-semibold tabular-nums text-ink">
        {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
      </span>{' '}
      en el borrador: <span className="tabular-nums">{shown}</span> con cifra publicada
      {hidden > 0 && (
        <>
          {' '}
          y <span className="tabular-nums">{hidden}</span> sin cifra (el motivo está en su fila)
        </>
      )}
      . Marque lo que irá a la convocatoria.
    </p>
  );
}

/** Tono de la franja según el estado de la referencia (lámina 05 §12). */
function bannerTone(view: EstimationLinkView): string {
  if (view.state === 'LINKED') return view.update.available ? 'bg-warn-bg text-warn-ink' : 'bg-lime-soft text-lime-ink';
  if (view.state === 'UNAVAILABLE') return 'bg-danger-bg text-danger-ink';
  return 'bg-sunken text-ink';
}

/** Franja sobre la tabla: el estado de la referencia fijada y una sola acción (lámina 05 §12). */
function LinkBanner({
  link,
  feedback,
  acting,
  onAct,
  onRetry,
}: {
  link: LinkLoad | null;
  feedback: Feedback | null;
  acting: LinkIntent | null;
  onAct: (intent: LinkIntent) => void;
  onRetry: () => void;
}) {
  const box = 'rounded-card px-5 py-4 sm:px-7';
  if (!link || link.status === 'loading') {
    return (
      <div className={`${box} bg-sunken`} data-testid="link-banner">
        <p className="flex items-center gap-3 text-base text-ink" data-testid="link-state">
          <Icon d={ICON.info} className="h-5 w-5 shrink-0" />
          Cargando la referencia de consumo estimado…
        </p>
      </div>
    );
  }
  if (link.status === 'error') {
    return (
      <div className={`${box} bg-danger-bg text-danger-ink`} data-testid="link-banner">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 flex-1 items-start gap-3 text-base" role="alert" data-testid="link-state">
            <Icon d={ICON.warn} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{link.message} El borrador no cambia.</span>
          </p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  const view = link.view;
  const busy = acting !== null;
  const primary = primaryAction(view);
  const run = view.run;
  let title: string;
  let detail: string;
  let icon: string = ICON.info;
  switch (view.state) {
    case 'NONE':
      title = 'Sin referencia de consumo estimado';
      detail = view.prepare_blocker
        ? PREPARE_BLOCKER_TEXT[view.prepare_blocker]
        : 'Obtenga una referencia para ver el consumo estimado junto a la necesidad declarada: se fija una ejecución ya calculada si es compatible; si no, se pide un cálculo.';
      break;
    case 'CALCULATING':
      title = 'Calculando la referencia…';
      detail = `${view.link?.job_status ? `${JOB_STATUS_TEXT[view.link.job_status]}. ` : ''}La vista consulta el estado cada pocos segundos, sin calcular nada más. El borrador y la selección siguen disponibles.`;
      break;
    case 'LINKED':
      icon = view.update.available ? ICON.warn : ICON.check;
      title = view.update.available ? 'Consumo estimado desactualizado' : 'Consumo estimado fijado';
      detail = [
        view.link ? `el ${fmtDateTime(view.link.created_at)}` : null,
        run ? `temporada ${run.season.key.toLowerCase()}` : null,
        run ? `ejecución del ${fmtDateTime(run.generated_at)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
        .concat(view.update.available ? '. Sus datos cambiaron: no se reemplaza sola.' : '. Solo cambia si usted lo actualiza.');
      break;
    case 'UNAVAILABLE':
      icon = ICON.warn;
      title = 'El cálculo no se completó';
      detail = unavailableText(view);
      break;
    case 'RESTRICTED':
      icon = ICON.lock;
      title = 'Referencia restringida';
      detail =
        'La política de divulgación no está aprobada: se conserva el vínculo (ejecución, fecha y método) pero no se muestra ninguna cifra ni recuento.';
      break;
  }
  const actionLabel = (intent: LinkIntent) => (view.state === 'UNAVAILABLE' && intent === 'UPDATE' ? 'Reintentar' : intent === 'INITIAL' ? 'Obtener' : 'Actualizar');
  return (
    <div className={`${box} ${bannerTone(view)}`} data-testid="link-banner" data-state={view.state}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
          <Icon d={icon} className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="min-w-0 text-base leading-snug">
            <strong className="font-semibold" data-testid="link-state">
              {title}
            </strong>{' '}
            <span data-testid="link-detail">
              {detail}
              {view.update.available && view.update.reason && ` ${UPDATE_REASON_TEXT[view.update.reason]}`}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {primary === 'CALCULATING' && (
            <Button variant="secondary" size="sm" disabled>
              Calculando…
            </Button>
          )}
          {(primary === 'INITIAL' || primary === 'UPDATE') && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              busy={acting === primary}
              aria-label={primary === 'INITIAL' ? 'Obtener referencia' : 'Actualizar referencia'}
              onClick={() => onAct(primary)}
            >
              {actionLabel(primary)}
            </Button>
          )}
          {view.link && (
            <button
              type="button"
              className="min-h-11 px-1 text-sm font-semibold underline underline-offset-2 disabled:opacity-60"
              disabled={busy}
              aria-busy={acting === 'CLEAR'}
              aria-label="Quitar referencia"
              onClick={() => onAct('CLEAR')}
            >
              Quitar
            </button>
          )}
        </div>
      </div>
      {feedback && (
        <div className="mt-3" role="status" data-testid="link-feedback">
          <Notice kind={feedback.kind} compact>
            {feedback.message}
          </Notice>
        </div>
      )}
    </div>
  );
}

/** La única acción principal que corresponde a la vista. */
function primaryAction(view: EstimationLinkView): LinkIntent | 'CALCULATING' | null {
  if (view.state === 'CALCULATING') return 'CALCULATING';
  if (view.state === 'NONE') return view.prepare_blocker ? null : 'INITIAL';
  if (view.update.available && view.link) return 'UPDATE';
  return null;
}

function unavailableText(view: EstimationLinkView): string {
  const stop = view.link?.stop_code;
  const failure = view.link?.failure_code ?? view.run?.failure_code;
  if (stop && stop in STOP_TEXT) return STOP_TEXT[stop as StopCode];
  if (failure && failure in FAILURE_TEXT) return FAILURE_TEXT[failure as FailureCode];
  return 'El cálculo no produjo cifras. Puede volver a pedirlo con «Actualizar referencia».';
}

/**
 * El consumo estimado de una línea según su estado. Si el servidor declara
 * comparables las cifras, se escribe su observación tal cual; la Web **no**
 * muestra porcentaje aunque el servidor lo calcule (E3-R7, H-09).
 */
function EstimateCell({ line, link, message }: { line: ProposalLine; link: LinkLoad | null; message: string | null }) {
  if (!link || link.status === 'loading') return <span className="text-ink-muted">Cargando…</span>;
  if (link.status === 'error') return <span className="text-ink-muted">No disponible</span>;
  const ref = linkLineOf(link, line);
  if (!ref) return <span className="text-ink-muted">—</span>;
  const e = ref.estimation;
  const short = (label: string, why?: string | null) => (
    <span className="text-base text-ink-muted" data-testid="estimate-state">
      {label}
      {why && <span className="block text-sm">{why}</span>}
    </span>
  );
  switch (e.state) {
    case 'NONE':
      return short('Sin referencia');
    case 'CALCULATING':
      return short('Calculando…');
    case 'INSUFFICIENT_DATA':
      return short(e.status ? RESULT_STATUS_TEXT[e.status] : 'Datos insuficientes', e.reason_code ? REASON_TEXT[e.reason_code] : null);
    case 'ERROR':
      return short('Error: sin cifra', e.reason_code ? REASON_TEXT[e.reason_code] : 'El cálculo no se completó (el motivo está en la franja de arriba).');
    case 'NO_RESULT':
      return short('Sin resultado', 'La ejecución fijada no incluye este producto y unidad.');
    case 'RESTRICTED':
      return short(
        'Restringida',
        e.validity_reason === 'SOURCES_WITHDRAWN' ? VALIDITY_REASON_TEXT.SOURCES_WITHDRAWN : 'La política de divulgación no está aprobada: no se muestra la cifra.',
      );
    case 'AVAILABLE':
    case 'OUTDATED':
      break;
  }
  if (!hasEstimateFigure(ref)) return short('Sin cifra');
  const comparison = ref.comparison;
  // Decisión del autor (2026-11-03): la referencia se muestra aunque la necesidad de la fila no esté divulgada.
  const needHidden = line.status !== 'DISCLOSED';
  return (
    <div className="space-y-1">
      {needHidden && (
        <p className="text-sm text-ink-muted" data-testid="reference-hidden-need">
          La necesidad de esta fila no está divulgada. Lo que sigue es la estimación del consumo: no la sustituye ni se suma a la propuesta.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">
        {e.state === 'OUTDATED' && <Chip tone="attention">Desactualizada</Chip>}
        <span className="text-xl font-bold tabular-nums text-ink">
          <span
            title={`Cifra exacta: ${formatDecimalQuantity(e.estimate_base, ref.base_unit) ?? ''} (${formatBaseValue(e.estimate_base, ref.base_unit) ?? ''})`}
            data-testid="estimate-figure"
          >
            {formatRoundedEstimate(e.estimate_base, ref.base_unit) ?? 'Cifra no válida'}
          </span>
        </span>
        {e.state === 'AVAILABLE' && (
          <span className="sr-only" data-testid="estimate-state">
            Vigente
          </span>
        )}
      </div>
      {ref.scope.estimate && (
        <p className="text-sm text-ink-muted" data-testid="estimate-scope">
          {estimateScopeText(ref.scope.estimate)}
        </p>
      )}
      {e.state === 'OUTDATED' && e.validity_reason && (
        <p className="text-sm text-ink-muted">{VALIDITY_REASON_TEXT[e.validity_reason]} No se compara con la necesidad.</p>
      )}
      {comparison.comparable && comparison.difference && (
        <p className="text-sm font-medium text-ink" data-testid="reference-difference">
          {comparison.difference.observation} Sólo informativo: no cambia el borrador.
        </p>
      )}
      {!comparison.comparable && message && (
        <p className="text-sm text-ink-muted" data-testid="comparison-message">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * Barra inferior (láminas 06 y 36): cuántos productos se eligieron, «Guardar
 * selección» si hay cambios y «Preparar convocatoria →» con la selección
 * **guardada** (E3-R6). Es pegajosa sólo mientras se recorre la tabla: al
 * final ocupa su sitio y no tapa la última fila.
 */
function SelectionBar({
  selection,
  feedback,
  saving,
  onSave,
  onRetry,
  onPrepareCall,
}: {
  selection: SelectionLoad | null;
  feedback: Feedback | null;
  saving: boolean;
  onSave: () => void;
  onRetry: () => void;
  onPrepareCall: () => void;
}) {
  const box = 'ui-on-ink sticky bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-10 rounded-card bg-ink px-5 py-4 text-white shadow-raised sm:px-7 lg:bottom-4';
  if (!selection || selection.status === 'loading') {
    return (
      <div className={box} data-testid="selection-bar">
        <p className="text-sm text-on-ink-muted">Cargando la selección de productos…</p>
      </div>
    );
  }
  if (selection.status === 'error') {
    return (
      <div className={`${box} flex flex-wrap items-center justify-between gap-3`} data-testid="selection-bar">
        <p className="text-sm text-white" role="alert">
          {selection.message}
        </p>
        <Button variant="on-dark" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
  const dirty = !sameSelection(selection.chosen, selection.saved);
  const count = selection.saved.length;
  const chosenCount = selection.chosen.length;
  return (
    <div className={box} data-testid="selection-bar">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 flex-1 basis-60 text-base" data-testid="selection-summary">
          <span className="font-display text-xl font-extrabold text-lime tabular-nums">{chosenCount}</span>{' '}
          {chosenCount === 1 ? 'producto elegido' : 'productos elegidos'} para la convocatoria{dirty ? ' (cambios sin guardar)' : ''}.
          <span className="block text-xs text-on-ink-muted sm:text-sm">Elegir no inscribe a nadie ni asigna cantidades; la estimación no cambia esta selección.</span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {/* En teléfono, sin cambios que guardar, el botón desactivado no ocupa sitio (lámina 36). */}
          <Button variant="on-dark" className={dirty || saving ? '' : 'max-sm:hidden'} disabled={!dirty || saving} busy={saving} onClick={onSave}>
            {saving ? 'Guardando…' : 'Guardar selección'}
          </Button>
          <Button
            variant="accent"
            disabled={dirty || count === 0 || saving}
            onClick={onPrepareCall}
            aria-label={`Preparar convocatoria (${count} ${count === 1 ? 'producto' : 'productos'})`}
            iconEnd={<Icon d={ICON.arrowRight} className="h-5 w-5" />}
          >
            Preparar convocatoria
          </Button>
        </div>
      </div>
      {dirty && <p className="mt-2 text-sm text-on-ink-muted">Guarde la selección para preparar la convocatoria con ella.</p>}
      {feedback && (
        <div className="mt-3" role="status" data-testid="selection-feedback">
          <Notice kind={feedback.kind} compact>
            {feedback.message}
          </Notice>
        </div>
      )}
    </div>
  );
}

function ReferenceNote({ proposal, view }: { proposal: Proposal; view: EstimationLinkView | null }) {
  return (
    <div className="space-y-1 border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-muted sm:px-8" data-testid="reference-note">
      <p>
        El consumo estimado es la referencia fijada en este borrador: no se suma a la necesidad declarada, no es la cantidad solicitada ni la
        confirmada en una convocatoria y no cambia las líneas ni la huella del borrador. Sólo se actualiza a pedido. La diferencia con la
        necesidad sólo se escribe si el servidor confirma que ambas cifras son comparables.{' '}
        <Link className="font-semibold text-link underline underline-offset-2" to={estimationPath(proposal)}>
          Detalle en «Estimación del consumo»
        </Link>
        .
      </p>
      {view && (
        <p data-testid="reference-evaluated">
          Vigencia evaluada el {fmtDateTime(view.evaluated_at)}
          {view.run ? ` · Temporada ${view.run.season.key}` : ''} · «Descargar Excel» consulta de nuevo el borrador y esta referencia fijada al
          exportar, con su versión, fecha y estado; no usa otra estimación en su lugar.
        </p>
      )}
    </div>
  );
}

function estimationPath(proposal: Proposal): string {
  return `${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(proposal.campaign.campaign_ref)}`;
}

/**
 * Pestaña «Borradores anteriores» (lámina 07): cada borrador con su fecha,
 * autor, número de productos y huella; «Actual» es el último generado. «Ver»
 * lo muestra (sólo lectura). Ninguno se modifica.
 */
function HistoryList({
  history,
  current,
  onOpen,
  busy,
}: {
  history: ProposalSummary[];
  current: Proposal | null;
  onOpen: (id: string) => void;
  busy: boolean;
}) {
  return (
    <section aria-label="Historial de borradores" className="space-y-4">
      {history.length === 0 ? (
        <Card>
          <DataState state="empty" title="Todavía no hay borradores para esta campaña" description="Sin borradores no hay cifras que revisar: eso no significa cero." />
        </Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {history.map((entry, index) => {
            const shown = entry.proposal_ref === current?.proposal_ref;
            return (
              <li key={entry.proposal_ref} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-8 ${shown ? 'bg-lime-soft/30' : ''}`}>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-lg font-bold text-ink tabular-nums">{fmtDateTime(entry.generated_at)}</p>
                  <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
                    Generado por <span>{entry.generated_by.name}</span> · {productsText(entry.line_count)} · huella <Fingerprint value={entry.inputs_fingerprint} />
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {index === 0 ? (
                    <Chip tone="lime" dot size="md">
                      Actual
                    </Chip>
                  ) : (
                    <Chip tone="neutral" size="md">
                      Anterior
                    </Chip>
                  )}
                  {shown && <span className="text-sm font-semibold text-ink">Se muestra</span>}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="underline underline-offset-2"
                    onClick={() => onOpen(entry.proposal_ref)}
                    disabled={busy && !shown}
                  >
                    Ver
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-ink-muted">
        Un borrador anterior no cambia: muestra las cifras del momento en que se generó. Si una de sus cifras ya no se publica, tampoco se muestra
        aquí.
      </p>
    </section>
  );
}

function productsText(count: number): string {
  if (count === 0) return 'sin productos';
  return `${fmtCount(count)} ${count === 1 ? 'producto' : 'productos'}`;
}

/** Recuento de líneas sin estimación, por su estado (nunca todo como «falta de datos», MATRIZ 08). */
const NO_ESTIMATE_TEXT: Record<string, [string, string]> = {
  INSUFFICIENT_DATA: ['con datos insuficientes', 'con datos insuficientes'],
  RESTRICTED: ['restringido', 'restringidos'],
  NO_RESULT: ['sin resultado', 'sin resultado'],
  ERROR: ['con error de cálculo', 'con error de cálculo'],
  NONE: ['sin referencia', 'sin referencia'],
  CALCULATING: ['calculándose', 'calculándose'],
};

/**
 * Pestaña «Cómo se calculó» (láminas 08 y 51). Todo sale de la referencia
 * fijada (`GET …/estimation-link`): la ejecución, el vínculo y el alcance de
 * cada línea. Los rangos «entre … y …» son el mínimo y el máximo de los
 * `scope` de las líneas, sin cifras nuevas. Método, parámetros, fuentes e
 * historial siguen en el detalle técnico.
 */
function HowCalculated({
  proposal,
  link,
  view,
  campaignName,
  onRetry,
}: {
  proposal: Proposal;
  link: LinkLoad | null;
  view: EstimationLinkView | null;
  campaignName: string;
  onRetry: () => void;
}) {
  if (!link || link.status === 'loading') {
    return (
      <Card>
        <DataState state="loading" title="Cargando la referencia…" />
      </Card>
    );
  }
  if (link.status === 'error' || !view) {
    return (
      <Card>
        <DataState state="error" description="No se pudo cargar la referencia de consumo estimado de este borrador. El motivo está en la pestaña «Borrador»." onRetry={onRetry} />
      </Card>
    );
  }
  const run = view.run;
  const scopes = view.lines.map((line) => line.scope.estimate).filter((scope): scope is NonNullable<typeof scope> => scope !== null);
  const range = (values: number[]) => {
    if (values.length === 0) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${fmtCount(min)}` : `Entre ${fmtCount(min)} y ${fmtCount(max)}`;
  };
  const campaignsRange = range(scopes.map((scope) => scope.span_campaigns));
  const contributorsRange = scopes.length === 0 ? null : range([...scopes.map((scope) => scope.contributors_min), ...scopes.map((scope) => scope.contributors_max)]);
  const counts = new Map<string, number>();
  for (const line of view.lines) {
    if (line.estimation.state === 'AVAILABLE' || line.estimation.state === 'OUTDATED') continue;
    counts.set(line.estimation.state, (counts.get(line.estimation.state) ?? 0) + 1);
  }
  const missing = [...counts.entries()].map(([state, count]) => {
    const [one, many] = NO_ESTIMATE_TEXT[state] ?? ['sin cifra', 'sin cifra'];
    return `${fmtCount(count)} ${count === 1 ? `producto ${one}` : `productos ${many}`}`;
  });
  const linkState =
    view.state === 'LINKED'
      ? view.update.available
        ? 'Desactualizada'
        : 'Vigente'
      : view.state === 'CALCULATING'
        ? 'Calculando'
        : view.state === 'RESTRICTED'
          ? 'Restringida'
          : view.state === 'UNAVAILABLE'
            ? 'No completada'
            : 'Sin referencia';
  const season = run ? seasonName(run.season.key) : null;
  return (
    <div className="grid gap-5 lg:grid-cols-3 lg:items-start" data-testid="how-calculated">
      <section className="ui-on-ink rounded-card bg-ink px-6 py-6 text-white sm:px-8" aria-labelledby="pocas-palabras">
        <h2 id="pocas-palabras" className="text-2xl font-bold text-white">
          En pocas palabras
        </h2>
        {run ? (
          <p className="mt-3 text-lg leading-relaxed text-on-ink">
            El consumo estimado sale del consumo publicado en las campañas anteriores de la misma temporada ({season}), dando más peso a las más
            recientes.
          </p>
        ) : (
          <p className="mt-3 text-lg leading-relaxed text-on-ink">Este borrador todavía no tiene una referencia de consumo estimado fijada.</p>
        )}
        <p className="mt-3 text-base leading-relaxed text-on-ink-muted">
          Es una referencia para comparar. No se suma a la necesidad declarada ni decide cuánto comprar.
        </p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8" aria-labelledby="con-que-datos">
        <h2 id="con-que-datos" className="text-2xl font-bold text-ink">
          Con qué datos
        </h2>
        {run ? (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base" data-testid="calc-data">
            <dt className="text-ink-muted">Calculado</dt>
            <dd className="font-semibold text-ink">{fmtDateTime(run.generated_at)}</dd>
            <dt className="text-ink-muted">Temporada</dt>
            <dd className="font-semibold text-ink">{season}</dd>
            <dt className="text-ink-muted">Para la campaña</dt>
            <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{run.target.name ?? campaignName}</dd>
            <dt className="text-ink-muted">Campañas usadas</dt>
            <dd className="font-semibold text-ink">{campaignsRange ? `${campaignsRange}, según el producto` : 'No disponible'}</dd>
            <dt className="text-ink-muted">Aportantes por campaña</dt>
            <dd className="font-semibold text-ink">{contributorsRange ? `${contributorsRange}, según el producto` : 'No disponible'}</dd>
            <dt className="text-ink-muted">Sin estimación</dt>
            <dd className="font-semibold text-ink">{missing.length > 0 ? missing.join(' · ') : 'Ninguno'}</dd>
          </dl>
        ) : (
          <p className="mt-4 text-base text-ink-muted">Sin una ejecución fijada no hay datos del cálculo.</p>
        )}
        <p className="mt-4 text-sm text-ink-muted">El alcance de cada producto está en su fila del borrador.</p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8" aria-labelledby="referencia-borrador">
        <h2 id="referencia-borrador" className="text-2xl font-bold text-ink">
          Referencia del borrador
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base">
          <dt className="text-ink-muted">Fijada</dt>
          <dd className="font-semibold text-ink">{view.link ? fmtDateTime(view.link.created_at) : 'Sin fijar'}</dd>
          {view.link && (
            <>
              <dt className="text-ink-muted">Por</dt>
              <dd className="font-semibold text-ink [overflow-wrap:anywhere]">{view.link.created_by.name}</dd>
            </>
          )}
          <dt className="text-ink-muted">Estado</dt>
          <dd className="font-semibold text-ink">{linkState}</dd>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Solo cambia si alguien pulsa «Actualizar». Si sus datos de origen cambian, se marca «Desactualizada» y no se reemplaza sola.
        </p>
      </section>
      <section className="rounded-card border border-line bg-surface px-6 py-6 shadow-card sm:px-8 lg:col-span-3" aria-labelledby="detalle-tecnico">
        <h2 id="detalle-tecnico" className="text-2xl font-bold text-ink">
          Detalle técnico
        </h2>
        {run && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-base sm:max-w-2xl">
            <dt className="text-ink-muted">Método</dt>
            <dd className="font-semibold text-ink">{run.method === 'SES_NAIVE' ? 'Suavizado exponencial simple' : run.method}</dd>
            <dt className="text-ink-muted">Se compara con</dt>
            <dd className="font-semibold text-ink">El último consumo publicado (línea base naive)</dd>
            <dt className="text-ink-muted">Versión del cálculo</dt>
            <dd className="font-semibold text-ink">{run.method_version}</dd>
          </dl>
        )}
        {(run || view.history.length > 0) && (
          <div className="mt-4">
            <CalculationDetails key={`${view.proposal_ref}|${run?.run_ref ?? ''}`} view={view} proposal={proposal} />
          </div>
        )}
        <p className="mt-4">
          <Link className="font-semibold text-link underline underline-offset-2" to={estimationPath(proposal)}>
            Ver la estimación completa
          </Link>
        </p>
      </section>
    </div>
  );
}

/** «INVIERNO» → «Invierno» (la clave de la temporada; su definición completa va en el detalle técnico). */
function seasonName(key: string): string {
  const lower = key.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

type RunDetailLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; run: Run };

/**
 * Detalle técnico plegado: método, parámetros, temporada y período, política,
 * línea base naive y cobertura del tramo por producto, fuentes e historial de
 * vínculos. El detalle de la ejecución se pide sólo al desplegar.
 */
function CalculationDetails({ view, proposal }: { view: EstimationLinkView; proposal: Proposal }) {
  const [detail, setDetail] = useState<RunDetailLoad | null>(null);
  const alive = useRef(true);
  /** El detalle se pide una vez por ejecución mostrada (el componente se monta de nuevo si cambia). */
  const requested = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = view.run;
  const runRef = run?.run_ref ?? null;

  const fetchDetail = async () => {
    if (!runRef) return;
    setDetail({ status: 'loading' });
    try {
      const data = await estimationService.run(runRef);
      if (alive.current && data.run_ref === runRef) setDetail({ status: 'ready', run: data });
    } catch (err) {
      if (alive.current) setDetail({ status: 'error', message: collectiveError(err, 'No fue posible cargar el detalle de la ejecución.') });
    }
  };

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || requested.current) return;
    requested.current = true;
    void fetchDetail();
  };

  return (
    <details className={`${surfaceClass} group overflow-hidden`} data-testid="calculation" onToggle={onToggle}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-base font-semibold text-ink hover:bg-canvas [&::-webkit-details-marker]:hidden">
        Parámetros, fuentes e historial
        <span className="text-sm font-semibold text-link group-open:hidden">Ver</span>
        <span className="hidden text-sm font-semibold text-ink-muted group-open:inline">Ocultar</span>
      </summary>
      <div className="space-y-3 border-t border-line px-5 py-4 text-sm text-ink-muted">
        {run ? (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]" data-testid="calculation-run">
            <dt className="text-ink-muted">Método y versión</dt>
            <dd>
              SES frente a la línea base naive ({run.method}) · versión {run.method_version}
            </dd>
            <dt className="text-ink-muted">Temporada</dt>
            <dd>
              {run.season.key} · {run.season.definition}
            </dd>
            <dt className="text-ink-muted">Campaña objetivo (período)</dt>
            <dd>
              {run.target.name} · {fmtCalendarDate(run.target.start_date) ?? '—'} a {fmtCalendarDate(run.target.end_date) ?? 'sin fecha de cierre'}
            </dd>
            <dt className="text-ink-muted">Política aplicada</dt>
            <dd>
              {run.disclosure.policy} · {run.disclosure.mode} · umbral {run.disclosure.threshold}
            </dd>
            <dt className="text-ink-muted">Ejecución</dt>
            <dd>
              <code title={run.run_ref}>{run.run_ref.slice(0, 8)}</code> del {fmtDateTime(run.generated_at)}
              {run.outcome === 'FAILED' && ' · fallida'}
            </dd>
          </dl>
        ) : (
          <p>No hay una ejecución fijada en este momento.</p>
        )}
        {runRef && <RunDetailBody detail={detail} proposal={proposal} onRetry={() => void fetchDetail()} />}
        <LinkHistory view={view} />
      </div>
    </details>
  );
}

function RunDetailBody({ detail, proposal, onRetry }: { detail: RunDetailLoad | null; proposal: Proposal; onRetry: () => void }) {
  if (!detail || detail.status === 'loading') return <p data-testid="calculation-detail">Cargando el detalle de la ejecución…</p>;
  if (detail.status === 'error') {
    return (
      <p className="text-danger-ink" data-testid="calculation-detail">
        {detail.message}{' '}
        <button type="button" className="font-semibold underline" onClick={onRetry}>
          Reintentar
        </button>
      </p>
    );
  }
  const run = detail.run;
  // Sólo los productos del borrador: misma línea de producto y unidad.
  const results = proposal.lines
    .map((line) => run.results.find((r) => r.product.product_ref === line.product_ref && r.base_unit === line.base_unit))
    .filter((r, index, all): r is ResultDetail => r !== undefined && all.indexOf(r) === index);
  return (
    <div className="space-y-3" data-testid="calculation-detail">
      <div>
        <p className="font-semibold text-ink">Parámetros</p>
        <ul className="mt-0.5 space-y-0.5" data-testid="calculation-parameters">
          {Object.entries(run.parameters).map(([key, value]) => (
            <li key={key}>
              <code>{key}</code>: <code className="[overflow-wrap:anywhere]">{JSON.stringify(value)}</code>
            </li>
          ))}
        </ul>
      </div>
      {results.map((result) => {
        const span = result.points.filter((point) => point.in_span);
        return (
          <div key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`calculation-${result.product.name}`}>
            <p className="font-semibold text-ink">
              {result.product.name} ({result.presentation_unit}) · {RESULT_STATUS_TEXT[result.status]}
            </p>
            <p>
              Línea base naive:{' '}
              <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} /> · α{' '}
              {formatAlpha(result.alpha)}
            </p>
            <p>
              Cobertura del tramo{result.span_length !== null ? ` (${result.span_length} ${result.span_length === 1 ? 'campaña' : 'campañas'})` : ''}:{' '}
              {span.length === 0
                ? 'sin campañas en el tramo'
                : span
                    .map((point) =>
                      point.coverage.status === 'IDENTIFIED'
                        ? `${point.campaign.name}: ${point.coverage.members_in_published_figures} de ${point.coverage.linked_members}`
                        : `${point.campaign.name}: desconocida`,
                    )
                    .join(' · ')}
              . Mide participación, no integridad.
            </p>
            <p>
              Fuentes: ejecución <code title={run.run_ref}>{run.run_ref.slice(0, 8)}</code>
              {result.series ? (
                <>
                  {' '}
                  · serie <code title={result.series.series_ref}>{result.series.series_ref.slice(0, 8)}</code> versión {result.series.version} · huella{' '}
                  <code title={result.series.source_hash}>{result.series.source_hash.slice(0, 12)}</code>
                </>
              ) : (
                ' · sin serie'
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Todos los vínculos del borrador, del más reciente al primero. */
function LinkHistory({ view }: { view: EstimationLinkView }) {
  if (view.history.length === 0) return null;
  const entries = [...view.history].sort((a, b) => b.sequence - a.sequence);
  return (
    <div>
      <p className="font-semibold text-ink">Historial de la referencia</p>
      <ol className="mt-0.5 space-y-0.5" data-testid="link-history">
        {entries.map((entry) => (
          <li key={entry.link_ref}>
            {entry.sequence}. {fmtDateTime(entry.created_at)} · {MODE_TEXT[entry.mode]} ({ACTION_TEXT[entry.action]}) por {entry.created_by.name}
            {entry.run_ref && (
              <>
                {' '}
                · ejecución <code title={entry.run_ref}>{entry.run_ref.slice(0, 8)}</code>
              </>
            )}
            {!entry.run_ref && entry.job_status && ` · trabajo ${JOB_STATUS_TEXT[entry.job_status].toLowerCase()}`}
            {entry.current && <strong> · vigente</strong>}
          </li>
        ))}
      </ol>
    </div>
  );
}
