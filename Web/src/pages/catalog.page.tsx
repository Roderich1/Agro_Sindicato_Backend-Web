import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { PageHeader, SegmentedControl } from '../components/ui';
import { ProductReconciliationView } from './product-reconciliation.page';
import { ProductsView } from './products.page';

type View = 'productos' | 'equivalencias';

const VIEWS: { value: View; label: string }[] = [
  { value: 'productos', label: 'Productos' },
  { value: 'equivalencias', label: 'Equivalencias' },
];

/**
 * «Catálogo y equivalencias» (`/colectivo/catalogo`, rediseño sesión C,
 * 2026-11-10): un contenedor con dos vistas elegidas por `?vista=`
 * (`productos` por defecto, o `equivalencias`), que conserva los demás
 * parámetros al cambiar. Crear, editar, inactivar, asociar y deshacer
 * conservan su confirmación humana; abrir una vista sólo consulta. La guarda
 * de ruta (`CollectiveRoute`) la pone `App.tsx`.
 */
export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'equivalencias' ? 'equivalencias' : 'productos';
  const queryFor = (next: View) => {
    const query = new URLSearchParams(params);
    query.set('vista', next);
    return query;
  };
  return (
    <AppShell title="Catálogo y equivalencias" section="Gestión">
      <div className="space-y-5">
        <PageHeader
          title="Catálogo y equivalencias"
          subtitle="Los productos del sindicato y las denominaciones que se agrupan bajo cada uno."
          actions={<SegmentedControl label="Vista" testId="catalog-view" options={VIEWS} value={view} onChange={(next) => setParams(queryFor(next))} />}
        />
        {view === 'productos' ? (
          <ProductsView headingLevel={2} equivalencesTo={{ search: `?${queryFor('equivalencias').toString()}` }} />
        ) : (
          <ProductReconciliationView headingLevel={2} />
        )}
      </div>
    </AppShell>
  );
}
