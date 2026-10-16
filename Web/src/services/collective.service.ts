import { api } from '../lib/axios';
import type {
  AssociationList,
  CatalogEntry,
  CollectiveSummary,
  Proposal,
  ProposalSummary,
} from '../types/collective';

/** Cada identificador se codifica antes de componer la ruta. */
const seg = encodeURIComponent;

/**
 * Endpoints colectivos F06/F07 (sólo DIRECTIVA y ADMINISTRADOR del tenant,
 * comprobado en el servidor). Online: sin cola offline. El tenant sale de la
 * sesión, nunca del cliente.
 */
export const collectiveService = {
  summary: (campaignId: string) =>
    api.get<CollectiveSummary>(`/collective/campaigns/${seg(campaignId)}/summary`).then((r) => r.data),
  proposals: (campaignId: string) =>
    api.get<ProposalSummary[]>(`/collective/campaigns/${seg(campaignId)}/proposals`).then((r) => r.data),
  generateProposal: (campaignId: string) =>
    api.post<Proposal>(`/collective/campaigns/${seg(campaignId)}/proposals`).then((r) => r.data),
  proposal: (proposalId: string) =>
    api.get<Proposal>(`/collective/proposals/${seg(proposalId)}`).then((r) => r.data),
  /** El CSV lo genera el servidor con la misma política que el JSON. */
  proposalCsv: (proposalId: string) =>
    api.get<Blob>(`/collective/proposals/${seg(proposalId)}/csv`, { responseType: 'blob' }).then((r) => r.data),
  catalog: () => api.get<CatalogEntry[]>('/collective/product-associations/catalog').then((r) => r.data),
  associations: () => api.get<AssociationList>('/collective/product-associations').then((r) => r.data),
  associate: (payload: { productId: string; canonicalProductId: string; reason: string; confirmed: true }) =>
    api.post<{ changed: boolean; association: string }>('/collective/product-associations', payload).then((r) => r.data),
  closeAssociation: (productId: string, payload: { reason: string; confirmed: true }) =>
    api
      .post<{ changed: boolean; association: string }>(`/collective/product-associations/${seg(productId)}/close`, payload)
      .then((r) => r.data),
};
