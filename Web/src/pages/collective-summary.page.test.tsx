import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { campaignsService } from '../services/campaigns.service';
import { cell, SEAL, sealStateWith, summaryWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { CollectiveSummaryPage } from './collective-summary.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), summaryCsv: vi.fn(), sealState: vi.fn(), seal: vi.fn() },
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
    expect(await screen.findByText(/Sin cifras colectivas/)).toBeTruthy();
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
    expect(within(urea).getByText('25 KG')).toBeTruthy();
    expect(within(screen.getByTestId('cell-DECLARED_NEED-Cero-ML')).getByText('0 L')).toBeTruthy();
    const pending = screen.getByTestId('cell-DECLARED_NEED-Glifosato-ML');
    expect(within(pending).getByText('6 L')).toBeTruthy();
    expect(within(pending).getByText(/aún no alcanzan el umbral/)).toBeTruthy();

    const suppressed = screen.getByTestId('cell-DECLARED_NEED-Belator-ML');
    expect(within(suppressed).getByText(/Menos de 3 agricultores aportaron/)).toBeTruthy();
    expect(suppressed.textContent).not.toMatch(/7000|7 L|\b2\b/);
    expect(screen.getByTestId('cell-DECLARED_NEED-Mancozeb-ML').textContent).toMatch(/se retiró/);
    expect(screen.getByTestId('cell-DECLARED_NEED-Enorme-G').textContent).toMatch(/no se trunca/);

    // Necesidad y consumo son vistas separadas; no hay totales por encima de la celda.
    expect(screen.getByRole('region', { name: 'Consumo' }).textContent).toContain('20 KG');
    expect(screen.getByRole('region', { name: 'Necesidad declarada' }).textContent).not.toContain('20 KG');
    expect(document.body.textContent).not.toMatch(/45 KG|31 L|Total general/);

    expect(screen.getByTestId('coverage').textContent).toMatch(/3 de 4 agricultores vinculados con cifras publicadas/);
    // F10-SEC-02: existen filas sin cifra; se avisa sin conteo.
    expect(screen.getByTestId('coverage').textContent).toMatch(/Hay filas sin cifra/);
    expect(screen.getByTestId('coverage').textContent).toMatch(/desconocido, no cero/);
    // El resumen muestra la cobertura actual: sin rótulo de fecha histórica.
    expect(screen.getByTestId('coverage').textContent).not.toMatch(/al generar el borrador|No es la cobertura actual/);
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
    expect(await screen.findByText(/no tiene acceso a la información colectiva/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('sin conexión no encola nada y lo informa', async () => {
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    await waitFor(() => expect(screen.getByText(/Sin conexión con el servidor/)).toBeTruthy());
    expect(localStorage.length).toBe(0);
  });
  it('«Descargar CSV actualizado»: pide al servidor una lectura nueva y muestra la fecha de los datos del CSV', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith([cell({ product_name: 'Urea', contributors: 3 })]));
    const csv = [
      'campaign_ref,campaign,disclosure,policy,approved,threshold,linked_members,members_with_contribution,suppressed_cells,seal_ref,seal_version,sealed_at',
      `${CAMPAIGN.id},Campaña sintética,PROVISIONAL_SYNTHETIC,F07-POL-01,false,3,7,5,false,,,`,
      '',
      'projection_type,product_ref,product_name,base_unit,presentation_unit,status,total_base,total_presentation,contributors,data_as_of,released_at,pending_changes',
      'DECLARED_NEED,p-1,Urea,G,KG,DISCLOSED,25000,25,3,2026-10-29T14:19:00.000Z,2026-10-29T14:19:00.000Z,false',
    ].join('\n');
    vi.mocked(collectiveService.summaryCsv).mockResolvedValue(new Blob([csv], { type: 'text/csv' }));
    const createObjectURL = vi.fn(() => 'blob:resumen');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    renderAt(<CollectiveSummaryPage />, { path: PATH });
    await screen.findByTestId('coverage');
    expect(collectiveService.summaryCsv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV actualizado' }));
    expect(await screen.findByText(/CSV descargado \(/)).toBeTruthy();
    expect(collectiveService.summaryCsv).toHaveBeenCalledWith(CAMPAIGN.id);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const notice = screen.getByText(/CSV descargado \(/).textContent ?? '';
    expect(notice).toMatch(/datos aceptados hasta 29 oct/);
    expect(notice).toMatch(/lectura nueva del servidor/);
    // La pantalla no se recalcula sola con el CSV: sigue lo que se cargó.
    expect(collectiveService.summary).toHaveBeenCalledTimes(1);
  });
});
