import { Navigate, useLocation } from 'react-router-dom';

/**
 * Redirección de una ruta antigua a su contenedor nuevo (rediseño 2026-11-10,
 * contrato §2): `Navigate replace` que conserva la cadena de consulta actual
 * (p. ej. `?campaign=<uuid>`) y añade o sobrescribe las claves de `set`
 * (p. ej. `{ vista: 'estimacion' }`). Conserva también el fragmento (`#…`).
 * No cambia permisos: la guarda va en la ruta de destino.
 */
export function RedirectWithQuery({ to, set }: { to: string; set?: Record<string, string> }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(set ?? {})) params.set(key, value);
  const search = params.toString();
  return <Navigate to={{ pathname: to, search: search ? `?${search}` : '', hash: location.hash }} replace />;
}
