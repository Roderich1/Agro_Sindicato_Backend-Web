import { DisclosureNotice, Fingerprint, PolicyLine } from '../../components/collective-ui';
import { Button, Card, Chip, DataState, DataTable, ICON, Notice, PrivacyChip, statusChipLabel } from '../../components/ui';
import { fmtDateTime, PENDING_CHANGES_TEXT, statusReason } from '../../lib/collective-text';
import { comparisonMessages, estimateScopeText, hasEstimateFigure } from '../../lib/estimation-link-text';
import { REASON_TEXT, RESULT_STATUS_TEXT, VALIDITY_REASON_TEXT } from '../../lib/estimation-text';
import { formatBaseValue, formatDecimalQuantity, formatQuantity, formatRoundedEstimate } from '../../lib/quantity';
import type { ProposalLine } from '../../types/collective';
import { linkLineOf, type DetailProps, type LinkLoad } from './joint-proposal.types';
import { LinkBanner, ReferenceNote, SelectionBar } from './proposal-link-banner';

export function ProposalDetail(props: DetailProps) {
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
            {/* E4 §4.4: el borrador conserva la política con que se generó. */}
            {proposal.disclosure.mode === 'PROVISIONAL_SYNTHETIC' && <PolicyLine policy={proposal.disclosure.policy} threshold={null} testId="proposal-policy" />}
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
        Cifra anterior: hay cambios sin publicar<span className="sr-only">. {PENDING_CHANGES_TEXT}</span>
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
          {statusReason(line.status)}
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
