import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  EmptyState,
  Modal,
  Notice,
  SkeletonRow,
  StatCard,
  StatusBadge,
  cardClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { extractError, fmtDate } from '../lib/format';
import { auditLogsService } from '../services/audit-logs.service';
import { campaignsService } from '../services/campaigns.service';
import { listUsers } from '../services/users.service';
import type { AuditAction, AuditJsonValue, AuditLog, ListAuditLogsQuery } from '../types/audit-logs';
import type { Campaign } from '../types/campaigns';
import type { AdminUser } from '../types/users';

const ACTION_OPTIONS: Array<{ value: AuditAction; label: string }> = [
  { value: 'CREAR', label: 'Crear' },
  { value: 'ACTUALIZAR', label: 'Actualizar' },
  { value: 'INACTIVAR', label: 'Inactivar' },
  { value: 'ELIMINAR', label: 'Eliminar' },
  { value: 'ABRIR_CAMPANA', label: 'Abrir campana' },
  { value: 'CERRAR_CAMPANA', label: 'Cerrar campana' },
  { value: 'AJUSTAR_STOCK', label: 'Ajustar stock' },
  { value: 'REGISTRAR_PAGO', label: 'Registrar pago' },
  { value: 'SINCRONIZAR', label: 'Sincronizar' },
  { value: 'OTRO', label: 'Otro' },
];

const ENTITY_OPTIONS = [
  'AgriculturalCampaign',
  'Plot',
  'Crop',
  'PlotCropAssignment',
  'InventoryProduct',
  'InventoryLot',
  'StockMovement',
  'StockAdjustment',
  'AgrochemicalApplication',
  'Purchase',
  'PayableAccount',
  'Payment',
  'SyncOperation',
];

function actionLabel(action: string) {
  return ACTION_OPTIONS.find((item) => item.value === action)?.label ?? action.replace(/_/g, ' ');
}

function jsonPreview(value: AuditJsonValue): string {
  if (value === null) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} elemento(s)`;
  const keys = Object.keys(value);
  return keys.length ? keys.slice(0, 3).join(', ') : '-';
}

function JsonBlock({ value }: { value: AuditJsonValue }) {
  if (value === null) return <p className="text-sm text-slate-400">Sin datos registrados.</p>;
  return (
    <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [filters, setFilters] = useState({
    campaignId: '',
    ownerUserId: '',
    actorUserId: '',
    action: '',
    entityName: '',
    from: '',
    to: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo<ListAuditLogsQuery>(() => ({
    campaignId: filters.campaignId || undefined,
    ownerUserId: filters.ownerUserId || undefined,
    actorUserId: filters.actorUserId || undefined,
    action: filters.action || undefined,
    entityName: filters.entityName || undefined,
    from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
    to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
  }), [filters]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logData, campaignData, userData] = await Promise.all([
        auditLogsService.list(query),
        campaignsService.list(),
        listUsers(),
      ]);
      setLogs(logData);
      setCampaigns(campaignData);
      setUsers(userData.filter((item) => item.isActive));
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar la bitacora.'));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const farmers = users.filter((item) => item.role === 'AGRICULTOR');
  const byAction = useMemo(() => {
    const totals = new Map<string, number>();
    logs.forEach((log) => totals.set(log.action, (totals.get(log.action) ?? 0) + 1));
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);
  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );
  const userNames = useMemo(
    () => new Map(users.map((item) => [item.id, item.name])),
    [users],
  );

  const setFilter = (field: keyof typeof filters, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));

  return (
    <AppShell title="Bitacora" section="Trazabilidad">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Acciones visibles" value={logs.length} color="slate" />
        <StatCard label="Con campana" value={logs.filter((log) => log.campaignId).length} color="emerald" />
        <StatCard label="Tipos de accion" value={byAction.length} color="sky" />
      </div>

      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      <div className={`${cardClass} mb-5 p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <div>
            <label htmlFor="audit-campaign" className={labelClass}>Campana</label>
            <select id="audit-campaign" className={inputClass} value={filters.campaignId} onChange={(event) => setFilter('campaignId', event.target.value)}>
              <option value="">Todas</option>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="audit-owner" className={labelClass}>Agricultor</label>
            <select id="audit-owner" className={inputClass} value={filters.ownerUserId} onChange={(event) => setFilter('ownerUserId', event.target.value)}>
              <option value="">Todos</option>
              {farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="audit-actor" className={labelClass}>Responsable</label>
            <select id="audit-actor" className={inputClass} value={filters.actorUserId} onChange={(event) => setFilter('actorUserId', event.target.value)}>
              <option value="">Todos</option>
              {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="audit-action" className={labelClass}>Accion</label>
            <select id="audit-action" className={inputClass} value={filters.action} onChange={(event) => setFilter('action', event.target.value)}>
              <option value="">Todas</option>
              {ACTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="audit-entity" className={labelClass}>Entidad</label>
            <input id="audit-entity" className={inputClass} list="audit-entity-options" value={filters.entityName} onChange={(event) => setFilter('entityName', event.target.value)} placeholder="Nombre tecnico" />
            <datalist id="audit-entity-options">
              {ENTITY_OPTIONS.map((entity) => <option key={entity} value={entity} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="audit-from" className={labelClass}>Desde</label>
            <input id="audit-from" className={inputClass} type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter('from', event.target.value)} />
          </div>
          <div>
            <label htmlFor="audit-to" className={labelClass}>Hasta</label>
            <input id="audit-to" className={inputClass} type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter('to', event.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Se muestran las ultimas 300 acciones importantes segun los filtros.</p>
          <button type="button" className={secondaryButtonClass} onClick={() => void refresh()}>Actualizar</button>
        </div>
      </div>

      {byAction.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {byAction.slice(0, 6).map(([action, total]) => (
            <span key={action} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {actionLabel(action)}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums">{total}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="table-container"><table className="w-full"><tbody>{Array.from({ length: 6 }).map((_, index) => <SkeletonRow key={index} cols={6} />)}</tbody></table></div>
      ) : logs.length === 0 ? (
        <div className={cardClass}><EmptyState title="Sin acciones registradas" description="No hay datos de bitacora para los filtros seleccionados." /></div>
      ) : (
        <div className="table-container overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Accion</th>
                  <th className="px-4 py-3">Resumen</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3">Agricultor</th>
                  <th className="px-4 py-3">Campana</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="px-4 py-3 text-slate-600">{fmtDate(log.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={log.action} /></td>
                    <td className="max-w-sm px-4 py-3 text-slate-700">
                      <p className="font-medium">{log.summary ?? 'Accion registrada'}</p>
                      <p className="mt-1 text-xs text-slate-400">{jsonPreview(log.metadata)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{log.actor?.name ?? (log.actorUserId ? userNames.get(log.actorUserId) : null) ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{log.owner?.name ?? (log.ownerUserId ? userNames.get(log.ownerUserId) : null) ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{log.campaign?.name ?? (log.campaignId ? campaignNames.get(log.campaignId) : null) ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-medium">{log.entityName}</span>
                      {log.entityId && <span className="block max-w-[160px] truncate text-xs text-slate-400">{log.entityId}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" className={secondaryButtonClass} onClick={() => setSelected(log)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <Modal title="Detalle de bitacora" size="lg" onClose={() => setSelected(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Resumen</p>
              <p className="mt-1 text-sm text-slate-700">{selected.summary ?? 'Accion registrada'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Accion</p><p className="font-semibold text-slate-800">{actionLabel(selected.action)}</p></div>
              <div><p className="text-xs text-slate-500">Fecha</p><p className="font-semibold text-slate-800">{fmtDate(selected.createdAt)}</p></div>
              <div><p className="text-xs text-slate-500">Responsable</p><p className="font-semibold text-slate-800">{selected.actor?.name ?? '-'}</p></div>
              <div><p className="text-xs text-slate-500">Campana</p><p className="font-semibold text-slate-800">{selected.campaign?.name ?? '-'}</p></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Antes</p><JsonBlock value={selected.before} /></div>
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Despues</p><JsonBlock value={selected.after} /></div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Metadatos</p>
              <JsonBlock value={selected.metadata} />
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
