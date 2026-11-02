import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell, buttonClass, EmptyState, labelClass, Notice, secondaryButtonClass } from '../components/app-shell';
import { CampaignPicker } from '../components/collective-ui';
import { useAuth } from '../hooks/use-auth';
import { useSelectedCampaign } from '../hooks/use-selected-campaign';
import { fmtDateTime } from '../lib/collective-text';
import { resultsCsv } from '../lib/estimation-csv';
import {
  clearsInstitutionalData,
  estimationError,
  FAILURE_TEXT,
  formatAlpha,
  JOB_STATUS_TEXT,
  newRequestId,
  REASON_TEXT,
  RESULT_STATUS_TEXT,
  STOP_TEXT,
  type EstimationError,
} from '../lib/estimation-text';
import { formatQuantity, groupDecimal, toPresentation } from '../lib/quantity';
import { Figure, ValidityBadge } from '../components/estimation-figure';
import { EstimationCopyView } from '../components/estimation-copy-view';
import {
  closeContext,
  currentContext,
  purgeInaccessibleCopies,
  readCopy,
  revokeTarget,
  rotateContext,
  saveCopy,
  sameIdentity,
  type SaveOutcome,
  type SessionIdentity,
  type StoredCopy,
} from '../lib/estimation-copy';
import { ESTIMATION_COPY_PATH } from '../lib/navigation';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import type { CatalogEntry } from '../types/collective';
import type {
  InstitutionalResult,
  InstitutionalResults,
  Job,
  ResultDetail,
  Run,
  RunSummary,
  SeriesPoint,
} from '../types/estimation';

/** Cada cuánto se consulta un trabajo en cola o en proceso. */
export const POLL_MS = 2000;
const ELIGIBLE = ['PLANIFICADA', 'ABIERTA'];

/** Un perfil que no es el institucional: el rol ya no es de la Directiva ni del Administrador. */
const LOST_ROLE: EstimationError = { kind: 'forbidden', message: 'Su rol ya no tiene acceso a la estimación institucional.' };

const SAVE_TEXT: Record<SaveOutcome, string> = {
  SAVED: 'Copia guardada en este navegador.',
  KEPT_NEWER: 'Ya había una copia igual o más reciente de esta campaña: se conserva.',
  CONTEXT_CHANGED: 'La sesión cambió o se retiró el acceso durante la descarga: la copia no se guardó.',
  NOT_INSTITUTIONAL: 'La respuesta no es del perfil institucional: no se guardó.',
  OTHER_SCOPE: 'La respuesta no es de su sindicato: no se guardó.',
  UNSUPPORTED: 'El formato de la respuesta no es el esperado: no se guardó.',
};

/** Orden por unidades de código, independiente del idioma: la misma elección da la misma clave de solicitud. */
function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * F12-EST-06 (#179): «Estimación del consumo» para DIRECTIVA y ADMINISTRADOR
 * (INT-09, perfil institucional). La Web pide y presenta: el SES/naive lo
 * calcula el servidor, por lotes. La estimación es una referencia de consumo
 * para una campaña comparable: no se suma a la necesidad declarada ni crea
 * compras, propuestas o movimientos. Un dato ausente nunca se muestra como
 * cero, y cada cifra dice de qué ejecución viene. El CSV exporta la consulta tal
 * como respondió el servidor y requiere conexión; no es la copia descargada para
 * consultar sin conexión (RF-40, F12-EST-07), que esta pantalla no tiene.
 */
export function EstimationPage() {
  const { user } = useAuth();
  const { campaigns, selected, select, error: campaignsError } = useSelectedCampaign();
  const [results, setResults] = useState<InstitutionalResults | null>(null);
  const [details, setDetails] = useState<Record<string, Run>>({});
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [opened, setOpened] = useState<Run | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  /** La consulta automática se detiene ante cualquier error y se reanuda al pedir el estado a mano. */
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState<EstimationError | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  /** Se conserva tras un fallo de red: reintentar con el mismo id no duplica el trabajo. */
  const pendingRequest = useRef<{ id: string; key: string } | null>(null);
  /** F12-EST-07-WEB (#180): la copia de esta identidad para la campaña elegida. */
  const [copy, setCopy] = useState<StoredCopy | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const identity = useMemo<SessionIdentity | null>(() => (user ? { userId: user.id, tenantId: user.tenantId, role: user.role } : null), [user]);
  const targetRef = useRef<string | null>(null);
  useEffect(() => {
    targetRef.current = selected;
  }, [selected]);

  const campaign = campaigns.find((c) => c.id === selected) ?? null;
  const eligible = campaign ? ELIGIBLE.includes(campaign.status) : false;

  const clearAll = useCallback(() => {
    setResults(null);
    setDetails({});
    setRuns([]);
    setCursor(null);
    setOpened(null);
    setJob(null);
    setStale(false);
  }, []);

  /**
   * Un error que retira el acceso borra lo mostrado y la copia afectada (la de
   * esta identidad; con un 404, la de esa campaña): no sirve para eludir el
   * rechazo. Un fallo de red deja lo mostrado marcado como no actualizado.
   */
  const apply = useCallback(
    (problem: EstimationError) => {
      setError(problem);
      if (clearsInstitutionalData(problem.kind)) {
        clearAll();
        setCopy(null);
        // El acceso local se retira ya, de forma síncrona; el borrado físico va después y puede quedar pendiente.
        if (problem.kind === 'policy') rotateContext();
        else if (problem.kind === 'not-found') {
          if (targetRef.current) revokeTarget(targetRef.current);
        } else closeContext();
        void purgeInaccessibleCopies();
      } else if (problem.kind === 'offline') setStale(true);
      return problem;
    },
    [clearAll],
  );
  const fail = useCallback((err: unknown, fallback: string) => apply(estimationError(err, fallback)), [apply]);

  const load = useCallback(
    async (target: string) => {
      setLoading(true);
      try {
        const [read, list] = await Promise.all([estimationService.results(target), estimationService.runs(target)]);
        // Un rol degradado a Agricultor recibe el perfil FARMER: para esta pantalla es un permiso perdido.
        if (read.profile !== 'INSTITUTIONAL') {
          apply(LOST_ROLE);
          return;
        }
        // α y las campañas observadas vienen del detalle de la ejecución de cada resultado.
        const ids = [...new Set(read.results.map((r) => r.run_ref))];
        const loaded = await Promise.all(ids.map((id) => estimationService.run(id)));
        setResults(read);
        setDetails(Object.fromEntries(loaded.map((run) => [run.run_ref, run])));
        setRuns(list.items);
        setCursor(list.next_cursor);
        setStale(false);
        setError(null);
      } catch (err) {
        fail(err, 'No fue posible cargar la estimación.');
      } finally {
        setLoading(false);
      }
    },
    [fail, apply],
  );

  useEffect(() => {
    if (!selected || !identity) return;
    let alive = true;
    readCopy(identity, selected)
      .then((found) => alive && setCopy(found))
      .catch(() => alive && setCopy(null));
    return () => {
      alive = false;
    };
  }, [selected, identity]);

  useEffect(() => {
    if (!selected) return;
    void Promise.resolve().then(() => {
      clearAll();
      setError(null);
      pendingRequest.current = null;
      return load(selected);
    });
  }, [selected, load, clearAll]);

  useEffect(() => {
    let alive = true;
    Promise.all([collectiveService.catalog(), collectiveService.associations()])
      .then(([entries, associations]) => {
        if (!alive) return;
        const denominations = new Set(associations.current.map((a) => a.product_ref));
        setCatalog(entries.filter((e) => e.is_active && e.base_unit !== null && !denominations.has(e.product_ref)));
      })
      .catch(() => alive && setCatalog(null));
    return () => {
      alive = false;
    };
  }, []);

  // Consulta periódica del trabajo: sólo mientras está en cola o en proceso; se
  // detiene al terminar, al salir de la pantalla, al cambiar de campaña o si
  // se pierde el acceso (el error borra el trabajo).
  const jobRef = job?.job_ref ?? null;
  const jobActive = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  useEffect(() => {
    if (!jobRef || !jobActive || !selected || !polling) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const next = await estimationService.job(jobRef);
        if (!alive) return;
        setJob(next);
        if (next.status === 'COMPLETED' || next.status === 'NOT_EXECUTED') await load(selected);
      } catch (err) {
        if (!alive) return;
        // Sin conexión, el trabajo sigue en el servidor: se deja de consultar y se puede volver a mirar a mano.
        setPolling(false);
        fail(err, 'No fue posible consultar el trabajo.');
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobRef, jobActive, job, polling, selected, load, fail]);

  const request = async () => {
    if (!selected) return;
    const key = `${selected}|${[...chosen].sort(byCodeUnits).join(',')}`;
    if (pendingRequest.current?.key !== key) pendingRequest.current = { id: newRequestId(), key };
    setBusy(true);
    setError(null);
    try {
      const created = await estimationService.request({
        requestId: pendingRequest.current.id,
        targetCampaignId: selected,
        ...(chosen.length > 0 ? { productRefs: chosen } : {}),
      });
      pendingRequest.current = null;
      setPolling(true);
      setJob(created);
    } catch (err) {
      const problem = fail(err, 'No fue posible solicitar la estimación.');
      if (problem.kind !== 'offline') pendingRequest.current = null;
    } finally {
      setBusy(false);
    }
  };

  const recheckJob = async () => {
    if (!job || !selected) return;
    try {
      const next = await estimationService.job(job.job_ref);
      setJob(next);
      setError(null);
      setPolling(true);
      if (next.status === 'COMPLETED' || next.status === 'NOT_EXECUTED') await load(selected);
    } catch (err) {
      fail(err, 'No fue posible consultar el trabajo.');
    }
  };

  const moreRuns = async () => {
    if (!selected || !cursor) return;
    try {
      const page = await estimationService.runs(selected, cursor);
      setRuns((current) => [...current, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      fail(err, 'No fue posible cargar más ejecuciones.');
    }
  };

  const openRun = async (runId: string) => {
    try {
      setOpened(await estimationService.run(runId));
    } catch (err) {
      fail(err, 'No fue posible abrir la ejecución.');
    }
  };

  const exportCsv = () => {
    if (!results) return;
    const blob = new Blob([resultsCsv(results)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `estimacion-${results.target.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** RF-40: descarga explícita, con conexión; se guarda sólo si la sesión sigue siendo la que la pidió. */
  const downloadCopy = async () => {
    if (!selected || !user || !identity) return;
    const owner = { ...identity, name: user.name, tenantName: user.tenant?.name ?? '' };
    // El contexto local vigente al pedirla: si al responder ya no es este, no se guarda.
    const context = currentContext();
    setCopyNote(null);
    if (!context || !sameIdentity(context, identity)) {
      setCopyNote('No hay un acceso local vigente para esta sesión: vuelva a iniciar sesión para descargar una copia.');
      return;
    }
    setDownloading(true);
    try {
      const body = await estimationService.download(selected);
      if (body.profile !== 'INSTITUTIONAL') {
        apply(LOST_ROLE);
        return;
      }
      const outcome = await saveCopy(context.id, owner, body);
      setCopyNote(SAVE_TEXT[outcome]);
      if (outcome === 'SAVED' || outcome === 'KEPT_NEWER') setCopy(await readCopy(identity, selected));
    } catch (err) {
      fail(err, 'No fue posible descargar la copia.');
    } finally {
      setDownloading(false);
    }
  };

  const offline = error?.kind === 'offline';
  const blocked = error?.kind === 'policy' || error?.kind === 'forbidden' || error?.kind === 'session';
  return (
    <AppShell
      title="Estimación del consumo"
      section="Directiva"
      actions={
        <button type="button" className={secondaryButtonClass} onClick={exportCsv} disabled={stale || !results || results.results.length === 0}>
          Exportar CSV de la consulta
        </button>
      }
    >
      <div className="space-y-6">
        <Notice kind="info">
          Referencia de consumo para una campaña comparable, calculada en el servidor con suavizamiento exponencial simple
          (SES) frente a la línea base naive. No es una necesidad declarada ni una propuesta: no se suma a ellas ni crea
          compras, propuestas o movimientos.
        </Notice>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className={labelClass}>Organización</p>
            <p className="text-sm font-semibold text-slate-800" data-testid="institution">
              {user?.tenant?.name ?? '—'}
            </p>
          </div>
          <CampaignPicker campaigns={campaigns} selected={selected} onSelect={select} />
        </div>
        {campaignsError && <Notice kind="error">{campaignsError}</Notice>}
        {error && (
          <div data-testid={`error-${error.kind}`}>
            <Notice kind={error.kind === 'offline' ? 'warn' : 'error'}>{error.message}</Notice>
          </div>
        )}
        {stale && (
          <p className="text-xs text-amber-700" data-testid="stale">
            Lo que se muestra es de la última consulta que respondió; puede no estar actualizado. Sin conexión no se
            exporta, y generar, actualizar o descargar también requieren conexión.
          </p>
        )}

        {!blocked && selected && (
          <RequestPanel
            eligible={eligible}
            campaignStatus={campaign?.status ?? null}
            busy={busy}
            catalog={catalog}
            chosen={chosen}
            onChoose={setChosen}
            onRequest={() => void request()}
          />
        )}
        {job && <JobPanel job={job} polling={polling} onRecheck={() => void recheckJob()} />}
        {loading && <p className="text-sm text-slate-500">Cargando…</p>}
        {results && <ResultsSection results={results} details={details} latestRun={job?.run_ref ?? null} />}
        {results && (
          <HistorySection runs={runs} hasMore={cursor !== null} onMore={() => void moreRuns()} onOpen={(id) => void openRun(id)} openedId={opened?.run_ref ?? null} />
        )}
        {opened && <RunDetail run={opened} onClose={() => setOpened(null)} />}
        {!blocked && selected && (
          <CopyPanel
            copy={copy}
            offline={offline}
            downloading={downloading}
            note={copyNote}
            onDownload={() => void downloadCopy()}
          />
        )}
        {!blocked && offline && copy && <EstimationCopyView copy={copy} />}
      </div>
    </AppShell>
  );
}

/**
 * F12-EST-07-WEB (#180): la copia para consultar sin conexión. Se descarga a
 * petición y con conexión; es distinta del CSV de la consulta.
 */
function CopyPanel({
  copy,
  offline,
  downloading,
  note,
  onDownload,
}: {
  copy: StoredCopy | null;
  offline: boolean;
  downloading: boolean;
  note: string | null;
  onDownload: () => void;
}) {
  return (
    <section className="glass-card space-y-3 p-5" aria-label="Copia para consultar sin conexión" data-testid="copy-panel">
      <div>
        <h2 className="text-base font-bold text-slate-900">Copia para consultar sin conexión</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Guarda en este navegador la última estimación permitida de esta campaña, con sus fechas y la vigencia que tenía al
          descargarse. Sin conexión puede estar desactualizada. Es sólo para su sesión y se borra al cerrarla. No es el CSV de la
          consulta.
        </p>
      </div>
      <p className="text-sm text-slate-700" data-testid="copy-status">
        {copy
          ? `Hay una copia de esta campaña en este navegador, descargada el ${fmtDateTime(copy.download.downloaded_at)}.`
          : offline
            ? 'No hay una estimación descargada de esta campaña en este navegador. Sin conexión no se muestra ninguna cifra.'
            : 'No hay una copia de esta campaña en este navegador.'}
        {copy && (
          <>
            {' '}
            <Link className="font-semibold text-emerald-700 underline" to={ESTIMATION_COPY_PATH}>
              Ver las copias descargadas
            </Link>
          </>
        )}
      </p>
      {note && (
        <p className="text-xs text-slate-600" data-testid="copy-note">
          {note}
        </p>
      )}
      <button type="button" className={secondaryButtonClass} onClick={onDownload} disabled={downloading || offline}>
        {downloading ? 'Descargando…' : 'Descargar copia para consultar sin conexión'}
      </button>
      {offline && <p className="text-xs text-slate-500">Descargar requiere conexión.</p>}
    </section>
  );
}

function RequestPanel({
  eligible,
  campaignStatus,
  busy,
  catalog,
  chosen,
  onChoose,
  onRequest,
}: {
  eligible: boolean;
  campaignStatus: string | null;
  busy: boolean;
  catalog: CatalogEntry[] | null;
  chosen: string[];
  onChoose: (refs: string[]) => void;
  onRequest: () => void;
}) {
  const toggle = (ref: string) => onChoose(chosen.includes(ref) ? chosen.filter((r) => r !== ref) : [...chosen, ref]);
  return (
    <section className="glass-card space-y-4 p-5" aria-label="Generar estimación">
      <div>
        <h2 className="text-base font-bold text-slate-900">Generar estimación</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          El servidor calcula por lotes, fuera de esta pantalla: la solicitud queda en cola y se consulta su estado.
        </p>
      </div>
      {catalog && catalog.length > 0 && (
        <fieldset>
          <legend className={labelClass}>Productos (opcional)</legend>
          <p className="mb-2 text-xs text-slate-500">
            Sin marcar ninguno, se estiman los productos con consumo publicado en la temporada de la campaña.
          </p>
          <div className="flex flex-wrap gap-3">
            {catalog.map((entry) => (
              <label key={entry.product_ref} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={chosen.includes(entry.product_ref)} onChange={() => toggle(entry.product_ref)} />
                {entry.product_name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {!eligible && campaignStatus && (
        <p className="text-xs text-slate-600" data-testid="not-eligible">
          Esta campaña está {campaignStatus.toLowerCase()}: sólo se genera una estimación para una campaña planificada o
          abierta. Sus resultados anteriores siguen consultándose abajo.
        </p>
      )}
      <button type="button" className={buttonClass} onClick={onRequest} disabled={busy || !eligible}>
        {busy ? 'Generando…' : 'Generar estimación'}
      </button>
    </section>
  );
}

function JobPanel({ job, polling, onRecheck }: { job: Job; polling: boolean; onRecheck: () => void }) {
  const active = job.status === 'QUEUED' || job.status === 'RUNNING';
  return (
    <section className="glass-card space-y-2 p-5" aria-label="Estado del trabajo" data-testid="job">
      <h2 className="text-base font-bold text-slate-900">Trabajo solicitado</h2>
      <p className="text-sm text-slate-800" data-testid="job-status">
        {JOB_STATUS_TEXT[job.status]}
        {job.status === 'RUNNING' && ` (intento ${job.attempts} de ${job.max_attempts})`}
      </p>
      <p className="text-xs text-slate-500">
        En cola desde {fmtDateTime(job.enqueued_at)}
        {job.started_at && ` · iniciado ${fmtDateTime(job.started_at)}`}
        {job.finished_at && ` · terminado ${fmtDateTime(job.finished_at)}`}
      </p>
      {active && (
        <p className="text-xs text-slate-500">
          {polling ? 'Se consulta el estado automáticamente mientras esté en curso.' : 'La consulta automática se detuvo por un error: use «Consultar estado ahora».'}
        </p>
      )}
      {job.status === 'NOT_EXECUTED' && job.stop_code && (
        <Notice kind="warn">
          <span data-testid="job-stop">{STOP_TEXT[job.stop_code]}</span>
        </Notice>
      )}
      {job.status === 'COMPLETED' && (
        <p className="text-xs text-slate-600">La ejecución quedó registrada; los resultados se muestran abajo con su vigencia.</p>
      )}
      <button type="button" className={secondaryButtonClass} onClick={onRecheck}>
        Consultar estado ahora
      </button>
    </section>
  );
}

function detailOf(details: Record<string, Run>, result: InstitutionalResult): ResultDetail | null {
  return (
    details[result.run_ref]?.results.find((r) => r.product.product_ref === result.product.product_ref && r.base_unit === result.base_unit) ?? null
  );
}

function observed(detail: ResultDetail | null): string {
  if (!detail?.span) return '—';
  const names = new Map(detail.points.map((p) => [p.campaign.campaign_ref, p.campaign.name]));
  return `${detail.span.length}: ${names.get(detail.span.first_campaign_ref) ?? '?'} a ${names.get(detail.span.last_campaign_ref) ?? '?'}`;
}

const OBSERVED_GAP: Record<Exclude<SeriesPoint['kind'], 'VERIFIED_CONSUMPTION'>, string> = { NO_RECORD: 'sin registro', HIDDEN: 'oculto' };

/**
 * Lo publicado en cada campaña anterior al objetivo, en orden y tal como lo
 * entrega el servidor (prototipo W4): «96 · 120 · 104 · 116 L», «12 · oculto ·
 * 14 · 15 L». Una cifra que dejó de divulgarse llega como oculta.
 */
function observedValues(detail: ResultDetail | null, unit: 'L' | 'KG'): string | null {
  if (!detail) return null;
  const before = detail.points.filter((p) => p.exclusion_reason !== 'NOT_BEFORE_TARGET');
  if (before.length === 0) return 'sin cifras publicadas';
  const values = before.map((p) => {
    if (p.kind !== 'VERIFIED_CONSUMPTION') return OBSERVED_GAP[p.kind];
    const shown = p.quantity_base === null ? null : toPresentation(p.quantity_base);
    return shown === null ? 'cifra no válida' : groupDecimal(shown);
  });
  return `${values.join(' · ')} ${unit}`;
}

function ResultsSection({ results, details, latestRun }: { results: InstitutionalResults; details: Record<string, Run>; latestRun: string | null }) {
  return (
    <section className="glass-card overflow-hidden" aria-label="Resultados por producto">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Resultados para {results.target.name}</h2>
        <p className="mt-0.5 text-xs text-slate-500" data-testid="season">
          {results.season ? `Temporada ${results.season.key}: ${results.season.definition}` : 'La campaña no está clasificada en una temporada.'}
          {' · '}Vigencia evaluada el {fmtDateTime(results.evaluated_at)}
        </p>
        <p className="mt-1 text-xs text-slate-500">{results.notice}</p>
        <p className="mt-1 text-xs text-slate-500" data-testid="csv-note">
          «Exportar CSV de la consulta» guarda en un archivo esta consulta tal como la respondió el servidor. No es una
          copia para consultar sin conexión.
        </p>
      </div>
      {results.results.length === 0 ? (
        <EmptyState title="Sin ejecuciones" description="Todavía no hay ninguna estimación para esta campaña. No se muestra ninguna cifra." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Estimación SES</th>
                <th className="px-4 py-3">Línea base naive</th>
                <th className="px-4 py-3 normal-case">α</th>
                <th className="px-4 py-3">Campañas observadas</th>
                <th className="px-4 py-3">Cobertura</th>
                <th className="px-4 py-3">Vigencia</th>
                <th className="px-4 py-3">Ejecución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.results.map((result) => {
                const detail = detailOf(details, result);
                return (
                  <tr key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`result-${result.product.name}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {result.product.name}
                      <span className="block text-[11px] text-slate-500">{result.presentation_unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{RESULT_STATUS_TEXT[result.status]}</span>
                      {result.reason_code && <p className="text-[11px] text-slate-500" data-testid="reason">{REASON_TEXT[result.reason_code]}</p>}
                    </td>
                    <td className="px-4 py-3" data-testid="estimate">
                      <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} />
                    </td>
                    <td className="px-4 py-3" data-testid="naive">
                      <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />
                    </td>
                    <td className="px-4 py-3 tabular-nums" data-testid="alpha">
                      {formatAlpha(detail?.alpha ?? null)}
                      {detail?.fit_informative === false && <span className="block text-[11px] text-slate-500">Ajuste no informativo</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600" data-testid="observed">
                      <span data-testid="observed-span">{observed(detail)}</span>
                      {observedValues(detail, result.presentation_unit) && (
                        <span className="block tabular-nums text-slate-800" data-testid="observed-values">
                          {observedValues(detail, result.presentation_unit)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {result.coverage.campaigns.length === 0
                        ? '—'
                        : result.coverage.status === 'IDENTIFIED'
                          ? 'Identificada en cada campaña del tramo (participación, no integridad)'
                          : 'Desconocida en alguna campaña'}
                    </td>
                    <td className="px-4 py-3" data-testid="validity">
                      <ValidityBadge validity={result.validity} reason={result.validity_reason} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600" data-testid="run">
                      {fmtDateTime(result.generated_at)}
                      {latestRun && result.run_ref !== latestRun && (
                        <span className="block text-amber-700" data-testid="earlier-run">De una ejecución anterior, no de la última solicitada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistorySection({
  runs,
  hasMore,
  onMore,
  onOpen,
  openedId,
}: {
  runs: RunSummary[];
  hasMore: boolean;
  onMore: () => void;
  onOpen: (id: string) => void;
  openedId: string | null;
}) {
  return (
    <section className="glass-card overflow-hidden" aria-label="Ejecuciones anteriores">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Ejecuciones anteriores</h2>
        <p className="mt-0.5 text-xs text-slate-500">De la más reciente a la más antigua, incluidas las fallidas. Ninguna se modifica.</p>
      </div>
      {runs.length === 0 ? (
        <EmptyState title="Sin ejecuciones" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {runs.map((run) => (
            <li key={run.run_ref} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid="history-item">
              <div className="text-sm">
                <span className="font-semibold text-slate-800">{fmtDateTime(run.generated_at)}</span>
                <span className="ml-2 text-xs text-slate-500">Temporada {run.season.key}</span>
                <p className="text-xs text-slate-600" data-testid="history-outcome">
                  {run.outcome === 'CALCULATED'
                    ? `Calculada: ${run.counts.estimated} estimados, ${run.counts.insufficient_data} con datos insuficientes, ${run.counts.incompatible_data} incompatibles, ${run.counts.calculation_failed} fallidos`
                    : `Fallida. ${run.failure_code ? FAILURE_TEXT[run.failure_code] : ''}`}
                </p>
              </div>
              <button type="button" className={secondaryButtonClass} onClick={() => onOpen(run.run_ref)} disabled={openedId === run.run_ref}>
                Ver detalle
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="border-t border-slate-100 px-5 py-3">
          <button type="button" className={secondaryButtonClass} onClick={onMore}>
            Cargar más
          </button>
        </div>
      )}
    </section>
  );
}

const KIND_TEXT: Record<SeriesPoint['kind'], string> = {
  VERIFIED_CONSUMPTION: 'Consumo comprobado',
  NO_RECORD: 'Sin registro',
  HIDDEN: 'Oculto',
};
const EXCLUSION_TEXT: Record<NonNullable<SeriesPoint['exclusion_reason']>, string> = {
  NO_RECORD: 'sin registro',
  HIDDEN: 'oculto por la política',
  BEFORE_GAP: 'antes de un hueco',
  NOT_BEFORE_TARGET: 'no es anterior al objetivo',
};

function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const useful = run.results;
  return (
    <section className="glass-card overflow-hidden" aria-label="Detalle de la ejecución" data-testid="run-detail">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Ejecución del {fmtDateTime(run.generated_at)}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {run.outcome === 'CALCULATED' ? 'Calculada' : `Fallida. ${run.failure_code ? FAILURE_TEXT[run.failure_code] : ''}`} · método {run.method}{' '}
            {run.method_version} · temporada {run.season.key}. Las cifras de esta sección son las de esta ejecución.
          </p>
        </div>
        <button type="button" className={secondaryButtonClass} onClick={onClose}>
          Cerrar detalle
        </button>
      </div>
      {useful.length === 0 ? (
        <EmptyState title="Sin resultados" description="Esta ejecución no registró resultados por producto." />
      ) : (
        <div className="space-y-6 p-5">
          {useful.map((result) => (
            <div key={`${result.product.product_ref}|${result.base_unit}`} data-testid={`detail-${result.product.name}`} className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900">
                {result.product.name} ({result.presentation_unit}) · {RESULT_STATUS_TEXT[result.status]}
              </h3>
              {result.reason_code && <p className="text-xs text-slate-600">{REASON_TEXT[result.reason_code]}</p>}
              <p className="text-xs text-slate-700">
                SES:{' '}
                <Figure value={result.estimate_base} unit={result.base_unit} kind="estimate" status={result.status} validityReason={result.validity_reason} />{' '}
                · naive:{' '}
                <Figure value={result.naive_base} unit={result.base_unit} kind="naive" status={result.status} validityReason={result.validity_reason} />{' '}
                · α {formatAlpha(result.alpha)}
                {result.fit_informative === false && ' (ajuste no informativo)'}
              </p>
              <ValidityBadge validity={result.validity} reason={result.validity_reason} />
              {result.points.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Campaña</th>
                        <th className="px-3 py-2">Clase</th>
                        <th className="px-3 py-2">Consumo publicado</th>
                        <th className="px-3 py-2">En el tramo</th>
                        <th className="px-3 py-2">Cobertura</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.points.map((point) => (
                        <tr key={point.position} data-testid={`point-${point.campaign.name}`}>
                          <td className="px-3 py-2">{point.campaign.name}</td>
                          <td className="px-3 py-2">{KIND_TEXT[point.kind]}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {point.kind === 'VERIFIED_CONSUMPTION' && point.quantity_base !== null
                              ? formatQuantity(point.quantity_base, result.base_unit) ?? 'Cifra no válida'
                              : 'Sin cifra'}
                          </td>
                          <td className="px-3 py-2">{point.in_span ? 'Sí' : point.exclusion_reason ? `No: ${EXCLUSION_TEXT[point.exclusion_reason]}` : 'No'}</td>
                          <td className="px-3 py-2">
                            {point.coverage.status === 'IDENTIFIED'
                              ? `${point.coverage.members_in_published_figures} de ${point.coverage.linked_members}`
                              : 'Desconocida'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
