import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import type { Association, CatalogEntry } from '../types/collective';
import { renderAt } from '../test/render';
import { ProductReconciliationPage } from './product-reconciliation.page';

vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), associate: vi.fn(), closeAssociation: vi.fn() },
}));

const CATALOG: CatalogEntry[] = [
  { product_ref: 'belator', product_name: 'Belator', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'bellator', product_name: 'Bellator', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'urea', product_name: 'Urea F06', unit: 'kg', base_unit: 'G', is_active: true },
  { product_ref: 'coad', product_name: 'Coadyuvante', unit: 'unidad', base_unit: null, is_active: true },
];

const ASSOCIATED: Association = {
  association_ref: 'a-2',
  product_ref: 'bellator',
  product_name: 'Bellator',
  canonical_product_ref: 'belator',
  canonical_product_name: 'Belator',
  valid_from: '2026-10-16T12:00:00.000Z',
  valid_to: null,
  actor_ref: 'u-1',
  actor_name: 'Directiva sintética',
  reason: 'misma formulación',
  closed_by_ref: null,
  closed_by_name: null,
  close_reason: null,
};

describe('Reconciliación de denominaciones', () => {
  beforeEach(() => {
    vi.mocked(collectiveService.catalog).mockResolvedValue(CATALOG);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    vi.mocked(collectiveService.associate).mockResolvedValue({ changed: true, association: 'a-2' });
  });

  it('no asocia nada sin elegir canónico, motivo y confirmación explícita', async () => {
    renderAt(<ProductReconciliationPage />, { path: '/colectivo/reconciliacion' });
    const row = await screen.findByTestId('product-Bellator');
    fireEvent.click(within(row).getByRole('button', { name: 'Asociar…' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar asociación' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    // Sólo candidatos de la misma dimensión (L): nada en KG ni sin unidad.
    const select = screen.getByLabelText('Producto canónico') as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toEqual(['Seleccione…', 'Belator (L)']);

    fireEvent.change(select, { target: { value: 'belator' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'misma formulación' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm.disabled).toBe(false);

    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [ASSOCIATED], history: [] });
    fireEvent.click(confirm);
    expect(await screen.findByText(/«Bellator» quedó asociado a «Belator»/)).toBeTruthy();
    expect(collectiveService.associate).toHaveBeenCalledWith({
      productId: 'bellator',
      canonicalProductId: 'belator',
      reason: 'misma formulación',
      confirmed: true,
    });
    expect(await screen.findByTestId('current-Bellator')).toBeTruthy();
  });

  it('una unidad no vinculable y un canónico con alias no se pueden asociar', async () => {
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [ASSOCIATED], history: [] });
    renderAt(<ProductReconciliationPage />, { path: '/colectivo/reconciliacion' });
    const coad = await screen.findByTestId('product-Coadyuvante');
    expect((within(coad).getByRole('button', { name: 'Asociar…' }) as HTMLButtonElement).disabled).toBe(true);
    const belator = screen.getByTestId('product-Belator');
    expect(belator.textContent).toMatch(/Canónico de 1/);
    expect((within(belator).getByRole('button', { name: 'Asociar…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('el historial muestra anterior → nuevo, actor, fecha y motivos', async () => {
    const closed: Association = {
      ...ASSOCIATED,
      association_ref: 'a-1',
      canonical_product_ref: 'urea',
      canonical_product_name: 'Otro canónico',
      valid_from: '2026-10-15T12:00:00.000Z',
      valid_to: '2026-10-16T12:00:00.000Z',
      reason: 'primera asociación',
      closed_by_ref: 'u-2',
      closed_by_name: 'Presidente sintético',
      close_reason: 'era incorrecta',
    };
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [ASSOCIATED], history: [closed] });
    renderAt(<ProductReconciliationPage />, { path: '/colectivo/reconciliacion' });
    const old = await screen.findByTestId('history-a-1');
    expect(old.textContent).toMatch(/Bellator → Otro canónico/);
    expect(old.textContent).toMatch(/Presidente sintético: era incorrecta/);
    expect(screen.getByTestId('history-a-2').textContent).toMatch(/vigente/);
  });

  it('deshacer exige motivo y confirmación', async () => {
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [ASSOCIATED], history: [] });
    vi.mocked(collectiveService.closeAssociation).mockResolvedValue({ changed: true, association: 'a-2' });
    renderAt(<ProductReconciliationPage />, { path: '/colectivo/reconciliacion' });
    fireEvent.click(within(await screen.findByTestId('current-Bellator')).getByRole('button', { name: 'Deshacer' }));
    const submit = screen.getByRole('button', { name: 'Deshacer asociación' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'error' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submit);
    await vi.waitFor(() =>
      expect(collectiveService.closeAssociation).toHaveBeenCalledWith('bellator', { reason: 'error', confirmed: true }),
    );
  });
});
