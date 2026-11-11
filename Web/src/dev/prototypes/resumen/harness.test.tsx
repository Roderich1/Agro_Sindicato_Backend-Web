import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../../contexts/auth.context';
import { CAMPAIGN_IDS } from '../../fixtures/campaigns-fixtures';
import * as summaryFixtures from '../../fixtures/summary-fixtures';
import { datasetFor, type ResumenDataset } from './datasets';
import { ResumenPrototypes, VARIANTS } from './harness';
import { installStubs } from './stubs';

/** Cantidad con unidad («0 L», «1.234,5 KG»): nunca en una fila sin cifra publicada. */
const QUANTITY = /\d[\d.,]*\s?(L|KG)\b/;
const NEW = [2, 3, 4] as const;

let dataset: ResumenDataset = datasetFor('demo');
installStubs(() => dataset, 0);

/** Sesión sintética de Directiva (sin identidad real). */
const user = { id: 'u-1', name: 'Usuaria sintética', email: 'sintetico@example.test', role: 'DIRECTIVA', tenantId: 't-1', tenant: { id: 't-1', name: 'Sindicato sintético', slug: 'sintetico' } };

let xhrOpen: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
});
afterEach(() => {
  cleanup();
});

function show(search: string) {
  return render(
    <AuthContext.Provider value={{ user, isLoading: false, login: async () => undefined, logout: async () => undefined }}>
      <MemoryRouter initialEntries={[`/src/dev/resumen-prototipos.html${search}`]}>
        <Routes>
          <Route
            path="/src/dev/resumen-prototipos.html"
            element={
              <ResumenPrototypes
                onDataset={(next) => {
                  dataset = next;
                }}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const variant = () => document.querySelector('[data-variant]') as HTMLElement;
const cell = (name: string, unit: 'ML' | 'G') => within(variant()).getByTestId(`cell-DECLARED_NEED-${name}-${unit}`);

describe('prototipos del Resumen: las tres variantes con el mismo fixture', () => {
  it.each(NEW)('variante %i, worst: filas sin cifra sin número, barra ni cero; L y KG en listas separadas; ninguna petición', async (v) => {
    show(`?v=${v}&datos=worst`);
    await screen.findByTestId('needs-counts');
    const long = cell(summaryFixtures.LONG_PRODUCT, 'ML');
    expect(long.querySelector('[data-figure]')!.textContent).toBe('123.456.789,012 L');
    expect(long.querySelector('[data-bar-track]')).not.toBeNull();
    const zero = cell('Adherente agrícola no iónico', 'ML');
    expect(within(zero).getByText('0 L')).toBeTruthy();
    expect(zero.querySelector('[data-bar-track]')).toBeNull();
    for (const name of ['Fungicida protectante Mancozeb 80 % WP en bolsa de 25 kg', 'Fertilizante foliar quelatado con micronutrientes (Zn, B, Mn)']) {
      const hidden = cell(name, 'G');
      expect(hidden.textContent).not.toMatch(QUANTITY);
      expect(hidden.textContent).not.toMatch(/\b0\b/);
      expect(hidden.querySelector('[data-bar-track]')).toBeNull();
      expect(hidden.textContent).toMatch(/aportantes no revelados/);
    }
    // La primera lista de cada unidad es la de necesidades; la del consumo (plegado) viene después.
    const liters = within(variant()).getAllByRole('list', { name: 'En litros' })[0]!;
    const kilos = within(variant()).getAllByRole('list', { name: 'En kilogramos' })[0]!;
    expect(liters.textContent).not.toMatch(/\d\s?KG\b/);
    expect(kilos.textContent).not.toMatch(/\d\s?L\b/);
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/51 de 1\.284/);
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/Hay filas sin cifra/);
    expect(within(variant()).getByTestId('needs-counts').textContent).toMatch(/5 productos con cifra publicada · 1 oculto por privacidad · 2 sin cifra publicada/);
    expect(within(variant()).getByTestId('action-pending-changes').textContent).toMatch(/2 filas tienen cambios recibidos/);
    expect(document.body.textContent).not.toMatch(/Total general|prioridad/i);
    expect(xhrOpen).not.toHaveBeenCalled();
  });

  it.each(NEW)('variante %i, demo: conserva selector, Actualizar, Excel, Revisar borrador, Ver cobertura, consumo, tabla y definiciones', async (v) => {
    show(`?v=${v}&datos=demo`);
    await screen.findByTestId('needs-counts');
    const root = within(variant());
    expect(root.getByLabelText('Campaña')).toBeTruthy();
    expect(root.getByRole('button', { name: 'Actualizar' })).toBeTruthy();
    expect(root.getByRole('button', { name: 'Descargar Excel' })).toBeTruthy();
    expect(root.getAllByRole('link', { name: 'Revisar borrador' })[0]!.getAttribute('href')).toBe(`/colectivo/propuestas?campaign=${CAMPAIGN_IDS.demoActive}`);
    for (const link of root.getAllByRole('link', { name: 'Ver cobertura' })) expect(link.getAttribute('href')).toBe(`/colectivo/cobertura?campaign=${CAMPAIGN_IDS.demoActive}`);
    // Detalle accesible: consumo (aparte, no se compara), tabla completa con fechas y aportantes, definiciones.
    fireEvent.click(root.getByTestId('consumption').querySelector('summary')!);
    expect(root.getByTestId('consumption').textContent).toContain('18 L');
    fireEvent.click(root.getByText('Tabla completa: cifras, aportantes y fechas'));
    const table = root.getByRole('region', { name: /Necesidades declaradas por producto, con aportantes/ });
    expect(table.textContent).toMatch(/42,5 L/);
    expect(table.textContent).toMatch(/5/);
    expect(table.textContent).toMatch(/datos hasta|nov/i);
    fireEvent.click(root.getByText('Qué significan estas cifras'));
    expect(root.getByTestId('definitions').textContent).toMatch(/no se resta ni se compara/);
    // El sellado real sigue presente (campaña sin sellar) y no se puede sellar.
    expect((await root.findByTestId('seal-panel')).textContent).toMatch(/todavía no se puede sellar/);
    expect(document.getElementById('sellado')).not.toBeNull();
  });

  it.each(NEW)('variante %i, vacía / política / error / sin permiso / sin campañas: ningún cero ni cifra inventada', async (v) => {
    const { unmount } = show(`?v=${v}&datos=vacia`);
    await screen.findByTestId('needs-counts');
    expect(within(variant()).getByTestId('needs-counts').textContent).toMatch(/Sin necesidades publicadas/);
    expect(within(variant()).getByText('Sin necesidades publicadas')).toBeTruthy();
    expect(within(variant()).queryByTestId('latest-figure')).toBeNull();
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/0 de 7/);
    unmount();

    show(`?v=${v}&datos=politica`);
    await within(variant()).findByTestId('policy-pending');
    expect(within(variant()).queryByTestId('coverage')).toBeNull();
    expect(within(variant()).queryByTestId('needs-counts')).toBeNull();
    expect(within(variant()).queryByText(QUANTITY)).toBeNull();
    cleanup();

    show(`?v=${v}&datos=error`);
    const error = await within(variant()).findByTestId('summary-error');
    expect(error.textContent).toMatch(/Sin conexión con el servidor/);
    expect(within(error).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    cleanup();

    show(`?v=${v}&datos=sinpermiso`);
    expect((await within(variant()).findByTestId('summary-error')).textContent).toMatch(/no tiene acceso/);
    cleanup();

    show(`?v=${v}&datos=sincampanas`);
    expect(await within(variant()).findByText('No hay campañas')).toBeTruthy();
    expect(within(variant()).getByRole('link', { name: 'Ir a Campañas' }).getAttribute('href')).toBe('/campaigns');
  });

  it.each(NEW)('variante %i, cerrada sin sellar: aviso con enlace al sellado y sellado posible', async (v) => {
    show(`?v=${v}&datos=cerrada`);
    const action = await within(variant()).findByTestId('action-closed-unsealed');
    expect(within(action).getByRole('link', { name: 'Ir al sellado' }).getAttribute('href')).toBe('#sellado');
    await waitFor(() => expect(within(variant()).getByTestId('seal-panel').textContent).toMatch(/Sellar esta versión/));
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/0 de 0/);
    expect(within(variant()).getByTestId('coverage').textContent).not.toMatch(/%/);
  });

  it.each(NEW)('variante %i, sellada: versión identificada, cobertura al sellar, sin panel de sellado', async (v) => {
    show(`?v=${v}&datos=sellada`);
    const banner = await within(variant()).findByTestId('seal-banner');
    expect(banner.textContent).toMatch(/Versión 1 sellada/);
    expect(banner.textContent).toContain(summaryFixtures.LONG_AUTHOR);
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/Cobertura al sellar/);
    expect(within(variant()).queryByTestId('seal-panel')).toBeNull();
    expect(document.getElementById('sellado')).toBeNull();
  });

  it('las tres variantes muestran las mismas cifras publicadas (worst)', async () => {
    const figures: string[][] = [];
    for (const v of NEW) {
      show(`?v=${v}&datos=worst`);
      await screen.findByTestId('needs-counts');
      figures.push([...variant().querySelectorAll('[data-figure]')].map((el) => el.textContent!).sort());
      cleanup();
    }
    expect(figures[1]).toEqual(figures[0]);
    expect(figures[2]).toEqual(figures[0]);
    expect(figures[0]).toContain('0,025 KG');
  });

  it('orden: «Mayor a menor» ordena dentro de cada unidad y deja las filas sin cifra al final; «Por nombre» es alfabético', async () => {
    show('?v=2&datos=worst');
    await screen.findByTestId('needs-counts');
    const names = () => [...within(variant()).getAllByRole('list', { name: 'En litros' })[0]!.querySelectorAll('li')].map((li) => li.getAttribute('data-testid')!);
    const byQuantity = names();
    expect(byQuantity[0]).toContain(summaryFixtures.LONG_PRODUCT);
    expect(byQuantity[byQuantity.length - 1]).toContain('Insecticida Clorpirifos');
    fireEvent.click(within(variant()).getByRole('button', { name: 'Por nombre' }));
    const byName = names();
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
  });

  it('Comparación: la estimación es una referencia aparte (vigencia visible), nunca se suma ni se resta', async () => {
    show('?v=4&datos=worst');
    await screen.findByTestId('needs-counts');
    await within(variant()).findByTestId('estimation-stat');
    const long = cell(summaryFixtures.LONG_PRODUCT, 'ML');
    const reference = within(long).getByTestId('reference');
    expect(reference.textContent).toMatch(/123\.456\.789,012123456 L/);
    expect(reference.textContent).toMatch(/Desactualizado/);
    expect(within(cell('Glifosato 480 SL', 'ML')).getByTestId('reference').textContent).toMatch(/Sustituido/);
    expect(within(cell('Adherente agrícola no iónico', 'ML')).getByTestId('reference').textContent).toMatch(/Datos insuficientes/);
    expect(within(cell('Q', 'G')).getByTestId('reference').textContent).toMatch(/Cifra retirada/);
    expect(within(cell('Insecticida Clorpirifos 48 % EC', 'ML')).getByTestId('reference').textContent).toMatch(/Sin estimación/);
    expect(within(variant()).getByTestId('action-estimation-outdated')).toBeTruthy();
    expect(variant().textContent).not.toMatch(/diferencia|%\s*(más|menos)/i);
  });

  it('Comparación: sin estimación / política / error, el resto de la vista no se pierde', async () => {
    show('?v=4&datos=sellada');
    await screen.findByTestId('seal-banner');
    expect((await within(variant()).findByTestId('estimation-footer')).textContent).toMatch(/Sin estimación para esta campaña/);
    cleanup();
    show('?v=4&datos=estimacion-error');
    await screen.findByTestId('needs-counts');
    const footer = await within(variant()).findByTestId('estimation-footer');
    await waitFor(() => expect(footer.textContent).toMatch(/no se pudo consultar/));
    expect(within(variant()).getByTestId('coverage').textContent).toMatch(/6 de 9/);
    expect(within(variant()).getByTestId('action-estimation-error')).toBeTruthy();
  });

  it('Acción: el siguiente paso sale de los datos (borrador, sellado, campaña)', async () => {
    show('?v=3&datos=demo');
    expect((await within(variant()).findByTestId('next-step')).textContent).toMatch(/Revisar el borrador de propuesta/);
    cleanup();
    show('?v=3&datos=cerrada');
    expect((await within(variant()).findByTestId('next-step')).textContent).toMatch(/Revisar y sellar/);
    cleanup();
    show('?v=3&datos=vacia');
    expect((await within(variant()).findByTestId('next-step')).textContent).toMatch(/Esperar aportes/);
  });

  it('el selector persiste ?v= y las variantes son las cuatro esperadas', async () => {
    show('?v=3&datos=demo');
    await screen.findByTestId('needs-counts');
    expect(VARIANTS.map((entry) => entry.name)).toEqual(['Actual', 'Panorama', 'Acción', 'Comparación']);
    const picker = screen.getByRole('navigation', { name: 'Prototype variants' });
    expect(within(picker).getByRole('button', { name: 'Acción' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(within(picker).getByRole('button', { name: 'Panorama' }));
    await waitFor(() => expect(variant().getAttribute('data-variant')).toBe('panorama'));
  });
});
