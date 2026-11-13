import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBSTITUTION_HISTORY_NOTE } from '../lib/joint-purchase-call-text';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { renderAt } from '../test/render';
import type { SubstitutionPermissionsHistory } from '../types/joint-purchase-calls';
import { SubstitutionPermissionsSection } from './substitution-permissions-section';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: { substitutionPermissionsHistory: vi.fn() },
}));

/** E4_EJEMPLOS_RESPUESTAS.md §2.10: `GET /joint-purchase-substitution-permissions`, sólo lectura. Datos sintéticos. */
const HISTORY: SubstitutionPermissionsHistory = {
  contractVersion: 2,
  retired_at: '2026-11-13T18:00:00.000Z',
  notice: 'Ya no se usa: sustituye la Administración habilitada',
  can_grant: false,
  holders: [
    {
      user_ref: 'u-dir-2',
      name: 'Directiva sintética D2',
      role: 'DIRECTIVA',
      granted_at: '2026-11-12T19:00:00.000Z',
      granted_by: { user_ref: 'u-adm-1', name: 'Administración sintética A1' },
      reason: 'Cobertura sintética de vacaciones',
    },
  ],
  history: [
    {
      at: '2026-11-12T19:00:00.000Z',
      action: 'GRANTED',
      user: { user_ref: 'u-dir-2', name: 'Directiva sintética D2' },
      actor: { user_ref: 'u-adm-1', name: 'Administración sintética A1' },
      reason: 'Cobertura sintética de vacaciones',
    },
  ],
};

const open = (panel: HTMLElement) => {
  (panel as HTMLDetailsElement).open = true;
  fireEvent(panel, new Event('toggle'));
};

/*
 * Reescritas por E4 §3.2 (decisión del autor del 2026-11-13): el permiso del
 * sindicato «Sustituir responsable» ya no se concede, retira ni renuncia (el
 * servidor responde 409 SUBSTITUTION_PERMISSION_RETIRED). Las pruebas
 * anteriores de conceder con motivo y de renunciar comprobaban esas acciones;
 * ahora se comprueba que su historia es de sólo lectura, plegada y sin
 * controles para nadie, tampoco para la Administración.
 */
describe('Permiso «Sustituir responsable»: historia de sólo lectura (E4 §3.2)', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['ADMINISTRADOR', 'DIRECTIVA'])('%s: plegada; al desplegar, quién lo tenía, quién lo concedió, motivo e historial, sin ningún botón', async (role) => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissionsHistory).mockResolvedValue(HISTORY);
    renderAt(<SubstitutionPermissionsSection />, { role });
    const panel = screen.getByTestId('substitution-history');
    expect(panel.tagName).toBe('DETAILS');
    expect((panel as HTMLDetailsElement).open).toBe(false);
    // Plegada: no se pide nada hasta desplegarla.
    expect(jointPurchaseCallsService.substitutionPermissionsHistory).not.toHaveBeenCalled();
    expect(within(panel).getByText(/Historial del permiso «Sustituir responsable» \(ya no se usa\)/)).toBeTruthy();
    open(panel);
    const holder = await within(panel).findByTestId('substitution-holder-u-dir-2');
    expect(holder.textContent).toMatch(/Directiva sintética D2.*Directiva.*Concedido el .* por Administración sintética A1.*Motivo: Cobertura sintética de vacaciones/);
    expect(within(panel).getByTestId('substitution-retired-notice').textContent).toMatch(/^Ya no se usa: sustituye la Administración habilitada\. Retirado el /);
    expect(within(panel).getByText(SUBSTITUTION_HISTORY_NOTE)).toBeTruthy();
    expect(within(panel).getAllByTestId('substitution-history-event')[0]!.textContent).toMatch(/Concedido · Directiva sintética D2 · por Administración sintética A1/);
    expect(within(panel).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryAllByRole('checkbox')).toHaveLength(0);
    expect(panel.textContent).not.toMatch(/Conceder el permiso|Retirar el permiso|Renunciar/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(jointPurchaseCallsService.substitutionPermissionsHistory).toHaveBeenCalledTimes(1);
  });

  it('sin personas ni historial: lo dice, sin inventar datos', async () => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissionsHistory).mockResolvedValue({ ...HISTORY, holders: [], history: [] });
    renderAt(<SubstitutionPermissionsSection />, { role: 'ADMINISTRADOR' });
    const panel = screen.getByTestId('substitution-history');
    open(panel);
    expect(await within(panel).findByTestId('substitution-holders-empty')).toBeTruthy();
    expect(within(panel).getByText('Nadie concedió ni retiró este permiso.')).toBeTruthy();
  });

  it('si falla la carga: error con reintento', async () => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissionsHistory).mockRejectedValueOnce(new Error('red')).mockResolvedValue(HISTORY);
    renderAt(<SubstitutionPermissionsSection />, { role: 'ADMINISTRADOR' });
    const panel = screen.getByTestId('substitution-history');
    open(panel);
    fireEvent.click(await within(panel).findByRole('button', { name: /Reintentar|Volver a intentar/ }));
    await waitFor(() => expect(within(panel).getByTestId('substitution-holder-u-dir-2')).toBeTruthy());
  });
});
