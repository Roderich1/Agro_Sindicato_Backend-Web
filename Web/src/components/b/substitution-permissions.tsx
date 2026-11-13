import { useCallback, useRef, useState } from 'react';
import { callError, fmtDay, fmtWhen, ROLE_LABEL, SUBSTITUTION_HISTORY_NOTE, SUBSTITUTION_PERMISSION_LABEL } from '../../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { SubstitutionPermissionsHistory } from '../../types/joint-purchase-calls';
import { DataState } from '../ui';

export interface SubstitutionPermissionsHistoryPanelProps {
  testId?: string;
}

/**
 * E4 §3.2: el permiso del sindicato «Sustituir responsable» ya no se usa: hoy
 * sustituye a una responsable no habilitada cualquier persona de la
 * Administración habilitada, sin permiso adicional. Queda sólo su historia, de
 * sólo lectura y plegada: quién lo tenía al retirarse, quién lo concedió y
 * cuándo, y el historial de concesiones y retiros. No se puede conceder,
 * retirar ni renunciar (el servidor responde 409
 * `SUBSTITUTION_PERMISSION_RETIRED`). Se pide al desplegarla por primera vez.
 * Sin datos de agricultores.
 */
export function SubstitutionPermissionsHistoryPanel({ testId = 'substitution-history' }: SubstitutionPermissionsHistoryPanelProps) {
  const [view, setView] = useState<SubstitutionPermissionsHistory | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const requestedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setView(await jointPurchaseCallsService.substitutionPermissionsHistory());
      setProblem(null);
    } catch (err) {
      setProblem(callError(err, `No fue posible cargar el historial del permiso «${SUBSTITUTION_PERMISSION_LABEL}».`));
    }
  }, []);

  return (
    <details
      className="group min-w-0 rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-7"
      data-testid={testId}
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open && !requestedRef.current) {
          requestedRef.current = true;
          void load();
        }
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span>Historial del permiso «{SUBSTITUTION_PERMISSION_LABEL}» (ya no se usa)</span>
        <span className="text-sm font-normal text-link underline underline-offset-2 group-open:hidden">Ver</span>
        <span className="hidden text-sm font-normal text-link underline underline-offset-2 group-open:inline">Ocultar</span>
      </summary>
      <div className="space-y-3 pb-1 pt-2 text-sm leading-relaxed">
        <p className="text-ink-muted">{SUBSTITUTION_HISTORY_NOTE}</p>
        {problem ? (
          <DataState compact state="error" description={problem} onRetry={() => void load()} />
        ) : !view ? (
          <DataState compact state="loading" />
        ) : (
          <>
            <p className="text-ink" data-testid="substitution-retired-notice">
              {view.notice}. Retirado el {fmtDay(view.retired_at)}.
            </p>
            <section aria-label="Quién lo tenía al retirarse">
              <h3 className="font-semibold text-ink">Quién lo tenía al retirarse</h3>
              {view.holders.length === 0 ? (
                <p className="text-ink-muted" data-testid="substitution-holders-empty">
                  Nadie lo tenía.
                </p>
              ) : (
                <ul className="mt-1 divide-y divide-line border-t border-line" aria-label="Personas que lo tenían">
                  {view.holders.map((holder) => (
                    <li key={holder.user_ref} className="py-2" data-testid={`substitution-holder-${holder.user_ref}`}>
                      <p className="font-semibold text-ink [overflow-wrap:anywhere]">
                        {holder.name}
                        {holder.role && <span className="font-normal text-ink-muted"> · {ROLE_LABEL[holder.role] ?? holder.role}</span>}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Concedido el {fmtDay(holder.granted_at)} por {holder.granted_by.name}
                      </p>
                      {holder.reason && <p className="text-xs text-ink-muted [overflow-wrap:anywhere]">Motivo: {holder.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Historial de concesiones y retiros">
              <h3 className="font-semibold text-ink">Concesiones y retiros</h3>
              {view.history.length === 0 ? (
                <p className="text-ink-muted">Nadie concedió ni retiró este permiso.</p>
              ) : (
                <ol className="mt-1 space-y-2" aria-label="Historial del permiso">
                  {view.history.map((entry, index) => (
                    <li key={`${entry.at}-${index}`} data-testid="substitution-history-event">
                      <span className="font-semibold text-ink">
                        {entry.action === 'GRANTED' ? 'Concedido' : entry.user.user_ref === entry.actor.user_ref ? 'Renuncia' : 'Retirado'}
                      </span>
                      <span className="text-ink"> · {entry.user.name}</span>
                      <span className="text-xs text-ink-muted">
                        {' '}
                        · por {entry.actor.name} · {fmtWhen(entry.at, 'always')}
                      </span>
                      {entry.reason && <p className="text-xs text-ink-muted [overflow-wrap:anywhere]">Motivo: {entry.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>
    </details>
  );
}
