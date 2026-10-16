import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/use-auth';
import { homePathFor, isCollectiveRole } from '../lib/navigation';

/**
 * Rutas colectivas F07: sólo DIRECTIVA y ADMINISTRADOR. Es una ayuda de
 * navegación; la autorización real (rol y tenant) la decide el servidor.
 */
export function CollectiveRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isCollectiveRole(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return <>{children}</>;
}
