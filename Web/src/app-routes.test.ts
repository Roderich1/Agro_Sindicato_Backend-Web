import { describe, expect, it } from 'vitest';
// Texto fuente de App.tsx (importación `?raw` de Vite; sin APIs de Node).
import app from './App.tsx?raw';

// F10-SEC-02 (#45): la tabla de rutas vive en App.tsx (con BrowserRouter); se
// comprueba su texto para que ninguna pantalla de operación privada quede fuera.
const LEGACY_PRIVATE = ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard'];

describe('F10-SEC-02: App.tsx protege cada ruta legacy de operación privada', () => {
  it.each(LEGACY_PRIVATE)('%s va envuelta en FarmerRoute', (path) => {
    expect(app).toMatch(new RegExp(`path="${path}"[\\s]*element=[{][\\s]*<FarmerRoute>`));
  });

  it('/directiva no renderiza la página heredada', () => {
    expect(app).toMatch(/path="\/directiva" element=\{<LegacyDirectivaRedirect \/>\}/);
    expect(app).not.toMatch(/<DirectivaPage/);
  });
});
