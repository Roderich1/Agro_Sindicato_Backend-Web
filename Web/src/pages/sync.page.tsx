import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  Notice,
  StatCard,
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { extractError, fmtDate } from '../lib/format';
import { inventoryService, syncService } from '../services/inventory.service';
import type { OfflineOperation, OfflineOperationType, StockLot } from '../types/inventory';

const QUEUE_KEY = 'agro_offline_queue_v1';
const CLIENT_ID_KEY = 'agro_client_id_v1';

function getClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const created = `web-${crypto.randomUUID()}`;
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

function readQueue(): OfflineOperation[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as OfflineOperation[];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineOperation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

const OPERATION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  INITIAL_STOCK: { label: 'Inventario inicial', color: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', icon: '📦' },
  STOCK_ENTRY: { label: 'Entrada', color: 'bg-sky-500/10 text-sky-700 ring-sky-500/20', icon: '📥' },
  STOCK_EXIT: { label: 'Salida', color: 'bg-amber-500/10 text-amber-700 ring-amber-500/20', icon: '📤' },
};

export function SyncPage() {
  const [clientId] = useState(getClientId);
  const [queue, setQueue] = useState<OfflineOperation[]>(readQueue);
  const [stock, setStock] = useState<StockLot[]>([]);
  const [operation, setOperation] = useState<OfflineOperationType>('INITIAL_STOCK');
  const [form, setForm] = useState({
    productName: '',
    productId: '',
    unit: 'L',
    quantity: '',
    lotNumber: '',
    expirationDate: '',
    warehouseName: 'Galpon principal',
    entryReason: 'COMPRA',
    reason: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    void inventoryService.stock().then(setStock).catch(() => undefined);
  }, []);

  useEffect(() => {
    writeQueue(queue);
  }, [queue]);

  const products = useMemo(() => {
    const map = new Map<string, StockLot['product']>();
    stock.forEach((lot) => map.set(lot.product.id, lot.product));
    return Array.from(map.values());
  }, [stock]);

  const addToQueue = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const base = {
      quantity: Number(form.quantity),
      lotNumber: form.lotNumber || undefined,
      expirationDate: form.expirationDate || undefined,
      warehouseName: form.warehouseName || undefined,
    };
    let payload: Record<string, unknown>;

    if (operation === 'STOCK_EXIT') {
      payload = {
        productId: form.productId,
        quantity: Number(form.quantity),
        reason: form.reason,
      };
    } else if (operation === 'STOCK_ENTRY') {
      payload = {
        ...base,
        entryReason: form.entryReason,
        product: form.productId
          ? { productId: form.productId }
          : { productName: form.productName, unit: form.unit },
      };
    } else {
      payload = {
        ...base,
        product: form.productId
          ? { productId: form.productId }
          : { productName: form.productName, unit: form.unit },
      };
    }

    setQueue((prev) => [
      ...prev,
      {
        clientOperationId: crypto.randomUUID(),
        operation,
        payload,
      },
    ]);
    setForm((prev) => ({ ...prev, quantity: '', lotNumber: '', reason: '' }));
    setMessage('Operación guardada en cola offline.');
  };

  const sync = async () => {
    if (queue.length === 0) return;
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const { data } = await syncService.syncOperations({ clientId, operations: queue });
      const appliedIds = new Set(
        (data.results as Array<{ clientOperationId: string; status: string }>)
          .filter((result) => result.status === 'APLICADA')
          .map((result) => result.clientOperationId),
      );
      setQueue((prev) => prev.filter((item) => !appliedIds.has(item.clientOperationId)));
      setMessage(`Sincronización procesada: ${data.applied} aplicadas, ${data.conflicts} conflictos, ${data.rejected} rechazadas.`);
    } catch (err) {
      setError(extractError(err, 'No fue posible sincronizar.'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell title="Sincronización offline" section="Trabajo sin conexión">
      {/* Connection status + KPI */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3 animate-fade-in">
        {/* Connection status card */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isOnline ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'} text-white shadow-sm`}>
              {isOnline ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M3 3l18 18" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Conexión</p>
              <p className={`text-lg font-bold ${isOnline ? 'text-emerald-700' : 'text-slate-600'}`}>
                {isOnline ? 'En línea' : 'Sin conexión'}
              </p>
            </div>
          </div>
        </div>

        <StatCard
          label="Operaciones en cola"
          value={queue.length}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
          color={queue.length > 0 ? 'amber' : 'slate'}
        />

        <StatCard
          label="Productos en stock"
          value={products.length}
          icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
          color="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Add to queue form */}
        <form onSubmit={addToQueue} className={`space-y-4 ${cardClass} animate-slide-in-left`}>
          <h2 className="font-bold text-slate-900">Agregar operación a cola local</h2>

          <div>
            <label htmlFor="sync-op-type" className={labelClass}>Tipo de operación</label>
            <select id="sync-op-type" className={inputClass} value={operation} onChange={(e) => setOperation(e.target.value as OfflineOperationType)}>
              <option value="INITIAL_STOCK">Inventario inicial</option>
              <option value="STOCK_ENTRY">Entrada</option>
              <option value="STOCK_EXIT">Salida</option>
            </select>
          </div>

          {operation === 'STOCK_EXIT' ? (
            <div>
              <label htmlFor="exit-product-sync" className={labelClass}>Producto *</label>
              <select id="exit-product-sync" required className={inputClass} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">Seleccionar producto</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="sync-product-sel" className={labelClass}>Producto existente</label>
                <select id="sync-product-sel" className={inputClass} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">Producto nuevo</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </div>
              {!form.productId && (
                <div>
                  <label htmlFor="sync-product-name" className={labelClass}>Nombre nuevo *</label>
                  <input id="sync-product-name" required className={inputClass} placeholder="Nombre producto" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} autoComplete="off" />
                </div>
              )}
            </div>
          )}

          {operation === 'STOCK_ENTRY' && (
            <div>
              <label htmlFor="sync-entry-reason" className={labelClass}>Motivo de entrada</label>
              <select id="sync-entry-reason" className={inputClass} value={form.entryReason} onChange={(e) => setForm({ ...form, entryReason: e.target.value })}>
                <option value="COMPRA">Compra</option>
                <option value="DEVOLUCION">Devolución</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="sync-qty" className={labelClass}>Cantidad *</label>
              <input id="sync-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" placeholder="Cantidad" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            {operation !== 'STOCK_EXIT' && (
              <>
                <div>
                  <label htmlFor="sync-unit" className={labelClass}>Unidad</label>
                  <input id="sync-unit" className={inputClass} placeholder="L" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="sync-lot" className={labelClass}>Lote</label>
                  <input id="sync-lot" className={inputClass} placeholder="LOTE-01" value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="sync-exp" className={labelClass}>Vencimiento</label>
                  <input id="sync-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} />
                </div>
              </>
            )}
          </div>

          {operation === 'STOCK_EXIT' && (
            <div>
              <label htmlFor="sync-reason" className={labelClass}>Motivo *</label>
              <textarea id="sync-reason" required className={inputClass} placeholder="Motivo de la salida…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          )}

          <button className={buttonClass}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Guardar en cola
          </button>
        </form>

        {/* Queue + sync panel */}
        <div className="space-y-4">
          {message && <Notice kind="ok">{message}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}

          <div className={`${cardClass}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Cola offline</h2>
                <p className="text-xs text-slate-400 tabular-nums mt-0.5">Dispositivo: {clientId.slice(0, 20)}…</p>
              </div>
              <div className="flex gap-2">
                <button className={secondaryButtonClass} onClick={() => setQueue([])}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Vaciar
                </button>
                <button
                  disabled={syncing || queue.length === 0}
                  className={buttonClass}
                  onClick={() => void sync()}
                >
                  {syncing ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Sincronizando…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Sincronizar
                    </span>
                  )}
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100/80 text-slate-300">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-500">No hay operaciones pendientes</p>
                <p className="text-xs text-slate-400 mt-1">Las operaciones que agregues aparecerán aquí.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {queue.map((item, idx) => {
                  const opInfo = OPERATION_LABELS[item.operation] ?? { label: item.operation, color: 'bg-slate-100 text-slate-600', icon: '📝' };
                  return (
                    <li key={item.clientOperationId} className="rounded-xl border border-slate-200/80 bg-white/60 p-3.5 transition-all duration-200 hover:shadow-sm animate-fade-in" style={{ animationDelay: `${idx * 50}ms` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{opInfo.icon}</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${opInfo.color}`}>
                            {opInfo.label}
                          </span>
                        </div>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                          {item.clientOperationId.slice(0, 8)}
                        </span>
                      </div>
                      <pre className="mt-2.5 max-h-24 overflow-auto rounded-lg bg-slate-50/80 p-2.5 text-xs text-slate-600 font-mono leading-relaxed border border-slate-100">
                        {JSON.stringify(item.payload, null, 2)}
                      </pre>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Notice kind="info">Las operaciones aplicadas se eliminan de la cola. Los conflictos quedan para revisarlos y corregirlos.</Notice>
          <p className="text-xs text-slate-400 tabular-nums">Última revisión visual: {fmtDate(new Date().toISOString())}</p>
        </div>
      </div>
    </AppShell>
  );
}
