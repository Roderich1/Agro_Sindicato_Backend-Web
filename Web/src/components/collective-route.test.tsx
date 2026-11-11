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

  it('AGRICULTOR tampoco abre la ruta directa de Productos', () => {
    renderAt(PAGE, { role: 'AGRICULTOR', path: COLLECTIVE_PATHS.products, routes: FALLBACKS });
    expect(screen.queryByText('contenido colectivo')).toBeNull();
    expect(screen.getByText('aviso: la Web no es para agricultores')).toBeTruthy();
  });

  it('sin sesión va al login', () => {
    renderAt(PAGE, { role: '', path: COLLECTIVE_PATHS.reconciliation, routes: FALLBACKS });
    expect(screen.queryByText('contenido colectivo')).toBeNull();
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });
});

describe('menú por tareas (F07-WEB-01; rediseño 2026-11-10, contrato §2)', () => {
  it('DIRECTIVA: Resumen, Campañas, Necesidades y propuestas, Compras conjuntas (E2 §6), Histórico, Catálogo y Bitácora; sin pantallas operativas legacy', () => {
    expect(menuPathsFor('DIRECTIVA')).toEqual([
      COLLECTIVE_PATHS.summary,
      '/campaigns',
      COLLECTIVE_PATHS.proposals,
      COLLECTIVE_PATHS.jointPurchaseCalls,
      COLLECTIVE_PATHS.history,
      COLLECTIVE_PATHS.catalog,
      '/audit-logs',
    ]);
  });

  it('ADMINISTRADOR: lo mismo más usuarios (ADR-003)', () => {
    expect(menuPathsFor('ADMINISTRADOR')).toEqual([...menuPathsFor('DIRECTIVA'), '/users']);
  });

  it('la cobertura y las rutas antiguas salen del menú, pero se conservan', () => {
    for (const role of ['DIRECTIVA', 'ADMINISTRADOR']) {
      for (const old of [COLLECTIVE_PATHS.coverage, COLLECTIVE_PATHS.trends, COLLECTIVE_PATHS.estimation, COLLECTIVE_PATHS.products, COLLECTIVE_PATHS.reconciliation]) {
        expect(menuPathsFor(role)).not.toContain(old);
      }
    }
    expect(COLLECTIVE_PATHS.coverage).toBe('/colectivo/cobertura');
    expect(COLLECTIVE_PATHS.trends).toBe('/colectivo/tendencias');
    expect(COLLECTIVE_PATHS.estimation).toBe('/colectivo/estimacion');
    expect(COLLECTIVE_PATHS.products).toBe('/colectivo/productos');
    expect(COLLECTIVE_PATHS.reconciliation).toBe('/colectivo/reconciliacion');
    expect(COLLECTIVE_PATHS.campaignDetail('11111111-1111-4111-8111-111111111111')).toBe('/campaigns/11111111-1111-4111-8111-111111111111');
    expect(COLLECTIVE_PATHS.jointPurchaseCalls).toBe('/colectivo/compras-conjuntas');
    expect(COLLECTIVE_PATHS.jointPurchaseCallDetail('a/b')).toBe('/colectivo/compras-conjuntas/a%2Fb');
  });

  it('ningún menú institucional incluye CRUD del agricultor ni cola offline', () => {
    for (const role of ['DIRECTIVA', 'ADMINISTRADOR']) {
      for (const legacy of ['/inventory', '/purchases', '/plots', '/applications', '/sync', '/calendar', '/reports', '/directiva', '/dashboard']) {
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
