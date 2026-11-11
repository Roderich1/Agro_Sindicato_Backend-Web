import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import {
  CoverageBanner,
  DisclosureNotice,
  Fingerprint,
  PendingChangesNote,
  ProductCell,
  QuantityCell,
} from '../components/collective-ui';
import { Figure, ValidityBadge } from '../components/estimation-figure';
import { ExportButtons } from '../components/export-buttons';
import { Button, CampaignSelector, Collapsible, DataState, DataTable, Notice, PageHeader, Section } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { reportDisclosureMode } from '../lib/data-mode';
import { compareNeedWithEstimate, comparisonText } from '../lib/estimation-compare';
import { REASON_TEXT, RESULT_STATUS_TEXT } from '../lib/estimation-text';
import { saveBlob } from '../lib/exports';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import type { Proposal, ProposalLine, ProposalSummary } from '../types/collective';
import type { ProposalEstimationReference, ReferenceLine } from '../types/estimation';

const POLICY_PENDING_MESSAGE =
  'La política de divulgación no está aprobada: no se genera ni se guarda ninguna propuesta con cifras.';

/** La referencia del borrador mostrado: se carga aparte y su fallo no oculta el borrador. */
type ReferenceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ProposalEstimationReference };

/** Un problema de la vista: el texto y el estado del §4 con el que se presenta. */
interface Problem {
  kind: 'error' | 'forbidden' | 'restricted';
  message: string;
  /** Falló la carga del historial: se ofrece «Reintentar». */
  retry: boolean;
}

/**
 * F07-JP-01/02 (#26, #27): borrador de propuesta de compra conjunta desde la
 * necesidad declarada que el servidor publicó. Sólo lectura y generación de
 * borradores: no crea compras, lotes, movimientos, deudas ni pagos, y no
 * calcula cantidades en el navegador.
 *
 * F12-EST-08 (#181, prototipo W3): la estimación del consumo como referencia
 * separada, tal como la entrega el servidor para el mismo producto, unidad y
 * campaña. No se suma a la necesidad declarada ni cambia las líneas. Una
 * respuesta que llega después de cambiar de campaña, de identidad o de
 * borrador se descarta.
 *
 * Panel de la defensa (2026-11-05): al elegir una campaña con borradores se
 * carga y muestra el último por el flujo de consulta (nunca se crea uno al
 * entrar, refrescar o cambiar de campaña); si se abre un borrador histórico se
 * respeta esa elección. «Generar borrador» es la única acción primaria; el
 * historial, la huella y la trazabilidad van en detalles plegados.
 *
 * Rediseño (sesión C, 2026-11-10): la columna se rotula «Estimación del consumo
 * (referencia)» como fija F12_EST_01 §7.1 (gana el contrato sobre el texto
 * anterior). Cuando la línea y su referencia son comparables (misma línea,
 * necesidad publicada, estimación vigente y mayor que cero) se escribe la
 * diferencia absoluta en la misma unidad; nunca un porcentaje. La Web no edita
 * cantidades de un borrador ni registra decisiones sobre él (sólo existe
 * `DRAFT`).
 */
export function JointProposalPage() {
  const { user } = useAuth();
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [history, setHistory] = useState<ProposalSummary[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reference, setReference] = useState<ReferenceState | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  /** Historial pedido y aún sin respuesta: sólo entonces se dice «Cargando…». */
  const [loadingHistory, setLoadingHistory] = useState(false);

  // El contexto de lo que se muestra: identidad y campaña. Cada respuesta se aplica sólo si sigue siendo el mismo.
  const context = `${user?.id ?? ''}|${user?.tenantId ?? ''}|${user?.role ?? ''}|${selected ?? ''}`;
  const contextRef = useRef(context);
  const shownRef = useRef<string | null>(null);
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

  const loadReference = useCallback(async (proposalRef: string, at: string) => {
    setReference({ status: 'loading' });
    const current = () => contextRef.current === at && shownRef.current === proposalRef;
    try {
      const data = await collectiveService.proposalEstimationReference(proposalRef);
      if (current() && data.proposal_ref === proposalRef) setReference({ status: 'ready', data });
    } catch (err) {
      if (current()) setReference({ status: 'error', message: collectiveError(err, 'No fue posible cargar la estimación del consumo.') });
    }
  }, []);

  /** Muestra un borrador y pide su referencia, si el contexto sigue siendo el mismo. */
  const show = useCallback(
    (shown: Proposal, at: string) => {
      if (contextRef.current !== at) return;
      shownRef.current = shown.proposal_ref;
      reportDisclosureMode(shown.disclosure.mode);
      setProposal(shown);
      void loadReference(shown.proposal_ref, at);
    },
    [loadReference],
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
      setProposal(null);
      setReference(null);
      setProblem(null);
      return loadHistory(selected, at);
    });
  }, [selected, context, loadHistory]);

  /** Única escritura de la vista: sólo con el botón, nunca al entrar, refrescar ni cambiar de campaña. */
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

  const downloadCsv = async (current: Proposal) => {
    try {
      saveBlob(await collectiveService.proposalCsv(current.proposal_ref), `propuesta-${current.proposal_ref}.csv`);
    } catch (err) {
      fail(err, 'No fue posible descargar el CSV.');
    }
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
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
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
          <ProposalDetail proposal={proposal} reference={reference} onCsv={() => void downloadCsv(proposal)} />
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

function ProposalDetail({ proposal, reference, onCsv }: { proposal: Proposal; reference: ReferenceState | null; onCsv: () => void }) {
  return (
    <section className="space-y-4" aria-label="Detalle del borrador">
      <DisclosureNotice mode={proposal.disclosure.mode} />
      <Section
        title={`Borrador · ${proposal.campaign.name}`}
        note={`Generado el ${fmtDateTime(proposal.generated_at)} por ${proposal.generated_by.name}. No crea compras, lotes, movimientos, deudas ni pagos.`}
        actions={<ExportButtons kind="proposal" reference={proposal.proposal_ref} onCsv={onCsv} csvLabel="Exportar CSV" />}
      >
        {proposal.coverage && (
          <div className="px-5 pt-4">
            <CoverageBanner coverage={proposal.coverage} campaignName={proposal.campaign.name} asOf={proposal.generated_at} />
          </div>
        )}
        {proposal.lines.length > 0 && <LinesSummary lines={proposal.lines} />}
        {proposal.lines.length === 0 ? (
          <DataState state="empty" title="Sin necesidades declaradas publicadas" description="Ausencia de declaración = desconocido, no cero." />
        ) : (
          <div className="mt-3">
            {/* En un teléfono (< sm) cada línea se apila: producto, necesidad, aportantes y referencia, sin desplazamiento lateral. */}
            <DataTable caption="Líneas del borrador">
              <thead>
                <tr className="max-sm:hidden">
                  <th>Producto</th>
                  <th>Necesidad declarada</th>
                  <th className="ui-num">Aportantes</th>
                  <th className="border-l border-slate-200" data-testid="reference-header">
                    Estimación del consumo (referencia)
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.lines.map((line) => (
                  <tr key={line.position} className="max-sm:block max-sm:border-b max-sm:border-slate-200 max-sm:py-2" data-testid={`line-${line.product_name}-${line.base_unit}`}>
                    <td className="max-sm:block max-sm:border-0 max-sm:py-1.5 [overflow-wrap:anywhere] sm:min-w-48">
                      <ProductCell name={line.product_name} unit={line.presentation_unit} status={line.status} />
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
                    </td>
                    <td className="ui-num text-base max-sm:block max-sm:border-0 max-sm:py-1.5 max-sm:text-left max-sm:text-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Aportantes: </span>
                      {line.status === 'DISCLOSED' ? line.contributors : <span className="text-xs text-slate-500">no revelados</span>}
                    </td>
                    <td className="border-l border-slate-200 bg-slate-50/60 text-xs text-slate-600 sm:min-w-60 max-sm:mt-1 max-sm:block max-sm:rounded-md max-sm:border-l-0 max-sm:px-3 max-sm:py-2">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Estimación del consumo (referencia)</span>
                      <div data-testid="reference">
                        <ReferenceCell line={line} state={reference} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
        <ReferenceNote proposal={proposal} state={reference} />
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

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad. */
function referenceOf(state: ReferenceState | null, line: ProposalLine): ReferenceLine | null {
  if (state?.status !== 'ready') return null;
  const found = state.data.lines.find((r) => r.position === line.position);
  return found && found.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

function ReferenceCell({ line, state }: { line: ProposalLine; state: ReferenceState | null }) {
  if (!state || state.status === 'loading') return <span className="text-slate-500">Cargando…</span>;
  if (state.status === 'error') return <span className="text-slate-500">No disponible</span>;
  const ref = referenceOf(state, line);
  if (!ref) return <span className="text-slate-500">—</span>;
  if (ref.absence === 'POLICY_PENDING') return <span className="text-slate-600">Sin cifra: la política de divulgación no está aprobada</span>;
  if (ref.absence === 'NO_RESULT' || !ref.estimation) {
    return (
      <span className="text-slate-600">
        Sin estimación
        <span className="block text-[11px] text-slate-500">Ninguna ejecución incluye este producto para esta campaña</span>
      </span>
    );
  }
  const e = ref.estimation;
  const comparison = compareNeedWithEstimate(line, ref);
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
        {e.status === 'ESTIMATED' ? (
          <Figure value={e.estimate_base} unit={ref.base_unit} kind="estimate" status={e.status} validityReason={e.validity_reason} />
        ) : (
          <span className="text-slate-700">
            {RESULT_STATUS_TEXT[e.status]}
            {e.reason_code && <span className="block text-[11px] text-slate-600">{REASON_TEXT[e.reason_code]}</span>}
          </span>
        )}
        <ValidityBadge validity={e.validity} reason={e.validity_reason} />
      </div>
      <p className="text-[11px] text-slate-600" data-testid="reference-run">
        Ejecución del {fmtDateTime(e.generated_at)} · {e.run_relation === 'BEFORE_PROPOSAL' ? 'anterior al borrador' : 'posterior al borrador'}
      </p>
      {comparison && (
        <p className="text-[11px] font-medium text-slate-800" data-testid="reference-difference">
          {comparisonText(comparison)} Sólo informativo: no cambia el borrador.
        </p>
      )}
      <details className="text-[11px]">
        <summary className="cursor-pointer font-semibold text-emerald-700">Ver detalle</summary>
        <dl className="mt-1 space-y-0.5 text-slate-600" data-testid="reference-detail">
          <div>
            <dt className="inline text-slate-500">Método: </dt>
            <dd className="inline">SES frente a la línea base naive ({e.method})</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Ejecución: </dt>
            <dd className="inline">
              <code title={e.run_ref}>{e.run_ref.slice(0, 8)}</code>
            </dd>
          </div>
          {e.span_length !== null && (
            <div>
              <dt className="inline text-slate-500">Tramo: </dt>
              <dd className="inline">
                {e.span_length} {e.span_length === 1 ? 'campaña comparable' : 'campañas comparables'}
              </dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}

function ReferenceNote({ proposal, state }: { proposal: Proposal; state: ReferenceState | null }) {
  return (
    <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-600" data-testid="reference-note">
      <p>
        «Estimación del consumo (referencia)»: la calcula el servidor para el mismo producto, unidad y campaña; no se
        suma a la necesidad declarada, no es la cantidad solicitada y no cambia las líneas ni la huella del borrador. La
        diferencia con la necesidad sólo se escribe si la estimación está vigente y es mayor que cero, y nunca como
        porcentaje.{' '}
        <Link className="font-semibold text-emerald-700 underline" to={`${COLLECTIVE_PATHS.history}?vista=estimacion&campaign=${encodeURIComponent(proposal.campaign.campaign_ref)}`}>
          Detalle en «Estimación del consumo»
        </Link>
        .
      </p>
      {state?.status === 'ready' && (
        <p className="mt-1" data-testid="reference-evaluated">
          Vigencia evaluada el {fmtDateTime(state.data.evaluated_at)}
          {state.data.season ? ` · Temporada ${state.data.season.key}` : ''} · «Exportar CSV» incluye esta referencia en
          columnas aparte (estimation_*), evaluada al exportar.
        </p>
      )}
      {state?.status === 'error' && (
        <p className="mt-1 text-red-700" role="alert">
          {state.message} El borrador no cambia.
        </p>
      )}
    </div>
  );
}

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
        <DataTable caption="Borradores de la campaña" minWidth={640}>
          <thead>
            <tr>
              <th>Generado el</th>
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
                <tr key={entry.proposal_ref} className={shown ? 'bg-emerald-50/60' : ''}>
                  <td className="whitespace-nowrap font-medium text-slate-800">{fmtDateTime(entry.generated_at)}</td>
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
        </DataTable>
      )}
    </Collapsible>
  );
}
