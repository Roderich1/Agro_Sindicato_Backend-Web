import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CAMERA_PATH, Facts, Overline, UnitBadge } from '../components/c/bits';
import { ViewHeader } from '../components/c/view-header';
import {
  Button,
  Checkbox,
  Chip,
  Collapsible,
  DataState,
  Dialog,
  Icon,
  ICON,
  Notice,
  RadioCards,
  SearchInput,
  SegmentedControl,
  Select,
  surfaceClass,
  Textarea,
  TextInput,
} from '../components/ui';
import { notifyIdentificationChanged } from '../contexts/identification-pending';
import { useAuth } from '../hooks/use-auth';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import {
  EVENT_LABEL,
  identificationError,
  identificationErrorCode,
  MATCHED_ON_LABEL,
  photoError,
  PRODUCT_NAME_TAKEN_TEXT,
  SIMILARITY_LABEL,
} from '../lib/identification-text';
import { normalizeName } from '../lib/product-text';
import { collectiveService } from '../services/collective.service';
import { identificationService } from '../services/identification.service';
import type { CatalogEntry } from '../types/collective';
import type { IdentificationActionResult, IdentificationCandidate, IdentificationEvent, IdentificationRequest } from '../types/identification';

type Choice = 'link' | 'create' | 'defer';
type ListTab = 'pendientes' | 'identificados';

const CHOICES: { value: Choice; label: string; description: string }[] = [
  { value: 'link', label: 'Ya está en el catálogo', description: 'Identificarlo como un producto que ya existe.' },
  { value: 'create', label: 'Es un producto nuevo', description: 'Crearlo e identificarlo.' },
  { value: 'defer', label: 'Falta información', description: 'Dejarlo pendiente con una nota.' },
];

const MAX_TEXT = 280;
const unchanged = (result: IdentificationActionResult) => 'changed' in result && result.changed === false;
const UNIT_WORD: Record<string, string> = { L: 'litros', KG: 'kilogramos' };
const unitWord = (unit: string) => UNIT_WORD[unit.toUpperCase()] ?? unit;
const unitTitle = (unit: string) => {
  const word = unitWord(unit);
  return word.charAt(0).toUpperCase() + word.slice(1);
};
const SHORT = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtShort = (value: string) => SHORT.format(new Date(value));

/**
 * Catálogo → Por identificar (E1 §6; láminas 23, 24, 47 y el diálogo 33.5).
 * Lista los productos que los agricultores reportaron desde el teléfono y que
 * todavía no corresponden a un producto del catálogo. La Directiva o el
 * Administrador elige una solicitud y decide: identificarla con un producto
 * existente (`link`), crear el producto colectivo (`create-product`) o dejarla
 * pendiente con una nota (`defer`), siempre con motivo y confirmación. En «Ya
 * identificados», «Corregir identificación» usa `link` sobre la solicitud ya
 * identificada (evento `RELINKED`, H-01); no hay «volver a pendiente» (E1-P3).
 *
 * Reglas que no cambian:
 * - Las sugerencias del servidor son sólo sugerencias (RN-29): ninguna viene
 *   elegida y nada se vincula por parecido.
 * - No se muestra quién reportó (E1-D5, H-20): la API no lo envía.
 * - La foto se pide como blob con la sesión, sólo al pulsar «Ver la foto», y
 *   su URL local se revoca al cerrar (E1-D8).
 * - El agricultor confirma el vínculo en su aplicación (E1-D4): la
 *   identificación no cambia su inventario ni sus compras.
 * - «Ya identificados» se consulta al abrirla por primera vez.
 * - Tras cada decisión se avisa al armazón (`notifyIdentificationChanged`, U.5)
 *   para que la insignia «Por identificar» vuelva a contar.
 */
export function ProductIdentificationView({ headingLevel = 1, nav }: { headingLevel?: 1 | 2; nav?: ReactNode }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<IdentificationRequest[] | null>(null);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<ListTab>('pendientes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<IdentificationRequest | null>(null);
  const [linked, setLinked] = useState<IdentificationRequest[] | null>(null);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const linkedRequested = useRef(false);
  const panelRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await identificationService.list('PENDING');
      setRequests(list);
      setError(null);
      return list;
    } catch (err) {
      setError({
        message: collectiveError(err, 'No fue posible cargar los productos por identificar.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
      return null;
    }
  }, []);

  const loadLinked = useCallback(async () => {
    linkedRequested.current = true;
    try {
      setLinked(await identificationService.list('LINKED'));
      setLinkedError(null);
    } catch (err) {
      setLinkedError(collectiveError(err, 'No fue posible cargar los productos identificados.'));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openTab = (next: ListTab) => {
    setTab(next);
    setMessage(null);
    if (next === 'identificados' && !linkedRequested.current) void loadLinked();
  };

  const retry = () => {
    setError(null);
    setRequests(null);
    void load();
  };

  /** Elegir una solicitud lleva el foco a su panel (en teléfono, el panel está debajo de la lista). */
  const focusPanel = () => {
    window.requestAnimationFrame(() => {
      const node = panelRef.current;
      if (!node) return;
      node.scrollIntoView?.({ block: 'start' });
      node.focus({ preventScroll: true });
    });
  };

  const select = (id: string) => {
    setSelectedId(id);
    setMessage(null);
    focusPanel();
  };

  const startCorrection = (request: IdentificationRequest) => {
    setCorrecting(request);
    setMessage(null);
    focusPanel();
  };

  const done = async (text: string) => {
    setMessage(text);
    setCorrecting(null);
    notifyIdentificationChanged();
    const list = await load();
    if (list && selectedId && !list.some((request) => request.id === selectedId)) setSelectedId(null);
    if (linkedRequested.current) await loadLinked();
  };

  const pending = requests ?? [];
  const selected = pending.find((request) => request.id === selectedId) ?? pending[0] ?? null;

  return (
    <div className="space-y-5">
      <ViewHeader
        headingLevel={headingLevel}
        title="Por identificar"
        eyebrow={user?.tenant?.name ? `Catálogo · ${user.tenant.name}` : 'Catálogo'}
        subtitle="Productos que los agricultores reportaron desde el teléfono y no están en el catálogo. Usted propone la identificación y el agricultor confirma el vínculo en su aplicación: hasta entonces, su inventario y sus compras no cambian. Nada se identifica solo por parecido."
      />
      {nav}
      {message && <Notice kind="ok">{message}</Notice>}
      {error && (
        <div className={surfaceClass}>
          <DataState
            compact
            state={error.forbidden ? 'forbidden' : 'error'}
            description={error.message}
            onRetry={error.forbidden ? undefined : retry}
            testId="identification-error"
          />
        </div>
      )}
      {!requests && !error && (
        <div className={surfaceClass}>
          <DataState state="loading" compact testId="identification-loading" />
        </div>
      )}

      {requests && !error && (
        <>
          <SegmentedControl
            label="Lista"
            hideLabel
            testId="identification-tabs"
            value={tab}
            onChange={openTab}
            options={[
              { value: 'pendientes', label: `Pendientes (${requests.length})` },
              { value: 'identificados', label: linked ? `Ya identificados (${linked.length})` : 'Ya identificados' },
            ]}
          />

          {tab === 'pendientes' ? (
            requests.length === 0 ? (
              <div className={surfaceClass}>
                <DataState state="empty" compact title="Nada pendiente" description="No hay productos por identificar." testId="identification-empty" />
              </div>
            ) : (
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
                <div className={`${surfaceClass} min-w-0 p-2`}>
                  <ul className="space-y-1" aria-label="Solicitudes pendientes">
                    {requests.map((request) => (
                      <PendingItem key={request.id} request={request} selected={selected?.id === request.id} onSelect={() => select(request.id)} />
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => openTab('identificados')}
                    className="mt-1 flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 py-3 text-left font-semibold text-ink hover:bg-sunken focus-visible:outline-2"
                  >
                    Ya identificados
                    <Icon d={ICON.chevronRight} className="h-5 w-5" />
                  </button>
                </div>
                {selected && (
                  <section
                    ref={panelRef}
                    tabIndex={-1}
                    aria-label={`Identificar «${selected.local_name}»`}
                    className={`${surfaceClass} min-w-0 scroll-mt-4 px-5 py-6 focus:outline-none focus-visible:outline-2 sm:px-8`}
                    data-testid="identification-panel"
                  >
                    <RequestPanel key={selected.id} request={selected} onDone={(text) => void done(text)} />
                  </section>
                )}
              </div>
            )
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
              <div className={`${surfaceClass} min-w-0 overflow-hidden`} data-testid="identified">
                {linkedError ? (
                  <DataState compact state="error" description={linkedError} onRetry={() => void loadLinked()} />
                ) : !linked ? (
                  <DataState compact state="loading" />
                ) : linked.length === 0 ? (
                  <DataState compact state="empty" title="Ninguno identificado" description="Todavía no se identificó ningún producto reportado." />
                ) : (
                  <ul className="divide-y divide-line" aria-label="Solicitudes identificadas">
                    {linked.map((request) => (
                      <IdentifiedItem key={request.id} request={request} active={correcting?.id === request.id} onCorrect={() => startCorrection(request)} />
                    ))}
                  </ul>
                )}
              </div>
              {correcting && (
                <section
                  ref={panelRef}
                  tabIndex={-1}
                  aria-label="Corregir la identificación"
                  className={`${surfaceClass} min-w-0 scroll-mt-4 px-5 py-6 focus:outline-none focus-visible:outline-2 sm:px-7`}
                  data-testid="correction-panel"
                >
                  <CorrectionPanel key={correcting.id} request={correcting} onCancel={() => setCorrecting(null)} onDone={(text) => void done(text)} />
                </section>
              )}
            </div>
          )}
          <p className="text-sm text-ink-muted">No se muestra qué agricultor envió cada nombre. El motivo y el historial de cada decisión se conservan.</p>
        </>
      )}
    </div>
  );
}

function PendingItem({ request, selected, onSelect }: { request: IdentificationRequest; selected: boolean; onSelect: () => void }) {
  const withPhoto = request.photo.state === 'STORED';
  return (
    <li data-testid={`identification-${request.id}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`flex w-full min-w-0 items-start gap-4 rounded-[20px] px-4 py-3.5 text-left focus-visible:outline-2 ${selected ? 'ui-on-ink bg-ink text-white' : 'text-ink hover:bg-sunken'}`}
      >
        <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control ${selected ? 'bg-lime text-ink' : 'bg-sunken text-ink'}`}>
          <Icon d={withPhoto ? CAMERA_PATH : ICON.archive} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold [overflow-wrap:anywhere]">{request.local_name}</span>
          <span className={`block text-sm ${selected ? 'text-on-ink-muted' : 'text-ink-muted'}`}>
            {unitTitle(request.unit)} · {fmtShort(request.received_at)}
            {withPhoto && ' · con foto'}
          </span>
          {request.pending_note && (
            <span className="mt-1.5 block">
              <Chip tone="attention">Falta información</Chip>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function IdentifiedItem({ request, active, onCorrect }: { request: IdentificationRequest; active: boolean; onCorrect: () => void }) {
  const resolution = request.resolution;
  return (
    <li className={`flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 ${active ? 'bg-lime-soft' : ''}`} data-testid={`identified-${request.id}`}>
      <UnitBadge unit={request.unit} />
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-base font-semibold text-ink [overflow-wrap:anywhere]">«{request.local_name}»</p>
        {resolution ? (
          <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
            Identificado como <span className="font-semibold text-ink">{resolution.product_name}</span> · {fmtDateTime(resolution.resolved_at)}
            {resolution.kind === 'CREATED_PRODUCT' && ' · Producto colectivo creado'}
            {!resolution.is_active && ' · producto inactivo'}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Sin datos de la identificación.</p>
        )}
      </div>
      <Button variant={active ? 'primary' : 'secondary'} size="sm" className="ml-auto" onClick={onCorrect} aria-label={`Corregir la identificación de «${request.local_name}»`}>
        Corregir identificación…
      </Button>
    </li>
  );
}

function photoText(request: IdentificationRequest): string {
  switch (request.photo.state) {
    case 'STORED':
      return 'Con foto de la etiqueta';
    case 'REMOVED':
      return 'Foto retirada';
    default:
      return 'Sin foto';
  }
}

function PendingNote({ note }: { note: { text: string; at: string } }) {
  return (
    <div data-testid="pending-note">
      <Notice kind="warn" compact>
        Pendiente por falta de información: {note.text} <span className="text-xs">({fmtDateTime(note.at)})</span>
      </Notice>
    </div>
  );
}

/** Historial de la solicitud: quién decidió aparece sólo en decisiones institucionales (H-12); nunca quién reportó. */
function History({ requestId }: { requestId: string }) {
  const [history, setHistory] = useState<IdentificationEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setHistory(await identificationService.history(requestId));
      setError(null);
    } catch (err) {
      setError(identificationError(err, 'No fue posible cargar el historial.'));
    }
  }, [requestId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <Collapsible title="Historial" testId="identification-history">
      {error ? (
        <DataState compact state="error" description={error} onRetry={() => void load()} />
      ) : !history ? (
        <DataState compact state="loading" />
      ) : history.length === 0 ? (
        <DataState compact state="empty" title="Sin eventos" description="El servidor no registra eventos para esta solicitud." />
      ) : (
        <ol className="divide-y divide-line" aria-label="Historial de la solicitud">
          {history.map((event, index) => (
            <li key={`${event.at}-${index}`} className="px-5 py-2.5 text-sm" data-testid="history-event">
              <p>
                <span className="font-semibold text-ink">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                <span className="ml-2 text-xs text-ink-muted">{fmtDateTime(event.at)}</span>
                {event.actor && <span className="ml-2 text-xs text-ink-muted">· {event.actor.name}</span>}
              </p>
              {event.product_name && <p className="text-xs text-ink [overflow-wrap:anywhere]">Producto: “{event.product_name}”</p>}
              {event.detail && <p className="text-xs text-ink [overflow-wrap:anywhere]">{event.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </Collapsible>
  );
}

/** Lámina 33.5: la imagen llega como blob con la sesión; su URL local se crea aquí y se revoca al cerrar. */
function PhotoDialog({ request, onClose }: { request: IdentificationRequest; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    identificationService
      .photoBlob(request.id)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch((err: unknown) => {
        if (active) setError(photoError(err));
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [request.id]);

  return (
    <Dialog
      title={request.local_name}
      label={`Foto de «${request.local_name}»`}
      onClose={onClose}
      size="lg"
      hideCloseButton
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <div className="space-y-3">
        {error ? (
          <Notice kind="error">{error}</Notice>
        ) : url ? (
          <img src={url} alt="Foto de la etiqueta reportada" className="max-h-[65dvh] w-full rounded-card border border-line bg-canvas object-contain" />
        ) : (
          <div className="ui-dashed rounded-card bg-canvas">
            <DataState state="loading" compact title="Cargando la foto…" />
          </div>
        )}
        <p className="text-sm leading-relaxed text-ink-muted">
          La envió el agricultor con su consentimiento para ayudar a identificar el producto. La foto se pide al servidor con su sesión y no se guarda en
          este equipo.
        </p>
      </div>
    </Dialog>
  );
}

/** Panel de una solicitud pendiente (láminas 23 y 47). */
function RequestPanel({ request, onDone }: { request: IdentificationRequest; onDone: (text: string) => void }) {
  const [choice, setChoice] = useState<Choice>('link');
  const [target, setTarget] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [candidates, setCandidates] = useState<IdentificationCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    try {
      setCandidates(await identificationService.candidates(request.id));
      setCandidatesError(null);
    } catch (err) {
      setCandidatesError(identificationError(err, 'No fue posible cargar las sugerencias.'));
    }
  }, [request.id]);
  const loadCatalog = useCallback(async () => {
    try {
      const entries = await collectiveService.catalog();
      setCatalog(entries);
      setCatalogError(null);
      return entries;
    } catch (err) {
      setCatalogError(collectiveError(err, 'No fue posible cargar el catálogo.'));
      return null;
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadCandidates(), loadCatalog()]));
  }, [loadCandidates, loadCatalog]);

  const switchChoice = (next: Choice) => {
    setChoice(next);
    setActionError(null);
  };

  /** 409 `PRODUCT_NAME_TAKEN`: se pasa a «Ya está en el catálogo», con el producto existente elegido si es vinculable. */
  const nameTaken = async (name: string) => {
    setChoice('link');
    setActionError(PRODUCT_NAME_TAKEN_TEXT);
    const entries = await loadCatalog();
    const existing = entries?.find((entry) => normalizeName(entry.product_name) === normalizeName(name));
    if (existing && existing.is_active && existing.base_unit === request.base_unit) setTarget(existing.product_ref);
  };

  const sameDimension = (catalog ?? []).filter((entry) => entry.base_unit === request.base_unit && entry.is_active);
  const targetName =
    candidates?.find((candidate) => candidate.product_ref === target)?.product_name ?? catalog?.find((entry) => entry.product_ref === target)?.product_name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <Overline as="p">El agricultor lo llamó</Overline>
          <h2 className="mt-1 font-display text-3xl font-extrabold leading-tight text-ink [overflow-wrap:anywhere] sm:text-4xl">«{request.local_name}»</h2>
          <Facts
            className="mt-4"
            rows={[
              ['Ingrediente activo', request.active_ingredient ?? 'Sin dato'],
              ['Se mide en', unitWord(request.unit)],
              ['Recibido', fmtDateTime(request.received_at)],
              ['Foto', photoText(request)],
            ]}
          />
        </div>
        <PhotoFrame request={request} onOpen={() => setShowPhoto(true)} />
      </div>
      {request.pending_note && <PendingNote note={request.pending_note} />}

      <div className="space-y-5 border-t border-line pt-5">
        <div className="lg:[&_fieldset>div]:grid lg:[&_fieldset>div]:grid-cols-3">
          <RadioCards legend={<span className="font-display text-xl font-bold">¿Qué es este producto?</span>} name={`choice-${request.id}`} options={CHOICES} value={choice} onChange={switchChoice} />
        </div>

        {actionError && <Notice kind="error">{actionError}</Notice>}

        {choice === 'link' && (
          <LinkPanel
            request={request}
            candidates={candidates}
            candidatesError={candidatesError}
            onRetryCandidates={() => void loadCandidates()}
            catalog={sameDimension}
            catalogLoaded={catalog !== null}
            catalogError={catalogError}
            onRetryCatalog={() => void loadCatalog()}
            target={target}
            targetName={targetName}
            onTarget={setTarget}
            onError={setActionError}
            onDone={onDone}
          />
        )}
        {choice === 'create' && (
          <CreatePanel
            request={request}
            catalog={catalog ?? []}
            onUseExisting={(entry) => {
              switchChoice('link');
              setTarget(entry.product_ref);
            }}
            onNameTaken={(name) => void nameTaken(name)}
            onError={setActionError}
            onDone={onDone}
          />
        )}
        {choice === 'defer' && <DeferPanel request={request} onError={setActionError} onDone={onDone} />}
      </div>

      <p className="text-sm text-ink-muted">
        Esta es la identificación del sindicato. El agricultor confirma el vínculo en su aplicación; hasta entonces, su inventario y sus compras no
        cambian. No se muestra quién lo reportó.
      </p>
      <History requestId={request.id} />
      {showPhoto && <PhotoDialog request={request} onClose={() => setShowPhoto(false)} />}
    </div>
  );
}

/** Recuadro de la foto: la imagen no se pide hasta pulsar «Ver la foto» (diálogo 33.5). */
function PhotoFrame({ request, onOpen }: { request: IdentificationRequest; onOpen: () => void }) {
  const stored = request.photo.state === 'STORED';
  return (
    <div className="ui-dashed flex min-h-40 w-full shrink-0 flex-col items-center justify-center gap-3 rounded-card bg-canvas px-5 py-5 text-center sm:w-64">
      <Icon d={CAMERA_PATH} className="h-7 w-7 text-ink-muted" />
      {stored ? (
        <>
          <p className="text-sm text-ink-muted">El agricultor envió una foto de la etiqueta.</p>
          <Button variant="secondary" size="sm" onClick={onOpen}>
            Ver la foto
          </Button>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{request.photo.state === 'REMOVED' ? 'La foto fue retirada.' : 'El agricultor no envió una foto.'}</p>
      )}
    </div>
  );
}

interface ActionProps {
  request: IdentificationRequest;
  onError: (message: string | null) => void;
  onDone: (text: string) => void;
}

/** Motivo (o nota) y casilla de confirmación, obligatorios en las tres decisiones; el botón espera a los dos (H-16). */
function ReasonConfirmSubmit({
  id,
  label,
  text,
  onText,
  confirmed,
  onConfirmed,
  confirmText,
  submitLabel,
  ready,
  busy,
  onSubmit,
  onCancel,
}: {
  id: string;
  label: string;
  text: string;
  onText: (value: string) => void;
  confirmed: boolean;
  onConfirmed: (value: boolean) => void;
  confirmText: ReactNode;
  submitLabel: string;
  ready: boolean;
  busy: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <>
      <Textarea
        id={id}
        label={label}
        maxLength={MAX_TEXT}
        value={text}
        onChange={(event) => onText(event.target.value)}
        help={`Obligatorio. Queda en el historial y en la bitácora. ${text.length} de ${MAX_TEXT} caracteres.`}
        disabled={busy}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Checkbox label={confirmText} checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} disabled={busy} className="min-w-0" />
        <div className="flex flex-col-reverse gap-2 sm:shrink-0 sm:flex-row">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
          )}
          <Button size="lg" onClick={onSubmit} disabled={!ready} busy={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

function LinkPanel({
  request,
  candidates,
  candidatesError,
  onRetryCandidates,
  catalog,
  catalogLoaded,
  catalogError,
  onRetryCatalog,
  target,
  targetName,
  onTarget,
  onError,
  onDone,
}: ActionProps & {
  candidates: IdentificationCandidate[] | null;
  candidatesError: string | null;
  onRetryCandidates: () => void;
  /** Catálogo activo de la misma dimensión. */
  catalog: CatalogEntry[];
  catalogLoaded: boolean;
  catalogError: string | null;
  onRetryCatalog: () => void;
  target: string;
  targetName: string | null;
  onTarget: (ref: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const wanted = normalizeName(query);
  const shown = catalog.filter((entry) => !wanted || normalizeName(entry.product_name).includes(wanted) || entry.product_ref === target);
  const ready = Boolean(target && targetName) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !targetName) return;
    setBusy(true);
    onError(null);
    try {
      const result = await identificationService.link(request.id, { product_ref: target, reason: reason.trim(), confirmed: true });
      onDone(
        unchanged(result)
          ? `“${request.local_name}” ya estaba vinculado con “${targetName}”; no cambió nada.`
          : `“${request.local_name}” vinculado con “${targetName}”. La decisión queda en la bitácora.`,
      );
    } catch (err) {
      onError(identificationError(err, 'No fue posible guardar el vínculo.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink">Parecidos en el catálogo</legend>
        <p className="mb-2 text-sm text-ink-muted" data-testid="candidates-disclaimer">
          Sugerencias por parecido del nombre; la decisión es suya.
        </p>
        {candidatesError ? (
          <DataState compact state="error" description={candidatesError} onRetry={onRetryCandidates} />
        ) : !candidates ? (
          <DataState compact state="loading" />
        ) : candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin sugerencias" description="El servidor no encontró productos parecidos de la misma dimensión. Puede buscar en el catálogo." />
        ) : (
          <ul className="space-y-2.5">
            {candidates.map((candidate) => {
              const checked = target === candidate.product_ref;
              return (
                <li key={candidate.product_ref} data-testid={`candidate-${candidate.product_ref}`}>
                  <label
                    className={`flex items-start gap-3 rounded-[18px] bg-surface px-4 py-3 ${checked ? 'border-2 border-ink' : 'border border-line'} ${
                      candidate.is_active ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`identification-candidate-${request.id}`}
                      className="mt-1 h-5 w-5 shrink-0 accent-ink"
                      value={candidate.product_ref}
                      checked={checked}
                      disabled={!candidate.is_active || busy}
                      onChange={() => onTarget(candidate.product_ref)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{candidate.product_name}</span>
                        <span data-similarity={candidate.similarity}>
                          <Chip tone={candidate.similarity === 'ALTA' ? 'positive' : 'neutral'}>{SIMILARITY_LABEL[candidate.similarity] ?? candidate.similarity}</Chip>
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {unitWord(candidate.unit)}
                        {candidate.matched_on.length > 0 && ` · Coincide en ${candidate.matched_on.map((field) => MATCHED_ON_LABEL[field] ?? field).join(' y ')}.`}
                        {candidate.is_alias && ' Es una denominación asociada a otro producto.'}
                        {!candidate.is_active && ' Producto inactivo: no se puede vincular.'}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="space-y-3">
        <SearchInput
          id={`identification-search-${request.id}`}
          label={`Buscar en el catálogo (${request.unit === 'KG' ? 'masa' : 'volumen'})`}
          value={query}
          onChange={setQuery}
          placeholder="Buscar otro producto del catálogo"
          autoComplete="off"
          className="bg-field"
        />
        {catalogError ? (
          <DataState compact state="error" description={catalogError} onRetry={onRetryCatalog} />
        ) : (
          <Select
            id={`identification-product-${request.id}`}
            label="Producto del catálogo"
            value={shown.some((entry) => entry.product_ref === target) ? target : ''}
            disabled={!catalogLoaded || busy}
            onChange={(event) => onTarget(event.target.value)}
            help={`Sólo aparecen productos activos en ${unitWord(request.unit)}.`}
          >
            <option value="">{catalogLoaded ? 'Seleccione…' : 'Cargando…'}</option>
            {shown.map((entry) => (
              <option key={entry.product_ref} value={entry.product_ref}>
                {entry.product_name} ({entry.unit})
              </option>
            ))}
          </Select>
        )}
      </div>

      <ReasonConfirmSubmit
        id={`identification-link-reason-${request.id}`}
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={targetName ? `Confirmo que «${request.local_name}» es «${targetName}».` : 'Confirmo que es el mismo producto.'}
        submitLabel="Confirmar identificación"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

/**
 * Crear el producto colectivo e identificar, en una sola operación del
 * servidor (`create-product`). No usa `ProductForm`: ése crea con
 * `/inventory/products` sin vincular, y el contrato pide crear y vincular a la
 * vez, con motivo y confirmación. Unidad fija: la de la solicitud.
 */
function CreatePanel({
  request,
  catalog,
  onUseExisting,
  onNameTaken,
  onError,
  onDone,
}: ActionProps & {
  catalog: CatalogEntry[];
  onUseExisting: (entry: CatalogEntry) => void;
  onNameTaken: (name: string) => void;
}) {
  const [name, setName] = useState(request.local_name);
  const [ingredient, setIngredient] = useState(request.active_ingredient ?? '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const clash = trimmed ? catalog.find((entry) => normalizeName(entry.product_name) === normalizeName(trimmed)) ?? null : null;
  const linkable = clash !== null && clash.is_active && clash.base_unit === request.base_unit;
  const ready = trimmed.length >= 2 && trimmed.length <= 160 && !clash && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    onError(null);
    try {
      await identificationService.createProduct(request.id, {
        name: trimmed,
        active_ingredient: ingredient.trim() || null,
        reason: reason.trim(),
        confirmed: true,
      });
      onDone(`Se creó el producto colectivo “${trimmed}” y “${request.local_name}” quedó vinculado con él. La decisión queda en la bitácora.`);
    } catch (err) {
      setBusy(false);
      if (identificationErrorCode(err) === 'PRODUCT_NAME_TAKEN') onNameTaken(trimmed);
      else onError(identificationError(err, 'No fue posible crear el producto colectivo.'));
    }
  };

  return (
    <div className="space-y-5">
      <TextInput
        id={`identification-new-name-${request.id}`}
        label="Nombre del producto colectivo"
        value={name}
        maxLength={160}
        autoComplete="off"
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
        error={
          clash ? (
            <span role="alert">
              Ya existe “{clash.product_name}”{clash.is_active ? '' : ' (inactivo)'} en el catálogo del sindicato.{' '}
              {linkable ? (
                <button type="button" className="font-semibold text-link underline underline-offset-2" onClick={() => onUseExisting(clash)}>
                  Vincular con “{clash.product_name}”
                </button>
              ) : (
                'Elija otro nombre.'
              )}
            </span>
          ) : undefined
        }
      />
      <TextInput
        id={`identification-new-ingredient-${request.id}`}
        label="Ingrediente activo"
        optional
        value={ingredient}
        maxLength={120}
        autoComplete="off"
        onChange={(event) => setIngredient(event.target.value)}
        disabled={busy}
      />
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink" data-testid="identification-unit-locked">
        <Icon d={ICON.lock} className="h-4 w-4" />
        Unidad: <span className="font-semibold">{request.unit}</span>
        <span className="text-ink-muted">({unitWord(request.unit)}, la de la solicitud; no se cambia)</span>
      </p>
      <ReasonConfirmSubmit
        id={`identification-create-reason-${request.id}`}
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={`Confirmo que se crea «${trimmed || '…'}» en ${unitWord(request.unit)} y que «${request.local_name}» queda identificado con él.`}
        submitLabel="Crear e identificar"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

function DeferPanel({ request, onError, onDone }: ActionProps) {
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = note.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    onError(null);
    try {
      await identificationService.defer(request.id, { note: note.trim(), confirmed: true });
      onDone(`“${request.local_name}” sigue pendiente por falta de información. La nota queda en la bitácora.`);
    } catch (err) {
      onError(identificationError(err, 'No fue posible guardar la nota.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ReasonConfirmSubmit
        id={`identification-defer-note-${request.id}`}
        label="Nota"
        text={note}
        onText={setNote}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText="Confirmo que sigue pendiente. El agricultor verá la nota en su teléfono."
        submitLabel="Dejar pendiente"
        ready={ready}
        busy={busy}
        onSubmit={() => void submit()}
      />
    </div>
  );
}

/** Lámina 24: «Corregir la identificación» de una solicitud ya identificada (`link` → `RELINKED`). */
function CorrectionPanel({ request, onCancel, onDone }: { request: IdentificationRequest; onCancel: () => void; onDone: (text: string) => void }) {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalog(await collectiveService.catalog());
      setCatalogError(null);
    } catch (err) {
      setCatalogError(collectiveError(err, 'No fue posible cargar el catálogo.'));
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(loadCatalog);
  }, [loadCatalog]);

  const options = (catalog ?? []).filter((entry) => entry.base_unit === request.base_unit && entry.is_active);
  const targetName = options.find((entry) => entry.product_ref === target)?.product_name ?? null;
  const current = request.resolution?.product_ref === target;
  const ready = Boolean(targetName) && reason.trim().length > 0 && confirmed && !busy;

  const submit = async () => {
    if (!ready || !targetName) return;
    setBusy(true);
    setError(null);
    try {
      const result = await identificationService.link(request.id, { product_ref: target, reason: reason.trim(), confirmed: true });
      onDone(
        unchanged(result)
          ? `“${request.local_name}” ya estaba vinculado con “${targetName}”; no cambió nada.`
          : `“${request.local_name}” vinculado con “${targetName}”. La decisión queda en la bitácora.`,
      );
    } catch (err) {
      setError(identificationError(err, 'No fue posible guardar la corrección.'));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold text-ink">Corregir la identificación</h2>
      <Facts
        rows={[
          ['Nombre enviado', `«${request.local_name}»`],
          ['Identificado como', request.resolution?.product_name ?? '—'],
          ['Unidad', unitTitle(request.unit)],
        ]}
      />
      {catalogError ? (
        <DataState compact state="error" description={catalogError} onRetry={() => void loadCatalog()} />
      ) : (
        <Select
          id={`correction-product-${request.id}`}
          label="Producto correcto"
          value={target}
          disabled={catalog === null || busy}
          onChange={(event) => setTarget(event.target.value)}
          help={`Sólo aparecen productos activos en ${unitWord(request.unit)}.`}
        >
          <option value="">{catalog === null ? 'Cargando…' : 'Seleccione…'}</option>
          {options.map((entry) => (
            <option key={entry.product_ref} value={entry.product_ref}>
              {entry.product_name} ({entry.unit})
            </option>
          ))}
        </Select>
      )}
      {target && targetName && current && (
        <Notice kind="info" compact>
          «{targetName}» es la identificación vigente: guardar no cambia nada.
        </Notice>
      )}
      <Textarea
        id={`correction-reason-${request.id}`}
        label="Motivo"
        maxLength={MAX_TEXT}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        help="Obligatorio. Queda en el historial."
        disabled={busy}
      />
      <p className="text-base leading-relaxed text-ink-muted">
        Corrige la identificación que hizo el sindicato. No cambia por sí sola el inventario, las compras ni los vínculos del agricultor en su
        aplicación: el vínculo lo confirma él.
      </p>
      <Checkbox label="Confirmo el cambio. Las cifras ya selladas no se modifican." checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={!ready} busy={busy}>
          Guardar corrección
        </Button>
      </div>
      <History requestId={request.id} />
    </div>
  );
}
