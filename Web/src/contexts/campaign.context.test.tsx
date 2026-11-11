import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fixtures from '../dev/fixtures/campaigns-fixtures';
import { CAMPAIGN_IDS } from '../dev/fixtures/campaigns-fixtures';
import { CampaignsPage } from '../pages/campaigns.page';
import { CollectiveSummaryPage } from '../pages/collective-summary.page';
import { HistoryPage } from '../pages/history.page';
import { JointProposalPage } from '../pages/joint-proposal.page';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { userWith } from '../test/render';
import { AuthContext } from './auth.context';
import { CampaignProvider } from './campaign.context';

/** Cualquier lectura colectiva o de estimación queda pendiente: sólo importan las de campañas. */
function pendingService() {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  return new Proxy({}, { get: (_, key: string) => (fns[key] ??= vi.fn(() => new Promise(() => undefined))) });
}
vi.mock('../services/collective.service', () => ({ collectiveService: pendingService() }));
vi.mock('../services/estimation.service', () => ({ estimationService: pendingService() }));
vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn(), create: vi.fn(), update: vi.fn(), open: vi.fn(), close: vi.fn() },
}));

function app(path: string, role = 'DIRECTIVA') {
  return render(
    <StrictMode>
      <AuthContext.Provider value={{ user: userWith(role), isLoading: false, login: async () => undefined, logout: async () => undefined }}>
        <CampaignProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/colectivo/resumen" element={<CollectiveSummaryPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/colectivo/propuestas" element={<JointProposalPage />} />
              <Route path="/colectivo/historico" element={<HistoryPage />} />
            </Routes>
          </MemoryRouter>
        </CampaignProvider>
      </AuthContext.Provider>
    </StrictMode>,
  );
}

/** Enlace del menú lateral (el armazón también tiene la barra inferior). */
function clickMenu(name: string) {
  fireEvent.click(screen.getAllByRole('link', { name })[0]);
}

describe('Campañas de la sesión en caché (CampaignProvider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue(fixtures.worst);
    vi.mocked(campaignsService.active).mockResolvedValue(fixtures.activeOf(fixtures.worst));
  });

  it('Resumen → Campañas → Necesidades → Histórico: una sola GET /campaigns y una sola /campaigns/active (StrictMode)', async () => {
    app('/colectivo/resumen');
    await waitFor(() => expect(collectiveService.summary).toHaveBeenCalledWith(CAMPAIGN_IDS.worstActive));
    clickMenu('Campañas');
    await screen.findByTestId(`campaign-row-${fixtures.LONG_CAMPAIGN_NAME}`);
    clickMenu('Necesidades y propuestas');
    await screen.findByRole('heading', { level: 1, name: /Necesidades/ });
    clickMenu('Histórico y estimaciones');
    await screen.findByRole('heading', { level: 1, name: /Histórico/ });
    expect(campaignsService.list).toHaveBeenCalledTimes(1);
    expect(campaignsService.list).toHaveBeenCalledWith();
    expect(campaignsService.active).toHaveBeenCalledTimes(1);
  });

  it('?campaign= sigue mandando sobre la campaña activa', async () => {
    app(`/colectivo/resumen?campaign=${CAMPAIGN_IDS.worstClosedSealed}`);
    await waitFor(() => expect(collectiveService.summary).toHaveBeenCalledWith(CAMPAIGN_IDS.worstClosedSealed));
    expect(collectiveService.summary).not.toHaveBeenCalledWith(CAMPAIGN_IDS.worstActive);
    expect((screen.getByLabelText('Campaña') as HTMLSelectElement).value).toBe(CAMPAIGN_IDS.worstClosedSealed);
  });

  it('un error de la lista se muestra con el texto de collectiveError y se recupera al volver a pedirla', async () => {
    const { AxiosError } = await import('axios');
    vi.mocked(campaignsService.list).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    app('/campaigns');
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId(`campaign-row-${fixtures.LONG_CAMPAIGN_NAME}`);
    expect(campaignsService.list).toHaveBeenCalledTimes(2);
  });

  it('un rol no colectivo sin el flag de rollback no pide nada', async () => {
    app('/campaigns', 'AGRICULTOR');
    await screen.findByText('Todavía no hay campañas');
    expect(campaignsService.list).not.toHaveBeenCalled();
    expect(campaignsService.active).not.toHaveBeenCalled();
  });
});
