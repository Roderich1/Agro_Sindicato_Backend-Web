import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, buttonClass, EmptyState, Notice, secondaryButtonClass } from '../components/app-shell';
import {
  CampaignPicker,
  CoverageBanner,
  DisclosureNotice,
  Fingerprint,
  PendingChangesNote,
  QuantityCell,
  StatusBadge,
} from '../components/collective-ui';
import { Figure, ValidityBadge } from '../components/estimation-figure';
import { useAuth } from '../hooks/use-auth';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { REASON_TEXT, RESULT_STATUS_TEXT } from '../lib/estimation-text';
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

/**
 * F07-JP-01/02 (#26, #27): borrador de propuesta de compra conjunta desde la
 * necesidad declarada que el servidor publicó. Sólo lectura y generación de
 * borradores: no crea compras, lotes, movimientos, deudas ni pagos, y no
 * calcula cantidades en el navegador.
 *
 * F12-EST-08 (#181, prototipo W3): la estimación del consumo como columna de
 * referencia separada, tal como la entrega el servidor para el mismo producto,
 * unidad y campaña. No se suma a la necesidad declarada ni cambia las líneas.
 * Una respuesta que llega después de cambiar de campaña, de identidad o de
 * borrador se descarta.
 */
export function JointProposalPage() {
  const { user } = useAuth();
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [history, setHistory] = useState<ProposalSummary[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [reference, setReference] = useState<ReferenceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const fail = (err: unknown, fallback: string) => {
    const message = collectiveError(err, fallback);
    setError(message === 'POLICY_PENDING' ? POLICY_PENDING_MESSAGE : message);
  };

  const loadHistory = useCallback(async (campaignId: string, at: string) => {
    try {
      const list = await collectiveService.proposals(campaignId);
      if (contextRef.current === at) setHistory(list);
    } catch (err) {
      if (contextRef.current !== at) return;
      setHistory([]);
      fail(err, 'No fue posible cargar el historial de propuestas.');
    }
  }, []);

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
      setProposal(shown);
      void loadReference(shown.proposal_ref, at);
    },
    [loadReference],
  );

  useEffect(() => {
    if (!selected) return;
    const at = context;
    void Promise.resolve().then(() => {
      shownRef.current = null;
      setProposal(null);
      setReference(null);
      setError(null);
      return loadHistory(selected, at);
    });
  }, [selected, context, loadHistory]);

  const generate = async () => {
    if (!selected) return;
    const at = context;
    setBusy(true);
    setError(null);
    try {
      const created = await collectiveService.generateProposal(selected);
      show(created, at);
      await loadHistory(selected, at);
    } catch (err) {
      if (contextRef.current === at) fail(err, 'No fue posible generar el borrador.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    const at = context;
    setBusy(true);
    setError(null);
    try {
      show(await collectiveService.proposal(id), at);
    } catch (err) {
      if (contextRef.current === at) fail(err, 'No fue posible abrir el borrador.');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async (current: Proposal) => {
    try {
      const blob = await collectiveService.proposalCsv(current.proposal_ref);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `propuesta-${current.proposal_ref}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revocar después: algunos navegadores leen el blob tras el clic.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      fail(err, 'No fue posible descargar el CSV.');
    }
  };

  return (
    <AppShell title="Necesidades y propuesta conjunta" section="Directiva">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <CampaignPicker campaigns={campaigns} selected={selected} onSelect={select} />
          <button type="button" className={buttonClass} onClick={() => void generate()} disabled={!selected || busy}>
            Generar propuesta (borrador)
          </button>
        </div>
        <Notice kind="info">
          Borrador para revisión humana. Usa la <strong>necesidad declarada</strong> por los agricultores: no resta stock
          y no es una necesidad neta. No crea compras, lotes, movimientos, deudas ni pagos.
        </Notice>
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {proposal && <ProposalDetail proposal={proposal} reference={reference} onCsv={() => void downloadCsv(proposal)} />}
        <HistoryTable history={history} current={proposal?.proposal_ref ?? null} onOpen={(id) => void open(id)} />
      </div>
    </AppShell>
  );
}

function ProposalDetail({ proposal, reference, onCsv }: { proposal: Proposal; reference: ReferenceState | null; onCsv: () => void }) {
  return (
    <section className="space-y-4" aria-label="Detalle del borrador">
      <DisclosureNotice mode={proposal.disclosure.mode} />
      {proposal.coverage && <CoverageBanner coverage={proposal.coverage} campaignName={proposal.campaign.name} asOf={proposal.generated_at} />}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Borrador · {proposal.campaign.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Generado {fmtDateTime(proposal.generated_at)} por {proposal.generated_by.name} · huella{' '}
              <Fingerprint value={proposal.inputs_fingerprint} />
            </p>
            <p className="mt-1 text-xs text-slate-500">{proposal.notice}</p>
          </div>
          <button type="button" className={secondaryButtonClass} onClick={onCsv}>
            Exportar CSV
          </button>
        </div>
        {proposal.lines.length === 0 ? (
          <EmptyState title="Sin necesidades declaradas publicadas" description="Ausencia de declaración = desconocido, no cero." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Producto (canónico)</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Necesidad declarada</th>
                  <th className="px-5 py-3">Aportantes</th>
                  <th className="px-5 py-3">Datos aceptados hasta</th>
                  <th className="border-l border-slate-200 bg-sky-50/60 px-5 py-3" data-testid="reference-header">
                    Estimación del consumo (referencia)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proposal.lines.map((line) => (
                  <tr key={line.position} data-testid={`line-${line.product_name}-${line.base_unit}`}>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {line.product_name}
                      <span className="ml-1 text-xs text-slate-400">({line.presentation_unit})</span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={line.status} />
                    </td>
                    <td className="px-5 py-3" data-testid="need">
                      <QuantityCell
                        status={line.status}
                        base={line.quantity_base}
                        serverPresentation={line.quantity_presentation}
                        unit={line.base_unit}
                      />
                      {line.status === 'DISCLOSED' && line.pending_changes && <PendingChangesNote />}
                    </td>
                    <td className="px-5 py-3 tabular-nums">{line.status === 'DISCLOSED' ? line.contributors : '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{line.status === 'DISCLOSED' ? fmtDateTime(line.data_as_of) : '—'}</td>
                    <td className="border-l border-slate-200 bg-sky-50/30 px-5 py-3 text-xs" data-testid="reference">
                      <ReferenceCell line={line} state={reference} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ReferenceNote proposal={proposal} state={reference} />
      </div>
    </section>
  );
}

/** La línea de la referencia que acompaña a esta línea del borrador: misma posición, producto y unidad. */
function referenceOf(state: ReferenceState | null, line: ProposalLine): ReferenceLine | null {
  if (state?.status !== 'ready') return null;
  const found = state.data.lines.find((r) => r.position === line.position);
  return found && found.product_ref === line.product_ref && found.base_unit === line.base_unit ? found : null;
}

function ReferenceCell({ line, state }: { line: ProposalLine; state: ReferenceState | null }) {
  if (!state || state.status === 'loading') return <span className="text-slate-400">Cargando…</span>;
  if (state.status === 'error') return <span className="text-slate-400">No disponible</span>;
  const ref = referenceOf(state, line);
  if (!ref) return <span className="text-slate-400">—</span>;
  if (ref.absence === 'POLICY_PENDING') return <span className="text-slate-500">Sin cifra: la política de divulgación no está aprobada</span>;
  if (ref.absence === 'NO_RESULT' || !ref.estimation) {
    return (
      <span className="text-slate-500">
        Sin estimación
        <span className="block text-[11px] text-slate-400">Ninguna ejecución incluye este producto para esta campaña</span>
      </span>
    );
  }
  const e = ref.estimation;
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
      {e.status === 'ESTIMATED' ? (
        <Figure value={e.estimate_base} unit={ref.base_unit} kind="estimate" status={e.status} validityReason={e.validity_reason} />
      ) : (
        <span className="text-slate-600">
          {RESULT_STATUS_TEXT[e.status]}
          {e.reason_code && <span className="block text-[11px] text-slate-500">{REASON_TEXT[e.reason_code]}</span>}
        </span>
      )}
      <ValidityBadge validity={e.validity} reason={e.validity_reason} />
      <p className="text-[11px] text-slate-500" data-testid="reference-run">
        Ejecución del {fmtDateTime(e.generated_at)} · {e.run_relation === 'BEFORE_PROPOSAL' ? 'anterior al borrador' : 'posterior al borrador'}
      </p>
    </div>
  );
}

function ReferenceNote({ proposal, state }: { proposal: Proposal; state: ReferenceState | null }) {
  return (
    <div className="border-t border-slate-100 px-5 py-4" data-testid="reference-note">
      <Notice kind="info">
        La columna «Estimación del consumo» es una referencia del servicio para el mismo producto, unidad y campaña: no se
        suma a la necesidad declarada, no es la cantidad solicitada y no cambia las líneas, los totales ni la huella del
        borrador. Cada cifra indica su ejecución y si es anterior o posterior a este borrador.{' '}
        <Link className="font-semibold underline" to={`${COLLECTIVE_PATHS.estimation}?campaign=${encodeURIComponent(proposal.campaign.campaign_ref)}`}>
          Detalle en «Estimación del consumo»
        </Link>
        .
      </Notice>
      {state?.status === 'ready' && (
        <p className="mt-2 text-xs text-slate-500" data-testid="reference-evaluated">
          Vigencia evaluada el {fmtDateTime(state.data.evaluated_at)}
          {state.data.season ? ` · Temporada ${state.data.season.key}` : ''} · «Exportar CSV» incluye esta referencia en
          columnas aparte (estimation_*), evaluada al exportar.
        </p>
      )}
      {state?.status === 'error' && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {state.message} El borrador no cambia.
        </p>
      )}
    </div>
  );
}

function HistoryTable({
  history,
  current,
  onOpen,
}: {
  history: ProposalSummary[];
  current: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="glass-card overflow-hidden" aria-label="Historial de borradores">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Historial de borradores</h2>
        <p className="mt-0.5 text-xs text-slate-500">Misma huella = mismas entradas autorizadas y mismas líneas.</p>
      </div>
      {history.length === 0 ? (
        <EmptyState title="Todavía no hay borradores para esta campaña" />
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {history.map((entry) => (
              <tr key={entry.proposal_ref} className={entry.proposal_ref === current ? 'bg-emerald-50/60' : ''}>
                <td className="px-5 py-3">{fmtDateTime(entry.generated_at)}</td>
                <td className="px-5 py-3">{entry.generated_by.name}</td>
                <td className="px-5 py-3">
                  <Fingerprint value={entry.inputs_fingerprint} />
                </td>
                <td className="px-5 py-3 text-xs text-slate-500">{entry.line_count} líneas</td>
                <td className="px-5 py-3 text-right">
                  <button type="button" className={secondaryButtonClass} onClick={() => onOpen(entry.proposal_ref)}>
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
