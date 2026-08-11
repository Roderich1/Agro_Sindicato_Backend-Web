import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  EmptyState,
  Modal,
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
import { useAuth } from '../hooks/use-auth';
import { extractError, fmtDate } from '../lib/format';
import { calendarService } from '../services/calendar.service';
import { campaignsService } from '../services/campaigns.service';
import { listUsers } from '../services/users.service';
import type { CalendarEvent, CalendarEventStatus, CalendarEventType } from '../types/calendar';
import type { Campaign } from '../types/campaigns';
import type { AdminUser } from '../types/users';

const TYPE_LABELS: Record<CalendarEventType, string> = {
  VENCIMIENTO_LOTE: 'Vencimiento de lote',
  PAGO_PROXIMO: 'Pago próximo',
  APLICACION: 'Aplicación',
  COMPRA_PROGRAMADA: 'Compra programada',
  STOCK_BAJO: 'Stock bajo',
  CIERRE_CAMPANA: 'Cierre de campaña',
};

const TYPE_STYLES: Record<CalendarEventType, string> = {
  VENCIMIENTO_LOTE: 'border-red-500 bg-red-50 text-red-800',
  PAGO_PROXIMO: 'border-amber-500 bg-amber-50 text-amber-800',
  APLICACION: 'border-emerald-500 bg-emerald-50 text-emerald-800',
  COMPRA_PROGRAMADA: 'border-sky-500 bg-sky-50 text-sky-800',
  STOCK_BAJO: 'border-orange-500 bg-orange-50 text-orange-800',
  CIERRE_CAMPANA: 'border-slate-500 bg-slate-50 text-slate-800',
};

export function CalendarPage() {
  const { user } = useAuth();
  const isFarmer = user?.role === 'AGRICULTOR';
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [farmers, setFarmers] = useState<AdminUser[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [type, setType] = useState<CalendarEventType | ''>('');
  const [status, setStatus] = useState<CalendarEventStatus | ''>('PENDIENTE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [action, setAction] = useState<'complete' | 'cancel' | null>(null);
  const [saving, setSaving] = useState(false);
  const [referenceTime] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventData, campaignData, usersData] = await Promise.all([
        calendarService.list({
          campaignId: campaignId || undefined,
          ownerUserId: !isFarmer && ownerUserId ? ownerUserId : undefined,
          type: type || undefined,
          status: status || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
        }),
        campaignsService.list(),
        isFarmer ? Promise.resolve([]) : listUsers(),
      ]);
      const unique = new Map<string, CalendarEvent>();
      eventData.forEach((event) => {
        const key = event.sourceEntity && event.sourceEntityId
          ? `${event.type}:${event.sourceEntity}:${event.sourceEntityId}`
          : event.id;
        unique.set(key, event);
      });
      setEvents(Array.from(unique.values()));
      setCampaigns(campaignData);
      setFarmers(usersData.filter((item) => item.role === 'AGRICULTOR' && item.isActive));
    } catch (err) {
      setError(extractError(err, 'No fue posible cargar el calendario.'));
    } finally {
      setLoading(false);
    }
  }, [campaignId, from, isFarmer, ownerUserId, status, to, type]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );
  const farmerNames = useMemo(
    () => new Map(farmers.map((farmer) => [farmer.id, farmer.name])),
    [farmers],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      const key = new Date(event.eventDate).toLocaleDateString('sv-SE');
      groups.set(key, [...(groups.get(key) ?? []), event]);
    });
    return Array.from(groups.entries());
  }, [events]);
  const overdue = events.filter(
    (event) => event.status === 'PENDIENTE' && new Date(event.eventDate).getTime() < referenceTime,
  ).length;
  const nextSevenDays = events.filter((event) => {
    const time = new Date(event.eventDate).getTime();
    return event.status === 'PENDIENTE' && time >= referenceTime && time <= referenceTime + 7 * 86_400_000;
  }).length;

  const runAction = async () => {
    if (!selected || !action) return;
    setSaving(true);
    setError(null);
    try {
      await (action === 'complete'
        ? calendarService.complete(selected.id)
        : calendarService.cancel(selected.id));
      setMessage(action === 'complete' ? 'Evento marcado como completado.' : 'Evento cancelado.');
      setSelected(null);
      setAction(null);
      await refresh();
    } catch (err) {
      setError(extractError(err, 'No fue posible actualizar el evento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Calendario operativo" section="Agenda y alertas">
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Eventos visibles" value={events.length} color="sky" />
        <StatCard label="Próximos 7 días" value={nextSevenDays} color="amber" />
        <StatCard label="Pendientes vencidos" value={overdue} color={overdue ? 'red' : 'slate'} />
      </div>
      {message && <div className="mb-4"><Notice kind="ok">{message}</Notice></div>}
      {error && <div className="mb-4"><Notice kind="error">{error}</Notice></div>}

      <div className={`${cardClass} mb-5 p-4`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div><label htmlFor="calendar-campaign" className={labelClass}>Campaña</label><select id="calendar-campaign" className={inputClass} value={campaignId} onChange={(event) => setCampaignId(event.target.value)}><option value="">Todas</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></div>
          {!isFarmer && <div><label htmlFor="calendar-owner" className={labelClass}>Agricultor</label><select id="calendar-owner" className={inputClass} value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)}><option value="">Todos</option>{farmers.map((farmer) => <option key={farmer.id} value={farmer.id}>{farmer.name}</option>)}</select></div>}
          <div><label htmlFor="calendar-type" className={labelClass}>Tipo</label><select id="calendar-type" className={inputClass} value={type} onChange={(event) => setType(event.target.value as CalendarEventType | '')}><option value="">Todos</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor="calendar-status" className={labelClass}>Estado</label><select id="calendar-status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as CalendarEventStatus | '')}><option value="">Todos</option><option value="PENDIENTE">Pendiente</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></div>
          <div><label htmlFor="calendar-from" className={labelClass}>Desde</label><input id="calendar-from" className={inputClass} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></div>
          <div><label htmlFor="calendar-to" className={labelClass}>Hasta</label><input id="calendar-to" className={inputClass} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></div>
        </div>
      </div>

      {loading ? (
        <div className="table-container"><table className="w-full"><tbody>{Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} cols={4} />)}</tbody></table></div>
      ) : grouped.length === 0 ? (
        <div className={cardClass}><EmptyState title="Sin eventos" description="No hay eventos que coincidan con los filtros." /></div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, dateEvents]) => (
            <section key={date}>
              <h2 className="mb-2 text-sm font-bold uppercase text-slate-500">{fmtDate(`${date}T12:00:00`)}</h2>
              <div className="space-y-2">
                {dateEvents.map((event) => (
                  <article key={event.id} className={`border-l-4 px-4 py-3 ${TYPE_STYLES[event.type]}`}>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{event.title}</h3>
                          <StatusBadge status={event.status} />
                        </div>
                        <p className="mt-1 text-sm opacity-80">{TYPE_LABELS[event.type]}{event.description ? ` · ${event.description}` : ''}</p>
                        <p className="mt-1 text-xs opacity-70">
                          {event.campaignId ? campaignNames.get(event.campaignId) ?? 'Campaña no disponible' : 'Sin campaña'}
                          {!isFarmer && event.ownerUserId ? ` · ${farmerNames.get(event.ownerUserId) ?? 'Agricultor'}` : ''}
                        </p>
                      </div>
                      {event.status === 'PENDIENTE' && (
                        <div className="flex shrink-0 gap-2">
                          <button type="button" className={secondaryButtonClass} onClick={() => { setSelected(event); setAction('complete'); }}>Completar</button>
                          <button type="button" className={dangerButtonClass} onClick={() => { setSelected(event); setAction('cancel'); }}>Cancelar</button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected && action && (
        <Modal title={action === 'complete' ? 'Completar evento' : 'Cancelar evento'} onClose={() => { setSelected(null); setAction(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{selected.title}</p>
            <Notice kind={action === 'complete' ? 'info' : 'warn'}>
              {action === 'complete'
                ? 'El evento dejará de aparecer como pendiente.'
                : 'El evento quedará cancelado, pero la entidad de origen no será eliminada.'}
            </Notice>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => { setSelected(null); setAction(null); }}>Volver</button>
              <button type="button" disabled={saving} className={action === 'complete' ? buttonClass : dangerButtonClass} onClick={() => void runAction()}>
                {saving ? 'Guardando…' : action === 'complete' ? 'Confirmar' : 'Cancelar evento'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
