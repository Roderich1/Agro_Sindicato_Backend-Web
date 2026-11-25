import { CallCard, CallTotal, ProductLines } from '../../components/b/call-ui';
import { DataState } from '../../components/ui';
import {
  CALL_FOOTNOTE,
  callOriginEditedText,
  callOriginText,
  fmtDay,
  fmtWhen,
  MANAGE_ONLY_TEXT,
  peopleText,
  PROVISIONAL_NOTE,
  referenceText,
  unitText,
} from '../../lib/joint-purchase-call-text';
import type { JointPurchaseCallDetail } from '../../types/joint-purchase-calls';
import { grantsText } from './call-detail.helpers';
import { PendingConsentLine } from './call-participants-closing';

/** Pie de la columna derecha (lámina 11): origen (E3-P2), permisos propios, sustitución y la nota «no es una compra». */
export function CallFootnote({ call, canManage, responsibleIneligible }: { call: JointPurchaseCallDetail; canManage: boolean; responsibleIneligible: boolean }) {
  const origin = callOriginText(call.origin);
  const lastChange = call.responsible_changes.at(-1);
  const active = call.status === 'DRAFT' || call.status === 'OPEN';
  const row = '[&>dd]:ml-1 [&>dd]:inline [&>dt]:inline';
  return (
    <div className="space-y-2 px-1 text-sm leading-relaxed text-ink-muted">
      <dl className="space-y-1.5" data-testid="call-facts">
        {origin && (
          <div className={row}>
            <dt className="font-semibold text-ink">Origen:</dt>
            <dd className="[overflow-wrap:anywhere]" data-testid="call-origin">
              {origin}
              {call.origin && call.origin_differs_from_current && (
                <span className="block" data-testid="call-origin-edited">
                  {callOriginEditedText(call.origin)}
                </span>
              )}
            </dd>
          </div>
        )}
        {Array.isArray(call.my_grants) && (
          <div className={row}>
            <dt className="font-semibold text-ink">Sus permisos:</dt>
            <dd>{grantsText(call.my_grants, call.is_responsible)}</dd>
          </div>
        )}
        {lastChange && (
          <div className={row}>
            <dt className="font-semibold text-ink">Sustitución:</dt>
            <dd className="[overflow-wrap:anywhere]" data-testid="responsible-change">
              {`${lastChange.next.name} sustituyó a ${lastChange.previous.name} el ${fmtWhen(lastChange.at, 'always')}, por decisión de ${lastChange.actor.name}. Motivo: ${lastChange.reason}`}
            </dd>
          </div>
        )}
      </dl>
      {active && !canManage && !responsibleIneligible && <p data-testid="manage-note">{MANAGE_ONLY_TEXT}</p>}
      {/* Cerrada: el consolidado ya dice qué son las cantidades y «Qué sigue» lo completa. */}
      {call.status !== 'CLOSED' && <p data-testid="call-footnote">{CALL_FOOTNOTE}</p>}
    </div>
  );
}

/** Productos de un borrador, de una abierta («Pedido hasta ahora», total provisional) o de una cancelada (láminas 10, 11, 13 y 16–20). */
export function ProductsCard({ call }: { call: JointPurchaseCallDetail }) {
  const open = call.status === 'OPEN';
  const draft = call.status === 'DRAFT';
  const sourceDate = call.origin?.proposal_generated_at ?? null;
  const note = open
    ? PROVISIONAL_NOTE
    : draft
      ? call.source_proposal_ref
        ? sourceDate
          ? `Tomados del borrador de compra del ${fmtDay(sourceDate)}`
          : 'Tomados de un borrador de compra'
        : 'Elegidos del catálogo'
      : 'Los pedidos quedaron sin efecto';
  return (
    <CallCard title={open ? 'Pedido hasta ahora' : 'Productos'} note={<span data-testid="products-note">{note}</span>} testId="call-products">
      {call.products.length === 0 ? (
        <div className="pt-3">
          <DataState compact state="empty" title="Sin productos" description="El borrador todavía no tiene productos." />
        </div>
      ) : (
        <ProductLines
          caption="Productos de la convocatoria"
          valueHeader={open ? 'Total provisional solicitado' : draft ? 'Referencia del borrador de compra' : undefined}
          lines={call.products.map((product) => ({
            key: product.product_ref,
            testId: `call-product-${product.product_ref}`,
            name: product.name,
            sub: open && product.totals.participant_count > 0 ? `${unitText(product.unit)} · ${peopleText(product.totals.participant_count)}` : unitText(product.unit),
            value: open ? (
              <CallTotal total={product.totals} baseUnit={product.base_unit} open />
            ) : draft ? (
              <span className="text-sm text-ink-muted">{product.reference ? referenceText(product.reference, product.base_unit) : 'Del catálogo, sin referencia'}</span>
            ) : null,
          }))}
        />
      )}
      {open && <PendingConsentLine count={call.pending_consent_count} />}
      {draft && <p className="border-t border-line pt-3 text-sm text-ink-muted">Al abrirla, el nombre, la fecha límite y los productos dejan de ser editables.</p>}
    </CallCard>
  );
}
