import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EstimationCopyView } from '../components/estimation-copy-view';
import { buttonClassFor, Card, DataState, ICON, Icon } from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { contextBelongsTo, currentContext, isInstitutional, readableCopies, type StoredCopy } from '../lib/estimation-copy';
import { COLLECTIVE_PATHS } from '../lib/navigation';

/** Sin copia legible: o no hay ninguna para esta sesión (2) o la sesión que la guardó ya no está (3). Lámina 27. */
type Empty = 'none' | 'closed';

/**
 * F12-EST-07-WEB (#180): lectura sin conexión de la copia descargada, también
 * tras recargar la PWA, cuando la sesión no puede comprobarse con el servidor.
 * No pide nada al servidor. Sólo muestra las copias del contexto local vigente,
 * que una sesión institucional abrió en este navegador y que no se ha cerrado
 * ni invalidado. Sin ese contexto, o con una sesión en memoria de otra
 * identidad, sindicato o rol, no muestra nada, aunque queden copias en IndexedDB.
 *
 * Rediseño v2 (lámina 27): fuera del armazón, con la marca y «Volver a la
 * estimación». Tres estados: (1) copia legible, (2) sin copia para esta sesión
 * y (3) sesión cerrada o de otra persona. Para distinguir (2) de (3) sólo se
 * mira si hay un contexto local vigente y si es de la sesión en memoria; nunca
 * se lee ni se muestra una copia ajena.
 */
export function EstimationCopyPage() {
  const { user, isLoading } = useAuth();
  const [copies, setCopies] = useState<StoredCopy[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    let alive = true;
    readableCopies(user ? { userId: user.id, tenantId: user.tenantId, role: user.role } : null)
      .then((found) => alive && setCopies(found))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [user, isLoading]);

  const empty: Empty | null = copies !== null && copies.length === 0 ? emptyKind(user) : null;
  const owner = copies?.[0]?.owner ?? null;
  return (
    <main className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-lime text-ink" aria-hidden="true">
              <Icon d={ICON.sprout} className="h-6 w-6" strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-xl font-bold text-ink">Agrocuentas</p>
              <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
                Consulta sin conexión{owner ? ` · sesión de ${owner.name} en este navegador` : ''}
              </p>
            </div>
          </div>
          <Link className={buttonClassFor('secondary')} to={user ? COLLECTIVE_PATHS.estimation : '/login'}>
            {user ? 'Volver a la estimación' : 'Ir a Ingresar'}
          </Link>
        </header>
        {failed && (
          <Card testId="copy-unreadable">
            <DataState state="error" title="No se pudo leer la copia" description="No fue posible leer la copia de este navegador. No se muestra ninguna cifra." />
          </Card>
        )}
        {empty === 'none' && (
          <Card testId="copy-none">
            <DataState
              state="empty"
              title="No hay ninguna copia guardada"
              description="En este navegador no se guardó ninguna estimación para esta sesión. Con conexión, entre a Estimación del consumo y elija «Guardar copia». Sin conexión no se muestra ninguna cifra."
            />
          </Card>
        )}
        {empty === 'closed' && (
          <Card testId="copy-none">
            <DataState
              state="forbidden"
              title="La copia ya no se puede leer"
              description="No hay una copia accesible para esta sesión: se guardó para otra sesión, o esa sesión ya se cerró. No se muestra ninguna cifra. Ingrese con conexión para ver la estimación."
            />
          </Card>
        )}
        {copies?.map((copy, index) => <EstimationCopyView key={copy.key} copy={copy} headingLevel={index === 0 ? 1 : 2} />)}
        {(empty || failed || !copies) && <h1 className="sr-only">Estimación guardada</h1>}
        <p className="text-sm text-ink-muted">Esta página sólo lee la copia guardada en este navegador. Para generar, actualizar o exportar una estimación hace falta conexión.</p>
      </div>
    </main>
  );
}

/** (3) si no hay contexto local vigente o no es de la sesión en memoria (o el rol no es institucional); si no, (2). */
function emptyKind(user: { id: string; tenantId: string; role: string } | null): Empty {
  const context = currentContext();
  if (!context) return 'closed';
  if (user && (!isInstitutional(user.role) || !contextBelongsTo(context, { userId: user.id, tenantId: user.tenantId }))) return 'closed';
  return 'none';
}
