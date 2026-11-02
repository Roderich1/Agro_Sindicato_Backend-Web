import { fireEvent, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { SEAL, sealStateWith } from '../test/fixtures';
import { CAMPAIGN, renderAt } from '../test/render';
import { SealPanel } from './seal-panel';

vi.mock('../services/collective.service', () => ({
  collectiveService: { sealState: vi.fn(), seal: vi.fn() },
}));

function conflict(message: string) {
  const error = new AxiosError('fail', '409');
  error.response = { status: 409, data: { message }, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

/** F07 (2026-10-23): revisión previa, confirmación y efectos del sellado. */
describe('Panel de sellado', () => {
  beforeEach(() => {
    vi.mocked(collectiveService.sealState).mockReset();
    vi.mocked(collectiveService.seal).mockReset();
  });

  it('muestra la revisión (cobertura, datos aceptados hasta, avisos y límites) antes de ofrecer sellar', async () => {
    vi.mocked(collectiveService.sealState).mockResolvedValue(
      sealStateWith({
        review: { ...sealStateWith().review!, open_disputes: true, pending_changes: true },
      }),
    );
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={() => undefined} />);
    const review = await screen.findByTestId('seal-review');
    expect(review.textContent).toMatch(/4 de 7 agricultores vinculados con cifras publicadas/);
    expect(review.textContent).toMatch(/Datos aceptados hasta/);
    const panel = screen.getByTestId('seal-panel');
    expect(panel.textContent).toMatch(/aportes en conflicto sin resolver/);
    expect(panel.textContent).toMatch(/se sellará ese valor anterior/);
    expect(panel.textContent).toMatch(/filas no tienen cifra/);
    expect(panel.textContent).toMatch(/no puede asegurar que todos los teléfonos publicaron todo/);
    expect(panel.textContent).toMatch(/no da permisos nuevos de lectura y no hace anónimos/);
    expect(panel.textContent).not.toMatch(/F07-POL-01/);
    expect(collectiveService.seal).not.toHaveBeenCalled();
  });

  it('exige confirmación expresa: sin marcar no se envía; al confirmar envía la revisión mostrada una sola vez', async () => {
    vi.mocked(collectiveService.sealState).mockResolvedValue(sealStateWith());
    let resolveSeal: (value: unknown) => void = () => undefined;
    vi.mocked(collectiveService.seal).mockImplementation(() => new Promise((done) => { resolveSeal = done as never; }));
    const onSealed = vi.fn();
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={onSealed} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sellar esta versión/ }));
    const confirm = screen.getByRole('button', { name: 'Sellar' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(collectiveService.seal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    // Doble toque mientras espera: no hay una segunda petición.
    fireEvent.click(screen.getByRole('button', { name: /Sellando/ }));
    expect(collectiveService.seal).toHaveBeenCalledTimes(1);
    expect(collectiveService.seal).toHaveBeenCalledWith(CAMPAIGN.id, 'c'.repeat(64));
    resolveSeal(sealStateWith({ state: 'SEALED', seal: SEAL, can_seal: false, review: null, created: true }));
    await waitFor(() => expect(onSealed).toHaveBeenCalledTimes(1));
  });

  it('cancelar no envía nada', async () => {
    vi.mocked(collectiveService.sealState).mockResolvedValue(sealStateWith());
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sellar esta versión/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(collectiveService.seal).not.toHaveBeenCalled();
  });

  it('una revisión obsoleta no sella nada: se explica y se vuelve a pedir la revisión vigente', async () => {
    vi.mocked(collectiveService.sealState).mockResolvedValue(sealStateWith());
    vi.mocked(collectiveService.seal).mockRejectedValueOnce(conflict('SEAL_REVIEW_STALE'));
    const onSealed = vi.fn();
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={onSealed} />);
    fireEvent.click(await screen.findByRole('button', { name: /Sellar esta versión/ }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Sellar' }));
    expect(await screen.findByText(/cambiaron después de su revisión: no se selló nada/)).toBeTruthy();
    expect(onSealed).not.toHaveBeenCalled();
    await waitFor(() => expect(collectiveService.sealState).toHaveBeenCalledTimes(2));
  });

  it('bloqueos: bandera desactivada, política pendiente o campaña abierta, sin botón de sellar', async () => {
    vi.mocked(collectiveService.sealState).mockResolvedValue(
      sealStateWith({ can_seal: false, review: null, blocked_by: ['SEALING_DISABLED', 'POLICY_PENDING', 'CAMPAIGN_NOT_CLOSED'] }),
    );
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={() => undefined} />);
    const panel = await screen.findByTestId('seal-panel');
    expect(panel.textContent).toMatch(/desactivado en este servidor/);
    expect(panel.textContent).toMatch(/falta la política de divulgación aprobada/);
    expect(panel.textContent).toMatch(/Sólo se sella una campaña cerrada/);
    expect(screen.queryByRole('button', { name: /Sellar/ })).toBeNull();
  });

  it('sin conexión: lo informa y no ofrece sellar', async () => {
    vi.mocked(collectiveService.sealState).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    renderAt(<SealPanel campaignId={CAMPAIGN.id} onSealed={() => undefined} />);
    expect(await screen.findByText(/Sin conexión con el servidor/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sellar/ })).toBeNull();
  });
});
