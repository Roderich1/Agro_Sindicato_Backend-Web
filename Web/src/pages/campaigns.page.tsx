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
  inputClass,
  labelClass,
  secondaryButtonClass,
} from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { extractError, fmtDate } from '../lib/format';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign, CampaignStatus, CreateCampaignPayload } from '../types/campaigns';

const MANAGER_ROLES = ['DIRECTIVA', 'ADMINISTRADOR'];

export function CampaignsPage() {
  const { user } = useAuth();
  const { activeCampaign, refreshActiveCampaign } = useCampaign();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<Campaign | null>(null);

  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await campaignsService.list({
        status: status || undefined,
        search: search || undefined,
      });
      setCampaigns(data);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar las campanas.'));
    } finally {
      setIsLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const done = async (text: string) => {
    setMessage(text);
    setCreating(false);
    setEditing(null);
    setClosing(null);
    await Promise.all([refresh(), refreshActiveCampaign()]);
  };

  const stats = useMemo(() => {
    const open = campaigns.filter((campaign) => campaign.status === 'ABIERTA').length;
    const closed = campaigns.filter((campaign) => campaign.status === 'CERRADA').length;
    const planned = campaigns.filter((campaign) => campaign.status === 'PLANIFICADA').length;
    return { open, closed, planned };
  }, [campaigns]);

  return (
    <AppShell
      title="Campanas"
      section="Periodo operativo"
      actions={
        canManage ? (
          <button className={buttonClass} onClick={() => setCreating(true)}>
            Nueva campana
          </button>
        ) : null
      }
    >
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_2fr]">
        <div className={cardClass}>
          <p className={labelClass}>Campana activa</p>
          {activeCampaign ? (
            <div>
              <p className="text-lg font-bold text-slate-900">{activeCampaign.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                Inicio {fmtDate(activeCampaign.startDate)}
                {activeCampaign.estimatedEndDate ? ` · cierre estimado ${fmtDate(activeCampaign.estimatedEndDate)}` : ''}
              </p>
            </div>
          ) : (
            <Notice kind="warn">No hay campana activa. Las operaciones normales quedaran bloqueadas hasta que directiva abra una campana.</Notice>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Abiertas" value={stats.open} />
          <MiniStat label="Planificadas" value={stats.planned} />
          <MiniStat label="Cerradas" value={stats.closed} />
        </div>
      </div>

      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}
      {!canManage && (
        <div className="mb-4">
          <Notice kind="info">Puedes consultar las campanas, pero solo directiva o administrador pueden crear, abrir o cerrar.</Notice>
        </div>
      )}

      <div className={`${cardClass} mb-5`}>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
          <div>
            <label htmlFor="campaign-search" className={labelClass}>Buscar</label>
            <input
              id="campaign-search"
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Invierno, verano..."
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="campaign-status" className={labelClass}>Estado</label>
            <select
              id="campaign-status"
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value as CampaignStatus | '')}
            >
              <option value="">Todos</option>
              <option value="PLANIFICADA">Planificada</option>
              <option value="ABIERTA">Abierta</option>
              <option value="CERRADA">Cerrada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>
          <button className={secondaryButtonClass} onClick={() => void refresh()}>
            Actualizar
          </button>
        </div>
      </div>

      <div className="table-container">
        <div className="border-b border-slate-100/80 px-5 py-3.5">
          <h2 className="font-bold text-slate-900">Listado de campanas</h2>
          <p className="mt-0.5 text-xs text-slate-400">Total: {campaigns.length}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-5 py-3.5" scope="col">Nombre</th>
                <th className="px-5 py-3.5" scope="col">Estado</th>
                <th className="px-5 py-3.5" scope="col">Inicio</th>
                <th className="px-5 py-3.5" scope="col">Cierre</th>
                <th className="px-5 py-3.5" scope="col">Resumen</th>
                <th className="px-5 py-3.5 text-right" scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} cols={6} />)
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="Sin campanas" description="No hay campanas que coincidan con los filtros." />
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => (
                  <tr key={campaign.id} className={campaign.isActive ? 'bg-emerald-50/40' : ''}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-800">{campaign.name}</p>
                      {campaign.notes && <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{campaign.notes}</p>}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={campaign.status} />
                      {campaign.isActive && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Activa</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 tabular-nums">{fmtDate(campaign.startDate)}</td>
                    <td className="px-5 py-3.5 text-slate-600 tabular-nums">{fmtDate(campaign.closedAt ?? campaign.estimatedEndDate)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {campaign.summary.plotCropAssignments} cultivos · {campaign.summary.stockMovements} mov. · {campaign.summary.purchases} compras
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <>
                            <button
                              className={secondaryButtonClass}
                              disabled={campaign.status === 'CERRADA' || campaign.status === 'CANCELADA'}
                              onClick={() => setEditing(campaign)}
                            >
                              Editar
                            </button>
                            {!campaign.isActive && campaign.status !== 'CERRADA' && campaign.status !== 'CANCELADA' && (
                              <button className={buttonClass} onClick={() => void openCampaign(campaign, done, setError)}>
                                Abrir
                              </button>
                            )}
                            {campaign.isActive && (
                              <button className={secondaryButtonClass} onClick={() => setClosing(campaign)}>
                                Cerrar
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">Solo consulta</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar campana' : 'Nueva campana'} onClose={() => { setCreating(false); setEditing(null); }}>
          <CampaignForm campaign={editing} onDone={done} />
        </Modal>
      )}

      {closing && (
        <Modal title="Cerrar campana" onClose={() => setClosing(null)}>
          <CloseCampaignForm campaign={closing} onDone={done} />
        </Modal>
      )}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={cardClass}>
      <p className={labelClass}>{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function CampaignForm({ campaign, onDone }: { campaign: Campaign | null; onDone: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    startDate: campaign?.startDate.slice(0, 10) ?? '',
    estimatedEndDate: campaign?.estimatedEndDate?.slice(0, 10) ?? '',
    notes: campaign?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload: CreateCampaignPayload = {
      name: form.name,
      startDate: form.startDate,
      estimatedEndDate: form.estimatedEndDate || null,
      notes: form.notes || null,
    };

    try {
      if (campaign) {
        await campaignsService.update(campaign.id, payload);
        await onDone('Campana actualizada.');
      } else {
        await campaignsService.create(payload);
        await onDone('Campana creada.');
      }
    } catch (err) {
      setError(extractError(err, 'No fue posible guardar la campana.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label htmlFor="campaign-name" className={labelClass}>Nombre *</label>
        <input id="campaign-name" className={inputClass} required value={form.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="campaign-start" className={labelClass}>Inicio *</label>
          <input id="campaign-start" className={inputClass} required type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </div>
        <div>
          <label htmlFor="campaign-end" className={labelClass}>Cierre estimado</label>
          <input id="campaign-end" className={inputClass} type="date" value={form.estimatedEndDate} onChange={(event) => set('estimatedEndDate', event.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="campaign-notes" className={labelClass}>Notas</label>
        <textarea id="campaign-notes" className={inputClass} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving} className={buttonClass}>{saving ? 'Guardando...' : campaign ? 'Actualizar' : 'Crear'}</button>
    </form>
  );
}

function CloseCampaignForm({ campaign, onDone }: { campaign: Campaign; onDone: (message: string) => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await campaignsService.close(campaign.id, { notes: notes || null });
      await onDone('Campana cerrada.');
    } catch (err) {
      setError(extractError(err, 'No fue posible cerrar la campana.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Notice kind="warn">Al cerrar la campana se bloquearan operaciones normales asociadas a este periodo.</Notice>
      <div>
        <label htmlFor="close-notes" className={labelClass}>Motivo o notas</label>
        <textarea id="close-notes" className={inputClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button disabled={saving} className={buttonClass}>{saving ? 'Cerrando...' : 'Cerrar campana'}</button>
    </form>
  );
}

async function openCampaign(
  campaign: Campaign,
  onDone: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) {
  setError(null);
  try {
    await campaignsService.open(campaign.id);
    await onDone('Campana abierta.');
  } catch (err) {
    setError(extractError(err, 'No fue posible abrir la campana.'));
  }
}
