import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// F10-SEC-02 (#45): la tabla de rutas vive en App.tsx (con BrowserRouter); se
// comprueba su texto para que ninguna pantalla de operación privada quede fuera.
const LEGACY_PRIVATE = ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard'];

describe('F10-SEC-02: App.tsx protege cada ruta legacy de operación privada', () => {
  const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it.each(LEGACY_PRIVATE)('%s va envuelta en FarmerRoute', (path) => {
    expect(app).toMatch(new RegExp(`path="${path}"[\\s]*element=[{][\\s]*<FarmerRoute>`));
  });

  it('/directiva no renderiza la página heredada', () => {
    expect(app).toMatch(/path="\/directiva" element=\{<LegacyDirectivaRedirect \/>\}/);
    expect(app).not.toMatch(/<DirectivaPage/);
  });
});
