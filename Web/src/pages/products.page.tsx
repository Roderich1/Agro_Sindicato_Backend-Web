import axios from 'axios';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, type To } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { RowLink, UnitBadge } from '../components/c/bits';
import { unitInfo } from '../components/c/unit';
import { ViewHeader } from '../components/c/view-header';
import { ProductForm } from '../components/product-form';
import { Button, ConfirmDialog, DataState, Dialog, linkClass, Notice, SearchInput, SegmentedControl, surfaceClass } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { fmtDateTime } from '../lib/collective-text';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { groupProducts, matchesProduct, productError, type ProductGrouping } from '../lib/product-text';
import { productsService } from '../services/inventory.service';
import type { Product } from '../types/inventory';

const GROUPINGS: { value: ProductGrouping; label: string }[] = [
  { value: 'category', label: 'Por categoría' },
  { value: 'unit', label: 'Por unidad' },
  { value: 'none', label: 'Sin agrupar' },
];

const NUMBER = new Intl.NumberFormat('es-BO');
const count = (n: number, one: string, many: string) => `${NUMBER.format(n)} ${n === 1 ? one : many}`;

/**
 * Catálogo → Productos (láminas 21 y 39; diálogos 30.4, 30.5 y 34.4). El
 * catálogo del sindicato: la Directiva crea los productos canónicos, los
 * agricultores declaran sobre esta lista y los nombres que llegan distintos se
 * unen en «Nombres equivalentes». Una sola acción primaria («Nuevo producto»);
 * editar e inactivar son acciones de cada fila. Inactivar no borra: conserva
 * cifras, equivalencias e historial, y no hay reactivación (H-19): los
 * inactivos se ven en una lista de sólo lectura. Ruta protegida por
 * `CollectiveRoute`; el servidor autoriza.
 *
 * Búsqueda por nombre, nombre comercial o ingrediente activo sin distinguir
 * mayúsculas ni tildes, y agrupación por categoría, unidad o sin agrupar, con
 * los datos que ya llegaron (`GET /inventory/products`, una llamada).
 */
export function ProductsPage() {
  return (
    <AppShell title="Productos" section="Catálogo">
      <ProductsView />
    </AppShell>
  );
}

export function ProductsView({
  headingLevel = 1,
  title = 'Productos',
  nav,
  equivalencesTo = `${COLLECTIVE_PATHS.catalog}?vista=equivalencias`,
}: {
  headingLevel?: 1 | 2;
  /** «Catálogo» dentro del contenedor; «Productos» en la ruta antigua. */
  title?: string;
  /** Pestañas de las vistas del catálogo (teléfono), bajo la cabecera. */
  nav?: ReactNode;
  equivalencesTo?: To;
}) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [dirty, setDirty] = useState(false);
  const [deactivating, setDeactivating] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<ProductGrouping>('category');
  const [showInactive, setShowInactive] = useState(false);
  const inactiveId = useId();

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

  const openCreate = useCallback(() => setCreating(true), []);

  const active = products.filter((product) => product.isActive);
  const inactive = products.filter((product) => !product.isActive);
  const shownActive = active.filter((product) => matchesProduct(product, query));
  const shownInactive = inactive.filter((product) => matchesProduct(product, query));
  const existing = products.map((product) => ({ id: product.id, name: product.name, isActive: product.isActive }));
  const filtered = query.trim().length > 0;
  const groups = groupProducts(shownActive, grouping);

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setDirty(false);
  };
  const saved = async (text: string) => {
    closeForm();
    setDeactivating(null);
    setMessage(text);
    await load();
  };

  return (
    <div className="space-y-5">
      <ViewHeader headingLevel={headingLevel} title={title} eyebrow={user?.tenant?.name} action={{ label: 'Nuevo producto', onClick: openCreate }} />
      {nav}
      {message && <Notice kind="ok">{message}</Notice>}
      {error ? (
        <div className={surfaceClass}>
          <DataState compact state={error.forbidden ? 'forbidden' : 'error'} description={error.message} onRetry={error.forbidden ? undefined : () => void load()} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center" data-testid="catalog-filters">
            <SearchInput
              id="product-search"
              label="Buscar producto"
              value={query}
              onChange={setQuery}
              placeholder="Buscar por nombre o ingrediente"
              enterKeyHint="search"
              inputMode="search"
              autoComplete="off"
              fieldClassName="w-full min-w-0 lg:w-[22rem]"
            />
            <SegmentedControl label="Agrupar" hideLabel testId="catalog-grouping" options={GROUPINGS} value={grouping} onChange={setGrouping} />
          </div>

          {loading ? (
            <div className={surfaceClass}>
              <DataState state="loading" compact />
            </div>
          ) : active.length === 0 ? (
            <div className={surfaceClass}>
              <DataState state="empty" title="Todavía no hay productos activos" description="Cree el primero con «Nuevo producto»." />
            </div>
          ) : shownActive.length === 0 ? (
            <div className={surfaceClass}>
              <DataState
                state="no-match"
                description={`Ningún producto activo coincide con «${query.trim()}» (nombre, nombre comercial o ingrediente activo).`}
                onClearFilters={() => setQuery('')}
                testId="products-no-match"
              />
            </div>
          ) : (
            <section className="space-y-3" aria-label="Productos activos">
              <p className="text-sm text-ink-muted">
                <span data-testid="products-count">
                  {filtered
                    ? `${count(shownActive.length, 'producto activo coincide', 'productos activos coinciden')} con «${query.trim()}» (de ${NUMBER.format(active.length)}).`
                    : `${count(active.length, 'producto activo', 'productos activos')}.`}
                </span>{' '}
                Los nombres que llegan distintos se unen en{' '}
                <Link to={equivalencesTo} className={linkClass}>
                  Nombres equivalentes
                </Link>
                .
              </p>
              <div className={`grid gap-4 ${groups.length > 1 ? 'xl:grid-cols-2' : ''} xl:items-start`}>
                {groups.map((group) => (
                  <ProductGroupCard
                    key={group.key}
                    groupKey={group.key}
                    title={grouping === 'none' ? 'Todos los productos' : group.label}
                    products={group.products}
                    grouping={grouping}
                    onEdit={setEditing}
                    onDeactivate={setDeactivating}
                  />
                ))}
              </div>
            </section>
          )}

          {!loading && (
            <section className="space-y-3" data-testid="inactive-products" aria-label="Productos inactivos">
              <Button variant="secondary" aria-expanded={showInactive} aria-controls={inactiveId} onClick={() => setShowInactive((open) => !open)}>
                {showInactive ? 'Ocultar productos inactivos' : 'Ver productos inactivos'} ({NUMBER.format(shownInactive.length)})
              </Button>
              {showInactive && (
                <div id={inactiveId} className={`${surfaceClass} px-5 py-4 sm:px-7`}>
                  <p className="text-sm leading-relaxed text-ink-muted">
                    Un producto inactivo no se borra: sus cifras, equivalencias e historial se conservan. Es una lista de sólo
                    lectura: el sistema no ofrece reactivar un producto ni guarda un historial de cambios del catálogo (sólo la
                    fecha de la última modificación).
                  </p>
                  {shownInactive.length === 0 ? (
                    <DataState
                      state={filtered && inactive.length > 0 ? 'no-match' : 'empty'}
                      compact
                      title={filtered && inactive.length > 0 ? 'Ningún inactivo coincide' : 'No hay productos inactivos'}
                      description=""
                    />
                  ) : (
                    <ul className="mt-2 divide-y divide-line" aria-label="Productos inactivos">
                      {shownInactive.map((product) => (
                        <li key={product.id} className="flex min-w-0 items-center gap-4 py-3" data-testid={`inactive-${product.name}`}>
                          <UnitBadge unit={product.unit} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-ink [overflow-wrap:anywhere]">{product.name}</p>
                            <p className="text-sm text-ink-muted">
                              {[product.category, `modificado el ${fmtDateTime(product.updatedAt)}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-ink">Inactivo</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {(creating || editing) && (
        <Dialog title={editing ? `Editar «${editing.name}»` : 'Nuevo producto'} onClose={closeForm} dirty={dirty} size="md">
          <ProductForm
            product={editing}
            existing={existing}
            onDirtyChange={setDirty}
            onCancel={closeForm}
            onSaved={(product) => void saved(editing ? `«${product.name}» quedó actualizado.` : `«${product.name}» quedó creado en el catálogo.`)}
          />
        </Dialog>
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

function ProductGroupCard({
  groupKey,
  title,
  products,
  grouping,
  onEdit,
  onDeactivate,
}: {
  groupKey: string;
  title: string;
  products: Product[];
  grouping: ProductGrouping;
  onEdit: (product: Product) => void;
  onDeactivate: (product: Product) => void;
}) {
  const headingId = useId();
  return (
    <section className={`${surfaceClass} min-w-0 px-5 py-5 sm:px-7`} aria-labelledby={headingId} data-testid={`group-${groupKey}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 border-b-2 border-ink pb-3">
        <h3 id={headingId} className="font-display text-xl font-bold text-ink [overflow-wrap:anywhere] sm:text-2xl">
          {title}
        </h3>
        <span className="text-sm text-ink-muted">{count(products.length, 'producto', 'productos')}</span>
      </div>
      <ul className="divide-y divide-line">
        {products.map((product) => (
          <ProductRow key={product.id} product={product} grouping={grouping} onEdit={() => onEdit(product)} onDeactivate={() => onDeactivate(product)} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ product, grouping, onEdit, onDeactivate }: { product: Product; grouping: ProductGrouping; onEdit: () => void; onDeactivate: () => void }) {
  const unit = unitInfo(product.unit);
  // Lo que distingue al producto: nombre comercial e ingrediente; si no hay, la unidad en palabras.
  const details = [product.commercialName, product.activeIngredient].filter(Boolean).join(' · ') || `Se mide en ${unit.long}`;
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 py-3.5" data-testid={`product-${product.name}`}>
      <UnitBadge unit={product.unit} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{product.name}</p>
        <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
          {details}
          {grouping !== 'category' && product.category && ` · ${product.category}`}
        </p>
        {!unit.linkable && <p className="text-xs font-semibold text-caution">no vinculable a cifras colectivas</p>}
      </div>
      <div className="ml-auto flex shrink-0 gap-1">
        <RowLink onClick={onEdit} aria-label={`Editar «${product.name}»`}>
          Editar
        </RowLink>
        <RowLink tone="muted" onClick={onDeactivate} aria-label={`Inactivar «${product.name}»`}>
          Inactivar
        </RowLink>
      </div>
    </li>
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
    <ConfirmDialog
      tone="danger"
      title={`Inactivar «${product.name}»`}
      confirmLabel="Inactivar producto"
      busy={busy}
      error={error}
      onConfirm={() => void submit()}
      onCancel={onClose}
    >
      <ul>
        <li>No se borra: sus cifras publicadas, sus equivalencias y su historial se conservan.</li>
        <li>Deja la lista de productos activos del catálogo.</li>
        <li>No se puede reactivar después.</li>
      </ul>
    </ConfirmDialog>
  );
}
