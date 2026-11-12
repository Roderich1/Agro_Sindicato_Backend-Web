import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { renderAt } from '../test/render';
import type { SubstitutionPermissions } from '../types/joint-purchase-calls';
import { SubstitutionPermissionsSection } from './substitution-permissions-section';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    eligibleResponsibles: vi.fn(),
    substitutionPermissions: vi.fn(),
    grantSubstitution: vi.fn(),
    revokeSubstitution: vi.fn(),
  },
}));

const ADMIN_VIEW: SubstitutionPermissions = {
  contractVersion: 1,
  can_grant: true,
  holds_permission: false,
  holders: [
    {
      user_ref: 'u-3',
      name: 'Directiva sintética',
      role: 'DIRECTIVA',
      eligible: false,
      granted_at: '2026-11-12T10:00:00.000Z',
      granted_by: { user_ref: 'u-1', name: 'Administradora sintética' },
      reason: 'Coordinar entregas',
    },
  ],
  history: [
    {
      at: '2026-11-12T10:00:00.000Z',
      action: 'GRANTED',
      user: { user_ref: 'u-3', name: 'Directiva sintética' },
      actor: { user_ref: 'u-1', name: 'Administradora sintética' },
      reason: 'Coordinar entregas',
    },
  ],
};

const dialog = () => screen.getByRole('dialog');

describe('Permiso «Sustituir responsable» (P-A A1)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('una Administrador lo concede a otra persona concreta, nunca a sí misma, con motivo y confirmación', async () => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissions).mockResolvedValue(ADMIN_VIEW);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([
      { user_ref: 'u-1', name: 'Administradora sintética', role: 'ADMINISTRADOR' },
      { user_ref: 'u-3', name: 'Directiva sintética', role: 'DIRECTIVA' },
      { user_ref: 'u-4', name: 'Tesorera sintética', role: 'DIRECTIVA' },
    ]);
    vi.mocked(jointPurchaseCallsService.grantSubstitution).mockResolvedValue({
      ...ADMIN_VIEW,
      holders: [...ADMIN_VIEW.holders, { ...ADMIN_VIEW.holders[0]!, user_ref: 'u-4', name: 'Tesorera sintética', eligible: true, reason: 'Suplente' }],
    });
    renderAt(<SubstitutionPermissionsSection userId="u-1" />, { role: 'ADMINISTRADOR' });
    expect((await screen.findByTestId('substitution-holder-u-3')).textContent).toMatch(/No habilitada: el permiso no se ejerce/);
    expect(screen.getByTestId('substitution-history').textContent).toMatch(/Motivo: Coordinar entregas/);
    fireEvent.click(screen.getByTestId('substitution-grant-button'));
    const select = (await within(dialog()).findByLabelText('Persona')) as HTMLSelectElement;
    // Ni ella misma ni quien ya lo tiene.
    await waitFor(() => expect([...select.options].map((option) => option.value)).toEqual(['', 'u-4']));
    const submit = () => within(dialog()).getByRole('button', { name: 'Conceder el permiso' }) as HTMLButtonElement;
    fireEvent.change(select, { target: { value: 'u-4' } });
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    expect(submit().disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: 'Suplente' } });
    fireEvent.click(submit());
    await waitFor(() => expect(jointPurchaseCallsService.grantSubstitution).toHaveBeenCalledWith('u-4', 'Suplente'));
    expect(await screen.findByTestId('substitution-holder-u-4')).toBeTruthy();
  });

  it('quien no puede concederlo sólo lo consulta; quien lo tiene puede renunciar', async () => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissions).mockResolvedValue({ ...ADMIN_VIEW, can_grant: false, holds_permission: true });
    vi.mocked(jointPurchaseCallsService.revokeSubstitution).mockResolvedValue({ ...ADMIN_VIEW, can_grant: false, holders: [] });
    renderAt(<SubstitutionPermissionsSection userId="u-3" />, { role: 'DIRECTIVA' });
    await screen.findByTestId('substitution-holder-u-3');
    expect(screen.queryByTestId('substitution-grant-button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Renunciar al permiso' }));
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Renunciar' }));
    await waitFor(() => expect(jointPurchaseCallsService.revokeSubstitution).toHaveBeenCalledWith('u-3', null));
    expect(await screen.findByTestId('substitution-holders-empty')).toBeTruthy();
  });
});
