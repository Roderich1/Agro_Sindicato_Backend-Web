import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, buttonClass, dangerButtonClass, EmptyState, Modal, Notice, secondaryButtonClass, SkeletonRow } from '../components/app-shell';
import { Collapsible, PageNote, SectionHeader } from '../components/collective-ui';
import { ProductForm } from '../components/product-form';
import { productError } from '../lib/product-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { productsService } from '../services/inventory.service';
import type { Product } from '../types/inventory';

/** Unidades que el servidor vincula a una unidad base (mL o g). Otras quedan fuera de las cifras colectivas. */
function unitLabel(unit: string): { text: string; linkable: boolean } {
  const upper = unit.trim().toUpperCase();
  if (upper === 'L') return { text: 'L', linkable: true };
  if (upper === 'KG') return { text: 'kg', linkable: true };
  return { text: unit, linkable: false };
}

/**
 * Gestión → Productos (defensa, 2026-11-05): el catálogo del sindicato. La
 * Directiva crea los productos canónicos; los agricultores declaran sobre esta
 * lista y los nombres que llegan distintos se asocian en «Equivalencias de
 * productos». Una sola acción primaria («Nuevo producto»); editar e inactivar
 * son secundarias. Inactivar no borra: conserva cifras, equivalencias e
 * historial. Ruta protegida por `CollectiveRoute`; el servidor autoriza.
 */
export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deactivating, setDeactivating] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await productsService.list());
      setError(null);
    } catch (err) {
      setError(productError(err, 'No fue posible cargar los productos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const active = products.filter((product) => product.isActive);
  const inactive = products.filter((product) => !product.isActive);
  const existing = products.map((product) => ({ id: product.id, name: product.name, isActive: product.isActive }));

  const saved = async (text: string) => {
    setCreating(false);
    setEditing(null);
    setDeactivating(null);
    setMessage(text);
    await load();
  };

  return (
    <AppShell
      title="Productos"
      section="Gestión"
      actions={
        <button type="button" className={buttonClass} onClick={() => setCreating(true)}>
          Nuevo producto
        </button>
      }
    >
      <div className="space-y-4">
        <PageNote>
          Catálogo de productos del sindicato. Los agricultores declaran sobre esta lista; los nombres que llegan distintos
          se asocian a un producto en{' '}
          <Link to={COLLECTIVE_PATHS.reconciliation} className="font-semibold text-emerald-700 underline">
            Ver equivalencias
          </Link>
          .
        </PageNote>
        {message && <Notice kind="ok">{message}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}

        <section className="glass-card overflow-hidden" aria-label="Productos activos">
          <SectionHeader
            title="Productos activos"
            note={loading ? 'Cargando…' : `${active.length} ${active.length === 1 ? 'producto' : 'productos'}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Nombre</th>
                  <th className="px-5 py-2.5">Unidad</th>
                  <th className="px-5 py-2.5">Categoría</th>
                  <th className="px-5 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 3 }).map((_, index) => <SkeletonRow key={index} cols={4} />)
                ) : active.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState compact title="Todavía no hay productos activos" description="Cree el primero con «Nuevo producto»." />
                    </td>
                  </tr>
                ) : (
                  active.map((product) => <ProductRow key={product.id} product={product} onEdit={() => setEditing(product)} onDeactivate={() => setDeactivating(product)} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <Collapsible title={`Ver inactivos (${inactive.length})`} label="Productos inactivos" testId="inactive-products">
          <p className="px-5 pt-3 text-xs text-slate-500">Un producto inactivo no se borra: sus cifras, equivalencias e historial se conservan.</p>
          {inactive.length === 0 ? (
            <EmptyState compact title="No hay productos inactivos" />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {inactive.map((product) => (
                  <tr key={product.id} data-testid={`inactive-${product.name}`}>
                    <td className="px-5 py-2.5 font-medium text-slate-600">{product.name}</td>
                    <td className="px-5 py-2.5 text-slate-500">{unitLabel(product.unit).text}</td>
                    <td className="px-5 py-2.5 text-slate-500">{product.category ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Collapsible>
      </div>

      {(creating || editing) && (
        <Modal title={editing ? `Editar «${editing.name}»` : 'Nuevo producto'} onClose={() => { setCreating(false); setEditing(null); }} size="lg">
          <ProductForm
            product={editing}
            existing={existing}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSaved={(product) => void saved(editing ? `«${product.name}» quedó actualizado.` : `«${product.name}» quedó creado en el catálogo.`)}
          />
        </Modal>
      )}
      {deactivating && (
        <DeactivateDialog
          product={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={(product) => void saved(`«${product.name}» quedó inactivo. Sus cifras e historial se conservan.`)}
        />
      )}
    </AppShell>
  );
}

function ProductRow({ product, onEdit, onDeactivate }: { product: Product; onEdit: () => void; onDeactivate: () => void }) {
  const unit = unitLabel(product.unit);
  const details = [product.commercialName, product.activeIngredient].filter(Boolean).join(' · ');
  return (
    <tr data-testid={`product-${product.name}`}>
      <td className="px-5 py-3">
        <p className="text-base font-semibold text-slate-900">{product.name}</p>
        {details && <p className="text-xs text-slate-500">{details}</p>}
      </td>
      <td className="px-5 py-3 text-slate-700">
        {unit.text}
        {!unit.linkable && <span className="ml-2 text-xs text-amber-700">no vinculable a cifras colectivas</span>}
      </td>
      <td className="px-5 py-3 text-slate-700">{product.category ?? <span className="text-slate-400">—</span>}</td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onEdit}>
            Editar
          </button>
          <button type="button" className={secondaryButtonClass} onClick={onDeactivate}>
            Inactivar
          </button>
        </div>
      </td>
    </tr>
  );
}

function DeactivateDialog({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: (product: Product) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await productsService.deactivate(product.id));
    } catch (err) {
      setError(productError(err, 'No fue posible inactivar el producto.'));
      setBusy(false);
    }
  };
  return (
    <Modal title={`Inactivar «${product.name}»`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          El producto queda marcado como inactivo. No se borra: sus cifras publicadas, sus equivalencias y su historial se
          conservan.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={dangerButtonClass} disabled={busy} onClick={() => void submit()}>
            {busy ? 'Inactivando…' : 'Confirmar inactivación'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
