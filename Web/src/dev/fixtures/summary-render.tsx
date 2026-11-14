import { render } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '../../contexts/auth.context';
import { CampaignProvider } from '../../contexts/campaign.context';
import { campaignsService } from '../../services/campaigns.service';
import { userWith } from '../../test/render';
import type { Campaign } from '../../types/campaigns';

/**
 * Sólo pruebas: monta `element` en la ruta `route` (con parámetros, p. ej.
 * `/campaigns/:id`) y navega a `path`, con el `CampaignProvider` real: la lista
 * de campañas y la activa se piden una vez por sesión a `campaignsService`
 * (que la prueba simula con `vi.mock`). `active` fija la respuesta simulada de
 * `GET /campaigns/active` (`null` = «Sin campaña activa»). `strict` monta bajo
 * `StrictMode`, que en desarrollo repite los efectos: sirve para comprobar que
 * una lectura con efectos en el servidor se pide una sola vez.
 */
export function renderWithFixture(
  element: ReactNode,
  {
    route,
    path,
    active,
    role = 'DIRECTIVA',
    strict = false,
    routes = [],
  }: { route: string; path: string; active: Campaign | null; role?: string; strict?: boolean; routes?: { path: string; element: ReactNode }[] },
) {
  if (vi.isMockFunction(campaignsService.active)) vi.mocked(campaignsService.active).mockResolvedValue(active);
  const tree = (
    <AuthContext.Provider value={{ user: userWith(role), isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <CampaignProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={element} />
            {routes.map((entry) => (
              <Route key={entry.path} path={entry.path} element={entry.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </CampaignProvider>
    </AuthContext.Provider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
