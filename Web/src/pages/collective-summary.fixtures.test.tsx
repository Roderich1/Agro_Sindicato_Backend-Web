import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fixtures from '../dev/fixtures/summary-fixtures';
import type { SummaryFixture } from '../dev/fixtures/summary-fixtures';
import { renderWithFixture } from '../dev/fixtures/summary-render';
import { fmtDateTime } from '../lib/collective-text';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { CollectiveSummaryPage } from './collective-summary.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn(), proposals: vi.fn(), generateProposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({
  campaignsService: { list: vi.fn(), active: vi.fn(), create: vi.fn(), update: vi.fn(), open: vi.fn(), close: vi.fn() },
}));

/** Una cantidad con unidad («0 L», «1.234,5 KG»): nunca debe aparecer en una fila sin cifra publicada. */
const QUANTITY = /\d[\d.,]*\s?(L|KG)\b/;

function show(fixture: SummaryFixture, options: { active?: SummaryFixture['active']; strict?: boolean } = {}) {
  vi.mocked(campaignsService.list).mockResolvedValue(fixture.campaigns);
  vi.mocked(collectiveService.summary).mockResolvedValue(fixture.summary);
  if (fixture.sealState) vi.mocked(collectiveService.sealState).mockResolvedValue(fixture.sealState);
  return renderWithFixture(<CollectiveSummaryPage />, {
    route: '/colectivo/resumen',
    path: `/colectivo/resumen?campaign=${fixture.selected}`,
    active: options.active === undefined ? fixture.active : options.active,
    strict: options.strict,
  });
}

function expectNoWrites() {
  expect(collectiveService.seal).not.toHaveBeenCalled();
  expect(collectiveService.generateProposal).not.toHaveBeenCalled();
  for (const write of [campaignsService.create, campaignsService.update, campaignsService.open, campaignsService.close]) {
    expect(write).not.toHaveBeenCalled();
  }
}

describe('Resumen con fixtures de casos extremos (break-ui)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('worst: ninguna fila sin cifra muestra número ni cero; L y KG en escalas separadas; orden por nombre', async () => {
    show(fixtures.worst);
    await screen.findByTestId(`cell-DECLARED_NEED-${fixtures.LONG_PRODUCT}-ML`);
    for (const cell of fixtures.worst.summary.cells) {
      const row = screen.getByTestId(`cell-${cell.projection_type}-${cell.product_name}-${cell.base_unit}`);
      if (cell.status !== 'DISCLOSED') {
        expect(row.textContent).not.toMatch(QUANTITY);
        expect(row.textContent).not.toMatch(/\b0\b/);
        expect(row.textContent).toMatch(/aportantes no revelados/);
      }
    }
    const needs = screen.getByRole('region', { name: 'Necesidades declaradas por producto' });
    const liters = within(needs).getByRole('list', { name: 'En litros' });
    const kilos = within(needs).getByRole('list', { name: 'En kilogramos' });
    expect(liters.textContent).not.toMatch(/\d\s?KG\b/);
    expect(kilos.textContent).not.toMatch(/\d\s?L\b/);
    // Cifras exactas, grandes y pequeñas, escritas (no sólo una barra).
    expect(within(liters).getByText('123.456.789,012 L')).toBeTruthy();
    expect(within(kilos).getByText('0,025 KG')).toBeTruthy();
    expect(within(liters).getByText('0 L')).toBeTruthy();
    // break-ui: un cero divulgado se escribe «0 L» sin barra (ni pista vacía); una cifra positiva sí lleva barra.
    expect(screen.getByTestId('cell-DECLARED_NEED-Adherente agrícola no iónico-ML').querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByTestId(`cell-DECLARED_NEED-${fixtures.LONG_PRODUCT}-ML`).querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Orden alfabético dentro de cada unidad, no por cantidad.
    const names = within(liters)
      .getAllByRole('listitem')
      .map((item) => item.getAttribute('data-testid'));
    expect(names).toEqual([...names].sort((a, b) => a!.localeCompare(b!, 'es', { sensitivity: 'base' })));
    // Ningún total por encima de la celda.
    expect(document.body.textContent).not.toMatch(/Total/);
    expectNoWrites();
  });

  it('worst: «Cifra más reciente» es el máximo de data_as_of entre las cifras publicadas', async () => {
    show(fixtures.worst);
    const latest = await screen.findByTestId('latest-figure');
    expect(latest.textContent).toContain(`Cifra más reciente: datos hasta ${fmtDateTime('2026-11-09T22:47:00.000Z')}`);
  });

  it('worst: acciones pendientes sólo con datos (cambios sin publicar y revisar borrador); 3 ocultas no dicen cuánto', async () => {
    show(fixtures.worst);
    const actions = await screen.findByTestId('pending-actions');
    expect(within(actions).getByTestId('action-pending-changes').textContent).toMatch(/2 filas tienen cambios recibidos/);
    expect(within(actions).getByTestId('action-review')).toBeTruthy();
    expect(within(actions).queryByTestId('action-closed-unsealed')).toBeNull();
    expect(within(actions).queryByTestId('action-no-active')).toBeNull();
    expect(screen.getByTestId('needs-counts').textContent).toMatch(/5 productos con cifra publicada/);
    expect(screen.getByTestId('needs-counts').textContent).toMatch(/1 oculto por privacidad · 2 sin cifra publicada/);
  });

  it('una sola lectura del resumen por visita, también bajo StrictMode', async () => {
    show(fixtures.worst, { strict: true });
    await screen.findByTestId('pending-actions');
    await waitFor(() => expect(collectiveService.sealState).toHaveBeenCalled());
    expect(collectiveService.summary).toHaveBeenCalledTimes(1);
    expect(collectiveService.sealState).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it('sin campaña activa: lo dice como acción pendiente y enlaza a Campañas', async () => {
    show(fixtures.worst, { active: null });
    const action = await screen.findByTestId('action-no-active');
    expect(within(action).getByRole('link', { name: 'Ir a Campañas' }).getAttribute('href')).toBe('/campaigns');
  });

  it('campaña cerrada sin sellar: acción con enlace al sellado; cobertura 0 de 0 sin porcentaje', async () => {
    show(fixtures.worstClosedUnsealed);
    const action = await screen.findByTestId('action-closed-unsealed');
    expect(within(action).getByRole('link', { name: 'Ir al sellado' }).getAttribute('href')).toBe('#sellado');
    const coverage = screen.getByTestId('coverage');
    expect(coverage.textContent).toMatch(/0 de 0 agricultores vinculados con cifras publicadas/);
    expect(coverage.textContent).not.toMatch(/%/);
    expect(await screen.findByTestId('seal-panel')).toBeTruthy();
    expect(document.getElementById('sellado')).not.toBeNull();
    expectNoWrites();
  });

  it('sellada: versión identificada, cifra retirada sin número, sin panel de sellado ni lectura del sellado', async () => {
    show(fixtures.worstSealed);
    const version = await screen.findByTestId('seal-banner');
    expect(version.textContent).toMatch(/Versión 1 sellada/);
    expect(version.textContent).toContain(fixtures.LONG_AUTHOR);
    const withdrawn = screen.getByTestId(`cell-DECLARED_NEED-${fixtures.LONG_PRODUCT}-ML`);
    expect(withdrawn.textContent).not.toMatch(/6000|6 L/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/Cobertura al sellar/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/1 de 1 agricultor vinculado con cifras publicadas/);
    expect(screen.queryByTestId('action-closed-unsealed')).toBeNull();
    expect(collectiveService.sealState).not.toHaveBeenCalled();
  });

  it('empty: sin cifras no hay «Cifra más reciente», ni ceros, y la ausencia se explica', async () => {
    show(fixtures.empty);
    expect((await screen.findAllByText(/Eso no significa cero/)).length).toBe(2);
    expect(screen.queryByTestId('latest-figure')).toBeNull();
    expect(screen.getByTestId('needs-counts').textContent).toMatch(/Sin necesidades publicadas/);
    expect(screen.getByTestId('needs-counts').textContent).not.toMatch(/\b0\b/);
    expect(screen.queryByTestId('action-pending-changes')).toBeNull();
  });

  it('one: singulares correctos («1 producto», «1 aportante», «1 de 1 agricultor vinculado»)', async () => {
    show(fixtures.one);
    const row = await screen.findByTestId('cell-DECLARED_NEED-Glifosato 480 SL-ML');
    expect(row.textContent).toMatch(/1 aportante(?!s)/);
    expect(screen.getByTestId('needs-counts').textContent).toMatch(/1 producto con cifra publicada/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/1 de 1 agricultor vinculado con cifras publicadas \(100/);
  });

  it('política pendiente: sin cifras, sin cobertura y sin indicador de necesidades', async () => {
    show(fixtures.worstPolicyPending);
    expect(await screen.findByText(/Política de divulgación pendiente/)).toBeTruthy();
    expect(screen.queryByTestId('coverage')).toBeNull();
    expect(screen.queryByTestId('needs-counts')).toBeNull();
    expect(screen.queryByTestId('latest-figure')).toBeNull();
  });
});
