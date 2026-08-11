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
import { cropsService, plotCropAssignmentsService, plotsService } from '../services/plots.service';
import type {
  CreateCropPayload,
  CreatePlotPayload,
  Crop,
  CropAssignmentStatus,
  Plot,
  PlotCropAssignment,
  PlotStatus,
} from '../types/plots';

type Tab = 'plots' | 'assignments' | 'crops';

export function PlotsPage() {
  const { user } = useAuth();
  const { activeCampaign, hasActiveCampaign } = useCampaign();
  const [activeTab, setActiveTab] = useState<Tab>('plots');
  const [plots, setPlots] = useState<Plot[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [assignments, setAssignments] = useState<PlotCropAssignment[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PlotStatus | ''>('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plotForm, setPlotForm] = useState<Plot | 'new' | null>(null);
  const [deactivatingPlot, setDeactivatingPlot] = useState<Plot | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<PlotCropAssignment | 'new' | null>(null);
  const [cropForm, setCropForm] = useState<Crop | 'new' | null>(null);

  const isFarmer = user?.role === 'AGRICULTOR';
  const canManageCrops = user?.role === 'DIRECTIVA' || user?.role === 'ADMINISTRADOR';
  const canAssign = isFarmer && hasActiveCampaign;
  const activeCampaignId = activeCampaign?.id;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [plotData, cropData, assignmentData] = await Promise.all([
        plotsService.list({
          search: search || undefined,
          status: status || undefined,
          ownerUserId: !isFarmer && ownerUserId ? ownerUserId : undefined,
        }),
        cropsService.list(),
        plotCropAssignmentsService.list({
          campaignId: activeCampaignId,
          ownerUserId: !isFarmer && ownerUserId ? ownerUserId : undefined,
        }),
      ]);
      setPlots(plotData);
      setCrops(cropData);
      setAssignments(assignmentData);
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar parcelas y cultivos.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeCampaignId, isFarmer, ownerUserId, search, status]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const owners = useMemo(() => {
    const unique = new Map<string, NonNullable<Plot['owner']>>();
    plots.forEach((plot) => {
      if (plot.owner) unique.set(plot.owner.id, plot.owner);
    });
    assignments.forEach((assignment) => {
      if (assignment.owner) unique.set(assignment.owner.id, assignment.owner);
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, plots]);

  const done = async (text: string) => {
    setMessage(text);
    setPlotForm(null);
    setDeactivatingPlot(null);
    setAssignmentForm(null);
    setCropForm(null);
    await refresh();
  };

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'plots', label: 'Parcelas', count: plots.length },
    { key: 'assignments', label: 'Cultivos asignados', count: assignments.length },
    { key: 'crops', label: 'Catalogo de cultivos', count: crops.length },
  ];

  return (
    <AppShell
      title="Parcelas y cultivos"
      section="Produccion agricola"
      actions={
        activeTab === 'plots' && isFarmer ? (
          <button className={buttonClass} onClick={() => setPlotForm('new')}>Nueva parcela</button>
        ) : activeTab === 'assignments' && isFarmer ? (
          <button className={buttonClass} disabled={!canAssign} onClick={() => setAssignmentForm('new')}>Asignar cultivo</button>
        ) : activeTab === 'crops' && canManageCrops ? (
          <button className={buttonClass} onClick={() => setCropForm('new')}>Nuevo cultivo</button>
        ) : null
      }
    >
      {!hasActiveCampaign && (
        <div className="mb-4">
          <Notice kind="warn">No hay campana activa. Las parcelas se pueden consultar o editar, pero no se pueden asignar cultivos.</Notice>
        </div>
      )}
      {!isFarmer && (
        <div className="mb-4">
          <Notice kind="info">Vista global de consulta. Las parcelas privadas solo pueden ser modificadas por su agricultor.</Notice>
        </div>
      )}
      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`min-w-max rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label} <span className="ml-1 opacity-75">{tab.count}</span>
          </button>
        ))}
      </div>

      {activeTab === 'plots' && (
        <PlotsView
          plots={plots}
          owners={owners}
          search={search}
          status={status}
          ownerUserId={ownerUserId}
          isFarmer={isFarmer}
          isLoading={isLoading}
          onSearch={setSearch}
          onStatus={setStatus}
          onOwner={setOwnerUserId}
          onEdit={setPlotForm}
          onDeactivate={setDeactivatingPlot}
          onRefresh={refresh}
        />
      )}

      {activeTab === 'assignments' && (
        <AssignmentsView
          assignments={assignments}
          isFarmer={isFarmer}
          isLoading={isLoading}
          activeCampaignName={activeCampaign?.name ?? null}
          onEdit={setAssignmentForm}
        />
      )}

      {activeTab === 'crops' && (
        <CropsView crops={crops} canManage={canManageCrops} isLoading={isLoading} onEdit={setCropForm} />
      )}

      {plotForm && (
        <Modal title={plotForm === 'new' ? 'Nueva parcela' : 'Editar parcela'} onClose={() => setPlotForm(null)}>
          <PlotForm plot={plotForm === 'new' ? null : plotForm} onDone={done} />
        </Modal>
      )}

      {deactivatingPlot && (
        <Modal title="Inactivar parcela" onClose={() => setDeactivatingPlot(null)}>
          <DeactivatePlotForm plot={deactivatingPlot} onDone={done} />
        </Modal>
      )}

      {assignmentForm && activeCampaign && (
        <Modal title={assignmentForm === 'new' ? 'Asignar cultivo' : 'Actualizar asignacion'} onClose={() => setAssignmentForm(null)}>
          <AssignmentForm
            assignment={assignmentForm === 'new' ? null : assignmentForm}
            campaignId={activeCampaign.id}
            plots={plots.filter((plot) => plot.status === 'ACTIVA')}
            crops={crops.filter((crop) => crop.isActive)}
            onDone={done}
          />
        </Modal>
      )}

      {cropForm && (
        <Modal title={cropForm === 'new' ? 'Nuevo cultivo' : 'Editar cultivo'} onClose={() => setCropForm(null)}>
          <CropForm crop={cropForm === 'new' ? null : cropForm} onDone={done} />
        </Modal>
      )}
    </AppShell>
  );
}

function PlotsView({
  plots,
  owners,
  search,
  status,
  ownerUserId,
  isFarmer,
  isLoading,
  onSearch,
  onStatus,
  onOwner,
  onEdit,
  onDeactivate,
  onRefresh,
}: {
  plots: Plot[];
  owners: NonNullable<Plot['owner']>[];
  search: string;
  status: PlotStatus | '';
  ownerUserId: string;
  isFarmer: boolean;
  isLoading: boolean;
  onSearch: (value: string) => void;
  onStatus: (value: PlotStatus | '') => void;
  onOwner: (value: string) => void;
  onEdit: (plot: Plot) => void;
  onDeactivate: (plot: Plot) => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className={`grid gap-3 ${isFarmer ? 'md:grid-cols-[1fr_220px_auto]' : 'md:grid-cols-[1fr_220px_240px_auto]'} md:items-end`}>
          <div>
            <label htmlFor="plot-search" className={labelClass}>Buscar parcela</label>
            <input id="plot-search" className={inputClass} value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Campo norte..." autoComplete="off" />
          </div>
          <div>
            <label htmlFor="plot-status" className={labelClass}>Estado</label>
            <select id="plot-status" className={inputClass} value={status} onChange={(event) => onStatus(event.target.value as PlotStatus | '')}>
              <option value="">Todos</option>
              <option value="ACTIVA">Activa</option>
              <option value="INACTIVA">Inactiva</option>
            </select>
          </div>
          {!isFarmer && (
            <div>
              <label htmlFor="plot-owner" className={labelClass}>Agricultor</label>
              <select id="plot-owner" className={inputClass} value={ownerUserId} onChange={(event) => onOwner(event.target.value)}>
                <option value="">Todos</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </div>
          )}
          <button className={secondaryButtonClass} onClick={() => void onRefresh()}>Actualizar</button>
        </div>
      </div>

      <div className="table-container">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-slate-900">Parcelas registradas</h2>
          <p className="mt-0.5 text-xs text-slate-400">{plots.length} parcela(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr><th className="px-5 py-3.5">Parcela</th>{!isFarmer && <th className="px-5 py-3.5">Agricultor</th>}<th className="px-5 py-3.5">Superficie</th><th className="px-5 py-3.5">Estado</th><th className="px-5 py-3.5">Historial</th><th className="px-5 py-3.5 text-right">Acciones</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} cols={isFarmer ? 5 : 6} />) : plots.length === 0 ? (
                <tr><td colSpan={isFarmer ? 5 : 6}><EmptyState title="Sin parcelas" description="No hay parcelas que coincidan con los filtros." /></td></tr>
              ) : plots.map((plot) => (
                <tr key={plot.id}>
                  <td className="px-5 py-3.5"><p className="font-semibold text-slate-800">{plot.name}</p><p className="text-xs text-slate-500">{plot.location ?? 'Sin ubicacion'}</p></td>
                  {!isFarmer && <td className="px-5 py-3.5 text-slate-600">{plot.owner?.name ?? '-'}</td>}
                  <td className="px-5 py-3.5 tabular-nums text-slate-700">{plot.area === null ? '-' : `${fmtNumber(plot.area)} ${plot.areaUnit}`}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={plot.status} /></td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{plot.summary.cropAssignments} cultivos · {plot.summary.agrochemicalApplications} aplicaciones</td>
                  <td className="px-5 py-3.5"><div className="flex justify-end gap-2">{isFarmer && plot.status === 'ACTIVA' ? <><button className={secondaryButtonClass} onClick={() => onEdit(plot)}>Editar</button><button className={dangerButtonClass} onClick={() => onDeactivate(plot)}>Inactivar</button></> : <span className="text-xs text-slate-400">Solo consulta</span>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AssignmentsView({ assignments, isFarmer, isLoading, activeCampaignName, onEdit }: { assignments: PlotCropAssignment[]; isFarmer: boolean; isLoading: boolean; activeCampaignName: string | null; onEdit: (assignment: PlotCropAssignment) => void }) {
  const canEdit = isFarmer && Boolean(activeCampaignName);

  return (
    <div className="table-container">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-bold text-slate-900">Cultivos por parcela</h2>
        <p className="mt-0.5 text-xs text-slate-400">{activeCampaignName ? `Campana ${activeCampaignName}` : 'Sin campana activa'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
            <tr>{!isFarmer && <th className="px-5 py-3.5">Agricultor</th>}<th className="px-5 py-3.5">Parcela</th><th className="px-5 py-3.5">Cultivo</th><th className="px-5 py-3.5">Area sembrada</th><th className="px-5 py-3.5">Siembra</th><th className="px-5 py-3.5">Estado</th><th className="px-5 py-3.5 text-right">Acciones</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} cols={isFarmer ? 6 : 7} />) : assignments.length === 0 ? <tr><td colSpan={isFarmer ? 6 : 7}><EmptyState title="Sin cultivos asignados" description="Asigna el cultivo principal de cada parcela para la campana activa." /></td></tr> : assignments.map((assignment) => (
              <tr key={assignment.id}>{!isFarmer && <td className="px-5 py-3.5 text-slate-600">{assignment.owner?.name ?? '-'}</td>}<td className="px-5 py-3.5 font-semibold text-slate-800">{assignment.plot?.name ?? '-'}</td><td className="px-5 py-3.5"><p className="font-medium text-slate-800">{assignment.crop?.name ?? '-'}</p><p className="text-xs text-slate-500">{assignment.crop?.variety ?? 'Sin variedad'}</p></td><td className="px-5 py-3.5 tabular-nums text-slate-600">{assignment.plantedArea === null ? '-' : `${fmtNumber(assignment.plantedArea)} ha`}</td><td className="px-5 py-3.5 text-slate-600">{fmtDate(assignment.plantedAt)}</td><td className="px-5 py-3.5"><StatusBadge status={assignment.status} /></td><td className="px-5 py-3.5 text-right">{canEdit ? <button className={secondaryButtonClass} onClick={() => onEdit(assignment)}>Actualizar</button> : <span className="text-xs text-slate-400">Solo consulta</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CropsView({ crops, canManage, isLoading, onEdit }: { crops: Crop[]; canManage: boolean; isLoading: boolean; onEdit: (crop: Crop) => void }) {
  return (
    <div className="table-container">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Catalogo de cultivos</h2><p className="mt-0.5 text-xs text-slate-400">Administrado por directiva y administrador</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3.5">Cultivo</th><th className="px-5 py-3.5">Variedad</th><th className="px-5 py-3.5">Estado</th><th className="px-5 py-3.5">Uso</th><th className="px-5 py-3.5 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{isLoading ? Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} cols={5} />) : crops.length === 0 ? <tr><td colSpan={5}><EmptyState title="Sin cultivos" description="Directiva puede registrar el primer cultivo del catalogo." /></td></tr> : crops.map((crop) => <tr key={crop.id}><td className="px-5 py-3.5 font-semibold text-slate-800">{crop.name}</td><td className="px-5 py-3.5 text-slate-600">{crop.variety ?? '-'}</td><td className="px-5 py-3.5"><StatusBadge status={crop.isActive ? 'ACTIVA' : 'INACTIVA'} /></td><td className="px-5 py-3.5 text-xs text-slate-500">{crop.summary.cropAssignments} asignaciones · {crop.summary.agrochemicalApplications} aplicaciones</td><td className="px-5 py-3.5 text-right">{canManage ? <button className={secondaryButtonClass} onClick={() => onEdit(crop)}>Editar</button> : <span className="text-xs text-slate-400">Solo consulta</span>}</td></tr>)}</tbody></table></div>
    </div>
  );
}

function PlotForm({ plot, onDone }: { plot: Plot | null; onDone: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: plot?.name ?? '', location: plot?.location ?? '', area: plot?.area?.toString() ?? '', areaUnit: plot?.areaUnit ?? 'ha', notes: plot?.notes ?? '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); const payload: CreatePlotPayload = { name: form.name, location: form.location || null, area: form.area ? Number(form.area) : null, areaUnit: form.areaUnit, notes: form.notes || null }; try { if (plot) { await plotsService.update(plot.id, payload); await onDone('Parcela actualizada.'); } else { await plotsService.create(payload); await onDone('Parcela creada.'); } } catch (err) { setError(extractError(err, 'No fue posible guardar la parcela.')); } finally { setSaving(false); } };
  return <form className="space-y-4" onSubmit={submit}><div><label htmlFor="plot-name" className={labelClass}>Nombre *</label><input id="plot-name" required className={inputClass} value={form.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" /></div><div><label htmlFor="plot-location" className={labelClass}>Ubicacion</label><input id="plot-location" className={inputClass} value={form.location} onChange={(event) => set('location', event.target.value)} autoComplete="off" /></div><div className="grid grid-cols-[1fr_110px] gap-3"><div><label htmlFor="plot-area" className={labelClass}>Superficie</label><input id="plot-area" className={inputClass} type="number" min="0" step="0.0001" value={form.area} onChange={(event) => set('area', event.target.value)} /></div><div><label htmlFor="plot-unit" className={labelClass}>Unidad</label><select id="plot-unit" className={inputClass} value={form.areaUnit} onChange={(event) => set('areaUnit', event.target.value)}><option value="ha">ha</option><option value="m2">m2</option></select></div></div><div><label htmlFor="plot-notes" className={labelClass}>Notas</label><textarea id="plot-notes" className={inputClass} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>{error && <Notice kind="error">{error}</Notice>}<button className={buttonClass} disabled={saving}>{saving ? 'Guardando...' : plot ? 'Actualizar' : 'Crear parcela'}</button></form>;
}

function DeactivatePlotForm({ plot, onDone }: { plot: Plot; onDone: (message: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await plotsService.deactivate(plot.id); await onDone('Parcela inactivada.'); } catch (err) { setError(extractError(err, 'No fue posible inactivar la parcela.')); } finally { setSaving(false); } };
  return <form className="space-y-4" onSubmit={submit}><Notice kind="warn">La parcela {plot.name} no se eliminara. Su historial permanecera disponible.</Notice>{error && <Notice kind="error">{error}</Notice>}<button className={dangerButtonClass} disabled={saving}>{saving ? 'Inactivando...' : 'Inactivar parcela'}</button></form>;
}

function AssignmentForm({ assignment, campaignId, plots, crops, onDone }: { assignment: PlotCropAssignment | null; campaignId: string; plots: Plot[]; crops: Crop[]; onDone: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({ plotId: assignment?.plotId ?? '', cropId: assignment?.cropId ?? '', plantedArea: assignment?.plantedArea?.toString() ?? '', plantedAt: assignment?.plantedAt?.slice(0, 10) ?? '', status: assignment?.status ?? 'ACTIVO' as CropAssignmentStatus, notes: assignment?.notes ?? '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const set = (field: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { if (assignment) { await plotCropAssignmentsService.update(assignment.id, { cropId: form.cropId, status: form.status, plantedArea: form.plantedArea ? Number(form.plantedArea) : null, plantedAt: form.plantedAt || null, notes: form.notes || null }); await onDone('Asignacion actualizada.'); } else { await plotCropAssignmentsService.create({ campaignId, plotId: form.plotId, cropId: form.cropId, plantedArea: form.plantedArea ? Number(form.plantedArea) : null, plantedAt: form.plantedAt || null, notes: form.notes || null }); await onDone('Cultivo asignado a la parcela.'); } } catch (err) { setError(extractError(err, 'No fue posible guardar la asignacion.')); } finally { setSaving(false); } };
  return <form className="space-y-4" onSubmit={submit}>{!assignment && <div><label htmlFor="assignment-plot" className={labelClass}>Parcela *</label><select id="assignment-plot" required className={inputClass} value={form.plotId} onChange={(event) => set('plotId', event.target.value)}><option value="">Seleccionar parcela</option>{plots.map((plot) => <option key={plot.id} value={plot.id}>{plot.name}</option>)}</select></div>}<div><label htmlFor="assignment-crop" className={labelClass}>Cultivo principal *</label><select id="assignment-crop" required className={inputClass} value={form.cropId} onChange={(event) => set('cropId', event.target.value)}><option value="">Seleccionar cultivo</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}{crop.variety ? ` - ${crop.variety}` : ''}</option>)}</select></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="assignment-area" className={labelClass}>Area sembrada (ha)</label><input id="assignment-area" className={inputClass} type="number" min="0" step="0.0001" value={form.plantedArea} onChange={(event) => set('plantedArea', event.target.value)} /></div><div><label htmlFor="assignment-date" className={labelClass}>Fecha de siembra</label><input id="assignment-date" className={inputClass} type="date" value={form.plantedAt} onChange={(event) => set('plantedAt', event.target.value)} /></div></div>{assignment && <div><label htmlFor="assignment-status" className={labelClass}>Estado</label><select id="assignment-status" className={inputClass} value={form.status} onChange={(event) => set('status', event.target.value as CropAssignmentStatus)}><option value="ACTIVO">Activo</option><option value="CAMBIADO">Cambiado</option><option value="FINALIZADO">Finalizado</option></select></div>}<div><label htmlFor="assignment-notes" className={labelClass}>Notas</label><textarea id="assignment-notes" className={inputClass} rows={3} value={form.notes} onChange={(event) => set('notes', event.target.value)} /></div>{error && <Notice kind="error">{error}</Notice>}<button className={buttonClass} disabled={saving || plots.length === 0 || crops.length === 0}>{saving ? 'Guardando...' : assignment ? 'Actualizar asignacion' : 'Asignar cultivo'}</button></form>;
}

function CropForm({ crop, onDone }: { crop: Crop | null; onDone: (message: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: crop?.name ?? '', variety: crop?.variety ?? '', notes: crop?.notes ?? '', isActive: crop?.isActive ?? true }); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); const payload: CreateCropPayload = { name: form.name, variety: form.variety || null, notes: form.notes || null }; try { if (crop) { await cropsService.update(crop.id, { ...payload, isActive: form.isActive }); await onDone('Cultivo actualizado.'); } else { await cropsService.create(payload); await onDone('Cultivo creado.'); } } catch (err) { setError(extractError(err, 'No fue posible guardar el cultivo.')); } finally { setSaving(false); } };
  return <form className="space-y-4" onSubmit={submit}><div><label htmlFor="crop-name" className={labelClass}>Nombre *</label><input id="crop-name" required className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="off" /></div><div><label htmlFor="crop-variety" className={labelClass}>Variedad</label><input id="crop-variety" className={inputClass} value={form.variety} onChange={(event) => setForm({ ...form, variety: event.target.value })} autoComplete="off" /></div>{crop && <label className="flex items-center gap-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Cultivo activo</label>}<div><label htmlFor="crop-notes" className={labelClass}>Notas</label><textarea id="crop-notes" className={inputClass} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>{error && <Notice kind="error">{error}</Notice>}<button className={buttonClass} disabled={saving}>{saving ? 'Guardando...' : crop ? 'Actualizar' : 'Crear cultivo'}</button></form>;
}
