import { useCallback, useEffect, useState } from 'react';
import { AppShell, buttonClass, EmptyState, Notice, secondaryButtonClass } from '../components/app-shell';
import {
  CampaignPicker,
  CoverageBanner,
  DisclosureNotice,
  PendingChangesNote,
  QuantityCell,
  StatusBadge,
} from '../components/collective-ui';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { Proposal, ProposalSummary } from '../types/collective';

const POLICY_PENDING_MESSAGE =
  'La política de divulgación no está aprobada: no se genera ni se guarda ninguna propuesta con cifras.';

/**
 * F07-JP-01/02 (#26, #27): borrador de propuesta de compra conjunta desde la
 * necesidad declarada que el servidor publicó. Sólo lectura y generación de
 * borradores: no crea compras, lotes, movimientos, deudas ni pagos, y no
 * calcula cantidades en el navegador.
 */
export function JointProposalPage() {
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [history, setHistory] = useState<ProposalSummary[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (err: unknown, fallback: string) => {
    const message = collectiveError(err, fallback);
    setError(message === 'POLICY_PENDING' ? POLICY_PENDING_MESSAGE : message);
  };

  const loadHistory = useCallback(async (campaignId: string) => {
    try {
      setHistory(await collectiveService.proposals(campaignId));
    } catch (err) {
      setHistory([]);
      fail(err, 'No fue posible cargar el historial de propuestas.');
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    void Promise.resolve().then(() => {
      setProposal(null);
      setError(null);
      return loadHistory(selected);
    });
  }, [selected, loadHistory]);

  const generate = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const created = await collectiveService.generateProposal(selected);
      setProposal(created);
      await loadHistory(selected);
    } catch (err) {
      fail(err, 'No fue posible generar el borrador.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setProposal(await collectiveService.proposal(id));
    } catch (err) {
      fail(err, 'No fue posible abrir el borrador.');
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
      link.click();
      URL.revokeObjectURL(url);
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
        {proposal && <ProposalDetail proposal={proposal} onCsv={() => void downloadCsv(proposal)} />}
        <HistoryTable history={history} current={proposal?.proposal_ref ?? null} onOpen={(id) => void open(id)} />
      </div>
    </AppShell>
  );
}

function ProposalDetail({ proposal, onCsv }: { proposal: Proposal; onCsv: () => void }) {
  return (
    <section className="space-y-4" aria-label="Detalle del borrador">
      <DisclosureNotice mode={proposal.disclosure.mode} />
      {proposal.coverage && <CoverageBanner coverage={proposal.coverage} campaignName={proposal.campaign.name} />}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Borrador · {proposal.campaign.name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Generado {fmtDateTime(proposal.generated_at)} por {proposal.generated_by.name} · huella{' '}
              <code title={proposal.inputs_fingerprint}>{proposal.inputs_fingerprint.slice(0, 12)}</code>
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
                    <td className="px-5 py-3">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
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
                  <code title={entry.inputs_fingerprint}>{entry.inputs_fingerprint.slice(0, 12)}</code>
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
