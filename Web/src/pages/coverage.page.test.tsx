import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fixtures from '../dev/fixtures/summary-fixtures';
import type { SummaryFixture } from '../dev/fixtures/summary-fixtures';
import { renderWithFixture } from '../dev/fixtures/summary-render';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { CoveragePage } from './coverage.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn(), proposals: vi.fn(), generateProposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn(), create: vi.fn(), update: vi.fn(), open: vi.fn(), close: vi.fn() },
}));

function show(fixture: SummaryFixture, { strict = false } = {}) {
  vi.mocked(campaignsService.list).mockResolvedValue(fixture.campaigns);
  vi.mocked(collectiveService.summary).mockResolvedValue(fixture.summary);
  return renderWithFixture(<CoveragePage />, {
    route: '/colectivo/cobertura',
    path: `/colectivo/cobertura?campaign=${fixture.selected}`,
    active: fixture.active,
    strict,
  });
}

describe('Cobertura', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa el denominador y el numerador de la API, con su definición, sin umbrales ni escrituras (StrictMode)', async () => {
    show(fixtures.worst, { strict: true });
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/51 de 1\.284 agricultores vinculados con cifras publicadas/);
    expect(coverage.textContent).toMatch(/Vinculados \(1\.284\)/);
    expect(coverage.textContent).toMatch(/aporten o no/);
    expect(coverage.textContent).toMatch(/no que los datos estén completos ni que sean suficientes/);
    expect(coverage.getAttribute('data-tone')).toBeNull();
    await waitFor(() => expect(collectiveService.summary).toHaveBeenCalledTimes(1));
    expect(collectiveService.sealState).not.toHaveBeenCalled();
    expect(collectiveService.seal).not.toHaveBeenCalled();
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
    for (const write of [campaignsService.create, campaignsService.update, campaignsService.open, campaignsService.close]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('distingue aportes aceptados de registros locales y dice que estos no están disponibles', async () => {
    show(fixtures.demo);
    await screen.findByTestId('coverage');
    const section = screen.getByTestId('accepted-vs-local');
    expect(section.textContent).toMatch(/Aportes aceptados:/);
    expect(section.textContent).toMatch(/Registros locales:.*no está disponible/);
  });

  it('0 de 0: sin porcentaje y con explicación', async () => {
    show(fixtures.worstClosedUnsealed);
    const coverage = await screen.findByTestId('coverage');
    expect(within(coverage).getByTestId('coverage-value').textContent).toBe('0 de 0');
    expect(coverage.textContent).not.toMatch(/%/);
    expect(coverage.textContent).toMatch(/no se calcula porcentaje/);
  });

  it('1 de 1: singular; con vinculados sí hay porcentaje', async () => {
    show(fixtures.one);
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/1 de 1 agricultor vinculado con cifras publicadas \(100/);
  });

  it('el seguimiento de sincronización sigue sin datos y lo dice', async () => {
    show(fixtures.demo);
    await screen.findByTestId('coverage');
    expect(screen.getByTestId('sync-tracking').textContent).toMatch(/Todavía sin consulta del servidor/);
  });

  it('política pendiente: cobertura no disponible, sin número', async () => {
    show(fixtures.worstPolicyPending);
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/Cobertura no disponible/);
    expect(coverage.textContent).not.toMatch(/\d+ de \d+/);
  });

  it('error: «Reintentar» lo vuelve a pedir sólo al pulsar', async () => {
    vi.mocked(campaignsService.list).mockResolvedValue(fixtures.demo.campaigns);
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK')).mockResolvedValue(fixtures.demo.summary);
    renderWithFixture(<CoveragePage />, { route: '/colectivo/cobertura', path: `/colectivo/cobertura?campaign=${fixtures.demo.selected}`, active: fixtures.demo.active });
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeTruthy();
    expect(screen.queryByTestId('coverage')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('coverage');
    expect(collectiveService.summary).toHaveBeenCalledTimes(2);
  });
});
