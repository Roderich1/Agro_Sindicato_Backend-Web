import { act, render, screen, waitFor, within } from '@testing-library/react';
import axios, { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { Suspense, useContext, useEffect } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Texto fuente (importación `?raw` de Vite) para comprobar que no hay sondeos periódicos.
import axiosSource from '../lib/axios.ts?raw';
import authSource from './auth.context.tsx?raw';
import { AppRoutes } from '../App';
import { api, clearAccessToken, getAccessToken } from '../lib/axios';
import { memoryBackend, setCopyBackend } from '../lib/estimation-copy';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { CAMPAIGN, userWith } from '../test/render';
import { CampaignContext } from './campaign.context';
import { AuthContext, AuthProvider, type AuthContextValue } from './auth.context';

/**
 * Cierre O5 (decisión D del autor): si el rol de la cuenta cambia con la Web
 * abierta, el 403 de la consulta siguiente revalida el usuario (`GET /auth/me`)
 * y la sesión local adopta el rol vigente: la barra lateral y las guardas se
 * recalculan. Sin sondeos; el servidor sigue decidiendo cada acceso. Datos
 * sintéticos; el servidor se simula con el adaptador de axios.
 */

type Reply = { status: number; data?: unknown } | Promise<{ status: number; data?: unknown }>;

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): Promise<AxiosResponse> {
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config };
  if (status >= 400) {
    const error = new AxiosError(`HTTP ${status}`, String(status), config, undefined, response);
    return Promise.reject(error);
  }
  return Promise.resolve(response);
}

const refreshRejected = (status: number) =>
  new AxiosError('x', 'ERR', undefined, undefined, { status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {} });

const originalAdapter = api.defaults.adapter;
let meCalls = 0;
/** Simula el servidor: `routes` decide por `MÉTODO /ruta`; lo demás queda pendiente (sin datos). */
function serve(routes: Record<string, () => Reply>) {
  api.defaults.adapter = async (config) => {
    const key = `${(config.method ?? 'get').toUpperCase()} ${config.url}`;
    if (key === 'GET /auth/me') meCalls += 1;
    const handler = routes[key];
    if (!handler) return new Promise<AxiosResponse>(() => undefined);
    const reply = await handler();
    return respond(config, reply.status, reply.data);
  };
}

/** Renovación del token: arranque de la sesión con el rol dado. */
function startAs(role: string, onRefresh?: () => Promise<unknown>) {
  let first = true;
  return vi.spyOn(axios, 'post').mockImplementation(async (url: string) => {
    if (url === '/api/v1/auth/refresh') {
      if (first) {
        first = false;
        return { data: { accessToken: 'token-sintetico', user: userWith(role) } };
      }
      if (onRefresh) return onRefresh();
    }
    throw refreshRejected(404);
  });
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

let auth: AuthContextValue | null = null;
function Probe() {
  const value = useContext(AuthContext);
  useEffect(() => {
    auth = value;
  });
  return null;
}

const flush = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

beforeEach(() => {
  localStorage.clear();
  setCopyBackend(memoryBackend());
  meCalls = 0;
  auth = null;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  clearAccessToken();
  vi.restoreAllMocks();
});

describe('cambio de rol con la Web abierta (cierre O5)', () => {
  it('ADMINISTRADOR → DIRECTIVA: un 403 revalida, la barra lateral pierde Usuarios y sale de /users', async () => {
    let answerUsers: (reply: { status: number }) => void = () => undefined;
    serve({
      'GET /users': () => new Promise((resolve) => { answerUsers = resolve; }),
      'GET /auth/me': () => ({ status: 200, data: userWith('DIRECTIVA') }),
    });
    startAs('ADMINISTRADOR');

    render(
      <AuthProvider>
        <CampaignContext.Provider
          value={{ activeCampaign: CAMPAIGN, isLoading: false, error: null, refreshActiveCampaign: async () => undefined, hasActiveCampaign: true }}
        >
          <MemoryRouter initialEntries={['/users']}>
            <Suspense fallback={null}>
              <AppRoutes />
            </Suspense>
            <Where />
          </MemoryRouter>
        </CampaignContext.Provider>
      </AuthProvider>,
    );

    // Antes del cambio: rol anterior en la barra lateral, con la entrada de Administración.
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: /Usuarios/ })).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('/users');
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0);

    // El servidor ya no permite Usuarios: la consulta responde 403.
    await act(async () => answerUsers({ status: 403 }));

    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(COLLECTIVE_PATHS.summary));
    const after = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(after).queryByRole('link', { name: /Usuarios/ })).toBeNull();
    expect(within(after).getByRole('link', { name: /Resumen/ })).toBeTruthy();
    expect(screen.queryAllByText('Administrador')).toHaveLength(0);
    expect(screen.getAllByText('Directiva').length).toBeGreaterThan(0);
    expect(meCalls).toBe(1);
  });

  it('un 403 que no cambia el rol revalida una sola vez, aunque lleguen varios a la vez, y no entra en bucle', async () => {
    serve({
      'GET /collective/a': () => ({ status: 403 }),
      'GET /collective/b': () => ({ status: 403 }),
      'GET /collective/c': () => ({ status: 403 }),
      'GET /auth/me': () => ({ status: 200, data: userWith('ADMINISTRADOR') }),
    });
    startAs('ADMINISTRADOR');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth?.user?.role).toBe('ADMINISTRADOR'));
    const before = auth!.user;

    const failures = await Promise.all(['/collective/a', '/collective/b', '/collective/c'].map((url) => api.get(url).catch((err: unknown) => err)));
    // Cada consulta sigue fallando con su 403: el cliente no relaja nada.
    expect(failures.map((err) => axios.isAxiosError(err) && err.response?.status)).toEqual([403, 403, 403]);
    await flush();
    await new Promise((done) => setTimeout(done, 20));
    await flush();

    expect(meCalls).toBe(1);
    // Mismo rol: la sesión no se sustituye (ni se vuelve a pintar).
    expect(auth!.user).toBe(before);
  });

  it('la respuesta de /auth/me nunca pide otra revalidación', async () => {
    serve({
      'GET /collective/a': () => ({ status: 403 }),
      'GET /auth/me': () => ({ status: 403 }),
    });
    startAs('DIRECTIVA');
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth?.user?.role).toBe('DIRECTIVA'));
    await api.get('/collective/a').catch(() => undefined);
    await flush();
    await new Promise((done) => setTimeout(done, 20));
    expect(meCalls).toBe(1);
    expect(auth?.user?.role).toBe('DIRECTIVA');
  });

  it('401 sigue cerrando la sesión: no se revalida y se borra el token', async () => {
    serve({ 'GET /collective/a': () => ({ status: 401 }) });
    startAs('ADMINISTRADOR', async () => { throw refreshRejected(401); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // jsdom no navega a /login
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth?.user?.role).toBe('ADMINISTRADOR'));
    expect(getAccessToken()).toBe('token-sintetico');

    await api.get('/collective/a').catch(() => undefined);
    await flush();
    expect(getAccessToken()).toBeNull();
    expect(meCalls).toBe(0);
  });

  it('cuenta deshabilitada tras un 403: /auth/me responde 401 y la renovación rechazada cierra la sesión', async () => {
    serve({
      'GET /collective/a': () => ({ status: 403 }),
      'GET /auth/me': () => ({ status: 401 }),
    });
    startAs('ADMINISTRADOR', async () => { throw refreshRejected(401); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth?.user?.role).toBe('ADMINISTRADOR'));

    await api.get('/collective/a').catch(() => undefined);
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(meCalls).toBe(1);
    expect(auth?.user?.role).toBe('ADMINISTRADOR'); // la sesión se cierra navegando a /login, como antes
  });

  it('la renovación del token también trae el rol vigente y lo adopta, sin consulta extra', async () => {
    serve({ 'GET /collective/a': () => ({ status: 401 }) });
    startAs('ADMINISTRADOR', async () => ({ data: { accessToken: 'token-renovado', user: userWith('DIRECTIVA') } }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(auth?.user?.role).toBe('ADMINISTRADOR'));
    await api.get('/collective/a').catch(() => undefined);
    await waitFor(() => expect(auth?.user?.role).toBe('DIRECTIVA'));
    expect(meCalls).toBe(0);
  });

  it('no crea temporizadores periódicos: ni al abrir la sesión ni al revalidar', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const windowIntervals = window.setInterval === globalThis.setInterval ? intervals : vi.spyOn(window, 'setInterval');
    serve({
      'GET /collective/a': () => ({ status: 403 }),
      'GET /auth/me': () => ({ status: 200, data: userWith('DIRECTIVA') }),
    });
    startAs('ADMINISTRADOR');
    render(<AuthProvider><Probe /></AuthProvider>);
    // Sin `waitFor` (que sondea con setInterval): sólo se vacían las promesas pendientes.
    await flush();
    expect(auth?.user?.role).toBe('ADMINISTRADOR');
    await act(async () => { await api.get('/collective/a').catch(() => undefined); });
    await flush();
    expect(auth?.user?.role).toBe('DIRECTIVA');

    expect(intervals).not.toHaveBeenCalled();
    expect(windowIntervals).not.toHaveBeenCalled();
    // Ni en el código del cliente HTTP ni en el del contexto de sesión.
    for (const source of [axiosSource, authSource]) {
      expect(source).not.toMatch(/setInterval|refetchInterval/);
    }
  });
});
