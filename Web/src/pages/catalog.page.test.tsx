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

const viewNav = () => screen.getByRole('navigation', { name: 'Vistas del catálogo' });
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
    // Sin el recuento de cada pestaña (D5), que depende de lo que ya cargó cada vista.
    const views = within(viewNav()).getAllByRole('link').map((link) => link.textContent!.replace(/ · .*$/, ''));
    expect(views).toEqual(['Productos', 'Nombres equivalentes', 'Por identificar']);
    fireEvent.click(within(viewNav()).getByRole('link', { name: 'Por identificar' }));
    expect(await screen.findByText('No hay productos por identificar.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Por identificar' })).toBeTruthy();
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
    expect(within(viewNav()).getByRole('link', { name: 'Por identificar' }).getAttribute('aria-current')).toBe('page');
  });

  it('D5 (lámina 39): las pestañas llevan el recuento que ya cargó cada vista, sin llamadas nuevas ni ceros inventados', async () => {
    render();
    await screen.findByTestId(`product-${LONG}`);
    // Productos: los activos de la lista ya cargada (peor caso: 38). Equivalencias todavía no cargó: sin número.
    expect((await within(viewNav()).findByTestId('catalog-count-productos')).textContent).toBe('38');
    expect(within(viewNav()).getByRole('link', { name: 'Productos · 38 productos activos' })).toBeTruthy();
    expect(within(viewNav()).queryByTestId('catalog-count-equivalencias')).toBeNull();
    expect(collectiveService.associations).not.toHaveBeenCalled();
    fireEvent.click(within(viewNav()).getByRole('link', { name: /^Nombres equivalentes/ }));
    await screen.findByTestId('current-GLIFOSATO 480');
    const unions = fx.worst.associations.current.length;
    expect((await within(viewNav()).findByTestId('catalog-count-equivalencias')).textContent).toBe(unions === 1 ? '1 nombre unido' : `${unions} nombres unidos`);
    // El de Productos sigue siendo el último dato cargado.
    expect(within(viewNav()).getByTestId('catalog-count-productos').textContent).toBe('38');
    expect(productsService.list).toHaveBeenCalledTimes(1);
    expect(collectiveService.associations).toHaveBeenCalledTimes(1);
  });

  it('D5: si la carga de productos falla, la pestaña va sin número', async () => {
    vi.mocked(productsService.list).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    render();
    await screen.findByText(/Sin conexión con el servidor/);
    expect(within(viewNav()).queryByTestId('catalog-count-productos')).toBeNull();
  });

  it('abre «Productos» por defecto, cambia con ?vista= conservando los demás parámetros y no escribe al abrir', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    await screen.findByTestId(`product-${LONG}`);
    expect(collectiveService.catalog).not.toHaveBeenCalled();
    fireEvent.click(within(viewNav()).getByRole('link', { name: 'Nombres equivalentes' }));
    await screen.findByTestId('current-GLIFOSATO 480');
    const query = new URLSearchParams(screen.getByTestId('location').textContent!);
    expect(query.get('vista')).toBe('equivalencias');
    expect(query.get('campaign')).toBe(CAMPAIGN.id);
    for (const write of [productsService.create, productsService.update, productsService.deactivate, collectiveService.associate, collectiveService.closeAssociation]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('el enlace «Nombres equivalentes» de Productos cambia de vista dentro del contenedor', async () => {
    render(`?campaign=${CAMPAIGN.id}`);
    await screen.findByTestId(`product-${LONG}`);
    fireEvent.click(screen.getByText('Nombres equivalentes', { selector: 'p a' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Por unidad' }));
    const others = screen.getByTestId('group-~otras');
    expect(others.textContent).toMatch(/Otras unidades \(no vinculables a cifras colectivas\)/);
    expect(within(others).getByTestId('product-Semilla de papa certificada')).toBeTruthy();
    expect(within(others).getAllByText('no vinculable a cifras colectivas').length).toBe(5);
    expect(screen.getByTestId('inactive-products').textContent).toMatch(/Ver productos inactivos \(2\)/);
  });

  it('equivalencias del peor caso: plurales, motivo de 280 caracteres completo, búsqueda sin tildes y sin sugerencias ni porcentajes', async () => {
    render('?vista=equivalencias');
    await screen.findByTestId('current-GLIFOSATO 480');
    // Rediseño v2 (lámina 22): el nombre principal de una unión no figura entre los sueltos; se dice en una nota.
    expect(screen.queryByTestId('product-Glifosato 480')).toBeNull();
    expect(screen.getByTestId('canonical-note').textContent).toContain('«Glifosato 480»');
    const closed = screen.getByTestId('history-a-w1');
    expect(closed.textContent).toContain(fx.worst.associations.history[0]!.close_reason!);
    expect(fx.worst.associations.history[0]!.close_reason).toHaveLength(280);
    search('urea');
    expect(screen.getByTestId('current-Úrea granulada')).toBeTruthy();
    expect(screen.queryByTestId('current-GLIFOSATO 480')).toBeNull();
    search('');
    // Unidad no vinculable: no se asocia.
    expect((within(screen.getByTestId('product-Adherente')).getByRole('button', { name: /^Unir/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(screen.getByTestId('product-Cal agrícola')).getByRole('button', { name: /^Unir/ }));
    expect(screen.getByTestId('impact-unavailable').textContent).toMatch(/antes y después: no disponible/);
    const options = [...(screen.getByLabelText('Con el producto') as HTMLSelectElement).options].map((o) => o.textContent!);
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
