/**
 * F07-WEB-01 (#23): navegación institucional de DIRECTIVA y ADMINISTRADOR del
 * mismo tenant (ADR-003). Ocultar una ruta del menú no la protege: cada
 * endpoint colectivo comprueba rol y tenant en el servidor, y las rutas nuevas
 * usan `CollectiveRoute`.
 */
export const COLLECTIVE_ROLES = ['DIRECTIVA', 'ADMINISTRADOR'] as const;

export const COLLECTIVE_PATHS = {
  summary: '/colectivo/resumen',
  proposals: '/colectivo/propuestas',
  coverage: '/colectivo/cobertura',
  reconciliation: '/colectivo/reconciliacion',
} as const;

/**
 * F07-WEB-01 (#23), PHASE 5 de TRANSITION_PLAN.md: la Web deja de ser un
 * cliente operativo del agricultor. Sus pantallas legacy (inventario, compras,
 * parcelas, aplicaciones, calendario, reportes y la cola `/sync`) no se
 * borran, pero no se ofrecen. Rollback de la transición: compilar con
 * `VITE_LEGACY_FARMER_WEB=enabled` (o revertir el commit). El API no cambia:
 * el bloqueo de escrituras legacy es la PHASE 6 (#81).
 */
export function legacyFarmerWebEnabled(): boolean {
  return import.meta.env.VITE_LEGACY_FARMER_WEB === 'enabled';
}

/** Aviso para quien no es Directiva ni Administrador: la Web no es su cliente. */
export const WEB_NOT_FOR_FARMERS_PATH = '/sin-acceso-web';

export function isCollectiveRole(role: string | null | undefined): boolean {
  return (COLLECTIVE_ROLES as readonly string[]).includes(role ?? '');
}

/**
 * Pantalla inicial: la Directiva y el Administrador entran al resumen
 * colectivo; cualquier otro rol, al aviso (o al dashboard legacy si la
 * transición se revierte con el flag).
 */
export function homePathFor(role: string | null | undefined): string {
  if (isCollectiveRole(role)) return COLLECTIVE_PATHS.summary;
  return legacyFarmerWebEnabled() ? '/dashboard' : WEB_NOT_FOR_FARMERS_PATH;
}

/**
 * Menú congelado de DIRECTIVA/ADMINISTRADOR, en este orden. Las pantallas
 * legacy (inventario, parcelas, aplicaciones, compras, pagos, calendario,
 * reportes, cola offline, bitácora heredada) salen del menú; siguen existiendo
 * para la transición (#81) y su exposición se revisa en F10-SEC-02 (#45).
 */
export const COLLECTIVE_MENU: readonly string[] = [
  COLLECTIVE_PATHS.summary,
  COLLECTIVE_PATHS.proposals,
  COLLECTIVE_PATHS.coverage,
  COLLECTIVE_PATHS.reconciliation,
  '/campaigns',
  '/users',
];

/** Rutas legacy del menú del AGRICULTOR; sólo con el flag de rollback. */
export const LEGACY_MENU: readonly string[] = [
  '/dashboard',
  '/campaigns',
  '/plots',
  '/inventory',
  '/applications',
  '/calendar',
  '/reports',
  '/purchases',
  '/sync',
];

/** Rutas del menú para un rol; `/users` sólo para ADMINISTRADOR. */
export function menuPathsFor(role: string | null | undefined): readonly string[] {
  if (!role) return [];
  if (isCollectiveRole(role)) {
    return COLLECTIVE_MENU.filter((path) => path !== '/users' || role === 'ADMINISTRADOR');
  }
  return legacyFarmerWebEnabled() ? LEGACY_MENU : [];
}
