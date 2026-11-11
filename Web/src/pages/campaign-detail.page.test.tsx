import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_IDS, LONG_CAMPAIGN_NAME } from '../dev/fixtures/campaigns-fixtures';
import * as fixtures from '../dev/fixtures/summary-fixtures';
import type { SummaryFixture } from '../dev/fixtures/summary-fixtures';
import { renderWithFixture } from '../dev/fixtures/summary-render';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { CampaignDetailPage } from './campaign-detail.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn(), proposals: vi.fn(), generateProposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn(), create: vi.fn(), update: vi.fn(), open: vi.fn(), close: vi.fn() },
}));

function show(fixture: SummaryFixture, { id = fixture.selected, role = 'DIRECTIVA', strict = false } = {}) {
  vi.mocked(campaignsService.list).mockResolvedValue(fixture.campaigns);
  vi.mocked(collectiveService.summary).mockResolvedValue(fixture.summary);
  vi.mocked(collectiveService.proposals).mockResolvedValue(fixture.proposals);
  if (fixture.sealState) vi.mocked(collectiveService.sealState).mockResolvedValue(fixture.sealState);
  return renderWithFixture(<CampaignDetailPage />, { route: '/campaigns/:id', path: `/campaigns/${id}`, active: fixture.active, role, strict });
}

function expectNoWrites() {
  expect(collectiveService.seal).not.toHaveBeenCalled();
  expect(collectiveService.generateProposal).not.toHaveBeenCalled();
  for (const write of [campaignsService.create, campaignsService.update, campaignsService.open, campaignsService.close]) {
    expect(write).not.toHaveBeenCalled();
  }
}

describe('Detalle de campaña', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 10, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('compone la fila de la lista, el resumen, el sellado y los borradores con una sola lectura del resumen (StrictMode)', async () => {
    show(fixtures.worst, { strict: true });
    expect(await screen.findByRole('heading', { level: 1, name: LONG_CAMPAIGN_NAME })).toBeTruthy();
    await screen.findByTestId('detail-proposals');
    await waitFor(() => expect(collectiveService.sealState).toHaveBeenCalled());
    expect(collectiveService.summary).toHaveBeenCalledTimes(1);
    expect(collectiveService.summary).toHaveBeenCalledWith(CAMPAIGN_IDS.worstActive);
    expect(collectiveService.sealState).toHaveBeenCalledTimes(1);
    expect(collectiveService.proposals).toHaveBeenCalledTimes(1);
    expect(campaignsService.list).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it('datos generales: activa, fin estimado vencido como texto, sin cierre registrado, notas', async () => {
    show(fixtures.worst);
    const general = await screen.findByTestId('general');
    expect(within(general).getByText('Sí, es la campaña activa del sindicato')).toBeTruthy();
    expect(within(general).getByTestId('estimated-end').textContent).toMatch(/Fin estimado vencido · sin cierre registrado/);
    expect(within(general).getByTestId('closed-at').textContent).toBe('Sin cierre registrado');
    expect(general.textContent).toMatch(/helada de agosto/);
  });

  it('participación: N de M con la definición del contrato, aviso de filas sin cifra y enlace a Cobertura', async () => {
    show(fixtures.worst);
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/51 de 1\.284 agricultores vinculados con cifras publicadas/);
    expect(coverage.textContent).toMatch(/aporten o no/);
    expect(coverage.textContent).toMatch(/Hay filas sin cifra/);
    expect(coverage.textContent).toMatch(/no que los datos estén completos ni que sean suficientes/);
    expect(within(coverage).getByRole('link', { name: 'Ver cobertura' }).getAttribute('href')).toBe(`/colectivo/cobertura?campaign=${CAMPAIGN_IDS.worstActive}`);
  });

  it('borradores vinculados: fecha, autor largo, líneas con plural y enlace a Necesidades y propuestas', async () => {
    show(fixtures.worst);
    const section = await screen.findByTestId('detail-proposals');
    await within(section).findByText(fixtures.LONG_AUTHOR);
    expect(within(section).getByText('12 líneas')).toBeTruthy();
    expect(within(section).getAllByText('1 línea').length).toBe(2);
    expect(within(section).getByRole('link', { name: 'Abrir en Necesidades y propuestas' }).getAttribute('href')).toBe(
      `/colectivo/propuestas?campaign=${CAMPAIGN_IDS.worstActive}`,
    );
  });

  it('cerrada sin sellar: cobertura 0 de 0 sin porcentaje, «Sin sellar» y panel de sellado sin sellar nada', async () => {
    show(fixtures.worstClosedUnsealed);
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/0 de 0 agricultores vinculados/);
    expect(coverage.textContent).not.toMatch(/%/);
    expect(screen.getByTestId('unsealed').textContent).toMatch(/Sin sellar/);
    expect(await screen.findByTestId('seal-review')).toBeTruthy();
    expect(screen.getByTestId('closed-at').textContent).toMatch(/^Cerrada el /);
    expect(within(screen.getByTestId('detail-proposals')).getByText('Sin borradores')).toBeTruthy();
    expectNoWrites();
  });

  it('sellada: versión identificada y sin lectura del estado de sellado', async () => {
    show(fixtures.worstSealed);
    const seal = await screen.findByTestId('seal-banner');
    expect(seal.textContent).toMatch(/Versión 1 sellada/);
    expect(seal.textContent).toContain(fixtures.LONG_AUTHOR);
    expect(collectiveService.sealState).not.toHaveBeenCalled();
  });

  it('política pendiente: la participación queda restringida, sin cifras', async () => {
    show(fixtures.worstPolicyPending);
    const coverage = await screen.findByTestId('coverage');
    expect(coverage.textContent).toMatch(/Cobertura no disponible/);
    expect(coverage.textContent).not.toMatch(/\d+ de \d+/);
  });

  it('una campaña que no está en la lista: «No existe o no pertenece a su organización», sin lecturas colectivas', async () => {
    show(fixtures.worst, { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
    expect(await screen.findByText('No existe o no pertenece a su organización.')).toBeTruthy();
    expect(collectiveService.summary).not.toHaveBeenCalled();
    expect(collectiveService.proposals).not.toHaveBeenCalled();
  });

  it('agricultor: datos generales sí, participación y borradores no (sin pedirlos)', async () => {
    // Un agricultor sólo llega a la Web con el flag de rollback; sin él no se pide nada.
    vi.stubEnv('VITE_LEGACY_FARMER_WEB', 'enabled');
    show(fixtures.worst, { role: 'AGRICULTOR' });
    expect(await screen.findByTestId('collective-forbidden')).toBeTruthy();
    expect(screen.getByTestId('general')).toBeTruthy();
    expect(screen.getByText('Sólo consulta')).toBeTruthy();
    expect(collectiveService.summary).not.toHaveBeenCalled();
    expect(collectiveService.proposals).not.toHaveBeenCalled();
  });

  it('error del resumen: «Reintentar» lo vuelve a pedir sólo al pulsar', async () => {
    vi.mocked(campaignsService.list).mockResolvedValue(fixtures.worst.campaigns);
    vi.mocked(collectiveService.proposals).mockResolvedValue([]);
    const error = new AxiosError('fail', '500');
    error.response = { status: 500, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(error).mockResolvedValue(fixtures.worst.summary);
    vi.mocked(collectiveService.sealState).mockResolvedValue(fixtures.worst.sealState!);
    renderWithFixture(<CampaignDetailPage />, { route: '/campaigns/:id', path: `/campaigns/${CAMPAIGN_IDS.worstActive}`, active: fixtures.worst.active });
    const failure = await screen.findByTestId('summary-error');
    expect(collectiveService.summary).toHaveBeenCalledTimes(1);
    fireEvent.click(within(failure).getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('coverage');
    expect(collectiveService.summary).toHaveBeenCalledTimes(2);
  });
});
