import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { Overline } from '../components/c/bits';
import {
  Button,
  buttonClassFor,
  Chip,
  ConfirmDialog,
  DataState,
  Dialog,
  Icon,
  ICON,
  Notice,
  PageHeader,
  SearchInput,
  Select,
  StatusChip,
  surfaceClass,
  Textarea,
  TextInput,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { useCampaign } from '../hooks/use-campaign';
import { useCampaignList } from '../hooks/use-selected-campaign';
import { fmtDateTime } from '../lib/collective-text';
import { extractError } from '../lib/format';
import { campaignDetailPath, isCollectiveRole } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
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
 * Campañas del sindicato (láminas 28 y 41; diálogos 30.1, 30.2 y 34.3).
 * `GET /campaigns`; crear, editar, abrir y cerrar: sólo Directiva y
 * Administrador (el servidor lo comprueba). Sin reabrir ni cancelar (no
 * existen rutas).
 *
 * - La campaña activa del sindicato (`isActive`, de la sesión) va arriba en
 *   una tarjeta oscura con «Cerrar campaña…» y «Ver detalle». Las demás, en
 *   la lista de abajo, cada una con su detalle `/campaigns/:id`. La lista no
 *   supone una sola campaña abierta: muestra todas las `ABIERTA` que lleguen.
 * - «Fin estimado vencido · sin cierre registrado» es una regla de
 *   presentación de la Web, no un dato del servidor.
 * - «Sellada · versión N» sale de `GET /collective/trends` (una sola llamada,
 *   H-25), nunca de `GET …/seal` por campaña. Si esa lectura falla no hay
 *   chip: no se deduce nada.
 * - La cobertura de cada campaña no va en la lista (H-18): está en el detalle.
 *
 * Sin filtros, la lista es la de la sesión (`CampaignProvider`, una sola
 * `GET /campaigns`). Con búsqueda o estado se consulta al servidor (la búsqueda
 * espera a que la persona deje de escribir). Tras crear, editar, abrir o cerrar
 * se vuelve a pedir la lista de la sesión.
 */
export function CampaignsPage() {
  const { user } = useAuth();
  const { activeCampaign, refreshActiveCampaign } = useCampaign();
  const session = useCampaignList();
  const [found, setFound] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState<{ kind: 'error' | 'forbidden'; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sealed, setSealed] = useState<Map<string, number>>(new Map());

  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  const collective = isCollectiveRole(user?.role);
  const filtered = Boolean(status || term);

  // H-25: la versión sellada de cada campaña, con una sola lectura de la serie sellada.
  useEffect(() => {
    if (!collective) return undefined;
    let alive = true;
    collectiveService
      .trends(null)
      .then((trends) => {
        if (!alive) return;
        setSealed(new Map(trends.campaigns.filter((row) => row.seal).map((row) => [row.campaign_ref, row.seal!.version])));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [collective]);

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
  // «Actualizar» es la forma explícita de ver cambios hechos por otra persona:
  // vuelve a pedir la lista (o la búsqueda) y la campaña activa. Sin sondeo.
  const refreshSession = session.refresh;
  const refresh = useCallback(async () => {
    await (filtered ? find() : refreshSession());
    await refreshActiveCampaign();
  }, [filtered, find, refreshSession, refreshActiveCampaign]);

  const changed = async (text: string) => {
    setMessage(text);
    setCreating(false);
    await (filtered ? Promise.all([session.refresh(), find()]) : session.refresh());
  };

  const openCount = campaigns.filter((campaign) => campaign.status === 'ABIERTA').length;
  // La tarjeta de arriba usa la fila más reciente de la lista si está; si no, la de la sesión.
  const active = activeCampaign ? (session.campaigns.find((row) => row.id === activeCampaign.id) ?? activeCampaign) : null;
  const others = campaigns.filter((campaign) => campaign.id !== active?.id);
  const onlyActiveMatches = filtered && others.length === 0 && campaigns.length > 0;
  // El recuento describe la lista de abajo: la campaña activa está en la tarjeta de arriba y no se cuenta aquí.
  const counts = COUNT_TEXT.map(([value, one, many]) => {
    const n = others.filter((campaign) => campaign.status === value).length;
    return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
  })
    .filter(Boolean)
    .join(' · ');
  const activeInList = campaigns.some((campaign) => campaign.id === active?.id);

  return (
    <AppShell title="Campañas" section="Sindicato">
      <div className="flex flex-col gap-5">
        <PageHeader
          showSynthetic={false}
          attachToHeader
          eyebrowPhoneOnly
          title="Campañas"
          eyebrow={user?.tenant?.name}
          primaryAction={canManage ? { label: 'Nueva campaña', onClick: () => setCreating(true) } : undefined}
        />

        {message && <Notice kind="ok">{message}</Notice>}

        <section aria-labelledby="active-title" className="space-y-3">
          <div className="lg:sr-only">
            <Overline id="active-title">Campaña activa</Overline>
          </div>
          {active ? (
            <ActiveCampaignCard campaign={active} sealedVersion={sealed.get(active.id) ?? null} onChanged={changed} />
          ) : (
            <div data-testid="active-campaign">
              <Notice kind="warn">No hay campaña activa. Los agricultores no pueden registrar en una campaña hasta que la Directiva abra una.</Notice>
            </div>
          )}
        </section>

        <section aria-labelledby="list-title" className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <Overline id="list-title">{active && !filtered ? 'Otras campañas' : 'Campañas'}</Overline>
              <p className="mt-0.5 text-sm text-ink-muted" data-testid="campaign-counts">
                {isLoading || error ? ' ' : others.length === 0 ? (campaigns.length === 0 ? 'Sin campañas en la lista' : 'Ninguna otra campaña') : counts}
                {!isLoading && !error && openCount > 1 && ` · en total hay ${openCount} campañas abiertas${activeInList ? ', contando la de arriba' : ''}; «Campaña activa» es sólo la que el servidor marca como activa`}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                id="campaign-search"
                label="Buscar campaña"
                value={search}
                onChange={setSearch}
                placeholder="Buscar campaña"
                enterKeyHint="search"
                inputMode="search"
                autoComplete="off"
                fieldClassName="w-full sm:w-64"
              />
              <Select id="campaign-status" label="Estado" hideLabel value={status} onChange={(event) => setStatus(event.target.value as CampaignStatus | '')} fieldClassName="w-full sm:w-44" className="rounded-full bg-surface">
                <option value="">Todas</option>
                {(Object.keys(STATUS_FILTER_TEXT) as CampaignStatus[]).map((value) => (
                  <option key={value} value={value}>
                    {STATUS_FILTER_TEXT[value]}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" icon={<Icon d={ICON.refresh} className="h-4 w-4" />} onClick={() => void refresh()} disabled={isLoading}>
                Actualizar
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className={surfaceClass}>
              <DataState state="loading" title="Cargando campañas…" />
            </div>
          ) : error ? (
            <div className={surfaceClass}>
              <DataState state={error.kind} description={error.kind === 'forbidden' ? undefined : error.text} onRetry={() => void refresh()} testId="campaigns-error" />
            </div>
          ) : campaigns.length === 0 || onlyActiveMatches ? (
            <div className={surfaceClass}>
              {filtered ? (
                <DataState
                  state="no-match"
                  description={
                    onlyActiveMatches
                      ? 'Sólo coincide la campaña activa, que está arriba.'
                      : `Ninguna campaña coincide con el filtro aplicado (${[term && `«${term}»`, status && STATUS_FILTER_TEXT[status]].filter(Boolean).join(', ')}).`
                  }
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
              )}
            </div>
          ) : others.length === 0 ? (
            <p className="text-sm text-ink-muted">No hay otras campañas: sólo la activa.</p>
          ) : (
            <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`} aria-label="Otras campañas">
              {others.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} sealedVersion={sealed.get(campaign.id) ?? null} onChanged={changed} />
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-muted">Cerrar una campaña no la sella, y una campaña cerrada no se puede reabrir.</p>
        </section>
      </div>

      {creating && <CampaignFormDialog campaign={null} onClose={() => setCreating(false)} onDone={changed} />}
    </AppShell>
  );
}

function SealChip({ version }: { version: number | null }) {
  if (version === null) return null;
  return (
    <Chip tone="positive" dot>
      Sellada · versión {version}
    </Chip>
  );
}

/** Lámina 28: la campaña activa en una tarjeta oscura (lámina 41 en teléfono). */
function ActiveCampaignCard({ campaign, sealedVersion, onChanged }: { campaign: Campaign; sealedVersion: number | null; onChanged: (text: string) => Promise<void> }) {
  return (
    <div className="ui-on-ink rounded-hero bg-ink px-5 py-6 text-white sm:px-8" data-testid="active-campaign">
      <div className="flex flex-col gap-5" data-testid={`campaign-row-${campaign.name}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={campaign.status} />
            {campaign.isActive && <Chip tone="on-dark">Campaña activa</Chip>}
            <SealChip version={sealedVersion} />
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold leading-tight text-white [overflow-wrap:anywhere] sm:text-4xl">{campaign.name}</p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-5 border-t border-ink-line pt-5">
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-on-ink-muted">Empezó</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-white">{fmtCampaignDay(campaign.startDate) ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-on-ink-muted">Fin estimado</dt>
            <dd className="font-display text-xl font-bold tabular-nums text-white" data-testid="estimated-end">
              {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
              {isEstimatedEndOverdue(campaign) && <OverdueNote onDark />}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-on-ink-muted">Cierre</dt>
            <dd className="font-display text-xl font-bold text-white" data-testid="closed-at">
              {campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <CampaignActions campaign={campaign} onChanged={onChanged} onDark />
          <Link to={campaignDetailPath(campaign.id)} className={buttonClassFor('accent')} aria-label={`Ver detalle de ${campaign.name}`}>
            Ver detalle
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}

function CampaignRow({ campaign, sealedVersion, onChanged }: { campaign: Campaign; sealedVersion: number | null; onChanged: (text: string) => Promise<void> }) {
  return (
    <li className="relative flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-canvas sm:px-7" data-testid={`campaign-row-${campaign.name}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{campaign.name}</p>
        <p className="text-sm tabular-nums text-ink-muted">
          <span data-testid="estimated-end">
            {fmtCampaignDay(campaign.startDate) ?? '—'} – {fmtCampaignDay(campaign.estimatedEndDate) ?? 'Sin fecha estimada'}
          </span>
          <span className="sr-only"> (inicio y fin estimado)</span>
          {' · '}
          <span data-testid="closed-at">{campaign.closedAt ? `Cerrada el ${fmtDateTime(campaign.closedAt)}` : 'Sin cierre registrado'}</span>
        </p>
        {isEstimatedEndOverdue(campaign) && <OverdueNote />}
        {campaign.notes && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted [overflow-wrap:anywhere]">{campaign.notes}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={campaign.status} />
        {campaign.isActive && <Chip tone="dark">Campaña activa</Chip>}
        <SealChip version={sealedVersion} />
      </div>
      {/* Las acciones quedan por encima del enlace que cubre la fila. */}
      <div className="relative z-[1] flex flex-wrap items-center gap-2">
        <CampaignActions campaign={campaign} onChanged={onChanged} />
      </div>
      <Link
        to={campaignDetailPath(campaign.id)}
        aria-label={`Ver detalle de ${campaign.name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink after:absolute after:inset-0 after:content-[''] hover:bg-sunken focus-visible:outline-2"
      >
        <Icon d={ICON.chevronRight} className="h-5 w-5" />
      </Link>
    </li>
  );
}

/** Texto (no sólo color) de la regla de presentación «fin estimado vencido». */
export function OverdueNote({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className={`mt-0.5 block font-sans text-xs font-semibold ${onDark ? 'text-warn-bg' : 'text-caution'}`} data-testid="overdue">
      {OVERDUE_TEXT}
    </span>
  );
}

/**
 * Editar, abrir y cerrar una campaña, con los mismos permisos y confirmaciones
 * que antes (lista, tarjeta activa y detalle). Quien no es Directiva ni
 * Administrador sólo consulta. Cerrar exige confirmar en un diálogo (30.2);
 * cerrar no es sellar.
 */
export function CampaignActions({ campaign, onChanged, onDark = false }: { campaign: Campaign; onChanged: (message: string) => Promise<void> | void; onDark?: boolean }) {
  const { user } = useAuth();
  const { refreshActiveCampaign } = useCampaign();
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = Boolean(user && MANAGER_ROLES.includes(user.role));
  if (!canManage) return <span className={`self-center text-xs ${onDark ? 'text-on-ink-muted' : 'text-ink-muted'}`}>Sólo consulta</span>;

  const terminal = campaign.status === 'CERRADA' || campaign.status === 'CANCELADA';
  const variant = onDark ? 'on-dark' : 'secondary';
  const size = onDark ? 'md' : 'sm';
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
  const close = async (notes: string) => {
    setCloseBusy(true);
    setCloseError(null);
    try {
      await campaignsService.close(campaign.id, { notes: notes || null });
      setCloseBusy(false);
      await done('Campaña cerrada.');
    } catch (err) {
      setCloseError(extractError(err, 'No fue posible cerrar la campaña.'));
      setCloseBusy(false);
    }
  };

  return (
    <>
      {!terminal && (
        <Button variant={variant} size={size} onClick={() => setEditing(true)}>
          Editar
        </Button>
      )}
      {!campaign.isActive && !terminal && (
        <Button variant={onDark ? 'accent' : 'primary'} size={size} onClick={() => void open()} busy={busy}>
          Abrir campaña
        </Button>
      )}
      {campaign.isActive && (
        <Button variant={variant} size={size} onClick={() => setClosing(true)}>
          Cerrar campaña…
        </Button>
      )}
      {error && (
        <div className="max-w-xs basis-full whitespace-normal">
          <Notice kind="error" compact>
            {error}
          </Notice>
        </div>
      )}
      {editing && <CampaignFormDialog campaign={campaign} onClose={() => setEditing(false)} onDone={done} />}
      {closing && (
        <ConfirmDialog
          title={`Cerrar «${campaign.name}»`}
          confirmLabel="Cerrar campaña"
          reason={{ label: 'Motivo o notas', required: false, help: 'Opcional.', maxLength: 500 }}
          busy={closeBusy}
          error={closeError}
          onConfirm={(notes) => void close(notes)}
          onCancel={() => {
            setClosing(false);
            setCloseError(null);
          }}
        >
          <Notice kind="warn">
            Cerrar no es sellar, y una campaña cerrada no se puede reabrir. Al cerrarla se bloquean las operaciones normales asociadas a este periodo.
          </Notice>
        </ConfirmDialog>
      )}
    </>
  );
}

/** Diálogos 30.1 «Nueva campaña» y 34.3 «Editar campaña» (el estado se ve bloqueado: se cambia con «Cerrar campaña»). */
function CampaignFormDialog({ campaign, onClose, onDone }: { campaign: Campaign | null; onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const initial = {
    name: campaign?.name ?? '',
    startDate: campaign?.startDate.slice(0, 10) ?? '',
    estimatedEndDate: campaign?.estimatedEndDate?.slice(0, 10) ?? '',
    notes: campaign?.notes ?? '',
  };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = campaign ? `campaign-form-${campaign.id}` : 'campaign-form-new';
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((key) => form[key] !== initial[key]);
  const ready = form.name.trim().length >= 2 && form.startDate !== '' && !saving;

  const set = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
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
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={campaign ? `Editar «${campaign.name}»` : 'Nueva campaña'}
      onClose={onClose}
      dirty={dirty}
      busy={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={!ready} busy={saving}>
            {campaign ? 'Guardar cambios' : 'Crear campaña'}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
        <TextInput
          id="campaign-name"
          label="Nombre"
          required
          maxLength={160}
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Por ejemplo: Invierno 2027"
          autoComplete="off"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput id="campaign-start" label="Inicio" required type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
          <TextInput id="campaign-end" label="Fin estimado" optional type="date" value={form.estimatedEndDate} onChange={(event) => set('estimatedEndDate', event.target.value)} />
        </div>
        <Textarea id="campaign-notes" label="Notas" help="Opcional." maxLength={500} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        {campaign && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink" id={`${formId}-status`}>
              Estado
            </p>
            <p className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-sunken px-4 py-2.5 text-base text-ink" aria-labelledby={`${formId}-status`}>
              <Icon d={ICON.lock} className="h-4 w-4 shrink-0" />
              {STATUS_FILTER_TEXT[campaign.status] ?? campaign.status}
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">Se cambia con «Cerrar campaña», no desde aquí.</p>
          </div>
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}
