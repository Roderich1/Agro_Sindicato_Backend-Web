import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import { Link, type To } from 'react-router-dom';
import { AppShell, Modal } from '../components/app-shell';
import { ProductForm } from '../components/product-form';
import {
  Button,
  Collapsible,
  DataState,
  DataTable,
  dangerButtonClass,
  inputClass,
  labelClass,
  Notice,
  PageHeader,
  Section,
  SegmentedControl,
  secondaryButtonClass,
} from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { groupProducts, matchesProduct, type ProductGrouping } from '../lib/product-text';
import { productError } from '../lib/product-text';
import { productsService } from '../services/inventory.service';
import type { Product } from '../types/inventory';

/** Unidades que el servidor vincula a una unidad base (mL o g). Otras quedan fuera de las cifras colectivas. */
function unitLabel(unit: string): { text: string; linkable: boolean } {
  const upper = unit.trim().toUpperCase();
  if (upper === 'L') return { text: 'L', linkable: true };
  if (upper === 'KG') return { text: 'kg', linkable: true };
  return { text: unit, linkable: false };
}

const GROUPINGS: { value: ProductGrouping; label: string }[] = [
  { value: 'category', label: 'Categoría' },
  { value: 'unit', label: 'Unidad' },
  { value: 'none', label: 'Sin agrupar' },
];

const count = (n: number, one: string, many: string) => `${new Intl.NumberFormat('es-BO').format(n)} ${n === 1 ? one : many}`;

/**
 * Gestión → Productos (defensa, 2026-11-05): el catálogo del sindicato. La
 * Directiva crea los productos canónicos; los agricultores declaran sobre esta
 * lista y los nombres que llegan distintos se asocian en «Equivalencias de
 * productos». Una sola acción primaria («Nuevo producto»); editar e inactivar
 * son secundarias. Inactivar no borra: conserva cifras, equivalencias e
 * historial. Ruta protegida por `CollectiveRoute`; el servidor autoriza.
 *
 * Rediseño (sesión C, 2026-11-10): el cuerpo es `ProductsView`, que también usa
 * el contenedor «Catálogo y equivalencias» (`?vista=productos`). Búsqueda por
 * nombre, nombre comercial o ingrediente activo sin distinguir mayúsculas ni
 * tildes, y agrupación por categoría o unidad con los datos que ya existen. No
 * hay reactivación ni historial de cambios del catálogo en el sistema: no se
 * simulan.
 */
export function ProductsPage() {
  return (
    <AppShell title="Productos" section="Gestión">
      <ProductsView />
    </AppShell>
  );
}

export function ProductsView({ headingLevel = 1, equivalencesTo = `${COLLECTIVE_PATHS.catalog}?vista=equivalencias` }: { headingLevel?: 1 | 2; equivalencesTo?: To }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deactivating, setDeactivating] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<ProductGrouping>('category');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await productsService.list());
      setError(null);
    } catch (err) {
      setProducts([]);
      setError({ message: productError(err, 'No fue posible cargar los productos.'), forbidden: axios.isAxiosError(err) && err.response?.status === 403 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const active = products.filter((product) => product.isActive);
  const inactive = products.filter((product) => !product.isActive);
  const shownActive = active.filter((product) => matchesProduct(product, query));
  const shownInactive = inactive.filter((product) => matchesProduct(product, query));
  const existing = products.map((product) => ({ id: product.id, name: product.name, isActive: product.isActive }));
  const filtered = query.trim().length > 0;

  const saved = async (text: string) => {
    setCreating(false);
    setEditing(null);
    setDeactivating(null);
    setMessage(text);
    await load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        headingLevel={headingLevel}
        title="Productos"
        subtitle={
          <>
            Catálogo de productos del sindicato. Los agricultores declaran sobre esta lista; los nombres que llegan distintos
            se asocian a un producto en{' '}
            <Link to={equivalencesTo} className="font-semibold text-emerald-700 underline">
              Ver equivalencias
            </Link>
            .
          </>
        }
        actions={<Button onClick={() => setCreating(true)}>Nuevo producto</Button>}
      />
      {message && <Notice kind="ok">{message}</Notice>}
      {error ? (
        <Section>
          <DataState compact state={error.forbidden ? 'forbidden' : 'error'} description={error.message} onRetry={error.forbidden ? undefined : () => void load()} />
        </Section>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4" data-testid="catalog-filters">
            <div className="w-full min-w-0 sm:w-96">
              <label className={labelClass} htmlFor="product-search">
                Buscar producto
              </label>
              <input
                id="product-search"
                type="search"
                className={inputClass}
                value={query}
                placeholder="Nombre, nombre comercial o ingrediente activo"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <SegmentedControl label="Agrupar por" testId="catalog-grouping" options={GROUPINGS} value={grouping} onChange={setGrouping} />
          </div>

          {loading ? (
            <Section>
              <DataState state="loading" compact />
            </Section>
          ) : active.length === 0 ? (
            <Section title="Productos activos">
              <DataState state="empty" title="Todavía no hay productos activos" description="Cree el primero con «Nuevo producto»." />
            </Section>
          ) : shownActive.length === 0 ? (
            <Section title="Productos activos">
              <DataState
                state="no-match"
                description={`Ningún producto activo coincide con «${query.trim()}» (nombre, nombre comercial o ingrediente activo).`}
                onClearFilters={() => setQuery('')}
                testId="products-no-match"
              />
            </Section>
          ) : (
            <section className="space-y-3" aria-label="Productos activos">
              <p className="text-sm text-slate-700" data-testid="products-count">
                {filtered
                  ? `${count(shownActive.length, 'producto activo coincide', 'productos activos coinciden')} con «${query.trim()}» (de ${new Intl.NumberFormat('es-BO').format(active.length)}).`
                  : `${count(active.length, 'producto activo', 'productos activos')}.`}
              </p>
              {groupProducts(shownActive, grouping).map((group) => (
                <Section key={group.key} title={group.label} note={count(group.products.length, 'producto', 'productos')} testId={`group-${group.key}`}>
                  <DataTable caption={`Productos: ${group.label}`}>
                    <thead>
                      <tr className="max-sm:hidden">
                        <th>Nombre</th>
                        <th>Unidad</th>
                        <th>Categoría</th>
                        <th className="ui-num">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.products.map((product) => (
                        <ProductRow key={product.id} product={product} onEdit={() => setEditing(product)} onDeactivate={() => setDeactivating(product)} />
                      ))}
                    </tbody>
                  </DataTable>
                </Section>
              ))}
            </section>
          )}

          <Collapsible title={`Ver inactivos (${shownInactive.length})`} label="Productos inactivos" testId="inactive-products">
            <p className="px-5 pt-3 text-xs text-slate-600">
              Un producto inactivo no se borra: sus cifras, equivalencias e historial se conservan. El sistema no ofrece
              reactivar un producto ni guarda un historial de cambios del catálogo (sólo la fecha de la última
              modificación).
            </p>
            {shownInactive.length === 0 ? (
              <DataState state={filtered && inactive.length > 0 ? 'no-match' : 'empty'} compact title={filtered && inactive.length > 0 ? 'Ningún inactivo coincide' : 'No hay productos inactivos'} description="" />
            ) : (
              <DataTable caption="Productos inactivos" minWidth={480}>
                <tbody>
                  {shownInactive.map((product) => (
                    <tr key={product.id} data-testid={`inactive-${product.name}`}>
                      <td className="min-w-40 font-medium text-slate-700 [overflow-wrap:anywhere]">{product.name}</td>
                      <td className="text-slate-600">{unitLabel(product.unit).text}</td>
                      <td className="text-slate-600">{product.category ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs text-slate-500">modificado el {fmtDateTime(product.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Collapsible>
        </>
      )}

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
    </div>
  );
}

function ProductRow({ product, onEdit, onDeactivate }: { product: Product; onEdit: () => void; onDeactivate: () => void }) {
  const unit = unitLabel(product.unit);
  const details = [product.commercialName, product.activeIngredient].filter(Boolean).join(' · ');
  return (
    <tr className="max-sm:block max-sm:border-b max-sm:border-slate-200 max-sm:py-2" data-testid={`product-${product.name}`}>
      <td className="max-sm:block max-sm:border-0 max-sm:py-1 [overflow-wrap:anywhere] sm:min-w-52">
        <p className="text-base font-semibold text-slate-900">{product.name}</p>
        {details && <p className="text-xs text-slate-600">{details}</p>}
      </td>
      <td className="max-sm:block max-sm:border-0 max-sm:py-1 text-slate-700">
        {unit.text}
        {!unit.linkable && <span className="ml-2 text-xs text-amber-800">no vinculable a cifras colectivas</span>}
      </td>
      <td className="max-sm:block max-sm:border-0 max-sm:py-1 text-slate-700 max-sm:text-xs">{product.category ?? <span className="text-slate-500">—</span>}</td>
      <td className="ui-num max-sm:block max-sm:border-0 max-sm:py-1">
        <div className="flex gap-2 sm:justify-end">
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
        <p className="text-xs text-slate-600">El sistema no ofrece reactivarlo después.</p>
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
