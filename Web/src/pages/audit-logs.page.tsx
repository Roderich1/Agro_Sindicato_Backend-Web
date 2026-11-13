import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/app-shell';
import { AUDIT_CATEGORIES, auditCategory, auditNote, auditScope, CATEGORY_ICON, type AuditCategory } from '../components/c/audit-text';
import { Facts, Overline, RowLink } from '../components/c/bits';
import { ViewHeader } from '../components/c/view-header';
import {
  Button,
  Collapsible,
  DataState,
  dataStateKindForError,
  Dialog,
  FilterChips,
  Icon,
  ICON,
  inputClass,
  Select,
  surfaceClass,
  type DataStateKind,
} from '../components/ui';
import { fmtDateTime } from '../lib/collective-text';
import { extractError } from '../lib/format';
import { auditLogsService } from '../services/audit-logs.service';
import { campaignsService } from '../services/campaigns.service';
import { listUsers } from '../services/users.service';
import type { AuditJsonValue, AuditLog, ListAuditLogsQuery } from '../types/audit-logs';
import type { Campaign } from '../types/campaigns';
import type { AdminUser } from '../types/users';

type CategoryFilter = 'ALL' | AuditCategory;

const MAX_ROWS = 300;
const TIME = new Intl.DateTimeFormat('es-BO', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function dayLabel(key: string, sample: Date, now: Date): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const text = DAY.format(sample);
  if (key === dayKey(now)) return `Hoy · ${text}`;
  if (key === dayKey(yesterday)) return `Ayer · ${text}`;
  return text;
}

function JsonBlock({ value }: { value: AuditJsonValue }) {
  if (value === null) return <p className="text-sm text-ink-muted">Sin datos registrados.</p>;
  return <pre className="max-h-64 overflow-auto rounded-control bg-ink p-3 text-xs leading-relaxed text-on-ink">{JSON.stringify(value, null, 2)}</pre>;
}

/**
 * Bitácora (`/audit-logs`, DIRECTIVA y ADMINISTRADOR; láminas 32 y 42, diálogo
 * 33.4). Lo que el servidor registró en `GET /audit-logs` (como máximo 300
 * filas), agrupado por día, de lo más reciente a lo más antiguo.
 *
 * - Filtros del servidor: campaña, persona (incluidas las cuentas inactivas,
 *   H-28) y fechas. El filtro por tipo de acción se hace en el navegador sobre
 *   las filas recibidas (Convocatorias, Permisos, Catálogo, Campañas…), porque el
 *   servidor admite un solo `entityName` y «Permisos» abarca dos.
 * - Cada fila dice lo que pasó (`summary` del servidor), quién y dónde (la
 *   campaña o el ámbito). «Detalle» abre «Qué pasó» con la nota
 *   (`metadata.reason`) y, plegados, los datos técnicos.
 * - H-08: no se inventan filas para acciones que el servidor no registra
 *   (generar un borrador, unir nombres, cambios del catálogo o de usuarios).
 */
export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [filters, setFilters] = useState({ campaignId: '', actorUserId: '', from: '', to: '' });
  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: DataStateKind; text: string } | null>(null);

  const query = useMemo<ListAuditLogsQuery>(
    () => ({
      campaignId: filters.campaignId || undefined,
      actorUserId: filters.actorUserId || undefined,
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      to: filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : undefined,
    }),
    [filters],
  );

  // Las opciones de los filtros se piden una vez; si fallan, el filtro queda sólo con «Todas».
  useEffect(() => {
    let alive = true;
    campaignsService
      .list()
      .then((data) => alive && setCampaigns(data))
      .catch(() => undefined);
    listUsers()
      .then((data) => alive && setUsers(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await auditLogsService.list(query));
    } catch (err) {
      setLogs([]);
      setError({ kind: dataStateKindForError(err), text: extractError(err, 'No fue posible cargar la bitácora.') });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const campaignNames = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])), [campaigns]);
  const userNames = useMemo(() => new Map(users.map((item) => [item.id, item.name])), [users]);
  const counts = useMemo(() => {
    const totals = new Map<AuditCategory, number>();
    logs.forEach((log) => totals.set(auditCategory(log), (totals.get(auditCategory(log)) ?? 0) + 1));
    return totals;
  }, [logs]);
  const shown = category === 'ALL' ? logs : logs.filter((log) => auditCategory(log) === category);
  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { label: string; rows: AuditLog[] }>();
    for (const log of shown) {
      const date = new Date(log.createdAt);
      const key = dayKey(date);
      const group = map.get(key) ?? { label: dayLabel(key, date, now), rows: [] };
      group.rows.push(log);
      map.set(key, group);
    }
    return [...map.entries()];
  }, [shown]);

  const setFilter = (field: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [field]: value }));
  const filtersActive = Object.values(filters).some(Boolean);
  const campaignOf = (log: AuditLog) => log.campaign?.name ?? (log.campaignId ? campaignNames.get(log.campaignId) ?? null : null);
  const actorOf = (log: AuditLog) => log.actor?.name ?? (log.actorUserId ? userNames.get(log.actorUserId) ?? null : null);
  const categoryOptions = [
    { value: 'ALL' as const, label: 'Todas', count: loading || error ? undefined : logs.length },
    ...AUDIT_CATEGORIES.filter((option) => (counts.get(option.value) ?? 0) > 0 || option.value === category).map((option) => ({
      ...option,
      count: counts.get(option.value) ?? 0,
    })),
  ];

  return (
    <AppShell title="Bitácora" section="Sindicato">
      <div className="space-y-5">
        <ViewHeader
          title="Bitácora"
          eyebrow="Lo que se hizo en la Web"
          subtitle={<span className="hidden lg:inline">Lo que se hizo en la Web, de lo más reciente a lo más antiguo.</span>}
          aside={
            <Button variant="secondary" icon={<Icon d={ICON.refresh} className="h-4 w-4" />} onClick={() => void refresh()} disabled={loading}>
              Actualizar
            </Button>
          }
        />

        <div className="space-y-3">
          <div className="lg:hidden">
            <FilterChips label="Tipo de acción" testId="audit-categories" value={category} onChange={setCategory} options={categoryOptions} />
          </div>
          <Button variant="ghost" size="sm" className="lg:hidden" aria-expanded={showFilters} aria-controls="audit-filters" onClick={() => setShowFilters((open) => !open)}>
            {showFilters ? 'Ocultar filtros' : `Más filtros${filtersActive ? ' (activos)' : ''}`}
          </Button>
          <div id="audit-filters" className={`${showFilters ? 'flex' : 'hidden'} flex-col gap-3 lg:flex lg:flex-row lg:flex-wrap lg:items-center`}>
            <Select id="audit-campaign" label="Campaña" hideLabel value={filters.campaignId} onChange={(event) => setFilter('campaignId', event.target.value)} fieldClassName="lg:w-64" className="rounded-full bg-surface font-semibold">
              <option value="">Todas las campañas</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </Select>
            {/* F10-SEC-02 (#45): sin filtro por agricultor; la bitácora institucional sólo tiene entradas sin dueño. */}
            <Select id="audit-actor" label="Persona" hideLabel value={filters.actorUserId} onChange={(event) => setFilter('actorUserId', event.target.value)} fieldClassName="lg:w-64" className="rounded-full bg-surface font-semibold">
              <option value="">Todas las personas</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.isActive ? '' : ' (inactiva)'}
                </option>
              ))}
            </Select>
            <div className="hidden lg:block">
              <Select id="audit-category" label="Tipo de acción" hideLabel value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)} fieldClassName="lg:w-60" className="rounded-full bg-surface font-semibold">
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'ALL' ? 'Todas las acciones' : option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="audit-from" className="text-sm text-ink-muted">
                Desde
              </label>
              <input id="audit-from" className={`${inputClass} w-auto rounded-full bg-surface`} type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilter('from', event.target.value)} />
              <label htmlFor="audit-to" className="text-sm text-ink-muted">
                hasta
              </label>
              <input id="audit-to" className={`${inputClass} w-auto rounded-full bg-surface`} type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilter('to', event.target.value)} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className={surfaceClass}>
            <DataState state="loading" title="Cargando la bitácora…" skeletonRows={5} />
          </div>
        ) : error ? (
          <div className={surfaceClass}>
            <DataState state={error.kind} description={error.kind === 'offline' ? undefined : error.text} onRetry={error.kind === 'forbidden' ? undefined : () => void refresh()} testId="audit-error" />
          </div>
        ) : logs.length === 0 ? (
          <div className={surfaceClass}>
            <DataState
              state={filtersActive ? 'no-match' : 'empty'}
              title={filtersActive ? 'Sin acciones para estos filtros' : 'Sin acciones registradas'}
              description={filtersActive ? 'Ninguna acción registrada coincide con la campaña, la persona o las fechas elegidas.' : 'Todavía no hay acciones registradas por el servidor.'}
              onClearFilters={filtersActive ? () => setFilters({ campaignId: '', actorUserId: '', from: '', to: '' }) : undefined}
            />
          </div>
        ) : shown.length === 0 ? (
          <div className={surfaceClass}>
            <DataState state="no-match" description="Ninguna de las acciones cargadas es de este tipo." onClearFilters={() => setCategory('ALL')} />
          </div>
        ) : (
          <div className="space-y-5" data-testid="audit-days">
            {groups.map(([key, group]) => (
              <section key={key} aria-labelledby={`day-${key}`} className="space-y-2.5">
                <Overline id={`day-${key}`}>{group.label}</Overline>
                <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`}>
                  {group.rows.map((log) => {
                    const cat = auditCategory(log);
                    const actor = actorOf(log);
                    const scope = auditScope(log, campaignOf(log));
                    return (
                      <li key={log.id} className="flex min-w-0 items-start gap-4 px-5 py-3.5 sm:items-center sm:px-6" data-testid={`audit-${log.id}`} data-category={cat}>
                        <time dateTime={log.createdAt} className="w-12 shrink-0 pt-0.5 font-semibold tabular-nums text-ink sm:pt-0">
                          {TIME.format(new Date(log.createdAt))}
                        </time>
                        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sunken text-ink sm:inline-flex">
                          <Icon d={CATEGORY_ICON[cat]} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink [overflow-wrap:anywhere] sm:font-medium">{log.summary ?? 'Acción registrada'}</p>
                          <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">{[actor ?? 'Sistema', scope].filter(Boolean).join(' · ')}</p>
                        </div>
                        <RowLink className="shrink-0" onClick={() => setSelected(log)} aria-label={`Detalle: ${log.summary ?? 'acción registrada'}`}>
                          Detalle
                        </RowLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!loading && !error && (
          <p className="text-sm text-ink-muted" data-testid="audit-limit">
            Se muestran como máximo las últimas {MAX_ROWS} acciones. Para ver más atrás, acote por fechas.
          </p>
        )}
      </div>

      {selected && (
        <Dialog title="Qué pasó" onClose={() => setSelected(null)} size="md" hideCloseButton footer={<Button onClick={() => setSelected(null)}>Cerrar</Button>}>
          <div className="space-y-4">
            <Facts
              rows={[
                ['Acción', selected.summary ?? 'Acción registrada'],
                ['Cuándo', fmtDateTime(selected.createdAt)],
                ['Quién', actorOf(selected) ?? 'Sistema'],
                ['Dónde', auditScope(selected, campaignOf(selected)) ?? '—'],
                ...(auditNote(selected) ? ([['Nota', auditNote(selected)]] as [string, string][]) : []),
              ]}
            />
            <Collapsible title="Ver datos técnicos" testId="audit-technical">
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm text-ink-muted">
                  {selected.entityName}
                  {selected.entityId ? ` · ${selected.entityId}` : ''}
                </p>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Antes</p>
                  <JsonBlock value={selected.before} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Después</p>
                  <JsonBlock value={selected.after} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">Metadatos</p>
                  <JsonBlock value={selected.metadata} />
                </div>
              </div>
            </Collapsible>
          </div>
        </Dialog>
      )}
    </AppShell>
  );
}
