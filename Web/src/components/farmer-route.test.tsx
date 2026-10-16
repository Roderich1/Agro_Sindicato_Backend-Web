import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { renderAt } from '../test/render';
import { AdminRoute } from './admin-route';
import { FarmerRoute, LegacyDirectivaRedirect } from './farmer-route';

const FALLBACKS = [
  { path: '/login', element: <p>pantalla de login</p> },
  { path: '/dashboard', element: <p>dashboard legacy</p> },
  { path: COLLECTIVE_PATHS.summary, element: <p>resumen colectivo</p> },
  { path: COLLECTIVE_PATHS.proposals, element: <p>propuesta borrador</p> },
];
const PRIVATE = <FarmerRoute><p>operación privada legacy</p></FarmerRoute>;
// Pantallas legacy de operación privada (ver app-routes.test.ts).
const LEGACY_PRIVATE = ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard'];

describe('F10-SEC-02: pantallas legacy de operación privada', () => {
  it.each(['DIRECTIVA', 'ADMINISTRADOR'])('%s no entra a la operación privada y vuelve a su vista colectiva', (role) => {
    for (const path of LEGACY_PRIVATE.filter((p) => p !== '/dashboard')) {
      const { unmount } = renderAt(PRIVATE, { role, path, routes: FALLBACKS });
      expect(screen.queryByText('operación privada legacy')).toBeNull();
      expect(screen.getByText('resumen colectivo')).toBeTruthy();
      unmount();
    }
  });

  it('AGRICULTOR conserva sus pantallas legacy (sin retirada destructiva)', () => {
    renderAt(PRIVATE, { role: 'AGRICULTOR', path: '/inventory', routes: FALLBACKS });
    expect(screen.getByText('operación privada legacy')).toBeTruthy();
  });

  it('sin sesión va al login', () => {
    renderAt(PRIVATE, { role: '', path: '/purchases', routes: FALLBACKS });
    expect(screen.getByText('pantalla de login')).toBeTruthy();
  });

  it.each(['DIRECTIVA', 'ADMINISTRADOR', 'AGRICULTOR'])('/directiva heredada no muestra la compra ejecutable (%s)', (role) => {
    renderAt(<LegacyDirectivaRedirect />, { role, path: '/directiva', routes: FALLBACKS });
    expect(screen.getByText('propuesta borrador')).toBeTruthy();
  });

  it('DIRECTIVA en /users vuelve a su vista colectiva, no al dashboard legacy', () => {
    renderAt(<AdminRoute><p>usuarios</p></AdminRoute>, { role: 'DIRECTIVA', path: '/users', routes: FALLBACKS });
    expect(screen.queryByText('usuarios')).toBeNull();
    expect(screen.getByText('resumen colectivo')).toBeTruthy();
  });
});
