import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach } from 'vitest';
import { AuthContext, type AuthUser } from '../contexts/auth.context';
import { CampaignContext } from '../contexts/campaign.context';
import type { Campaign } from '../types/campaigns';

afterEach(cleanup);

/** Datos sintéticos de prueba: ninguna identidad ni cifra real. */
export const CAMPAIGN: Campaign = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Campaña sintética',
  status: 'ABIERTA',
  isActive: true,
  startDate: '2026-09-01T00:00:00.000Z',
  estimatedEndDate: null,
  closedAt: null,
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  summary: { plotCropAssignments: 0, purchases: 0, stockMovements: 0, agrochemicalApplications: 0, payableAccounts: 0 },
};

export function userWith(role: string): AuthUser {
  return {
    id: 'u-1',
    name: 'Usuario sintético',
    email: 'sintetico@example.test',
    role,
    tenantId: 't-1',
    tenant: { id: 't-1', name: 'Sindicato sintético', slug: 'sintetico' },
  };
}

/** Renderiza `ui` en `path` con sesión y campaña activa simuladas. */
export function renderAt(
  ui: ReactNode,
  { role = 'DIRECTIVA', path = '/', routes = [] as { path: string; element: ReactNode }[] } = {},
) {
  const user = role ? userWith(role) : null;
  return render(
    <AuthContext.Provider value={{ user, isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <CampaignContext.Provider
        value={{
          activeCampaign: CAMPAIGN,
          isLoading: false,
          error: null,
          refreshActiveCampaign: async () => undefined,
          hasActiveCampaign: true,
        }}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path.split('?')[0]} element={ui} />
            {routes.map((route) => (
              <Route key={route.path} path={route.path} element={route.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </CampaignContext.Provider>
    </AuthContext.Provider>,
  );
}
