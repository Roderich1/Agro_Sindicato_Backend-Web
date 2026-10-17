import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';
import { homePathFor, isCollectiveRole, legacyFarmerWebEnabled } from '../lib/navigation';

/**
 * F07-WEB-01 (#23): la Web es online-first para la Directiva y el
 * Administrador del sindicato. Otro rol no recibe menú ni datos: sólo este
 * aviso y la salida. El registro individual se hace en la app móvil.
 */
export function WebNotForFarmersPage() {
  const { user, isLoading, logout } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (isCollectiveRole(user.role) || legacyFarmerWebEnabled()) return <Navigate to={homePathFor(user.role)} replace />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8faf4] px-4">
      <section aria-labelledby="web-not-for-farmers" className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 id="web-not-for-farmers" className="text-lg font-bold text-slate-900">
          Esta Web es para la Directiva y el Administrador
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Sus compras, su inventario, sus aplicaciones y sus necesidades se registran en la app móvil de Agrocuentas,
          también sin conexión. Desde la Web no se registran ni se guardan operaciones para después.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-6 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
