import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fixtures from '../dev/fixtures/campaigns-fixtures';
import { CAMPAIGN_IDS, LONG_CAMPAIGN_NAME } from '../dev/fixtures/campaigns-fixtures';
import { renderWithFixture } from '../dev/fixtures/summary-render';
import { campaignsService } from '../services/campaigns.service';
import type { Campaign } from '../types/campaigns';
import { CampaignsPage } from './campaigns.page';

vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn(), create: vi.fn(), update: vi.fn(), open: vi.fn(), close: vi.fn() },
}));

function show(list: Campaign[], { role = 'DIRECTIVA', active = fixtures.activeOf(list) }: { role?: string; active?: Campaign | null } = {}) {
  vi.mocked(campaignsService.list).mockResolvedValue(list);
  return renderWithFixture(<CampaignsPage />, { route: '/campaigns', path: '/campaigns', active, role });
}

function row(name: string) {
  return screen.getByTestId(`campaign-row-${name}`);
}

function expectNoWrites() {
  for (const write of [campaignsService.create, campaignsService.update, campaignsService.open, campaignsService.close]) {
    expect(write).not.toHaveBeenCalled();
  }
}

describe('Campañas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sólo se fija la fecha («hoy» = 10 nov 2026); los temporizadores siguen siendo reales.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 10, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('worst: lista todas las ABIERTA, «Activa» sólo con isActive, y separa fin estimado de cierre registrado', async () => {
    show(fixtures.worst);
    await screen.findByTestId(`campaign-row-${LONG_CAMPAIGN_NAME}`);
    const open = fixtures.worst.filter((campaign) => campaign.status === 'ABIERTA');
    expect(open.length).toBe(3);
    for (const campaign of open) expect(within(row(campaign.name)).getByText('Abierta')).toBeTruthy();
    // Nombres que sólo difieren en mayúsculas: dos filas distintas.
    expect(row('Campaña de verano 2026')).not.toBe(row('Campaña de Verano 2026'));
    const activeRows = fixtures.worst.filter((campaign) => within(row(campaign.name)).queryByText('Activa'));
    expect(activeRows.map((campaign) => campaign.id)).toEqual([CAMPAIGN_IDS.worstActive]);
    expect(screen.getByTestId('campaign-counts').textContent).toMatch(/hay 3 campañas abiertas/);

    // Columnas distintas: «Cerrada el …» sólo con closedAt.
    expect(screen.getByRole('columnheader', { name: 'Fin estimado' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Cierre registrado' })).toBeTruthy();
    expect(within(row('Campaña de invierno 2025')).getByTestId('closed-at').textContent).toMatch(/^Cerrada el /);
    expect(within(row(LONG_CAMPAIGN_NAME)).getByTestId('closed-at').textContent).toBe('Sin cierre registrado');
    // El día de calendario no se corre al día anterior.
    expect(within(row(LONG_CAMPAIGN_NAME)).getByTestId('estimated-end').textContent).toMatch(/15/);
    expectNoWrites();
  });

  it('«Fin estimado vencido» sólo en ABIERTA con fecha estimada pasada', async () => {
    show(fixtures.worst);
    await screen.findByTestId(`campaign-row-${LONG_CAMPAIGN_NAME}`);
    const overdue = fixtures.worst.filter((campaign) => within(row(campaign.name)).queryByText('Fin estimado vencido · sin cierre registrado'));
    expect(overdue.map((campaign) => campaign.id).sort()).toEqual([CAMPAIGN_IDS.worstActive, CAMPAIGN_IDS.worstOpenCaseTwin].sort());
    // También en la tarjeta de la campaña activa, como texto.
    expect(within(screen.getByTestId('active-campaign')).getByText('Fin estimado vencido · sin cierre registrado')).toBeTruthy();
  });

  it('cada fila enlaza a su detalle; sin reabrir ni cancelar', async () => {
    show(fixtures.worst);
    await screen.findByTestId(`campaign-row-${LONG_CAMPAIGN_NAME}`);
    const link = within(row('Campaña de invierno 2025')).getByRole('link', { name: /Ver detalle/ });
    expect(link.getAttribute('href')).toBe(`/campaigns/${CAMPAIGN_IDS.worstClosedUnsealed}`);
    expect(screen.queryByRole('button', { name: /Reabrir|Cancelar campaña/ })).toBeNull();
    expect(within(row('Campaña de invierno 2025')).queryByRole('button', { name: 'Abrir' })).toBeNull();
  });

  it('cerrar conserva la confirmación: nada se envía hasta confirmar', async () => {
    vi.mocked(campaignsService.close).mockResolvedValue({ ...fixtures.worst[0], status: 'CERRADA', isActive: false });
    show(fixtures.worst);
    fireEvent.click(await within(await screen.findByTestId(`campaign-row-${LONG_CAMPAIGN_NAME}`)).findByRole('button', { name: 'Cerrar' }));
    expect(campaignsService.close).not.toHaveBeenCalled();
    expect(screen.getByText(/Cerrar no es sellar/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar campaña' }));
    await waitFor(() => expect(campaignsService.close).toHaveBeenCalledWith(CAMPAIGN_IDS.worstActive, { notes: null }));
    // Tras cerrar se vuelven a pedir la lista y la activa de la sesión.
    await waitFor(() => expect(campaignsService.list).toHaveBeenCalledTimes(2));
    expect(campaignsService.active).toHaveBeenCalledTimes(2);
  });

  it('N1: Directiva y Administrador ven crear, editar, abrir y cerrar (campaigns.controller.ts los admite), sin «Sólo consulta»', async () => {
    for (const role of ['DIRECTIVA', 'ADMINISTRADOR']) {
      const { unmount } = show(fixtures.worst, { role });
      const active = await screen.findByTestId(`campaign-row-${LONG_CAMPAIGN_NAME}`);
      expect(screen.getByRole('button', { name: 'Nueva campaña' })).toBeTruthy();
      expect(within(active).getByRole('button', { name: 'Editar' })).toBeTruthy();
      expect(within(active).getByRole('button', { name: 'Cerrar' })).toBeTruthy();
      expect(within(row('Campaña de verano 2026')).getByRole('button', { name: 'Abrir' })).toBeTruthy();
      expect(screen.queryByText('Sólo consulta')).toBeNull();
      unmount();
    }
    expectNoWrites();
  });

  it('H6: la búsqueda declara tipo, tecla «buscar» y modo de entrada para el teclado del teléfono', async () => {
    show(fixtures.one);
    await screen.findByTestId('campaign-row-Campaña única 2026');
    const input = screen.getByLabelText('Buscar');
    expect(input.getAttribute('type')).toBe('search');
    expect(input.getAttribute('enterkeyhint')).toBe('search');
    expect(input.getAttribute('inputmode')).toBe('search');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('sin coincidencias se distingue de sin registros y «Quitar filtros» vuelve a la lista completa', async () => {
    show(fixtures.demo);
    await screen.findByTestId('campaign-row-Campaña invierno 2026');
    vi.mocked(campaignsService.list).mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'CANCELADA' } });
    expect(await screen.findByText('Sin coincidencias')).toBeTruthy();
    expect(screen.getByText(/Ninguna campaña coincide con el filtro aplicado \(Cancelada\)/)).toBeTruthy();
    vi.mocked(campaignsService.list).mockResolvedValue(fixtures.demo);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    await screen.findByTestId('campaign-row-Campaña invierno 2026');
    // Sin filtros vuelve la lista de la sesión, sin otra petición: una del proveedor y una del filtro.
    expect(campaignsService.list).toHaveBeenCalledTimes(2);
    expect(campaignsService.list).toHaveBeenNthCalledWith(1);
    expect(campaignsService.list).toHaveBeenNthCalledWith(2, { status: 'CANCELADA', search: undefined });
  });

  it('empty: «Todavía no hay campañas», sin campaña activa', async () => {
    show(fixtures.empty, { active: null });
    expect(await screen.findByText('Todavía no hay campañas')).toBeTruthy();
    expect(screen.getByText(/No hay campaña activa/)).toBeTruthy();
    expect(screen.queryByText('Sin coincidencias')).toBeNull();
  });

  it('one: una campaña, singular en el conteo', async () => {
    show(fixtures.one);
    await screen.findByTestId('campaign-row-Campaña única 2026');
    expect(screen.getByTestId('campaign-counts').textContent).toMatch(/^1 abierta$/);
    expect(within(row('Campaña única 2026')).getByTestId('estimated-end').textContent).toBe('Sin fecha estimada');
  });

  it('error recuperable: «Reintentar» vuelve a pedir la lista, sin datos residuales', async () => {
    vi.mocked(campaignsService.list).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderWithFixture(<CampaignsPage />, { route: '/campaigns', path: '/campaigns', active: null });
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    vi.mocked(campaignsService.list).mockResolvedValue(fixtures.one);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('campaign-row-Campaña única 2026');
  });

  it('crear una campaña vuelve a pedir la lista de la sesión, y la nueva aparece', async () => {
    show(fixtures.one);
    await screen.findByTestId('campaign-row-Campaña única 2026');
    expect(campaignsService.list).toHaveBeenCalledTimes(1);
    const created: Campaign = { ...fixtures.one[0], id: 'c0000003-0000-4000-8000-000000000002', name: 'Campaña nueva 2027', status: 'PLANIFICADA', isActive: false };
    vi.mocked(campaignsService.create).mockResolvedValue(created);
    vi.mocked(campaignsService.list).mockResolvedValue([...fixtures.one, created]);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Campaña nueva 2027' } });
    fireEvent.change(screen.getByLabelText('Inicio *'), { target: { value: '2027-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    await screen.findByTestId('campaign-row-Campaña nueva 2027');
    expect(campaignsService.create).toHaveBeenCalledTimes(1);
    expect(campaignsService.list).toHaveBeenCalledTimes(2);
  });
});
