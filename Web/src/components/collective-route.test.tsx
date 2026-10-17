import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homePathFor, menuPathsFor, COLLECTIVE_PATHS, WEB_NOT_FOR_FARMERS_PATH } from '../lib/navigation';
import { renderAt } from '../test/render';
import { CollectiveRoute } from './collective-route';

const PAGE = <CollectiveRoute><p>contenido colectivo</p></CollectiveRoute>;
const FALLBACKS = [
  { path: '/login', element: <p>pantalla de login</p> },
  { path: '/dashboard', element: <p>dashboard legacy</p> },
  { path: WEB_NOT_FOR_FARMERS_PATH, element: <p>aviso: la Web no es para agricultores</p> },
];

afterEach(() => vi.unstubAllEnvs());

describe('rutas colectivas F07 por rol', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s del tenant entra', (role) => {
    renderAt(PAGE, { role, path: COLLECTIVE_PATHS.summary, routes: FALLBACKS });
    expect(screen.getByText('contenido colectivo')).toBeTruthy();
  });

  it('AGRICULTOR es redirigido al aviso y no ve el contenido colectivo (#23)', () => {
    renderAt(PAGE, { role: 'AGRICULTOR', path: COLLECTIVE_PATHS.proposals, routes: FALLBACKS });
    expect(screen.queryByText('contenido colectivo')).toBeNull();
    expect(screen.getByText('aviso: la Web no es para agricultores')).toBeTruthy();
  });

  it('con el flag de rollback, AGRICULTOR vuelve al dashboard legacy, nunca al contenido colectivo', () => {
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    renderAt(PAGE, { role: 'AGRICULTOR', path: COLLECTIVE_PATHS.proposals, routes: FALLBACKS });
    expect(screen.queryByText('contenido colectivo')).toBeNull();
    expect(screen.getByText('dashboard legacy')).toBeTruthy();
  });

  it('sin sesión va al login', () => {
    renderAt(PAGE, { role: '', path: COLLECTIVE_PATHS.reconciliation, routes: FALLBACKS });
    expect(screen.queryByText('contenido colectivo')).toBeNull();
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });
});

describe('menú congelado (F07-WEB-01)', () => {
  it('DIRECTIVA: sólo vistas colectivas y campañas, sin pantallas operativas legacy', () => {
    expect(menuPathsFor('DIRECTIVA')).toEqual([
      COLLECTIVE_PATHS.summary,
      COLLECTIVE_PATHS.proposals,
      COLLECTIVE_PATHS.coverage,
      COLLECTIVE_PATHS.reconciliation,
      '/campaigns',
    ]);
  });

  it('ADMINISTRADOR: lo mismo más usuarios (ADR-003)', () => {
    expect(menuPathsFor('ADMINISTRADOR')).toEqual([...menuPathsFor('DIRECTIVA'), '/users']);
  });

  it('ningún menú institucional incluye CRUD del agricultor, cola offline ni bitácora heredada', () => {
    for (const role of ['DIRECTIVA', 'ADMINISTRADOR']) {
      for (const legacy of ['/inventory', '/purchases', '/plots', '/applications', '/sync', '/calendar', '/reports', '/directiva', '/audit-logs', '/dashboard']) {
        expect(menuPathsFor(role)).not.toContain(legacy);
      }
    }
  });

  it('AGRICULTOR no tiene menú en la Web (#23); con el flag de rollback, sólo el legacy, sin vistas colectivas', () => {
    expect(menuPathsFor('AGRICULTOR')).toEqual([]);
    expect(menuPathsFor(null)).toEqual([]);
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    expect(menuPathsFor('AGRICULTOR')).toContain('/inventory');
    for (const path of Object.values(COLLECTIVE_PATHS)) expect(menuPathsFor('AGRICULTOR')).not.toContain(path);
  });

  it('pantalla inicial por rol', () => {
    expect(homePathFor('DIRECTIVA')).toBe(COLLECTIVE_PATHS.summary);
    expect(homePathFor('ADMINISTRADOR')).toBe(COLLECTIVE_PATHS.summary);
    expect(homePathFor('AGRICULTOR')).toBe(WEB_NOT_FOR_FARMERS_PATH);
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    expect(homePathFor('AGRICULTOR')).toBe('/dashboard');
  });
});
