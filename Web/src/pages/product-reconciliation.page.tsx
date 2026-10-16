import { useCallback, useEffect, useState } from 'react';
import {
  AppShell,
  buttonClass,
  dangerButtonClass,
  EmptyState,
  inputClass,
  labelClass,
  Modal,
  Notice,
  secondaryButtonClass,
} from '../components/app-shell';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import { collectiveService } from '../services/collective.service';
import type { Association, AssociationList, CatalogEntry } from '../types/collective';

type Dialog =
  | { kind: 'associate'; product: CatalogEntry }
  | { kind: 'close'; association: Association };

/**
 * F07-REC-01 (#108, CU-18): la Directiva asocia una denominación del catálogo
 * con su producto canónico. Nada se asocia sin confirmación explícita; los
 * nombres originales no cambian y cada cambio queda en el historial. Sin
 * sugerencias automáticas.
 */
export function ProductReconciliationPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [associations, setAssociations] = useState<AssociationList>({ current: [], history: [] });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const load = useCallback(async () => {
    try {
      const [products, list] = await Promise.all([collectiveService.catalog(), collectiveService.associations()]);
      setCatalog(products);
      setAssociations(list);
      setError(null);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible cargar el catálogo.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const aliasOf = new Map(associations.current.map((row) => [row.product_ref, row]));
  const aliasCount = new Map<string, number>();
  for (const row of associations.current) {
    aliasCount.set(row.canonical_product_ref, (aliasCount.get(row.canonical_product_ref) ?? 0) + 1);
  }
  const catalogEntry = (ref: string) => catalog.find((product) => product.product_ref === ref);
  const unassociated = catalog.filter((product) => !aliasOf.has(product.product_ref));
  const fullHistory = [...associations.current, ...associations.history].sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  const done = async (text: string) => {
    setDialog(null);
    setMessage(text);
    await load();
  };

  return (
    <AppShell title="Reconciliación de denominaciones" section="Directiva">
      <div className="space-y-6">
        <Notice kind="info">
          Asociar «Bellator» con «Belator» agrupa sus cifras bajo el producto canónico en el resumen y en las propuestas
          que se generen después. Los nombres del catálogo y los datos de los agricultores no cambian. Sólo se agrupan
          unidades de la misma dimensión (L con L, KG con KG).
        </Notice>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="ok">{message}</Notice>}

        <section className="glass-card overflow-hidden" aria-label="Asociaciones vigentes">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Asociaciones vigentes</h2>
          </div>
          {associations.current.length === 0 ? (
            <EmptyState title="No hay denominaciones asociadas" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {associations.current.map((row) => (
                  <tr key={row.association_ref} data-testid={`current-${row.product_name}`}>
                    <td className="px-5 py-3 font-medium">{row.product_name}</td>
                    <td className="px-5 py-3 text-slate-500">→ {row.canonical_product_name}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      desde {fmtDateTime(row.valid_from)} · {row.actor_name}
                    </td>
                    <td className="space-x-2 px-5 py-3 text-right">
                      {catalogEntry(row.product_ref) && (
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => setDialog({ kind: 'associate', product: catalogEntry(row.product_ref)! })}
                        >
                          Corregir…
                        </button>
                      )}
                      <button type="button" className={secondaryButtonClass} onClick={() => setDialog({ kind: 'close', association: row })}>
                        Deshacer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="glass-card overflow-hidden" aria-label="Denominaciones sin asociar">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Denominaciones sin asociar</h2>
            <p className="mt-0.5 text-xs text-slate-500">Cada una se consolida por separado hasta que la Directiva confirme una asociación.</p>
          </div>
          {unassociated.length === 0 ? (
            <EmptyState title="Todas las denominaciones están asociadas" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {unassociated.map((product) => {
                  const aliases = aliasCount.get(product.product_ref) ?? 0;
                  return (
                    <tr key={product.product_ref} data-testid={`product-${product.product_name}`}>
                      <td className="px-5 py-3 font-medium">
                        {product.product_name}
                        {!product.is_active && <span className="ml-2 text-xs text-slate-400">(inactivo)</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{product.unit}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {product.base_unit === null
                          ? 'Unidad no vinculable'
                          : aliases > 0
                            ? `Canónico de ${aliases} denominación(es)`
                            : 'Pendiente'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={product.base_unit === null || aliases > 0}
                          title={aliases > 0 ? 'Es canónico de otras denominaciones: no puede ser alias.' : undefined}
                          onClick={() => setDialog({ kind: 'associate', product })}
                        >
                          Asociar…
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="glass-card overflow-hidden" aria-label="Historial">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Historial</h2>
            <p className="mt-0.5 text-xs text-slate-500">Las correcciones cierran la asociación anterior y abren otra; nada se borra.</p>
          </div>
          {fullHistory.length === 0 ? (
            <EmptyState title="Sin cambios registrados" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Denominación → canónico</th>
                    <th className="px-5 py-3">Vigencia</th>
                    <th className="px-5 py-3">Asociado por / motivo</th>
                    <th className="px-5 py-3">Cerrado por / motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fullHistory.map((row) => (
                    <tr key={row.association_ref} data-testid={`history-${row.association_ref}`}>
                      <td className="px-5 py-3">{row.product_name} → {row.canonical_product_name}</td>
                      <td className="px-5 py-3 text-xs">
                        {fmtDateTime(row.valid_from)} – {row.valid_to ? fmtDateTime(row.valid_to) : 'vigente'}
                      </td>
                      <td className="px-5 py-3 text-xs">{row.actor_name}: {row.reason}</td>
                      <td className="px-5 py-3 text-xs">{row.closed_by_name ? `${row.closed_by_name}: ${row.close_reason ?? ''}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === 'associate' && (
        <AssociateDialog
          product={dialog.product}
          candidates={catalog.filter(
            (other) =>
              other.product_ref !== dialog.product.product_ref &&
              other.base_unit === dialog.product.base_unit &&
              !aliasOf.has(other.product_ref),
          )}
          onClose={() => setDialog(null)}
          onDone={(canonical) => void done(`«${dialog.product.product_name}» quedó asociado a «${canonical}».`)}
        />
      )}
      {dialog?.kind === 'close' && (
        <CloseDialog
          association={dialog.association}
          onClose={() => setDialog(null)}
          onDone={() => void done(`«${dialog.association.product_name}» vuelve a consolidarse por separado.`)}
        />
      )}
    </AppShell>
  );
}

function AssociateDialog({
  product,
  candidates,
  onClose,
  onDone,
}: {
  product: CatalogEntry;
  candidates: CatalogEntry[];
  onClose: () => void;
  onDone: (canonicalName: string) => void;
}) {
  const [canonical, setCanonical] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = candidates.find((candidate) => candidate.product_ref === canonical);
  const ready = Boolean(target) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!target || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await collectiveService.associate({
        productId: product.product_ref,
        canonicalProductId: target.product_ref,
        reason: reason.trim(),
        confirmed: true,
      });
      onDone(target.product_name);
    } catch (err) {
      setError(collectiveError(err, 'No fue posible guardar la asociación.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Asociar «${product.product_name}»`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="canonical">Producto canónico</label>
          <select id="canonical" className={inputClass} value={canonical} onChange={(event) => setCanonical(event.target.value)}>
            <option value="">Seleccione…</option>
            {candidates.map((candidate) => (
              <option key={candidate.product_ref} value={candidate.product_ref}>
                {candidate.product_name} ({candidate.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="reason">Motivo</label>
          <textarea id="reason" className={inputClass} maxLength={280} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        {target && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>
              Confirmo que «{product.product_name}» y «{target.product_name}» son el mismo producto. Sus cifras se
              agruparán bajo «{target.product_name}»; los nombres originales no cambian.
            </span>
          </label>
        )}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button type="button" className={buttonClass} disabled={!ready} onClick={() => void submit()}>
            Confirmar asociación
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CloseDialog({
  association,
  onClose,
  onDone,
}: {
  association: Association;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await collectiveService.closeAssociation(association.product_ref, { reason: reason.trim(), confirmed: true });
      onDone();
    } catch (err) {
      setError(collectiveError(err, 'No fue posible deshacer la asociación.'));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Deshacer «${association.product_name} → ${association.canonical_product_name}»`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="close-reason">Motivo</label>
          <textarea id="close-reason" className={inputClass} maxLength={280} value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>Confirmo que «{association.product_name}» vuelve a consolidarse por separado. La asociación queda en el historial.</span>
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={dangerButtonClass}
            disabled={!confirmed || reason.trim().length === 0 || busy}
            onClick={() => void submit()}
          >
            Deshacer asociación
          </button>
        </div>
      </div>
    </Modal>
  );
}
