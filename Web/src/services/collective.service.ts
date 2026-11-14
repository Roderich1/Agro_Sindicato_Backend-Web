import { api } from '../lib/axios';
import type {
  AssociationList,
  CatalogEntry,
  CollectiveSummary,
  CollectiveTrends,
  ProjectionType,
  Proposal,
  ProposalSummary,
  SealState,
} from '../types/collective';
import type { ProposalEstimationReference } from '../types/estimation';
import type {
  ClearLinkBody,
  EstimationLinkActionResult,
  EstimationLinkView,
  PrepareLinkBody,
  ProposalSelection,
} from '../types/estimation-link';

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
  /** F12-EST-08: la estimación del consumo como referencia separada del borrador. */
  proposalEstimationReference: (proposalId: string) =>
    api
      .get<ProposalEstimationReference>(`/collective/proposals/${seg(proposalId)}/estimation-reference`)
      .then((r) => r.data),
  /** E3 §4: la referencia de consumo estimado fijada en el borrador. Sólo lee: nunca calcula ni fija nada. */
  estimationLink: (proposalId: string) =>
    api.get<EstimationLinkView>(`/collective/proposals/${seg(proposalId)}/estimation-link`).then((r) => r.data),
  /** E3 §4: obtener o actualizar la referencia (idempotente por `request_id`). Sólo con un botón, nunca al montar. */
  prepareEstimationLink: (proposalId: string, body: PrepareLinkBody) =>
    api
      .post<EstimationLinkActionResult>(`/collective/proposals/${seg(proposalId)}/estimation-link/prepare`, body)
      .then((r) => r.data),
  /** E3 §4: quitar la referencia vista (`expected_link_ref`). */
  clearEstimationLink: (proposalId: string, body: ClearLinkBody) =>
    api
      .post<EstimationLinkActionResult>(`/collective/proposals/${seg(proposalId)}/estimation-link/clear`, body)
      .then((r) => r.data),
  /** E3 §6: productos del borrador elegidos para una convocatoria. */
  proposalSelection: (proposalId: string) =>
    api.get<ProposalSelection>(`/collective/proposals/${seg(proposalId)}/selection`).then((r) => r.data),
  /** E3 §6: guarda la selección con control optimista (`expected_revision`). */
  saveProposalSelection: (proposalId: string, body: { expected_revision: number; product_refs: string[] }) =>
    api.put<ProposalSelection>(`/collective/proposals/${seg(proposalId)}/selection`, body).then((r) => r.data),
  /** F07: estado del sellado y revisión previa (cobertura, banderas, review_ref). */
  sealState: (campaignId: string) =>
    api.get<SealState>(`/collective/campaigns/${seg(campaignId)}/seal`).then((r) => r.data),
  /** Sella sólo con confirmación expresa y la revisión mostrada; el servidor autoriza. */
  seal: (campaignId: string, reviewRef: string) =>
    api
      .post<SealState>(`/collective/campaigns/${seg(campaignId)}/seal`, { confirmed: true, review_ref: reviewRef })
      .then((r) => r.data),
  trends: (projectionType: ProjectionType | null) =>
    api
      .get<CollectiveTrends>('/collective/trends', { params: projectionType ? { projection_type: projectionType } : {} })
      .then((r) => r.data),
  catalog: () => api.get<CatalogEntry[]>('/collective/product-associations/catalog').then((r) => r.data),
  associations: () => api.get<AssociationList>('/collective/product-associations').then((r) => r.data),
  associate: (payload: { productId: string; canonicalProductId: string; reason: string; confirmed: true }) =>
    api.post<{ changed: boolean; association: string }>('/collective/product-associations', payload).then((r) => r.data),
  closeAssociation: (productId: string, payload: { reason: string; confirmed: true }) =>
    api
      .post<{ changed: boolean; association: string }>(`/collective/product-associations/${seg(productId)}/close`, payload)
      .then((r) => r.data),
};
