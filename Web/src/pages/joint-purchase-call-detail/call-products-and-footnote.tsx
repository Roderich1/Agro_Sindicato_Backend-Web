import { CallCard, CallTotal, ProductLines } from '../../components/b/call-ui';
import { DataState } from '../../components/ui';
import {
  callOriginEditedText,
  callOriginText,
  fmtDay,
  peopleText,
  PROVISIONAL_NOTE,
  referenceText,
  unitText,
} from '../../lib/joint-purchase-call-text';
import type { JointPurchaseCallDetail } from '../../types/joint-purchase-calls';
import { PendingConsentLine } from './call-participants-closing';

/** Procedencia registrada al crear la convocatoria. */
export function CallProvenance({ call }: Readonly<{ call: JointPurchaseCallDetail }>) {
  const origin = callOriginText(call.origin);
  const row = '[&>dd]:ml-1 [&>dd]:inline [&>dt]:inline';
  return (
    <div className="space-y-2 px-1 text-sm leading-relaxed text-ink-muted">
      <dl className="space-y-1.5" data-testid="call-facts">
        <div className={row}>
          <dt className="font-semibold text-ink">Creada por:</dt>
          <dd>{call.created_by.name}</dd>
        </div>
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
      </dl>
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
