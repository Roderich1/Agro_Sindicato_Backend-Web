import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/use-auth';
import { useSelectedCampaign } from '../../hooks/use-selected-campaign';
import { clearsInstitutionalData, estimationError, newRequestId, type EstimationError } from '../../lib/estimation-text';
import {
  closeContext,
  contextBelongsTo,
  currentContext,
  purgeInaccessibleCopies,
  readCopy,
  revokeTarget,
  rotateContext,
  saveCopy,
  type SessionIdentity,
  type StoredCopy,
} from '../../lib/estimation-copy';
import { collectiveService } from '../../services/collective.service';
import { estimationService } from '../../services/estimation.service';
import type { CatalogEntry } from '../../types/collective';
import type { InstitutionalResults, Job, Run, RunSummary } from '../../types/estimation';
import { byCodeUnits, ELIGIBLE, latestGeneratedAt, LOST_ROLE, SAVE_TEXT } from './estimation.helpers';

type Query = 'load' | 'copy' | 'job' | 'request' | 'page' | 'run' | 'download';

type EstimationScope = {
  target: string;
  latest: Partial<Record<Query, symbol>>;
};

export function useEstimationView(pollMs: number) {
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
  const userId = user?.id;
  const tenantId = user?.tenantId;
  const role = user?.role;
  const identity = useMemo<SessionIdentity | null>(
    () => userId && tenantId && role ? { userId, tenantId, role } : null,
    [userId, tenantId, role],
  );
  const scopeRef = useRef<EstimationScope | null>(null);
  useLayoutEffect(() => {
    scopeRef.current = selected && identity ? { target: selected, latest: {} } : null;
    return () => { scopeRef.current = null; };
  }, [selected, identity]);

  // Cada selección confirmada tiene su propio ámbito, incluso en A → B → A.
  // Dentro del ámbito sólo la última petición de cada consulta puede actualizar la vista.
  const track = useCallback((scope: EstimationScope, query: Query) => {
    const revision = Symbol();
    scope.latest[query] = revision;
    return () => scopeRef.current === scope && scope.latest[query] === revision;
  }, []);

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
    (problem: EstimationError, scope: EstimationScope) => {
      setError(problem);
      if (clearsInstitutionalData(problem.kind)) {
        scope.latest = {};
        clearAll();
        setCopy(null);
        setLoading(false);
        setBusy(false);
        setDownloading(false);
        // El acceso local se retira ya, de forma síncrona; el borrado físico va después y puede quedar pendiente.
        if (problem.kind === 'policy') rotateContext();
        else if (problem.kind === 'not-found') revokeTarget(scope.target);
        else closeContext();
        void purgeInaccessibleCopies();
      } else if (problem.kind === 'offline') setStale(true);
      return problem;
    },
    [clearAll],
  );
  const fail = useCallback(
    (err: unknown, fallback: string, scope: EstimationScope) => apply(estimationError(err, fallback), scope),
    [apply],
  );

  const load = useCallback(
    async (scope: EstimationScope) => {
      if (scopeRef.current !== scope) return;
      const current = track(scope, 'load');
      const target = scope.target;
      setLoading(true);
      try {
        const [read, list] = await Promise.all([estimationService.results(target), estimationService.runs(target)]);
        if (!current()) return;
        // Un rol degradado a Agricultor recibe el perfil FARMER: para esta pantalla es un permiso perdido.
        if (read.profile !== 'INSTITUTIONAL') {
          apply(LOST_ROLE, scope);
          return;
        }
        // α y las campañas observadas vienen del detalle de la ejecución de cada resultado.
        const ids = [...new Set(read.results.map((r) => r.run_ref))];
        const loaded = await Promise.all(ids.map((id) => estimationService.run(id)));
        if (!current()) return;
        delete scope.latest.page;
        setResults(read);
        setDetails(Object.fromEntries(loaded.map((run) => [run.run_ref, run])));
        setRuns(list.items);
        setCursor(list.next_cursor);
        setStale(false);
        setError(null);
      } catch (err) {
        if (current()) fail(err, 'No fue posible cargar la estimación.', scope);
      } finally {
        if (current()) setLoading(false);
      }
    },
    [fail, apply, track],
  );

  useEffect(() => {
    const scope = scopeRef.current;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive || scopeRef.current !== scope) return;
      clearAll();
      setError(null);
      setLoading(false);
      setBusy(false);
      setDownloading(false);
      setCopy(null);
      setCopyNote(null);
      pendingRequest.current = null;
      if (scope) return load(scope);
    });
    return () => { alive = false; };
  }, [selected, identity, load, clearAll]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !identity) return;
    const current = track(scope, 'copy');
    readCopy(identity, scope.target)
      .then((found) => current() && setCopy(found))
      .catch(() => current() && setCopy(null));
  }, [selected, identity, track]);

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
  }, [identity]);

  // Consulta periódica del trabajo: sólo mientras está en cola o en proceso; se
  // detiene al terminar, al salir de la pantalla, al cambiar de campaña o si
  // se pierde el acceso (el error borra el trabajo).
  const jobRef = job?.job_ref ?? null;
  const jobActive = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !jobRef || !jobActive || !polling) return;
    let alive = true;
    const timer = setTimeout(async () => {
      if (!alive || scopeRef.current !== scope) return;
      const current = track(scope, 'job');
      try {
        const next = await estimationService.job(jobRef);
        if (!alive || !current()) return;
        setJob(next);
        if (next.status === 'COMPLETED' || next.status === 'NOT_EXECUTED') await load(scope);
      } catch (err) {
        if (!alive || !current()) return;
        // Sin conexión, el trabajo sigue en el servidor: se deja de consultar y se puede volver a mirar a mano.
        setPolling(false);
        fail(err, 'No fue posible consultar el trabajo.', scope);
      }
    }, pollMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobRef, jobActive, job, polling, selected, identity, pollMs, load, fail, track]);

  const request = async () => {
    const scope = scopeRef.current;
    if (!scope) return;
    const key = `${scope.target}|${[...chosen].sort(byCodeUnits).join(',')}`;
    if (pendingRequest.current?.key !== key) pendingRequest.current = { id: newRequestId(), key };
    const current = track(scope, 'request');
    setBusy(true);
    setError(null);
    try {
      const created = await estimationService.request({
        requestId: pendingRequest.current.id,
        targetCampaignId: scope.target,
        ...(chosen.length > 0 ? { productRefs: chosen } : {}),
      });
      if (!current()) return;
      pendingRequest.current = null;
      delete scope.latest.job;
      setPolling(true);
      setJob(created);
    } catch (err) {
      if (!current()) return;
      const problem = fail(err, 'No fue posible solicitar la estimación.', scope);
      if (problem.kind !== 'offline') pendingRequest.current = null;
    } finally {
      if (current()) setBusy(false);
    }
  };

  const recheckJob = async () => {
    const scope = scopeRef.current;
    if (!scope || !job) return;
    const current = track(scope, 'job');
    try {
      const next = await estimationService.job(job.job_ref);
      if (!current()) return;
      setJob(next);
      setError(null);
      setPolling(true);
      if (next.status === 'COMPLETED' || next.status === 'NOT_EXECUTED') await load(scope);
    } catch (err) {
      if (current()) fail(err, 'No fue posible consultar el trabajo.', scope);
    }
  };

  const moreRuns = async () => {
    const scope = scopeRef.current;
    if (!scope || !cursor) return;
    const current = track(scope, 'page');
    try {
      const page = await estimationService.runs(scope.target, cursor);
      if (!current()) return;
      setRuns((current) => [...current, ...page.items]);
      setCursor(page.next_cursor);
    } catch (err) {
      if (current()) fail(err, 'No fue posible cargar más ejecuciones.', scope);
    }
  };

  const openRun = async (runId: string) => {
    const scope = scopeRef.current;
    if (!scope) return;
    const current = track(scope, 'run');
    try {
      const run = await estimationService.run(runId);
      if (current()) setOpened(run);
    } catch (err) {
      if (current()) fail(err, 'No fue posible abrir la ejecución.', scope);
    }
  };

  const closeRun = () => {
    const scope = scopeRef.current;
    if (scope) delete scope.latest.run;
    setOpened(null);
  };

  /** RF-40: descarga explícita, con conexión; se guarda sólo si la sesión sigue siendo la que la pidió. */
  const downloadCopy = async () => {
    const scope = scopeRef.current;
    if (!scope || !user || !identity) return;
    const owner = { ...identity, name: user.name, tenantName: user.tenant?.name ?? '' };
    // El contexto local vigente al pedirla: si al responder ya no es este, no se guarda.
    const context = currentContext();
    setCopyNote(null);
    if (!context || !contextBelongsTo(context, identity)) {
      setCopyNote('No hay un acceso local vigente para esta sesión: vuelva a iniciar sesión para descargar una copia.');
      return;
    }
    const current = track(scope, 'download');
    setDownloading(true);
    try {
      const body = await estimationService.download(scope.target);
      if (!current()) return;
      if (body.profile !== 'INSTITUTIONAL') {
        apply(LOST_ROLE, scope);
        return;
      }
      const outcome = await saveCopy(context, owner, body);
      if (!current()) return;
      setCopyNote(SAVE_TEXT[outcome]);
      if (outcome === 'SAVED' || outcome === 'KEPT_NEWER') {
        delete scope.latest.copy;
        const updatedCopy = await readCopy(identity, scope.target);
        if (current()) setCopy(updatedCopy);
      }
    } catch (err) {
      if (current()) fail(err, 'No fue posible descargar la copia.', scope);
    } finally {
      if (current()) setDownloading(false);
    }
  };

  const offline = error?.kind === 'offline';
  const blocked = error?.kind === 'policy' || error?.kind === 'forbidden' || error?.kind === 'session';
  const calculatedAt = latestGeneratedAt(results);

  return {
    campaigns,
    selected,
    select,
    campaignsError,
    campaign,
    eligible,
    results,
    details,
    runs,
    cursor,
    opened,
    closeRun,
    job,
    polling,
    error,
    stale,
    loading,
    busy,
    catalog,
    chosen,
    setChosen,
    copy,
    copyNote,
    downloading,
    offline,
    blocked,
    calculatedAt,
    request,
    recheckJob,
    moreRuns,
    openRun,
    downloadCopy,
  };
}
