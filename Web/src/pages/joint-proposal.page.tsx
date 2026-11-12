import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import {
  CoverageBanner,
  DisclosureNotice,
  Fingerprint,
  PendingChangesNote,
  ProductCell,
  QuantityCell,
} from '../components/collective-ui';
import { Figure } from '../components/estimation-figure';
import { ExportButtons } from '../components/export-buttons';
import { Button, CampaignSelector, Collapsible, DataState, DataTable, Notice, PageHeader, Section, surfaceClass } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { formatBaseValue, formatDecimalQuantity, formatRoundedEstimate } from '../lib/quantity';
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
import { fmtCalendarDate, fmtPercent } from '../lib/format';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import type { Proposal, ProposalLine, ProposalSummary } from '../types/collective';
import type { FailureCode, ResultDetail, Run, StopCode } from '../types/estimation';
import type { EstimationLinkLine, EstimationLinkView, LinkDifference } from '../types/estimation-link';

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
 * respeta esa elección. El historial, la huella y la trazabilidad van en
 * detalles plegados.
 */
export function JointProposalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaigns, selected, select, error: campaignsError, refresh: refreshCampaigns } = useSelectedCampaign();
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
        if (shownRef.current === null && list[0]) await open(list[0].proposal_ref, at);
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

  const prepareCall = () => {
    if (!proposal || selection?.status !== 'ready' || selection.saved.length === 0) return;
    navigate(prepareCallPath(proposal.campaign.campaign_ref, proposal.proposal_ref, selection.saved));
  };

  const retry = selected ? () => void loadHistory(selected, context) : undefined;
  return (
    <AppShell title="Necesidades y propuestas" section="Colectivo">
      <div className="space-y-4">
        <PageHeader
          title="Necesidades y propuestas"
          subtitle={
            <>
              Borrador basado en las <strong>necesidades declaradas</strong> publicadas. Requiere revisión: no resta stock,
              no es una necesidad neta y <strong>no ejecuta ninguna compra</strong>.
            </>
          }
          campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />}
          actions={
            <Button onClick={() => void generate()} disabled={!selected || busy}>
              {busy ? 'Trabajando…' : 'Generar borrador'}
            </Button>
          }
        />
        {campaignsError && (
          <DataState state="error" description={campaignsError} onRetry={() => void refreshCampaigns()} testId="campaigns-list-error" />
        )}
        {problem && (
          <Section>
            <DataState
              compact
              state={problem.kind}
              title={problem.kind === 'error' ? 'No fue posible completar la consulta' : undefined}
              description={problem.message}
              onRetry={problem.retry ? retry : undefined}
              testId="proposal-problem"
            />
          </Section>
        )}
        {proposal ? (
          <ProposalDetail
            proposal={proposal}
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
        ) : loadingHistory ? (
          <Section>
            <DataState state="loading" compact title="Cargando…" />
          </Section>
        ) : (
          selected &&
          !busy &&
          !problem &&
          history.length === 0 && (
            <Section>
              <DataState
                state="empty"
                title="Todavía no hay borradores para esta campaña"
                description="Genere el primero con «Generar borrador». Sin borrador no hay cifras que revisar: eso no significa cero."
              />
            </Section>
          )
        )}
        <HistorySection history={history} current={proposal} onOpen={(id) => void open(id, context)} busy={busy} />
      </div>
    </AppShell>
  );
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
    <section className="space-y-4" aria-label="Detalle del borrador">
      <DisclosureNotice mode={proposal.disclosure.mode} />
      <Section
        title={`Borrador · ${proposal.campaign.name}`}
        note={`Generado el ${fmtDateTime(proposal.generated_at)} por ${proposal.generated_by.name}. No crea compras, lotes, movimientos, deudas ni pagos.`}
        actions={<ExportButtons kind="proposal" reference={proposal.proposal_ref} />}
      >
        {proposal.coverage && (
          <div className="px-5 pt-4">
            <CoverageBanner coverage={proposal.coverage} campaignName={proposal.campaign.name} asOf={proposal.generated_at} />
          </div>
        )}
        {proposal.lines.length > 0 && <LinesSummary lines={proposal.lines} />}
        {proposal.lines.length > 0 && (
          <LinkBanner link={link} feedback={props.linkFeedback} acting={props.acting} onAct={props.onAct} onRetry={props.onRetryLink} />
        )}
        {messages.shared && (
          <p className="px-5 pt-2 text-xs text-slate-700" data-testid="comparison-note">
            {messages.shared}
          </p>
        )}
        {proposal.lines.length === 0 ? (
          <DataState state="empty" title="Sin necesidades declaradas publicadas" description="Ausencia de declaración = desconocido, no cero." />
        ) : (
          <div className="mt-3">
            {/* En un teléfono (< sm) cada línea se apila: producto, necesidad y consumo estimado, sin desplazamiento lateral. */}
            <DataTable caption="Líneas del borrador">
              <thead>
                <tr className="max-sm:hidden">
                  <th>Producto</th>
                  <th>Necesidad declarada</th>
                  <th className="border-l border-slate-200" data-testid="reference-header">
                    Consumo estimado
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.lines.map((line) => (
                  <tr key={line.position} className="max-sm:block max-sm:border-b max-sm:border-slate-200 max-sm:py-2" data-testid={`line-${line.product_name}-${line.base_unit}`}>
                    <td className="max-sm:block max-sm:border-0 max-sm:py-1.5 [overflow-wrap:anywhere] sm:min-w-48">
                      <ProductCell name={line.product_name} unit={line.presentation_unit} status={line.status} />
                      <label className="mt-2 flex min-h-8 cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-700"
                          checked={chosen?.has(line.product_ref) ?? false}
                          disabled={!chosen || saving}
                          onChange={() => onToggle(line.product_ref)}
                          aria-label={`Llevar a convocatoria: ${line.product_name} (${line.presentation_unit})`}
                          data-testid="select-product"
                        />
                        Llevar a convocatoria
                      </label>
                    </td>
                    <td className="max-sm:block max-sm:border-0 max-sm:py-1.5 sm:min-w-44" data-testid="need">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Necesidad declarada</span>
                      <QuantityCell
                        status={line.status}
                        base={line.quantity_base}
                        serverPresentation={line.quantity_presentation}
                        unit={line.base_unit}
                        asOf={line.data_as_of}
                        size="lg"
                      />
                      {line.status === 'DISCLOSED' && line.pending_changes && <PendingChangesNote />}
                      <span className="mt-1 block text-[11px] text-slate-600" data-testid="contributors">
                        {line.status === 'DISCLOSED' && line.contributors !== null
                          ? `${line.contributors} ${line.contributors === 1 ? 'aportante' : 'aportantes'}`
                          : 'Aportantes no revelados'}
                      </span>
                    </td>
                    <td className="border-l border-slate-200 bg-slate-50/60 text-xs text-slate-600 sm:min-w-60 max-sm:mt-1 max-sm:block max-sm:rounded-md max-sm:border-l-0 max-sm:px-3 max-sm:py-2">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Consumo estimado</span>
                      <div data-testid="reference">
                        <EstimateCell line={line} link={link} message={messages.perLine.get(line.position) ?? null} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
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
        {view && (view.run || view.history.length > 0) && <CalculationDetails key={`${view.proposal_ref}|${view.run?.run_ref ?? ''}`} view={view} proposal={proposal} />}
        <ReferenceNote proposal={proposal} view={view} />
      </Section>
    </section>
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
    <p className="px-5 pt-3 text-sm text-slate-700" data-testid="lines-summary">
      <span className="font-semibold tabular-nums">
        {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
      </span>{' '}
      en el borrador: <span className="tabular-nums">{shown}</span> con cifra publicada
      {hidden > 0 && (
        <>
          {' '}
          y <span className="tabular-nums">{hidden}</span> sin cifra (el motivo está en su fila)
        </>
      )}
      . Cada cifra es la aceptada por el servidor hasta la fecha que indica su fila.
    </p>
  );
}

/** Franja sobre la tabla: el estado de la referencia fijada y una sola acción. */
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
  const box = 'mx-5 mt-3 rounded-card border border-slate-200 bg-slate-50 px-4 py-3';
  if (!link || link.status === 'loading') {
    return (
      <div className={box} data-testid="link-banner">
        <p className="text-sm text-slate-600" data-testid="link-state">
          Cargando la referencia de consumo estimado…
        </p>
      </div>
    );
  }
  if (link.status === 'error') {
    return (
      <div className={box} data-testid="link-banner">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-red-700" role="alert" data-testid="link-state">
            {link.message} El borrador no cambia.
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
      title = 'Referencia fijada';
      detail = run
        ? `Ejecución del ${fmtDateTime(run.generated_at)} · ${run.method} ${run.method_version} · temporada ${run.season.key} · campaña ${run.target.name}. Sólo cambia si usted la actualiza.`
        : 'Sólo cambia si usted la actualiza.';
      break;
    case 'UNAVAILABLE':
      title = 'El cálculo de la referencia no se completó';
      detail = unavailableText(view);
      break;
    case 'RESTRICTED':
      title = 'Referencia restringida';
      detail =
        'La política de divulgación no está aprobada: se conserva el vínculo (ejecución, fecha y método) pero no se muestra ninguna cifra.';
      break;
  }
  return (
    <div className={box} data-testid="link-banner" data-state={view.state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900" data-testid="link-state">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-slate-700" data-testid="link-detail">
            {detail}
            {view.update.available && view.update.reason && ` ${UPDATE_REASON_TEXT[view.update.reason]}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primary === 'CALCULATING' && (
            <Button variant="secondary" size="sm" disabled>
              Calculando…
            </Button>
          )}
          {primary === 'INITIAL' && (
            <Button variant="secondary" size="sm" disabled={busy} aria-busy={acting === 'INITIAL'} onClick={() => onAct('INITIAL')}>
              Obtener referencia
            </Button>
          )}
          {primary === 'UPDATE' && (
            <Button variant="secondary" size="sm" disabled={busy} aria-busy={acting === 'UPDATE'} onClick={() => onAct('UPDATE')}>
              Actualizar referencia
            </Button>
          )}
          {view.link && (
            <button
              type="button"
              className="min-h-8 px-1 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:text-slate-400"
              disabled={busy}
              aria-busy={acting === 'CLEAR'}
              onClick={() => onAct('CLEAR')}
            >
              Quitar referencia
            </button>
          )}
        </div>
      </div>
      {feedback && (
        <div className="mt-2" role="status" data-testid="link-feedback">
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

/** El consumo estimado de una línea según su estado; la diferencia sólo si el servidor la declara comparable. */
/**
 * E3 §5: la diferencia porcentual que calculó el servidor (4 decimales), redondeada sólo para presentarla con el
 * formateador compartido del rediseño (sin decimales). No definida si la estimación es cero.
 */
function percentText(difference: LinkDifference): string {
  if (difference.percent_undefined === 'ESTIMATE_ZERO' || difference.difference_percent === null) {
    return 'Porcentaje no definido: la estimación es cero.';
  }
  const value = Number(difference.difference_percent);
  const shown = fmtPercent(Math.abs(value), 100);
  if (shown === null) return '';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `Diferencia: ${sign}${shown} respecto de la estimación.`;
}

function EstimateCell({ line, link, message }: { line: ProposalLine; link: LinkLoad | null; message: string | null }) {
  if (!link || link.status === 'loading') return <span className="text-slate-500">Cargando…</span>;
  if (link.status === 'error') return <span className="text-slate-500">No disponible</span>;
  const ref = linkLineOf(link, line);
  if (!ref) return <span className="text-slate-500">—</span>;
  const e = ref.estimation;
  const short = (label: string, why?: string | null) => (
    <span className="text-slate-700" data-testid="estimate-state">
      {label}
      {why && <span className="block text-[11px] text-slate-600">{why}</span>}
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
        e.validity_reason === 'SOURCES_WITHDRAWN'
          ? VALIDITY_REASON_TEXT.SOURCES_WITHDRAWN
          : 'La política de divulgación no está aprobada: no se muestra la cifra.',
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
        <p className="text-[11px] font-semibold text-slate-700" data-testid="reference-hidden-need">
          La necesidad de esta fila no está divulgada. Lo que sigue es la estimación del consumo: no la sustituye ni se
          suma a la propuesta.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="font-semibold tabular-nums text-slate-900"
          title={`Cifra exacta: ${formatDecimalQuantity(e.estimate_base, ref.base_unit) ?? ''} (${formatBaseValue(e.estimate_base, ref.base_unit) ?? ''})`}
          data-testid="estimate-figure"
        >
          {formatRoundedEstimate(e.estimate_base, ref.base_unit) ?? 'Cifra no válida'}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
            e.state === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-800 ring-amber-600/20'
          }`}
          data-testid="estimate-state"
        >
          {e.state === 'AVAILABLE' ? 'Vigente' : 'Desactualizada'}
        </span>
      </div>
      {ref.scope.estimate && (
        <p className="text-[11px] text-slate-600" data-testid="estimate-scope">
          {estimateScopeText(ref.scope.estimate)}
        </p>
      )}
      {e.state === 'OUTDATED' && e.validity_reason && (
        <p className="text-[11px] text-slate-600">{VALIDITY_REASON_TEXT[e.validity_reason]} No se compara con la necesidad.</p>
      )}
      {comparison.comparable && comparison.difference && (
        <p className="text-[11px] font-medium text-slate-800" data-testid="reference-difference">
          {comparison.difference.observation} {percentText(comparison.difference)} Sólo informativo: no cambia el borrador.
        </p>
      )}
      {!comparison.comparable && message && (
        <p className="text-[11px] text-slate-600" data-testid="comparison-message">
          {message}
        </p>
      )}
    </div>
  );
}

/** «Llevar a convocatoria»: guardar la selección y preparar la convocatoria con los productos guardados. */
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
  const box = 'border-t border-slate-100 px-5 py-3';
  if (!selection || selection.status === 'loading') {
    return (
      <div className={box} data-testid="selection-bar">
        <p className="text-xs text-slate-600">Cargando la selección de productos…</p>
      </div>
    );
  }
  if (selection.status === 'error') {
    return (
      <div className={`${box} flex flex-wrap items-center justify-between gap-3`} data-testid="selection-bar">
        <p className="text-xs text-red-700" role="alert">
          {selection.message}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    );
  }
  const dirty = !sameSelection(selection.chosen, selection.saved);
  const count = selection.saved.length;
  return (
    <div className={box} data-testid="selection-bar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-slate-700" data-testid="selection-summary">
          {selection.chosen.length} {selection.chosen.length === 1 ? 'producto marcado' : 'productos marcados'} para llevar a una
          convocatoria{dirty ? ' (cambios sin guardar)' : ''}. Elegir no inscribe a nadie, no crea participaciones ni asigna
          cantidades; la estimación no cambia esta selección.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={onSave}>
            {saving ? 'Guardando…' : 'Guardar selección'}
          </Button>
          <Button variant="secondary" size="sm" disabled={dirty || count === 0 || saving} onClick={onPrepareCall}>
            Preparar convocatoria ({count} {count === 1 ? 'producto' : 'productos'})
          </Button>
        </div>
      </div>
      {dirty && <p className="mt-1 text-[11px] text-slate-600">Guarde la selección para preparar la convocatoria con ella.</p>}
      {feedback && (
        <div className="mt-2" role="status" data-testid="selection-feedback">
          <Notice kind={feedback.kind} compact>
            {feedback.message}
          </Notice>
        </div>
      )}
    </div>
  );
}

type RunDetailLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; run: Run };

/**
 * «Ver cálculo» (plegado): método, parámetros, temporada y período, política,
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
    <details className={`${surfaceClass} group mx-5 mb-3 overflow-hidden`} data-testid="calculation" onToggle={onToggle}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        Ver cálculo
        <span className="text-xs font-medium text-slate-600 group-open:hidden">Mostrar</span>
        <span className="hidden text-xs font-medium text-slate-600 group-open:inline">Ocultar</span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-700">
        {run ? (
          <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]" data-testid="calculation-run">
            <dt className="text-slate-500">Método y versión</dt>
            <dd>
              SES frente a la línea base naive ({run.method}) · versión {run.method_version}
            </dd>
            <dt className="text-slate-500">Temporada</dt>
            <dd>
              {run.season.key} · {run.season.definition}
            </dd>
            <dt className="text-slate-500">Campaña objetivo (período)</dt>
            <dd>
              {run.target.name} · {fmtCalendarDate(run.target.start_date) ?? '—'} a {fmtCalendarDate(run.target.end_date) ?? 'sin fecha de cierre'}
            </dd>
            <dt className="text-slate-500">Política aplicada</dt>
            <dd>
              {run.disclosure.policy} · {run.disclosure.mode} · umbral {run.disclosure.threshold}
            </dd>
            <dt className="text-slate-500">Ejecución</dt>
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
      <p className="text-red-700" data-testid="calculation-detail">
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
        <p className="font-semibold text-slate-800">Parámetros</p>
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
            <p className="font-semibold text-slate-800">
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
      <p className="font-semibold text-slate-800">Historial de la referencia</p>
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

function ReferenceNote({ proposal, view }: { proposal: Proposal; view: EstimationLinkView | null }) {
  return (
    <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-600" data-testid="reference-note">
      <p>
        «Consumo estimado»: la referencia fijada en este borrador; no se suma a la necesidad declarada, no es la cantidad
        solicitada ni la confirmada en una convocatoria y no cambia las líneas ni la huella del borrador. Sólo se actualiza
        a pedido. La diferencia con la necesidad la decide el servidor y sólo se escribe si ambas cifras son comparables.{' '}
        <Link className="font-semibold text-emerald-700 underline" to={`${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(proposal.campaign.campaign_ref)}`}>
          Detalle en «Estimación del consumo»
        </Link>
        .
      </p>
      {view && (
        <p className="mt-1" data-testid="reference-evaluated">
          Vigencia evaluada el {fmtDateTime(view.evaluated_at)}
          {view.run ? ` · Temporada ${view.run.season.key}` : ''} · «Descargar Excel» consulta de nuevo el borrador y esta
          referencia fijada al exportar, con su versión, fecha y estado; no usa otra estimación en su lugar.
        </p>
      )}
    </div>
  );
}

/**
 * Sombra en el borde por el que una tabla sigue (sin JavaScript): los degradados blancos se desplazan con el
 * contenido (`local`) y tapan la sombra fija (`scroll`) sólo cuando se llega a ese borde. Sin desplazamiento no se ve.
 */
const SCROLL_HINT = '[&_.ui-table-scroll]:[background:linear-gradient(to_right,#fff_30%,rgb(255_255_255/0))_left_center/40px_100%_no-repeat_local,linear-gradient(to_left,#fff_30%,rgb(255_255_255/0))_right_center/40px_100%_no-repeat_local,radial-gradient(farthest-side_at_0_50%,rgb(15_23_42/0.2),transparent)_left_center/12px_100%_no-repeat_scroll,radial-gradient(farthest-side_at_100%_50%,rgb(15_23_42/0.2),transparent)_right_center/12px_100%_no-repeat_scroll]';

function linesText(count: number): string {
  if (count === 0) return 'sin líneas';
  return `${new Intl.NumberFormat('es-BO').format(count)} ${count === 1 ? 'línea' : 'líneas'}`;
}

/** Historial, huella y trazabilidad del borrador mostrado y de los anteriores, plegados. */
function HistorySection({
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
    <Collapsible title={`Historial y trazabilidad (${history.length} ${history.length === 1 ? 'borrador' : 'borradores'})`} label="Historial de borradores">
      {current && (
        <p className="px-5 py-3 text-xs text-slate-600">
          Borrador mostrado: huella <Fingerprint value={current.inputs_fingerprint} />. Misma huella = mismas entradas
          autorizadas y mismas líneas. Cada borrador queda guardado tal como se generó; ninguno se modifica.
        </p>
      )}
      {history.length === 0 ? (
        <DataState state="empty" compact title="Todavía no hay borradores para esta campaña" description="" />
      ) : (
        <div className={SCROLL_HINT}><DataTable caption="Borradores de la campaña" minWidth={640}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] shadow-[inset_-1px_0_0_#e2e8f0]">Generado el</th>
              <th>Por</th>
              <th>Huella</th>
              <th className="ui-num">Líneas</th>
              <th className="ui-num">
                <span className="sr-only">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => {
              const shown = entry.proposal_ref === current?.proposal_ref;
              return (
                <tr key={entry.proposal_ref} className={shown ? 'bg-emerald-50' : ''}>
                  <td className={`sticky left-0 z-[1] whitespace-nowrap font-medium text-slate-800 shadow-[inset_-1px_0_0_#e2e8f0] ${shown ? 'bg-emerald-50' : 'bg-white'}`}>{fmtDateTime(entry.generated_at)}</td>
                  <td className="min-w-40 text-slate-700">{entry.generated_by.name}</td>
                  <td className="text-xs text-slate-600">
                    <Fingerprint value={entry.inputs_fingerprint} />
                  </td>
                  <td className="ui-num text-xs text-slate-600">{linesText(entry.line_count)}</td>
                  <td className="ui-num">
                    <button
                      type="button"
                      className="text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline disabled:text-slate-400"
                      onClick={() => onOpen(entry.proposal_ref)}
                      disabled={busy || shown}
                      title={shown ? 'Es el borrador mostrado' : undefined}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable></div>
      )}
    </Collapsible>
  );
}
