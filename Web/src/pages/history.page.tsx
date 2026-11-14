import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { SegmentedControl } from '../components/ui';
import { CollectiveTrendsView } from './collective-trends.page';
import { EstimationView } from './estimation.page';

type View = 'tendencias' | 'estimacion';

const VIEWS: { value: View; label: string }[] = [
  { value: 'tendencias', label: 'Histórico sellado' },
  { value: 'estimacion', label: 'Estimación del consumo' },
];

/**
 * «Histórico y estimaciones» (`/colectivo/historico`): un contenedor con dos
 * vistas elegidas por `?vista=` (`tendencias` por defecto, o `estimacion`).
 * Cambiar de vista conserva los demás parámetros (p. ej. `?campaign=`). Cada
 * vista conserva sus reglas: el histórico sólo muestra versiones selladas y la
 * estimación es una referencia aparte; abrir cualquiera de las dos sólo
 * consulta (no pide estimaciones ni descargas). La guarda de ruta
 * (`CollectiveRoute`) la pone `App.tsx`.
 *
 * Rediseño v2 (láminas 25, 26 y 40): cada vista lleva su propio título (`h1`).
 * En escritorio se elige la vista en el submenú «Histórico» de la barra
 * lateral; por debajo de 1024 px (sin barra lateral) aparecen las dos píldoras.
 */
export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'estimacion' ? 'estimacion' : 'tendencias';
  const choose = (next: View) =>
    setParams((prev) => {
      const query = new URLSearchParams(prev);
      query.set('vista', next);
      return query;
    });
  return (
    <AppShell title="Histórico y estimaciones" section="Colectivo">
      <div className="space-y-5">
        <div className="lg:hidden">
          <SegmentedControl label="Vista" hideLabel testId="history-view" options={VIEWS} value={view} onChange={choose} />
        </div>
        {view === 'tendencias' ? <CollectiveTrendsView /> : <EstimationView />}
      </div>
    </AppShell>
  );
}
