import { useCallback, useEffect, useRef, useState } from 'react';
import { collectiveError, fmtDateTime, sealBlockText } from '../lib/collective-text';
import { fmtDate } from '../lib/format';
import { collectiveService } from '../services/collective.service';
import type { SealState } from '../types/collective';
import { Button, Chip, ConfirmDialog, Notice } from './ui';

/**
 * F07 (F07_SEALED_HISTORY_CONTRACT §3): revisión previa y sellado manual de la
 * versión colectiva de una campaña cerrada. DIRECTIVA o ADMINISTRADOR, cada
 * uno por sí solo. El servidor comprueba rol, tenant, estado y que lo sellado
 * sea exactamente lo revisado; ocultar el botón no es la protección.
 *
 * Rediseño v2 (lámina 05 §10, diálogo 30.3): «Siguiente paso: sellar las
 * cifras» con la cobertura y «Datos aceptados hasta» de la revisión; los
 * avisos salen de los booleanos de `review`, **sin número** (H-04). La
 * confirmación es un `ConfirmDialog` con casilla obligatoria. Mientras no se
 * puede sellar, el panel se reduce a los motivos (`blocked_by`). No dibuja una
 * tarjeta propia: lo coloca la vista (Resumen, detalle de campaña).
 */
export function SealPanel({
  campaignId,
  onSealed,
  closedAt,
}: {
  campaignId: string;
  onSealed: () => void;
  /** Fecha de cierre de la campaña (`Campaign.closedAt`), para el chip «Cerrada el …». Opcional. */
  closedAt?: string | null;
}) {
  const [state, setState] = useState<SealState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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

  // `GET …/seal` sobre una campaña sellable ejecuta la decisión de divulgación
  // en el servidor: una sola lectura por montaje, aunque StrictMode repita el
  // efecto. Una recarga explícita del resumen vuelve a montar el panel (`key`).
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (requested.current === campaignId) return;
    requested.current = campaignId;
    void Promise.resolve().then(load);
  }, [campaignId, load]);

  const seal = async () => {
    if (!state?.review || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sealed = await collectiveService.seal(campaignId, state.review.review_ref);
      setState(sealed);
      setConfirming(false);
      onSealed();
    } catch (err) {
      const message = collectiveError(err, 'No fue posible sellar. No se selló nada.');
      setConfirming(false);
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

  if (!state.can_seal || !state.review) {
    return (
      <section className="text-sm text-ink-muted" aria-label="Sellado de la versión colectiva" data-testid="seal-panel">
        <p className="font-semibold text-ink">{state.blocked_by.includes('CAMPAIGN_NOT_CLOSED') ? 'Sellar: disponible al cerrar; todavía no se puede sellar.' : 'Sellar: todavía no se puede sellar.'}</p>
        {state.blocked_by.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {state.blocked_by.map((block) => (
              <li key={block}>{sealBlockText(block)}</li>
            ))}
          </ul>
        )}
        {error && (
          <div className="mt-2">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </section>
    );
  }

  const { review } = state;
  const closedDay = closedAt ? fmtDate(closedAt) : null; // instante de cierre: día local
  return (
    <section className="space-y-3" aria-label="Sellado de la versión colectiva" data-testid="seal-panel">
      <Chip tone="neutral" dot size="md">
        {closedDay && closedDay !== '-' ? `Cerrada el ${closedDay}` : 'Cerrada'}
      </Chip>
      <h3 className="text-xl font-bold text-ink">Siguiente paso: sellar las cifras</h3>
      {error && <Notice kind="error">{error}</Notice>}
      <ul className="list-disc space-y-1 pl-5 text-base text-ink" data-testid="seal-review">
        <li>
          {review.coverage.members_with_contribution} de {review.coverage.linked_members} agricultores vinculados con cifras publicadas.
        </li>
        <li>Datos aceptados hasta el {fmtDateTime(review.accepted_until)}.</li>
        {review.open_disputes && <li>Hay aportes en conflicto sin resolver: no cuentan en las cifras y no se incorporarán después.</li>}
        {review.pending_changes && <li>Hay cifras que muestran un valor anterior con cambios pendientes: se sellará ese valor anterior.</li>}
        {review.cells_without_figure && <li>Algunas filas no tienen cifra (bajo el umbral o en revisión) y quedarán así en la versión sellada.</li>}
      </ul>
      <details className="group text-sm text-ink-muted">
        <summary className="cursor-pointer font-semibold text-link underline underline-offset-2">Qué significa sellar</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
          <li>
            Sellar fija una versión identificable de estos resultados para consultas históricas. No reabre ni cambia la campaña, no
            habilita cifras reales, no da permisos nuevos de lectura y no hace anónimos los datos. Después de sellar no hay corrección
            ni nueva versión en este sistema.
          </li>
          <li>
            El servidor sólo conoce lo que los teléfonos publicaron y él aceptó: no puede asegurar que todos los teléfonos publicaron
            todo.
          </li>
          <li>
            Después de sellar, los teléfonos no podrán publicar valores nuevos de esta campaña. Un agricultor sí puede retirar su
            aporte; entonces la cifra sellada que lo incluía deja de mostrarse.
          </li>
        </ul>
      </details>
      <Button onClick={() => setConfirming(true)} disabled={busy}>
        Sellar esta versión…
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Sellar esta versión"
          confirmLabel={busy ? 'Sellando…' : 'Sellar'}
          cancelLabel="Cancelar"
          busy={busy}
          acknowledgement="Revisé la cobertura y los avisos, y entiendo que la versión sellada no se corrige ni se reabre."
          onConfirm={() => void seal()}
          onCancel={() => setConfirming(false)}
          testId="seal-confirm"
        >
          <p>
            Se sellará la versión revisada de «{state.campaign.name}», con datos aceptados hasta {fmtDateTime(review.accepted_until)}.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              {review.coverage.members_with_contribution} de {review.coverage.linked_members} agricultores vinculados con cifras
              publicadas.
            </li>
            {review.pending_changes && <li>Hay cifras que muestran un valor anterior: se sellará ese valor.</li>}
            {review.cells_without_figure && <li>Hay productos sin cifra.</li>}
          </ul>
          <p className="mt-2">Si algo cambió desde la revisión, el servidor no sellará nada y le pedirá revisar de nuevo.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
