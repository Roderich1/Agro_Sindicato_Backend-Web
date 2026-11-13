import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';
import { useIdentificationPending } from '../contexts/identification-pending';
import {
  activeSubItem,
  IDENTIFICATION_PENDING_KEY,
  isNavItemActive,
  MOBILE_BOTTOM_PATHS,
  NAV_ITEMS,
  NAV_SECTIONS,
  navItemsFor,
  sectionLabelFor,
  subItemPath,
  type NavItemDef,
} from '../lib/navigation';
import { Avatar, Dialog, ICON, Icon, IconButton, StatusChip, initialsOf } from './ui';

/* ══════════════════════════════════════════
   CONSTANTES
   ══════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  DIRECTIVA: 'Directiva',
  AGRICULTOR: 'Agricultor',
};

/**
 * Fondo del avatar por rol. El nombre se conserva por compatibilidad con las
 * vistas que lo importan; en el armazón el avatar es lima sobre tinta.
 */
const ROLE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-lime text-ink',
  DIRECTIVA: 'bg-lime text-ink',
  AGRICULTOR: 'bg-sunken text-ink',
};

/** El rol siempre se lee en el texto; el tono sólo acompaña. */
const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-ink text-white ring-ink/20',
  DIRECTIVA: 'bg-lime-soft text-lime-ink ring-lime-ink/20',
  AGRICULTOR: 'bg-sunken text-ink ring-ink/15',
};

/** Marca de la entrada del historial que abre el menú «Más» del teléfono. */
const MENU_HISTORY_KEY = 'agroMenu';
/** Preferencia del visitante (sólo comodidad): barra lateral plegada. */
const RAIL_STORAGE_KEY = 'agro.web.barraPlegada';

function menuEntryToken(state: unknown): unknown {
  return state && typeof state === 'object' ? (state as Record<string, unknown>)[MENU_HISTORY_KEY] : undefined;
}

function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeRail(value: boolean) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* Sin almacenamiento (ventana privada): la preferencia dura la sesión. */
  }
}

/** Contadores opcionales del menú, por ruta (`/colectivo/catalogo`) o subvista (`/colectivo/catalogo?vista=identificacion`). */
export type NavCounts = Readonly<Record<string, number>>;

/* ══════════════════════════════════════════
   PIEZAS
   ══════════════════════════════════════════ */

/** Marca: cuadro lima con el brote. Decorativa (el nombre va escrito al lado). */
function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-lime text-ink ${size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-11 w-11 rounded-[14px]'}`} aria-hidden="true">
      <Icon d={ICON.sprout} className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.2} />
    </span>
  );
}

/** Iniciales sobre fondo sólido; `gradient` conserva su nombre, pero recibe las clases de fondo de `ROLE_COLORS`. */
function UserAvatar({ name, size = 'md', gradient }: { name: string; size?: 'sm' | 'md' | 'lg'; gradient?: string }) {
  const sizeClasses = { sm: 'h-7 w-7 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' };
  return (
    <div className={`${sizeClasses[size]} flex shrink-0 items-center justify-center rounded-full font-bold ${gradient ?? ROLE_COLORS.AGRICULTOR}`} aria-hidden="true">
      {initialsOf(name)}
    </div>
  );
}

/** Contador del menú: la cifra se ve; el lector de pantalla oye «(6 pendientes)». */
function CountBadge({ value, rail = false }: { value: number; rail?: boolean }) {
  return (
    <>
      <span
        className={`inline-flex min-w-6 items-center justify-center rounded-full bg-warn-bg px-1.5 text-xs font-bold tabular-nums text-warn-ink ${rail ? 'absolute -right-1 -top-1 h-5 min-w-5 text-[11px]' : 'h-6'}`}
        aria-hidden="true"
      >
        {value}
      </span>
      <span className="sr-only"> ({value} pendientes)</span>
    </>
  );
}

/* ══════════════════════════════════════════
   BARRA LATERAL (escritorio, lámina 03 y 21)
   ══════════════════════════════════════════ */

const SIDE_LINK =
  'relative flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[16px] px-4 py-2.5 text-base focus-visible:outline-2 focus-visible:-outline-offset-2';

/**
 * Navegación de la barra lateral: tareas, «Sindicato» y «Administración». El
 * ítem activo va en lima con texto en tinta y en negrita; los grupos (Catálogo,
 * Histórico) se pliegan con un botón propio y se abren solos en su sección.
 */
function SidebarNav({ rail, counts }: { rail: boolean; counts?: NavCounts }) {
  const { user } = useAuth();
  const location = useLocation();
  const items = navItemsFor(user?.role);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const uid = useId();

  const sections = NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.paths.map((path) => items.find((item) => item.path === path)).filter((item): item is NavItemDef => Boolean(item)),
  }));
  // Lo que no encaja en una sección va al final (no se pierde ningún ítem permitido).
  const placed = new Set(sections.flatMap((section) => section.items.map((item) => item.path)));
  const rest = items.filter((item) => !placed.has(item.path));
  if (rest.length > 0) sections.push({ label: null, items: rest });

  return (
    <nav className="ui-nav-list min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-2" aria-label="Navegación principal">
      {sections
        .filter((section) => section.items.length > 0)
        .map((section, index) => (
          <div key={section.label ?? `s${index}`} className="space-y-1">
            {section.label && <p className={rail ? 'sr-only' : 'px-4 pb-1 text-xs font-bold uppercase tracking-[0.1em] text-on-ink-muted'}>{section.label}</p>}
            {section.items.map((item) => {
              const active = isNavItemActive(item, location.pathname);
              const sub = activeSubItem(item, location.pathname, location.search);
              const hasChildren = Boolean(item.children?.length) && !rail;
              const expanded = hasChildren && (open[item.path] ?? active);
              const childrenShown = expanded && sub !== null;
              // Con el grupo plegado (o la barra en modo icono), el contador de una subvista sube al grupo.
              const childCounts = (item.children ?? []).map((child) => counts?.[subItemPath(item, child)]).filter((value): value is number => value !== undefined);
              const count = counts?.[item.path] ?? (!expanded ? childCounts[0] : undefined);
              const listId = `${uid}-${item.path.replace(/\W+/g, '')}`;
              return (
                <div key={item.path}>
                  <div className={`flex items-center rounded-[16px] ${active ? 'bg-lime text-ink' : 'text-on-ink hover:bg-ink-raised'}`}>
                    <Link
                      to={item.path}
                      aria-current={active ? (childrenShown ? 'true' : 'page') : undefined}
                      title={rail ? item.label : undefined}
                      className={`${SIDE_LINK} ${active ? 'font-semibold' : 'font-medium'} ${rail ? 'justify-center px-0' : ''}`}
                    >
                      <span className="relative">
                        <Icon d={ICON[item.icon]} className="h-6 w-6" strokeWidth={1.8} />
                        {rail && count !== undefined && <CountBadge value={count} rail />}
                      </span>
                      <span className={rail ? 'sr-only' : 'min-w-0 flex-1 break-words'}>{item.label}</span>
                      {!rail && count !== undefined && <CountBadge value={count} />}
                    </Link>
                    {hasChildren && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={listId}
                        aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} las vistas de ${item.label}`}
                        onClick={() => setOpen((prev) => ({ ...prev, [item.path]: !expanded }))}
                        className="mr-1.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2"
                      >
                        <Icon d={expanded ? ICON.chevronUp : ICON.chevronDown} className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {expanded && item.children && (
                    <ul id={listId} className="ml-7 mt-1 space-y-1 border-l border-ink-line pl-3" aria-label={item.label}>
                      {item.children.map((child) => {
                        const to = subItemPath(item, child);
                        const current = sub?.vista === child.vista;
                        const childCount = counts?.[to];
                        return (
                          <li key={child.vista}>
                            <Link
                              to={to}
                              aria-current={current ? 'page' : undefined}
                              className={`flex min-h-11 items-center gap-2 rounded-[14px] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                                current ? 'bg-ink-raised font-bold text-white' : 'font-medium text-on-ink-muted hover:bg-ink-raised hover:text-white'
                              }`}
                            >
                              <span className="min-w-0 flex-1 break-words">{child.label}</span>
                              {childCount !== undefined && <CountBadge value={childCount} />}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </nav>
  );
}

/**
 * Conexión del navegador (`navigator.onLine`), dato que el armazón ya mostraba
 * antes del rediseño v2: siempre con texto. En la barra plegada, «En línea» queda
 * para lectores de pantalla y «Sin conexión» sigue visible.
 */
function ConnectionStatus({ isOnline, rail = false }: { isOnline: boolean; rail?: boolean }) {
  return (
    <p
      className={`flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-on-ink-muted' : 'font-semibold text-danger-bg'} ${rail ? 'justify-center text-center' : ''}`}
      data-testid="connection"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${isOnline ? 'bg-lime' : 'bg-danger'}`} aria-hidden="true" />
      <span className={rail && isOnline ? 'sr-only' : ''}>{isOnline ? 'En línea' : 'Sin conexión'}</span>
    </p>
  );
}

function Sidebar({ rail, onToggleRail, counts, isOnline }: { rail: boolean; onToggleRail: () => void; counts?: NavCounts; isOnline: boolean }) {
  const { user, logout } = useAuth();
  return (
    <aside
      id="barra-lateral"
      className="ui-on-ink hidden bg-ink text-on-ink lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col"
      style={{ width: rail ? 'var(--sidebar-rail)' : 'var(--sidebar-width)' }}
      data-rail={rail}
    >
      <div className={`relative flex items-center gap-3 pb-5 pt-6 ${rail ? 'justify-center px-2' : 'px-5'}`}>
        <BrandMark />
        <div className={rail ? 'sr-only' : 'min-w-0'}>
          <p className="font-display text-xl font-extrabold leading-tight text-white">Agrocuentas</p>
          {/* El nombre del sindicato sale de la sesión y se parte en líneas: nunca se trunca. */}
          {user?.tenant?.name && (
            <p className="mt-0.5 whitespace-normal break-words text-sm leading-snug text-on-ink-muted" title={user.tenant.name}>
              {user.tenant.name}
            </p>
          )}
        </div>
        <IconButton
          label={rail ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'}
          icon={rail ? ICON.chevronRight : ICON.chevronLeft}
          variant="accent"
          size="sm"
          aria-expanded={!rail}
          aria-controls="barra-lateral"
          onClick={onToggleRail}
          className="absolute -right-[18px] top-7 z-10 border-4 border-canvas"
        />
      </div>

      <SidebarNav rail={rail} counts={counts} />

      {user && (
        <div className={`m-4 flex items-center gap-3 rounded-[18px] bg-ink-raised py-3 ${rail ? 'flex-col px-2' : 'px-3'}`}>
          <Avatar name={user.name} tone="lime" />
          <div className={rail ? 'sr-only' : 'min-w-0 flex-1'}>
            <p className="break-words text-sm font-semibold leading-snug text-white">{user.name}</p>
            <p className="text-xs text-on-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
            {!rail && (
              <div className="mt-1">
                <ConnectionStatus isOnline={isOnline} />
              </div>
            )}
          </div>
          {rail && <ConnectionStatus isOnline={isOnline} rail />}
          <IconButton label="Cerrar sesión" icon={ICON.logout} variant="on-dark" size="sm" className="border-0" onClick={() => void logout()} />
        </div>
      )}
    </aside>
  );
}

/* ══════════════════════════════════════════
   MENÚ «MÁS» (teléfono, lámina 43)
   ══════════════════════════════════════════ */

function MoreLink({ item, onNavigate, linkRef }: { item: NavItemDef; onNavigate: () => void; linkRef?: Ref<HTMLAnchorElement> }) {
  const location = useLocation();
  const uid = useId();
  const active = isNavItemActive(item, location.pathname);
  return (
    <li>
      <Link
        ref={linkRef}
        to={item.path}
        replace
        onClick={onNavigate}
        aria-labelledby={`${uid}-t`}
        aria-describedby={item.description ? `${uid}-d` : undefined}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-16 items-center gap-4 px-4 py-3.5 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ${active ? 'bg-lime' : 'bg-sunken'} text-ink`}>
          <Icon d={ICON[item.icon]} className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${uid}-t`} className={`block text-base leading-snug text-ink ${active ? 'font-extrabold' : 'font-bold'}`}>
            {item.title ?? item.label}
          </span>
          {item.description && (
            <span id={`${uid}-d`} className="block text-sm leading-snug text-ink-muted">
              {item.description}
            </span>
          )}
        </span>
        <Icon d={ICON.chevronRight} className="h-5 w-5 text-ink" />
      </Link>
    </li>
  );
}

/**
 * Menú «Más» del teléfono: diálogo modal a pantalla completa (salvo la barra
 * inferior, que sigue visible). Foco en el primer enlace al abrir; Escape y
 * «Cerrar menú» lo cierran y el foco vuelve al botón que lo abrió; Tab no sale
 * del diálogo. Lista las tareas que no caben en la barra inferior y, en
 * horizontal (sin barra inferior), también las de la barra.
 */
function MoreMenu({ onClose, onNavigate, id }: { onClose: () => void; onNavigate: () => void; id: string }) {
  const { user, logout } = useAuth();
  const items = navItemsFor(user?.role);
  // Orden de la lámina 43 (el de NAV_ITEMS), no el de `menuPathsFor`.
  const secondary = NAV_ITEMS.filter((item) => items.includes(item) && !MOBILE_BOTTOM_PATHS.includes(item.path));
  const primary = items.filter((item) => MOBILE_BOTTOM_PATHS.includes(item.path));
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = firstLinkRef.current;
    const firstVisible = first && !(first.closest<HTMLElement>('.ui-more-primary') && window.getComputedStyle(first.closest<HTMLElement>('.ui-more-primary')!).display === 'none');
    (firstVisible ? first : panelRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        // Los accesos repetidos de la barra inferior sólo se muestran en horizontal: ocultos, no cuentan.
        const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter((node) => {
          const repeated = node.closest<HTMLElement>('.ui-more-primary');
          return !repeated || window.getComputedStyle(repeated).display !== 'none';
        });
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
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label="Más"
      tabIndex={-1}
      className="ui-menu-panel ui-more-panel fixed inset-x-0 top-0 z-40 overflow-y-auto overscroll-contain bg-canvas focus:outline-none lg:hidden"
      data-testid="mobile-menu"
    >
      <div className="ui-on-ink ui-safe-top rounded-b-[28px] bg-ink px-5 pb-6 text-white">
        <div className="flex items-start justify-between gap-3 pt-4">
          <div className="min-w-0">
            {user?.tenant?.name && <p className="break-words text-sm text-on-ink-muted">{user.tenant.name}</p>}
            <h2 className="mt-1 text-4xl font-extrabold leading-tight">Más</h2>
          </div>
          <IconButton label="Cerrar menú" icon={ICON.close} variant="on-dark" onClick={onClose} />
        </div>
      </div>
      <div className="ui-gutter space-y-4 py-5">
        {secondary.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card" aria-label="Otras secciones">
            {secondary.map((item, index) => (
              <MoreLink key={item.path} item={item} onNavigate={onNavigate} linkRef={index === 0 ? firstLinkRef : undefined} />
            ))}
          </ul>
        )}
        <div className="ui-more-primary">
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card" aria-label="Tareas principales">
            {primary.map((item, index) => (
              <MoreLink key={item.path} item={item} onNavigate={onNavigate} linkRef={secondary.length === 0 && index === 0 ? firstLinkRef : undefined} />
            ))}
          </ul>
        </div>
        {user && (
          <div className="flex items-center gap-4 rounded-card bg-surface px-4 py-4 shadow-card">
            <Avatar name={user.name} tone="ink" size="lg" />
            <div className="min-w-0">
              <p className="break-words text-base font-bold text-ink">{user.name}</p>
              <p className="text-sm text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => void logout()}
          className="ui-press flex min-h-12 w-full items-center justify-center rounded-full border border-ink bg-transparent px-5 text-base font-semibold text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CABECERA
   ══════════════════════════════════════════ */

/**
 * Barra superior del teléfono y la tableta (< 1024 px, lámina 35): marca y, sólo
 * cuando falta, la conexión. No lleva el `h1` (lo pone cada vista) ni «Datos
 * sintéticos» (lo muestran `HeroPanel` y `PageHeader`). En escritorio no hay
 * barra superior: la sección queda para lectores de pantalla.
 */
function Header({
  section,
  isOnline,
  onMenuClick,
  menuOpen,
  menuId,
}: {
  section: string;
  isOnline: boolean;
  onMenuClick: () => void;
  menuOpen: boolean;
  menuId: string;
}) {
  return (
    <header className="ui-shell-header ui-safe-top ui-on-ink sticky top-0 z-20 bg-ink text-white lg:hidden">
      <div className="ui-shell-bar ui-gutter flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="font-display text-lg font-extrabold leading-tight">Agrocuentas</span>
          {/* Sección del menú, para lectores de pantalla: el título visible es el h1 de cada vista. */}
          <p className="sr-only" data-testid="shell-section">
            {section}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-0.5 text-sm font-semibold text-danger-ink" data-testid="connection-mobile">
              <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
              Sin conexión
            </span>
          )}
          {/* Teléfono en horizontal: la barra inferior se oculta y este botón abre «Más» con todas las tareas. */}
          <button
            type="button"
            onClick={onMenuClick}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            aria-controls={menuOpen ? menuId : undefined}
            className="ui-header-menu ui-press min-h-10 items-center gap-1.5 rounded-full border border-on-ink-muted px-3 text-sm font-semibold text-white focus-visible:outline-2"
          >
            <Icon d={ICON.menu} className="h-4 w-4" />
            Menú
          </button>
        </div>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════
   BARRA INFERIOR (teléfono, láminas 35 y 43)
   ══════════════════════════════════════════ */

function BottomNav({ menuOpen, onMore, onNavigate, menuId }: { menuOpen: boolean; onMore: () => void; onNavigate: () => void; menuId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const available = navItemsFor(user?.role);
  const items = MOBILE_BOTTOM_PATHS.map((path) => available.find((item) => item.path === path)).filter((item): item is NavItemDef => Boolean(item));
  if (available.length === 0) return null;
  const cell =
    'flex min-h-[4.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-xs leading-tight focus-visible:outline-2 focus-visible:-outline-offset-2';
  const pill = (active: boolean) => `inline-flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-ink text-lime' : 'text-ink'}`;
  // La sección actual vive en «Más» (Campañas, Histórico, Bitácora, Usuarios…): se marca «Más» (láminas 40–44).
  const inMore = !items.some((item) => isNavItemActive(item, location.pathname)) && available.some((item) => isNavItemActive(item, location.pathname));
  const moreActive = menuOpen || inMore;
  return (
    <nav className="ui-bottom-nav fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface lg:hidden" aria-label="Navegación rápida">
      {items.map((item) => {
        const active = !menuOpen && isNavItemActive(item, location.pathname);
        return (
          <Link
            key={item.path}
            to={item.path}
            // Con «Más» abierto, el destino reemplaza la entrada del historial del menú.
            replace={menuOpen}
            onClick={menuOpen ? onNavigate : undefined}
            aria-current={active ? 'page' : undefined}
            className={`${cell} ${active ? 'font-bold text-ink' : 'font-medium text-ink-muted'}`}
          >
            <span className={pill(active)}>
              <Icon d={ICON[item.icon]} className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <span className="max-w-full break-words">{item.short ?? item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        aria-controls={menuOpen ? menuId : undefined}
        data-section-in-more={inMore || undefined}
        className={`${cell} ${moreActive ? 'font-bold text-ink' : 'font-medium text-ink-muted'}`}
      >
        <span className={pill(moreActive)}>
          <Icon d={ICON.menu} className="h-6 w-6" strokeWidth={1.8} />
        </span>
        <span>Más</span>
      </button>
    </nav>
  );
}

/* ══════════════════════════════════════════
   ARMAZÓN
   ══════════════════════════════════════════ */

export interface AppShellProps {
  /** Título de la pestaña del navegador («<title> · Agrocuentas»). */
  title: string;
  /** Sección de la barra superior fuera del menú por tareas; dentro, se deriva de la ruta. */
  section: string;
  /** Controles propios de la vista, encima del contenido y a la derecha (ninguna vista lo usa hoy). */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Contadores adicionales del menú, por ruta o subvista (p. ej. `{ '/colectivo/catalogo?vista=identificacion': 6 }`).
   * Sólo se dibujan si la vista los pasa con un dato real del servidor; sin él, no hay contador. La
   * insignia «Por identificar» ya la pone el armazón (contexto `identification-pending`).
   */
  navCounts?: NavCounts;
}

/**
 * Armazón de la Web institucional (rediseño v2). Firma estable: `title` va al
 * título de la pestaña (el título visible es el `h1` de cada vista); la barra
 * muestra la sección, derivada de la ruta y, fuera del menú, `section`.
 * Escritorio: barra lateral oscura plegable. Teléfono y tableta (< 1024 px):
 * barra superior oscura, barra inferior con cuatro tareas y «Más».
 */
export function AppShell({ title, section, actions, children, navCounts }: AppShellProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  // Insignia «Por identificar» (H-02): sólo con un recuento real mayor que cero; sin dato no hay insignia.
  const pending = useIdentificationPending();
  const counts: NavCounts = { ...(pending !== null && pending > 0 ? { [IDENTIFICATION_PENDING_KEY]: pending } : {}), ...navCounts };
  const [menuOpen, setMenuOpen] = useState(false);
  const [rail, setRail] = useState(readRail);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const menuId = useId();
  /*
   * El menú «Más» ocupa una entrada del historial: el botón o gesto Atrás de
   * Android lo cierra en lugar de salir de la página (hallazgo H1 del
   * emulador). Cerrarlo con su botón, Escape o «Más» deshace esa entrada;
   * elegir una sección la reemplaza (enlaces con `replace`).
   */
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
  const toggleMenu = useCallback(() => (menuOpen ? closeMenu() : openMenu()), [menuOpen, closeMenu, openMenu]);
  const toggleRail = useCallback(() => {
    setRail((prev) => {
      writeRail(!prev);
      return !prev;
    });
  }, []);

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

  /*
   * Al llegar a otra ruta dentro de la aplicación (enlace o `navigate`), la vista
   * empieza arriba. Sólo cambia con `pathname`: `?vista=` y la consulta de la
   * misma ruta conservan la posición. Atrás y Adelante (POP) dejan la posición
   * que restaure el navegador. El foco no se mueve. `BrowserRouter` no admite
   * `ScrollRestoration` (exige un enrutador de datos), por eso es un efecto.
   */
  useEffect(() => {
    if (navigationType === 'POP') return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Sólo al cambiar de ruta: el tipo de navegación se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // El nombre de la vista no se repite en la barra: queda en el título de la pestaña.
  useEffect(() => {
    document.title = `${title} · Agrocuentas`;
  }, [title]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <Sidebar rail={rail} onToggleRail={toggleRail} counts={counts} isOnline={isOnline} />
      {menuOpen && <MoreMenu id={menuId} onClose={closeMenu} onNavigate={leaveMenu} />}

      <div className="ui-content" data-rail={rail}>
        <Header section={sectionLabelFor(location.pathname, section)} isOnline={isOnline} onMenuClick={toggleMenu} menuOpen={menuOpen} menuId={menuId} />
        <main id="contenido" tabIndex={-1} className="ui-gutter ui-main mx-auto max-w-[1400px] pt-5 focus:outline-none lg:pt-8">
          {actions && <div className="mb-4 flex flex-wrap justify-end gap-2">{actions}</div>}
          {children}
        </main>
      </div>

      <BottomNav menuOpen={menuOpen} onMore={toggleMenu} onNavigate={leaveMenu} menuId={menuId} />
    </div>
  );
}

/* ══════════════════════════════════════════
   PIEZAS HEREDADAS (se conservan sus firmas; estilo v2)
   ══════════════════════════════════════════ */

/** Movido a `components/ui` (rediseño 2026-11-10); se re-exporta para no romper importaciones. */
export { Notice } from './ui';

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="skeleton h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function EmptyState({ icon, title, description, compact = false }: { icon?: ReactNode; title: string; description?: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-7' : 'py-16'}`}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] bg-sunken text-ink" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>}
    </div>
  );
}

/**
 * Tarjeta de cifra de las vistas heredadas (bitácora). `color` se conserva en
 * la firma pero no tiñe el icono (un solo acento).
 */
export function StatCard({ label, value, icon, trend }: { label: string; value: string | number; icon?: ReactNode; trend?: string; color?: 'emerald' | 'red' | 'amber' | 'sky' | 'violet' | 'slate' }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-ink tabular-nums">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-ink-muted">{trend}</p>}
        </div>
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-sunken text-ink" aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/** Unificado en `StatusChip` (components/ui): mismos textos, motivo de divulgación en `title`. */
export function StatusBadge({ status }: { status: string }) {
  return <StatusChip status={status} />;
}

export function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE_COLORS[role] ?? 'bg-sunken text-ink ring-ink/15';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{ROLE_LABELS[role] ?? role}</span>;
}

/**
 * Diálogo heredado: ahora delega en `Dialog` (components/ui), con foco inicial,
 * trampa de foco, Esc, retorno del foco y hoja inferior en el teléfono. Firma
 * sin cambios.
 */
export function Modal({ title, children, onClose, size = 'md' }: { title: string; children: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Dialog title={title} label={title} onClose={onClose} size={size}>
      <div className="pb-6">{children}</div>
    </Dialog>
  );
}

/* ══════════════════════════════════════════
   CLASES COMPARTIDAS
   ══════════════════════════════════════════ */

/* Clases movidas a `components/ui/classes.ts` con los tokens nuevos; se re-exportan. */
// eslint-disable-next-line react-refresh/only-export-components -- re-exportación de compatibilidad de constantes
export { buttonClass, cardClass, dangerButtonClass, inputClass, labelClass, secondaryButtonClass } from './ui';

export { UserAvatar, ROLE_LABELS, ROLE_COLORS, ROLE_BADGE_COLORS };
