import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  CriticalityBadge,
  EmptyState,
  Notice,
  SkeletonRow,
  StatCard,
  StatusBadge,
  buttonClass,
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
import { useCampaign } from '../hooks/use-campaign';
import { campaignsService } from '../services/campaigns.service';
import {
  adjustmentsService,
  inventoryService,
  lotsService,
  productsService,
} from '../services/inventory.service';
import type {
  AdjustmentDirection,
  AdjustmentReasonType,
  InventoryAlertResponse,
  InventoryCriticality,
  InventoryLot,
  Product,
  StockEntryReason,
  StockLot,
  StockMovement,
  StockMovementReasonType,
  StockMovementType,
} from '../types/inventory';
import type { Campaign } from '../types/campaigns';

type Tab = 'stock' | 'productos' | 'lotes' | 'movimientos' | 'ajustes';

const CATEGORY_OPTIONS = ['Herbicida', 'Fungicida', 'Insecticida', 'Fertilizante', 'Otro'];
const UNIT_OPTIONS = ['L', 'kg', 'g', 'ml', 'unidad'];
const TOXICOLOGY_OPTIONS = [
  'I - Extremadamente peligroso',
  'II - Altamente peligroso',
  'III - Moderadamente peligroso',
  'IV - Ligeramente peligroso',
  'No clasificado',
];

/* ─────────────────────────────────────────
   REUSABLE DRAWER COMPONENT
   ───────────────────────────────────────── */
interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Drawer({ isOpen, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />
      {/* Panel Container */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200/60 flex flex-col h-full animate-slide-in-right overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Cerrar panel"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </>
  );
}

export function InventoryPage() {
  const { activeCampaign, hasActiveCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [stock, setStock] = useState<StockLot[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlertResponse | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [criticality, setCriticality] = useState('');
  const [orderBy, setOrderBy] = useState<'expiration' | 'stock' | 'name'>('expiration');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  type StockMode = 'initial' | 'entry' | 'exit';
  const [stockMode, setStockMode] = useState<StockMode>('entry');
  const [showStockDrawer, setShowStockDrawer] = useState(false);

  const stockProducts = useMemo(() => {
    const map = new Map<string, StockLot['product']>();
    stock.forEach((lot) => map.set(lot.product.id, lot.product));
    return Array.from(map.values());
  }, [stock]);

  const categories = useMemo(
    () => Array.from(new Set(stock.map((lot) => lot.product.category).filter(Boolean))) as string[],
    [stock],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stockData, alertData, productData] = await Promise.all([
        inventoryService.stock({
          search: search || undefined,
          category: category || undefined,
          criticality: (criticality || undefined) as InventoryCriticality | undefined,
          orderBy,
          orderDirection: 'asc',
        }),
        inventoryService.alerts(),
        productsService.list(),
      ]);
      setStock(stockData);
      setAlerts(alertData);
      setProducts(productData);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar el inventario.'));
    } finally {
      setIsLoading(false);
    }
  }, [category, criticality, orderBy, search]);

  const refreshLots = useCallback(async () => {
    try {
      const data = await lotsService.list();
      setLots(data);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    if (activeTab === 'lotes') void Promise.resolve().then(refreshLots);
  }, [activeTab, refreshLots]);

  const handleDone = async (text: string) => {
    setMessage(text);
    await refresh();
    if (activeTab === 'lotes') await refreshLots();
  };

  // KPI metrics
  const totalProducts = stockProducts.length;
  const totalLots = stock.length;
  const criticalCount = alerts ? alerts.total : 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'stock', label: 'Stock' },
    { key: 'productos', label: 'Productos', count: products.length },
    { key: 'lotes', label: 'Lotes' },
    { key: 'movimientos', label: 'Movimientos' },
    { key: 'ajustes', label: 'Ajustes' },
  ];

  return (
    <AppShell title="Inventario" section="Núcleo de inventario">
      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3 animate-fade-in">
        <StatCard
          label="Productos"
          value={totalProducts}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
          color="emerald"
        />
        <StatCard
          label="Lotes activos"
          value={totalLots}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          color="sky"
        />
        <StatCard
          label="Alertas activas"
          value={criticalCount}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          color={criticalCount > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* Alerts */}
      {alerts && alerts.total > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 animate-fade-in">
          {alerts.stockMinimum.length > 0 && (
            <Notice kind="warn">
              <strong>⚠ Stock bajo:</strong> {alerts.stockMinimum.length} producto(s) por debajo del mínimo.
            </Notice>
          )}
          {alerts.expiration.length > 0 && (
            <Notice kind="error">
              <strong>🕒 Vencimientos:</strong> {alerts.expiration.length} lote(s) vencido(s) o próximos a vencer.
            </Notice>
          )}
        </div>
      )}

      {message && <div className="mb-4 animate-fade-slide"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4 animate-fade-slide"><Notice kind="error">{error}</Notice></div>}
      {!hasActiveCampaign && (
        <div className="mb-4 animate-fade-slide">
          <Notice kind="warn">No hay campana activa. Las entradas, salidas y ajustes quedan bloqueados hasta que directiva abra una campana.</Notice>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-2xl bg-white/60 p-1 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-sm sm:w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            aria-pressed={activeTab === t.key}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              activeTab === t.key
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-800'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {t.label}
              {t.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeTab === t.key ? 'bg-white/20 text-white' : 'bg-slate-200/60 text-slate-500'
                }`}>{t.count}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* ── TAB: STOCK ── */}
      {activeTab === 'stock' && (
        <div className="space-y-4 animate-fade-in">
          {/* Compact Filters in Single Row on Large Screens */}
          <div className={`${cardClass} p-4`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 flex-1">
                <div>
                  <label htmlFor="search-stock" className={labelClass}>Buscar</label>
                  <input id="search-stock" className={`${inputClass} mt-1`} placeholder="Nombre de producto…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="cat-filter" className={labelClass}>Categoría</label>
                  <select id="cat-filter" className={`${inputClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Todas</option>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="crit-filter" className={labelClass}>Estado</label>
                  <select id="crit-filter" className={`${inputClass} mt-1`} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="BAJO_MINIMO">Bajo mínimo</option>
                    <option value="VENCIDO">Vencido</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="OK">OK</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="order-filter" className={labelClass}>Ordenar por</label>
                  <select id="order-filter" className={`${inputClass} mt-1`} value={orderBy} onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}>
                    <option value="expiration">Vencimiento</option>
                    <option value="stock">Stock</option>
                    <option value="name">Nombre</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 lg:h-[38px] lg:items-center">
                <button className={`${secondaryButtonClass} py-2 px-3.5 flex items-center justify-center gap-1.5 text-xs font-semibold shadow-sm h-full`} onClick={() => void refresh()}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>
          </div>

          {/* Stock table — Desktop (100% width) */}
          <div className="hidden sm:block table-container">
            <div className="border-b border-slate-100/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/60">
              <div>
                <h2 className="font-bold text-slate-900 text-base">Stock disponible</h2>
                <p className="text-xs text-slate-400">Total de {stock.length} lote{stock.length !== 1 ? 's' : ''} registrado{stock.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('initial'); setShowStockDrawer(true); }}
                  className={`${secondaryButtonClass} !py-2 !px-3.5 text-xs flex items-center gap-1.5`}
                >
                  📦 Inicial
                </button>
                <button
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('entry'); setShowStockDrawer(true); }}
                  className={`${buttonClass} !w-auto !py-2 !px-3.5 text-xs flex items-center gap-1.5 shadow-sm`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Entrada
                </button>
                <button
                  type="button"
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('exit'); setShowStockDrawer(true); }}
                  className="rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100/80 text-amber-700 py-2 px-3.5 text-xs font-semibold flex items-center gap-1.5 transition duration-200"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                  </svg>
                  Salida
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Producto</th>
                    <th scope="col" className="px-6 py-3.5">Lote</th>
                    <th scope="col" className="px-6 py-3.5">Stock / Mínimo</th>
                    <th scope="col" className="px-6 py-3.5">Vence</th>
                    <th scope="col" className="px-6 py-3.5">Proveedor</th>
                    <th scope="col" className="px-6 py-3.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  ) : stock.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
                          title="Sin productos en inventario"
                          description="Registra tu inventario inicial para comenzar."
                        />
                      </td>
                    </tr>
                  ) : (
                    stock.map((lot) => {
                      const minStock = Number(lot.product.minimumStock ?? 0);
                      const cur = Number(lot.currentQuantity);
                      const pct = minStock > 0 ? Math.min((cur / minStock) * 100, 100) : 100;
                      const barColor = lot.criticality === 'VENCIDO' ? 'bg-red-500' : lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-500' : lot.criticality === 'POR_VENCER' ? 'bg-orange-400' : 'bg-emerald-500';
                      return (
                        <tr
                          key={lot.id}
                          className={`transition ${lot.criticality === 'VENCIDO' ? 'bg-red-50/40' : lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-50/40' : ''}`}
                        >
                          <td className="px-6 py-3.5">
                            <p className="font-semibold text-slate-800">{lot.product.name}</p>
                            <p className="text-xs text-slate-500">{lot.product.category ?? 'Sin categoría'} · {lot.product.unit}</p>
                          </td>
                          <td className="px-6 py-3.5 text-slate-600">{lot.lotNumber ?? '—'}</td>
                          <td className="px-6 py-3.5">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold tabular-nums text-slate-800">{fmtNumber(lot.currentQuantity)} {lot.product.unit}</span>
                              {minStock > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                    <div className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-slate-400 tabular-nums">mín {fmtNumber(minStock)}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-slate-600 tabular-nums">{fmtDate(lot.expirationDate)}</td>
                          <td className="px-6 py-3.5 text-slate-600">{lot.supplier?.name ?? '—'}</td>
                          <td className="px-6 py-3.5"><CriticalityBadge value={lot.criticality} /></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock cards — Mobile (Touch-friendly and spacious) */}
          <div className="sm:hidden space-y-3">
            <div className="flex flex-col gap-2 px-1">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800">Stock disponible</h2>
                <span className="text-xs text-slate-400">{stock.length} lotes</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('initial'); setShowStockDrawer(true); }}
                  className="rounded-xl border border-slate-200 bg-white/80 py-2 text-center text-xs font-bold text-slate-700 shadow-sm"
                >
                  📦 Inicial
                </button>
                <button
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('entry'); setShowStockDrawer(true); }}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 py-2 text-center text-xs font-bold text-white shadow-sm"
                >
                  📥 Entrada
                </button>
                <button
                  disabled={!hasActiveCampaign}
                  onClick={() => { setStockMode('exit'); setShowStockDrawer(true); }}
                  className="rounded-xl border border-amber-200 bg-amber-50 py-2 text-center text-xs font-bold text-amber-700 shadow-sm"
                >
                  📤 Salida
                </button>
              </div>
            </div>

            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card p-4 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded-md" />
                  <div className="skeleton h-3 w-1/2 rounded-md" />
                  <div className="skeleton h-2 w-full rounded-full mt-2" />
                </div>
              ))
            ) : stock.length === 0 ? (
              <div className="glass-card">
                <EmptyState
                  icon={<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
                  title="Sin productos en inventario"
                  description="Registra tu inventario inicial para comenzar."
                />
              </div>
            ) : (
              stock.map((lot, idx) => {
                const minStock = Number(lot.product.minimumStock ?? 0);
                const cur = Number(lot.currentQuantity);
                const pct = minStock > 0 ? Math.min((cur / minStock) * 100, 100) : 100;
                const barColor = lot.criticality === 'VENCIDO' ? 'bg-red-500' : lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-500' : lot.criticality === 'POR_VENCER' ? 'bg-orange-400' : 'bg-emerald-500';
                const borderColor = lot.criticality === 'VENCIDO' ? 'border-l-red-500' : lot.criticality === 'BAJO_MINIMO' ? 'border-l-amber-500' : lot.criticality === 'POR_VENCER' ? 'border-l-orange-400' : 'border-l-emerald-400';
                return (
                  <div
                    key={lot.id}
                    className={`glass-card p-4 border-l-4 ${borderColor} animate-fade-in`}
                    style={{ animationDelay: `${idx * 35}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-800">{lot.product.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{lot.product.category ?? 'Sin categoría'} · {lot.product.unit}</p>
                      </div>
                      <CriticalityBadge value={lot.criticality} />
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">Stock actual</span>
                        <span className="font-bold text-slate-800 tabular-nums">{fmtNumber(lot.currentQuantity)} {lot.product.unit}</span>
                      </div>
                      {minStock > 0 && (
                        <>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-2 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400 tabular-nums">Mínimo: {fmtNumber(minStock)} · {pct.toFixed(0)}% cubierto</p>
                        </>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                      {lot.lotNumber && <span>Lote: <span className="font-medium text-slate-700">{lot.lotNumber}</span></span>}
                      {lot.expirationDate && (
                        <span>Vence: <span className={`font-medium ${lot.criticality === 'VENCIDO' ? 'text-red-600' : lot.criticality === 'POR_VENCER' ? 'text-orange-600' : 'text-slate-700'}`}>{fmtDate(lot.expirationDate)}</span></span>
                      )}
                      {lot.supplier?.name && <span>Prov: <span className="font-medium text-slate-700">{lot.supplier.name}</span></span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer for Stock Actions (Initial, Entry, Exit) */}
          <Drawer
            isOpen={showStockDrawer}
            onClose={() => setShowStockDrawer(false)}
            title={stockMode === 'initial' ? 'Inventario inicial' : stockMode === 'entry' ? 'Registrar entrada' : 'Registrar salida'}
          >
            {stockMode === 'initial' && (
              <InitialOrEntryForm
                kind="initial"
                onDone={async (msg) => { setShowStockDrawer(false); await handleDone(msg); }}
                onCancel={() => setShowStockDrawer(false)}
              />
            )}
            {stockMode === 'entry' && (
              <InitialOrEntryForm
                kind="entry"
                onDone={async (msg) => { setShowStockDrawer(false); await handleDone(msg); }}
                onCancel={() => setShowStockDrawer(false)}
              />
            )}
            {stockMode === 'exit' && (
              <ExitForm
                lots={stock}
                products={stockProducts}
                onDone={async (msg) => { setShowStockDrawer(false); await handleDone(msg); }}
                onCancel={() => setShowStockDrawer(false)}
              />
            )}
          </Drawer>
        </div>
      )}

      {/* ── TAB: PRODUCTOS ── */}
      {activeTab === 'productos' && <ProductsTab products={products} onDone={handleDone} />}

      {/* ── TAB: LOTES ── */}
      {activeTab === 'lotes' && (
        <LotsTab lots={lots} products={products} onDone={async (msg) => { setMessage(msg); await refreshLots(); }} />
      )}

      {activeTab === 'movimientos' && (
        <MovementsTab
          key={activeCampaign?.id ?? 'without-active-campaign'}
          products={products}
          activeCampaignId={activeCampaign?.id ?? null}
        />
      )}

      {/* ── TAB: AJUSTES ── */}
      {activeTab === 'ajustes' && (
        <AdjustmentsTab lots={stock} products={stockProducts} canOperate={hasActiveCampaign} onDone={handleDone} />
      )}
    </AppShell>
  );
}

/* ─────────────────────────────────────────
   STOCK FORMS (Updated for Drawer)
   ───────────────────────────────────────── */
function InitialOrEntryForm({
  kind,
  onDone,
  onCancel,
}: {
  kind: 'initial' | 'entry';
  onDone: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState({
    productName: '', activeIngredient: '', category: '', unit: 'L', minimumStock: '0',
    expirationWarningDays: '90', quantity: '', lotNumber: '', expirationDate: '',
    warehouseName: 'Galpon principal', entryReason: 'COMPRA', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (kind === 'entry' && form.entryReason === 'ENTRADA_SIMPLE' && !form.notes.trim()) {
      setError('Describe el motivo de la entrada simple.');
      return;
    }
    setSaving(true);
    const payload = {
      product: {
        productName: form.productName, activeIngredient: form.activeIngredient || undefined,
        category: form.category || undefined, unit: form.unit,
        minimumStock: Number(form.minimumStock || 0), expirationWarningDays: Number(form.expirationWarningDays || 90),
      },
      quantity: Number(form.quantity), lotNumber: form.lotNumber || undefined,
      expirationDate: form.expirationDate || undefined, warehouseName: form.warehouseName || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (kind === 'initial') {
        await inventoryService.initialStock(payload);
        await onDone('Inventario inicial registrado.');
      } else {
        await inventoryService.entry({ ...payload, entryReason: form.entryReason as StockEntryReason });
        await onDone('Entrada registrada.');
      }
      setForm((prev) => ({ ...prev, quantity: '', lotNumber: '', notes: '' }));
    } catch (err) {
      setError(extractError(err, 'No fue posible guardar.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {kind === 'entry' && (
        <div>
          <label htmlFor="entry-reason" className={labelClass}>Motivo</label>
          <select id="entry-reason" className={inputClass} value={form.entryReason} onChange={(e) => set('entryReason', e.target.value)}>
            <option value="COMPRA">Compra</option>
            <option value="ENTRADA_SIMPLE">Entrada simple</option>
            <option value="DEVOLUCION">Devolución</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="pname" className={labelClass}>Producto *</label>
          <input id="pname" required className={inputClass} placeholder="Glifosato 48%…" value={form.productName} onChange={(e) => set('productName', e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="ai" className={labelClass}>Ingrediente activo</label>
          <input id="ai" className={inputClass} placeholder="Glifosato" value={form.activeIngredient} onChange={(e) => set('activeIngredient', e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="pcat" className={labelClass}>Categoría</label>
          <select id="pcat" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Sin categoría</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="punit" className={labelClass}>Unidad *</label>
          <select id="punit" className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mstock" className={labelClass}>Stock mínimo</label>
          <input id="mstock" className={inputClass} type="number" min="0" value={form.minimumStock} onChange={(e) => set('minimumStock', e.target.value)} />
        </div>
        <div>
          <label htmlFor="expdays" className={labelClass}>Días alerta vencimiento</label>
          <input id="expdays" className={inputClass} type="number" min="1" value={form.expirationWarningDays} onChange={(e) => set('expirationWarningDays', e.target.value)} />
        </div>
        <div>
          <label htmlFor="qty" className={labelClass}>Cantidad *</label>
          <input id="qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="0.00" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="lot" className={labelClass}>Número de lote</label>
          <input id="lot" className={inputClass} placeholder="LOTE-2026-01" value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="expdate" className={labelClass}>Fecha de vencimiento</label>
          <input id="expdate" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="wh" className={labelClass}>Almacén</label>
          <input id="wh" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div>
        <label htmlFor="notes-entry" className={labelClass}>
          {kind === 'entry' && form.entryReason === 'ENTRADA_SIMPLE' ? 'Motivo detallado *' : 'Notas'}
        </label>
        <textarea id="notes-entry" required={kind === 'entry' && form.entryReason === 'ENTRADA_SIMPLE'} className={inputClass} rows={2} placeholder="Observaciones…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      {kind === 'entry' && form.entryReason === 'ENTRADA_SIMPLE' && (
        <p className="-mt-2 text-xs text-slate-500">El detalle es obligatorio para identificar el origen de esta entrada.</p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>}
        <button disabled={saving} className={`${buttonClass} !w-auto px-5`}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

function ExitForm({
  lots,
  products,
  onDone,
  onCancel,
}: {
  lots: StockLot[];
  products: StockLot['product'][];
  onDone: (message: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [inventoryLotId, setInventoryLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reasonType, setReasonType] = useState<StockMovementReasonType>('OTRO');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productLots = lots.filter((lot) => lot.product.id === productId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await inventoryService.exit({
        productId,
        inventoryLotId: inventoryLotId || undefined,
        quantity: Number(quantity),
        reasonType,
        reason,
      });
      setQuantity('');
      setReason('');
      await onDone('Salida registrada.');
    } catch (err) {
      setError(extractError(err, 'No fue posible registrar la salida.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="exit-product" className={labelClass}>Producto *</label>
        <select id="exit-product" required className={inputClass} value={productId} onChange={(e) => { setProductId(e.target.value); setInventoryLotId(''); }}>
          <option value="">Seleccionar producto</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="exit-lot" className={labelClass}>Lote</label>
        <select id="exit-lot" className={inputClass} value={inventoryLotId} onChange={(e) => setInventoryLotId(e.target.value)}>
          <option value="">Descontar automáticamente (FEFO)</option>
          {productLots.map((lot) => (
            <option key={lot.id} value={lot.id}>{lot.lotNumber ?? 'Sin lote'} · {fmtNumber(lot.currentQuantity)} · vence {fmtDate(lot.expirationDate)}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="exit-qty" className={labelClass}>Cantidad *</label>
        <input id="exit-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="0.00" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div>
        <label htmlFor="exit-reason-type" className={labelClass}>Tipo de salida *</label>
        <select id="exit-reason-type" required className={inputClass} value={reasonType} onChange={(e) => setReasonType(e.target.value as StockMovementReasonType)}>
          <option value="OTRO">Salida simple</option>
          <option value="DEVOLUCION">Devolución</option>
          <option value="PERDIDA_DERRAME">Pérdida o derrame</option>
          <option value="VENCIMIENTO">Vencimiento</option>
          <option value="PRESTAMO_ENTREGA">Préstamo o entrega</option>
          <option value="OTRO">Otro</option>
        </select>
      </div>
      <div>
        <label htmlFor="exit-reason" className={labelClass}>Motivo de salida *</label>
        <textarea id="exit-reason" required className={inputClass} rows={2} placeholder="Describe el motivo…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>}
        <button disabled={saving} className={`${buttonClass} !w-auto px-5`}>{saving ? 'Guardando…' : 'Registrar salida'}</button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   PRODUCTS TAB (Updated for Drawer)
   ───────────────────────────────────────── */
function ProductsTab({ products, onDone }: { products: Product[]; onDone: (msg: string) => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deactivateProduct, setDeactivateProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [
      product.name,
      product.commercialName,
      product.activeIngredient,
      product.qrCodeValue,
    ].some((value) => value?.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && product.isActive)
      || (statusFilter === 'inactive' && !product.isActive);
    return matchesSearch && matchesStatus;
  });

  const handleSaved = async (msg: string) => {
    setMessage(msg);
    setShowForm(false);
    setEditProduct(null);
    setDeactivateProduct(null);
    await onDone(msg);
  };

  const copyQr = async (product: Product) => {
    if (!product.qrCodeValue) return;
    setActionError(null);
    try {
      await navigator.clipboard.writeText(product.qrCodeValue);
      setMessage(`QR de ${product.name} copiado.`);
    } catch {
      setActionError('No fue posible copiar el valor QR.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className={cardClass}>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div className="min-w-0">
            <label htmlFor="prod-search" className={labelClass}>Buscar producto</label>
            <input id="prod-search" className={`${inputClass} mt-1`} placeholder="Nombre o ingrediente activo…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="prod-status" className={labelClass}>Estado</label>
            <select id="prod-status" className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <div>
            <button className={`${buttonClass} !w-auto h-[42px] px-5 flex items-center gap-1.5 shadow-sm`} onClick={() => { setShowForm(true); setEditProduct(null); }}>
              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Nuevo producto
            </button>
          </div>
        </div>
      </div>
      {message && <Notice kind="ok">{message}</Notice>}
      {actionError && <Notice kind="error">{actionError}</Notice>}
      <div className="table-container">
        <div className="border-b border-slate-100/80 px-6 py-4 flex items-center justify-between bg-white/60">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Catálogo de productos</h2>
            <p className="text-xs text-slate-400">Total de {filtered.length} producto{filtered.length !== 1 ? 's' : ''} registrado{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
            title="No hay productos"
            description="Crea tu primer producto agroquímico."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Nombre</th>
                  <th scope="col" className="px-6 py-3.5">Toxicología</th>
                  <th scope="col" className="px-6 py-3.5">FDS</th>
                  <th scope="col" className="px-6 py-3.5">QR</th>
                  <th scope="col" className="px-6 py-3.5">Estado</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filtered.map((p) => (
                  <tr key={p.id} className={`transition ${p.isActive ? '' : 'bg-slate-50/70 opacity-75'}`}>
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.commercialName ?? p.activeIngredient ?? 'Sin detalle'} · {p.category ?? 'Sin categoría'} · {p.unit}</p>
                      {p.safetyInstructions && <p className="mt-1 max-w-[280px] truncate text-xs text-amber-700" title={p.safetyInstructions}>Seguridad: {p.safetyInstructions}</p>}
                    </td>
                    <td className="px-6 py-3.5"><ToxicologyBadge value={p.toxicologicalCategory} /></td>
                    <td className="px-6 py-3.5">
                      {p.safetyDataSheetUrl ? (
                        <a href={p.safetyDataSheetUrl} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline">
                          {p.safetyDataSheetName || 'Abrir FDS'}
                        </a>
                      ) : <span className="text-xs text-slate-400">Sin FDS</span>}
                    </td>
                    <td className="px-6 py-3.5">
                      {p.qrCodeValue ? (
                        <button type="button" className="max-w-[190px] truncate font-mono text-xs text-slate-600 hover:text-emerald-700" title={p.qrCodeValue} onClick={() => void copyQr(p)}>
                          {p.qrCodeValue}
                        </button>
                      ) : <span className="text-xs text-slate-400">Sin QR</span>}
                    </td>
                    <td className="px-6 py-3.5"><StatusBadge status={p.isActive ? 'ACTIVO' : 'INACTIVA'} /></td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex justify-end gap-2">
                        <button aria-label={`Editar ${p.name}`} onClick={() => { setEditProduct(p); setShowForm(true); }} className={secondaryButtonClass}>Editar</button>
                        {p.isActive && <button aria-label={`Inactivar ${p.name}`} onClick={() => setDeactivateProduct(p)} className={dangerButtonClass}>Inactivar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer isOpen={showForm} onClose={() => { setShowForm(false); setEditProduct(null); }} title={editProduct ? 'Editar producto' : 'Nuevo producto'}>
        <ProductForm product={editProduct} onDone={handleSaved} onCancel={() => { setShowForm(false); setEditProduct(null); }} />
      </Drawer>
      <Drawer isOpen={Boolean(deactivateProduct)} onClose={() => setDeactivateProduct(null)} title="Inactivar producto">
        {deactivateProduct && <DeactivateProductForm product={deactivateProduct} onDone={handleSaved} onCancel={() => setDeactivateProduct(null)} />}
      </Drawer>
    </div>
  );
}

function ProductForm({
  product,
  onDone,
  onCancel,
}: {
  product: Product | null;
  onDone: (msg: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '', commercialName: product?.commercialName ?? '',
    activeIngredient: product?.activeIngredient ?? '', category: product?.category ?? '',
    toxicologicalCategory: product?.toxicologicalCategory ?? '',
    safetyDataSheetUrl: product?.safetyDataSheetUrl ?? '',
    safetyDataSheetName: product?.safetyDataSheetName ?? '',
    safetyInstructions: product?.safetyInstructions ?? '',
    qrCodeValue: product?.qrCodeValue ?? '',
    unit: product?.unit ?? 'L', minimumStock: String(product?.minimumStock ?? 0),
    expirationWarningDays: String(product?.expirationWarningDays ?? 90),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name, commercialName: form.commercialName || undefined,
        activeIngredient: form.activeIngredient || undefined, category: form.category || undefined,
        toxicologicalCategory: form.toxicologicalCategory || null,
        safetyDataSheetUrl: form.safetyDataSheetUrl || null,
        safetyDataSheetName: form.safetyDataSheetName || null,
        safetyInstructions: form.safetyInstructions || null,
        qrCodeValue: form.qrCodeValue || (product ? null : undefined),
        unit: form.unit, minimumStock: Number(form.minimumStock), expirationWarningDays: Number(form.expirationWarningDays),
      };
      if (product) { await productsService.update(product.id, payload); await onDone('Producto actualizado.'); }
      else { await productsService.create(payload); await onDone('Producto creado.'); }
    } catch (err) {
      setError(extractError(err, 'No fue posible guardar el producto.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="p-name" className={labelClass}>Nombre *</label>
          <input id="p-name" required className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-commercial" className={labelClass}>Nombre comercial</label>
          <input id="p-commercial" className={inputClass} value={form.commercialName} onChange={(e) => set('commercialName', e.target.value)} autoComplete="off" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-ai" className={labelClass}>Ingrediente activo</label>
          <input id="p-ai" className={inputClass} value={form.activeIngredient} onChange={(e) => set('activeIngredient', e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="p-cat" className={labelClass}>Categoría</label>
          <select id="p-cat" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Sin categoría</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="p-unit" className={labelClass}>Unidad *</label>
          <select id="p-unit" className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-toxicology" className={labelClass}>Categoría toxicológica</label>
          <select id="p-toxicology" className={inputClass} value={form.toxicologicalCategory} onChange={(e) => set('toxicologicalCategory', e.target.value)}>
            <option value="">Sin clasificación</option>
            {TOXICOLOGY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-fds-url" className={labelClass}>URL de FDS</label>
          <input id="p-fds-url" className={inputClass} type="url" placeholder="https://..." value={form.safetyDataSheetUrl} onChange={(e) => set('safetyDataSheetUrl', e.target.value)} autoComplete="url" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-fds-name" className={labelClass}>Nombre de FDS</label>
          <input id="p-fds-name" className={inputClass} placeholder="FDS del producto" value={form.safetyDataSheetName} onChange={(e) => set('safetyDataSheetName', e.target.value)} autoComplete="off" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-safety" className={labelClass}>Instrucciones de seguridad</label>
          <textarea id="p-safety" className={inputClass} rows={3} value={form.safetyInstructions} onChange={(e) => set('safetyInstructions', e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="p-qr" className={labelClass}>Valor QR</label>
          <div className="flex gap-2">
            <input id="p-qr" className={`${inputClass} font-mono`} placeholder="Generado automáticamente" value={form.qrCodeValue} onChange={(e) => set('qrCodeValue', e.target.value)} autoComplete="off" />
            <button type="button" className={secondaryButtonClass} onClick={() => set('qrCodeValue', `AGRO-PRODUCT-${crypto.randomUUID()}`)}>Generar</button>
          </div>
        </div>
        <div>
          <label htmlFor="p-mstock" className={labelClass}>Stock mínimo</label>
          <input id="p-mstock" className={inputClass} type="number" min="0" value={form.minimumStock} onChange={(e) => set('minimumStock', e.target.value)} />
        </div>
        <div>
          <label htmlFor="p-expdays" className={labelClass}>Días alerta vencimiento</label>
          <input id="p-expdays" className={inputClass} type="number" min="1" value={form.expirationWarningDays} onChange={(e) => set('expirationWarningDays', e.target.value)} />
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
        <button disabled={saving} className={`${buttonClass} !w-auto px-5`}>{saving ? 'Guardando…' : product ? 'Actualizar' : 'Crear producto'}</button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   LOTS TAB (Updated for Drawer)
   ───────────────────────────────────────── */
function ToxicologyBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-slate-400">Sin clasificación</span>;

  const level = value.trim().toUpperCase().split(/[\s-]/)[0];
  const colors: Record<string, string> = {
    I: 'bg-red-100 text-red-800 ring-red-500/20',
    II: 'bg-orange-100 text-orange-800 ring-orange-500/20',
    III: 'bg-amber-100 text-amber-800 ring-amber-500/20',
    IV: 'bg-sky-100 text-sky-800 ring-sky-500/20',
  };
  const color = colors[level] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20';

  return <span className={`inline-flex max-w-[190px] rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${color}`}>{value}</span>;
}

type DeactivateProductFormProps = Readonly<{
  product: Product;
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}>;

function DeactivateProductForm({ product, onDone, onCancel }: DeactivateProductFormProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setSaving(true);
    setError(null);
    try {
      await productsService.deactivate(product.id);
      await onDone('Producto inactivado.');
    } catch (err) {
      setError(extractError(err, 'No fue posible inactivar el producto.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Notice kind="warn">{product.name} quedará inactivo y conservará sus lotes, movimientos y aplicaciones.</Notice>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>Cancelar</button>
        <button type="button" className={dangerButtonClass} disabled={saving} onClick={() => void deactivate()}>{saving ? 'Inactivando...' : 'Inactivar producto'}</button>
      </div>
    </div>
  );
}

function LotsTab({
  lots,
  products,
  onDone,
}: {
  lots: InventoryLot[];
  products: Product[];
  onDone: (msg: string) => Promise<void>;
}) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [editLot, setEditLot] = useState<InventoryLot | null>(null);
  const filtered = selectedProductId ? lots.filter((l) => l.product.id === selectedProductId) : lots;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className={cardClass}>
        <div>
          <label htmlFor="lot-product-filter" className={labelClass}>Filtrar por producto</label>
          <select id="lot-product-filter" className={`${inputClass} mt-1`} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            <option value="">Todos los productos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="table-container">
        <div className="border-b border-slate-100/80 px-6 py-4 flex items-center justify-between bg-white/60">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Lotes registrados</h2>
            <p className="text-xs text-slate-400">Total de {filtered.length} lote{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
            title="Sin lotes"
            description="No hay lotes para mostrar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Producto</th>
                  <th scope="col" className="px-6 py-3.5">Nº Lote</th>
                  <th scope="col" className="px-6 py-3.5 tabular-nums">Cantidad</th>
                  <th scope="col" className="px-6 py-3.5">Vencimiento</th>
                  <th scope="col" className="px-6 py-3.5">Almacén</th>
                  <th scope="col" className="px-6 py-3.5">Estado</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filtered.map((lot) => (
                  <tr
                    key={lot.id}
                    className={`transition ${
                      lot.criticality === 'VENCIDO' ? 'bg-red-50/50 border-l-4 border-red-400' :
                      lot.criticality === 'POR_VENCER' ? 'bg-orange-50/50 border-l-4 border-orange-400' :
                      lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-50/50' : ''
                    }`}
                  >
                    <td className="px-6 py-3.5 font-semibold text-slate-800">{lot.product.name}</td>
                    <td className="px-6 py-3.5 text-slate-600">{lot.lotNumber ?? '—'}</td>
                    <td className="px-6 py-3.5 tabular-nums font-semibold">{fmtNumber(lot.currentQuantity)} {lot.product.unit}</td>
                    <td className="px-6 py-3.5 tabular-nums text-slate-600">{fmtDate(lot.expirationDate)}</td>
                    <td className="px-6 py-3.5 text-slate-600">{lot.warehouseName ?? '—'}</td>
                    <td className="px-6 py-3.5"><CriticalityBadge value={lot.criticality} /></td>
                    <td className="px-6 py-3.5 text-right">
                      <button aria-label={`Editar lote ${lot.lotNumber ?? lot.id}`} onClick={() => setEditLot(lot)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer isOpen={!!editLot} onClose={() => setEditLot(null)} title="Editar lote">
        {editLot && <LotEditForm lot={editLot} onDone={async (msg) => { setEditLot(null); await onDone(msg); }} onCancel={() => setEditLot(null)} />}
      </Drawer>
    </div>
  );
}

function LotEditForm({
  lot,
  onDone,
  onCancel,
}: {
  lot: InventoryLot;
  onDone: (msg: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ lotNumber: lot.lotNumber ?? '', expirationDate: lot.expirationDate?.slice(0, 10) ?? '', warehouseName: lot.warehouseName ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await lotsService.update(lot.id, { lotNumber: form.lotNumber || undefined, expirationDate: form.expirationDate || undefined, warehouseName: form.warehouseName || undefined });
      await onDone('Lote actualizado.');
    } catch (err) {
      setError(extractError(err, 'No fue posible actualizar el lote.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="mb-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <p className="text-xs text-slate-400 uppercase font-semibold">Producto relacionado</p>
        <p className="text-sm font-bold text-slate-800 mt-0.5">{lot.product.name}</p>
      </div>
      <div>
        <label htmlFor="lot-num" className={labelClass}>Número de lote</label>
        <input id="lot-num" className={inputClass} value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="lot-exp" className={labelClass}>Fecha de vencimiento</label>
        <input id="lot-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} />
      </div>
      <div>
        <label htmlFor="lot-wh" className={labelClass}>Almacén</label>
        <input id="lot-wh" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
        <button disabled={saving} className={`${buttonClass} !w-auto px-5`}>{saving ? 'Guardando…' : 'Actualizar lote'}</button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   ADJUSTMENTS TAB (Updated for Drawer)
   ───────────────────────────────────────── */
const MOVEMENT_REASON_LABELS: Record<StockMovementReasonType, string> = {
  COMPRA: 'Compra',
  APLICACION: 'Aplicación',
  ENTRADA_SIMPLE: 'Entrada simple',
  
  AJUSTE: 'Ajuste',
  DEVOLUCION: 'Devolución',
  PERDIDA_DERRAME: 'Pérdida o derrame',
  VENCIMIENTO: 'Vencimiento',
  PRESTAMO_ENTREGA: 'Préstamo o entrega',
  OTRO: 'Otro',
};

type MovementsTabProps = Readonly<{
  products: Product[];
  activeCampaignId: string | null;
}>;

function MovementsTab({
  products,
  activeCampaignId,
}: MovementsTabProps) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(activeCampaignId ?? '');
  const [type, setType] = useState<StockMovementType | ''>('');
  const [reasonType, setReasonType] = useState<StockMovementReasonType | ''>('');
  const [productId, setProductId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [movementData, campaignData] = await Promise.all([
        inventoryService.movements({
          campaignId: campaignId || undefined,
          type: type || undefined,
          reasonType: reasonType || undefined,
          productId: productId || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
        }),
        campaignsService.list(),
      ]);
      setMovements(movementData);
      setCampaigns(campaignData);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar los movimientos.'));
    } finally {
      setLoading(false);
    }
  }, [campaignId, from, productId, reasonType, to, type]);

  useEffect(() => {
    void Promise.resolve().then(loadMovements);
  }, [loadMovements]);

  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className={`${cardClass} p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="movement-campaign" className={labelClass}>Campaña</label>
            <select id="movement-campaign" className={inputClass} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Todas las campañas</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="movement-type" className={labelClass}>Tipo</label>
            <select id="movement-type" className={inputClass} value={type} onChange={(e) => setType(e.target.value as StockMovementType | '')}>
              <option value="">Todos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SALIDA">Salida</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </div>
          <div>
            <label htmlFor="movement-reason" className={labelClass}>Motivo</label>
            <select id="movement-reason" className={inputClass} value={reasonType} onChange={(e) => setReasonType(e.target.value as StockMovementReasonType | '')}>
              <option value="">Todos</option>
              {Object.entries(MOVEMENT_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="movement-product" className={labelClass}>Producto</label>
            <select id="movement-product" className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Todos</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="movement-from" className={labelClass}>Desde</label>
            <input id="movement-from" className={inputClass} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="movement-to" className={labelClass}>Hasta</label>
            <input id="movement-to" className={inputClass} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="table-container overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Historial de movimientos</h2>
          <p className="text-xs text-slate-500">{movements.length} movimiento(s) encontrado(s). El stock mostrado en Inventario siempre es el actual.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Campana</th>
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3">Lote</th>
                <th className="px-5 py-3 text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} cols={7} />)
              ) : movements.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="Sin movimientos" description="No hay operaciones que coincidan con los filtros seleccionados." /></td></tr>
              ) : movements.map((movement) => (
                <tr key={movement.id} className="text-slate-600">
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(movement.occurredAt)}</td>
                  <td className="px-5 py-3">{movement.campaignId ? campaignNames.get(movement.campaignId) ?? 'Campaña no disponible' : 'Sin campaña'}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{movement.product.name}</td>
                  <td className="px-5 py-3"><StatusBadge status={movement.type} /></td>
                  <td className="px-5 py-3">
                    <p>{movement.reasonType ? MOVEMENT_REASON_LABELS[movement.reasonType] : 'Sin clasificar'}</p>
                    {movement.reason && <p className="max-w-xs truncate text-xs text-slate-400" title={movement.reason}>{movement.reason}</p>}
                  </td>
                  <td className="px-5 py-3">{movement.lot?.lotNumber ?? 'Sin lote'}</td>
                  <td className={`whitespace-nowrap px-5 py-3 text-right font-bold tabular-nums ${movement.type === 'SALIDA' ? 'text-red-600' : 'text-emerald-700'}`}>
                    {movement.type === 'SALIDA' ? '-' : '+'}{fmtNumber(movement.quantity)} {movement.product.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type AdjustmentsTabProps = Readonly<{
  lots: StockLot[];
  products: StockLot['product'][];
  canOperate: boolean;
  onDone: (msg: string) => Promise<void>;
}>;

function AdjustmentsTab({
  lots,
  products,
  canOperate,
  onDone,
}: AdjustmentsTabProps) {
  const [form, setForm] = useState({
    productId: '', inventoryLotId: '', direction: 'DECREMENTO' as AdjustmentDirection,
    reasonType: 'AJUSTE' as AdjustmentReasonType, quantity: '', reason: '',
    lotNumber: '', expirationDate: '', warehouseName: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const selectedProduct = lots.find((l) => l.product.id === form.productId);
  const productLots = lots.filter((l) => l.product.id === form.productId);
  const selectedLot = productLots.find((l) => l.id === form.inventoryLotId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.reason.trim()) { setError('El motivo es obligatorio.'); return; }
    setSaving(true);
    setError(null);
    try {
      await adjustmentsService.create({
        productId: form.productId, inventoryLotId: form.inventoryLotId || undefined,
        direction: form.direction, reasonType: form.reasonType, quantity: Number(form.quantity), reason: form.reason,
        lotNumber: form.direction === 'INCREMENTO' ? (form.lotNumber || undefined) : undefined,
        expirationDate: form.direction === 'INCREMENTO' ? (form.expirationDate || undefined) : undefined,
        warehouseName: form.direction === 'INCREMENTO' ? (form.warehouseName || undefined) : undefined,
      });
      setShowForm(false);
      await onDone('Ajuste registrado.');
      setForm((prev) => ({ ...prev, productId: '', inventoryLotId: '', quantity: '', reason: '' }));
    } catch (err) {
      setError(extractError(err, 'No fue posible registrar el ajuste.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className={`${cardClass} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100/80 pb-4 bg-white/50">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Información sobre ajustes</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Los ajustes corrigen el inventario por pérdidas, daños o errores de conteo.
              Quedan registrados como movimiento tipo <strong>AJUSTE</strong>.
            </p>
          </div>
          <button
            disabled={!canOperate}
            onClick={() => setShowForm(true)}
            className={`${buttonClass} !w-auto px-5 py-2.5 flex items-center gap-1.5 shadow-sm`}
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Registrar ajuste
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 pt-2">
          {(['PERDIDA_DERRAME', 'VENCIMIENTO', 'AJUSTE'] as const).map((rt) => {
            const info = {
              PERDIDA_DERRAME: { icon: '⚠️', label: 'Pérdida o derrame', desc: 'Producto derramado, robado o destruido.' },
              VENCIMIENTO: { icon: '🔴', label: 'Vencimiento', desc: 'Producto vencido o no utilizable.' },
              AJUSTE: { icon: '✏️', label: 'Ajuste', desc: 'Error en conteo físico.' },
            }[rt];
            return (
              <div key={rt} className="rounded-xl bg-white/60 p-4 text-sm border border-slate-100 shadow-sm">
                <p className="font-semibold text-slate-700">{info.icon} {info.label}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{info.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
      {!canOperate && <Notice kind="warn">Abre una campana para registrar ajustes.</Notice>}

      <Drawer isOpen={showForm} onClose={() => setShowForm(false)} title="Registrar ajuste">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="adj-product" className={labelClass}>Producto *</label>
            <select id="adj-product" required className={inputClass} value={form.productId} onChange={(e) => { set('productId', e.target.value); set('inventoryLotId', ''); }}>
              <option value="">Seleccionar producto</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <p className={labelClass}>Dirección *</p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['DECREMENTO', 'INCREMENTO'] as AdjustmentDirection[]).map((d) => (
                <button
                  key={d} type="button" aria-pressed={form.direction === d} onClick={() => set('direction', d)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    form.direction === d
                      ? d === 'DECREMENTO' ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {d === 'DECREMENTO' ? '↓ Decremento' : '↑ Incremento'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="adj-reason-type" className={labelClass}>Tipo de razón *</label>
            <select id="adj-reason-type" required className={inputClass} value={form.reasonType} onChange={(e) => set('reasonType', e.target.value as AdjustmentReasonType)}>
              <option value="PERDIDA_DERRAME">Pérdida o derrame</option>
              <option value="VENCIMIENTO">Vencimiento</option>
              <option value="AJUSTE">Corrección</option>
            </select>
          </div>
          {form.direction === 'DECREMENTO' && form.productId && (
            <div>
              <label htmlFor="adj-lot" className={labelClass}>Lote (opcional)</label>
              <select id="adj-lot" className={inputClass} value={form.inventoryLotId} onChange={(e) => set('inventoryLotId', e.target.value)}>
                <option value="">Descontar por vencimiento más cercano</option>
                {productLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber ?? 'Sin lote'} · {fmtNumber(lot.currentQuantity)} disponibles · vence {fmtDate(lot.expirationDate)}</option>)}
              </select>
              {selectedLot && <p className="mt-1 text-xs text-slate-500">Disponible en este lote: <strong className="tabular-nums">{fmtNumber(selectedLot.currentQuantity)}</strong> {selectedLot.product.unit}</p>}
              {selectedProduct && !form.inventoryLotId && <p className="mt-1 text-xs text-slate-500">Stock total del producto: <strong className="tabular-nums">{fmtNumber(selectedProduct.productTotalStock)}</strong> {selectedProduct.product.unit}</p>}
            </div>
          )}
          {form.direction === 'INCREMENTO' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div><label htmlFor="adj-lot-num" className={labelClass}>Número de lote</label><input id="adj-lot-num" className={inputClass} placeholder="LOTE-AJUSTE-01" value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" /></div>
              <div><label htmlFor="adj-exp" className={labelClass}>Fecha de vencimiento</label><input id="adj-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></div>
              <div className="md:col-span-2"><label htmlFor="adj-wh" className={labelClass}>Almacén</label><input id="adj-wh" className={inputClass} placeholder="Galpón principal" value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" /></div>
            </div>
          )}
          <div>
            <label htmlFor="adj-qty" className={labelClass}>Cantidad *</label>
            <input id="adj-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="0.00" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </div>
          <div>
            <label htmlFor="adj-reason" className={labelClass}>Motivo detallado *</label>
            <textarea id="adj-reason" required className={inputClass} rows={3} placeholder="Describe en detalle el motivo del ajuste…" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Obligatorio — quedará en el historial de movimientos.</p>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={() => setShowForm(false)} className={secondaryButtonClass}>Cancelar</button>
            <button disabled={saving || !form.productId || !form.quantity} className={`${buttonClass} !w-auto px-5`}>{saving ? 'Registrando…' : 'Registrar ajuste'}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
