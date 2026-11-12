import { Navigate, useNavigate } from 'react-router-dom';
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
    <main className="flex min-h-dvh items-center justify-center bg-[#f8faf4] px-4">
      <section aria-labelledby="web-not-for-farmers" className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 id="web-not-for-farmers" className="text-lg font-bold text-slate-900">
          {WEB_NOT_FOR_FARMERS_TITLE}
        </h1>
        <p className="mt-3 text-sm text-slate-600">{WEB_NOT_FOR_FARMERS_TEXT}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/login', { replace: true }))}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Cambiar de cuenta
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </main>
  );
}
