import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  CriticalityBadge,
  EmptyState,
  Notice,
  SkeletonRow,
  StatCard,
  UserAvatar,
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  ROLE_COLORS,
} from '../components/app-shell';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
import { inventoryService, purchasesService } from '../services/inventory.service';
import { listUsers } from '../services/users.service';
import type { InventoryCriticality, PurchasePaymentMode, StockLot } from '../types/inventory';
import type { AdminUser } from '../types/users';

interface AllocationRow {
  userId: string;
  quantity: string;
}

type Tab = 'global' | 'compra';

const CATEGORY_OPTIONS = ['Herbicida', 'Fungicida', 'Insecticida', 'Fertilizante', 'Otro'];
const UNIT_OPTIONS = ['L', 'kg', 'g', 'ml', 'unidad'];

export function DirectivaPage() {
  const [activeTab, setActiveTab] = useState<Tab>('global');
  const [farmers, setFarmers] = useState<AdminUser[]>([]);
  const [stock, setStock] = useState<StockLot[]>([]);
  const [ownerUserId, setOwnerUserId] = useState('');
  const [search, setSearch] = useState('');
  const [criticality, setCriticality] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersData, globalStock] = await Promise.all([
        listUsers(),
        inventoryService.globalStock({
          ownerUserId: ownerUserId || undefined,
          search: search || undefined,
          criticality: (criticality || undefined) as InventoryCriticality | undefined,
          orderBy: 'expiration',
        }),
      ]);
      setFarmers(usersData.filter((user) => user.role === 'AGRICULTOR' && user.isActive));
      setStock(globalStock);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar datos de directiva.'));
    } finally {
      setLoading(false);
    }
  }, [criticality, ownerUserId, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Metrics
  const totalStock = useMemo(
    () => stock.reduce((total, lot) => total + Number(lot.currentQuantity), 0),
    [stock],
  );

  const criticalLots = useMemo(
    () => stock.filter((l) => l.criticality === 'VENCIDO' || l.criticality === 'BAJO_MINIMO').length,
    [stock],
  );

  const done = async (text: string) => {
    setMessage(text);
    await refresh();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'global', label: 'Inventario global' },
    { key: 'compra', label: 'Compra conjunta' },
  ];

  return (
    <AppShell title="Panel Directiva" section="Vista global del sindicato">
      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3 animate-fade-in">
        <StatCard
          label="Agricultores activos"
          value={farmers.length}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
          color="emerald"
        />
        <StatCard
          label="Stock total global"
          value={fmtNumber(totalStock)}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
          color="sky"
        />
        <StatCard
          label="Lotes críticos"
          value={criticalLots}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          color={criticalLots > 0 ? 'red' : 'slate'}
        />
      </div>

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
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Inventario global ── */}
      {activeTab === 'global' && (
        <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
          {/* Table */}
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label htmlFor="g-search" className={labelClass}>Buscar producto</label>
                  <input id="g-search" className={inputClass} placeholder="Nombre…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="g-farmer" className={labelClass}>Agricultor</label>
                  <select id="g-farmer" className={inputClass} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
                    <option value="">Todos los agricultores</option>
                    {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="g-crit" className={labelClass}>Estado</label>
                  <select id="g-crit" className={inputClass} value={criticality} onChange={(e) => setCriticality(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="BAJO_MINIMO">Bajo mínimo</option>
                    <option value="VENCIDO">Vencido</option>
                    <option value="POR_VENCER">Por vencer</option>
                    <option value="OK">OK</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button className={secondaryButtonClass} aria-label="Actualizar inventario global" onClick={() => void refresh()}>
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>
            </div>

            <div className="table-container">
              <div className="border-b border-slate-100/80 px-5 py-3.5 flex items-center justify-between">
                <h2 className="font-bold text-slate-900">Inventario global ({stock.length} lotes)</h2>
                <p className="text-sm text-slate-500 tabular-nums">Total: <strong>{fmtNumber(totalStock)}</strong></p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3.5">Agricultor</th>
                      <th scope="col" className="px-5 py-3.5">Producto</th>
                      <th scope="col" className="px-5 py-3.5 tabular-nums">Stock</th>
                      <th scope="col" className="px-5 py-3.5">Lote</th>
                      <th scope="col" className="px-5 py-3.5 tabular-nums">Vence</th>
                      <th scope="col" className="px-5 py-3.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/80">
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                    ) : stock.length === 0 ? (
                      <tr><td colSpan={6}><EmptyState
                        icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                        title="Sin datos globales"
                        description="No hay inventario registrado o no coincide con los filtros."
                      /></td></tr>
                    ) : (
                      stock.map((lot) => (
                        <tr
                          key={lot.id}
                          className={`transition ${
                            lot.criticality === 'VENCIDO' ? 'bg-red-50/40' :
                            lot.criticality === 'BAJO_MINIMO' ? 'bg-amber-50/40' :
                            lot.criticality === 'POR_VENCER' ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <UserAvatar name={lot.owner?.name ?? '?'} size="sm" gradient={ROLE_COLORS['AGRICULTOR']} />
                              <p className="font-semibold text-slate-800">{lot.owner?.name ?? '—'}</p>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-slate-700">{lot.product.name}</p>
                            <p className="text-xs text-slate-500">{lot.product.category ?? 'Sin categoría'}</p>
                          </td>
                          <td className="px-5 py-3.5 font-semibold tabular-nums">{fmtNumber(lot.currentQuantity)} {lot.product.unit}</td>
                          <td className="px-5 py-3.5 text-slate-600">{lot.lotNumber ?? '—'}</td>
                          <td className="px-5 py-3.5 tabular-nums text-slate-600">{fmtDate(lot.expirationDate)}</td>
                          <td className="px-5 py-3.5"><CriticalityBadge value={lot.criticality} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Farmers side panel */}
          <div>
            <div className="table-container">
              <div className="border-b border-slate-100/80 px-5 py-3.5">
                <h2 className="font-bold text-slate-900">Agricultores activos</h2>
              </div>
              {farmers.length === 0 ? (
                <EmptyState title="Sin agricultores" description="No hay agricultores activos." />
              ) : (
                <ul className="divide-y divide-slate-100/80">
                  {farmers.map((farmer) => {
                    const farmerStock = stock
                      .filter((l) => l.ownerUserId === farmer.id)
                      .reduce((sum, l) => sum + Number(l.currentQuantity), 0);
                    const isSelected = ownerUserId === farmer.id;
                    return (
                      <li
                        key={farmer.id}
                        className={`flex items-center justify-between px-5 py-3.5 text-sm cursor-pointer transition-all duration-200 hover:bg-slate-50 ${isSelected ? 'bg-emerald-50/60' : ''}`}
                        onClick={() => setOwnerUserId(isSelected ? '' : farmer.id)}
                        role="button"
                        aria-pressed={isSelected}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOwnerUserId(isSelected ? '' : farmer.id); }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar name={farmer.name} size="sm" gradient={ROLE_COLORS['AGRICULTOR']} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{farmer.name}</p>
                            <p className="text-xs text-slate-500 truncate">{farmer.email}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-bold tabular-nums text-emerald-700">{fmtNumber(farmerStock)}</p>
                          <p className="text-[10px] text-slate-400">en stock</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Compra conjunta ── */}
      {activeTab === 'compra' && (
        <div className="max-w-2xl">
          <JointPurchaseForm farmers={farmers} onDone={done} />
        </div>
      )}
    </AppShell>
  );
}

/* ─────────────────────────────────────────
   Joint Purchase Form
───────────────────────────────────────── */
function JointPurchaseForm({ farmers, onDone }: { farmers: AdminUser[]; onDone: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({
    supplierName: '',
    paymentMode: 'CREDITO' as PurchasePaymentMode,
    dueDate: '',
    productName: '',
    category: '',
    unit: 'L',
    quantity: '',
    unitCost: '',
    discountAmount: '',
    lotNumber: '',
    expirationDate: '',
    warehouseName: 'Deposito comun del sindicato',
    notes: '',
  });
  const [allocations, setAllocations] = useState<AllocationRow[]>([
    { userId: '', quantity: '' },
    { userId: '', quantity: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const allocated = allocations.reduce((total, row) => total + Number(row.quantity || 0), 0);
  const quantity = Number(form.quantity || 0);
  const balanced = quantity > 0 && Math.abs(allocated - quantity) < 0.0001;
  const progressPct = quantity > 0 ? Math.min((allocated / quantity) * 100, 100) : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!balanced) {
      setError('La cantidad distribuida debe sumar exactamente la cantidad total comprada.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await purchasesService.createJoint({
        supplier: { supplierName: form.supplierName },
        paymentMode: form.paymentMode,
        dueDate: form.paymentMode === 'CREDITO' ? form.dueDate : undefined,
        warehouseName: form.warehouseName || undefined,
        notes: form.notes || undefined,
        items: [
          {
            product: {
              productName: form.productName,
              category: form.category || undefined,
              unit: form.unit,
            },
            quantity,
            unitCost: Number(form.unitCost),
            discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
            lotNumber: form.lotNumber || undefined,
            expirationDate: form.expirationDate || undefined,
            allocations: allocations
              .filter((row) => row.userId && Number(row.quantity) > 0)
              .map((row) => ({ userId: row.userId, quantity: Number(row.quantity) })),
          },
        ],
      });
      await onDone('Compra conjunta creada y distribuida exitosamente.');
    } catch (err) {
      setError(extractError(err, 'No fue posible crear la compra conjunta.'));
    } finally {
      setSaving(false);
    }
  };

  const updateAllocation = (index: number, row: AllocationRow) => {
    setAllocations((prev) => prev.map((item, i) => (i === index ? row : item)));
  };

  return (
    <form onSubmit={submit} className={`space-y-5 ${cardClass} animate-fade-in`}>
      <h2 className="font-bold text-slate-900 text-base">Compra conjunta del sindicato</h2>

      {/* Supplier & Payment */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Proveedor y pago</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="jc-supplier" className={labelClass}>Proveedor *</label>
            <input id="jc-supplier" required className={inputClass} placeholder="Agroservicios San Julián…" value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="jc-payment" className={labelClass}>Modalidad *</label>
            <select id="jc-payment" className={inputClass} value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value as PurchasePaymentMode)}>
              <option value="CREDITO">Crédito</option>
              <option value="CONTADO">Contado</option>
            </select>
          </div>
          {form.paymentMode === 'CREDITO' && (
            <div>
              <label htmlFor="jc-due" className={labelClass}>Fecha vencimiento *</label>
              <input id="jc-due" required className={inputClass} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="jc-wh" className={labelClass}>Almacén</label>
            <input id="jc-wh" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" />
          </div>
        </div>
      </fieldset>

      {/* Product */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Producto</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="jc-pname" className={labelClass}>Nombre *</label><input id="jc-pname" required className={inputClass} placeholder="Herbicida…" value={form.productName} onChange={(e) => set('productName', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="jc-pcat" className={labelClass}>Categoría</label><select id="jc-pcat" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}><option value="">Sin categoría</option>{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label htmlFor="jc-unit" className={labelClass}>Unidad *</label><select id="jc-unit" className={inputClass} value={form.unit} onChange={(e) => set('unit', e.target.value)}>{UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label htmlFor="jc-qty" className={labelClass}>Cantidad total *</label><input id="jc-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="0.00" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></div>
          <div><label htmlFor="jc-cost" className={labelClass}>Costo unitario (Bs) *</label><input id="jc-cost" required className={inputClass} type="number" min="0" step="0.0001" placeholder="0.00" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} /></div>
          <div><label htmlFor="jc-disc" className={labelClass}>Descuento (Bs)</label><input id="jc-disc" className={inputClass} type="number" min="0" step="0.0001" placeholder="0.00" value={form.discountAmount} onChange={(e) => set('discountAmount', e.target.value)} /></div>
          <div><label htmlFor="jc-lot" className={labelClass}>Número de lote</label><input id="jc-lot" className={inputClass} placeholder="LOTE-2026-01" value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="jc-exp" className={labelClass}>Fecha de vencimiento</label><input id="jc-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></div>
        </div>
      </fieldset>

      {/* Distribution */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Distribución por agricultor</legend>

        {/* Progress */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-slate-500">Distribuido</span>
            <span className={`font-bold tabular-nums ${balanced ? 'text-emerald-700' : allocated > quantity ? 'text-red-600' : 'text-amber-600'}`}>
              {fmtNumber(allocated)} / {fmtNumber(quantity)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${balanced ? 'bg-emerald-500' : progressPct > 100 ? 'bg-red-500' : 'bg-amber-400'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {balanced && <p className="mt-1.5 text-xs font-semibold text-emerald-700 flex items-center gap-1"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Distribución completa</p>}
        </div>

        <div className="space-y-2">
          {allocations.map((row, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_auto] items-end">
              <div>
                <label htmlFor={`alloc-farmer-${index}`} className={index === 0 ? labelClass : 'sr-only'}>Agricultor</label>
                <select id={`alloc-farmer-${index}`} className={inputClass} value={row.userId} onChange={(e) => updateAllocation(index, { ...row, userId: e.target.value })}>
                  <option value="">Seleccionar agricultor</option>
                  {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`alloc-qty-${index}`} className={index === 0 ? labelClass : 'sr-only'}>Cantidad</label>
                <input id={`alloc-qty-${index}`} className={inputClass} type="number" min="0" step="0.0001" placeholder="0.00" value={row.quantity} onChange={(e) => updateAllocation(index, { ...row, quantity: e.target.value })} />
              </div>
              {allocations.length > 1 && (
                <button
                  type="button"
                  aria-label={`Quitar fila ${index + 1}`}
                  onClick={() => setAllocations((prev) => prev.filter((_, i) => i !== index))}
                  className="rounded-xl border border-red-200 p-2.5 text-red-500 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500 transition"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${secondaryButtonClass} mt-3`}
          onClick={() => setAllocations((prev) => [...prev, { userId: '', quantity: '' }])}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Agregar agricultor
        </button>
      </fieldset>

      <div>
        <label htmlFor="jc-notes" className={labelClass}>Notas</label>
        <textarea id="jc-notes" className={inputClass} rows={2} placeholder="Observaciones de la compra conjunta…" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving || !balanced} className={buttonClass}>
        {saving ? 'Creando compra conjunta…' : 'Crear compra conjunta'}
      </button>
    </form>
  );
}
