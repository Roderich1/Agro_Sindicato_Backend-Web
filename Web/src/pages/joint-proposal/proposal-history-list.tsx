import { Fingerprint } from '../../components/collective-ui';
import { Button, Card, Chip, DataState } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import type { Proposal, ProposalSummary } from '../../types/collective';
import { productsText } from './joint-proposal.types';

/**
 * Pestaña «Borradores anteriores» (lámina 07): cada borrador con su fecha,
 * autor, número de productos y huella; «Actual» es el último generado. «Ver»
 * lo muestra (sólo lectura). Ninguno se modifica.
 */
export function HistoryList({
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
