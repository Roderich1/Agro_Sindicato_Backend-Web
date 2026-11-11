import { fireEvent, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fx from '../dev/fixtures/catalog-fixtures';
import { collectiveService } from '../services/collective.service';
import { identificationService } from '../services/identification.service';
import { productsService } from '../services/inventory.service';
import { CAMPAIGN, renderAt } from '../test/render';
import { CatalogPage } from './catalog.page';

vi.mock('../services/inventory.service', () => ({
  productsService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), associate: vi.fn(), closeAssociation: vi.fn() },
}));
vi.mock('../services/identification.service', () => ({
  identificationService: { list: vi.fn(), candidates: vi.fn(), history: vi.fn(), photoBlob: vi.fn(), link: vi.fn(), createProduct: vi.fn(), defer: vi.fn() },
}));

/** Contenedor «Catálogo y equivalencias» (rediseño, sesión C, 2026-11-10). Datos sintéticos. */
const BASE = '/colectivo/catalogo';
const LONG = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';

function Probe() {
  return <output data-testid="location">{useLocation().search}</output>;
}

function serve(fixture: fx.CatalogFixture) {
  vi.mocked(productsService.list).mockResolvedValue(fixture.products);
  vi.mocked(collectiveService.catalog).mockResolvedValue(fixture.catalog);
  vi.mocked(collectiveService.associations).mockResolvedValue(fixture.associations);
}

const render = (search = '') =>
  renderAt(
    <>
      <CatalogPage />
      <Probe />
    </>,
    { path: `${BASE}${search}` },
  );

const search = (value: string) => fireEvent.change(screen.getByLabelText(/^Buscar/), { target: { value } });
const shownProducts = () => screen.queryAllByTestId(/^product-/).map((row) => row.getAttribute('data-testid')!.slice('product-'.length));

describe('Catálogo y equivalencias (contenedor)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serve(fx.worst);
    vi.mocked(identificationService.list).mockResolvedValue([]);
  });

  it('E1 §6: tercera vista «Por identificar» por ?vista=identificacion, sin consultar ni escribir en las otras', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    await screen.findByTestId(`product-${LONG}`);
    expect(identificationService.list).not.toHaveBeenCalled();
    const views = within(screen.getByRole('group', { name: 'Vista' })).getAllByRole('button').map((button) => button.textContent);
    expect(views).toEqual(['Productos', 'Equivalencias', 'Por identificar']);
    fireEvent.click(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Por identificar' }));
    expect(await screen.findByText('No hay productos por identificar.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Productos por identificar' })).toBeTruthy();
    const query = new URLSearchParams(screen.getByTestId('location').textContent!);
    expect(query.get('vista')).toBe('identificacion');
    expect(query.get('campaign')).toBe(CAMPAIGN.id);
    expect(identificationService.list).toHaveBeenCalledWith('PENDING');
    for (const write of [identificationService.link, identificationService.createProduct, identificationService.defer, collectiveService.associate]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('un ?vista= desconocido abre «Productos»; ?vista=identificacion abre directamente la tercera vista', async () => {
    const view = render('?vista=otra');
    await screen.findByTestId(`product-${LONG}`);
    view.unmount();
    render('?vista=identificacion');
    expect(await screen.findByText('No hay productos por identificar.')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Por identificar' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('abre «Productos» por defecto, cambia con ?vista= conservando los demás parámetros y no escribe al abrir', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    await screen.findByTestId(`product-${LONG}`);
    expect(collectiveService.catalog).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Equivalencias' }));
    await screen.findByTestId('current-GLIFOSATO 480');
    const query = new URLSearchParams(screen.getByTestId('location').textContent!);
    expect(query.get('vista')).toBe('equivalencias');
    expect(query.get('campaign')).toBe(CAMPAIGN.id);
    for (const write of [productsService.create, productsService.update, productsService.deactivate, collectiveService.associate, collectiveService.closeAssociation]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('el enlace «Ver equivalencias» cambia de vista dentro del contenedor', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    fireEvent.click(await screen.findByRole('link', { name: 'Ver equivalencias' }));
    await screen.findByTestId('current-GLIFOSATO 480');
    expect(new URLSearchParams(screen.getByTestId('location').textContent!).get('campaign')).toBe(CAMPAIGN.id);
  });

  it('peor caso: 40 productos, búsqueda sin mayúsculas ni tildes por nombre, nombre comercial e ingrediente activo', async () => {
    render();
    await screen.findByTestId(`product-${LONG}`);
    expect(fx.worst.products).toHaveLength(40);
    expect(screen.getByTestId('products-count').textContent).toBe('38 productos activos.');
    search('glifosato');
    expect(shownProducts()).toEqual(
      expect.arrayContaining(['Glifosato 480', 'GLIFOSATO 480', 'Glifósato 480', LONG, 'Glifosato sal isopropilamina 480 g/L concentrado soluble (SL) – presentación bidón de 20 L']),
    );
    expect(shownProducts()).toHaveLength(5);
    search('ÚREA');
    expect(shownProducts().sort()).toEqual(['Urea', 'Úrea granulada']);
    search('barbecho total plus');
    expect(shownProducts()).toEqual([LONG]);
    search('cipermetrina');
    expect(shownProducts()).toEqual(['Cipermetrina 25 % EC']);
    expect(screen.getByTestId('products-count').textContent).toMatch(/^1 producto activo coincide con «cipermetrina» \(de 38\)\.$/);
  });

  it('sin coincidencias: lo distingue de «sin registros» y «Quitar filtros» vuelve a mostrar todo', async () => {
    render();
    await screen.findByTestId(`product-${LONG}`);
    search('fosfito de potasio');
    const empty = screen.getByTestId('products-no-match');
    expect(empty.getAttribute('data-state')).toBe('no-match');
    expect(empty.textContent).toMatch(/Ningún producto activo coincide con «fosfito de potasio»/);
    fireEvent.click(within(empty).getByRole('button', { name: 'Quitar filtros' }));
    expect(shownProducts()).toHaveLength(38);
  });

  it('agrupa por categoría (sin distinguir mayúsculas) y por unidad, sin inventar categorías', async () => {
    render();
    await screen.findByTestId(`product-${LONG}`);
    const herbicides = screen.getByTestId('group-herbicida');
    // «Herbicida», «herbicida» y «HERBICIDA» son la misma categoría.
    expect(within(herbicides).getByTestId('product-GLIFOSATO 480')).toBeTruthy();
    expect(within(herbicides).getByTestId('product-Glifósato 480')).toBeTruthy();
    expect(within(screen.getByTestId('group-~sin')).getByTestId('product-Jo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unidad' }));
    const others = screen.getByTestId('group-~otras');
    expect(others.textContent).toMatch(/Otras unidades \(no vinculables a cifras colectivas\)/);
    expect(within(others).getByTestId('product-Semilla de papa certificada')).toBeTruthy();
    expect(within(others).getAllByText('no vinculable a cifras colectivas').length).toBe(5);
    expect(screen.getByTestId('inactive-products').textContent).toMatch(/Ver inactivos \(2\)/);
  });

  it('equivalencias del peor caso: plurales, motivo de 280 caracteres completo, búsqueda sin tildes y sin sugerencias ni porcentajes', async () => {
    render('?vista=equivalencias');
    await screen.findByTestId('current-GLIFOSATO 480');
    expect(screen.getByTestId('product-Glifosato 480').textContent).toMatch(/Canónico de 1 denominación(?!es)/);
    const closed = screen.getByTestId('history-a-w1');
    expect(closed.textContent).toContain(fx.worst.associations.history[0]!.close_reason!);
    expect(fx.worst.associations.history[0]!.close_reason).toHaveLength(280);
    search('urea');
    expect(screen.getByTestId('current-Úrea granulada')).toBeTruthy();
    expect(screen.queryByTestId('current-GLIFOSATO 480')).toBeNull();
    search('');
    // Unidad no vinculable: no se asocia.
    expect((within(screen.getByTestId('product-Adherente')).getByRole('button', { name: 'Asociar…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByTestId('product-Cal agrícola')).getByRole('button', { name: 'Asociar…' }));
    expect(screen.getByTestId('impact-unavailable').textContent).toMatch(/antes y después: no disponible/);
    const options = [...(screen.getByLabelText('Producto canónico') as HTMLSelectElement).options].map((o) => o.textContent!);
    // Sólo la misma dimensión (kg), sin porcentajes ni marcas de «sugerido».
    expect(options.every((text) => text === 'Seleccione…' || /\((kg)\)$/.test(text))).toBe(true);
    expect(document.body.textContent).not.toMatch(/%\s*de\s*(parecido|confianza)|sugerid/i);
    expect(collectiveService.associate).not.toHaveBeenCalled();
  });

  it('vacío y uno: sin registros no es cero; un producto en singular', async () => {
    serve(fx.empty);
    const view = render();
    expect(await screen.findByText('Todavía no hay productos activos')).toBeTruthy();
    view.unmount();
    serve(fx.one);
    render();
    await screen.findByTestId('product-Urea');
    expect(screen.getByTestId('products-count').textContent).toBe('1 producto activo.');
  });

  it('un 403 en las equivalencias es «sin permiso», sin tablas residuales', async () => {
    const error = new AxiosError('forbidden', '403');
    error.response = { status: 403, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
    vi.mocked(collectiveService.catalog).mockRejectedValue(error);
    render('?vista=equivalencias');
    const text = await screen.findByText(/Su rol no tiene acceso/);
    expect(text.closest('[data-state]')!.getAttribute('data-state')).toBe('forbidden');
    expect(screen.queryByText('Todas las denominaciones están asociadas')).toBeNull();
    expect(screen.queryByText('Pendientes de asociar')).toBeNull();
  });
});
