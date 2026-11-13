import { Navigate, useNavigate } from 'react-router-dom';
import { Button, ICON, Icon } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { homePathFor, isCollectiveRole } from '../lib/navigation';

/** Texto del aviso (decisión del autor del 2026-11-12: la Web es sólo de Directiva y Administración). */
export const WEB_NOT_FOR_FARMERS_TITLE = 'Esta cuenta utiliza la aplicación móvil.';
export const WEB_NOT_FOR_FARMERS_TEXT = 'La Web está disponible para Directiva y Administración.';

/**
 * Pantalla para una cuenta que no es de Directiva ni de Administración (el
 * AGRICULTOR usa sólo la app móvil). No hay menú, datos ni consultas
 * institucionales: sólo el aviso y la salida. Cerrar la sesión de la Web no
 * deshabilita la cuenta ni afecta a la app.
 */
export function WebNotForFarmersPage() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isCollectiveRole(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return (
    <main className="ui-gutter flex min-h-dvh items-center justify-center bg-ink py-10">
      {/* Lámina 02: tarjeta blanca sobre fondo oscuro; sin menú, sin datos y sin enlace de descarga. */}
      <section aria-labelledby="web-not-for-farmers" className="w-full max-w-lg rounded-[28px] bg-surface px-6 py-9 text-center shadow-raised sm:px-12 sm:py-11">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-lime text-ink" aria-hidden="true">
          <Icon d={ICON.sprout} className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <h1 id="web-not-for-farmers" className="mt-5 text-balance text-3xl font-extrabold leading-tight text-ink">
          {WEB_NOT_FOR_FARMERS_TITLE}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">{WEB_NOT_FOR_FARMERS_TEXT}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>Cambiar de cuenta</Button>
          <Button variant="secondary" onClick={() => void logout()}>
            Cerrar sesión
          </Button>
        </div>
      </section>
    </main>
  );
}
