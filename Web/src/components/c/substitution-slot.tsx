import { SubstitutionPermissionsSection } from '../../pages/substitution-permissions-section';

/**
 * Lugar del permiso «Sustituir responsable» en Usuarios (láminas 31 y 44, U.4).
 *
 * La sesión B publica el componente en `components/b/` con un modo de gestión
 * (conceder con motivo y retirar, sólo con `can_grant`). Mientras no esté
 * integrado, aquí va el componente actual (`substitution-permissions-section`),
 * sin editarlo: ya concede con motivo obligatorio y retira, y el servidor
 * revalida todo. En la integración se cambia sólo esta línea.
 */
export function SubstitutionSlot({ userId }: { userId: string | null }) {
  return <SubstitutionPermissionsSection userId={userId} />;
}
