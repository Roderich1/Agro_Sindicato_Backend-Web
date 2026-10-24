import { useCallback, useEffect, useState } from 'react';
import { collectiveError, fmtDateTime, sealBlockText } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { SealState } from '../types/collective';
import { buttonClass, Modal, Notice, secondaryButtonClass } from './app-shell';

/**
 * F07 (F07_SEALED_HISTORY_CONTRACT §3): revisión previa y sellado manual de la
 * versión colectiva de una campaña cerrada. DIRECTIVA o ADMINISTRADOR, cada
 * uno por sí solo. El servidor comprueba rol, tenant, estado y que lo sellado
 * sea exactamente lo revisado; ocultar el botón no es la protección.
 */
export function SealPanel({ campaignId, onSealed }: { campaignId: string; onSealed: () => void }) {
  const [state, setState] = useState<SealState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await collectiveService.sealState(campaignId));
    } catch (err) {
      setState(null);
      setError(collectiveError(err, 'No fue posible cargar el estado del sellado.'));
    }
  }, [campaignId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const seal = async () => {
    if (!state?.review || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sealed = await collectiveService.seal(campaignId, state.review.review_ref);
      setState(sealed);
      setConfirming(false);
      setUnderstood(false);
      onSealed();
    } catch (err) {
      const message = collectiveError(err, 'No fue posible sellar. No se selló nada.');
      setConfirming(false);
      setUnderstood(false);
      // La revisión pudo quedar obsoleta: se vuelve a pedir la vigente, y el
      // motivo se muestra después (la recarga limpia los errores anteriores).
      await load();
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (!state) return error ? <Notice kind="error">{error}</Notice> : null;
  if (state.state === 'SEALED') return error ? <Notice kind="error">{error}</Notice> : null;

  return (
    <section className="glass-card space-y-4 p-5" aria-label="Sellado de la versión colectiva" data-testid="seal-panel">
      <div>
        <h2 className="text-base font-bold text-slate-900">Sellado de la versión colectiva</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Sellar fija una versión identificable de estos resultados para consultas históricas. No reabre ni cambia la
          campaña, no habilita cifras reales, no da permisos nuevos de lectura y no hace anónimos los datos. Después de
          sellar no hay corrección ni nueva versión en este sistema.
        </p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {state.blocked_by.length > 0 && (
        <Notice kind="info">
          <strong>Todavía no se puede sellar.</strong>
          <ul className="mt-1 list-disc pl-5">
            {state.blocked_by.map((block) => (
              <li key={block}>{sealBlockText(block)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {state.can_seal && state.review && (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-2" data-testid="seal-review">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-slate-500">Cobertura</dt>
              <dd className="font-semibold text-slate-900">
                {state.review.coverage.members_with_contribution} de {state.review.coverage.linked_members} agricultores
                vinculados con cifras publicadas
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-slate-500">Datos aceptados hasta</dt>
              <dd className="font-semibold text-slate-900">{fmtDateTime(state.review.accepted_until)}</dd>
            </div>
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {state.review.open_disputes && (
              <li>Hay aportes en conflicto sin resolver: no cuentan en las cifras y no se incorporarán después.</li>
            )}
            {state.review.pending_changes && (
              <li>Algunas cifras muestran un valor anterior con cambios pendientes: se sellará ese valor anterior.</li>
            )}
            {state.review.cells_without_figure && (
              <li>Algunas filas no tienen cifra (bajo el umbral o en revisión) y quedarán así en la versión sellada.</li>
            )}
            <li>
              El servidor sólo conoce lo que los teléfonos publicaron y él aceptó: no puede asegurar que todos los
              teléfonos publicaron todo.
            </li>
            <li>
              Después de sellar, los teléfonos no podrán publicar valores nuevos de esta campaña. Un agricultor sí puede
              retirar su aporte; entonces la cifra sellada que lo incluía deja de mostrarse.
            </li>
          </ul>
          <button type="button" className={buttonClass} onClick={() => setConfirming(true)} disabled={busy}>
            Sellar esta versión…
          </button>
        </>
      )}
      {confirming && state.review && (
        <Modal title="Confirmar el sellado" onClose={() => (busy ? undefined : setConfirming(false))} size="sm">
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              Se sellará la versión revisada de «{state.campaign.name}», con datos aceptados hasta{' '}
              {fmtDateTime(state.review.accepted_until)}. Si algo cambió desde la revisión, el servidor no sellará nada y
              le pedirá revisar de nuevo.
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={understood}
                onChange={(event) => setUnderstood(event.target.checked)}
                disabled={busy}
              />
              <span>Revisé la cobertura y los avisos, y entiendo que la versión sellada no se corrige ni se reabre.</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className={buttonClass} onClick={() => void seal()} disabled={!understood || busy}>
                {busy ? 'Sellando…' : 'Sellar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
