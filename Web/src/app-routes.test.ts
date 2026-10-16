import { describe, expect, it } from 'vitest';
// Texto fuente de App.tsx (importación `?raw` de Vite; sin APIs de Node).
import app from './App.tsx?raw';
import auditLogsPage from './pages/audit-logs.page.tsx?raw';
import calendarPage from './pages/calendar.page.tsx?raw';

// F10-SEC-02 (#45): la tabla de rutas vive en App.tsx (con BrowserRouter); se
// comprueba su texto para que ninguna pantalla de operación privada quede fuera.
const LEGACY_PRIVATE = ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard'];

describe('F10-SEC-02: App.tsx protege cada ruta legacy de operación privada', () => {
  it('usa el FarmerRoute compartido (sólo AGRICULTOR), no uno local', () => {
    // El App.tsx anterior tenía un FarmerRoute local que sólo excluía DIRECTIVA.
    expect(app).toMatch(/import \{ FarmerRoute, LegacyDirectivaRedirect \} from '\.\/components\/farmer-route';/);
    expect(app).not.toMatch(/function FarmerRoute/);
  });

  it.each(LEGACY_PRIVATE)('%s va envuelta en FarmerRoute', (path) => {
    expect(app).toMatch(new RegExp(`path="${path}"[\\s]*element=[{][\\s]*<FarmerRoute>`));
  });

  it('/directiva no renderiza la página heredada', () => {
    expect(app).toMatch(/path="\/directiva" element=\{<LegacyDirectivaRedirect \/>\}/);
    expect(app).not.toMatch(/<DirectivaPage/);
  });
});

describe('F10-SEC-02: sin filtros por agricultor que el servidor ignora', () => {
  it('bitácora y calendario no ofrecen filtrar por agricultor', () => {
    expect(auditLogsPage).not.toMatch(/audit-owner|ownerUserId: filters/);
    expect(calendarPage).not.toMatch(/calendar-owner|setOwnerUserId/);
  });
});
