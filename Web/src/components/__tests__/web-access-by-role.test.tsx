import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Suspense, type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../App';
import { AuthContext } from '../../contexts/auth.context';
import { CampaignContext } from '../../contexts/campaign.context';
import { COLLECTIVE_PATHS, WEB_NOT_FOR_FARMERS_PATH } from '../../lib/navigation';
import { WEB_NOT_FOR_FARMERS_TEXT, WEB_NOT_FOR_FARMERS_TITLE } from '../../pages/web-not-for-farmers.page';
import { AdminRoute } from '../admin-route';
import { LegacyDirectivaRedirect } from '../legacy-directiva-redirect';
import { CAMPAIGN, renderAt, userWith } from '../../test/render';
import { api } from '../../lib/axios';

/**
 * Decisión del autor (2026-11-12): la Web es sólo de Directiva y Administración;
 * el AGRICULTOR usa exclusivamente la app móvil. Se prueba con la tabla de rutas
 * real (`AppRoutes`): una cuenta AGRICULTOR, entre por donde entre, sólo ve el
 * aviso, sin menú y sin consultas institucionales.
 */
afterEach(() => vi.restoreAllMocks());

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}</output>;
}

function Providers({ role, logout, path, children }: { role: string; logout: () => Promise<void>; path: string; children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: role ? userWith(role) : null, isLoading: false, login: async () => undefined, logout }}>
      <CampaignContext.Provider
        value={{ activeCampaign: CAMPAIGN, isLoading: false, error: null, refreshActiveCampaign: async () => undefined, hasActiveCampaign: true }}
      >
        <MemoryRouter initialEntries={[path]}>
          <Suspense fallback={null}>{children}</Suspense>
          <Where />
        </MemoryRouter>
      </CampaignContext.Provider>
    </AuthContext.Provider>
  );
}

function renderRoutes(role: string, path: string, logout = vi.fn(async () => undefined)) {
  const view = render(
    <Providers role={role} logout={logout} path={path}>
      <AppRoutes />
    </Providers>,
  );
  return { logout, unmount: view.unmount };
}

// Rutas antiguas del agricultor (retiradas), institucionales y de administración.
const OLD_FARMER_PATHS = ['/dashboard', '/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports'];
const INSTITUTIONAL_PATHS = [
  COLLECTIVE_PATHS.summary,
  COLLECTIVE_PATHS.proposals,
  COLLECTIVE_PATHS.jointPurchaseCalls,
  `${COLLECTIVE_PATHS.jointPurchaseCalls}/c-1`,
  COLLECTIVE_PATHS.coverage,
  COLLECTIVE_PATHS.history,
  COLLECTIVE_PATHS.catalog,
  '/campaigns',
  '/campaigns/c-1',
  '/calendar',
  '/audit-logs',
  '/users',
  '/directiva',
  '/',
  '/ruta-que-no-existe',
];

describe('cuenta AGRICULTOR en la Web', () => {
  it.each([...OLD_FARMER_PATHS, ...INSTITUTIONAL_PATHS])('entrando por %s sólo ve el aviso, sin menú ni consultas', async (path) => {
    const get = vi.spyOn(api, 'get');
    const post = vi.spyOn(api, 'post');
    renderRoutes('AGRICULTOR', path);
    expect(await screen.findByRole('heading', { name: WEB_NOT_FOR_FARMERS_TITLE })).toBeTruthy();
    expect(screen.getByText(WEB_NOT_FOR_FARMERS_TEXT)).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe(WEB_NOT_FOR_FARMERS_PATH);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: /Resumen|Usuarios|Bitácora/ })).toBeNull();
    // Ninguna consulta institucional sale desde la sesión bloqueada.
    await new Promise((done) => setTimeout(done, 20));
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('el aviso no ofrece funciones del agricultor ni un enlace de descarga', async () => {
    renderRoutes('AGRICULTOR', WEB_NOT_FOR_FARMERS_PATH);
    await screen.findByRole('heading', { name: WEB_NOT_FOR_FARMERS_TITLE });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cambiar de cuenta', 'Cerrar sesión']);
    expect(screen.queryByText(/descarg/i)).toBeNull();
  });

  it('«Cerrar sesión» cierra la sesión de la Web', async () => {
    const { logout } = renderRoutes('AGRICULTOR', WEB_NOT_FOR_FARMERS_PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('«Cambiar de cuenta» cierra la sesión y abre el inicio de sesión', async () => {
    const { logout } = renderRoutes('AGRICULTOR', WEB_NOT_FOR_FARMERS_PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar de cuenta' }));
    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login'));
  });
});

describe('Directiva y Administración', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s en una ruta antigua del agricultor vuelve a su resumen', async (role) => {
    // El resumen pediría datos: aquí sólo importa adónde lleva la ruta.
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    for (const path of OLD_FARMER_PATHS) {
      const { unmount } = renderRoutes(role, path);
      await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(COLLECTIVE_PATHS.summary));
      expect(screen.queryByRole('heading', { name: WEB_NOT_FOR_FARMERS_TITLE })).toBeNull();
      unmount();
    }
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s no se queda en el aviso: vuelve a su resumen', async (role) => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    renderRoutes(role, WEB_NOT_FOR_FARMERS_PATH);
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(COLLECTIVE_PATHS.summary));
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])(
    '%s en el enlace antiguo /calendar llega a Campañas, sin llamar al calendario ni a Usuarios',
    async (role) => {
      const get = vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
      const post = vi.spyOn(api, 'post').mockReturnValue(new Promise(() => undefined));
      renderRoutes(role, '/calendar');
      await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/campaigns'));
      await new Promise((done) => setTimeout(done, 20));
      const urls = [...get.mock.calls, ...post.mock.calls].map(([url]) => String(url));
      expect(urls.some((url) => url.includes('/calendar'))).toBe(false);
      expect(urls.some((url) => /^\/?users\b/.test(url.replace(/^\/api\/v1/, '')))).toBe(false);
    },
  );

  it('sin sesión, cualquier ruta lleva al inicio de sesión', async () => {
    renderRoutes('', '/inventory');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login'));
  });
});

describe('rutas heredadas institucionales', () => {
  const FALLBACKS = [
    { path: COLLECTIVE_PATHS.summary, element: <p>resumen colectivo</p> },
    { path: COLLECTIVE_PATHS.proposals, element: <p>propuesta borrador</p> },
  ];

  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('/directiva heredada no muestra la compra ejecutable (%s)', (role) => {
    renderAt(<LegacyDirectivaRedirect />, { role, path: '/directiva', routes: FALLBACKS });
    expect(screen.getByText('propuesta borrador')).toBeTruthy();
  });

  it('/directiva heredada conserva ?campaign= al llevar a la propuesta', () => {
    function Search() {
      const location = useLocation();
      return <p>{`propuesta ${location.search}`}</p>;
    }
    renderAt(<LegacyDirectivaRedirect />, {
      role: 'DIRECTIVA',
      path: '/directiva?campaign=11111111-1111-4111-8111-111111111111',
      routes: [{ path: COLLECTIVE_PATHS.proposals, element: <Search /> }],
    });
    expect(screen.getByText('propuesta ?campaign=11111111-1111-4111-8111-111111111111')).toBeTruthy();
  });

  it('DIRECTIVA en /users vuelve a su vista colectiva (Usuarios es sólo de Administración)', () => {
    renderAt(<AdminRoute><p>usuarios</p></AdminRoute>, { role: 'DIRECTIVA', path: '/users', routes: FALLBACKS });
    expect(screen.queryByText('usuarios')).toBeNull();
    expect(screen.getByText('resumen colectivo')).toBeTruthy();
  });
});
