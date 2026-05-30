import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  CriticalityBadge,
  EmptyState,
  Notice,
  SkeletonRow,
  StatCard,
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
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
  StockLot,
} from '../types/inventory';

type Tab = 'stock' | 'productos' | 'lotes' | 'ajustes';

const CATEGORY_OPTIONS = ['Herbicida', 'Fungicida', 'Insecticida', 'Fertilizante', 'Otro'];
const UNIT_OPTIONS = ['L', 'kg', 'g', 'ml', 'unidad'];

export function InventoryPage() {
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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeTab === 'lotes') void refreshLots();
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

      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-2xl bg-white/60 p-1 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-sm w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            aria-pressed={activeTab === t.key}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
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
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {/* Filters */}
            <div className={cardClass}>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label htmlFor="search-stock" className={labelClass}>Buscar</label>
                  <input id="search-stock" className={inputClass} placeholder="Nombre de producto…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="cat-filter" className={labelClass}>Categoría</label>
                  <select id="cat-filter" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Todas</option>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="crit-filter" className={labelClass}>Estado</label>
                  <select id="crit-filter" className={inputClass} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="BAJO_MINIMO">Bajo mínimo</option>
                    <option value="VENCIDO">Vencido</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="OK">OK</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="order-filter" className={labelClass}>Ordenar por</label>
                  <select id="order-filter" className={inputClass} value={orderBy} onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}>
                    <option value="expiration">Vencimiento</option>
                    <option value="stock">Stock</option>
                    <option value="name">Nombre</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button className={secondaryButtonClass} onClick={() => void refresh()}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>

            {/* Stock table */}
            <div className="table-container">
              <div className="border-b border-slate-100/80 px-5 py-3.5">
                <h2 className="font-bold text-slate-900">Stock disponible</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">Producto</th>
                      <th scope="col" className="px-5 py-3.5">Lote</th>
                      <th scope="col" className="px-5 py-3.5 tabular-nums">Stock</th>
                      <th scope="col" className="px-5 py-3.5">Vence</th>
                      <th scope="col" className="px-5 py-3.5">Proveedor</th>
                      <th scope="col" className="px-5 py-3.5">Estado</th>
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
                      stock.map((lot) => (
                        <tr
                          key={lot.id}
                          className={`transition ${lot.criticality === 'VENCIDO' ? 'bg-red-50/40' : lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-50/40' : ''}`}
                        >
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-slate-800">{lot.product.name}</p>
                            <p className="text-xs text-slate-500">{lot.product.category ?? 'Sin categoría'} · {lot.product.unit}</p>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">{lot.lotNumber ?? '—'}</td>
                          <td className="px-5 py-3.5 font-semibold tabular-nums">{fmtNumber(lot.currentQuantity)}</td>
                          <td className="px-5 py-3.5 text-slate-600 tabular-nums">{fmtDate(lot.expirationDate)}</td>
                          <td className="px-5 py-3.5 text-slate-600">{lot.supplier?.name ?? '—'}</td>
                          <td className="px-5 py-3.5"><CriticalityBadge value={lot.criticality} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Side panel - Stock actions */}
          <div className="space-y-4">
            <div className={cardClass}>
              <p className={labelClass}>Acción de stock</p>
              <div className="grid grid-cols-3 gap-2">
                {(['entry', 'exit', 'initial'] as StockMode[]).map((m) => {
                  const label = m === 'entry' ? 'Entrada' : m === 'exit' ? 'Salida' : 'Inicial';
                  return (
                    <button
                      key={m}
                      onClick={() => setStockMode(m)}
                      aria-pressed={stockMode === m}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        stockMode === m ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {stockMode === 'initial' && <InitialOrEntryForm kind="initial" onDone={handleDone} />}
            {stockMode === 'entry' && <InitialOrEntryForm kind="entry" onDone={handleDone} />}
            {stockMode === 'exit' && <ExitForm lots={stock} products={stockProducts} onDone={handleDone} />}
          </div>
        </div>
      )}

      {/* ── TAB: PRODUCTOS ── */}
      {activeTab === 'productos' && <ProductsTab products={products} onDone={handleDone} />}

      {/* ── TAB: LOTES ── */}
      {activeTab === 'lotes' && (
        <LotsTab lots={lots} products={products} onDone={async (msg) => { setMessage(msg); await refreshLots(); }} />
      )}

      {/* ── TAB: AJUSTES ── */}
      {activeTab === 'ajustes' && (
        <AdjustmentsTab lots={stock} products={stockProducts} onDone={handleDone} />
      )}
    </AppShell>
  );
}

/* ─────────────────────────────────────────
   STOCK FORMS
───────────────────────────────────────── */
function InitialOrEntryForm({ kind, onDone }: { kind: 'initial' | 'entry'; onDone: (message: string) => Promise<void> }) {
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
        await inventoryService.entry({ ...payload, entryReason: form.entryReason });
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
    <form onSubmit={submit} className={`space-y-3 ${cardClass} animate-slide-in-right`}>
      <h2 className="font-bold text-slate-900">{kind === 'initial' ? 'Inventario inicial' : 'Registrar entrada'}</h2>
      {kind === 'entry' && (
        <div>
          <label htmlFor="entry-reason" className={labelClass}>Motivo</label>
          <select id="entry-reason" className={inputClass} value={form.entryReason} onChange={(e) => set('entryReason', e.target.value)}>
            <option value="COMPRA">Compra</option>
            <option value="DEVOLUCION">Devolución</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
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
        <div>
          <label htmlFor="lot" className={labelClass}>Número de lote</label>
          <input id="lot" className={inputClass} placeholder="LOTE-2026-01" value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="expdate" className={labelClass}>Fecha de vencimiento</label>
          <input id="expdate" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} />
        </div>
        <div>
          <label htmlFor="wh" className={labelClass}>Almacén</label>
          <input id="wh" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div>
        <label htmlFor="notes-entry" className={labelClass}>Notas</label>
        <textarea id="notes-entry" className={inputClass} rows={2} placeholder="Observaciones…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : 'Guardar'}</button>
    </form>
  );
}

function ExitForm({ lots, products, onDone }: { lots: StockLot[]; products: StockLot['product'][]; onDone: (message: string) => Promise<void> }) {
  const [productId, setProductId] = useState('');
  const [inventoryLotId, setInventoryLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productLots = lots.filter((lot) => lot.product.id === productId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await inventoryService.exit({ productId, inventoryLotId: inventoryLotId || undefined, quantity: Number(quantity), reason });
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
    <form onSubmit={submit} className={`space-y-3 ${cardClass} animate-slide-in-right`}>
      <h2 className="font-bold text-slate-900">Registrar salida</h2>
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
        <label htmlFor="exit-reason" className={labelClass}>Motivo de salida *</label>
        <textarea id="exit-reason" required className={inputClass} rows={2} placeholder="Describe el motivo…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : 'Registrar salida'}</button>
    </form>
  );
}

/* ─────────────────────────────────────────
   PRODUCTS TAB
───────────────────────────────────────── */
function ProductsTab({ products, onDone }: { products: Product[]; onDone: (msg: string) => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.activeIngredient ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const handleSaved = async (msg: string) => {
    setMessage(msg);
    setShowForm(false);
    setEditProduct(null);
    await onDone(msg);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="prod-search" className={labelClass}>Buscar producto</label>
              <input id="prod-search" className={inputClass} placeholder="Nombre o ingrediente activo…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
            <button className={buttonClass} onClick={() => { setShowForm(true); setEditProduct(null); }}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Nuevo producto
            </button>
          </div>
        </div>
        {message && <Notice kind="ok">{message}</Notice>}
        <div className="table-container">
          <div className="border-b border-slate-100/80 px-5 py-3.5">
            <h2 className="font-bold text-slate-900">Catálogo de productos ({filtered.length})</h2>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              title="No hay productos"
              description="Crea tu primer producto agroquímico."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Nombre</th>
                    <th scope="col" className="px-5 py-3.5">Categoría</th>
                    <th scope="col" className="px-5 py-3.5">Unidad</th>
                    <th scope="col" className="px-5 py-3.5 tabular-nums">Stock mín.</th>
                    <th scope="col" className="px-5 py-3.5 tabular-nums">Días alerta</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {filtered.map((p) => (
                    <tr key={p.id} className="transition">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-800">{p.name}</p>
                        {p.activeIngredient && <p className="text-xs text-slate-500">{p.activeIngredient}</p>}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{p.category ?? '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{p.unit}</td>
                      <td className="px-5 py-3.5 tabular-nums font-medium">{Number(p.minimumStock)}</td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600">{p.expirationWarningDays} días</td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          aria-label={`Editar ${p.name}`}
                          onClick={() => { setEditProduct(p); setShowForm(true); }}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
                        >Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ProductForm product={editProduct} onDone={handleSaved} onCancel={() => { setShowForm(false); setEditProduct(null); }} />
      )}
    </div>
  );
}

function ProductForm({ product, onDone, onCancel }: { product: Product | null; onDone: (msg: string) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? '', commercialName: product?.commercialName ?? '',
    activeIngredient: product?.activeIngredient ?? '', category: product?.category ?? '',
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
    <form onSubmit={submit} className={`space-y-3 ${cardClass} animate-slide-in-right`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
        <button type="button" aria-label="Cerrar formulario" onClick={onCancel} className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label htmlFor="p-name" className={labelClass}>Nombre *</label><input id="p-name" required className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="p-commercial" className={labelClass}>Nombre comercial</label><input id="p-commercial" className={inputClass} value={form.commercialName} onChange={(e) => set('commercialName', e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="p-ai" className={labelClass}>Ingrediente activo</label><input id="p-ai" className={inputClass} value={form.activeIngredient} onChange={(e) => set('activeIngredient', e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="p-cat" className={labelClass}>Categoría</label><select id="p-cat" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}><option value="">Sin categoría</option>{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label htmlFor="p-unit" className={labelClass}>Unidad *</label><select id="p-unit" className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
        <div><label htmlFor="p-mstock" className={labelClass}>Stock mínimo</label><input id="p-mstock" className={inputClass} type="number" min="0" value={form.minimumStock} onChange={(e) => set('minimumStock', e.target.value)} /></div>
        <div><label htmlFor="p-expdays" className={labelClass}>Días alerta vencimiento</label><input id="p-expdays" className={inputClass} type="number" min="1" value={form.expirationWarningDays} onChange={(e) => set('expirationWarningDays', e.target.value)} /></div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
        <button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : product ? 'Actualizar' : 'Crear producto'}</button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   LOTS TAB
───────────────────────────────────────── */
function LotsTab({ lots, products, onDone }: { lots: InventoryLot[]; products: Product[]; onDone: (msg: string) => Promise<void> }) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [editLot, setEditLot] = useState<InventoryLot | null>(null);
  const filtered = selectedProductId ? lots.filter((l) => l.product.id === selectedProductId) : lots;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className={cardClass}>
          <label htmlFor="lot-product-filter" className={labelClass}>Filtrar por producto</label>
          <select id="lot-product-filter" className={inputClass} value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            <option value="">Todos los productos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="table-container">
          <div className="border-b border-slate-100/80 px-5 py-3.5">
            <h2 className="font-bold text-slate-900">Lotes ({filtered.length})</h2>
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
                    <th scope="col" className="px-5 py-3.5">Producto</th>
                    <th scope="col" className="px-5 py-3.5">Nº Lote</th>
                    <th scope="col" className="px-5 py-3.5 tabular-nums">Cantidad</th>
                    <th scope="col" className="px-5 py-3.5">Vencimiento</th>
                    <th scope="col" className="px-5 py-3.5">Almacén</th>
                    <th scope="col" className="px-5 py-3.5">Estado</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Editar</th>
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
                      <td className="px-5 py-3.5 font-semibold text-slate-800">{lot.product.name}</td>
                      <td className="px-5 py-3.5 text-slate-600">{lot.lotNumber ?? '—'}</td>
                      <td className="px-5 py-3.5 tabular-nums font-semibold">{fmtNumber(lot.currentQuantity)} {lot.product.unit}</td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600">{fmtDate(lot.expirationDate)}</td>
                      <td className="px-5 py-3.5 text-slate-600">{lot.warehouseName ?? '—'}</td>
                      <td className="px-5 py-3.5"><CriticalityBadge value={lot.criticality} /></td>
                      <td className="px-5 py-3.5 text-right">
                        <button aria-label={`Editar lote ${lot.lotNumber ?? lot.id}`} onClick={() => setEditLot(lot)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editLot && <LotEditForm lot={editLot} onDone={async (msg) => { setEditLot(null); await onDone(msg); }} onCancel={() => setEditLot(null)} />}
    </div>
  );
}

function LotEditForm({ lot, onDone, onCancel }: { lot: InventoryLot; onDone: (msg: string) => Promise<void>; onCancel: () => void }) {
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
    <form onSubmit={submit} className={`space-y-3 ${cardClass} animate-slide-in-right`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">Editar lote</h2>
        <button type="button" aria-label="Cerrar" onClick={onCancel} className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <p className="text-sm text-slate-500">Producto: <strong className="text-slate-700">{lot.product.name}</strong></p>
      <div><label htmlFor="lot-num" className={labelClass}>Número de lote</label><input id="lot-num" className={inputClass} value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" /></div>
      <div><label htmlFor="lot-exp" className={labelClass}>Fecha de vencimiento</label><input id="lot-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></div>
      <div><label htmlFor="lot-wh" className={labelClass}>Almacén</label><input id="lot-wh" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" /></div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
        <button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : 'Actualizar lote'}</button>
      </div>
    </form>
  );
}

/* ─────────────────────────────────────────
   ADJUSTMENTS TAB
───────────────────────────────────────── */
function AdjustmentsTab({ lots, products, onDone }: { lots: StockLot[]; products: StockLot['product'][]; onDone: (msg: string) => Promise<void> }) {
  const [form, setForm] = useState({
    productId: '', inventoryLotId: '', direction: 'DECREMENTO' as AdjustmentDirection,
    reasonType: 'PERDIDA' as AdjustmentReasonType, quantity: '', reason: '',
    lotNumber: '', expirationDate: '', warehouseName: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await onDone('Ajuste registrado.');
      setForm((prev) => ({ ...prev, productId: '', inventoryLotId: '', quantity: '', reason: '' }));
    } catch (err) {
      setError(extractError(err, 'No fue posible registrar el ajuste.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_480px]">
      <div className={`${cardClass} space-y-4 animate-fade-in`}>
        <div>
          <h2 className="font-bold text-slate-900 mb-1">Información sobre ajustes</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Los ajustes corrigen el inventario por pérdidas, daños o errores de conteo.
            Son independientes de entradas/salidas normales y quedan registrados como movimiento tipo <strong>AJUSTE</strong>.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['PERDIDA', 'DANO', 'CORRECCION'] as AdjustmentReasonType[]).map((rt) => {
            const info = {
              PERDIDA:    { icon: '⚠️', label: 'Pérdida', desc: 'Producto derramado, robado o destruido.' },
              DANO:       { icon: '🔴', label: 'Daño',    desc: 'Producto dañado e inutilizable.' },
              CORRECCION: { icon: '✏️', label: 'Corrección', desc: 'Error en conteo físico.' },
            }[rt];
            return (
              <div key={rt} className="rounded-xl bg-slate-50/80 p-3 text-sm border border-slate-100">
                <p className="font-semibold text-slate-700">{info.icon} {info.label}</p>
                <p className="text-xs text-slate-500 mt-1">{info.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={submit} className={`space-y-4 ${cardClass} animate-slide-in-right`}>
        <h2 className="font-bold text-slate-900">Registrar ajuste</h2>
        <div>
          <label htmlFor="adj-product" className={labelClass}>Producto *</label>
          <select id="adj-product" required className={inputClass} value={form.productId} onChange={(e) => { set('productId', e.target.value); set('inventoryLotId', ''); }}>
            <option value="">Seleccionar producto</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <p className={labelClass}>Dirección *</p>
          <div className="grid grid-cols-2 gap-2">
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
            <option value="PERDIDA">Pérdida</option>
            <option value="DANO">Daño</option>
            <option value="CORRECCION">Corrección</option>
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
        <button disabled={saving || !form.productId || !form.quantity} className={buttonClass}>{saving ? 'Registrando…' : 'Registrar ajuste'}</button>
      </form>
    </div>
  );
}
