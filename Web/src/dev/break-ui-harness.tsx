/**
 * Arnés break-ui de la sesión C (2026-11-10), sólo en desarrollo
 * (`import.meta.env.DEV`): `npx vite` y abrir
 * `/src/dev/break-ui.html?datos=worst|demo|empty|one&pantalla=propuestas|historico|catalogo&vista=…`.
 * Sustituye los servicios por los fixtures sintéticos de `dev/fixtures`: no llama
 * a ninguna API y toda escritura se rechaza. Ninguna vista real lo importa y
 * `vite build` no lo incluye (sólo construye `index.html`).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '../index.css';
import { AuthContext } from '../contexts/auth.context';
import { CampaignContext } from '../contexts/campaign.context';
import { CatalogPage } from '../pages/catalog.page';
import { HistoryPage } from '../pages/history.page';
import { JointProposalPage } from '../pages/joint-proposal.page';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { estimationService } from '../services/estimation.service';
import { productsService } from '../services/inventory.service';
import type { Campaign } from '../types/campaigns';
import { catalogFixtures } from './fixtures/catalog-fixtures';
import { estimationFixtures } from './fixtures/estimation-fixtures';
import { proposalFixtures } from './fixtures/proposal-fixtures';
import { trendsFixtures } from './fixtures/trends-fixtures';

if (!import.meta.env.DEV) throw new Error('El arnés break-ui sólo funciona en desarrollo.');

const params = new URLSearchParams(location.search);
const datos = (params.get('datos') ?? 'worst') as 'demo' | 'worst' | 'empty' | 'one';
const pantalla = params.get('pantalla') ?? 'propuestas';
const vista = params.get('vista');

const CAMPAIGN: Campaign = {
  id: '0c0c0c0c-0000-4000-8000-000000000001',
  name: datos === 'worst' ? 'Campaña de invierno 2026 – Comunidad Villa Esperanza del Valle Alto (siembra tardía)' : 'Campaña invierno 2026',
  status: 'ABIERTA',
  isActive: true,
  startDate: '2026-05-01T00:00:00.000Z',
  estimatedEndDate: null,
  closedAt: null,
  notes: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const never = () => Promise.reject(new Error('El arnés no escribe'));
const p = proposalFixtures[datos];
const e = estimationFixtures[datos];
const c = catalogFixtures[datos];
Object.assign(campaignsService, { list: async () => [CAMPAIGN], active: async () => CAMPAIGN });
Object.assign(collectiveService, {
  proposals: async () => p.history,
  proposal: async () => p.proposal,
  proposalEstimationReference: async () => p.reference,
  generateProposal: never,
  trends: async () => trendsFixtures[datos],
  catalog: async () => c.catalog,
  associations: async () => c.associations,
  associate: never,
  closeAssociation: never,
});
Object.assign(estimationService, {
  results: async () => ({ ...e.results, target: { ...e.results.target, campaign_ref: CAMPAIGN.id } }),
  runs: async () => e.runs,
  run: async (id: string) => e.details.find((run) => run.run_ref === id),
  request: never,
  download: never,
});
Object.assign(productsService, { list: async () => c.products, create: never, update: never, deactivate: never });

const user = { id: 'u-1', name: 'María José de la Cruz y Fernández Montaño', email: 'directiva@example.test', role: 'DIRECTIVA', tenantId: 't-1', tenant: { id: 't-1', name: 'Sindicato sintético', slug: 's' } };
const page = pantalla === 'historico' ? <HistoryPage /> : pantalla === 'catalogo' ? <CatalogPage /> : <JointProposalPage />;
const path = pantalla === 'historico' ? '/colectivo/historico' : pantalla === 'catalogo' ? '/colectivo/catalogo' : '/colectivo/propuestas';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthContext.Provider value={{ user, isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <CampaignContext.Provider value={{ activeCampaign: CAMPAIGN, isLoading: false, error: null, refreshActiveCampaign: async () => undefined, hasActiveCampaign: true }}>
        <MemoryRouter initialEntries={[`${path}?campaign=${CAMPAIGN.id}${vista ? `&vista=${vista}` : ''}`]}>
          <Routes>
            <Route path="*" element={page} />
          </Routes>
        </MemoryRouter>
      </CampaignContext.Provider>
    </AuthContext.Provider>
  </StrictMode>,
);
