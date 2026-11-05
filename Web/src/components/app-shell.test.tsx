import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { renderAt } from '../test/render';
import { AppShell } from './app-shell';

vi.mock('../services/campaigns.service', () => ({ campaignsService: { active: vi.fn(), list: vi.fn() } }));

/** Panel de la defensa (2026-11-05): menú compacto y agrupado, etiqueta «Datos sintéticos» sólo cuando el servidor lo declara. */
describe('AppShell: menú y etiqueta de datos sintéticos', () => {
  afterEach(() => reportDisclosureMode(null));

  it('DIRECTIVA: primero el recorrido principal y la cobertura; Campañas y Equivalencias de productos bajo «Gestión»', () => {
    renderAt(<AppShell title="Resumen colectivo" section="Colectivo"><p>contenido</p></AppShell>, { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const nav = screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen colectivo', 'Propuesta conjunta', 'Tendencias', 'Estimación del consumo', 'Cobertura', 'Campañas', 'Equivalencias de productos']);
    expect(within(nav).getByText('Gestión')).toBeTruthy();
    // Las rutas no cambian.
    expect(within(nav).getByRole('link', { name: 'Equivalencias de productos' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.reconciliation);
    expect(within(nav).getByRole('link', { name: 'Tendencias' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.trends);
    expect(within(nav).getByRole('link', { name: 'Resumen colectivo' }).getAttribute('aria-current')).toBe('page');
  });

  it('ADMINISTRADOR: «Usuarios» también bajo Gestión', () => {
    renderAt(<AppShell title="Campañas" section="Gestión"><p>contenido</p></AppShell>, { role: 'ADMINISTRADOR', path: '/campaigns' });
    const nav = screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels.slice(-3)).toEqual(['Campañas', 'Equivalencias de productos', 'Usuarios']);
  });

  it('el nombre del sindicato se muestra completo bajo el logo (sin truncar) y la campaña activa en la cabecera', () => {
    renderAt(<AppShell title="Resumen colectivo" section="Colectivo"><p>contenido</p></AppShell>, { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const tenant = screen.getAllByText('Sindicato sintético')[0]!;
    expect(tenant.className).toMatch(/whitespace-normal/);
    expect(tenant.className).not.toMatch(/truncate|nowrap/);
    expect(screen.getByTitle('Campaña activa del sindicato').textContent).toMatch(/Activa.*Campaña sintética/);
  });

  it('«Datos sintéticos» sólo cuando una respuesta del servidor declara el modo provisional', () => {
    renderAt(<AppShell title="Resumen colectivo" section="Colectivo"><p>contenido</p></AppShell>, { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
    act(() => reportDisclosureMode('PROVISIONAL_SYNTHETIC'));
    expect(screen.getByTestId('synthetic-badge').textContent).toBe('Datos sintéticos');
    act(() => reportDisclosureMode('POLICY_PENDING'));
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
  });
});
