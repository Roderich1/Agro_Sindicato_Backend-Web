import { SubstitutionPermissionsHistoryPanel, type SubstitutionPermissionsHistoryPanelProps } from '../components/b/substitution-permissions';

/**
 * E4 §3.2: el permiso del sindicato «Sustituir responsable» ya no se gestiona;
 * sólo queda su historia de sólo lectura, plegada
 * (`components/b/substitution-permissions.tsx`). Este nombre se conserva para
 * los consumidores anteriores.
 */
export function SubstitutionPermissionsSection(props: SubstitutionPermissionsHistoryPanelProps) {
  return <SubstitutionPermissionsHistoryPanel {...props} />;
}
