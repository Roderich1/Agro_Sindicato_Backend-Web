import type { IconName } from '../components/ui/icon-paths';

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

/* ══════════════════════════════════════════
   PRESENTACIÓN DEL MENÚ (rediseño v2, 2026-11-13; láminas 03, 21, 35 y 43)
   Única fuente de etiquetas, iconos, grupos y subvistas. Qué rutas ve cada
   rol lo sigue decidiendo `menuPathsFor`; aquí sólo se nombran y se agrupan.
   ══════════════════════════════════════════ */

/** Nombre de un trazo de `components/ui/icon-paths.ts` (sólo el tipo: la lógica no depende de la UI). */
export type NavIconName = IconName;

/** Subvista de un contenedor (`?vista=`): un ítem del grupo plegable de la barra lateral. */
export interface NavSubItem {
  label: string;
  /** Valor de `?vista=` en la ruta del grupo. */
  vista: string;
  /** Rutas antiguas que muestran esta subvista (redirigen a ella). */
  also?: readonly string[];
}

export interface NavItemDef {
  path: string;
  /** Etiqueta de la barra lateral. */
  label: string;
  /** Etiqueta corta de la barra inferior del teléfono. */
  short?: string;
  /** Etiqueta larga del menú «Más» (lámina 43); `label` si falta. */
  title?: string;
  /** Una línea bajo el título en el menú «Más». */
  description?: string;
  icon: NavIconName;
  /** Rutas antiguas o internas que pertenecen a esta sección (ítem activo). */
  also?: readonly string[];
  /** Subvistas: el ítem es un grupo plegable (Catálogo, Histórico). La primera es la vista por defecto. */
  children?: readonly NavSubItem[];
}

/**
 * Ítems del menú. Las etiquetas siguen la lámina 03: «Borrador de compra» es
 * `/colectivo/propuestas` (Necesidades y propuestas), «Catálogo» e «Histórico»
 * son grupos con sus vistas. La cobertura sale del menú (se abre desde el
 * Resumen) y su ruta se conserva.
 */
export const NAV_ITEMS: readonly NavItemDef[] = [
  {
    path: COLLECTIVE_PATHS.summary,
    label: 'Resumen',
    description: 'Necesidades y consumo de la campaña',
    icon: 'home',
    also: [COLLECTIVE_PATHS.coverage],
  },
  {
    path: COLLECTIVE_PATHS.proposals,
    label: 'Borrador de compra',
    short: 'Borrador',
    title: 'Necesidades y borrador de compra',
    description: 'Necesidades declaradas y borradores',
    icon: 'clipboard',
  },
  {
    path: COLLECTIVE_PATHS.jointPurchaseCalls,
    label: 'Compras conjuntas',
    short: 'Compras',
    description: 'Convocatorias de compra conjunta',
    icon: 'megaphone',
  },
  {
    path: COLLECTIVE_PATHS.catalog,
    label: 'Catálogo',
    title: 'Catálogo y equivalencias',
    description: 'Productos, nombres equivalentes y por identificar',
    icon: 'archive',
    also: [COLLECTIVE_PATHS.products, COLLECTIVE_PATHS.reconciliation],
    children: [
      { label: 'Productos', vista: 'productos', also: [COLLECTIVE_PATHS.products] },
      { label: 'Nombres equivalentes', vista: 'equivalencias', also: [COLLECTIVE_PATHS.reconciliation] },
      { label: 'Por identificar', vista: 'identificacion' },
    ],
  },
  {
    path: COLLECTIVE_PATHS.history,
    label: 'Histórico',
    title: 'Histórico y estimaciones',
    description: 'Campañas selladas y consumo estimado',
    icon: 'bars',
    also: [COLLECTIVE_PATHS.trends, COLLECTIVE_PATHS.estimation],
    children: [
      { label: 'Histórico sellado', vista: 'tendencias', also: [COLLECTIVE_PATHS.trends] },
      { label: 'Estimación del consumo', vista: 'estimacion', also: [COLLECTIVE_PATHS.estimation] },
    ],
  },
  {
    path: CAMPAIGNS_PATH,
    label: 'Campañas',
    description: 'Abrir, cerrar y sellar',
    icon: 'calendar',
  },
  {
    path: AUDIT_LOGS_PATH,
    label: 'Bitácora',
    description: 'Lo que se hizo en la Web',
    icon: 'document',
  },
  {
    path: USERS_PATH,
    label: 'Usuarios',
    description: 'Cuentas y permisos del sindicato',
    icon: 'users',
  },
];

/**
 * Secciones de la barra lateral (lámina 03 e inventario v2 §O.2): las tareas
 * sin rótulo y «Sindicato» con Campañas, Usuarios (sólo ADMINISTRADOR, por
 * `menuPathsFor`) y Bitácora. Una sección sin ítems para el rol no se muestra.
 */
export const NAV_SECTIONS: readonly { label: string | null; paths: readonly string[] }[] = [
  { label: null, paths: [COLLECTIVE_PATHS.summary, COLLECTIVE_PATHS.proposals, COLLECTIVE_PATHS.jointPurchaseCalls, COLLECTIVE_PATHS.catalog, COLLECTIVE_PATHS.history] },
  { label: 'Sindicato', paths: [CAMPAIGNS_PATH, USERS_PATH, AUDIT_LOGS_PATH] },
];

/** Clave de `navCounts` de la subvista «Por identificar» (insignia H-02). */
export const IDENTIFICATION_PENDING_KEY = `${COLLECTIVE_PATHS.catalog}?vista=identificacion`;

/** Barra inferior del teléfono (lámina 43): cuatro tareas y «Más» con el resto. */
export const MOBILE_BOTTOM_PATHS: readonly string[] = [
  COLLECTIVE_PATHS.summary,
  COLLECTIVE_PATHS.proposals,
  COLLECTIVE_PATHS.jointPurchaseCalls,
  COLLECTIVE_PATHS.catalog,
];

/** Definiciones del menú de un rol, en el orden de `menuPathsFor`. */
export function navItemsFor(role: string | null | undefined): NavItemDef[] {
  return menuPathsFor(role)
    .map((path) => NAV_ITEMS.find((item) => item.path === path))
    .filter((item): item is NavItemDef => Boolean(item));
}

/** La sección está activa en su ruta, en sus subrutas y en sus rutas antiguas. */
export function isNavItemActive(item: NavItemDef, pathname: string): boolean {
  return [item.path, ...(item.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Subvista activa de un grupo: la de `?vista=` o la de su ruta antigua; en la
 * ruta del grupo sin `?vista=` (o con una desconocida), la primera, como hacen
 * las vistas. `null` si la sección no está activa.
 */
export function activeSubItem(item: NavItemDef, pathname: string, search: string): NavSubItem | null {
  if (!item.children || !isNavItemActive(item, pathname)) return null;
  const byOldPath = item.children.find((child) => (child.also ?? []).some((path) => pathname === path));
  if (byOldPath) return byOldPath;
  if (pathname !== item.path) return null;
  const vista = new URLSearchParams(search).get('vista');
  return item.children.find((child) => child.vista === vista) ?? item.children[0] ?? null;
}

/** Ruta de una subvista: `<grupo>?vista=<vista>`. */
export function subItemPath(item: NavItemDef, child: NavSubItem): string {
  return `${item.path}?vista=${encodeURIComponent(child.vista)}`;
}

/**
 * Rótulo de sección del armazón, derivado de la ruta: el título de la tarea
 * del menú («Histórico y estimaciones», «Campañas», «Bitácora»…) y, fuera del
 * menú (copia sin conexión, avisos), el `fallback` que pasa la vista.
 */
export function sectionLabelFor(pathname: string, fallback: string): string {
  const item = NAV_ITEMS.find((entry) => isNavItemActive(entry, pathname));
  return item ? (item.title ?? item.label) : fallback;
}
