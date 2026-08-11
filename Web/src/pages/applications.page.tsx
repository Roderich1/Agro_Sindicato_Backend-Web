import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AppShell,
  EmptyState,
  Modal,
  Notice,
  SkeletonRow,
  StatusBadge,
  buttonClass,
  cardClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
import { applicationsService } from '../services/applications.service';
import { campaignsService } from '../services/campaigns.service';
import { inventoryService, productsService } from '../services/inventory.service';
import { cropsService, plotCropAssignmentsService, plotsService } from '../services/plots.service';
import type {
  AgrochemicalApplication,
  AgrochemicalApplicationStatus,
  CreateApplicationResult,
} from '../types/applications';
import type { Campaign } from '../types/campaigns';
import type { Product, StockLot } from '../types/inventory';
import type { Crop, Plot, PlotCropAssignment } from '../types/plots';

function currentLocalDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ApplicationsPage() {
  const { user } = useAuth();
  const { activeCampaign, hasActiveCampaign } = useCampaign();
  const isFarmer = user?.role === 'AGRICULTOR';
  const activeCampaignId = activeCampaign?.id;
  const [applications, setApplications] = useState<AgrochemicalApplication[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [assignments, setAssignments] = useState<PlotCropAssignment[]>([]);
  const [stock, setStock] = useState<StockLot[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [plotId, setPlotId] = useState('');
  const [cropId, setCropId] = useState('');
  const [productId, setProductId] = useState('');
  const [status, setStatus] = useState<AgrochemicalApplicationStatus | ''>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<AgrochemicalApplication | null>(null);
  const [cancelApplication, setCancelApplication] = useState<AgrochemicalApplication | null>(null);
  const [lastResult, setLastResult] = useState<CreateApplicationResult | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const farmerData = isFarmer && activeCampaignId
        ? Promise.all([
            plotCropAssignmentsService.list({ campaignId: activeCampaignId }),
            inventoryService.stock(),
          ])
        : Promise.resolve<[PlotCropAssignment[], StockLot[]]>([[], []]);
      const [applicationData, campaignData, plotData, cropData, productData, [assignmentData, stockData]] =
        await Promise.all([
          applicationsService.list({
            campaignId: campaignId || undefined,
            plotId: plotId || undefined,
            productId: productId || undefined,
            status: status || undefined,
          }),
          campaignsService.list(),
          plotsService.list(),
          cropsService.list(),
          productsService.list(),
          farmerData,
        ]);
      setApplications(applicationData);
      setCampaigns(campaignData);
      setPlots(plotData);
      setCrops(cropData);
      setProducts(productData);
      setAssignments(
        assignmentData.filter((assignment) =>
          assignment.status === 'ACTIVO' || assignment.status === 'PLANIFICADO'),
      );
      setStock(stockData);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar las aplicaciones.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeCampaignId, campaignId, isFarmer, plotId, productId, status]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const visibleApplications = useMemo(
    () => applications.filter((application) => !cropId || application.cropId === cropId),
    [applications, cropId],
  );

  const done = async (result: CreateApplicationResult) => {
    setShowForm(false);
    setLastResult(result);
    setMessage(result.message);
    await refresh();
  };

  const cancelDone = async (text: string) => {
    setCancelApplication(null);
    setSelectedApplication(null);
    setMessage(text);
    await refresh();
  };

  return (
    <AppShell
      title="Aplicaciones"
      section="Uso de agroquímicos"
      actions={
        isFarmer ? (
          <button className={buttonClass} disabled={!hasActiveCampaign} onClick={() => setShowForm(true)}>
            Nueva aplicación
          </button>
        ) : null
      }
    >
      {isFarmer && !hasActiveCampaign && (
        <div className="mb-4">
          <Notice kind="warn">No hay campaña activa. Puedes consultar el historial, pero no registrar ni anular aplicaciones.</Notice>
        </div>
      )}
      {!isFarmer && (
        <div className="mb-4">
          <Notice kind="info">Vista global de consulta. Solo el agricultor puede registrar o anular sus aplicaciones.</Notice>
        </div>
      )}
      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      {lastResult && (
        <div className="mb-4 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-bold">Descuento de inventario confirmado</p>
          <p>
            {fmtNumber(lastResult.application.quantity)} {lastResult.application.product?.unit ?? ''} de{' '}
            {lastResult.application.product?.name} en {lastResult.application.plot?.name}. Se generaron{' '}
            {lastResult.movements.length} movimiento(s) de salida.
          </p>
        </div>
      )}

      <ApplicationFilters
        campaigns={campaigns}
        plots={plots}
        crops={crops}
        products={products}
        campaignId={campaignId}
        plotId={plotId}
        cropId={cropId}
        productId={productId}
        status={status}
        onCampaign={setCampaignId}
        onPlot={setPlotId}
        onCrop={setCropId}
        onProduct={setProductId}
        onStatus={setStatus}
      />

      <ApplicationHistory
        applications={visibleApplications}
        isLoading={isLoading}
        isFarmer={isFarmer}
        onView={setSelectedApplication}
        onCancel={setCancelApplication}
      />

      {showForm && activeCampaign && (
        <Modal title="Registrar aplicación" size="lg" onClose={() => setShowForm(false)}>
          <ApplicationForm
            campaign={activeCampaign}
            assignments={assignments}
            stock={stock}
            onDone={done}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {selectedApplication && (
        <Modal title="Detalle de aplicación" size="lg" onClose={() => setSelectedApplication(null)}>
          <ApplicationDetail
            application={selectedApplication}
            canCancel={
              isFarmer
              && selectedApplication.status === 'REGISTRADA'
              && selectedApplication.campaign?.status === 'ABIERTA'
            }
            onCancel={() => {
              setCancelApplication(selectedApplication);
              setSelectedApplication(null);
            }}
          />
        </Modal>
      )}

      {cancelApplication && (
        <Modal title="Anular aplicación" onClose={() => setCancelApplication(null)}>
          <CancelApplicationForm
            application={cancelApplication}
            onDone={cancelDone}
            onCancel={() => setCancelApplication(null)}
          />
        </Modal>
      )}
    </AppShell>
  );
}

type ApplicationFiltersProps = Readonly<{
  campaigns: Campaign[];
  plots: Plot[];
  crops: Crop[];
  products: Product[];
  campaignId: string;
  plotId: string;
  cropId: string;
  productId: string;
  status: AgrochemicalApplicationStatus | '';
  onCampaign: (value: string) => void;
  onPlot: (value: string) => void;
  onCrop: (value: string) => void;
  onProduct: (value: string) => void;
  onStatus: (value: AgrochemicalApplicationStatus | '') => void;
}>;

function ApplicationFilters({
  campaigns,
  plots,
  crops,
  products,
  campaignId,
  plotId,
  cropId,
  productId,
  status,
  onCampaign,
  onPlot,
  onCrop,
  onProduct,
  onStatus,
}: ApplicationFiltersProps) {
  return (
    <div className={`${cardClass} mb-4 p-4`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <label htmlFor="application-campaign" className={labelClass}>Campaña</label>
          <select id="application-campaign" className={inputClass} value={campaignId} onChange={(event) => onCampaign(event.target.value)}>
            <option value="">Todas</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="application-plot" className={labelClass}>Parcela</label>
          <select id="application-plot" className={inputClass} value={plotId} onChange={(event) => onPlot(event.target.value)}>
            <option value="">Todas</option>
            {plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="application-crop" className={labelClass}>Cultivo</label>
          <select id="application-crop" className={inputClass} value={cropId} onChange={(event) => onCrop(event.target.value)}>
            <option value="">Todos</option>
            {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}{crop.variety ? ` · ${crop.variety}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="application-product" className={labelClass}>Producto</label>
          <select id="application-product" className={inputClass} value={productId} onChange={(event) => onProduct(event.target.value)}>
            <option value="">Todos</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="application-status" className={labelClass}>Estado</label>
          <select id="application-status" className={inputClass} value={status} onChange={(event) => onStatus(event.target.value as AgrochemicalApplicationStatus | '')}>
            <option value="">Todos</option>
            <option value="REGISTRADA">Registrada</option>
            <option value="ANULADA">Anulada</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function ApplicationHistory({
  applications,
  isLoading,
  isFarmer,
  onView,
  onCancel,
}: {
  applications: AgrochemicalApplication[];
  isLoading: boolean;
  isFarmer: boolean;
  onView: (application: AgrochemicalApplication) => void;
  onCancel: (application: AgrochemicalApplication) => void;
}) {
  if (!isLoading && applications.length === 0) {
    return <EmptyState title="Sin aplicaciones" description="No hay aplicaciones que coincidan con los filtros seleccionados." />;
  }

  return (
    <>
      <div className="hidden overflow-hidden md:block table-container">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Historial de aplicaciones</h2>
          <p className="text-xs text-slate-500">{applications.length} registro(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Parcela / cultivo</th>
                {!isFarmer && <th className="px-5 py-3">Agricultor</th>}
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Cantidad</th>
                <th className="px-5 py-3">Campaña</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} cols={isFarmer ? 7 : 8} />)
              ) : applications.map((application) => (
                <tr key={application.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{fmtDate(application.appliedAt)}</td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{application.plot?.name ?? 'Parcela no disponible'}</p>
                    <p className="text-xs text-slate-500">{application.crop?.name ?? 'Cultivo no disponible'}</p>
                  </td>
                  {!isFarmer && <td className="px-5 py-3 text-slate-600">{application.owner?.name ?? '-'}</td>}
                  <td className="px-5 py-3 text-slate-700">{application.product?.name ?? '-'}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums">
                    {fmtNumber(application.quantity)} {application.product?.unit}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{application.campaign?.name ?? '-'}</td>
                  <td className="px-5 py-3"><StatusBadge status={application.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className={secondaryButtonClass} onClick={() => onView(application)}>Ver</button>
                      {isFarmer && application.status === 'REGISTRADA' && application.campaign?.status === 'ABIERTA' && (
                        <button type="button" className={dangerButtonClass} onClick={() => onCancel(application)}>Anular</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-lg bg-slate-200" />)
        ) : applications.map((application) => (
          <article key={application.id} className={`${cardClass} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{application.product?.name}</p>
                <p className="text-sm text-slate-600">{application.plot?.name} · {application.crop?.name}</p>
              </div>
              <StatusBadge status={application.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span>{fmtDate(application.appliedAt)}</span>
              <span className="text-right font-semibold text-slate-700">{fmtNumber(application.quantity)} {application.product?.unit}</span>
              <span>{application.campaign?.name}</span>
              {!isFarmer && <span className="text-right">{application.owner?.name}</span>}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className={secondaryButtonClass} onClick={() => onView(application)}>Ver detalle</button>
              {isFarmer && application.status === 'REGISTRADA' && application.campaign?.status === 'ABIERTA' && (
                <button type="button" className={dangerButtonClass} onClick={() => onCancel(application)}>Anular</button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function ApplicationForm({
  campaign,
  assignments,
  stock,
  onDone,
  onCancel,
}: {
  campaign: Campaign;
  assignments: PlotCropAssignment[];
  stock: StockLot[];
  onDone: (result: CreateApplicationResult) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    assignmentId: '',
    productId: '',
    inventoryLotId: '',
    quantity: '',
    dose: '',
    targetPest: '',
    weatherConditions: '',
    responsibleName: '',
    appliedAt: currentLocalDateTime(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const selectedAssignment = assignments.find((assignment) => assignment.id === form.assignmentId);
  const selectedProductLot = stock.find((lot) => lot.product.id === form.productId);
  const productLots = stock.filter((lot) => lot.product.id === form.productId && Number(lot.currentQuantity) > 0);
  const selectedLot = productLots.find((lot) => lot.id === form.inventoryLotId);
  const available = selectedLot
    ? Number(selectedLot.currentQuantity)
    : Number(selectedProductLot?.productTotalStock ?? 0);
  const products = useMemo(() => {
    const unique = new Map<string, StockLot['product']>();
    stock.forEach((lot) => {
      if (Number(lot.productTotalStock) > 0) unique.set(lot.product.id, lot.product);
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stock]);

  const continueTo = (nextStep: number) => {
    setError(null);
    if (step === 1 && !selectedAssignment) {
      setError('Selecciona una parcela con cultivo asignado.');
      return;
    }
    if (step === 2) {
      const quantity = Number(form.quantity);
      if (!form.productId || !Number.isFinite(quantity) || quantity <= 0) {
        setError('Selecciona el producto e indica una cantidad válida.');
        return;
      }
      if (quantity > available) {
        setError(`Stock insuficiente. Disponible: ${fmtNumber(available)} ${selectedProductLot?.product.unit ?? ''}.`);
        return;
      }
    }
    setStep(nextStep);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step < 3) {
      continueTo(step + 1);
      return;
    }
    if (!selectedAssignment) {
      setError('La asignación de parcela y cultivo ya no está disponible.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await applicationsService.create({
        campaignId: campaign.id,
        plotId: selectedAssignment.plotId,
        productId: form.productId,
        inventoryLotId: form.inventoryLotId || undefined,
        quantity: Number(form.quantity),
        dose: form.dose || null,
        targetPest: form.targetPest || null,
        weatherConditions: form.weatherConditions || null,
        responsibleName: form.responsibleName || null,
        appliedAt: new Date(form.appliedAt).toISOString(),
        notes: form.notes || null,
      });
      await onDone(result);
    } catch (err) {
      setError(extractError(err, 'No fue posible registrar la aplicación.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-3 border-b border-slate-200 pb-4 text-center text-xs font-semibold">
        {['Parcela', 'Producto', 'Confirmar'].map((label, index) => {
          const itemStep = index + 1;
          return (
            <div key={label} className={itemStep === step ? 'text-emerald-700' : itemStep < step ? 'text-slate-700' : 'text-slate-400'}>
              <span className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full ${itemStep === step ? 'bg-emerald-600 text-white' : 'bg-slate-100'}`}>
                {itemStep}
              </span>
              {label}
            </div>
          );
        })}
      </div>

      <div className="bg-slate-50 px-3 py-2 text-sm text-slate-700">
        Campaña activa: <strong>{campaign.name}</strong>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          {assignments.length === 0 ? (
            <Notice kind="warn">No tienes parcelas con cultivo asignado en esta campaña. Registra la asignación desde Parcelas y cultivos.</Notice>
          ) : (
            <div>
              <label htmlFor="application-assignment" className={labelClass}>Parcela y cultivo *</label>
              <select id="application-assignment" required className={inputClass} value={form.assignmentId} onChange={(event) => set('assignmentId', event.target.value)}>
                <option value="">Seleccionar</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.plot?.name} · {assignment.crop?.name}{assignment.crop?.variety ? ` (${assignment.crop.variety})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedAssignment && (
            <div className="grid gap-2 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm sm:grid-cols-2">
              <p><span className="text-emerald-700">Parcela:</span> <strong>{selectedAssignment.plot?.name}</strong></p>
              <p><span className="text-emerald-700">Cultivo:</span> <strong>{selectedAssignment.crop?.name}</strong></p>
              <p>Área sembrada: {selectedAssignment.plantedArea ? `${fmtNumber(selectedAssignment.plantedArea)} ${selectedAssignment.plot?.areaUnit}` : 'No registrada'}</p>
              <p>Estado: {selectedAssignment.status}</p>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <Notice kind="warn">No tienes productos con stock disponible.</Notice>
          ) : (
            <>
              <div>
                <label htmlFor="application-stock-product" className={labelClass}>Producto *</label>
                <select id="application-stock-product" required className={inputClass} value={form.productId} onChange={(event) => {
                  set('productId', event.target.value);
                  set('inventoryLotId', '');
                }}>
                  <option value="">Seleccionar producto</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </div>
              {form.productId && (
                <div>
                  <label htmlFor="application-lot" className={labelClass}>Lote</label>
                  <select id="application-lot" className={inputClass} value={form.inventoryLotId} onChange={(event) => set('inventoryLotId', event.target.value)}>
                    <option value="">Automático por vencimiento más cercano</option>
                    {productLots.map((lot) => (
                      <option key={lot.id} value={lot.id}>
                        {lot.lotNumber ?? 'Sin número'} · {fmtNumber(lot.currentQuantity)} disponibles · vence {fmtDate(lot.expirationDate)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="application-quantity" className={labelClass}>Cantidad a descontar *</label>
                  <input id="application-quantity" required className={inputClass} type="number" min="0.0001" step="0.0001" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} />
                  <p className="mt-1 text-xs text-slate-500">Disponible: {fmtNumber(available)} {selectedProductLot?.product.unit}</p>
                </div>
                <div>
                  <label htmlFor="application-dose" className={labelClass}>Dosis</label>
                  <input id="application-dose" className={inputClass} maxLength={80} placeholder="Ej. 1 L/ha" value={form.dose} onChange={(event) => set('dose', event.target.value)} />
                </div>
              </div>
              <div>
                <label htmlFor="application-target" className={labelClass}>Plaga u objetivo</label>
                <input id="application-target" className={inputClass} maxLength={160} placeholder="Ej. malezas de hoja ancha" value={form.targetPest} onChange={(event) => set('targetPest', event.target.value)} />
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && selectedAssignment && selectedProductLot && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="font-bold text-slate-900">Resumen previo</h3>
            </div>
            <dl className="grid gap-x-5 gap-y-3 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Parcela</dt><dd className="font-semibold">{selectedAssignment.plot?.name}</dd></div>
              <div><dt className="text-slate-500">Cultivo</dt><dd className="font-semibold">{selectedAssignment.crop?.name}</dd></div>
              <div><dt className="text-slate-500">Producto</dt><dd className="font-semibold">{selectedProductLot.product.name}</dd></div>
              <div><dt className="text-slate-500">Descuento</dt><dd className="font-semibold text-red-700">{fmtNumber(form.quantity)} {selectedProductLot.product.unit}</dd></div>
              <div><dt className="text-slate-500">Lote</dt><dd className="font-semibold">{selectedLot?.lotNumber ?? 'Selección automática FEFO'}</dd></div>
              <div><dt className="text-slate-500">Stock restante estimado</dt><dd className="font-semibold">{fmtNumber(available - Number(form.quantity))} {selectedProductLot.product.unit}</dd></div>
            </dl>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="application-date" className={labelClass}>Fecha y hora *</label>
              <input id="application-date" required className={inputClass} type="datetime-local" value={form.appliedAt} onChange={(event) => set('appliedAt', event.target.value)} />
            </div>
            <div>
              <label htmlFor="application-responsible" className={labelClass}>Responsable</label>
              <input id="application-responsible" className={inputClass} maxLength={120} value={form.responsibleName} onChange={(event) => set('responsibleName', event.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="application-weather" className={labelClass}>Condiciones climáticas</label>
            <input id="application-weather" className={inputClass} maxLength={160} placeholder="Ej. sin lluvia, viento leve" value={form.weatherConditions} onChange={(event) => set('weatherConditions', event.target.value)} />
          </div>
          <div>
            <label htmlFor="application-notes" className={labelClass}>Notas</label>
            <textarea id="application-notes" className={inputClass} maxLength={500} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
          </div>
        </div>
      )}

      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className={secondaryButtonClass} onClick={step === 1 ? onCancel : () => setStep((current) => current - 1)}>
          {step === 1 ? 'Cancelar' : 'Anterior'}
        </button>
        {step < 3 ? (
          <button type="button" className={`${buttonClass} !w-auto`} disabled={(step === 1 && assignments.length === 0) || (step === 2 && products.length === 0)} onClick={() => continueTo(step + 1)}>
            Continuar
          </button>
        ) : (
          <button type="submit" className={`${buttonClass} !w-auto`} disabled={saving}>
            {saving ? 'Registrando…' : 'Confirmar aplicación'}
          </button>
        )}
      </div>
    </form>
  );
}

function ApplicationDetail({
  application,
  canCancel,
  onCancel,
}: {
  application: AgrochemicalApplication;
  canCancel: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <p className="font-bold text-slate-900">{application.product?.name}</p>
          <p className="text-sm text-slate-500">{application.plot?.name} · {application.crop?.name}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Campaña</dt><dd className="font-semibold">{application.campaign?.name}</dd></div>
        <div><dt className="text-slate-500">Fecha</dt><dd className="font-semibold">{fmtDate(application.appliedAt)}</dd></div>
        <div><dt className="text-slate-500">Cantidad descontada</dt><dd className="font-semibold">{fmtNumber(application.quantity)} {application.product?.unit}</dd></div>
        <div><dt className="text-slate-500">Lote solicitado</dt><dd className="font-semibold">{application.inventoryLot?.lotNumber ?? 'Selección automática'}</dd></div>
        <div><dt className="text-slate-500">Dosis</dt><dd className="font-semibold">{application.dose ?? '-'}</dd></div>
        <div><dt className="text-slate-500">Objetivo</dt><dd className="font-semibold">{application.targetPest ?? '-'}</dd></div>
        <div><dt className="text-slate-500">Responsable</dt><dd className="font-semibold">{application.responsibleName ?? application.appliedBy?.name ?? '-'}</dd></div>
        <div><dt className="text-slate-500">Clima</dt><dd className="font-semibold">{application.weatherConditions ?? '-'}</dd></div>
      </dl>
      {application.notes && <div className="bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-line">{application.notes}</div>}
      <div className="flex justify-end">
        {canCancel && <button type="button" className={dangerButtonClass} onClick={onCancel}>Anular aplicación</button>}
      </div>
    </div>
  );
}

function CancelApplicationForm({
  application,
  onDone,
  onCancel,
}: {
  application: AgrochemicalApplication;
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError('El motivo debe tener al menos 3 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await applicationsService.cancel(application.id, { reason: reason.trim() });
      await onDone(result.message);
    } catch (err) {
      setError(extractError(err, 'No fue posible anular la aplicación.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Notice kind="warn">La anulación marca el registro y cancela su evento de calendario. El stock descontado no se repone automáticamente.</Notice>
      <p className="text-sm text-slate-600">
        {application.product?.name} en {application.plot?.name}, {fmtNumber(application.quantity)} {application.product?.unit}.
      </p>
      <div>
        <label htmlFor="cancel-application-reason" className={labelClass}>Motivo de anulación *</label>
        <textarea id="cancel-application-reason" required minLength={3} maxLength={500} rows={4} className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>Volver</button>
        <button type="submit" className={dangerButtonClass} disabled={saving}>{saving ? 'Anulando…' : 'Confirmar anulación'}</button>
      </div>
    </form>
  );
}
