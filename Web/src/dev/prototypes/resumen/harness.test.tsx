import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATASETS } from './fixtures';
import ResumenPrototypes from './harness';

/** Cantidad con unidad (p. ej. «1.250 L», «0,025 L», «0 L»). */
const QUANTITY = /\d[\d.,]*\s?(L|KG)\b/;
const VARIANTS = [1, 2] as const;

let xhrOpen: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function renderProto(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/prototipos/resumen${search}`]}>
      <Routes>
        <Route
          path="/prototipos/resumen"
          element={
            <>
              <ResumenPrototypes />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function variantRoot() {
  return document.querySelector('[data-variant]') as HTMLElement;
}

describe('prototipos del Resumen: reglas de datos en las dos variantes', () => {
  it.each(VARIANTS)('variante %i con el fixture demo: celdas no divulgadas sin cifra, barra ni cero; sin peticiones', (v) => {
    renderProto(`?v=${v}`);
    const hidden = within(variantRoot()).getByTestId('need-p-clorpirifos-ML');
    expect(hidden.textContent).toContain('Oculto por privacidad');
    expect(hidden.textContent).not.toMatch(QUANTITY);
    expect(hidden.textContent).not.toMatch(/\b0\b/);
    expect(hidden.querySelector('[data-bar]')).toBeNull();
    // Publicadas: cifra exacta con su unidad; L y KG nunca en la misma escala.
    expect(within(variantRoot()).getByTestId('need-p-glifosato-ML').textContent).toContain('1.250 L');
    expect(within(variantRoot()).getByTestId('need-p-sulfato-G').textContent).toContain('1.500 KG');
    expect(variantRoot().textContent).toContain('Necesidades declaradas por producto');
    // Cobertura «6 de 9» con porcentaje (denominador distinto de cero).
    expect(within(variantRoot()).getByTestId('coverage').textContent).toMatch(/6 de 9/);
    expect(within(variantRoot()).getByTestId('coverage').textContent).toMatch(/67\s?%/);
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(VARIANTS)('variante %i, peor caso: denominador 0 sin porcentaje, estados restringidos con motivo, cifras extremas exactas', (v) => {
    renderProto(`?v=${v}&datos=worst`);
    const root = variantRoot();
    const coverage = within(root).getByTestId('coverage');
    expect(coverage.textContent).toMatch(/0 de 0/);
    expect(coverage.textContent).not.toMatch(/%/);
    for (const id of ['need-w-umbral-ML', 'need-w-revision-ML', 'need-w-overflow-G']) {
      const row = within(root).getByTestId(id);
      expect(row.textContent).not.toMatch(QUANTITY);
      expect(row.querySelector('[data-bar]')).toBeNull();
    }
    expect(within(root).getByTestId('need-w-overflow-G').textContent).toContain('Fuera de rango');
    expect(within(root).getByTestId('need-w-largo-ML').textContent).toContain('123.456.789,012 L');
    expect(within(root).getByTestId('need-w-chico-ML').textContent).toContain('0,025 L');
    // Un cero divulgado por el servidor se escribe, sin barra.
    expect(within(root).getByTestId('need-w-cero-ML').textContent).toContain('0 L');
    expect(within(root).getByTestId('need-w-cero-ML').querySelector('[data-bar]')).toBeNull();
    // Dos campañas ABIERTA: el selector las lista y sólo una es la activa.
    const options = Array.from((within(root).getByLabelText('Campaña') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options.filter((text) => text?.includes('· Abierta'))).toHaveLength(2);
    expect(options.filter((text) => text?.endsWith('· Activa'))).toHaveLength(1);
    expect(xhrOpen).not.toHaveBeenCalled();
  });

  it.each(VARIANTS)('variante %i, vacío: «Sin registros» y nunca un 0 como cifra de necesidades', (v) => {
    renderProto(`?v=${v}&datos=empty`);
    const root = variantRoot();
    expect(root.textContent).toContain('Eso no significa cero');
    expect(root.textContent).not.toMatch(QUANTITY);
    expect(root.querySelectorAll('[data-testid^="need-"]')).toHaveLength(0);
  });

  it('las dos variantes difieren en distribución, no sólo en color', () => {
    renderProto('?v=1');
    expect(screen.getByTestId('kpi-strip')).toBeTruthy();
    expect(within(variantRoot()).getByRole('table', { name: 'Necesidades declaradas por producto' })).toBeTruthy();
    cleanup();
    renderProto('?v=2');
    expect(screen.queryByTestId('kpi-strip')).toBeNull();
    expect(within(variantRoot()).queryByRole('table')).toBeNull();
    expect(within(variantRoot()).getAllByRole('list', { name: /Comparación en/ })).toHaveLength(2);
    expect(within(variantRoot()).getByTestId('seal-card')).toBeTruthy();
  });

  it('cada fixture tiene la forma del contrato y una sola campaña activa', () => {
    for (const dataset of DATASETS) {
      expect(dataset.campaigns.filter((campaign) => campaign.isActive)).toHaveLength(1);
      for (const summary of Object.values(dataset.summaries)) {
        expect(summary.contractVersion).toBe(1);
        for (const cell of summary.cells) {
          if (cell.status !== 'DISCLOSED') expect(cell.total_base).toBeNull();
        }
      }
    }
  });
});

describe('selector de variantes (PICKER.md)', () => {
  it('teclas 1–2 y ←/→ cambian de variante al instante y ?v= lo recuerda; exactamente un ítem activo', () => {
    renderProto();
    const picker = screen.getByRole('navigation', { name: 'Prototype variants' });
    expect(within(picker).getByRole('button', { name: 'Operativa compacta' }).getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(document, { key: '2' });
    expect(variantRoot().getAttribute('data-variant')).toBe('analitica-comparativa');
    expect(screen.getByTestId('where').textContent).toContain('v=2');
    expect(picker.querySelectorAll('[data-active]')).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(variantRoot().getAttribute('data-variant')).toBe('operativa-compacta');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(variantRoot().getAttribute('data-variant')).toBe('analitica-comparativa');
    fireEvent.click(within(picker).getByRole('button', { name: 'Operativa compacta' }));
    expect(variantRoot().getAttribute('data-variant')).toBe('operativa-compacta');
  });

  it('ignora las teclas dentro de un selector o con modificador; no hay botón de repetir', () => {
    renderProto();
    const select = within(variantRoot()).getByLabelText('Campaña');
    fireEvent.keyDown(select, { key: '2' });
    expect(variantRoot().getAttribute('data-variant')).toBe('operativa-compacta');
    fireEvent.keyDown(document, { key: '2', ctrlKey: true });
    expect(variantRoot().getAttribute('data-variant')).toBe('operativa-compacta');
    expect(screen.queryByRole('button', { name: /Replay/ })).toBeNull();
  });

  it('?datos= conserva la variante elegida', () => {
    renderProto('?v=2');
    fireEvent.click(within(screen.getByRole('group', { name: 'Datos del prototipo' })).getByRole('button', { name: 'Peor caso' }));
    expect(screen.getByTestId('where').textContent).toMatch(/v=2/);
    expect(screen.getByTestId('where').textContent).toMatch(/datos=worst/);
    expect(variantRoot().getAttribute('data-variant')).toBe('analitica-comparativa');
  });
});
