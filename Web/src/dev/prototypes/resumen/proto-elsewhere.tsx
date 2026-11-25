import { Link, useLocation } from 'react-router-dom';
import { AppShell } from '../../../components/app-shell';
import { DataState } from '../../../components/ui';
import { PROTO_PATH } from './variants';

export function Elsewhere() {
  const location = useLocation();
  return (
    <AppShell title="Prototipo" section="Prototipo · sólo desarrollo">
      <DataState
        state="empty"
        title="Esta ruta no forma parte del prototipo"
        description={`«${location.pathname}» pertenece a la aplicación real, que no cambia en este bloque.`}
        action={
          <Link to={`${PROTO_PATH}${location.search}`} className="font-semibold text-brand-800 underline underline-offset-2">
            Volver a los prototipos del Resumen
          </Link>
        }
      />
    </AppShell>
  );
}
