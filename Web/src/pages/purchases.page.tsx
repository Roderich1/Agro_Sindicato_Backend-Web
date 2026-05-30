import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AppShell,
  EmptyState,
  Notice,
  SkeletonRow,
  StatCard,
  StatusBadge,
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
import {
  payablesService,
  purchasesService,
  suppliersService,
} from '../services/inventory.service';
import type {
  PayableAccount,
  PayableStatus,
  PurchasePaymentMode,
  Supplier,
} from '../types/inventory';

type Tab = 'compra' | 'proveedores' | 'cuentas';

export function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('compra');
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingPayables, setIsLoadingPayables] = useState(true);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);

  const refreshPayables = useCallback(async () => {
    setIsLoadingPayables(true);
    setError(null);
    try {
      setPayables(await payablesService.list({ status: statusFilter || undefined }));
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar cuentas por pagar.'));
    } finally {
      setIsLoadingPayables(false);
    }
  }, [statusFilter]);

  const refreshSuppliers = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      setSuppliers(await suppliersService.list());
    } catch {
      // silencioso
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    void refreshPayables();
    void refreshSuppliers();
  }, [refreshPayables, refreshSuppliers]);

  const done = async (text: string) => {
    setMessage(text);
    await refreshPayables();
    await refreshSuppliers();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'compra', label: 'Nueva compra' },
    { key: 'proveedores', label: 'Proveedores' },
    { key: 'cuentas', label: 'Cuentas por pagar' },
  ];

  const overdueCount = payables.filter((p) => p.status === 'VENCIDA').length;
  const pendingCount = payables.filter((p) => p.status === 'PENDIENTE' || p.status === 'PARCIAL').length;
  const totalDebt = payables.reduce((sum, p) => sum + Number(p.balance), 0);

  return (
    <AppShell title="Compras y finanzas" section="Gestión financiera">
      {/* KPI Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3 animate-fade-in">
        <StatCard
          label="Proveedores"
          value={suppliers.length}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
          color="sky"
        />
        <StatCard
          label="Saldo pendiente"
          value={`Bs ${fmtNumber(totalDebt)}`}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          color={totalDebt > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Cuentas vencidas"
          value={overdueCount}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color={overdueCount > 0 ? 'red' : 'slate'}
        />
      </div>

      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      {/* Alerts */}
      {(overdueCount > 0 || pendingCount > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 animate-fade-in">
          {overdueCount > 0 && <Notice kind="error"><strong>🔴 {overdueCount} cuenta(s) vencida(s)</strong> — requieren atención inmediata.</Notice>}
          {pendingCount > 0 && <Notice kind="warn"><strong>⏳ {pendingCount} cuenta(s) pendiente(s)</strong> de pago total.</Notice>}
        </div>
      )}

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
            {t.key === 'cuentas' && overdueCount > 0 ? (
              <span className="flex items-center gap-1.5">{t.label} <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white font-bold">{overdueCount}</span></span>
            ) : t.label}
          </button>
        ))}
      </div>

      {activeTab === 'compra' && <div className="max-w-2xl"><PurchaseForm suppliers={suppliers} onDone={done} /></div>}
      {activeTab === 'proveedores' && <SuppliersTab suppliers={suppliers} isLoading={isLoadingSuppliers} onDone={done} onRefresh={refreshSuppliers} />}
      {activeTab === 'cuentas' && <PayablesTab payables={payables} isLoading={isLoadingPayables} statusFilter={statusFilter} onStatusChange={setStatusFilter} onRefresh={refreshPayables} onDone={done} />}
    </AppShell>
  );
}

/* ── Purchase Form ── */
function PurchaseForm({ suppliers, onDone }: { suppliers: Supplier[]; onDone: (msg: string) => Promise<void> }) {
  const [form, setForm] = useState({
    supplierMode: 'existing' as 'existing' | 'new', supplierId: '', supplierName: '', phone: '',
    paymentMode: 'CONTADO' as PurchasePaymentMode, dueDate: '', purchasedAt: '', warehouseName: 'Galpon principal',
    productName: '', category: '', unit: 'L', quantity: '', unitCost: '', discountAmount: '',
    lotNumber: '', expirationDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supplier = form.supplierMode === 'existing' && form.supplierId
        ? { supplierId: form.supplierId } : { supplierName: form.supplierName, phone: form.phone || undefined };
      await purchasesService.create({
        supplier, paymentMode: form.paymentMode, dueDate: form.paymentMode === 'CREDITO' ? form.dueDate : undefined,
        purchasedAt: form.purchasedAt || undefined, warehouseName: form.warehouseName || undefined, notes: form.notes || undefined,
        items: [{
          product: { productName: form.productName, category: form.category || undefined, unit: form.unit },
          quantity: Number(form.quantity), unitCost: Number(form.unitCost),
          discountAmount: form.discountAmount ? Number(form.discountAmount) : undefined,
          lotNumber: form.lotNumber || undefined, expirationDate: form.expirationDate || undefined,
        }],
      });
      await onDone('Compra registrada correctamente.');
      setForm((prev) => ({ ...prev, quantity: '', unitCost: '', discountAmount: '', lotNumber: '', notes: '' }));
    } catch (err) {
      setError(extractError(err, 'No fue posible registrar la compra.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={`space-y-5 ${cardClass} animate-fade-in`}>
      <h2 className="font-bold text-slate-900 text-base">Registrar compra</h2>

      {/* Supplier */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4 space-y-3">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Proveedor</legend>
        <div className="flex gap-2">
          {(['existing', 'new'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => set('supplierMode', mode)} aria-pressed={form.supplierMode === mode}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${form.supplierMode === mode ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {mode === 'existing' ? 'Proveedor existente' : 'Nuevo proveedor'}
            </button>
          ))}
        </div>
        {form.supplierMode === 'existing' ? (
          <div><label htmlFor="sup-select" className={labelClass}>Seleccionar proveedor</label>
            <select id="sup-select" className={inputClass} value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ''}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div><label htmlFor="sup-name" className={labelClass}>Nombre *</label><input id="sup-name" required className={inputClass} placeholder="Agroservicios…" value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} autoComplete="off" /></div>
            <div><label htmlFor="sup-phone" className={labelClass}>Teléfono</label><input id="sup-phone" className={inputClass} type="tel" placeholder="70000000" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></div>
          </div>
        )}
      </fieldset>

      {/* Payment */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Condiciones de pago</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="payment-mode" className={labelClass}>Modalidad *</label><select id="payment-mode" className={inputClass} value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value as PurchasePaymentMode)}><option value="CONTADO">Contado</option><option value="CREDITO">Crédito</option></select></div>
          <div><label htmlFor="purchased-at" className={labelClass}>Fecha de compra</label><input id="purchased-at" className={inputClass} type="date" value={form.purchasedAt} onChange={(e) => set('purchasedAt', e.target.value)} /></div>
          {form.paymentMode === 'CREDITO' && <div><label htmlFor="due-date" className={labelClass}>Fecha de vencimiento *</label><input id="due-date" required className={inputClass} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>}
          <div><label htmlFor="wh-name" className={labelClass}>Almacén</label><input id="wh-name" className={inputClass} value={form.warehouseName} onChange={(e) => set('warehouseName', e.target.value)} autoComplete="off" /></div>
        </div>
      </fieldset>

      {/* Product */}
      <fieldset className="rounded-xl border border-slate-200/80 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Producto</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <div><label htmlFor="prod-name" className={labelClass}>Nombre *</label><input id="prod-name" required className={inputClass} placeholder="Glifosato 48%…" value={form.productName} onChange={(e) => set('productName', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="prod-cat" className={labelClass}>Categoría</label><input id="prod-cat" className={inputClass} placeholder="Herbicida" value={form.category} onChange={(e) => set('category', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="prod-unit" className={labelClass}>Unidad *</label><input id="prod-unit" required className={inputClass} placeholder="L" value={form.unit} onChange={(e) => set('unit', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="prod-qty" className={labelClass}>Cantidad *</label><input id="prod-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="0.00" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></div>
          <div><label htmlFor="prod-cost" className={labelClass}>Costo unitario (Bs) *</label><input id="prod-cost" required className={inputClass} type="number" min="0" step="0.0001" placeholder="0.00" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} /></div>
          <div><label htmlFor="prod-disc" className={labelClass}>Descuento (Bs)</label><input id="prod-disc" className={inputClass} type="number" min="0" step="0.0001" placeholder="0.00" value={form.discountAmount} onChange={(e) => set('discountAmount', e.target.value)} /></div>
          <div><label htmlFor="prod-lot" className={labelClass}>Número de lote</label><input id="prod-lot" className={inputClass} placeholder="LOTE-2026-01" value={form.lotNumber} onChange={(e) => set('lotNumber', e.target.value)} autoComplete="off" /></div>
          <div><label htmlFor="prod-exp" className={labelClass}>Fecha de vencimiento</label><input id="prod-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => set('expirationDate', e.target.value)} /></div>
        </div>
      </fieldset>

      <div><label htmlFor="purchase-notes" className={labelClass}>Notas</label><textarea id="purchase-notes" className={inputClass} rows={2} placeholder="Observaciones…" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : 'Registrar compra'}</button>
    </form>
  );
}

/* ── Suppliers Tab ── */
function SuppliersTab({ suppliers, isLoading, onDone, onRefresh }: { suppliers: Supplier[]; isLoading: boolean; onDone: (msg: string) => Promise<void>; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone ?? '').includes(search));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0"><label htmlFor="sup-search" className={labelClass}>Buscar proveedor</label><input id="sup-search" className={inputClass} placeholder="Nombre o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" /></div>
            <button className={buttonClass} onClick={() => { setShowForm(true); setEditSupplier(null); }}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Nuevo proveedor
            </button>
            <button className={secondaryButtonClass} aria-label="Actualizar lista" onClick={() => void onRefresh()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
        <div className="table-container">
          <div className="border-b border-slate-100/80 px-5 py-3.5"><h2 className="font-bold text-slate-900">Proveedores ({filtered.length})</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <tr><th scope="col" className="px-5 py-3.5">Proveedor</th><th scope="col" className="px-5 py-3.5">Teléfono</th><th scope="col" className="px-5 py-3.5">Dirección</th><th scope="col" className="px-5 py-3.5">Notas</th><th scope="col" className="px-5 py-3.5 text-right">Acciones</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {isLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : filtered.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} title="Sin proveedores" description="Registra tu primer proveedor." /></td></tr>
                ) : filtered.map((s) => (
                  <tr key={s.id} className="transition">
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{s.name}</td>
                    <td className="px-5 py-3.5 text-slate-600 tabular-nums">{s.phone ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 max-w-[160px] truncate">{s.address ?? '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[160px] truncate">{s.notes ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button aria-label={`Editar ${s.name}`} onClick={() => { setEditSupplier(s); setShowForm(true); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showForm && <SupplierForm supplier={editSupplier} onDone={async (msg) => { setShowForm(false); setEditSupplier(null); await onDone(msg); }} onCancel={() => { setShowForm(false); setEditSupplier(null); }} />}
    </div>
  );
}

function SupplierForm({ supplier, onDone, onCancel }: { supplier: Supplier | null; onDone: (msg: string) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({ name: supplier?.name ?? '', phone: supplier?.phone ?? '', address: supplier?.address ?? '', notes: supplier?.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      const payload = { name: form.name, phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined };
      if (supplier) { await suppliersService.update(supplier.id, payload); await onDone('Proveedor actualizado.'); }
      else { await suppliersService.create(payload); await onDone('Proveedor creado.'); }
    } catch (err) { setError(extractError(err, 'No fue posible guardar el proveedor.')); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className={`space-y-3 ${cardClass} animate-slide-in-right`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900">{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
        <button type="button" aria-label="Cerrar" onClick={onCancel} className="rounded-xl p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      <div><label htmlFor="s-name" className={labelClass}>Nombre *</label><input id="s-name" required className={inputClass} placeholder="Agroservicios…" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="organization" /></div>
      <div><label htmlFor="s-phone" className={labelClass}>Teléfono</label><input id="s-phone" className={inputClass} type="tel" placeholder="70000000" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></div>
      <div><label htmlFor="s-address" className={labelClass}>Dirección</label><input id="s-address" className={inputClass} placeholder="San Julián…" value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" /></div>
      <div><label htmlFor="s-notes" className={labelClass}>Notas</label><textarea id="s-notes" className={inputClass} rows={2} placeholder="Entrega los viernes…" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className={secondaryButtonClass}>Cancelar</button><button disabled={saving} className={buttonClass}>{saving ? 'Guardando…' : supplier ? 'Actualizar' : 'Crear proveedor'}</button></div>
    </form>
  );
}

/* ── Payables Tab ── */
function PayablesTab({ payables, isLoading, statusFilter, onStatusChange, onRefresh, onDone }: { payables: PayableAccount[]; isLoading: boolean; statusFilter: string; onStatusChange: (v: string) => void; onRefresh: () => Promise<void>; onDone: (msg: string) => Promise<void> }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-0 max-w-xs">
            <label htmlFor="status-filter" className={labelClass}>Filtrar por estado</label>
            <select id="status-filter" className={inputClass} value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="">Todos los estados</option>
              {(['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA'] as PayableStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="mt-5">
            <button className={secondaryButtonClass} onClick={() => void onRefresh()}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={cardClass}><div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 w-full rounded-xl" />)}</div></div>
      ) : payables.length === 0 ? (
        <div className={cardClass}><EmptyState icon={<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} title="Sin cuentas por pagar" description="Las compras a crédito aparecerán aquí." /></div>
      ) : (
        <div className="space-y-3">
          {payables.map((payable) => <PayableCard key={payable.id} payable={payable} isExpanded={expandedId === payable.id} onToggle={() => setExpandedId(expandedId === payable.id ? null : payable.id)} onDone={onDone} />)}
        </div>
      )}
    </div>
  );
}

function PayableCard({ payable, isExpanded, onToggle, onDone }: { payable: PayableAccount; isExpanded: boolean; onToggle: () => void; onDone: (msg: string) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxAmount = Number(payable.balance);
  const amountNum = Number(amount);
  const amountValid = amountNum > 0 && amountNum <= maxAmount;

  const pay = async (total = false) => {
    setSaving(true); setError(null);
    try {
      if (total) { await payablesService.payTotal(payable.id, { notes: notes || 'Pago total' }); }
      else { if (!amountValid) { setError(`El monto debe ser mayor a 0 y no superar el saldo (Bs ${fmtNumber(payable.balance)}).`); setSaving(false); return; } await payablesService.registerPayment(payable.id, { amount: amountNum, paidAt: new Date().toISOString().slice(0, 10), notes: notes || undefined }); }
      setAmount(''); setNotes('');
      await onDone(total ? 'Pago total registrado.' : 'Abono registrado.');
    } catch (err) { setError(extractError(err, 'No fue posible registrar el pago.')); } finally { setSaving(false); }
  };

  const isOverdue = payable.status === 'VENCIDA';
  const isPaid = payable.status === 'PAGADA';
  const paidPct = Number(payable.totalAmount) > 0 ? (Number(payable.paidAmount) / Number(payable.totalAmount)) * 100 : 0;

  return (
    <article className={`glass-card overflow-hidden transition-all duration-200 ${isOverdue ? 'ring-1 ring-red-300 border-l-4 border-red-500' : ''} animate-fade-in`}>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-800">{payable.supplier.name}</p>
              <StatusBadge status={payable.status} />
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Vence {fmtDate(payable.dueDate)}{payable.supplier.phone && ` · ${payable.supplier.phone}`}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><p className="text-[10px] text-slate-400 uppercase font-semibold tracking-[0.1em]">Total</p><p className="font-bold tabular-nums text-slate-700">Bs {fmtNumber(payable.totalAmount)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-semibold tracking-[0.1em]">Pagado</p><p className="font-bold tabular-nums text-emerald-700">Bs {fmtNumber(payable.paidAmount)}</p></div>
              <div><p className="text-[10px] text-slate-400 uppercase font-semibold tracking-[0.1em]">Saldo</p><p className={`font-bold tabular-nums ${isOverdue ? 'text-red-600' : 'text-slate-800'}`}>Bs {fmtNumber(payable.balance)}</p></div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {!isPaid && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-1.5 rounded-full transition-all duration-500 ${isOverdue ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${paidPct}%` }} />
            </div>
          </div>
        )}

        {!isPaid && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div><label htmlFor={`amount-${payable.id}`} className={labelClass}>Monto (Bs)</label><input id={`amount-${payable.id}`} className={`${inputClass} max-w-40`} type="number" min="0.01" max={maxAmount} step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex-1 min-w-0 max-w-xs"><label htmlFor={`notes-${payable.id}`} className={labelClass}>Notas</label><input id={`notes-${payable.id}`} className={inputClass} placeholder="Pago en efectivo…" value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" /></div>
            <button disabled={saving || !amount || !amountValid} className={secondaryButtonClass} onClick={() => void pay(false)}>Registrar abono</button>
            <button disabled={saving} className={buttonClass} onClick={() => void pay(true)}>{saving ? 'Guardando…' : 'Pagar total'}</button>
          </div>
        )}
        {isPaid && <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200"><svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> Cuenta pagada en su totalidad.</div>}
        {error && <div className="mt-2"><Notice kind="error">{error}</Notice></div>}
      </div>

      {/* Payment history */}
      <div className="border-t border-slate-100/80">
        <button onClick={onToggle} aria-expanded={isExpanded} className="flex w-full items-center justify-between px-5 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-50/60 transition">
          <span>{payable.payments.length > 0 ? `Ver historial de pagos (${payable.payments.length})` : 'Sin pagos registrados'}</span>
          <svg className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isExpanded && payable.payments.length > 0 && (
          <div className="border-t border-slate-50 px-5 pb-4 pt-3 animate-fade-in">
            <div className="space-y-2">
              {payable.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-xs">
                  <div className="flex flex-col items-center">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="w-px flex-1 bg-slate-200" />
                  </div>
                  <div className="flex-1 flex items-center justify-between gap-2 rounded-lg bg-slate-50/80 px-3 py-2">
                    <span className="text-slate-600 tabular-nums">{fmtDate(p.paidAt)}</span>
                    <span className="font-semibold tabular-nums text-emerald-700">Bs {fmtNumber(p.amount)}</span>
                    <span className="text-slate-500 truncate max-w-[120px]">{p.notes ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
