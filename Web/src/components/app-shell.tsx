import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { fmtDate } from '../lib/format';
import { readOfflineQueue, subscribeOfflineQueue } from '../lib/offline-queue';

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
    label: 'Campanas',
    to: '/campaigns',
    icon: <NavIcon d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  },
  {
    label: 'Parcelas',
    to: '/plots',
    icon: <NavIcon d="M4 20h16M5 20V8l7-4 7 4v12M9 20v-6h6v6M8 10h.01M16 10h.01" />,
  },
  {
    label: 'Inventario',
    to: '/inventory',
    icon: <NavIcon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />,
    excludeDirectiva: true,
  },
  {
    label: 'Aplicaciones',
    to: '/applications',
    icon: <NavIcon d="M9 3h6m-7 4h8m-9 4h10M8 21h8a3 3 0 003-3V6a3 3 0 00-3-3H8a3 3 0 00-3 3v12a3 3 0 003 3zm4-6v3m-1.5-1.5h3" />,
  },
  {
    label: 'Calendario',
    to: '/calendar',
    icon: <NavIcon d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2zm2-6h4m-2-2v4" />,
  },
  {
    label: 'Reportes',
    to: '/reports',
    icon: <NavIcon d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />,
  },
  {
    label: 'Bitacora',
    to: '/audit-logs',
    icon: <NavIcon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    roles: ['DIRECTIVA', 'ADMINISTRADOR'],
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
  mobileOpen,
  onMobileClose,
  offlineQueueCount = 0,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  offlineQueueCount?: number;
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

      <div className="mx-4 border-t border-white/8" />

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegación principal">
        {filteredNav.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
          const isSync = item.to === '/sync';
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onMobileClose}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                isActive ? 'bg-white/12 text-white' : 'text-slate-400 hover:bg-white/6 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <span className={`shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`}>
                {item.icon}
              </span>
              {!collapsed && <span className="sidebar-item-text">{item.label}</span>}
              {isSync && offlineQueueCount > 0 && (
                <span className={`absolute ${collapsed ? '-top-1 -right-1' : 'right-3'} flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white`}>
                  {offlineQueueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 border-t border-white/8" />

      <div className={`p-4 ${collapsed ? 'flex flex-col items-center' : ''}`}>
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
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 ${collapsed ? 'mt-1' : ''}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden" onClick={onMobileClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[#0f1d15] lg:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </aside>
      <aside className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col bg-[#0f1d15] ${collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'}`}>
        {sidebarContent}
      </aside>
    </>
  );
}

/* ══════════════════════════════════════════
   HEADER COMPONENT
   ══════════════════════════════════════════ */

function Header({ title, section, actions, onMenuClick, isOnline }: { title: string; section: string; actions?: ReactNode; onMenuClick: () => void; isOnline: boolean }) {
  const { activeCampaign, isLoading } = useCampaign();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">{section}</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/campaigns"
            className={`hidden rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset sm:inline-flex ${
              activeCampaign
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-500/20'
                : 'bg-amber-50 text-amber-700 ring-amber-500/20'
            }`}
          >
            {isLoading
              ? 'Campana...'
              : activeCampaign
                ? `${activeCampaign.name} · ${fmtDate(activeCampaign.startDate)}`
                : 'Sin campana activa'}
          </Link>
          <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </div>
          {actions}
        </div>
      </div>
      <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />
    </header>
  );
}

/* ══════════════════════════════════════════
   APP SHELL
   ══════════════════════════════════════════ */

export function AppShell({ title, section, actions, children }: { title: string; section: string; actions?: ReactNode; children: ReactNode }) {
  const { user } = useAuth();
  const collapsed = false;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(() => readOfflineQueue().length);
  const availableNav = NAV_ITEMS.filter((item) => {
    if (item.roles && !item.roles.includes(user?.role ?? '')) return false;
    if (item.excludeDirectiva && user?.role === 'DIRECTIVA') return false;
    return true;
  });
  const preferredMobilePaths = user?.role === 'AGRICULTOR'
    ? ['/dashboard', '/plots', '/inventory', '/applications']
    : user?.role === 'DIRECTIVA'
      ? ['/dashboard', '/campaigns', '/plots', '/directiva']
      : ['/dashboard', '/campaigns', '/plots', '/applications'];
  const mobileNav = preferredMobilePaths
    .map((path) => availableNav.find((item) => item.to === path))
    .filter((item): item is NavItem => Boolean(item));

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  useEffect(() => subscribeOfflineQueue(setOfflineQueueCount), []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        offlineQueueCount={offlineQueueCount}
      />

      <div className={`transition-all duration-300 lg:pl-[260px] ${collapsed ? 'lg:!pl-[72px]' : ''}`}>
        <Header title={title} section={section} actions={actions} onMenuClick={() => setMobileOpen(true)} isOnline={isOnline} />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 pb-24 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 bg-white lg:hidden">
        {mobileNav.map((item) => (
          <Link key={item.to} to={item.to} className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-500">
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/* ══════════════════════════════════════════
   NOTICE / TOAST
   ══════════════════════════════════════════ */

export function Notice({ kind, children }: { kind: 'ok' | 'error' | 'info' | 'warn'; children: ReactNode }) {
  const configs = {
    ok: { bg: 'bg-emerald-50/80', text: 'text-emerald-800', border: 'border-emerald-200', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    error: { bg: 'bg-red-50/80', text: 'text-red-800', border: 'border-red-200', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    warn: { bg: 'bg-amber-50/80', text: 'text-amber-800', border: 'border-amber-200', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
    info: { bg: 'bg-sky-50/80', text: 'text-sky-800', border: 'border-sky-200', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  };

  const c = configs[kind];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-sm ${c.bg} ${c.text} ${c.border}`}>
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={c.icon} /></svg>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return <tr>{Array.from({ length: cols }).map((_, i) => <td key={i} className="px-5 py-3.5"><div className="skeleton h-4 w-full rounded-md" /></td>)}</tr>;
}

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-300">{icon}</div>}
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-xs text-slate-400">{description}</p>}
    </div>
  );
}

export function StatCard({ label, value, icon, trend, color = 'emerald' }: { label: string; value: string | number; icon?: ReactNode; trend?: string; color?: 'emerald' | 'red' | 'amber' | 'sky' | 'violet' | 'slate' }) {
  const colorClasses: Record<string, string> = { emerald: 'from-emerald-500 to-green-600', red: 'from-red-500 to-rose-600', amber: 'from-amber-500 to-orange-500', sky: 'from-sky-500 to-blue-600', violet: 'from-violet-500 to-purple-600', slate: 'from-slate-500 to-slate-700' };
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          {trend && <p className="mt-1 text-xs font-medium text-slate-400">{trend}</p>}
        </div>
        {icon && <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${colorClasses[color]} text-white shadow-sm`}>{icon}</div>}
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

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDIENTE: { label: 'Pendiente', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    PARCIAL: { label: 'Parcial', cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20' },
    PAGADA: { label: 'Pagada', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    VENCIDA: { label: 'Vencida', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    PLANIFICADA: { label: 'Planificada', cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20' },
    ABIERTA: { label: 'Abierta', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    CERRADA: { label: 'Cerrada', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    CANCELADA: { label: 'Cancelada', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    ACTIVA: { label: 'Activa', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    INACTIVA: { label: 'Inactiva', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    ACTIVO: { label: 'Activo', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    CAMBIADO: { label: 'Cambiado', cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20' },
    FINALIZADO: { label: 'Finalizado', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    ENTRADA: { label: 'Entrada', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    SALIDA: { label: 'Salida', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    AJUSTE: { label: 'Ajuste', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    REGISTRADA: { label: 'Registrada', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    ANULADA: { label: 'Anulada', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    BORRADOR: { label: 'Borrador', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    PROGRAMADA: { label: 'Programada', cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20' },
    CONFIRMADA: { label: 'Confirmada', cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20' },
    RECIBIDA_PARCIAL: { label: 'Recepción parcial', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    RECIBIDA: { label: 'Recibida', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    COMPLETADO: { label: 'Completado', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    CREAR: { label: 'Crear', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    ACTUALIZAR: { label: 'Actualizar', cls: 'bg-sky-500/10 text-sky-700 ring-sky-500/20' },
    INACTIVAR: { label: 'Inactivar', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    ELIMINAR: { label: 'Eliminar', cls: 'bg-red-500/10 text-red-700 ring-red-500/20' },
    ABRIR_CAMPANA: { label: 'Abrir campana', cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' },
    CERRAR_CAMPANA: { label: 'Cerrar campana', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
    AJUSTAR_STOCK: { label: 'Ajustar stock', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20' },
    REGISTRAR_PAGO: { label: 'Registrar pago', cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20' },
    SINCRONIZAR: { label: 'Sincronizar', cls: 'bg-violet-500/10 text-violet-700 ring-violet-500/20' },
    OTRO: { label: 'Otro', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cls}`}>{label}</span>;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`w-full ${sizeClasses[size]} rounded-2xl bg-white p-6 shadow-xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
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
