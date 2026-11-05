import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectiveRoute } from '../components/collective-route';
import { COLLECTIVE_PATHS, WEB_NOT_FOR_FARMERS_PATH } from '../lib/navigation';
import { productsService } from '../services/inventory.service';
import { renderAt } from '../test/render';
import type { Product } from '../types/inventory';
import { ProductsPage } from './products.page';

vi.mock('../services/inventory.service', () => ({
  productsService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}));

/** Gestión → Productos. Datos sintéticos. */
function product(name: string, overrides: Partial<Product> = {}): Product {
  return {
    id: `id-${name}`,
    tenantId: 't-1',
    name,
    commercialName: null,
    activeIngredient: null,
    category: null,
    toxicologicalCategory: null,
    safetyDataSheetUrl: null,
    safetyDataSheetName: null,
    safetyInstructions: null,
    qrCodeValue: null,
    unit: 'L',
    minimumStock: '0',
    expirationWarningDays: 90,
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

const CATALOG = [
  product('Herbicida sintético', { category: 'Herbicida', activeIngredient: 'Glifosato' }),
  product('Urea sintética', { unit: 'kg', category: 'Fertilizante' }),
  product('Retirado sintético', { isActive: false }),
];

function httpError(status: number, message?: string) {
  const error = new AxiosError('fail', String(status));
  error.response = { status, data: { message }, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const PATH = COLLECTIVE_PATHS.products;

describe('Gestión → Productos', () => {
  beforeEach(() => {
    vi.mocked(productsService.list).mockReset().mockResolvedValue(CATALOG);
    vi.mocked(productsService.create).mockReset();
    vi.mocked(productsService.update).mockReset();
    vi.mocked(productsService.deactivate).mockReset();
  });

  it('lista los activos con nombre, unidad y categoría; los inactivos quedan en «Ver inactivos»', async () => {
    renderAt(<ProductsPage />, { path: PATH });
    const herb = await screen.findByTestId('product-Herbicida sintético');
    expect(herb.textContent).toMatch(/Herbicida sintético.*Glifosato.*L.*Herbicida/);
    expect(within(screen.getByTestId('product-Urea sintética')).getByText('kg')).toBeTruthy();
    expect(screen.queryByTestId('product-Retirado sintético')).toBeNull();
    const inactive = screen.getByTestId('inactive-products');
    expect(inactive.textContent).toMatch(/Ver inactivos \(1\)/);
    expect(within(inactive).getByTestId('inactive-Retirado sintético')).toBeTruthy();
    // Una sola acción primaria y el enlace a las equivalencias.
    expect(screen.getByRole('button', { name: 'Nuevo producto' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver equivalencias' }).getAttribute('href')).toBe(COLLECTIVE_PATHS.reconciliation);
  });

  it('la Directiva crea un producto con nombre y unidad (opcionales aparte) y aparece en el listado', async () => {
    const created = product('Fungicida nuevo', { unit: 'kg', category: 'Fungicida' });
    vi.mocked(productsService.create).mockResolvedValue(created);
    renderAt(<ProductsPage />, { path: PATH, role: 'DIRECTIVA' });
    await screen.findByTestId('product-Herbicida sintético');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    const submit = screen.getByRole('button', { name: 'Crear producto' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: '  Fungicida nuevo ' } });
    // Sin unidad no se puede crear.
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Kilogramos (kg)'));
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Fungicida' } });
    expect(submit.disabled).toBe(false);
    vi.mocked(productsService.list).mockResolvedValue([...CATALOG, created]);
    fireEvent.click(submit);
    await waitFor(() => expect(productsService.create).toHaveBeenCalledWith({ name: 'Fungicida nuevo', unit: 'kg', category: 'Fungicida' }));
    expect(await screen.findByText('«Fungicida nuevo» quedó creado en el catálogo.')).toBeTruthy();
    const row = await screen.findByTestId('product-Fungicida nuevo');
    expect(row.textContent).toMatch(/kg.*Fungicida/);
  });

  it('un nombre que ya existe (sin importar mayúsculas ni tildes) se avisa y no se envía', async () => {
    renderAt(<ProductsPage />, { path: PATH });
    await screen.findByTestId('product-Herbicida sintético');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'herbicida SINTETICO' } });
    fireEvent.click(screen.getByLabelText('Litros (L)'));
    expect(screen.getByRole('alert').textContent).toMatch(/Ya existe «Herbicida sintético» en el catálogo del sindicato/);
    expect((screen.getByRole('button', { name: 'Crear producto' }) as HTMLButtonElement).disabled).toBe(true);
    // También contra los inactivos.
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Retirado sintético' } });
    expect(screen.getByRole('alert').textContent).toMatch(/\(inactivo\)/);
    expect(productsService.create).not.toHaveBeenCalled();
  });

  it('si el servidor responde que el nombre ya existe (409), lo dice con claridad', async () => {
    vi.mocked(productsService.create).mockRejectedValue(httpError(409, 'Ya existe un producto con ese nombre en este sindicato.'));
    renderAt(<ProductsPage />, { path: PATH });
    await screen.findByTestId('product-Herbicida sintético');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: 'Otro nombre' } });
    fireEvent.click(screen.getByLabelText('Litros (L)'));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText(/Ya existe un producto con ese nombre en este sindicato\. Use el existente o elija otro nombre\./)).toBeTruthy();
  });

  it('editar cambia los datos descriptivos y conserva la unidad', async () => {
    vi.mocked(productsService.update).mockResolvedValue(product('Herbicida sintético', { category: 'Herbicida total' }));
    renderAt(<ProductsPage />, { path: PATH });
    fireEvent.click(within(await screen.findByTestId('product-Herbicida sintético')).getByRole('button', { name: 'Editar' }));
    expect(screen.getByTestId('unit-locked').textContent).toMatch(/L.*La unidad no se cambia/);
    expect(screen.queryByLabelText('Litros (L)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Herbicida total' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(productsService.update).toHaveBeenCalled());
    const [id, payload] = vi.mocked(productsService.update).mock.calls[0]!;
    expect(id).toBe('id-Herbicida sintético');
    expect(payload).toEqual({ name: 'Herbicida sintético', commercialName: '', activeIngredient: 'Glifosato', category: 'Herbicida total' });
    expect(payload).not.toHaveProperty('unit');
  });

  it('inactivar pide confirmación y no borra', async () => {
    vi.mocked(productsService.deactivate).mockResolvedValue(product('Urea sintética', { isActive: false }));
    renderAt(<ProductsPage />, { path: PATH });
    fireEvent.click(within(await screen.findByTestId('product-Urea sintética')).getByRole('button', { name: 'Inactivar' }));
    expect(productsService.deactivate).not.toHaveBeenCalled();
    expect(screen.getByText(/No se borra: sus cifras publicadas, sus equivalencias y su historial se\s+conservan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(productsService.deactivate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('product-Urea sintética')).getByRole('button', { name: 'Inactivar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar inactivación' }));
    await waitFor(() => expect(productsService.deactivate).toHaveBeenCalledWith('id-Urea sintética'));
    expect(await screen.findByText(/«Urea sintética» quedó inactivo/)).toBeTruthy();
  });

  it('un 403 del servidor se explica sin datos residuales', async () => {
    vi.mocked(productsService.list).mockRejectedValue(httpError(403));
    renderAt(<ProductsPage />, { path: PATH });
    expect(await screen.findByText(/Su rol no puede administrar productos/)).toBeTruthy();
    expect(screen.queryByTestId('product-Herbicida sintético')).toBeNull();
  });

  it('un Agricultor que abre la ruta directa es redirigido y no ve el catálogo ni pide datos', () => {
    renderAt(
      <CollectiveRoute>
        <ProductsPage />
      </CollectiveRoute>,
      { role: 'AGRICULTOR', path: PATH, routes: [{ path: WEB_NOT_FOR_FARMERS_PATH, element: <p>aviso: la Web no es para agricultores</p> }] },
    );
    expect(screen.getByText('aviso: la Web no es para agricultores')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).toBeNull();
    expect(productsService.list).not.toHaveBeenCalled();
  });
});
