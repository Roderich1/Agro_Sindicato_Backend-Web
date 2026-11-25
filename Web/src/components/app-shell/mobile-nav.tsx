import { useEffect, useId, useRef, type Ref } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth';
import {
  isNavItemActive,
  MOBILE_BOTTOM_PATHS,
  NAV_ITEMS,
  navItemsFor,
  type NavItemDef,
} from '../../lib/navigation';
import { Avatar, ICON, Icon, IconButton } from '../ui';
import { ROLE_LABELS } from './app-shell.helpers';
import { BrandMark } from './sidebar';

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
 * Menú «Más» del teléfono: diálogo modal a pantalla completa con foco atrapado.
 */
export function MoreMenu({ onClose, onNavigate, id }: { onClose: () => void; onNavigate: () => void; id: string }) {
  const { user, logout } = useAuth();
  const items = navItemsFor(user?.role);
  const secondary = NAV_ITEMS.filter((item) => items.includes(item) && !MOBILE_BOTTOM_PATHS.includes(item.path));
  const primary = items.filter((item) => MOBILE_BOTTOM_PATHS.includes(item.path));
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = firstLinkRef.current;
    const firstVisible =
      first && !(first.closest<HTMLElement>('.ui-more-primary') && window.getComputedStyle(first.closest<HTMLElement>('.ui-more-primary')!).display === 'none');
    (firstVisible ? first : panelRef.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
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

/** Barra superior del teléfono y la tableta (< 1024 px). */
export function Header({
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

export function BottomNav({ menuOpen, onMore, onNavigate, menuId }: { menuOpen: boolean; onMore: () => void; onNavigate: () => void; menuId: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const available = navItemsFor(user?.role);
  const items = MOBILE_BOTTOM_PATHS.map((path) => available.find((item) => item.path === path)).filter((item): item is NavItemDef => Boolean(item));
  if (available.length === 0) return null;
  const cell =
    'flex min-h-[4.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-center text-xs leading-tight focus-visible:outline-2 focus-visible:-outline-offset-2';
  const pill = (active: boolean) => `inline-flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-ink text-lime' : 'text-ink'}`;
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
