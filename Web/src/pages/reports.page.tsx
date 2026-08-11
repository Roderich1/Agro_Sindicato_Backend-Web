import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  EmptyState,
  Notice,
  SkeletonRow,
  StatCard,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';
import { extractError, fmtDate, fmtNumber } from '../lib/format';
import { campaignsService } from '../services/campaigns.service';
import { productsService } from '../services/inventory.service';
import { cropsService, plotsService } from '../services/plots.service';
import { reportsService } from '../services/reports.service';
import { listUsers } from '../services/users.service';
import type { Campaign } from '../types/campaigns';
import type { Product } from '../types/inventory';
import type { Crop, Plot } from '../types/plots';
import type { ReportObject, ReportQuery, ReportResponse, ReportValue } from '../types/reports';
import type { AdminUser } from '../types/users';

type ReportKey = keyof typeof reportsService;

const REPORTS: Array<{ key: ReportKey; label: string; description: string }> = [
  { key: 'inventoryCurrent', label: 'Inventario actual', description: 'Lotes y cantidades disponibles.' },
  { key: 'inventoryByCampaign', label: 'Inventario por campaña', description: 'Stock agrupado por periodo agrícola.' },
  { key: 'inventoryByFarmer', label: 'Inventario por agricultor', description: 'Comparación de existencias por propietario.' },
  { key: 'purchasesByCampaign', label: 'Compras por campaña', description: 'Importes, descuentos y productos comprados.' },
  { key: 'jointPurchases', label: 'Compras conjuntas', description: 'Participantes y montos distribuidos.' },
  { key: 'applicationsByPlotCrop', label: 'Aplicaciones por parcela y cultivo', description: 'Uso registrado sobre cada campo.' },
  { key: 'consumptionByProduct', label: 'Consumo por producto', description: 'Cantidad aplicada agrupada por producto.' },
  { key: 'consumptionByCrop', label: 'Consumo por cultivo', description: 'Productos utilizados en cada cultivo.' },
  { key: 'expiredProducts', label: 'Vencidos y próximos', description: 'Lotes que requieren atención.' },
  { key: 'payablesAndPayments', label: 'Cuentas y pagos', description: 'Deuda, pagos y saldo pendiente.' },
  { key: 'auditByCampaign', label: 'Bitácora por campaña', description: 'Acciones relevantes y responsables.' },
];

const LABELS: Record<string, string> = {
  lots: 'Lotes', quantity: 'Cantidad', products: 'Productos', groups: 'Grupos',
  purchases: 'Compras', totalAmount: 'Importe total', discountAmount: 'Descuentos',
  participants: 'Participantes', applications: 'Aplicaciones', expired: 'Vencidos',
  expiringSoon: 'Próximos a vencer', accounts: 'Cuentas', paidAmount: 'Pagado',
  balance: 'Saldo', pending: 'Pendientes', events: 'Eventos',
};

function cellText(value: ReportValue): string {
  if (value === null) return '-';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return fmtNumber(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return fmtDate(value);
    return value;
  }
  if (Array.isArray(value)) return `${value.length} elemento(s)`;
  if (value.name || value.title || value.id) return String(value.name ?? value.title ?? value.id);
  return Object.entries(value)
    .map(([key, nested]) => `${humanize(key)}: ${cellText(nested)}`)
    .join(' · ') || '-';
}

function humanize(key: string) {
  return LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

export function ReportsPage() {
  const { user } = useAuth();
  const isFarmer = user?.role === 'AGRICULTOR';
  const [reportKey, setReportKey] = useState<ReportKey>('inventoryCurrent');
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [farmers, setFarmers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [filters, setFilters] = useState({
    campaignId: '', ownerUserId: '', productId: '', cropId: '', plotId: '', from: '', to: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<ReportQuery>(() => ({
    campaignId: filters.campaignId || undefined,
    ownerUserId: !isFarmer && filters.ownerUserId ? filters.ownerUserId : undefined,
    productId: filters.productId || undefined,
    cropId: filters.cropId || undefined,
    plotId: filters.plotId || undefined,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
  }), [filters, isFarmer]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, campaignData, userData, productData, cropData, plotData] = await Promise.all([
        reportsService[reportKey](query),
        campaignsService.list(),
        isFarmer ? Promise.resolve([]) : listUsers(),
        productsService.list(),
        cropsService.list(),
        plotsService.list(),
      ]);
      setReport(data);
      setCampaigns(campaignData);
      setFarmers(userData.filter((item) => item.role === 'AGRICULTOR' && item.isActive));
      setProducts(productData);
      setCrops(cropData);
      setPlots(plotData);
    } catch (err) {
      setError(extractError(err, 'No fue posible generar el reporte.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [isFarmer, query, reportKey]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const selectedReport = REPORTS.find((item) => item.key === reportKey) ?? REPORTS[0];
  const setFilter = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));

  return (
    <AppShell title="Reportes" section="Análisis operativo">
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className={`${cardClass} h-fit p-3`}>
          <label htmlFor="report-selector" className={labelClass}>Reporte</label>
          <select id="report-selector" className={`${inputClass} mb-3 xl:hidden`} value={reportKey} onChange={(event) => setReportKey(event.target.value as ReportKey)}>
            {REPORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <div className="hidden space-y-1 xl:block">
            {REPORTS.map((item) => (
              <button key={item.key} type="button" onClick={() => setReportKey(item.key)} className={`w-full border-l-4 px-3 py-2 text-left ${reportKey === item.key ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="block text-xs opacity-70">{item.description}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className={`${cardClass} p-4`}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">{selectedReport.label}</h2>
              <p className="text-sm text-slate-500">{selectedReport.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><label htmlFor="report-campaign" className={labelClass}>Campaña</label><select id="report-campaign" className={inputClass} value={filters.campaignId} onChange={(event) => setFilter('campaignId', event.target.value)}><option value="">Todas</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div>
              {!isFarmer && <div><label htmlFor="report-owner" className={labelClass}>Agricultor</label><select id="report-owner" className={inputClass} value={filters.ownerUserId} onChange={(event) => setFilter('ownerUserId', event.target.value)}><option value="">Todos</option>{farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></div>}
              <div><label htmlFor="report-product" className={labelClass}>Producto</label><select id="report-product" className={inputClass} value={filters.productId} onChange={(event) => setFilter('productId', event.target.value)}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
              <div><label htmlFor="report-crop" className={labelClass}>Cultivo</label><select id="report-crop" className={inputClass} value={filters.cropId} onChange={(event) => setFilter('cropId', event.target.value)}><option value="">Todos</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></div>
              <div><label htmlFor="report-plot" className={labelClass}>Parcela</label><select id="report-plot" className={inputClass} value={filters.plotId} onChange={(event) => setFilter('plotId', event.target.value)}><option value="">Todas</option>{plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name}</option>)}</select></div>
              <div><label htmlFor="report-from" className={labelClass}>Desde</label><input id="report-from" className={inputClass} type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter('from', event.target.value)} /></div>
              <div><label htmlFor="report-to" className={labelClass}>Hasta</label><input id="report-to" className={inputClass} type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter('to', event.target.value)} /></div>
              <div className="flex items-end"><button type="button" className={secondaryButtonClass} onClick={() => void refresh()}>Actualizar reporte</button></div>
            </div>
          </div>

          {loading ? (
            <div className="table-container"><table className="w-full"><tbody>{Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} cols={5} />)}</tbody></table></div>
          ) : report ? (
            <ReportContent report={report} />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function ReportContent({ report }: { report: ReportResponse }) {
  const totals = Object.entries(report.totals);
  return (
    <div className="space-y-4">
      {totals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.map(([key, value]) => <StatCard key={key} label={humanize(key)} value={cellText(value)} color="slate" />)}
        </div>
      )}
      {report.rows.length > 0 && <ReportTable rows={report.rows} />}
      {report.sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <h3 className="text-sm font-bold uppercase text-slate-500">{humanize(section.key)}</h3>
          <ReportTable rows={section.rows} />
        </section>
      ))}
      {report.rows.length === 0 && report.sections.every((section) => section.rows.length === 0) && (
        <div className={cardClass}><EmptyState title="Sin resultados" description="No existen datos para los filtros seleccionados." /></div>
      )}
    </div>
  );
}

function ReportTable({ rows }: { rows: ReportObject[] }) {
  const columns = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter((key) => key !== 'id'),
    [rows],
  );
  return (
    <div className="table-container overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-4 py-3">{humanize(column)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                {columns.map((column) => <td key={column} className="max-w-xs px-4 py-3 text-slate-700">{cellText(row[column] ?? null)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
