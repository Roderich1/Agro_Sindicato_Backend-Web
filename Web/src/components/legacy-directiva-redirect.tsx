import { RedirectWithQuery } from './redirect-with-query';
import { COLLECTIVE_PATHS } from '../lib/navigation';

/**
 * La pantalla heredada `/directiva` ejecutaba compras conjuntas y pagos. El
 * camino vigente es el borrador de propuesta sin efectos; la ruta lleva a él y
 * conserva la consulta (p. ej. `?campaign=`), como las demás rutas antiguas.
 */
export function LegacyDirectivaRedirect() {
  return <RedirectWithQuery to={COLLECTIVE_PATHS.proposals} />;
}
