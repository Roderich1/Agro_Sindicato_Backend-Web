import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  DIRECTIVA: 'Directiva',
  AGRICULTOR: 'Agricultor',
};

const ROLE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'from-violet-500 to-purple-600',
  DIRECTIVA: 'from-teal-500 to-cyan-600',
  AGRICULTOR: 'from-emerald-500 to-green-600',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-violet-500/10 text-violet-700 ring-violet-500/20',
  DIRECTIVA: 'bg-teal-500/10 text-teal-700 ring-teal-500/20',
  AGRICULTOR: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20',
};

/* ══════════════════════════════════════════
   NAVIGATION ITEMS
   ══════════════════════════════════════════ */

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  roles?: string[];
  /** If set, DIRECTIVA is excluded */
  excludeDirectiva?: boolean;
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: <NavIcon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  },
  {
    label: 'Inventario',
    to: '/inventory',
    icon: <NavIcon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />,
    excludeDirectiva: true,
  },
  {
    label: 'Compras',
    to: '/purchases',
    icon: <NavIcon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
    excludeDirectiva: true,
  },
  {
    label: 'Directiva',
    to: '/directiva',
    icon: <NavIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
    roles: ['DIRECTIVA', 'ADMINISTRADOR'],
  },
  {
    label: 'Sincronización',
    to: '/sync',
    icon: <NavIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    excludeDirectiva: true,
  },
  {
    label: 'Usuarios',
    to: '/users',
    icon: <NavIcon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    roles: ['ADMINISTRADOR'],
  },
];

/* ══════════════════════════════════════════
   AVATAR COMPONENT
   ══════════════════════════════════════════ */

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
    <div
      className={`${sizeClasses[size]} flex items-center justify-center rounded-full bg-gradient-to-br ${gradient ?? 'from-emerald-500 to-green-600'} font-bold text-white shadow-sm ring-2 ring-white/20`}
    >
      {initials}
    </div>
  );
}

/* ══════════════════════════════════════════
   SIDEBAR COMPONENT
   ══════════════════════════════════════════ */

function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredNav = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(user?.role ?? '')) return false;
    if (item.excludeDirectiva && user?.role === 'DIRECTIVA') return false;
    return true;
  });

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-emerald-900/30">
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
          </svg>
        </div>
        {!collapsed && (
          <div className="sidebar-item-text">
            <p className="text-sm font-bold text-white">Agro PWA</p>
            <p className="text-[10px] font-medium text-emerald-400/80 tracking-wider uppercase">{user?.tenant?.name}</p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-white/8" />

      {/* Nav Items */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegación principal">
        {filteredNav.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/12 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/6 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <span className={`shrink-0 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="sidebar-item-text">{item.label}</span>}
              {isActive && !collapsed && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 border-t border-white/8" />

      {/* User Section */}
      <div className={`p-4 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
        {user && (
          <div className={`flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
            <UserAvatar name={user.name} size="md" gradient={ROLE_COLORS[user.role]} />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="text-[11px] text-slate-400">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => void logout()}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 ${collapsed ? '' : ''}`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>

      {/* Collapse Toggle (desktop only) */}
      <div className="hidden lg:block border-t border-white/8 p-3">
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-white/6 hover:text-slate-300"
        >
          <svg className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={onMobileClose}>
          <div className="absolute inset-0 modal-backdrop" />
        </div>
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[#0f1d15] transition-transform duration-300 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col bg-[#0f1d15] sidebar-transition ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

/* ══════════════════════════════════════════
   HEADER COMPONENT
   ══════════════════════════════════════════ */

function Header({
  title,
  section,
  actions,
  onMenuClick,
  sidebarCollapsed,
}: {
  title: string;
  section: string;
  actions?: ReactNode;
  onMenuClick: () => void;
  sidebarCollapsed: boolean;
}) {
  return (
    <header
      className={`sticky top-0 z-20 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl transition-all duration-300`}
      style={{ marginLeft: 0 }}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            aria-label="Abrir menú"
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600">{section}</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
    </header>
  );
}

/* ══════════════════════════════════════════
   APP SHELL
   ══════════════════════════════════════════ */

export function AppShell({
  title,
  section,
  actions,
  children,
}: {
  title: string;
  section: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Skip link */}
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content area */}
      <div
        className={`sidebar-transition ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-[260px]'}`}
      >
        <Header
          title={title}
          section={section}
          actions={actions}
          onMenuClick={() => setMobileOpen(true)}
          sidebarCollapsed={collapsed}
        />

        {/* Live region for accessible notifications */}
        <div aria-live="polite" aria-atomic="true" className="sr-only" id="live-region" />

        <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTICE / TOAST
   ══════════════════════════════════════════ */

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'info' | 'warn'; children: ReactNode }) {
  const configs = {
    ok: {
      bg: 'bg-emerald-50/80',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      icon: (
        <svg className="h-5 w-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-red-50/80',
      text: 'text-red-800',
      border: 'border-red-200',
      icon: (
        <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    warn: {
      bg: 'bg-amber-50/80',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: (
        <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    info: {
      bg: 'bg-sky-50/80',
      text: 'text-sky-800',
      border: 'border-sky-200',
      icon: (
        <svg className="h-5 w-5 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  };

  const c = configs[kind];
  const role = kind === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${c.bg} ${c.text} ${c.border} animate-fade-in`}
    >
      {c.icon}
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SKELETON ROW
   ══════════════════════════════════════════ */

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-3.5">
          <div className="skeleton h-4 w-full rounded-md" />
        </td>
      ))}
    </tr>
  );
}

/* ══════════════════════════════════════════
   EMPTY STATE
   ══════════════════════════════════════════ */

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100/80 text-slate-300">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-xs text-slate-400 leading-relaxed">{description}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════
   STAT CARD
   ══════════════════════════════════════════ */

export function StatCard({
  label,
  value,
  icon,
  trend,
  color = 'emerald',
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: string;
  color?: 'emerald' | 'red' | 'amber' | 'sky' | 'violet' | 'slate';
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'from-emerald-500 to-green-600',
    red: 'from-red-500 to-rose-600',
    amber: 'from-amber-500 to-orange-500',
    sky: 'from-sky-500 to-blue-600',
    violet: 'from-violet-500 to-purple-600',
    slate: 'from-slate-500 to-slate-700',
  };

  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-slate-400">{trend}</p>}
        </div>
        {icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${colorClasses[color]} text-white shadow-sm`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   BADGES
   ══════════════════════════════════════════ */

export function CriticalityBadge({ value }: { value: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    VENCIDO:     { label: 'Vencido',     cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    BAJO_MINIMO: { label: 'Bajo mínimo', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    POR_VENCER:  { label: 'Por vencer',  cls: 'bg-orange-500/10 text-orange-700 ring-orange-500/20' },
    OK:          { label: 'OK',          cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
  };
  const { label, cls } = map[value] ?? { label: value, cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    PARCIAL:   { label: 'Parcial',   cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20' },
    PAGADA:    { label: 'Pagada',    cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    VENCIDA:   { label: 'Vencida',   cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_BADGE_COLORS[role] ?? 'bg-slate-500/10 text-slate-600 ring-slate-500/20';
  const label = ROLE_LABELS[role] ?? role;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

/* ══════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════ */

export function Modal({ title, children, onClose, size = 'md' }: { title: string; children: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 modal-backdrop animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        ref={ref}
        className={`w-full ${sizeClasses[size]} rounded-2xl bg-white p-6 shadow-xl animate-scale-in`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SHARED STYLE CLASSES
   ══════════════════════════════════════════ */

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:shadow-sm disabled:bg-slate-50 disabled:text-slate-500 hover:border-slate-300';

export const labelClass = 'block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5';

export const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-all duration-200 hover:from-emerald-700 hover:to-green-700 hover:shadow-md hover:shadow-emerald-600/25 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm active:scale-[0.98]';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]';

export const dangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 shadow-sm transition-all duration-200 hover:bg-red-100 hover:border-red-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]';

export const cardClass = 'glass-card p-5';

export { UserAvatar, ROLE_LABELS, ROLE_COLORS, ROLE_BADGE_COLORS };
