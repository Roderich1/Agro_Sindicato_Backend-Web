import { screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { cell, SEAL, sealStateWith, summaryWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { CollectiveSummaryPage } from './collective-summary.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

const PATH = `/colectivo/resumen?campaign=${CAMPAIGN.id}`;

function httpError(status: number) {
  const error = new AxiosError('fail', String(status));
  error.response = { status, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

describe('Resumen colectivo', () => {
  beforeEach(() => {
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(collectiveService.sealState).mockResolvedValue(
      sealStateWith({ can_seal: false, blocked_by: ['CAMPAIGN_NOT_CLOSED'], review: null }),
    );
  });

  it('versión sellada: se identifica, la cobertura es la del sellado y una cifra retirada tras sellar no aparece', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue({
      ...summaryWith([
        cell({ product_name: 'Urea', base_unit: 'G', total_base: '25000', total_presentation: '25', contributors: 3 }),
        // Aunque llegara un total, una cifra retirada tras sellar no se muestra.
        cell({ product_name: 'Belator', status: 'WITHDRAWN_AFTER_SEAL', total_base: '6000', contributors: 3 }),
      ]),
      seal: SEAL,
    });
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    const banner = await screen.findByTestId('seal-banner');
    expect(banner.textContent).toMatch(/Versión 1/);
    expect(banner.textContent).toMatch(/Administrador sintético \(Administrador\)/);
    expect(banner.textContent).toMatch(/no puede asegurar que todos los teléfonos publicaron todo/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/Cobertura al sellar/);
    const withdrawn = screen.getByTestId('cell-DECLARED_NEED-Belator-ML');
    expect(withdrawn.textContent).toMatch(/retiró su aporte después del sellado/);
    expect(withdrawn.textContent).not.toMatch(/6000|6 L/);
    // Una campaña sellada no ofrece sellar otra vez.
    expect(screen.queryByTestId('seal-panel')).toBeNull();
    expect(collectiveService.sealState).not.toHaveBeenCalled();
  });

  it('POLICY_PENDING: no hay tablas, ni cifras, ni cobertura', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith([], 'POLICY_PENDING'));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    // Rediseño v2 (lámina 05 §5).
    expect(await screen.findByText(/Las cifras todavía no se pueden mostrar/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByTestId('coverage')).toBeNull();
    expect(collectiveService.summary).toHaveBeenCalledWith(CAMPAIGN.id);
  });

  it('muestra publicadas, cero explícito, pendientes, supresión, revisión y desbordamiento sin inventar cifras', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(
      summaryWith([
        cell({ product_name: 'Urea', base_unit: 'G', total_base: '25000', total_presentation: '25', contributors: 3, data_as_of: '2026-10-16T10:00:00.000Z' }),
        cell({ product_name: 'Cero', total_base: '0', total_presentation: '0', contributors: 3 }),
        cell({ product_name: 'Glifosato', total_base: '6000', total_presentation: '6', contributors: 3, pending_changes: true }),
        // Aunque llegara un total en una celda suprimida, no se muestra.
        cell({ product_name: 'Belator', status: 'SUPPRESSED_UNDER_THRESHOLD', total_base: '7000', contributors: 2 }),
        cell({ product_name: 'Mancozeb', status: 'SUPPRESSED_REVISION' }),
        cell({ product_name: 'Enorme', base_unit: 'G', status: 'OVERFLOW' }),
        cell({ projection_type: 'CONSUMPTION_TOTAL', product_name: 'Urea', base_unit: 'G', total_base: '20000', total_presentation: '20', contributors: 3 }),
      ]),
    );
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    const urea = await screen.findByTestId('cell-DECLARED_NEED-Urea-G');
    // Rediseño v2: número y unidad en dos tamaños; se lee el elemento [data-figure].
    const figure = (el: HTMLElement) => el.querySelector('[data-figure]')?.textContent;
    expect(figure(urea)).toBe('25 KG');
    expect(figure(screen.getByTestId('cell-DECLARED_NEED-Cero-ML'))).toBe('0 L');
    const pending = screen.getByTestId('cell-DECLARED_NEED-Glifosato-ML');
    expect(figure(pending)).toBe('6 L');
    // E4: el aviso de cifra anterior ya no habla de «umbral».
    expect(within(pending).getByText(/todavía no se publican: se muestra la cifra anterior/)).toBeTruthy();

    const suppressed = screen.getByTestId('cell-DECLARED_NEED-Belator-ML');
    // E4 §5.1: el motivo nombra la política que produjo el estado (antes «Menos de 3 agricultores aportaron»).
    expect(within(suppressed).getByText(/Sin cifra según la política F07-POL-01 \(mínimo de 3 aportantes\)/)).toBeTruthy();
    expect(suppressed.textContent).not.toMatch(/7000|7 L|\b2\b/);
    expect(screen.getByTestId('cell-DECLARED_NEED-Mancozeb-ML').textContent).toMatch(/se retiró/);
    expect(screen.getByTestId('cell-DECLARED_NEED-Enorme-G').textContent).toMatch(/no se trunca/);

    // Necesidad y consumo son vistas separadas; no hay totales por encima de la celda.
    expect(screen.getByRole('region', { name: 'Consumo publicado' }).textContent).toContain('20 KG');
    // Rediseño B (2026-11-10): «Necesidad declarada» pasa a «Necesidades declaradas por producto».
    // Rediseño v2: la sección se llama «Necesidades declaradas» (lámina 03).
    expect(screen.getByRole('region', { name: 'Necesidades declaradas' }).textContent).not.toContain('20 KG');
    expect(document.body.textContent).not.toMatch(/45 KG|31 L|Total general/);

    expect(screen.getByTestId('coverage').textContent).toMatch(/3 de 4 agricultores vinculados con cifras publicadas/);
    // F10-SEC-02: existen filas sin cifra; se avisa sin conteo.
    expect(screen.getByTestId('coverage').textContent).toMatch(/Hay filas sin cifra/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/desconocido, no cero/);
    // El resumen muestra la cobertura actual: sin rótulo de fecha histórica.
    expect(screen.getByTestId('coverage').textContent).not.toMatch(/al generar el borrador|No es la cobertura actual/);
  });

  it('distingue «Oculto por privacidad», «Sin cifra publicada» y un cero divulgado, y enlaza la cobertura', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(
      summaryWith([
        cell({ product_name: 'Cero', total_base: '0', total_presentation: '0', contributors: 3 }),
        cell({ product_name: 'Belator', status: 'SUPPRESSED_UNDER_THRESHOLD', total_base: '7000', contributors: 2 }),
        cell({ product_name: 'Mancozeb', status: 'SUPPRESSED_REVISION' }),
      ]),
    );
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    const zero = await screen.findByTestId('cell-DECLARED_NEED-Cero-ML');
    // Rediseño v2 (lámina 03): una cifra publicada no lleva chip «Publicado»; se distingue por su cifra y por no llevar chip de estado.
    expect(zero.querySelector('[data-figure]')!.textContent).toBe('0 L');
    expect(zero.querySelector('[data-tone="hidden"]')).toBeNull();
    const privacy = screen.getByTestId('cell-DECLARED_NEED-Belator-ML');
    // Rediseño v2 (lámina 03) con E4 §5.1: «Sin cifra (F07-POL-01)» en lugar de «Oculta por privacidad».
    expect(within(privacy).getByText('Sin cifra (F07-POL-01)')).toBeTruthy();
    expect(privacy.textContent).not.toMatch(/privacidad|anónim/i);
    expect(privacy.textContent).not.toMatch(/7000|7 L|\b2\b|0 L/);
    const revision = screen.getByTestId('cell-DECLARED_NEED-Mancozeb-ML');
    expect(within(revision).getByText('Sin cifra publicada')).toBeTruthy();
    expect(revision.textContent).not.toMatch(/0 L/);
    // Conteo: sólo lo que hay, sin cantidades. Rediseño B: pasa de la cabecera de la sección al indicador.
    // Rediseño v2: los recuentos pasan a los indicadores de la cabecera.
    expect(screen.getByTestId('needs-published').textContent).toMatch(/1 producto$/);
    expect(screen.getByTestId('needs-hidden').textContent).toMatch(/1 producto$/);
    expect(screen.getByTestId('needs-other').textContent).toMatch(/1 producto$/);
    // La tarjeta de cobertura usa los valores de la API y enlaza a la vista de cobertura.
    const coverage = screen.getByTestId('coverage');
    expect(coverage.textContent).toMatch(/3 de 4 agricultores vinculados con cifras publicadas/);
    expect(within(coverage).getByRole('link', { name: 'Ver cobertura' }).getAttribute('href')).toBe(`/colectivo/cobertura?campaign=${CAMPAIGN.id}`);
    // Una sola acción primaria: «Revisar borrador» lleva a la propuesta de la misma campaña.
    expect(screen.getByRole('link', { name: 'Revisar borrador' }).getAttribute('href')).toBe(`/colectivo/propuestas?campaign=${CAMPAIGN.id}`);
  });

  it('un ?campaign= que no es UUID se ignora: se usa la campaña activa', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith([]));
    renderAt(<CollectiveSummaryPage />, { path: '/colectivo/resumen?campaign=..%2F..%2Fusers' });
    await screen.findAllByText(/Eso no significa cero/);
    expect(collectiveService.summary).toHaveBeenCalledWith(CAMPAIGN.id);
    expect(collectiveService.summary).not.toHaveBeenCalledWith(expect.stringContaining('users'));
  });

  it('un dato no exacto del servidor se señala como error, no como cifra', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(
      summaryWith([cell({ product_name: 'Raro', total_base: '1.5', total_presentation: '0.0015', contributors: 3 })]),
    );
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    const row = await screen.findByTestId('cell-DECLARED_NEED-Raro-ML');
    expect(row.textContent).toMatch(/Dato no válido/);
    expect(row.textContent).not.toMatch(/1[.,]5/);
  });

  it('ausencia: sin celdas se explica que no es cero', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith([]));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    expect((await screen.findAllByText(/Eso no significa cero/)).length).toBe(2);
  });

  it('errores: 403 y sin conexión, sin datos residuales', async () => {
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(httpError(403));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    // Rediseño v2 (lámina 05 §8).
    expect(await screen.findByText(/Su rol no tiene acceso a esta información/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin conexión no encola nada y lo informa', async () => {
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    await waitFor(() => expect(screen.getByText(/Sin conexión con el servidor/)).toBeTruthy());
    expect(localStorage.length).toBe(0);
  });
});
