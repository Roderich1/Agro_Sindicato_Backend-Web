import { describe, expect, it } from 'vitest';
// Texto fuente de App.tsx (importación `?raw` de Vite; sin APIs de Node).
import app from './App.tsx?raw';
import auditLogsPage from './pages/audit-logs.page.tsx?raw';
import calendarPage from './pages/calendar.page.tsx?raw';

// Decisión del autor (2026-11-12): la Web es sólo de Directiva y Administración. Las pantallas
// de operación privada del agricultor (F10-SEC-02 #45) se retiraron; sus rutas antiguas caen en
// la ruta comodín, que lleva al inicio de cada sesión (resumen o aviso).
const OLD_FARMER_PATHS = ['/inventory', '/purchases', '/sync', '/plots', '/applications', '/reports', '/dashboard'];

describe('App.tsx: sin vistas del agricultor', () => {
  it.each(OLD_FARMER_PATHS)('%s ya no es una ruta propia', (path) => {
    expect(app).not.toMatch(new RegExp(`path="${path}"`));
  });

  it('no hay guarda de rutas del agricultor', () => {
    expect(app).not.toMatch(/FarmerRoute/);
  });

  it('una ruta desconocida lleva al inicio que corresponde a la sesión', () => {
    expect(app).toMatch(/<Route path="\*" element=\{<HomeRedirect \/>\} \/>/);
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
