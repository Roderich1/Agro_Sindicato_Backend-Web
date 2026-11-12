import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useDisclosureMode } from '../lib/data-mode';
import { AUDIT_LOGS_PATH, CAMPAIGNS_PATH, COLLECTIVE_PATHS, menuPathsFor, USERS_PATH } from '../lib/navigation';
import { StatusChip } from './ui';

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  DIRECTIVA: 'Directiva',
  AGRICULTOR: 'Agricultor',
};

/**
 * Fondo sólido del avatar por rol (rediseño 2026-11-10: sin degradados). El
 * nombre se conserva por compatibilidad con las vistas que lo importan.
 */
const ROLE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-brand-800 text-white',
  DIRECTIVA: 'bg-brand-700 text-white',
  AGRICULTOR: 'bg-brand-100 text-brand-800',
};

/** El rol siempre se lee en el texto; el tono sólo acompaña. */
const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-brand-50 text-brand-800 ring-brand-700/25',
  DIRECTIVA: 'bg-slate-100 text-slate-700 ring-slate-500/25',
  AGRICULTOR: 'bg-slate-100 text-slate-700 ring-slate-500/25',
};

/* ══════════════════════════════════════════
   NAVIGATION ITEMS
   ══════════════════════════════════════════ */

interface NavItem {
  label: string;
  /** Etiqueta corta para la barra inferior del teléfono. */
  short?: string;
  to: string;
  icon: ReactNode;
  /** Rutas antiguas o internas que pertenecen a esta sección (ítem activo). */
  also?: readonly string[];
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true" focusable="false">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/**
 * Menú por tareas (rediseño 2026-11-10, contrato §2): las cinco tareas de la
 * Directiva y, bajo «Administración», Bitácora y Usuarios. El orden y los
 * permisos vienen de `menuPathsFor`; aquí sólo se agrupan. Un grupo sin ítems
 * para el rol no se muestra.
 */
const NAV_GROUPS: { label: string | null; paths: readonly string[] }[] = [
  { label: null, paths: [COLLECTIVE_PATHS.summary, CAMPAIGNS_PATH, COLLECTIVE_PATHS.proposals, COLLECTIVE_PATHS.jointPurchaseCalls, COLLECTIVE_PATHS.history, COLLECTIVE_PATHS.catalog] },
  { label: 'Administración', paths: [AUDIT_LOGS_PATH, USERS_PATH] },
];

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Resumen',
    to: COLLECTIVE_PATHS.summary,
    // La cobertura sale del menú y se abre desde el Resumen.
    also: [COLLECTIVE_PATHS.coverage],
    icon: <NavIcon d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />,
  },
  {
    label: 'Campañas',
    to: CAMPAIGNS_PATH,
    icon: <NavIcon d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  },
  {
    label: 'Necesidades y propuestas',
    short: 'Necesidades',
    to: COLLECTIVE_PATHS.proposals,
    icon: <NavIcon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
  },
  {
    /* E2 §6 (2026-11-11): convocatorias de compra conjunta; el detalle es una subruta. */
    label: 'Compras conjuntas',
    short: 'Compras',
    to: COLLECTIVE_PATHS.jointPurchaseCalls,
    icon: <NavIcon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
  },
  {
    label: 'Histórico y estimaciones',
    short: 'Histórico',
    to: COLLECTIVE_PATHS.history,
    also: [COLLECTIVE_PATHS.trends, COLLECTIVE_PATHS.estimation],
    icon: <NavIcon d="M3 17l6-6 4 4 8-8M14 7h7v7" />,
  },
  {
    label: 'Catálogo y equivalencias',
    short: 'Catálogo',
    to: COLLECTIVE_PATHS.catalog,
    also: [COLLECTIVE_PATHS.products, COLLECTIVE_PATHS.reconciliation],
    icon: <NavIcon d="M9 3h6v4l4 6v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6l4-6V3zm-3 12h12" />,
  },
  {
    label: 'Bitácora',
    to: AUDIT_LOGS_PATH,
    icon: <NavIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  },
  {
    label: 'Usuarios',
    to: USERS_PATH,
    icon: <NavIcon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
  },
];

/** Ítems del menú de un rol, en el orden de `menuPathsFor` (F07-WEB-01). */
function navItemsFor(role: string | null | undefined): NavItem[] {
  return menuPathsFor(role)
    .map((path) => NAV_ITEMS.find((item) => item.to === path))
    .filter((item): item is NavItem => Boolean(item));
}

/** Los ítems permitidos, agrupados; lo que no encaja en un grupo va al final. */
function navGroupsFor(items: NavItem[]): { label: string | null; items: NavItem[] }[] {
  const placed = new Set<string>();
  const groups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.paths.map((path) => items.find((item) => item.to === path)).filter((item): item is NavItem => Boolean(item)),
  }));
  groups.forEach((group) => group.items.forEach((item) => placed.add(item.to)));
  const rest = items.filter((item) => !placed.has(item.to));
  if (rest.length > 0) groups.push({ label: null, items: rest });
  return groups.filter((group) => group.items.length > 0);
}

/** La sección está activa en su ruta, en sus subrutas y en sus rutas antiguas. */
function isItemActive(item: NavItem, pathname: string): boolean {
  return [item.to, ...(item.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Ítems de las cinco tareas (la sección de la barra superior sale de aquí). */
const TASK_PATHS: readonly string[] = [
  COLLECTIVE_PATHS.summary,
  CAMPAIGNS_PATH,
  COLLECTIVE_PATHS.proposals,
  COLLECTIVE_PATHS.jointPurchaseCalls,
  COLLECTIVE_PATHS.history,
  COLLECTIVE_PATHS.catalog,
];

/**
 * Etiqueta de sección de la barra superior, derivada de la ruta (etapa 2): el
 * rótulo de la tarea del menú, «Administración» para Bitácora y Usuarios y,
 * fuera del menú por tareas (legacy, avisos), el `section` que pasa la vista.
 */
function sectionFor(pathname: string, fallback: string): string {
  const admin = NAV_ITEMS.filter((item) => item.to === AUDIT_LOGS_PATH || item.to === USERS_PATH);
  if (admin.some((item) => isItemActive(item, pathname))) return 'Administración';
  const task = NAV_ITEMS.find((item) => TASK_PATHS.includes(item.to) && isItemActive(item, pathname));
  return task?.label ?? fallback;
}

/** Marca de la entrada del historial que abre el menú del teléfono. */
const MENU_HISTORY_KEY = 'agroMenu';

function menuEntryToken(state: unknown): unknown {
  return state && typeof state === 'object' ? (state as Record<string, unknown>)[MENU_HISTORY_KEY] : undefined;
}

/** Barra inferior del teléfono: cuatro tareas como máximo (contrato §2). */
const MOBILE_PATHS_COLLECTIVE = [COLLECTIVE_PATHS.summary, CAMPAIGNS_PATH, COLLECTIVE_PATHS.proposals, COLLECTIVE_PATHS.history];

/* ══════════════════════════════════════════
   AVATAR COMPONENT
   ══════════════════════════════════════════ */

/** Iniciales sobre fondo sólido; `gradient` conserva su nombre, pero recibe las clases de fondo de `ROLE_COLORS`. */
function UserAvatar({ name, size = 'md', gradient }: { name: string; size?: 'sm' | 'md' | 'lg'; gradient?: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sizeClasses = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-12 w-12 text-sm',
  };

  return (
    <div className={`${sizeClasses[size]} flex shrink-0 items-center justify-center rounded-full font-bold ${gradient ?? ROLE_COLORS.AGRICULTOR}`} aria-hidden="true">
      {initials}
    </div>
  );
}

/* ══════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════ */

/**
 * Contenido de la navegación: marca y sindicato (sin truncar), grupos de
 * tareas y sesión. Superficie clara; el ítem activo lleva acento de marca,
 * peso de texto y `aria-current="page"`. Sin animación al cambiar de ruta.
 */
function NavContent({
  onNavigate,
  firstLinkRef,
}: {
  /** En el menú del teléfono: cierra el menú y la navegación reemplaza la entrada del historial del menú. */
  onNavigate?: () => void;
  firstLinkRef?: Ref<HTMLAnchorElement>;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const groups = navGroupsFor(navItemsFor(user?.role));
  const firstPath = groups[0]?.items[0]?.to;

  return (
    <div className="ui-nav-content flex h-full flex-col">
      <div className="flex items-start gap-3 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-700 text-white" aria-hidden="true">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight text-ink">Agrocuentas</p>
          {/* El nombre del sindicato se parte en líneas: nunca se trunca. */}
          <p className="mt-0.5 whitespace-normal break-words text-xs font-medium leading-snug text-slate-600" title={user?.tenant?.name}>
            {user?.tenant?.name}
          </p>
        </div>
      </div>

      <nav className="ui-nav-list flex-1 space-y-5 overflow-y-auto overscroll-contain border-t border-line px-3 py-4" aria-label="Navegación principal">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className="space-y-0.5">
            {group.label && <p className="px-3 pb-1 text-xs font-semibold text-slate-500">{group.label}</p>}
            {group.items.map((item) => {
              const active = isItemActive(item, location.pathname);
              return (
                <Link
                  key={item.to}
                  ref={item.to === firstPath ? firstLinkRef : undefined}
                  to={item.to}
                  onClick={onNavigate}
                  replace={Boolean(onNavigate)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-10 items-center gap-3 rounded-control px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 ${
                    active
                      ? 'bg-brand-50 font-semibold text-brand-800 before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-brand-700'
                      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-ink'
                  }`}
                >
                  <span className={active ? 'text-brand-700' : 'text-slate-500'}>{item.icon}</span>
                  <span className="min-w-0">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-4">
        {user && (
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} size="md" gradient={ROLE_COLORS[user.role]} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-ink">{user.name}</p>
              <p className="text-xs text-slate-600">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="ui-press mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Menú desplegable del teléfono (≤ lg): diálogo modal con nombre, foco en el
 * primer enlace al abrir, Escape y el botón «Cerrar menú» lo cierran y el foco
 * vuelve al botón que lo abrió. Aparece sin animación.
 */
function MobileMenu({ onClose, onNavigate }: { onClose: () => void; onNavigate: () => void }) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    (firstLinkRef.current ?? panelRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      // El foco no sale del menú mientras está abierto (diálogo modal).
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (!firstEl || !lastEl) return;
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="modal-backdrop absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        tabIndex={-1}
        className="ui-menu-panel ui-safe-top ui-safe-bottom absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-surface shadow-raised"
        data-testid="mobile-menu"
      >
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="ui-press inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cerrar menú
          </button>
        </div>
        <div className="ui-menu-body min-h-0 flex-1">
          <NavContent onNavigate={onNavigate} firstLinkRef={firstLinkRef} />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════ */

/**
 * Barra superior. No lleva el `h1` (lo pone `PageHeader` en cada vista):
 * conserva la sección y el nombre de la vista como texto, la etiqueta «Datos
 * sintéticos» cuando el servidor la declara, la campaña activa y la conexión,
 * siempre con texto.
 */
function Header({
  section,
  actions,
  onMenuClick,
  menuOpen,
  isOnline,
}: {
  section: string;
  actions?: ReactNode;
  onMenuClick: () => void;
  menuOpen: boolean;
  isOnline: boolean;
}) {
  const { activeCampaign, isLoading } = useCampaign();
  const disclosureMode = useDisclosureMode();

  return (
    <header className="ui-shell-header ui-safe-top sticky top-0 z-20 border-b border-line bg-surface">
      <div className="ui-shell-bar ui-gutter flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            className="ui-press -ml-1 inline-flex h-10 w-10 items-center justify-center rounded-control text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-700 lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            {/* Sólo la sección del menú por tareas: el título visible es el h1 de PageHeader. */}
            <p className="text-xs font-semibold text-brand-800" data-testid="shell-section">
              {section}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {disclosureMode === 'PROVISIONAL_SYNTHETIC' && (
            <span
              className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-600/30"
              title="El servidor declara datos sintéticos (modo provisional de la política de divulgación)."
              data-testid="synthetic-badge"
            >
              Datos sintéticos
            </span>
          )}
          <Link
            to={CAMPAIGNS_PATH}
            title="Campaña activa del sindicato"
            className="hidden min-w-0 max-w-[min(22rem,100%)] items-center gap-1.5 rounded-control px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-700 sm:inline-flex"
          >
            {isLoading ? (
              'Campaña…'
            ) : activeCampaign ? (
              <>
                <span className="shrink-0 font-semibold text-brand-800">Activa</span>
                {/* Una línea: con zoom o nombre largo se recorta y el nombre completo queda en `title`. */}
                <span className="min-w-0 truncate font-medium text-ink" title={activeCampaign.name} data-testid="active-campaign-name">
                  {activeCampaign.name}
                </span>
              </>
            ) : (
              <span className="font-semibold text-amber-900">Sin campaña activa</span>
            )}
          </Link>
          <span
            className={`items-center gap-1.5 text-xs font-medium ${isOnline ? 'hidden text-slate-600 sm:inline-flex' : 'inline-flex text-red-800'}`}
            data-testid="connection"
          >
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-brand-600' : 'bg-red-700'}`} aria-hidden="true" />
            {isOnline ? 'En línea' : 'Sin conexión'}
          </span>
          {actions}
        </div>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════
   APP SHELL
   ══════════════════════════════════════════ */

/**
 * Armazón de la Web institucional. Firma estable: `title` va al título de la
 * pestaña (el único título visible es el `h1` de `PageHeader`); la barra muestra
 * sólo la sección, derivada de la ruta (menú por tareas) y, fuera de él,
 * `section`; `actions` a la derecha de la barra.
 */
export function AppShell({ title, section, actions, children }: { title: string; section: string; actions?: ReactNode; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const availableNav = navItemsFor(user?.role);
  const mobileNav = MOBILE_PATHS_COLLECTIVE
    .map((path) => availableNav.find((item) => item.to === path))
    .filter((item): item is NavItem => Boolean(item));
  /*
   * El menú del teléfono ocupa una entrada del historial: el botón o gesto
   * Atrás de Android lo cierra en lugar de salir de la página (hallazgo H1 del
   * emulador). Cerrarlo con su botón, Escape o un toque fuera deshace esa
   * entrada; elegir una sección la reemplaza (enlaces con `replace`).
   */
  // Cada apertura marca su entrada con una ficha propia: una entrada de menú antigua
  // (p. ej. de una página restaurada desde la caché) no se confunde con la actual.
  const menuToken = useRef<string | null>(null);
  const openMenu = useCallback(() => {
    const state: unknown = window.history.state;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    menuToken.current = token;
    window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), [MENU_HISTORY_KEY]: token }, '');
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => {
    if (menuToken.current && menuEntryToken(window.history.state) === menuToken.current) window.history.back(); // el popstate lo cierra
    else setMenuOpen(false);
  }, []);
  const leaveMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPop = () => {
      if (menuEntryToken(window.history.state) !== menuToken.current) setMenuOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [menuOpen]);

  // Una página restaurada desde la caché del navegador (bfcache) no vuelve con el menú abierto.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setMenuOpen(false);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);


  // El nombre de la vista ya no se repite en la barra: queda en el título de la pestaña.
  useEffect(() => {
    document.title = `${title} · Agrocuentas`;
  }, [title]);

  return (
    <div className="min-h-dvh bg-canvas">
      <aside className="hidden border-r border-line bg-surface lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[248px] lg:flex-col">
        <NavContent />
      </aside>
      {menuOpen && <MobileMenu onClose={closeMenu} onNavigate={leaveMenu} />}

      <div className="lg:pl-[248px]">
        <Header section={sectionFor(location.pathname, section)} actions={actions} onMenuClick={openMenu} menuOpen={menuOpen} isOnline={isOnline} />
        <main className="ui-gutter ui-main mx-auto max-w-7xl pt-5 lg:pt-6">{children}</main>
      </div>

      {mobileNav.length > 0 && (
        <nav className="ui-bottom-nav fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface lg:hidden" aria-label="Navegación rápida">
          {mobileNav.map((item) => {
            const active = isItemActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-[11px] font-semibold leading-tight focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-700 ${
                  active ? 'text-brand-800' : 'text-slate-600'
                }`}
              >
                <span className={`rounded-full px-3 py-0.5 ${active ? 'bg-brand-50 text-brand-700' : ''}`}>{item.icon}</span>
                <span>{item.short ?? item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTICE / TOAST
   ══════════════════════════════════════════ */

/** Movido a `components/ui` (rediseño 2026-11-10); se re-exporta para no romper importaciones. */
export { Notice } from './ui';

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return <tr>{Array.from({ length: cols }).map((_, i) => <td key={i} className="px-5 py-3.5"><div className="skeleton h-4 w-full rounded-md" /></td>)}</tr>;
}

export function EmptyState({ icon, title, description, compact = false }: { icon?: ReactNode; title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-7' : 'py-16'}`}>
      {icon && <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-slate-100 text-slate-500" aria-hidden="true">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-600">{description}</p>}
    </div>
  );
}

/**
 * Tarjeta de cifra de las vistas heredadas (bitácora y legacy). Rediseño
 * 2026-11-10: superficie sólida, sin degradado; `color` se conserva en la
 * firma pero ya no tiñe el icono (un solo acento).
 */
export function StatCard({ label, value, icon, trend }: { label: string; value: string | number; icon?: ReactNode; trend?: string; color?: 'emerald' | 'red' | 'amber' | 'sky' | 'violet' | 'slate' }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-600">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-ink tabular-nums">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-slate-600">{trend}</p>}
        </div>
        {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-slate-100 text-slate-600" aria-hidden="true">{icon}</div>}
      </div>
    </div>
  );
}

export function CriticalityBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    VENCIDO: { label: 'Vencido', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    BAJO_MINIMO: { label: 'Bajo mínimo', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    POR_VENCER: { label: 'Por vencer', cls: 'bg-orange-500/10 text-orange-700 ring-orange-500/20' },
    OK: { label: 'OK', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  };
  const { label, cls } = map[value] ?? { label: value, cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>{label}</span>;
}

/** Unificado en `StatusChip` (components/ui): mismos textos, motivo de divulgación en `title`. */
export function StatusBadge({ status }: { status: string }) {
  return <StatusChip status={status} />;
}

export function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE_COLORS[role] ?? 'bg-slate-500/10 text-slate-600 ring-slate-500/20';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>{ROLE_LABELS[role] ?? role}</span>;
}

export function Modal({ title, children, onClose, size = 'md' }: { title: string; children: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);
  const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop">
      <button
        type="button"
        aria-label="Cerrar modal"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain ${sizeClasses[size]} rounded-card border border-line bg-surface p-6 shadow-raised`}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ui-press rounded-control p-1.5 text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-700"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SHARED STYLE CLASSES
   ══════════════════════════════════════════ */

/* Clases movidas a `components/ui/classes.ts` con los tokens nuevos; se re-exportan. */
// eslint-disable-next-line react-refresh/only-export-components -- re-exportación de compatibilidad de constantes
export { buttonClass, cardClass, dangerButtonClass, inputClass, labelClass, secondaryButtonClass } from './ui';

export { UserAvatar, ROLE_LABELS, ROLE_COLORS, ROLE_BADGE_COLORS };
