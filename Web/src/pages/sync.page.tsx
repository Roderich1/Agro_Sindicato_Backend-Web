import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
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
import { useCampaign } from '../hooks/use-campaign';
import { extractError, fmtDate, fmtMoney, fmtNumber } from '../lib/format';
import {
  applySyncResults,
  getOfflineClientId,
  plainOfflineOperation,
  readOfflineQueue,
  writeOfflineQueue,
  type QueuedOfflineOperation,
} from '../lib/offline-queue';
import { payablesService } from '../services/accounts-payable.service';
import { inventoryService } from '../services/inventory.service';
import { cropsService, plotCropAssignmentsService, plotsService } from '../services/plots.service';
import { syncService } from '../services/sync.service';
import type { PayableAccount } from '../types/accounts-payable';
import type { StockEntryReason, StockLot, StockMovementReasonType } from '../types/inventory';
import type { Crop, Plot, PlotCropAssignment } from '../types/plots';
import type { OfflineOperation, OfflineOperationType, SyncedOperation } from '../types/sync';

type SyncFormState = {
  productId: string;
  productName: string;
  unit: string;
  quantity: string;
  lotNumber: string;
  expirationDate: string;
  warehouseName: string;
  entryReason: StockEntryReason;
  reasonType: StockMovementReasonType;
  reason: string;
  plotId: string;
  plotName: string;
  location: string;
  area: string;
  areaUnit: string;
  cropId: string;
  plantedArea: string;
  plantedAt: string;
  inventoryLotId: string;
  dose: string;
  targetPest: string;
  appliedAt: string;
  payableId: string;
  paidAt: string;
  notes: string;
};

const initialForm: SyncFormState = {
  productId: '',
  productName: '',
  unit: 'L',
  quantity: '',
  lotNumber: '',
  expirationDate: '',
  warehouseName: 'Galpon principal',
  entryReason: 'COMPRA',
  reasonType: 'OTRO',
  reason: '',
  plotId: '',
  plotName: '',
  location: '',
  area: '',
  areaUnit: 'ha',
  cropId: '',
  plantedArea: '',
  plantedAt: '',
  inventoryLotId: '',
  dose: '',
  targetPest: '',
  appliedAt: '',
  payableId: '',
  paidAt: '',
  notes: '',
};

const OPERATION_LABELS: Record<OfflineOperationType, string> = {
  INITIAL_STOCK: 'Inventario inicial',
  PLOT_CREATE: 'Crear parcela',
  PLOT_UPDATE: 'Actualizar parcela',
  PLOT_DEACTIVATE: 'Inactivar parcela',
  PLOT_CROP_ASSIGN: 'Asignar cultivo',
  STOCK_ENTRY: 'Entrada de stock',
  STOCK_EXIT: 'Salida de stock',
  AGROCHEMICAL_APPLICATION: 'Aplicacion',
  PAYMENT_CREATE: 'Pago',
};

const OPERATIONS: OfflineOperationType[] = [
  'PLOT_CREATE',
  'PLOT_UPDATE',
  'PLOT_DEACTIVATE',
  'PLOT_CROP_ASSIGN',
  'INITIAL_STOCK',
  'STOCK_ENTRY',
  'STOCK_EXIT',
  'AGROCHEMICAL_APPLICATION',
  'PAYMENT_CREATE',
];

const CAMPAIGN_DEPENDENT = new Set<OfflineOperationType>([
  'PLOT_CROP_ASSIGN',
  'STOCK_ENTRY',
  'STOCK_EXIT',
  'AGROCHEMICAL_APPLICATION',
]);

const REASON_OPTIONS: Array<{ value: StockMovementReasonType; label: string }> = [
  { value: 'OTRO', label: 'Salida simple' },
  { value: 'APLICACION', label: 'Aplicacion' },
  { value: 'DEVOLUCION', label: 'Devolucion' },
  { value: 'PERDIDA_DERRAME', label: 'Perdida o derrame' },
  { value: 'VENCIMIENTO', label: 'Vencimiento' },
  { value: 'PRESTAMO_ENTREGA', label: 'Prestamo o entrega' },
];

function toNumber(value: string) {
  return Number(value || 0);
}

function optionalNumber(value: string) {
  return value ? Number(value) : undefined;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function SyncPage() {
  const { activeCampaign, hasActiveCampaign } = useCampaign();
  const [clientId] = useState(getOfflineClientId);
  const [queue, setQueue] = useState<QueuedOfflineOperation[]>(readOfflineQueue);
  const [serverOperations, setServerOperations] = useState<SyncedOperation[]>([]);
  const [stock, setStock] = useState<StockLot[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [assignments, setAssignments] = useState<PlotCropAssignment[]>([]);
  const [payables, setPayables] = useState<PayableAccount[]>([]);
  const [operation, setOperation] = useState<OfflineOperationType>('PLOT_CREATE');
  const [form, setForm] = useState<SyncFormState>(initialForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
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
    writeOfflineQueue(queue);
  }, [queue]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [stockData, plotData, cropData, assignmentData, payableData, syncedData] = await Promise.all([
        inventoryService.stock(),
        plotsService.list(),
        cropsService.list({ isActive: true }),
        plotCropAssignmentsService.list(activeCampaign?.id ? { campaignId: activeCampaign.id } : undefined),
        payablesService.list({ status: 'PENDIENTE' }),
        syncService.listOperations({ clientId }),
      ]);
      setStock(stockData);
      setPlots(plotData);
      setCrops(cropData);
      setAssignments(assignmentData);
      setPayables(payableData);
      setServerOperations(syncedData);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar datos para sincronizacion.'));
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id, clientId]);

  const products = useMemo(() => {
    const map = new Map<string, StockLot['product']>();
    stock.forEach((lot) => map.set(lot.product.id, lot.product));
    return Array.from(map.values());
  }, [stock]);

  const lotsForProduct = stock.filter((lot) => lot.product.id === form.productId);
  const canQueueOperation = !CAMPAIGN_DEPENDENT.has(operation) || hasActiveCampaign;
  const conflictItems = queue.filter((item) => item.lastStatus === 'CONFLICTO' || item.lastStatus === 'RECHAZADA');

  const set = (field: keyof SyncFormState, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const makeOperation = (): OfflineOperation => {
    const campaignId = activeCampaign?.id;
    const baseStock = {
      quantity: toNumber(form.quantity),
      lotNumber: optionalText(form.lotNumber),
      expirationDate: form.expirationDate || undefined,
      warehouseName: optionalText(form.warehouseName),
      notes: optionalText(form.notes),
    };

    switch (operation) {
      case 'PLOT_CREATE':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            name: form.plotName,
            location: optionalText(form.location) ?? null,
            area: optionalNumber(form.area) ?? null,
            areaUnit: form.areaUnit || 'ha',
            notes: optionalText(form.notes) ?? null,
          },
        };
      case 'PLOT_UPDATE':
        return {
          clientOperationId: crypto.randomUUID(),
          operation: 'PLOT_UPDATE',
          payload: {
            id: form.plotId,
            name: optionalText(form.plotName),
            location: optionalText(form.location) ?? null,
            area: form.area ? Number(form.area) : undefined,
            areaUnit: form.areaUnit || undefined,
            notes: optionalText(form.notes) ?? null,
          },
        };
      case 'PLOT_DEACTIVATE':
        return { clientOperationId: crypto.randomUUID(), operation: 'PLOT_DEACTIVATE', payload: { id: form.plotId } };
      case 'PLOT_CROP_ASSIGN':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            campaignId,
            plotId: form.plotId,
            cropId: form.cropId,
            plantedArea: optionalNumber(form.plantedArea) ?? null,
            plantedAt: form.plantedAt || null,
            notes: optionalText(form.notes) ?? null,
          },
        };
      case 'INITIAL_STOCK':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            ...baseStock,
            product: form.productId
              ? { productId: form.productId }
              : { productName: form.productName, unit: form.unit },
          },
        };
      case 'STOCK_ENTRY':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            ...baseStock,
            campaignId,
            entryReason: form.entryReason,
            product: form.productId
              ? { productId: form.productId }
              : { productName: form.productName, unit: form.unit },
          },
        };
      case 'STOCK_EXIT':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            campaignId,
            productId: form.productId,
            inventoryLotId: form.inventoryLotId || undefined,
            quantity: toNumber(form.quantity),
            reasonType: form.reasonType,
            reason: form.reason,
          },
        };
      case 'AGROCHEMICAL_APPLICATION':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            campaignId,
            plotId: form.plotId,
            productId: form.productId,
            inventoryLotId: form.inventoryLotId || undefined,
            quantity: toNumber(form.quantity),
            dose: optionalText(form.dose) ?? null,
            targetPest: optionalText(form.targetPest) ?? null,
            appliedAt: form.appliedAt || undefined,
            notes: optionalText(form.notes) ?? null,
          },
        };
      case 'PAYMENT_CREATE':
        return {
          clientOperationId: crypto.randomUUID(),
          operation,
          payload: {
            payableId: form.payableId,
            amount: toNumber(form.quantity),
            paidAt: form.paidAt || undefined,
            notes: optionalText(form.notes),
          },
        };
    }
  };

  const addToQueue = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!canQueueOperation) {
      setError('Esta operacion necesita una campana activa antes de guardarse en cola.');
      return;
    }
    const nextOperation = makeOperation();
    setQueue((current) => [...current, { ...nextOperation, queuedAt: new Date().toISOString() }]);
    setForm((current) => ({
      ...current,
      quantity: '',
      lotNumber: '',
      reason: '',
      notes: '',
      dose: '',
      targetPest: '',
    }));
    setMessage('Operacion guardada en cola offline.');
  };

  const sync = async () => {
    if (queue.length === 0) return;
    setSyncing(true);
    setError(null);
    setMessage(null);
    try {
      const data = await syncService.syncOperations({
        clientId,
        operations: queue.map(plainOfflineOperation),
      });
      const nextQueue = applySyncResults(queue, data.results);
      setQueue(nextQueue);
      const syncedData = await syncService.listOperations({ clientId });
      setServerOperations(syncedData);
      setMessage(`Sincronizacion procesada: ${data.applied} aplicadas, ${data.conflicts} conflictos, ${data.rejected} rechazadas.`);
    } catch (err) {
      setError(extractError(err, 'No fue posible sincronizar.'));
    } finally {
      setSyncing(false);
    }
  };

  const discard = (clientOperationId: string) => {
    setQueue((current) => current.filter((item) => item.clientOperationId !== clientOperationId));
  };

  const retryAsNew = (item: QueuedOfflineOperation) => {
    setQueue((current) => [
      ...current.filter((candidate) => candidate.clientOperationId !== item.clientOperationId),
      {
        ...plainOfflineOperation(item),
        clientOperationId: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
      } as QueuedOfflineOperation,
    ]);
    setMessage('Operacion preparada para reintento con un nuevo identificador.');
  };

  return (
    <AppShell title="Sincronizacion offline" section="Trabajo sin conexion">
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Estado" value={isOnline ? 'Online' : 'Offline'} color={isOnline ? 'emerald' : 'slate'} />
        <StatCard label="Pendientes" value={queue.length} color={queue.length ? 'amber' : 'slate'} />
        <StatCard label="Conflictos locales" value={conflictItems.length} color={conflictItems.length ? 'red' : 'slate'} />
        <StatCard label="Historial servidor" value={serverOperations.length} color="sky" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={addToQueue} className={`${cardClass} h-fit space-y-4`}>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Agregar operacion local</h2>
            <p className="text-sm text-slate-500">Se guarda en este navegador y se envia al backend al sincronizar.</p>
          </div>

          {!canQueueOperation && (
            <Notice kind="warn">Esta operacion necesita campana activa. Puedes cambiar de operacion o abrir una campana.</Notice>
          )}

          <div>
            <label htmlFor="sync-op-type" className={labelClass}>Tipo de operacion</label>
            <select id="sync-op-type" className={inputClass} value={operation} onChange={(event) => setOperation(event.target.value as OfflineOperationType)}>
              {OPERATIONS.map((item) => <option key={item} value={item}>{OPERATION_LABELS[item]}</option>)}
            </select>
          </div>

          {renderOperationFields({
            operation,
            form,
            set,
            products,
            lotsForProduct,
            plots,
            crops,
            assignments,
            payables,
          })}

          {message && <Notice kind="ok">{message}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}

          <button className={buttonClass} disabled={!canQueueOperation}>Guardar en cola</button>
        </form>

        <div className="space-y-4">
          <div className={cardClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Cola offline</h2>
                <p className="mt-0.5 text-xs text-slate-400 tabular-nums">Dispositivo: {clientId.slice(0, 28)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={() => void loadData()}>Actualizar datos</button>
                <button type="button" className={dangerButtonClass} disabled={queue.length === 0} onClick={() => setQueue([])}>Vaciar cola</button>
                <button type="button" disabled={syncing || queue.length === 0} className={buttonClass} onClick={() => void sync()}>
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <EmptyState title="No hay operaciones pendientes" description="Las operaciones offline apareceran aqui." />
            ) : (
              <ul className="space-y-3">
                {queue.map((item) => (
                  <li key={item.clientOperationId} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-800">{OPERATION_LABELS[item.operation]}</span>
                          {item.lastStatus && <StatusBadge status={item.lastStatus} />}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Creada {fmtDate(item.queuedAt)} · {item.clientOperationId.slice(0, 8)}
                        </p>
                        {item.errorMessage && <p className="mt-2 text-sm text-red-700">{item.errorMessage}</p>}
                      </div>
                      <div className="flex gap-2">
                        {(item.lastStatus === 'CONFLICTO' || item.lastStatus === 'RECHAZADA') && (
                          <button type="button" className={secondaryButtonClass} onClick={() => retryAsNew(item)}>Reintentar como nueva</button>
                        )}
                        <button type="button" className={dangerButtonClass} onClick={() => discard(item.clientOperationId)}>Descartar</button>
                      </div>
                    </div>
                    <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="mb-4 font-bold text-slate-900">Conflictos e historial reciente</h2>
            {loadingData ? (
              <table className="w-full"><tbody>{Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} cols={4} />)}</tbody></table>
            ) : serverOperations.length === 0 ? (
              <EmptyState title="Sin historial de sincronizacion" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Operacion</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Mensaje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {serverOperations.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-slate-600">{fmtDate(item.createdAt)}</td>
                        <td className="px-4 py-3 text-slate-700">{OPERATION_LABELS[item.operation] ?? item.operation}</td>
                        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                        <td className="px-4 py-3 text-slate-600">{item.errorMessage ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Notice kind="info">
            Las operaciones se sincronizan en orden. Las aplicadas salen de la cola; los conflictos quedan visibles para revisar, reintentar como nueva o descartar.
          </Notice>
        </div>
      </div>
    </AppShell>
  );
}

function renderOperationFields({
  operation,
  form,
  set,
  products,
  lotsForProduct,
  plots,
  crops,
  assignments,
  payables,
}: {
  operation: OfflineOperationType;
  form: SyncFormState;
  set: (field: keyof SyncFormState, value: string) => void;
  products: StockLot['product'][];
  lotsForProduct: StockLot[];
  plots: Plot[];
  crops: Crop[];
  assignments: PlotCropAssignment[];
  payables: PayableAccount[];
}) {
  if (operation === 'PLOT_CREATE' || operation === 'PLOT_UPDATE') {
    return (
      <>
        {operation === 'PLOT_UPDATE' && <PlotSelect plots={plots} value={form.plotId} onChange={(value) => set('plotId', value)} />}
        <div><label htmlFor="sync-plot-name" className={labelClass}>Nombre de parcela *</label><input id="sync-plot-name" required className={inputClass} value={form.plotName} onChange={(event) => set('plotName', event.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="sync-location" className={labelClass}>Ubicacion</label><input id="sync-location" className={inputClass} value={form.location} onChange={(event) => set('location', event.target.value)} /></div>
          <div><label htmlFor="sync-area" className={labelClass}>Superficie</label><input id="sync-area" className={inputClass} type="number" min="0" step="0.0001" value={form.area} onChange={(event) => set('area', event.target.value)} /></div>
        </div>
        <div><label htmlFor="sync-notes" className={labelClass}>Notas</label><textarea id="sync-notes" className={inputClass} rows={2} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>
      </>
    );
  }

  if (operation === 'PLOT_DEACTIVATE') {
    return <PlotSelect plots={plots} value={form.plotId} onChange={(value) => set('plotId', value)} />;
  }

  if (operation === 'PLOT_CROP_ASSIGN') {
    return (
      <>
        <PlotSelect plots={plots} value={form.plotId} onChange={(value) => set('plotId', value)} />
        <div><label htmlFor="sync-crop" className={labelClass}>Cultivo *</label><select id="sync-crop" required className={inputClass} value={form.cropId} onChange={(event) => set('cropId', event.target.value)}><option value="">Seleccionar cultivo</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="sync-planted-area" className={labelClass}>Area sembrada</label><input id="sync-planted-area" className={inputClass} type="number" min="0" step="0.0001" value={form.plantedArea} onChange={(event) => set('plantedArea', event.target.value)} /></div>
          <div><label htmlFor="sync-planted-at" className={labelClass}>Fecha siembra</label><input id="sync-planted-at" className={inputClass} type="date" value={form.plantedAt} onChange={(event) => set('plantedAt', event.target.value)} /></div>
        </div>
      </>
    );
  }

  if (operation === 'PAYMENT_CREATE') {
    return (
      <>
        <div><label htmlFor="sync-payable" className={labelClass}>Cuenta por pagar *</label><select id="sync-payable" required className={inputClass} value={form.payableId} onChange={(event) => set('payableId', event.target.value)}><option value="">Seleccionar cuenta</option>{payables.map((payable) => <option key={payable.id} value={payable.id}>{payable.supplier.name} · saldo {fmtMoney(payable.balance)}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="sync-payment-amount" className={labelClass}>Monto *</label><input id="sync-payment-amount" required className={inputClass} type="number" min="0.0001" step="0.0001" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} /></div>
          <div><label htmlFor="sync-paid-at" className={labelClass}>Fecha pago</label><input id="sync-paid-at" className={inputClass} type="date" value={form.paidAt} onChange={(event) => set('paidAt', event.target.value)} /></div>
        </div>
        <div><label htmlFor="sync-payment-notes" className={labelClass}>Notas</label><textarea id="sync-payment-notes" className={inputClass} rows={2} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>
      </>
    );
  }

  return (
    <>
      {(operation === 'STOCK_EXIT' || operation === 'AGROCHEMICAL_APPLICATION') ? (
        <ProductSelect products={products} value={form.productId} onChange={(value) => { set('productId', value); set('inventoryLotId', ''); }} required />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <ProductSelect products={products} value={form.productId} onChange={(value) => set('productId', value)} />
          {!form.productId && <div><label htmlFor="sync-product-name" className={labelClass}>Producto nuevo *</label><input id="sync-product-name" required className={inputClass} value={form.productName} onChange={(event) => set('productName', event.target.value)} /></div>}
        </div>
      )}

      {operation === 'AGROCHEMICAL_APPLICATION' && (
        <>
          <PlotSelect plots={plots} value={form.plotId} onChange={(value) => set('plotId', value)} />
          {assignments.length > 0 && <p className="text-xs text-slate-500">Asignaciones activas en campana: {assignments.length}</p>}
        </>
      )}

      {(operation === 'STOCK_EXIT' || operation === 'AGROCHEMICAL_APPLICATION') && lotsForProduct.length > 0 && (
        <div><label htmlFor="sync-lot-select" className={labelClass}>Lote</label><select id="sync-lot-select" className={inputClass} value={form.inventoryLotId} onChange={(event) => set('inventoryLotId', event.target.value)}><option value="">Usar vencimiento mas cercano</option>{lotsForProduct.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNumber ?? 'Sin lote'} · {fmtNumber(lot.currentQuantity)}</option>)}</select></div>
      )}

      {operation === 'STOCK_ENTRY' && (
        <div><label htmlFor="sync-entry-reason" className={labelClass}>Motivo entrada</label><select id="sync-entry-reason" className={inputClass} value={form.entryReason} onChange={(event) => set('entryReason', event.target.value as StockEntryReason)}><option value="COMPRA">Compra</option><option value="ENTRADA_SIMPLE">Entrada simple</option><option value="DEVOLUCION">Devolucion</option><option value="AJUSTE">Ajuste</option></select></div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="sync-qty" className={labelClass}>Cantidad *</label><input id="sync-qty" required className={inputClass} type="number" min="0.0001" step="0.0001" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} /></div>
        {(operation === 'INITIAL_STOCK' || operation === 'STOCK_ENTRY') && !form.productId && <div><label htmlFor="sync-unit" className={labelClass}>Unidad</label><input id="sync-unit" className={inputClass} value={form.unit} onChange={(event) => set('unit', event.target.value)} /></div>}
        {(operation === 'INITIAL_STOCK' || operation === 'STOCK_ENTRY') && <div><label htmlFor="sync-lot" className={labelClass}>Lote</label><input id="sync-lot" className={inputClass} value={form.lotNumber} onChange={(event) => set('lotNumber', event.target.value)} /></div>}
        {(operation === 'INITIAL_STOCK' || operation === 'STOCK_ENTRY') && <div><label htmlFor="sync-exp" className={labelClass}>Vencimiento</label><input id="sync-exp" className={inputClass} type="date" value={form.expirationDate} onChange={(event) => set('expirationDate', event.target.value)} /></div>}
      </div>

      {operation === 'STOCK_EXIT' && (
        <>
          <div><label htmlFor="sync-reason-type" className={labelClass}>Motivo</label><select id="sync-reason-type" className={inputClass} value={form.reasonType} onChange={(event) => set('reasonType', event.target.value as StockMovementReasonType)}>{REASON_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div><label htmlFor="sync-reason" className={labelClass}>Detalle *</label><textarea id="sync-reason" required className={inputClass} rows={2} value={form.reason} onChange={(event) => set('reason', event.target.value)} /></div>
        </>
      )}

      {operation === 'AGROCHEMICAL_APPLICATION' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="sync-dose" className={labelClass}>Dosis</label><input id="sync-dose" className={inputClass} value={form.dose} onChange={(event) => set('dose', event.target.value)} /></div>
          <div><label htmlFor="sync-applied-at" className={labelClass}>Fecha aplicacion</label><input id="sync-applied-at" className={inputClass} type="date" value={form.appliedAt} onChange={(event) => set('appliedAt', event.target.value)} /></div>
          <div className="sm:col-span-2"><label htmlFor="sync-pest" className={labelClass}>Plaga u objetivo</label><input id="sync-pest" className={inputClass} value={form.targetPest} onChange={(event) => set('targetPest', event.target.value)} /></div>
        </div>
      )}
    </>
  );
}

function ProductSelect({ products, value, onChange, required = false }: { products: StockLot['product'][]; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div>
      <label htmlFor="sync-product" className={labelClass}>Producto{required ? ' *' : ''}</label>
      <select id="sync-product" required={required} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? 'Seleccionar producto' : 'Producto nuevo'}</option>
        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    </div>
  );
}

function PlotSelect({ plots, value, onChange }: { plots: Plot[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor="sync-plot" className={labelClass}>Parcela *</label>
      <select id="sync-plot" required className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Seleccionar parcela</option>
        {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name}</option>)}
      </select>
    </div>
  );
}
