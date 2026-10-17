import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
// Texto fuente de App.tsx (importación `?raw` de Vite; sin APIs de Node).
import app from '../../App.tsx?raw';
import viteConfig from '../../../vite.config.ts?raw';
import { AuthContext } from '../../contexts/auth.context';
import { extractError } from '../../lib/format';
import { COLLECTIVE_PATHS, WEB_NOT_FOR_FARMERS_PATH } from '../../lib/navigation';
import { OFFLINE_QUEUE_KEY } from '../../lib/offline-queue';
import { WebNotForFarmersPage } from '../../pages/web-not-for-farmers.page';
import { renderAt, userWith } from '../../test/render';
import { AppShell } from '../app-shell';
import { PrivateRoute } from '../private-route';

/**
 * F07-WEB-01 (#23): la Web es online-first para DIRECTIVA y ADMINISTRADOR del
 * tenant (ADR-003). Un usuario con otro rol no recibe menú ni datos, la cola
 * offline legacy no está en uso y una acción sin conexión no se encola. El
 * flag `VITE_LEGACY_FARMER_WEB=enabled` es el rollback de la transición
 * (PHASE 5 de TRANSITION_PLAN.md); se prueban sus dos valores.
 */
const FALLBACKS = [
  { path: '/login', element: <p>pantalla de login</p> },
  { path: '/dashboard', element: <p>dashboard legacy</p> },
  { path: COLLECTIVE_PATHS.summary, element: <p>resumen colectivo</p> },
  { path: WEB_NOT_FOR_FARMERS_PATH, element: <p>aviso: la Web no es para agricultores</p> },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PrivateRoute (campañas y calendario)', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s entra', (role) => {
    renderAt(<PrivateRoute><p>campañas</p></PrivateRoute>, { role, path: '/campaigns', routes: FALLBACKS });
    expect(screen.getByText('campañas')).toBeTruthy();
  });

  it.each(['/campaigns', '/calendar'])('AGRICULTOR en %s va al aviso, sin datos', (path) => {
    renderAt(<PrivateRoute><p>datos</p></PrivateRoute>, { role: 'AGRICULTOR', path, routes: FALLBACKS });
    expect(screen.queryByText('datos')).toBeNull();
    expect(screen.getByText('aviso: la Web no es para agricultores')).toBeTruthy();
  });

  it('con el flag de rollback, AGRICULTOR conserva campañas y calendario legacy', () => {
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    renderAt(<PrivateRoute><p>datos</p></PrivateRoute>, { role: 'AGRICULTOR', path: '/calendar', routes: FALLBACKS });
    expect(screen.getByText('datos')).toBeTruthy();
  });
});

describe('aviso para quien no es Directiva ni Administrador', () => {
  it('AGRICULTOR: sin menú ni navegación, sólo el aviso y cerrar sesión', () => {
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
    expect(screen.getByRole('heading', { name: /Esta Web es para la Directiva y el Administrador/ })).toBeTruthy();
    expect(screen.getByText(/se registran en la app móvil/)).toBeTruthy();
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

  it('con el flag de rollback, el aviso devuelve al AGRICULTOR a su dashboard legacy', () => {
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    renderAt(<WebNotForFarmersPage />, { role: 'AGRICULTOR', path: WEB_NOT_FOR_FARMERS_PATH, routes: FALLBACKS });
    expect(screen.getByText('dashboard legacy')).toBeTruthy();
  });

  it('App.tsx registra la ruta del aviso', () => {
    expect(app).toMatch(/<Route path=\{WEB_NOT_FOR_FARMERS_PATH\} element=\{<WebNotForFarmersPage \/>\} \/>/);
  });
});

describe('cola offline de negocio: no está en uso', () => {
  const queued = JSON.stringify([{ clientOperationId: 'op-1', operation: 'CREATE_PURCHASE', payload: {}, queuedAt: '2026-10-17T00:00:00.000Z' }]);

  it('el AppShell institucional no lee la cola offline legacy', () => {
    localStorage.setItem(OFFLINE_QUEUE_KEY, queued);
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    renderAt(<AppShell title="Resumen" section="Colectivo"><p>contenido</p></AppShell>, { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(getItem.mock.calls.some(([key]) => key === OFFLINE_QUEUE_KEY)).toBe(false);
    expect(screen.queryByRole('link', { name: /Sincroniz/ })).toBeNull();
  });

  it('con el flag de rollback, la cola legacy vuelve a leerse (sólo para el AGRICULTOR)', () => {
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    localStorage.setItem(OFFLINE_QUEUE_KEY, queued);
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    renderAt(<AppShell title="Inicio" section="Legacy"><p>contenido</p></AppShell>, { role: 'AGRICULTOR', path: '/dashboard' });
    expect(getItem.mock.calls.some(([key]) => key === OFFLINE_QUEUE_KEY)).toBe(true);
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
