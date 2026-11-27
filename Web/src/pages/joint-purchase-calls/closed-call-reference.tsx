import { useEffect, useState } from 'react';
import { Button, statusChipLabel } from '../../components/ui';
import { formatQuantity, type BaseUnit } from '../../lib/quantity';
import { collectiveService } from '../../services/collective.service';
import { jointPurchaseCallsService } from '../../services/joint-purchase-calls.service';
import type { CollectiveSummary } from '../../types/collective';
import type { ClosedProductHistory } from '../../types/joint-purchase-calls';

const HISTORY_TEXT = {
  NO_HISTORY: 'Sin convocatorias cerradas para este producto.',
  PENDING_CONSENT: 'Total pendiente de autorización.',
  INCOMPATIBLE_UNITS: 'Total no disponible por diferencia de unidades.',
} as const;

type HistoryResult = { key: string; products: ClosedProductHistory[] | null };

function quantity(base: string | null, unit: BaseUnit, presentation?: string | null): string {
  return formatQuantity(base, unit, presentation)?.replace(/ KG$/, ' kg') ?? 'Cifra no disponible';
}

function declaredNeed(summary: CollectiveSummary | null, product: ClosedProductHistory): string {
  if (!summary) return 'Cifra no disponible';
  if (summary.disclosure.mode === 'POLICY_PENDING') return 'Pendiente de divulgación';
  const cell = summary.cells.find((row) => row.projection_type === 'DECLARED_NEED' && row.product_ref === product.product_ref
    && row.base_unit === product.base_unit);
  if (!cell) return 'Sin cifra publicada';
  return cell.status === 'DISCLOSED'
    ? quantity(cell.total_base, cell.base_unit, cell.total_presentation)
    : statusChipLabel(cell.status);
}

export function ClosedCallReference({
  campaignId,
  productRefs,
  excludeCallId,
  showDeclaredNeed,
}: Readonly<{
  campaignId: string;
  productRefs: readonly string[];
  excludeCallId?: string;
  showDeclaredNeed: boolean;
}>) {
  const selection = JSON.stringify([...productRefs].sort((left, right) => left.localeCompare(right)));
  const hasProducts = productRefs.length > 0;
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([campaignId, selection, excludeCallId, attempt]);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [needs, setNeeds] = useState<{ campaignId: string; summary: CollectiveSummary | null } | null>(null);

  useEffect(() => {
    if (!hasProducts) return;
    const controller = new AbortController();
    async function load() {
      try {
        const refs: string[] = JSON.parse(selection);
        const products = await jointPurchaseCallsService.closedProductHistory(campaignId, refs, excludeCallId, controller.signal);
        if (!controller.signal.aborted) setResult({ key, products });
      } catch {
        if (!controller.signal.aborted) setResult({ key, products: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [campaignId, excludeCallId, hasProducts, key, selection]);

  useEffect(() => {
    if (!showDeclaredNeed || !hasProducts) return;
    let current = true;
    async function load() {
      try {
        const summary = await collectiveService.summary(campaignId);
        if (current) setNeeds({ campaignId, summary });
      } catch {
        if (current) setNeeds({ campaignId, summary: null });
      }
    }
    void load();
    return () => { current = false; };
  }, [campaignId, hasProducts, showDeclaredNeed]);

  if (!hasProducts) return null;
  const current = result?.key === key ? result : null;
  return (
    <section aria-label="Referencia por producto" className="space-y-2 rounded-xl border border-line px-3 py-2 text-sm">
      {!current && (
        <output className="block text-ink-muted">Cargando convocatorias cerradas…</output>
      )}
      {current && !current.products && (
        <div className="flex flex-wrap items-center gap-2">
          <output>No se pudo cargar la referencia de convocatorias cerradas.</output>
          <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button>
        </div>
      )}
      {current?.products?.map((product) => (
        <div key={product.product_ref} className="space-y-1 border-b border-line pb-2 last:border-0 last:pb-0">
          <p className="font-semibold">{product.product_name}</p>
          {showDeclaredNeed && (
            <p>Necesidad declarada: {needs?.campaignId === campaignId ? declaredNeed(needs.summary, product) : 'Cargando…'}</p>
          )}
          <p>
            Solicitado en convocatorias cerradas: {product.status === 'VISIBLE'
              ? quantity(product.total_quantity_base, product.base_unit)
              : HISTORY_TEXT[product.status]}
          </p>
          {product.calls.length > 1 && (
            <ul className="space-y-1 pl-3 text-ink-muted">
              {product.calls.map((call) => (
                <li key={call.call_id}>
                  {call.call_name}: {call.visibility === 'VISIBLE' ? quantity(call.quantity_base, call.base_unit) : 'Pendiente de autorización'}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
