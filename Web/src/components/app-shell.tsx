import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useIdentificationPending } from '../contexts/identification-pending';
import { IDENTIFICATION_PENDING_KEY, sectionLabelFor } from '../lib/navigation';
import {
  MENU_HISTORY_KEY,
  menuEntryToken,
  readRail,
  ROLE_BADGE_COLORS,
  ROLE_COLORS,
  ROLE_LABELS,
  writeRail,
  type NavCounts,
} from './app-shell/app-shell.helpers';
import { BottomNav, Header, MoreMenu } from './app-shell/mobile-nav';
import { EmptyState, Modal, RoleBadge, SkeletonRow, StatCard, StatusBadge } from './app-shell/shell-primitives';
import { Sidebar, UserAvatar } from './app-shell/sidebar';

export type { NavCounts };

export interface AppShellProps {
  /** Título de la pestaña del navegador («<title> · Agrocuentas»). */
  title: string;
  /** Sección de la barra superior fuera del menú por tareas; dentro, se deriva de la ruta. */
  section: string;
  /** Controles propios de la vista, encima del contenido y a la derecha. */
  actions?: ReactNode;
  children: ReactNode;
  /** Contadores adicionales del menú, por ruta o subvista. */
  navCounts?: NavCounts;
}

/**
 * Armazón de la Web institucional (rediseño v2).
 * Escritorio: barra lateral oscura plegable. Teléfono y tableta (< 1024 px):
 * barra superior oscura, barra inferior con cuatro tareas y «Más».
 */
export function AppShell({ title, section, actions, children, navCounts }: AppShellProps) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const pending = useIdentificationPending();
  const counts: NavCounts = {
    ...(pending !== null && pending > 0 ? { [IDENTIFICATION_PENDING_KEY]: pending } : {}),
    ...navCounts,
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [rail, setRail] = useState(readRail);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const menuId = useId();
  const menuToken = useRef<string | null>(null);

  const openMenu = useCallback(() => {
    const state: unknown = window.history.state;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    menuToken.current = token;
    window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), [MENU_HISTORY_KEY]: token }, '');
    setMenuOpen(true);
  }, []);
  const closeMenu = useCallback(() => {
    if (menuToken.current && menuEntryToken(window.history.state) === menuToken.current) window.history.back();
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

  useEffect(() => {
    if (navigationType === 'POP') return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    // Sólo al cambiar de ruta: el tipo de navegación se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

/** Movido a `components/ui` (rediseño 2026-11-10); se re-exporta para no romper importaciones. */
export { Notice } from './ui';
export { SkeletonRow, EmptyState, StatCard, StatusBadge, RoleBadge, Modal };
// eslint-disable-next-line react-refresh/only-export-components -- re-exportación de compatibilidad de constantes
export { buttonClass, cardClass, dangerButtonClass, inputClass, labelClass, secondaryButtonClass } from './ui';
export { UserAvatar, ROLE_LABELS, ROLE_COLORS, ROLE_BADGE_COLORS };
