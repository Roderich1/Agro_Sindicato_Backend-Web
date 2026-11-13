import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentificationPendingContext } from '../contexts/identification-pending';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { cell, SEAL, sealStateWith, summaryWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { CollectiveSummaryPage } from './collective-summary.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { summary: vi.fn(), sealState: vi.fn(), seal: vi.fn(), generateProposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));

const PATH = `/colectivo/resumen?campaign=${CAMPAIGN.id}`;

function httpError(status: number) {
  const error = new AxiosError('fail', String(status));
  error.response = { status, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

function show(pending: number | null = null) {
  return renderAt(
    <IdentificationPendingContext.Provider value={{ pending }}>
      <CollectiveSummaryPage />
    </IdentificationPendingContext.Provider>,
    { path: PATH },
  );
}

const CELLS = [
  cell({ product_name: 'Urea', base_unit: 'G', total_base: '25000', total_presentation: '25', contributors: 3, data_as_of: '2026-10-16T10:00:00.000Z' }),
  cell({ product_name: 'Glifosato', total_base: '6000', total_presentation: '6', contributors: 3, pending_changes: true }),
  cell({ product_name: 'Belator', status: 'SUPPRESSED_UNDER_THRESHOLD' }),
  cell({ product_name: 'Mancozeb', status: 'SUPPRESSED_REVISION' }),
];

describe('Resumen v2 (láminas 03, 05 y 35)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(collectiveService.sealState).mockResolvedValue(sealStateWith({ can_seal: false, blocked_by: ['CAMPAIGN_NOT_CLOSED'], review: null }));
  });

  it('cabecera: selector, chips, «Revisar borrador», cobertura y recuentos por estado, sin escribir nada', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith(CELLS));
    show();
    await screen.findByTestId('coverage');
    const hero = screen.getByTestId('toolbar');
    expect((within(hero).getByLabelText('Campaña') as HTMLSelectElement).value).toBe(CAMPAIGN.id);
    expect(within(hero).getByText('Abierta')).toBeTruthy();
    expect(within(hero).getByText('Campaña activa')).toBeTruthy();
    expect(within(hero).getByRole('button', { name: 'Actualizar' })).toBeTruthy();
    expect(within(hero).getByRole('button', { name: 'Descargar Excel' })).toBeTruthy();
    expect(screen.getByTestId('needs-published').textContent).toBe('Necesidades publicadas2 productos');
    expect(screen.getByTestId('needs-hidden').textContent).toBe('Ocultas por privacidad1 producto');
    expect(screen.getByTestId('needs-other').textContent).toBe('Sin cifra publicada1 producto');
    expect(collectiveService.seal).not.toHaveBeenCalled();
    expect(collectiveService.generateProposal).not.toHaveBeenCalled();
  });

  it('«Para atender»: borrador, cifras anteriores y «N productos por identificar» con el recuento real', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith(CELLS));
    show(6);
    const list = await screen.findByTestId('pending-actions');
    expect(within(list).getByTestId('action-review').closest('a')!.getAttribute('href')).toBe(`/colectivo/propuestas?campaign=${CAMPAIGN.id}`);
    expect(within(list).getByTestId('action-pending-changes').textContent).toMatch(/^1 cifra muestra el valor anterior/);
    const identification = within(list).getByTestId('action-identification');
    expect(identification.textContent).toBe('6 productos por identificar');
    expect(identification.closest('a')!.getAttribute('href')).toBe('/colectivo/catalogo?vista=identificacion');
  });

  it('sin dato de identificación (null) o con cero pendientes, el ítem no aparece', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith(CELLS));
    const { unmount } = show(null);
    await screen.findByTestId('pending-actions');
    expect(screen.queryByTestId('action-identification')).toBeNull();
    unmount();
    show(0);
    await screen.findByTestId('pending-actions');
    expect(screen.queryByTestId('action-identification')).toBeNull();
  });

  it('buscador y filtros en el navegador, con «Quitar filtros»; no vuelve a pedir el resumen', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(summaryWith(CELLS));
    show();
    await screen.findByTestId('cell-DECLARED_NEED-Urea-G');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultas' }));
    expect(screen.queryByTestId('cell-DECLARED_NEED-Urea-G')).toBeNull();
    expect(screen.getByTestId('cell-DECLARED_NEED-Belator-ML')).toBeTruthy();
    expect(screen.getByTestId('cell-DECLARED_NEED-Mancozeb-ML')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Litros' }));
    expect(screen.queryByTestId('cell-DECLARED_NEED-Urea-G')).toBeNull();
    expect(screen.getByTestId('cell-DECLARED_NEED-Glifosato-ML')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'zzz' } });
    expect(screen.getByText('Sin coincidencias')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getByTestId('cell-DECLARED_NEED-Urea-G')).toBeTruthy();
    expect(collectiveService.summary).toHaveBeenCalledTimes(1);
  });

  it('todo oculto (05 §4): lo explica con el umbral y el recuento de filas, sin cifras', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue(
      summaryWith([cell({ product_name: 'A', status: 'SUPPRESSED_UNDER_THRESHOLD' }), cell({ product_name: 'B', status: 'SUPPRESSED_UNDER_THRESHOLD' })]),
    );
    show();
    const notice = await screen.findByTestId('all-hidden');
    expect(notice.textContent).toMatch(/Hay productos, pero ninguna cifra se puede mostrar/);
    expect(notice.textContent).toMatch(/al menos 3 agricultores\. Hay 2 productos declarados que aún no llegan/);
    expect(screen.queryByTestId('latest-figure')).toBeNull();
  });

  it.each([
    [429, 'El servidor está ocupado', /Su sesión sigue abierta/],
    [500, 'No se pudo cargar el resumen', /no respondió como se esperaba/],
  ])('error %s (05 §7 y §9): su propio estado con «Reintentar», sin datos residuales', async (status, title, text) => {
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(httpError(status)).mockResolvedValueOnce(summaryWith(CELLS));
    show();
    expect(await screen.findByText(title)).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByTestId('coverage')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('coverage');
    expect(collectiveService.summary).toHaveBeenCalledTimes(2);
  });

  it('sin permiso (05 §8): ofrece «Cerrar sesión» y no muestra cifras', async () => {
    vi.mocked(collectiveService.summary).mockRejectedValueOnce(httpError(403));
    show();
    expect(await screen.findByText('Su rol no tiene acceso a esta información')).toBeTruthy();
    expect(within(screen.getByTestId('summary-error')).getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy();
    expect(screen.queryByTestId('needs-section')).toBeNull();
  });

  it('versión de las cifras (H-05): abierta en el primer paso; sellada en el último con su versión', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValueOnce(summaryWith(CELLS));
    const { unmount } = show();
    const steps = await screen.findByTestId('version-steps');
    expect(within(steps).getByText('Abierta').closest('li')!.getAttribute('aria-current')).toBe('step');
    expect(await screen.findByText('Sellar: disponible al cerrar; todavía no se puede sellar.')).toBeTruthy();
    unmount();
    vi.mocked(collectiveService.summary).mockResolvedValueOnce({ ...summaryWith(CELLS), seal: SEAL });
    show();
    const sealed = await screen.findByTestId('seal-banner');
    expect(within(sealed).getByText('Sellada').closest('li')!.getAttribute('aria-current')).toBe('step');
    expect(within(sealed).getByText('Sellada · versión 1')).toBeTruthy();
    await waitFor(() => expect(collectiveService.sealState).toHaveBeenCalledTimes(1));
  });

  it('PLANIFICADA: no dibuja la línea de pasos; muestra el estado', async () => {
    vi.mocked(collectiveService.summary).mockResolvedValue({ ...summaryWith(CELLS), campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'PLANIFICADA' } });
    show();
    const version = await screen.findByTestId('version-tile');
    expect(within(version).queryByRole('list', { name: 'Versión de las cifras' })).toBeNull();
    expect(version.textContent).toMatch(/Planificada/);
  });
});
