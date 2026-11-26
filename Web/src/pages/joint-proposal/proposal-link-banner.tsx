import { Link } from 'react-router-dom';
import { Button, ICON, Icon, Notice } from '../../components/ui';
import { fmtDateTime } from '../../lib/collective-text';
import { PREPARE_BLOCKER_TEXT, sameSelection, UPDATE_REASON_TEXT } from '../../lib/estimation-link-text';
import { JOB_STATUS_TEXT } from '../../lib/estimation-text';
import type { Proposal } from '../../types/collective';
import type { EstimationLinkView } from '../../types/estimation-link';
import {
  bannerTone,
  estimationPath,
  primaryAction,
  unavailableText,
  type Feedback,
  type LinkIntent,
  type LinkLoad,
  type SelectionLoad,
} from './joint-proposal.types';

/** Franja sobre la tabla: el estado de la referencia fijada y una sola acción (lámina 05 §12). */
export function LinkBanner({
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
        : 'Puede obtener una referencia de consumo estimado.';
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
        'Sin estimación disponible.';
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

/**
 * Barra inferior (láminas 06 y 36): cuántos productos se eligieron, «Guardar
 * selección» si hay cambios y «Preparar convocatoria →» con la selección
 * **guardada** (E3-R6). Es pegajosa sólo mientras se recorre la tabla: al
 * final ocupa su sitio y no tapa la última fila.
 */
export function SelectionBar({
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

export function ReferenceNote({ proposal, view }: { proposal: Proposal; view: EstimationLinkView | null }) {
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
