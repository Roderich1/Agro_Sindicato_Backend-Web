import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Texto fuente de App.tsx (importación `?raw` de Vite; sin APIs de Node).
import app from '../../App.tsx?raw';
import viteConfig from '../../../vite.config.ts?raw';
import { AuthContext } from '../../contexts/auth.context';
import { CampaignProvider } from '../../contexts/campaign.context';
import { extractError, offlineMessage } from '../../lib/format';
import { COLLECTIVE_PATHS, WEB_NOT_FOR_FARMERS_PATH } from '../../lib/navigation';
import { UsersPage } from '../../pages/users.page';
import { WebNotForFarmersPage } from '../../pages/web-not-for-farmers.page';
import { campaignsService } from '../../services/campaigns.service';
import { listUsers } from '../../services/users.service';
import { renderAt, userWith } from '../../test/render';
import { AppShell } from '../app-shell';
import { PrivateRoute } from '../private-route';

vi.mock('../../services/users.service', () => ({
  listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetUserPassword: vi.fn(), deactivateUser: vi.fn(),
}));
vi.mock('../../services/campaigns.service', () => ({ campaignsService: { active: vi.fn(), list: vi.fn() } }));

/**
 * F07-WEB-01 (#23) y decisión del autor del 2026-11-12: la Web es sólo de
 * DIRECTIVA y ADMINISTRADOR (ADR-003). Un usuario con otro rol no recibe menú
 * ni datos, la Web no tiene cola offline y una acción sin conexión no se
 * encola. El acceso con la tabla de rutas real está en web-access-by-role.test.
 */
const FALLBACKS = [
  { path: '/login', element: <p>pantalla de login</p> },
  { path: COLLECTIVE_PATHS.summary, element: <p>resumen colectivo</p> },
  { path: WEB_NOT_FOR_FARMERS_PATH, element: <p>aviso: la Web no es para agricultores</p> },
];

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PrivateRoute (campañas y enlaces antiguos del calendario)', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s entra', (role) => {
    renderAt(<PrivateRoute><p>campañas</p></PrivateRoute>, { role, path: '/campaigns', routes: FALLBACKS });
    expect(screen.getByText('campañas')).toBeTruthy();
  });

  it.each(['/campaigns', '/calendar'])('AGRICULTOR en %s va al aviso, sin datos', (path) => {
    renderAt(<PrivateRoute><p>datos</p></PrivateRoute>, { role: 'AGRICULTOR', path, routes: FALLBACKS });
    expect(screen.queryByText('datos')).toBeNull();
    expect(screen.getByText('aviso: la Web no es para agricultores')).toBeTruthy();
  });

});

describe('aviso para quien no es Directiva ni Administrador', () => {
  it('AGRICULTOR: sin menú ni navegación, sólo el aviso, cambiar de cuenta y cerrar sesión', () => {
    const logout = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={{ user: userWith('AGRICULTOR'), isLoading: false, login: async () => undefined, logout }}>
        <MemoryRouter initialEntries={[WEB_NOT_FOR_FARMERS_PATH]}>
          <Routes>
            <Route path={WEB_NOT_FOR_FARMERS_PATH} element={<WebNotForFarmersPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('heading', { name: 'Esta cuenta utiliza la aplicación móvil.' })).toBeTruthy();
    expect(screen.getByText('La Web está disponible para Directiva y Administración.')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s no se queda en el aviso: vuelve a su vista colectiva', (role) => {
    renderAt(<WebNotForFarmersPage />, { role, path: WEB_NOT_FOR_FARMERS_PATH, routes: FALLBACKS });
    expect(screen.getByText('resumen colectivo')).toBeTruthy();
  });

  it('sin sesión va al login', () => {
    renderAt(<WebNotForFarmersPage />, { role: '', path: WEB_NOT_FOR_FARMERS_PATH, routes: FALLBACKS });
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });


  it('App.tsx registra la ruta del aviso', () => {
    expect(app).toMatch(/<Route path=\{WEB_NOT_FOR_FARMERS_PATH\} element=\{<WebNotForFarmersPage \/>\} \/>/);
  });
});

describe('la Web no tiene cola offline de negocio', () => {
  it('el AppShell institucional no lee ninguna cola offline ni ofrece «Sincronización»', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    renderAt(<AppShell title="Resumen" section="Colectivo"><p>contenido</p></AppShell>, { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(getItem.mock.calls.some(([key]) => /offline|queue|cola/i.test(String(key)))).toBe(false);
    expect(screen.queryByRole('link', { name: /Sincroniz/ })).toBeNull();
  });

  it('un fallo de red siempre da el aviso de conectividad (la Web no tiene cola que lo haga falso)', () => {
    expect(offlineMessage(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatch(/Sin conexión con el servidor/);
    expect(offlineMessage(new Error('otro'))).toBeNull();
  });

  it('una acción sin conexión no se encola: se informa la falta de conectividad', () => {
    const before = localStorage.length;
    const message = extractError(new AxiosError('Network Error', 'ERR_NETWORK'), 'No se pudo guardar');
    expect(message).toMatch(/Sin conexión con el servidor/);
    expect(message).toMatch(/no guarda operaciones para después/);
    expect(localStorage.length).toBe(before);
  });

  it('el service worker sólo cachea el app-shell, nunca respuestas del API', () => {
    expect(viteConfig).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,svg,png,ico\}'\]/);
    expect(viteConfig).not.toMatch(/runtimeCaching/);
    expect(viteConfig).not.toMatch(/agricultores\./);
  });
});

describe('sin conexión en las pantallas institucionales y datos del agricultor', () => {
  it('usuarios (ADMINISTRADOR): sin red informa la falta de conectividad, no un error genérico', async () => {
    vi.mocked(listUsers).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderAt(<UsersPage />, { role: 'ADMINISTRADOR', path: '/users' });
    await waitFor(() => expect(screen.getByText(/Sin conexión con el servidor/)).toBeTruthy());
    expect(screen.queryByText('No fue posible cargar los usuarios.')).toBeNull();
  });


  function withProvider(role: string) {
    return render(
      <AuthContext.Provider value={{ user: userWith(role), isLoading: false, login: async () => undefined, logout: async () => undefined }}>
        <CampaignProvider><p>contenido</p></CampaignProvider>
      </AuthContext.Provider>,
    );
  }

  it('el AGRICULTOR no pide la campaña activa: no recibe datos en la Web', async () => {
    vi.mocked(campaignsService.active).mockResolvedValue(null as never);
    withProvider('AGRICULTOR');
    await new Promise((done) => setTimeout(done, 20));
    expect(campaignsService.active).not.toHaveBeenCalled();
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s sí pide la campaña activa', async (role) => {
    vi.mocked(campaignsService.active).mockResolvedValue(null as never);
    withProvider(role);
    await waitFor(() => expect(campaignsService.active).toHaveBeenCalled());
  });

});

