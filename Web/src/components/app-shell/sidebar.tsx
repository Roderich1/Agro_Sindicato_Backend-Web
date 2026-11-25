import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth';
import {
  activeSubItem,
  isNavItemActive,
  NAV_SECTIONS,
  navItemsFor,
  subItemPath,
  type NavItemDef,
} from '../../lib/navigation';
import { Avatar, ICON, Icon, IconButton, initialsOf } from '../ui';
import { ROLE_COLORS, ROLE_LABELS, type NavCounts } from './app-shell.helpers';

/** Marca: cuadro lima con el brote. Decorativa (el nombre va escrito al lado). */
export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-lime text-ink ${size === 'sm' ? 'h-8 w-8 rounded-[10px]' : 'h-11 w-11 rounded-[14px]'}`} aria-hidden="true">
      <Icon d={ICON.sprout} className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} strokeWidth={2.2} />
    </span>
  );
}

/** Iniciales sobre fondo sólido; `gradient` conserva su nombre, pero recibe las clases de fondo de `ROLE_COLORS`. */
export function UserAvatar({ name, size = 'md', gradient }: { name: string; size?: 'sm' | 'md' | 'lg'; gradient?: string }) {
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

const SIDE_LINK =
  'relative flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[16px] px-4 py-2.5 text-base focus-visible:outline-2 focus-visible:-outline-offset-2';

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

export function Sidebar({ rail, onToggleRail, counts, isOnline }: { rail: boolean; onToggleRail: () => void; counts?: NavCounts; isOnline: boolean }) {
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
