import { api } from '../lib/axios';
import type { InstitutionalResults, Job, Run, RunList } from '../types/estimation';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;

/**
 * F12-EST-06 (#179): INT-09 desde la Web institucional (DIRECTIVA y
 * ADMINISTRADOR; el servidor autoriza rol y sindicato en cada petición). La Web
 * sólo pide y presenta: el cálculo ocurre en el servidor, por lotes. Online: sin
 * cola offline, sin copia descargada (RF-40 es de F12-EST-07).
 */
export const estimationService = {
  /** Encola un trabajo. El `request_id` hace idempotente la petición: un reintento con el mismo id devuelve el mismo trabajo. */
  request: (payload: { requestId: string; targetCampaignId: string; productRefs?: string[] }) =>
    api
      .post<Job>('/estimation/jobs', {
        contract_version: 1,
        request_id: payload.requestId,
        target_campaign_ref: payload.targetCampaignId,
        ...(payload.productRefs && payload.productRefs.length > 0 ? { product_refs: payload.productRefs } : {}),
      })
      .then((r) => r.data),
  job: (jobId: string) => api.get<Job>(`/estimation/jobs/${seg(jobId)}`).then((r) => r.data),
  results: (targetCampaignId: string) =>
    api.get<InstitutionalResults>('/estimation/results', { params: { target_campaign_ref: targetCampaignId } }).then((r) => r.data),
  runs: (targetCampaignId: string, cursor?: string | null) =>
    api
      .get<RunList>('/estimation/runs', { params: { target_campaign_ref: targetCampaignId, limit: 10, ...(cursor ? { cursor } : {}) } })
      .then((r) => r.data),
  run: (runId: string) => api.get<Run>(`/estimation/runs/${seg(runId)}`).then((r) => r.data),
};
