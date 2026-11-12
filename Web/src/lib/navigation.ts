/**
 * F07-WEB-01 (#23): navegación institucional de DIRECTIVA y ADMINISTRADOR del
 * mismo tenant (ADR-003). Ocultar una ruta del menú no la protege: cada
 * endpoint colectivo comprueba rol y tenant en el servidor, y las rutas nuevas
 * usan `CollectiveRoute`.
 */
/**
 * F12-EST-07-WEB (#180): lectura sin conexión de la copia de la estimación. Fuera
 * del menú y de `/colectivo`: no exige una sesión comprobada ni llama al servidor.
 */
export const ESTIMATION_COPY_PATH = '/estimacion/copia-sin-conexion';

export const COLLECTIVE_ROLES = ['DIRECTIVA', 'ADMINISTRADOR'] as const;

export const COLLECTIVE_PATHS = {
  summary: '/colectivo/resumen',
  proposals: '/colectivo/propuestas',
  coverage: '/colectivo/cobertura',
  reconciliation: '/colectivo/reconciliacion',
  /** F07 (2026-10-23): tendencias entre versiones selladas. */
  trends: '/colectivo/tendencias',
  /** F12-EST-06 (#179): estimación del consumo (INT-09, perfil institucional). */
  estimation: '/colectivo/estimacion',
  /** Catálogo de productos del sindicato (Gestión, defensa 2026-11-05): `/inventory/products`. */
  products: '/colectivo/productos',
  /**
   * Rediseño 2026-11-10 (contrato §2): contenedor «Histórico y estimaciones»
   * (`?vista=tendencias|estimacion`). `trends` y `estimation` siguen siendo
   * sus rutas antiguas y redirigen aquí.
   */
  history: '/colectivo/historico',
  /**
   * Contenedor «Catálogo y equivalencias» (`?vista=productos|equivalencias|identificacion`;
   * `identificacion` = «Por identificar», E1 §6).
   */
  catalog: '/colectivo/catalogo',
  /** E2 §6: convocatorias de compra conjunta (lista; el detalle es `jointPurchaseCallDetail`). */
  jointPurchaseCalls: '/colectivo/compras-conjuntas',
  /** Detalle de una convocatoria: `/colectivo/compras-conjuntas/<id>`. */
  jointPurchaseCallDetail: (id: string) => jointPurchaseCallPath(id),
  /** Detalle de una campaña: `/campaigns/<id>` (no es una ruta colectiva: `PrivateRoute`). */
  campaignDetail: (id: string) => campaignDetailPath(id),
} as const;

/** Detalle de una campaña (rediseño 2026-11-10, contrato §2). */
export function campaignDetailPath(id: string): string {
  return `/campaigns/${encodeURIComponent(id)}`;
}

/** Detalle de una convocatoria de compra conjunta (E2 §6). */
export function jointPurchaseCallPath(id: string): string {
  return `/colectivo/compras-conjuntas/${encodeURIComponent(id)}`;
}

/** Rutas que no son colectivas pero sí están en el menú institucional. */
export const CAMPAIGNS_PATH = '/campaigns';
export const AUDIT_LOGS_PATH = '/audit-logs';
export const USERS_PATH = '/users';

/** Aviso para quien no es Directiva ni Administrador: la Web no es su cliente. */
export const WEB_NOT_FOR_FARMERS_PATH = '/sin-acceso-web';

export function isCollectiveRole(role: string | null | undefined): boolean {
  return (COLLECTIVE_ROLES as readonly string[]).includes(role ?? '');
}

/**
 * Pantalla inicial: la Directiva y el Administrador entran al resumen
 * colectivo; cualquier otro rol (el AGRICULTOR usa sólo la app móvil), al aviso.
 */
export function homePathFor(role: string | null | undefined): string {
  return isCollectiveRole(role) ? COLLECTIVE_PATHS.summary : WEB_NOT_FOR_FARMERS_PATH;
}

/**
 * Menú por tareas de DIRECTIVA/ADMINISTRADOR (rediseño 2026-11-10, contrato
 * §2), en este orden: Resumen, Campañas, Necesidades y propuestas, Compras
 * conjuntas (E2 §6, 2026-11-11), Histórico y estimaciones, Catálogo y
 * equivalencias y, bajo «Administración»,
 * Bitácora y Usuarios. La cobertura sale del menú (se enlaza desde el
 * Resumen y el detalle de campaña) y su ruta se conserva. La Web no tiene
 * vistas del agricultor (decisión del autor del 2026-11-12: su cliente es la app).
 */
export const COLLECTIVE_MENU: readonly string[] = [
  COLLECTIVE_PATHS.summary,
  CAMPAIGNS_PATH,
  COLLECTIVE_PATHS.proposals,
  COLLECTIVE_PATHS.jointPurchaseCalls,
  COLLECTIVE_PATHS.history,
  COLLECTIVE_PATHS.catalog,
  AUDIT_LOGS_PATH,
  USERS_PATH,
];

/**
 * Rutas del menú para un rol: `/users` sólo para ADMINISTRADOR (`AdminRoute`);
 * `/audit-logs` para DIRECTIVA y ADMINISTRADOR (`RoleRoute`). Ocultar un ítem
 * no protege la ruta: la guarda y el servidor deciden.
 */
export function menuPathsFor(role: string | null | undefined): readonly string[] {
  if (!role) return [];
  if (isCollectiveRole(role)) {
    return COLLECTIVE_MENU.filter((path) => path !== USERS_PATH || role === 'ADMINISTRADOR');
  }
  return [];
}
