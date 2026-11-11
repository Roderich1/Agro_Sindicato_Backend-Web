import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { PageHeader, SegmentedControl } from '../components/ui';
import { CollectiveTrendsView } from './collective-trends.page';
import { EstimationView } from './estimation.page';

type View = 'tendencias' | 'estimacion';

const VIEWS: { value: View; label: string }[] = [
  { value: 'tendencias', label: 'Histórico sellado' },
  { value: 'estimacion', label: 'Estimación del consumo' },
];

/**
 * «Histórico y estimaciones» (`/colectivo/historico`, rediseño sesión C,
 * 2026-11-10): un contenedor con dos vistas elegidas por `?vista=`
 * (`tendencias` por defecto, o `estimacion`). Cambiar de vista conserva los
 * demás parámetros (p. ej. `?campaign=`). Cada vista conserva sus reglas: el
 * histórico sólo muestra versiones selladas y la estimación es una referencia
 * aparte; abrir cualquiera de las dos sólo consulta (no pide estimaciones ni
 * descargas). La guarda de ruta (`CollectiveRoute`) la pone `App.tsx`.
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
        <PageHeader
          title="Histórico y estimaciones"
          subtitle="Las cifras selladas de campañas anteriores y, aparte, la estimación del consumo que calcula el servidor. No se suman ni se mezclan."
          actions={<SegmentedControl label="Vista" testId="history-view" options={VIEWS} value={view} onChange={choose} />}
        />
        {view === 'tendencias' ? <CollectiveTrendsView headingLevel={2} /> : <EstimationView headingLevel={2} />}
      </div>
    </AppShell>
  );
}
