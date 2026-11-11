import axios from 'axios';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, Modal } from '../components/app-shell';
import {
  Button,
  buttonClass,
  buttonClassFor,
  DataState,
  DataTable,
  inputClass,
  labelClass,
  Notice,
  PageHeader,
  StatusChip,
  surfaceClass,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useCampaignList } from '../hooks/use-selected-campaign';
import { fmtDateTime } from '../lib/collective-text';
import { extractError } from '../lib/format';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign, CampaignStatus, CreateCampaignPayload } from '../types/campaigns';
import { fmtCampaignDay, isEstimatedEndOverdue, OVERDUE_TEXT } from './campaign-dates';

const MANAGER_ROLES = ['DIRECTIVA', 'ADMINISTRADOR'];

const STATUS_FILTER_TEXT: Record<CampaignStatus, string> = {
  PLANIFICADA: 'Planificada',
  ABIERTA: 'Abierta',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
};

const COUNT_TEXT: [CampaignStatus, string, string][] = [
  ['ABIERTA', 'abierta', 'abiertas'],
  ['PLANIFICADA', 'planificada', 'planificadas'],
  ['CERRADA', 'cerrada', 'cerradas'],
  ['CANCELADA', 'cancelada', 'canceladas'],
];

/**
 * Campañas del sindicato (`GET /campaigns`, los tres roles). Crear, editar,
 * abrir y cerrar: sólo Directiva y Administrador (el servidor lo comprueba).
 *
 * Rediseño (sesión B, 2026-11-10): «Fin estimado» y «Cierre registrado» en
 * columnas distintas (matriz C4); «Fin estimado vencido · sin cierre
 * registrado» es una regla de presentación de la Web, no un dato del servidor.
 * La lista no supone una sola campaña abierta: muestra todas las `ABIERTA` que
 * lleguen y «Activa» sólo con `isActive`. Sin reabrir ni cancelar (no existen
 * rutas, C10). Cada fila enlaza a su detalle `/campaigns/:id`.
 *
 * Sin filtros, la lista es la de la sesión (`CampaignProvider`, una sola
 * `GET /campaigns`). Con búsqueda o estado se consulta al servidor (la búsqueda
 * espera a que la persona deje de escribir). Tras crear, editar, abrir o cerrar
 * se vuelve a pedir la lista de la sesión.
 */
export function CampaignsPage() {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const session = useCampaignList();
  const [found, setFound] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState<{ kind: 'error' | 'forbidden'; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  const filtered = Boolean(status || term);

  // La búsqueda consulta al servidor cuando la persona deja de escribir, no en cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const find = useCallback(async () => {
    setFindLoading(true);
    setFindError(null);
    try {
      setFound(await campaignsService.list({ status: status || undefined, search: term || undefined }));
    } catch (err) {
      setFound([]);
      setFindError({
        kind: axios.isAxiosError(err) && err.response?.status === 403 ? 'forbidden' : 'error',
        text: extractError(err, 'No fue posible cargar las campañas.'),
      });
    } finally {
      setFindLoading(false);
    }
  }, [status, term]);

  useEffect(() => {
    if (filtered) void Promise.resolve().then(find);
  }, [filtered, find]);

  const campaigns = filtered ? found : session.campaigns;
  const isLoading = filtered ? findLoading : session.loading;
  const error = filtered ? findError : session.error ? { kind: 'error' as const, text: session.error } : null;
  const refresh = filtered ? find : session.refresh;

  const changed = async (text: string) => {
    setMessage(text);
    setCreating(false);
    await (filtered ? Promise.all([session.refresh(), find()]) : session.refresh());
  };

  const counts = useMemo(
    () =>
      COUNT_TEXT.map(([value, one, many]) => {
        const n = campaigns.filter((campaign) => campaign.status === value).length;
        return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
      })
        .filter(Boolean)
        .join(' · '),
    [campaigns],
  );
  const openCount = campaigns.filter((campaign) => campaign.status === 'ABIERTA').length;

  return (
    <AppShell title="Campañas" section="Gestión">
      <div className="space-y-4">
        <PageHeader
          title="Campañas"
          subtitle="Campañas compartidas del sindicato: fechas, estado y acceso al detalle de cada una."
          actions={canManage ? <Button onClick={() => setCreating(true)}>Nueva campaña</Button> : null}
        />

        <div className={`px-5 py-3 ${surfaceClass}`} data-testid="active-campaign">
          <p className={labelClass}>Campaña activa</p>
          {activeCampaign ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="min-w-0 text-xl font-bold leading-tight text-ink [overflow-wrap:anywhere]">{activeCampaign.name}</p>
              <span className="inline-flex shrink-0 items-center rounded-full bg-brand-700 px-2.5 py-0.5 text-[11px] font-semibold text-white">Activa</span>
              <p className="text-sm text-slate-600 tabular-nums">
                Inicio {fmtCampaignDay(activeCampaign.startDate) ?? '—'}
                {activeCampaign.estimatedEndDate ? ` · fin estimado ${fmtCampaignDay(activeCampaign.estimatedEndDate)}` : ''}
              </p>
              {isEstimatedEndOverdue(activeCampaign) && <OverdueNote />}
            </div>
          ) : (
            <Notice kind="warn" compact>
              No hay campaña activa. Los agricultores no pueden registrar en una campaña hasta que la Directiva abra una.
            </Notice>
          )}
        </div>

        {message && <Notice kind="ok">{message}</Notice>}
        {!canManage && (
          <Notice kind="info">Puede consultar las campañas; sólo la Directiva o el Administrador pueden crearlas, editarlas, abrirlas o cerrarlas.</Notice>
        )}

        <section className={`overflow-hidden ${surfaceClass}`}>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink">Historial de campañas</h2>
              <p className="mt-0.5 text-xs text-slate-600" data-testid="campaign-counts">
                {isLoading || error ? ' ' : campaigns.length === 0 ? 'Sin campañas en la lista' : counts}
                {!isLoading && openCount > 1 && ` · hay ${openCount} campañas abiertas; «Activa» es sólo la que el servidor marca como activa`}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-full min-w-0 sm:w-48">
                <label htmlFor="campaign-search" className={labelClass}>Buscar</label>
                <input
                  id="campaign-search"
                  type="search"
                  enterKeyHint="search"
                  inputMode="search"
                  className={inputClass}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Invierno, verano…"
                  autoComplete="off"
                />
              </div>
              <div className="w-full min-w-0 sm:w-40">
                <label htmlFor="campaign-status" className={labelClass}>Estado</label>
                <select
                  id="campaign-status"
                  className={inputClass}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CampaignStatus | '')}
                >
                  <option value="">Todos</option>
                  {(Object.keys(STATUS_FILTER_TEXT) as CampaignStatus[]).map((value) => (
                    <option key={value} value={value}>{STATUS_FILTER_TEXT[value]}</option>
                  ))}
                </select>
              </div>
              <Button variant="ghost" onClick={() => void refresh()} disabled={isLoading}>
                Actualizar
              </Button>
            </div>
          </div>

          {isLoading ? (
            <DataState state="loading" title="Cargando campañas…" />
          ) : error ? (
            <DataState state={error.kind} description={error.kind === 'forbidden' ? undefined : error.text} onRetry={() => void refresh()} testId="campaigns-error" />
          ) : campaigns.length === 0 ? (
            filtered ? (
              <DataState
                state="no-match"
                description={`Ninguna campaña coincide con el filtro aplicado (${[term && `«${term}»`, status && STATUS_FILTER_TEXT[status]].filter(Boolean).join(', ')}).`}
                onClearFilters={() => {
                  setSearch('');
                  setTerm('');
                  setStatus('');
                }}
              />
            ) : (
              <DataState
                state="empty"
                title="Todavía no hay campañas"
                description={canManage ? 'Cree la primera con «Nueva campaña».' : 'La Directiva aún no creó ninguna campaña.'}
              />
            )
          ) : (
            <DataTable caption="Historial de campañas" minWidth={980}>
              <thead>
                <tr>
                  <th scope="col">Campaña</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Inicio</th>
                  <th scope="col">Fin estimado</th>
                  <th scope="col">Cierre registrado</th>
                  <th scope="col" className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} data-testid={`campaign-row-${campaign.name}`}>
                    <td className="max-w-[22rem]">
                      <p className="font-semibold text-ink [overflow-wrap:anywhere]">{campaign.name}</p>
                      {campaign.notes && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600" title={campaign.notes}>
                          {campaign.notes}
                        </p>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusChip status={campaign.status} />
                        {campaign.isActive && (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">Activa</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-slate-700">{fmtCampaignDay(campaign.startDate) ?? '—'}</td>
                    <td className="tabular-nums text-slate-700" data-testid="estimated-end">
                      <span className="whitespace-nowrap">{fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}</span>
                      {isEstimatedEndOverdue(campaign) && <OverdueNote />}
                    </td>
                    <td className="tabular-nums text-slate-700" data-testid="closed-at">
                      {campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : <span className="text-slate-500">Sin cierre registrado</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex flex-nowrap items-center justify-end gap-2">
                        <Link to={`/campaigns/${encodeURIComponent(campaign.id)}`} className={buttonClassFor('ghost', 'sm')} aria-label={`Ver detalle de ${campaign.name}`}>
                          Ver detalle
                        </Link>
                        <CampaignActions campaign={campaign} onChanged={changed} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>

      {creating && (
        <Modal title="Nueva campaña" onClose={() => setCreating(false)}>
          <CampaignForm campaign={null} onDone={changed} />
        </Modal>
      )}
    </AppShell>
  );
}

/** Texto (no sólo color) de la regla de presentación «fin estimado vencido». */
export function OverdueNote() {
  return (
    <span className="mt-0.5 block text-xs font-semibold text-amber-900" data-testid="overdue">
      {OVERDUE_TEXT}
    </span>
  );
}

/**
 * Editar, abrir y cerrar una campaña, con los mismos permisos y confirmaciones
 * que antes (lista y detalle). Quien no es Directiva ni Administrador sólo
 * consulta. Cerrar exige confirmar en una ventana; cerrar no es sellar.
 */
export function CampaignActions({ campaign, onChanged }: { campaign: Campaign; onChanged: (message: string) => Promise<void> | void }) {
  const { user } = useAuth();
  const { refreshActiveCampaign } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  if (!canManage) return <span className="self-center text-xs text-slate-600">Sólo consulta</span>;

  const terminal = campaign.status === 'CERRADA' || campaign.status === 'CANCELADA';
  const done = async (text: string) => {
    setEditing(false);
    setClosing(false);
    await Promise.all([onChanged(text), refreshActiveCampaign()]);
  };
  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await campaignsService.open(campaign.id);
      await done('Campaña abierta.');
    } catch (err) {
      setError(extractError(err, 'No fue posible abrir la campaña.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" disabled={terminal} onClick={() => setEditing(true)}>
        Editar
      </Button>
      {!campaign.isActive && !terminal && (
        <Button size="sm" onClick={() => void open()} disabled={busy}>
          {busy ? 'Abriendo…' : 'Abrir'}
        </Button>
      )}
      {campaign.isActive && (
        <Button variant="secondary" size="sm" onClick={() => setClosing(true)}>
          Cerrar
        </Button>
      )}
      {error && (
        <div className="max-w-xs basis-full whitespace-normal">
          <Notice kind="error" compact>{error}</Notice>
        </div>
      )}
      {editing && (
        <Modal title="Editar campaña" onClose={() => setEditing(false)}>
          <CampaignForm campaign={campaign} onDone={done} />
        </Modal>
      )}
      {closing && (
        <Modal title="Cerrar campaña" onClose={() => setClosing(false)}>
          <CloseCampaignForm campaign={campaign} onDone={done} />
        </Modal>
      )}
    </>
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
        await onDone('Campaña actualizada.');
      } else {
        await campaignsService.create(payload);
        await onDone('Campaña creada.');
      }
    } catch (err) {
      setError(extractError(err, 'No fue posible guardar la campaña.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label htmlFor="campaign-name" className={labelClass}>Nombre *</label>
        <input id="campaign-name" className={inputClass} required maxLength={160} value={form.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="campaign-start" className={labelClass}>Inicio *</label>
          <input id="campaign-start" className={inputClass} required type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </div>
        <div>
          <label htmlFor="campaign-end" className={labelClass}>Fin estimado</label>
          <input id="campaign-end" className={inputClass} type="date" value={form.estimatedEndDate} onChange={(event) => set('estimatedEndDate', event.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor="campaign-notes" className={labelClass}>Notas</label>
        <textarea id="campaign-notes" className={inputClass} rows={3} maxLength={500} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" disabled={saving} className={buttonClass}>{getCampaignSubmitLabel(saving, Boolean(campaign))}</button>
    </form>
  );
}

function getCampaignSubmitLabel(saving: boolean, isEditing: boolean) {
  if (saving) return 'Guardando…';
  return isEditing ? 'Actualizar' : 'Crear';
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
      await onDone('Campaña cerrada.');
    } catch (err) {
      setError(extractError(err, 'No fue posible cerrar la campaña.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Notice kind="warn">
        Se cerrará «{campaign.name}». Al cerrar la campaña se bloquearán las operaciones normales asociadas a este periodo. Cerrar no
        es sellar y no se puede reabrir.
      </Notice>
      <div>
        <label htmlFor="close-notes" className={labelClass}>Motivo o notas</label>
        <textarea id="close-notes" className={inputClass} rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <button type="submit" disabled={saving} className={buttonClass}>{saving ? 'Cerrando…' : 'Cerrar campaña'}</button>
    </form>
  );
}
