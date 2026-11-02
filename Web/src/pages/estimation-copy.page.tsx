import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EstimationCopyView } from '../components/estimation-copy-view';
import { useAuth } from '../hooks/use-auth';
import { listCopies, type StoredCopy } from '../lib/estimation-copy';
import { COLLECTIVE_PATHS } from '../lib/navigation';

/**
 * F12-EST-07-WEB (#180): lectura sin conexión de la copia descargada, también
 * tras recargar la PWA, cuando la sesión no puede comprobarse. No pide nada al
 * servidor: sólo lee IndexedDB. Con una sesión en curso, sólo sus copias; sin
 * ella, las que quedan en el navegador, que sólo pueden ser de la última
 * identidad que no cerró sesión (entrar con otra borra las demás).
 */
export function EstimationCopyPage() {
  const { user, isLoading } = useAuth();
  const [copies, setCopies] = useState<StoredCopy[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    let alive = true;
    listCopies(user ? { userId: user.id, tenantId: user.tenantId } : null)
      .then((found) => alive && setCopies(found))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [user, isLoading]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Agrocuentas · consulta sin conexión</p>
        <h1 className="text-xl font-bold text-slate-900">Estimación del consumo descargada</h1>
        <p className="text-sm text-slate-600">
          Esta página sólo lee la copia guardada en este navegador. Para generar, actualizar o exportar una estimación hace falta conexión.
        </p>
      </header>
      {failed && (
        <p className="text-sm text-red-700" data-testid="copy-unreadable">
          No fue posible leer la copia de este navegador. No se muestra ninguna cifra.
        </p>
      )}
      {copies !== null && copies.length === 0 && (
        <p className="glass-card p-5 text-sm text-slate-700" data-testid="copy-none">
          No hay una estimación descargada en este navegador. Sin conexión no se muestra ninguna cifra.
        </p>
      )}
      {copies?.map((copy) => <EstimationCopyView key={copy.key} copy={copy} />)}
      <p className="text-sm">
        <Link className="font-semibold text-emerald-700 underline" to={user ? COLLECTIVE_PATHS.estimation : '/login'}>
          {user ? 'Volver a la estimación (requiere conexión)' : 'Iniciar sesión (requiere conexión)'}
        </Link>
      </p>
    </main>
  );
}
