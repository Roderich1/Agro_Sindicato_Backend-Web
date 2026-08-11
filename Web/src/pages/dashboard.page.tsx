import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, UserAvatar, ROLE_COLORS, ROLE_LABELS, StatCard } from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';
import { inventoryService, payablesService } from '../services/inventory.service';
import type { InventoryAlertResponse, PayableAccount } from '../types/inventory';

/* ── Helpers ── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function formatCurrentDate(): string {
  return new Date().toLocaleDateString('es-BO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

/* ── Module card interface ── */
interface ModuleCard {
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  iconBg: string;
  to: string;
  badge?: string | number;
  badgeColor?: string;
  shortcut?: string;
}

/* ── Icons helper ── */
function ModuleIcon({ d }: { d: string }) {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* ── Role badge styles ── */
const ROLE_BADGE: Record<string, string> = {
  ADMINISTRADOR: 'bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/20',
  DIRECTIVA:     'bg-teal-500/12 text-teal-700 ring-1 ring-teal-500/20',
  AGRICULTOR:    'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/20',
};

/* ═══════════════════════════════════════════
   DASHBOARD PAGE
   ═══════════════════════════════════════════ */
export function DashboardPage() {
  const { user } = useAuth();

  /* Live KPI state */
  const [kpi, setKpi] = useState({
    products: 0, lots: 0, alerts: 0, overduePayables: 0, totalDebt: 0,
  });
  const [loadingKpi, setLoadingKpi] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingKpi(true);
      try {
        const results = await Promise.allSettled([
          inventoryService.stock({}),
          inventoryService.alerts(),
          payablesService.list({ status: 'VENCIDA' }),
          payablesService.list({}),
        ]);

        const stockData  = results[0].status === 'fulfilled' ? results[0].value : [];
        const alertData  = results[1].status === 'fulfilled' ? (results[1].value as InventoryAlertResponse) : null;
        const overdueAcc = results[2].status === 'fulfilled' ? (results[2].value as PayableAccount[]) : [];
        const allAcc     = results[3].status === 'fulfilled' ? (results[3].value as PayableAccount[]) : [];

        const productSet = new Set((stockData as { product: { id: string } }[]).map((s) => s.product.id));
        const totalDebt  = allAcc.filter((p) => p.status !== 'PAGADA').reduce((s, p) => s + Number(p.balance), 0);

        setKpi({
          products:        productSet.size,
          lots:            (stockData as unknown[]).length,
          alerts:          alertData?.total ?? 0,
          overduePayables: overdueAcc.length,
          totalDebt,
        });
      } catch {
        /* silencioso */
      } finally {
        setLoadingKpi(false);
      }
    };
    void load();
  }, []);

  if (!user) return null;

  const isAdmin      = user.role === 'ADMINISTRADOR';
  const isDirectiva  = user.role === 'DIRECTIVA';
  const canDirectiva = isDirectiva || isAdmin;

  /* ── Module cards by role ── */
  const cards: ModuleCard[] = isDirectiva
    ? [
        {
          title: 'Panel Directiva',
          desc:  'Consulta inventario global de agricultores y crea compras conjuntas del sindicato.',
          icon:  <ModuleIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
          gradient: 'from-teal-500/10 to-cyan-500/10',
          iconBg:   'from-teal-500 to-cyan-600',
          to:       '/directiva',
          shortcut: 'Vista principal',
        },
      ]
    : [
        ...(isAdmin
          ? [{
              title: 'Usuarios',
              desc:  'Crea y administra accesos para integrantes de la organización.',
              icon:  <ModuleIcon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
              gradient: 'from-violet-500/10 to-purple-500/10',
              iconBg:   'from-violet-500 to-purple-600',
              to:       '/users',
            }]
          : []),
        {
          title: 'Inventario',
          desc:  'Controla stock, lotes, vencimientos y ajustes de agroquímicos.',
          icon:  <ModuleIcon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />,
          gradient: 'from-emerald-500/10 to-green-500/10',
          iconBg:   'from-emerald-500 to-green-600',
          to:       '/inventory',
          badge:    kpi.alerts > 0 ? kpi.alerts : undefined,
          badgeColor: 'bg-amber-500/15 text-amber-700 ring-amber-500/25',
          shortcut: `${kpi.products} productos`,
        },
        {
          title: 'Compras',
          desc:  'Registra compras al contado o crédito, gestiona proveedores.',
          icon:  <ModuleIcon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />,
          gradient: 'from-sky-500/10 to-blue-500/10',
          iconBg:   'from-sky-500 to-blue-600',
          to:       '/purchases',
          badge:    kpi.overduePayables > 0 ? kpi.overduePayables : undefined,
          badgeColor: 'bg-red-500/15 text-red-700 ring-red-500/25',
          shortcut: kpi.totalDebt > 0 ? `Bs ${kpi.totalDebt.toFixed(0)} pendiente` : 'Sin deudas',
        },
        ...(canDirectiva
          ? [{
              title: 'Directiva',
              desc:  'Consulta inventario global y crea compras conjuntas del sindicato.',
              icon:  <ModuleIcon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
              gradient: 'from-teal-500/10 to-emerald-500/10',
              iconBg:   'from-teal-500 to-emerald-600',
              to:       '/directiva',
            }]
          : []),
        {
          title: 'Sincronización',
          desc:  'Guarda operaciones sin internet y sincroniza cuando tengas conexión.',
          icon:  <ModuleIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
          gradient: 'from-lime-500/10 to-green-500/10',
          iconBg:   'from-lime-500 to-green-500',
          to:       '/sync',
          shortcut: 'Modo offline',
        },
      ];

  return (
    <AppShell title="Panel principal" section="Dashboard">

      {/* ── HERO SECTION ── */}
      <div className="mb-8 animate-slide-up">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a3d2a] via-[#0d5238] to-[#064e36] p-6 sm:p-8 shadow-lg shadow-emerald-900/20">

          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-teal-400/8 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djZoNnYtNmgtNnptNiA2djZoNnYtNmgtNnptLTEyIDB2Nmg2di02aC02em0xMiAwdi02aDZ2NmgtNnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* User greeting */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <UserAvatar name={user.name} size="lg" gradient={ROLE_COLORS[user.role]} />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-white/20">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse-soft" />
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400/80">
                  {getGreeting()}
                </p>
                <h2 className="mt-0.5 text-xl font-bold text-white sm:text-2xl">
                  {user.name.split(' ')[0]} 👋
                </h2>
                <p className="mt-0.5 text-sm capitalize text-emerald-200/60">
                  {formatCurrentDate()}
                </p>
              </div>
            </div>

            {/* Role + org badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ${ROLE_BADGE[user.role] ?? 'bg-white/10 text-white'}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium text-emerald-200/80 ring-1 ring-white/10 backdrop-blur-sm">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {user.tenant.name}
              </span>
            </div>
          </div>

          {/* Directiva info strip */}
          {isDirectiva && (
            <div className="relative mt-5 flex items-center gap-2 rounded-xl bg-teal-400/10 px-4 py-2.5 text-sm font-medium text-teal-200 ring-1 ring-teal-400/20">
              <svg className="h-4 w-4 shrink-0 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tienes acceso al panel de directiva con datos globales del sindicato.
            </div>
          )}
        </div>
      </div>

      {/* ── KPI CARDS (live data) ── */}
      {!isDirectiva && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          <StatCard
            label="Productos en stock"
            value={loadingKpi ? '…' : kpi.products}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
            color="emerald"
            trend="Inventario activo"
          />
          <StatCard
            label="Lotes registrados"
            value={loadingKpi ? '…' : kpi.lots}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
            color="sky"
            trend="En almacén"
          />
          <StatCard
            label="Alertas activas"
            value={loadingKpi ? '…' : kpi.alerts}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
            color={kpi.alerts > 0 ? 'amber' : 'slate'}
            trend={kpi.alerts > 0 ? 'Requieren atención' : 'Todo en orden'}
          />
          <StatCard
            label="Cuentas vencidas"
            value={loadingKpi ? '…' : kpi.overduePayables}
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            color={kpi.overduePayables > 0 ? 'red' : 'slate'}
            trend={kpi.totalDebt > 0 ? `Bs ${kpi.totalDebt.toFixed(0)} pendiente` : 'Sin deudas'}
          />
        </div>
      )}

      {/* ── QUICK ALERTS STRIP ── */}
      {!isDirectiva && !loadingKpi && (kpi.alerts > 0 || kpi.overduePayables > 0) && (
        <div className="mb-8 flex flex-wrap gap-3 animate-fade-in">
          {kpi.alerts > 0 && (
            <Link to="/inventory" className="group flex items-center gap-2.5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100 hover:ring-amber-300">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </span>
              {kpi.alerts} alerta{kpi.alerts !== 1 ? 's' : ''} de inventario — ver ahora
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          )}
          {kpi.overduePayables > 0 && (
            <Link to="/purchases" className="group flex items-center gap-2.5 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200 transition hover:bg-red-100 hover:ring-red-300">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </span>
              {kpi.overduePayables} cuenta{kpi.overduePayables !== 1 ? 's' : ''} vencida{kpi.overduePayables !== 1 ? 's' : ''} — gestionar
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </Link>
          )}
        </div>
      )}

      {/* ── MODULE GRID ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Módulos disponibles</h3>
          <span className="text-xs text-slate-400">{cards.length} módulo{cards.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, idx) => (
            <Link
              key={card.title + card.to}
              to={card.to}
              className="group relative overflow-hidden rounded-2xl bg-white/72 backdrop-blur-md border border-white/50 p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-emerald-600/8 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-emerald-500 animate-slide-up"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Gradient overlay on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none rounded-2xl`} />

              {/* Shimmer border on hover */}
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-slate-200/80 group-hover:ring-emerald-500/20 transition-all duration-300" />

              <div className="relative">
                {/* Icon + badge row */}
                <div className="mb-4 flex items-start justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.iconBg} text-white shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:shadow-md`}>
                    {card.icon}
                  </div>
                  {card.badge !== undefined && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${card.badgeColor ?? 'bg-red-500/10 text-red-700 ring-red-500/20'}`}>
                      {card.badge}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors">{card.title}</h3>

                {/* Description */}
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 group-hover:text-slate-600 transition-colors">{card.desc}</p>

                {/* Shortcut + arrow */}
                <div className="mt-4 flex items-center justify-between">
                  {card.shortcut && (
                    <span className="text-xs font-medium text-slate-400 group-hover:text-slate-500 transition-colors">
                      {card.shortcut}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 text-xs font-semibold text-emerald-600 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0.5">
                    Abrir
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── FOOTER TIP ── */}
      <div className="mt-10 flex items-center justify-center gap-2 text-xs text-slate-400 animate-fade-in">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Trabaja sin conexión y sincroniza cuando vuelva la red.
      </div>

    </AppShell>
  );
}
