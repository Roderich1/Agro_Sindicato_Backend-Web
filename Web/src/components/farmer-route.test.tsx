import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
// Pantallas legacy de operación privada; App.tsx las envuelve en FarmerRoute.
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

describe('F10-SEC-02: App.tsx protege cada ruta legacy de operación privada', () => {
  // La tabla de rutas vive en App.tsx (con BrowserRouter); se comprueba su texto.
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it.each(LEGACY_PRIVATE)('%s va envuelta en FarmerRoute', (path) => {
    expect(app).toMatch(new RegExp(`path="${path}"[\\s]*element=[{][\\s]*<FarmerRoute>`));
  });

  it('/directiva no renderiza la página heredada', () => {
    expect(app).toMatch(/path="\/directiva" element=\{<LegacyDirectivaRedirect \/>\}/);
    expect(app).not.toMatch(/<DirectivaPage/);
  });
});
