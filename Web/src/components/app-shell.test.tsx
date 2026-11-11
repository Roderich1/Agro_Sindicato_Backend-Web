import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportDisclosureMode } from '../lib/data-mode';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { renderAt } from '../test/render';
import { AppShell } from './app-shell';

vi.mock('../services/campaigns.service', () => ({ campaignsService: { active: vi.fn(), list: vi.fn() } }));

const shell = (title = 'Resumen', section = 'Colectivo') => (
  <AppShell title={title} section={section}>
    <p>contenido</p>
  </AppShell>
);

function mainNav() {
  return screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
}

/** Rediseño 2026-11-10 (contrato §2 y §11): navegación por tareas, barra lateral clara, sin h1 en el armazón. */
describe('AppShell: menú por tareas', () => {
  it('DIRECTIVA: cinco tareas y, bajo «Administración», sólo la Bitácora', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const nav = mainNav();
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen', 'Campañas', 'Necesidades y propuestas', 'Histórico y estimaciones', 'Catálogo y equivalencias', 'Bitácora']);
    expect(within(nav).getByText('Administración')).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Histórico y estimaciones' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.history);
    expect(within(nav).getByRole('link', { name: 'Catálogo y equivalencias' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.catalog);
    expect(within(nav).getByRole('link', { name: 'Bitácora' }).getAttribute('href')).toBe('/audit-logs');
    expect(within(nav).getByRole('link', { name: 'Resumen' }).getAttribute('aria-current')).toBe('page');
    // La cobertura sale del menú (se abre desde el Resumen); su ruta se conserva.
    expect(within(nav).queryByRole('link', { name: /Cobertura/ })).toBeNull();
  });

  it('ADMINISTRADOR: «Administración» con Bitácora y Usuarios', () => {
    renderAt(shell('Usuarios', 'Administración'), { role: 'ADMINISTRADOR', path: '/users' });
    const nav = mainNav();
    const labels = within(nav).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels.slice(-2)).toEqual(['Bitácora', 'Usuarios']);
    expect(within(nav).getByRole('link', { name: 'Usuarios' }).getAttribute('aria-current')).toBe('page');
  });

  it('las rutas antiguas y las subrutas marcan su sección como activa', () => {
    renderAt(shell('Estimación del consumo'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.estimation });
    expect(within(mainNav()).getByRole('link', { name: 'Histórico y estimaciones' }).getAttribute('aria-current')).toBe('page');
  });

  it('el ítem activo se distingue también por texto y peso, no sólo por color; los iconos son decorativos', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.proposals });
    const active = within(mainNav()).getByRole('link', { name: 'Necesidades y propuestas' });
    expect(active.className).toMatch(/font-semibold/);
    expect(active.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(active.className).not.toMatch(/transition|backdrop|gradient/);
  });
});

describe('AppShell: cabecera', () => {
  afterEach(() => reportDisclosureMode(null));

  it('no pone el h1 (lo pone PageHeader); muestra sección y vista como texto', () => {
    renderAt(shell('Resumen', 'Colectivo'), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByTestId('shell-title').textContent).toBe('Resumen');
  });

  it('el nombre del sindicato se muestra completo bajo el logo (sin truncar) y la campaña activa en la cabecera', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const tenant = screen.getAllByText('Sindicato sintético')[0]!;
    expect(tenant.className).toMatch(/whitespace-normal/);
    expect(tenant.className).not.toMatch(/truncate|nowrap/);
    expect(screen.getByTitle('Campaña activa del sindicato').textContent).toMatch(/Activa.*Campaña sintética/);
  });

  it('la conexión se dice con texto', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.getByTestId('connection').textContent).toMatch(/En línea|Sin conexión/);
  });

  it('«Datos sintéticos» sólo cuando una respuesta del servidor declara el modo provisional', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
    act(() => reportDisclosureMode('PROVISIONAL_SYNTHETIC'));
    expect(screen.getByTestId('synthetic-badge').textContent).toBe('Datos sintéticos');
    act(() => reportDisclosureMode('POLICY_PENDING'));
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
  });
});

describe('AppShell: teléfono', () => {
  it('barra inferior con cuatro tareas y etiquetas cortas visibles', () => {
    renderAt(shell(), { role: 'ADMINISTRADOR', path: COLLECTIVE_PATHS.history });
    const bottom = screen.getByRole('navigation', { name: 'Navegación rápida' });
    const labels = within(bottom).getAllByRole('link').map((link) => link.textContent?.trim());
    expect(labels).toEqual(['Resumen', 'Campañas', 'Necesidades', 'Histórico']);
    expect(within(bottom).getByRole('link', { name: 'Histórico' }).getAttribute('aria-current')).toBe('page');
    expect(bottom.className).toContain('ui-bottom-nav');
  });

  it('menú desplegable: botón con nombre, foco en el primer enlace, Escape cierra y devuelve el foco', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    fireEvent.click(toggle);
    const dialog = screen.getByRole('dialog', { name: 'Menú' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('link', { name: 'Resumen' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menú' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('el foco no sale del menú abierto con Tab', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const dialog = screen.getByRole('dialog', { name: 'Menú' });
    const logout = within(dialog).getByRole('button', { name: 'Cerrar sesión' });
    logout.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cerrar menú' }));
  });

  it('«Cerrar menú» y elegir una sección cierran el menú', () => {
    renderAt(shell(), { role: 'DIRECTIVA', path: COLLECTIVE_PATHS.summary });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Resumen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
