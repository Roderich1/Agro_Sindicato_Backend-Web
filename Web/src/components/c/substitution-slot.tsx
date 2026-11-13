import { useEffect, useState } from 'react';
import { SubstitutionPermissionsPanel } from '../b/substitution-permissions';

const WIDE = '(min-width: 1024px)';

/** Escritorio (lámina 31: tarjeta oscura) o teléfono y tableta (lámina 44: tarjeta blanca). */
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(WIDE);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

/**
 * Lugar del permiso «Sustituir responsable» en Usuarios (láminas 31 y 44, U.4).
 *
 * Integración del orquestador: el panel de la sesión B en modo gestión. Conceder
 * (con motivo y casilla) y retirar sólo aparecen si el servidor responde
 * `can_grant`, y el servidor revalida todo; la vista de lectura sigue en Compras
 * conjuntas.
 */
export function SubstitutionSlot({ userId }: { userId: string | null }) {
  const wide = useWide();
  return <SubstitutionPermissionsPanel userId={userId} mode="manage" tone={wide ? 'ink' : 'surface'} />;
}
