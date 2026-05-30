import React from 'react';
import { Link } from 'react-router-dom';
import { AppShell, UserAvatar, ROLE_COLORS, ROLE_LABELS } from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';

const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-violet-500/10 text-violet-700',
  DIRECTIVA: 'bg-teal-500/10 text-teal-700',
  AGRICULTOR: 'bg-emerald-500/10 text-emerald-700',
};

interface ModuleCard {
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  to: string;
  badge?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('es-BO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === 'ADMINISTRADOR';
  const isDirectiva = user.role === 'DIRECTIVA';
  const canUseDirectiva = user.role === 'DIRECTIVA' || user.role === 'ADMINISTRADOR';

  const cards: ModuleCard[] = isDirectiva
    ? [
        {
          title: 'Panel Directiva',
          desc: 'Consulta el inventario global de todos los agricultores y crea compras conjuntas del sindicato.',
          icon: <ModuleIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
          gradient: 'from-teal-500/10 to-cyan-500/10',
          iconBg: 'from-teal-500 to-cyan-600',
          to: '/directiva',
        },
      ]
    : [
        ...(isAdmin
          ? [
              {
                title: 'Usuarios',
                desc: 'Crea y administra accesos para integrantes de la organización.',
                icon: <ModuleIcon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
                gradient: 'from-violet-500/10 to-purple-500/10',
                iconBg: 'from-violet-500 to-purple-600',
                to: '/users',
              },
            ]
          : []),
        {
          title: 'Inventario',
          desc: 'Controla stock, productos agroquímicos, lotes, vencimientos y ajustes.',
          icon: <ModuleIcon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />,
          gradient: 'from-emerald-500/10 to-green-500/10',
          iconBg: 'from-emerald-500 to-green-600',
          to: '/inventory',
        },
        {
          title: 'Compras',
          desc: 'Registra compras al contado o crédito, gestiona proveedores y genera entradas.',
          icon: <ModuleIcon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
          gradient: 'from-sky-500/10 to-blue-500/10',
          iconBg: 'from-sky-500 to-blue-600',
          to: '/purchases',
        },
        {
          title: 'Cuentas por pagar',
          desc: 'Gestiona abonos, pagos totales y controla vencimientos con proveedores.',
          icon: <ModuleIcon d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />,
          gradient: 'from-amber-500/10 to-orange-500/10',
          iconBg: 'from-amber-500 to-orange-500',
          to: '/purchases',
        },
        ...(canUseDirectiva
          ? [
              {
                title: 'Directiva',
                desc: 'Consulta inventario global y crea compras conjuntas del sindicato.',
                icon: <ModuleIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
                gradient: 'from-teal-500/10 to-emerald-500/10',
                iconBg: 'from-teal-500 to-emerald-600',
                to: '/directiva',
              },
            ]
          : []),
        {
          title: 'Sincronización',
          desc: 'Guarda operaciones sin internet y sincroniza cuando tengas conexión.',
          icon: <ModuleIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
          gradient: 'from-lime-500/10 to-green-500/10',
          iconBg: 'from-lime-500 to-green-500',
          to: '/sync',
        },
      ];

  return (
    <AppShell title="Panel principal" section="Dashboard">
      {/* Hero Section */}
      <div className="mb-8 animate-slide-up">
        <div className="glass-card p-6 sm:p-8 relative overflow-hidden">
          {/* Decorative gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-sky-500/5 pointer-events-none" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <UserAvatar name={user.name} size="lg" gradient={ROLE_COLORS[user.role]} />
              <div>
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                  {getGreeting()}, {user.name.split(' ')[0]} 👋
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  <span className="capitalize">{formatCurrentDate()}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${ROLE_BADGE_COLORS[user.role] ?? 'bg-slate-100 text-slate-600'}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1.5 text-xs font-medium text-slate-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {user.tenant.name}
              </span>
            </div>
          </div>

          {isDirectiva && (
            <div className="relative mt-4 flex items-center gap-2 rounded-xl bg-teal-500/8 px-4 py-2.5 text-sm font-medium text-teal-800 ring-1 ring-teal-500/15">
              <svg className="h-4 w-4 shrink-0 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tienes acceso al panel de directiva con datos globales del sindicato.
            </div>
          )}
        </div>
      </div>

      {/* Module Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, idx) => (
          <Link
            key={card.title + card.to}
            to={card.to}
            className="group glass-card relative overflow-hidden p-6 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-600/8 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-emerald-500 animate-slide-up"
            style={{ animationDelay: `${idx * 70}ms` }}
          >
            {/* Gradient overlay on hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none`} />

            <div className="relative">
              {/* Icon */}
              <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.iconBg} text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md`}>
                {card.icon}
              </div>

              {/* Title + badge */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-slate-800 group-hover:text-slate-900">{card.title}</h3>
                {card.badge && (
                  <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-500/20">{card.badge}</span>
                )}
              </div>

              {/* Description */}
              <p className="mt-2 text-sm leading-relaxed text-slate-500 group-hover:text-slate-600">{card.desc}</p>

              {/* Arrow */}
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-600 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1">
                Abrir módulo
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

/* ── Helper ── */
function ModuleIcon({ d }: { d: string }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
