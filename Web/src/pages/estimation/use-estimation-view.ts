import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const identity = useMemo<SessionIdentity | null>(
    () => (user ? { userId: user.id, tenantId: user.tenantId, role: user.role } : null),
    [user],
  );
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
    }, pollMs);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobRef, jobActive, job, polling, selected, pollMs, load, fail]);

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

  /** RF-40: descarga explícita, con conexión; se guarda sólo si la sesión sigue siendo la que la pidió. */
  const downloadCopy = async () => {
    if (!selected || !user || !identity) return;
    const owner = { ...identity, name: user.name, tenantName: user.tenant?.name ?? '' };
    // El contexto local vigente al pedirla: si al responder ya no es este, no se guarda.
    const context = currentContext();
    setCopyNote(null);
    if (!context || !contextBelongsTo(context, identity)) {
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
      const outcome = await saveCopy(context, owner, body);
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
    setOpened,
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
