/**
 * Sustituye los servicios por el conjunto de datos del prototipo (sólo
 * desarrollo y pruebas). Las lecturas devuelven el fixture con una pequeña
 * demora (para ver el estado «cargando»); toda escritura se rechaza: el
 * prototipo no envía nada a ningún servidor.
 */
import axios from 'axios';
import { auditLogsService } from '../../../services/audit-logs.service';
import { campaignsService } from '../../../services/campaigns.service';
import { collectiveService } from '../../../services/collective.service';
import { estimationService } from '../../../services/estimation.service';
import { emptySummaryFor, type ResumenDataset } from './datasets';

const never = () => Promise.reject(new Error('El prototipo no escribe en ningún servidor.'));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const forever = () => new Promise<never>(() => undefined);

function httpError(status: number, message?: string): Error {
  const error = new axios.AxiosError(message ?? `HTTP ${status}`, String(status));
  error.response = { status, data: message ? { message } : {}, statusText: '', headers: {}, config: { headers: new axios.AxiosHeaders() } };
  return error;
}

export function installStubs(current: () => ResumenDataset, latency = 180): void {
  const list = async () => {
    await sleep(latency);
    return current().campaigns;
  };
  Object.assign(campaignsService, { list, active: async () => (await list(), current().active), create: never, update: never, open: never, close: never });
  Object.assign(collectiveService, {
    summary: async (id: string) => {
      const dataset = current();
      if (dataset.failure === 'loading') return forever();
      await sleep(latency);
      if (dataset.failure === 'error') throw new axios.AxiosError('Network Error', 'ERR_NETWORK');
      if (dataset.failure === 'forbidden') throw httpError(403);
      const summary = dataset.summaries[id];
      if (summary) return summary;
      const campaign = dataset.campaigns.find((entry) => entry.id === id);
      if (!campaign) throw httpError(404);
      return emptySummaryFor(campaign);
    },
    sealState: async (id: string) => {
      await sleep(latency);
      const dataset = current();
      const state = dataset.sealStates[id];
      if (state) return state;
      const summary = dataset.summaries[id] ?? emptySummaryFor(dataset.campaigns.find((entry) => entry.id === id)!);
      return { contractVersion: 1 as const, campaign: summary.campaign, state: 'NOT_SEALED' as const, seal: null, can_seal: false, blocked_by: ['CAMPAIGN_NOT_CLOSED' as const], review: null };
    },
    seal: never,
    proposals: async () => [],
    generateProposal: never,
    proposal: never,
    proposalEstimationReference: never,
    proposalCsv: never,
    trends: never,
    trendsCsv: never,
    catalog: async () => [],
    associations: async () => ({ current: [], history: [] }),
    associate: never,
    closeAssociation: never,
  });
  Object.assign(estimationService, {
    results: async (id: string) => {
      await sleep(latency);
      const dataset = current();
      const answer = dataset.estimations[id];
      if (!answer) {
        const summary = dataset.summaries[id] ?? emptySummaryFor(dataset.campaigns.find((entry) => entry.id === id)!);
        return {
          contract_version: 1 as const,
          profile: 'INSTITUTIONAL' as const,
          scope: { tenant_ref: 't-proto' },
          target: { campaign_ref: id, name: summary.campaign.name, status: summary.campaign.status as 'ABIERTA', start_date: '2026-05-01T00:00:00.000Z', end_date: null },
          season: null,
          evaluated_at: '2026-11-10T15:00:00.000Z',
          results: [],
          notice: 'Estimación exploratoria SES/naive: referencia de consumo para una campaña comparable. No se suma a la necesidad declarada.',
        };
      }
      if (answer.kind === 'policy') throw httpError(409, 'POLICY_PENDING');
      if (answer.kind === 'error') throw httpError(502);
      return answer.results;
    },
    request: never,
    job: never,
    runs: never,
    run: never,
    download: never,
  });
  Object.assign(auditLogsService, {
    list: async (params?: { campaignId?: string }) => {
      await sleep(latency);
      const dataset = current();
      const activity = dataset.activity ?? {};
      if (params?.campaignId) {
        const answer = activity[params.campaignId];
        if (!answer) return [];
        if (answer.kind === 'error') throw httpError(502);
        return answer.logs;
      }
      return Object.values(activity).flatMap((answer) => (answer.kind === 'logs' ? answer.logs : []));
    },
  });
}
