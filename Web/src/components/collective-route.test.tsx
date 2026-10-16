import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { homePathFor, menuPathsFor, COLLECTIVE_PATHS } from '../lib/navigation';
import { renderAt } from '../test/render';
import { CollectiveRoute } from './collective-route';

const PAGE = <CollectiveRoute><p>contenido colectivo</p></CollectiveRoute>;
const FALLBACKS = [
  { path: '/login', element: <p>pantalla de login</p> },
  { path: '/dashboard', element: <p>dashboard legacy</p> },
];

describe('rutas colectivas F07 por rol', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s del tenant entra', (role) => {
    renderAt(PAGE, { role, path: COLLECTIVE_PATHS.summary, routes: FALLBACKS });
    expect(screen.getByText('contenido colectivo')).toBeTruthy();
  });

  it('AGRICULTOR es redirigido y no ve el contenido colectivo', () => {
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

  it('AGRICULTOR no ve vistas colectivas en el menú', () => {
    for (const path of Object.values(COLLECTIVE_PATHS)) expect(menuPathsFor('AGRICULTOR')).not.toContain(path);
    expect(menuPathsFor(null)).toEqual([]);
  });

  it('pantalla inicial por rol', () => {
    expect(homePathFor('DIRECTIVA')).toBe(COLLECTIVE_PATHS.summary);
    expect(homePathFor('ADMINISTRADOR')).toBe(COLLECTIVE_PATHS.summary);
    expect(homePathFor('AGRICULTOR')).toBe('/dashboard');
  });
});
