import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/use-auth';
import { isCollectiveRole } from '../lib/navigation';
import { identificationService } from '../services/identification.service';
import { IDENTIFICATION_CHANGED_EVENT, IdentificationPendingContext } from './identification-pending';

/**
 * Pide `GET /catalog/identification-requests?status=PENDING` una vez por sesión
 * de Directiva o Administración y otra tras cada `notifyIdentificationChanged()`.
 * Otro rol (o sin sesión) no hace ninguna llamada. Si la llamada falla, el
 * recuento queda en `null` (sin insignia), nunca en 0.
 */
export function IdentificationPendingProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  // El recuento queda atado a la cuenta que lo pidió: otra sesión no ve el de la anterior.
  const [result, setResult] = useState<{ userId: string; pending: number | null } | null>(null);
  const [version, setVersion] = useState(0);
  const allowed = !isLoading && Boolean(user) && isCollectiveRole(user?.role);
  const userId = user?.id;

  useEffect(() => {
    const onChange = () => setVersion((value) => value + 1);
    window.addEventListener(IDENTIFICATION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(IDENTIFICATION_CHANGED_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    const load = async () => {
      let pending: number | null;
      try {
        pending = (await identificationService.list('PENDING')).length;
      } catch {
        // Sin respuesta no hay insignia: un error nunca es «0».
        pending = null;
      }
      if (alive && userId) setResult({ userId, pending });
    };
    void load();
    return () => {
      alive = false;
    };
  }, [allowed, userId, version]);

  return <IdentificationPendingContext.Provider value={{ pending: allowed && result && result.userId === userId ? result.pending : null }}>{children}</IdentificationPendingContext.Provider>;
}
