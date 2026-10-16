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

export function isCollectiveRole(role: string | null | undefined): boolean {
  return (COLLECTIVE_ROLES as readonly string[]).includes(role ?? '');
}

/** Pantalla inicial: la Directiva y el Administrador entran al resumen colectivo. */
export function homePathFor(role: string | null | undefined): string {
  return isCollectiveRole(role) ? COLLECTIVE_PATHS.summary : '/dashboard';
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

/** Rutas legacy visibles en el menú del AGRICULTOR (sin cambios en F07). */
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
  return LEGACY_MENU;
}
