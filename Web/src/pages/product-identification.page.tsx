import axios from 'axios';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/app-shell';
import {
  Button,
  Collapsible,
  DataState,
  inputClass,
  labelClass,
  Notice,
  PageHeader,
  Section,
  SegmentedControl,
} from '../components/ui';
import { collectiveError, fmtDateTime } from '../lib/collective-text';
import {
  EVENT_LABEL,
  identificationError,
  identificationErrorCode,
  MATCHED_ON_LABEL,
  photoError,
  PRODUCT_NAME_TAKEN_TEXT,
  RESOLUTION_LABEL,
  SIMILARITY_LABEL,
} from '../lib/identification-text';
import { normalizeName } from '../lib/product-text';
import { collectiveService } from '../services/collective.service';
import { identificationService } from '../services/identification.service';
import type { CatalogEntry } from '../types/collective';
import type { IdentificationActionResult, IdentificationCandidate, IdentificationEvent, IdentificationRequest } from '../types/identification';

type Tab = 'link' | 'create' | 'defer';

const TABS: { value: Tab; label: string }[] = [
  { value: 'link', label: 'Vincular' },
  { value: 'create', label: 'Crear producto colectivo' },
  { value: 'defer', label: 'Dejar pendiente' },
];

const MAX_TEXT = 280;
const unchanged = (result: IdentificationActionResult) => 'changed' in result && result.changed === false;

/**
 * E1 §6 (RF-33, RF-34, CU-18): «Por identificar», tercera vista del contenedor
 * «Catálogo y equivalencias» (`?vista=identificacion`). Lista los productos
 * que los agricultores reportaron desde el teléfono y que todavía no
 * corresponden a un producto del catálogo; la Directiva o el Administrador
 * decide vincularlos, crear un producto colectivo o dejarlos pendientes, con
 * motivo y confirmación. Las sugerencias del servidor son sólo sugerencias
 * (RN-29): nada se vincula por parecido. La vista nunca muestra quién reportó
 * (E1-D5): la API no lo envía. La foto se pide como blob con la sesión y su
 * URL local se revoca al cerrar.
 */
export function ProductIdentificationView({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const [requests, setRequests] = useState<IdentificationRequest[] | null>(null);
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ request: IdentificationRequest; tab: Tab } | null>(null);
  const [photoOf, setPhotoOf] = useState<IdentificationRequest | null>(null);
  const [linked, setLinked] = useState<IdentificationRequest[] | null>(null);
  const [linkedError, setLinkedError] = useState<string | null>(null);
  const linkedRequested = useRef(false);
  const identifiedRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await identificationService.list('PENDING');
      setRequests(list);
      setError(null);
    } catch (err) {
      setError({
        message: collectiveError(err, 'No fue posible cargar los productos por identificar.'),
        forbidden: axios.isAxiosError(err) && err.response?.status === 403,
      });
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

  // «Identificadas» se consulta sólo al abrirla por primera vez (el evento `toggle` no burbujea: se escucha en captura).
  useEffect(() => {
    const node = identifiedRef.current;
    if (!node) return;
    const onToggle = (event: Event) => {
      if ((event.target as HTMLDetailsElement).open && !linkedRequested.current) void loadLinked();
    };
    node.addEventListener('toggle', onToggle, true);
    return () => node.removeEventListener('toggle', onToggle, true);
  }, [loadLinked, requests]);

  const retry = () => {
    setError(null);
    setRequests(null);
    void load();
  };

  const done = async (text: string) => {
    setDialog(null);
    setMessage(text);
    await load();
    if (linkedRequested.current) await loadLinked();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        headingLevel={headingLevel}
        title="Productos por identificar"
        subtitle="Productos que los agricultores reportaron desde el teléfono y que todavía no corresponden a un producto del catálogo. Usted decide si se vinculan con uno existente, si se crea un producto colectivo o si quedan pendientes; nada se vincula automáticamente. No se muestra quién reportó cada producto."
      />
      {message && <Notice kind="ok">{message}</Notice>}
      {error && (
        <Section>
          <DataState
            compact
            state={error.forbidden ? 'forbidden' : 'error'}
            description={error.message}
            onRetry={error.forbidden ? undefined : retry}
            testId="identification-error"
          />
        </Section>
      )}
      {!requests && !error && (
        <Section>
          <DataState state="loading" compact testId="identification-loading" />
        </Section>
      )}

      {requests && !error && (
        <>
          <Section label="Solicitudes pendientes" title="Pendientes de identificar" note={pendingNote(requests.length)}>
            {requests.length === 0 ? (
              <DataState state="empty" compact title="Nada pendiente" description="No hay productos por identificar." testId="identification-empty" />
            ) : (
              <ul className="divide-y divide-slate-100" aria-label="Solicitudes pendientes">
                {requests.map((request) => (
                  <li key={request.id} className="px-5 py-4" data-testid={`identification-${request.id}`}>
                    <h3 className="text-base font-semibold text-slate-900 [overflow-wrap:anywhere]">{request.local_name}</h3>
                    <RequestFacts request={request} />
                    {request.pending_note && <PendingNote note={request.pending_note} />}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.photo.state === 'STORED' && (
                        <Button variant="secondary" size="sm" onClick={() => setPhotoOf(request)}>
                          Ver foto
                        </Button>
                      )}
                      {TABS.map((tab) => (
                        <Button key={tab.value} variant="secondary" size="sm" onClick={() => setDialog({ request, tab: tab.value })}>
                          {tab.label}…
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div ref={identifiedRef}>
            <Collapsible title="Identificadas" testId="identified">
              {linkedError ? (
                <DataState compact state="error" description={linkedError} onRetry={() => void loadLinked()} />
              ) : !linked ? (
                <DataState compact state="loading" />
              ) : linked.length === 0 ? (
                <DataState compact state="empty" title="Ninguna identificada" description="Todavía no se identificó ningún producto reportado." />
              ) : (
                <ul className="divide-y divide-slate-100" aria-label="Solicitudes identificadas">
                  {linked.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid={`identified-${request.id}`}>
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
                          {request.local_name} → {request.resolution?.product_name ?? '—'}
                          {request.resolution && <span className="ml-2 text-xs font-normal text-slate-500">{request.resolution.unit}</span>}
                        </p>
                        {request.resolution && (
                          <p className="text-xs text-slate-600">
                            {RESOLUTION_LABEL[request.resolution.kind] ?? request.resolution.kind} · {fmtDateTime(request.resolution.resolved_at)}
                            {!request.resolution.is_active && ' · producto inactivo'}
                          </p>
                        )}
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setDialog({ request, tab: 'link' })}>
                        Corregir vínculo…
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Collapsible>
          </div>
        </>
      )}

      {dialog && (
        <IdentificationDialog
          request={dialog.request}
          initialTab={dialog.tab}
          onClose={() => setDialog(null)}
          onDone={(text) => void done(text)}
        />
      )}
      {photoOf && <PhotoDialog request={photoOf} onClose={() => setPhotoOf(null)} />}
    </div>
  );
}

function pendingNote(count: number): string {
  if (count === 0) return 'Cuando un agricultor reporte un producto sin equivalente en el catálogo, aparecerá aquí.';
  return `${count} ${count === 1 ? 'producto reportado' : 'productos reportados'}, del más antiguo al más reciente.`;
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

function RequestFacts({ request }: { request: IdentificationRequest }) {
  const facts: [string, ReactNode][] = [
    ['Ingrediente activo', request.active_ingredient ?? 'Sin dato'],
    ['Unidad', request.unit],
    ['Recibida', fmtDateTime(request.received_at)],
    ['Foto', photoText(request)],
  ];
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {facts.map(([term, value]) => (
        <div key={term} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-slate-500">{term}:</dt>
          <dd className="min-w-0 text-slate-800 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PendingNote({ note }: { note: { text: string; at: string } }) {
  return (
    <div className="mt-2" data-testid="pending-note">
      <Notice kind="info" compact>
        Pendiente por falta de información: {note.text} <span className="text-xs text-slate-600">({fmtDateTime(note.at)})</span>
      </Notice>
    </div>
  );
}

/** La imagen llega como blob con la sesión; su URL local se crea aquí y se revoca al cerrar. */
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
    <Modal title={`Foto de «${request.local_name}»`} onClose={onClose} size="lg">
      <div className="space-y-3">
        {error ? (
          <Notice kind="error">{error}</Notice>
        ) : url ? (
          <img src={url} alt="Foto de la etiqueta reportada" className="max-h-[70dvh] w-full rounded-control border border-line object-contain" />
        ) : (
          <DataState state="loading" compact />
        )}
        <p className="text-xs text-slate-600">
          La envió el agricultor con su consentimiento para ayudar a identificar el producto. No se guarda en este navegador.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function IdentificationDialog({
  request,
  initialTab,
  onClose,
  onDone,
}: {
  request: IdentificationRequest;
  initialTab: Tab;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const correcting = request.status === 'LINKED';
  const [tab, setTab] = useState<Tab>(correcting ? 'link' : initialTab);
  const [target, setTarget] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<IdentificationCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [history, setHistory] = useState<IdentificationEvent[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
  const loadHistory = useCallback(async () => {
    try {
      setHistory(await identificationService.history(request.id));
      setHistoryError(null);
    } catch (err) {
      setHistoryError(identificationError(err, 'No fue posible cargar el historial.'));
    }
  }, [request.id]);

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([loadCandidates(), loadCatalog(), loadHistory()]));
  }, [loadCandidates, loadCatalog, loadHistory]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setActionError(null);
  };

  /** 409 `PRODUCT_NAME_TAKEN`: se pasa a «Vincular», con el producto existente elegido si es vinculable. */
  const nameTaken = async (name: string) => {
    setTab('link');
    setActionError(PRODUCT_NAME_TAKEN_TEXT);
    const entries = await loadCatalog();
    const existing = entries?.find((entry) => normalizeName(entry.product_name) === normalizeName(name));
    if (existing && existing.is_active && existing.base_unit === request.base_unit) setTarget(existing.product_ref);
  };

  const sameDimension = (catalog ?? []).filter((entry) => entry.base_unit === request.base_unit && entry.is_active);
  const targetName =
    candidates?.find((candidate) => candidate.product_ref === target)?.product_name ??
    catalog?.find((entry) => entry.product_ref === target)?.product_name ??
    null;

  return (
    <Modal title={correcting ? `Corregir el vínculo de «${request.local_name}»` : `Identificar «${request.local_name}»`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="rounded-control border border-slate-200 bg-slate-50 px-3 py-2">
          <RequestFacts request={request} />
          {request.resolution && (
            <p className="mt-2 text-sm text-slate-700">
              Vinculada con <span className="font-semibold">“{request.resolution.product_name}”</span> el {fmtDateTime(request.resolution.resolved_at)}.
            </p>
          )}
          {request.pending_note && <PendingNote note={request.pending_note} />}
        </div>

        {!correcting && <SegmentedControl label="Acción" options={TABS} value={tab} onChange={switchTab} testId="identification-action" />}

        {actionError && <Notice kind="error">{actionError}</Notice>}

        {tab === 'link' && (
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
            onClose={onClose}
            onDone={onDone}
          />
        )}
        {tab === 'create' && (
          <CreatePanel
            request={request}
            catalog={catalog ?? []}
            onUseExisting={(entry) => {
              switchTab('link');
              setTarget(entry.product_ref);
            }}
            onNameTaken={(name) => void nameTaken(name)}
            onError={setActionError}
            onClose={onClose}
            onDone={onDone}
          />
        )}
        {tab === 'defer' && <DeferPanel request={request} onError={setActionError} onClose={onClose} onDone={onDone} />}

        <Collapsible title="Historial" testId="identification-history">
          {historyError ? (
            <DataState compact state="error" description={historyError} onRetry={() => void loadHistory()} />
          ) : !history ? (
            <DataState compact state="loading" />
          ) : history.length === 0 ? (
            <DataState compact state="empty" title="Sin eventos" description="El servidor no registra eventos para esta solicitud." />
          ) : (
            <ol className="divide-y divide-slate-100" aria-label="Historial de la solicitud">
              {history.map((event, index) => (
                <li key={`${event.at}-${index}`} className="px-5 py-2 text-sm" data-testid="history-event">
                  <p>
                    <span className="font-semibold text-slate-900">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                    <span className="ml-2 text-xs text-slate-600">{fmtDateTime(event.at)}</span>
                    {event.actor && <span className="ml-2 text-xs text-slate-600">· {event.actor.name}</span>}
                  </p>
                  {event.product_name && <p className="text-xs text-slate-700 [overflow-wrap:anywhere]">Producto: “{event.product_name}”</p>}
                  {event.detail && <p className="text-xs text-slate-700 [overflow-wrap:anywhere]">{event.detail}</p>}
                </li>
              ))}
            </ol>
          )}
        </Collapsible>
      </div>
    </Modal>
  );
}

interface PanelProps {
  request: IdentificationRequest;
  onError: (message: string | null) => void;
  onClose: () => void;
  onDone: (text: string) => void;
}

/** Motivo (o nota) y casilla de confirmación, obligatorios en las tres acciones. */
function ReasonAndConfirm({
  id,
  label,
  text,
  onText,
  confirmed,
  onConfirmed,
  confirmText,
}: {
  id: string;
  label: string;
  text: string;
  onText: (value: string) => void;
  confirmed: boolean;
  onConfirmed: (value: boolean) => void;
  confirmText: ReactNode;
}) {
  return (
    <>
      <div>
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
        <textarea id={id} className={inputClass} maxLength={MAX_TEXT} value={text} onChange={(event) => onText(event.target.value)} aria-describedby={`${id}-count`} />
        <p id={`${id}-count`} className="mt-1 text-xs text-slate-500">
          {text.length} de {MAX_TEXT} caracteres. Queda en el historial y en la bitácora.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 shrink-0" checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />
        <span className="min-w-0 [overflow-wrap:anywhere]">{confirmText}</span>
      </label>
    </>
  );
}

function Actions({ onClose, submit, label, disabled }: { onClose: () => void; submit: () => void; label: string; disabled: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>
        Cancelar
      </Button>
      <Button onClick={submit} disabled={disabled}>
        {label}
      </Button>
    </div>
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
  onClose,
  onDone,
}: PanelProps & {
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
  const current = request.resolution?.product_ref === target;
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
    <div className="space-y-4">
      <fieldset>
        <legend className={labelClass}>Sugerencias del servidor</legend>
        <p className="mb-2 text-xs text-slate-600" data-testid="candidates-disclaimer">
          Sugerencias por parecido del nombre; la decisión es suya.
        </p>
        {candidatesError ? (
          <DataState compact state="error" description={candidatesError} onRetry={onRetryCandidates} />
        ) : !candidates ? (
          <DataState compact state="loading" />
        ) : candidates.length === 0 ? (
          <DataState compact state="empty" title="Sin sugerencias" description="El servidor no encontró productos parecidos de la misma dimensión. Puede buscar en el catálogo." />
        ) : (
          <ul className="space-y-2">
            {candidates.map((candidate) => (
              <li key={candidate.product_ref} data-testid={`candidate-${candidate.product_ref}`}>
                <label className={`flex items-start gap-2 rounded-control border border-slate-200 px-3 py-2 text-sm ${candidate.is_active ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input
                    type="radio"
                    name="identification-candidate"
                    className="mt-1 shrink-0"
                    value={candidate.product_ref}
                    checked={target === candidate.product_ref}
                    disabled={!candidate.is_active}
                    onChange={() => onTarget(candidate.product_ref)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{candidate.product_name}</span>
                    <span className="ml-2 text-xs text-slate-500">{candidate.unit}</span>
                    <span className="ml-2 inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-500/25" data-similarity={candidate.similarity}>
                      {SIMILARITY_LABEL[candidate.similarity] ?? candidate.similarity}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {candidate.matched_on.length > 0 && `Coincide en ${candidate.matched_on.map((field) => MATCHED_ON_LABEL[field] ?? field).join(' y ')}.`}
                      {candidate.is_alias && ' Es una denominación asociada a otro producto.'}
                      {!candidate.is_active && ' Producto inactivo: no se puede vincular.'}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div>
        <label className={labelClass} htmlFor="identification-search">
          Buscar en el catálogo ({request.unit === 'KG' ? 'masa' : 'volumen'})
        </label>
        <input
          id="identification-search"
          type="search"
          autoComplete="off"
          className={inputClass}
          value={query}
          placeholder="Nombre del producto"
          onChange={(event) => setQuery(event.target.value)}
        />
        {catalogError ? (
          <div className="mt-2">
            <DataState compact state="error" description={catalogError} onRetry={onRetryCatalog} />
          </div>
        ) : (
          <>
            <label className={`${labelClass} mt-2`} htmlFor="identification-product">
              Producto del catálogo
            </label>
            <select id="identification-product" className={inputClass} value={shown.some((entry) => entry.product_ref === target) ? target : ''} disabled={!catalogLoaded} onChange={(event) => onTarget(event.target.value)}>
              <option value="">{catalogLoaded ? 'Seleccione…' : 'Cargando…'}</option>
              {shown.map((entry) => (
                <option key={entry.product_ref} value={entry.product_ref}>
                  {entry.product_name} ({entry.unit})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-600">Sólo productos activos de la misma dimensión que la unidad reportada ({request.unit}).</p>
          </>
        )}
      </div>

      {target && targetName && current && <Notice kind="info" compact>“{targetName}” es el vínculo vigente: guardar no cambia nada.</Notice>}

      <ReasonAndConfirm
        id="identification-link-reason"
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={
          targetName
            ? `Confirmo que “${request.local_name}” corresponde a “${targetName}”. El agricultor verá la identificación y decidirá en su teléfono si vincula su producto.`
            : 'Confirmo el vínculo con el producto elegido. El agricultor verá la identificación y decidirá en su teléfono si vincula su producto.'
        }
      />
      <Actions onClose={onClose} submit={() => void submit()} label={busy ? 'Guardando…' : 'Confirmar vínculo'} disabled={!ready} />
    </div>
  );
}

/**
 * Crear el producto colectivo y vincular, en una sola operación del servidor
 * (`create-product`). No usa `ProductForm`: ése crea con `/inventory/products`
 * sin vincular, y el contrato pide crear y vincular a la vez, con motivo y
 * confirmación. Unidad fija: la de la solicitud.
 */
function CreatePanel({
  request,
  catalog,
  onUseExisting,
  onNameTaken,
  onError,
  onClose,
  onDone,
}: PanelProps & {
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
    <div className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="identification-new-name">
          Nombre del producto colectivo
        </label>
        <input
          id="identification-new-name"
          className={inputClass}
          value={name}
          maxLength={160}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={clash ? true : undefined}
          aria-describedby={clash ? 'identification-new-name-clash' : undefined}
        />
        {clash && (
          <div id="identification-new-name-clash" className="mt-1.5 text-xs font-semibold text-red-700" role="alert">
            Ya existe “{clash.product_name}”{clash.is_active ? '' : ' (inactivo)'} en el catálogo del sindicato.{' '}
            {linkable ? (
              <button type="button" className="font-semibold text-brand-800 underline underline-offset-2" onClick={() => onUseExisting(clash)}>
                Vincular con “{clash.product_name}”
              </button>
            ) : (
              'Elija otro nombre.'
            )}
          </div>
        )}
      </div>
      <div>
        <label className={labelClass} htmlFor="identification-new-ingredient">
          Ingrediente activo (opcional)
        </label>
        <input id="identification-new-ingredient" className={inputClass} value={ingredient} maxLength={120} autoComplete="off" onChange={(event) => setIngredient(event.target.value)} />
      </div>
      <p className="text-sm text-slate-700" data-testid="identification-unit-locked">
        Unidad: <span className="font-semibold">{request.unit}</span>
        <span className="ml-2 text-xs text-slate-500">La de la solicitud; no se cambia.</span>
      </p>
      <ReasonAndConfirm
        id="identification-create-reason"
        label="Motivo"
        text={reason}
        onText={setReason}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText={`Confirmo que se crea el producto colectivo “${trimmed || '…'}” en ${request.unit} y que “${request.local_name}” queda vinculado con él.`}
      />
      <Actions onClose={onClose} submit={() => void submit()} label={busy ? 'Guardando…' : 'Crear y vincular'} disabled={!ready} />
    </div>
  );
}

function DeferPanel({ request, onError, onClose, onDone }: PanelProps) {
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
    <div className="space-y-4">
      <ReasonAndConfirm
        id="identification-defer-note"
        label="Nota"
        text={note}
        onText={setNote}
        confirmed={confirmed}
        onConfirmed={setConfirmed}
        confirmText="Confirmo que la solicitud sigue pendiente por falta de información. El agricultor verá la nota en su teléfono."
      />
      <Actions onClose={onClose} submit={() => void submit()} label={busy ? 'Guardando…' : 'Guardar como pendiente'} disabled={!ready} />
    </div>
  );
}
