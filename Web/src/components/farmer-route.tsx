import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/use-auth';
import { COLLECTIVE_PATHS, homePathFor } from '../lib/navigation';

/**
 * F10-SEC-02 (#45/#81): pantallas legacy de operación privada (inventario,
 * compras, cola de sync, parcelas, aplicaciones, reportes por agricultor).
 * Sólo el AGRICULTOR, sobre sus propios registros; DIRECTIVA y ADMINISTRADOR
 * vuelven a su vista colectiva (ADR-003: el rol institucional no da acceso a
 * operaciones privadas). Es una ayuda de navegación: el servidor responde 403.
 */
export function FarmerRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'AGRICULTOR') return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}

/**
 * La pantalla heredada `/directiva` ejecutaba compras conjuntas y pagos. El
 * camino vigente es el borrador de propuesta sin efectos; la página se conserva
 * en el código para la transición, pero la ruta ya no la muestra.
 */
export function LegacyDirectivaRedirect() {
  return <Navigate to={COLLECTIVE_PATHS.proposals} replace />;
}
