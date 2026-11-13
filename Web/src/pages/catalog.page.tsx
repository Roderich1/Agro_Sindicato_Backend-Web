import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { useIdentificationPending } from '../contexts/identification-pending';
import { ProductIdentificationView } from './product-identification.page';
import { ProductReconciliationView } from './product-reconciliation.page';
import { ProductsView } from './products.page';

type View = 'productos' | 'equivalencias' | 'identificacion';

const VIEWS: { value: View; label: string }[] = [
  { value: 'productos', label: 'Productos' },
  { value: 'equivalencias', label: 'Nombres equivalentes' },
  { value: 'identificacion', label: 'Por identificar' },
];

const TAB_TITLE: Record<View, string> = {
  productos: 'Catálogo',
  equivalencias: 'Nombres equivalentes',
  identificacion: 'Por identificar',
};

const isView = (value: string | null): value is View => VIEWS.some((option) => option.value === value);

/**
 * Catálogo (`/colectivo/catalogo`, láminas 21–24, 39 y 47): un contenedor con
 * tres vistas elegidas por `?vista=` (`productos` por defecto,
 * `equivalencias` = «Nombres equivalentes» o `identificacion` = «Por
 * identificar», E1 §6), que conserva los demás parámetros al cambiar.
 *
 * Rediseño v2 (sesión C, 2026-11-13): en escritorio el submenú del armazón
 * (Catálogo ▸ Productos / Nombres equivalentes / Por identificar) elige la
 * vista y sustituye al antiguo `SegmentedControl`; en teléfono y tableta, una
 * fila de pestañas bajo la cabecera (lámina 39) hace lo mismo, con el recuento
 * de «Por identificar» que publica el armazón (sin dato no hay número). Crear,
 * editar, inactivar, unir, separar e identificar conservan su confirmación
 * humana; abrir una vista sólo consulta. La guarda de ruta (`CollectiveRoute`)
 * la pone `App.tsx`.
 */
export function CatalogPage() {
  const [params] = useSearchParams();
  const requested = params.get('vista');
  const view: View = isView(requested) ? requested : 'productos';
  const pending = useIdentificationPending();
  const searchFor = (next: View) => {
    const query = new URLSearchParams(params);
    query.set('vista', next);
    return `?${query.toString()}`;
  };

  const nav = (
    <nav aria-label="Vistas del catálogo" className="lg:hidden" data-testid="catalog-view">
      <ul className="flex flex-wrap gap-2">
        {VIEWS.map((option) => {
          const current = option.value === view;
          const count = option.value === 'identificacion' && pending !== null && pending > 0 ? pending : null;
          return (
            <li key={option.value}>
              <Link
                to={{ search: searchFor(option.value) }}
                aria-current={current ? 'page' : undefined}
                className={`ui-press inline-flex min-h-11 items-center rounded-full px-4 py-2 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  current ? 'bg-ink text-white' : 'border border-line bg-surface text-ink hover:border-ink'
                }`}
              >
                {option.label}
                {count !== null && (
                  <>
                    {' · '}
                    <span className="tabular-nums">{count}</span>
                    <span className="sr-only"> pendientes</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const [holderRef, holderStyle] = useKeptHeight(view);

  return (
    <AppShell title={TAB_TITLE[view]} section="Catálogo">
      <div ref={holderRef} style={holderStyle}>
      {view === 'productos' ? (
        <ProductsView title="Catálogo" nav={nav} equivalencesTo={{ search: searchFor('equivalencias') }} />
      ) : view === 'equivalencias' ? (
        <ProductReconciliationView title="Catálogo" nav={nav} />
      ) : (
        <ProductIdentificationView nav={nav} />
      )}
      </div>
    </AppShell>
  );
}

/**
 * Al cambiar de `?vista=`, la vista nueva empieza cargando y mide menos que la
 * anterior: la página se acortaría y el navegador perdería la posición de
 * desplazamiento. Se mantiene el alto de la vista anterior como mínimo hasta
 * que la nueva lo alcanza o pasan unos segundos. Sólo presentación.
 */
function useKeptHeight(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const previousKey = useRef(key);
  const [minHeight, setMinHeight] = useState<number | null>(null);

  // Antes de pintar la vista nueva: fija como mínimo el último alto medido.
  useLayoutEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    if (last.current > 0) setMinHeight(last.current);
  }, [key]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const content = node.scrollHeight;
      last.current = content;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (minHeight === null) return undefined;
    const node = ref.current;
    const release = () => setMinHeight(null);
    const timer = window.setTimeout(release, 4000);
    let observer: ResizeObserver | null = null;
    if (node && typeof ResizeObserver !== 'undefined') {
      const child = node.firstElementChild;
      observer = new ResizeObserver(() => {
        if (child && child.getBoundingClientRect().height >= minHeight) release();
      });
      if (child) observer.observe(child);
    }
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [minHeight]);

  return [ref, minHeight !== null ? { minHeight } : undefined] as const;
}
