import { SubstitutionPermissionsPanel, type SubstitutionPermissionsPanelProps } from '../components/b/substitution-permissions';

/**
 * P-A A1 (§12): el permiso del sindicato «Sustituir responsable». Desde el
 * rediseño v2 el componente vive en `components/b/substitution-permissions.tsx`
 * (U.4: Usuarios lo incrusta en modo `manage`; Compras conjuntas lo consulta en
 * modo `read` desde su franja). Este nombre se conserva para los consumidores
 * anteriores: por defecto, modo `manage` (los controles dependen de `can_grant`).
 */
export function SubstitutionPermissionsSection(props: SubstitutionPermissionsPanelProps) {
  return <SubstitutionPermissionsPanel {...props} />;
}
