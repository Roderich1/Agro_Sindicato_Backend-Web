import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttentionList } from './attention-list';
import { Avatar } from './avatar';
import { Chip, PrivacyChip } from './chip';
import { DataState } from './data-state';
import { dataStateKindForError } from './data-state-kind';
import { DataTable } from './data-table';
import { Checkbox, RadioCards, SearchInput, Select, TextInput } from './field';
import { FilterChips } from './filter-chips';
import { HeroPanel } from './hero-panel';
import { ProgressBar } from './progress-bar';
import { StatusChip } from './status-chip';
import { Stepper } from './stepper';
import { TabPanel, Tabs } from './tabs';

afterEach(cleanup);

describe('Campos', () => {
  it('TextInput asocia etiqueta, ayuda y error; el error marca aria-invalid', () => {
    render(<TextInput label="Nombre" help="Como lo conocen los agricultores." error="Escriba un nombre." />);
    const input = screen.getByLabelText('Nombre');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(described).toEqual(['Escriba un nombre.', 'Como lo conocen los agricultores.']);
  });

  it('«(opcional)» va en la etiqueta y Select conserva sus opciones', () => {
    render(
      <Select label="Categoría" optional defaultValue="b">
        <option value="a">Herbicida</option>
        <option value="b">Fungicida</option>
      </Select>,
    );
    expect((screen.getByLabelText('Categoría (opcional)') as HTMLSelectElement).value).toBe('b');
  });

  it('SearchInput: etiqueta oculta pero accesible; entrega el texto', () => {
    const onChange = vi.fn();
    render(<SearchInput label="Buscar producto" value="" onChange={onChange} placeholder="Buscar producto" />);
    const input = screen.getByRole('searchbox', { name: 'Buscar producto' });
    fireEvent.change(input, { target: { value: 'urea' } });
    expect(onChange).toHaveBeenCalledWith('urea');
  });

  it('Checkbox con etiqueta clicable y RadioCards con legend y radios nativos', () => {
    const onChange = vi.fn();
    render(
      <>
        <Checkbox label="Confirmo que concedo este permiso." />
        <RadioCards
          legend="Unidad"
          name="unidad"
          value="L"
          onChange={onChange}
          options={[
            { value: 'L', label: 'Litros', description: 'Para productos líquidos.' },
            { value: 'kg', label: 'Kilogramos', description: 'Para productos sólidos.' },
          ]}
        />
      </>,
    );
    fireEvent.click(screen.getByLabelText('Confirmo que concedo este permiso.'));
    expect((screen.getByLabelText('Confirmo que concedo este permiso.') as HTMLInputElement).checked).toBe(true);
    const group = screen.getByRole('group', { name: 'Unidad' });
    expect((within(group).getByRole('radio', { name: /Litros/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(group).getByRole('radio', { name: /Kilogramos/ }));
    expect(onChange).toHaveBeenCalledWith('kg');
  });
});

describe('Chips', () => {
  it('Chip dice su texto; PrivacyChip lleva candado decorativo y borde discontinuo', () => {
    const { container } = render(
      <>
        <Chip tone="attention" testId="c">
          Datos sintéticos
        </Chip>
        <PrivacyChip testId="p" />
      </>,
    );
    expect(screen.getByTestId('c').textContent).toBe('Datos sintéticos');
    const privacy = screen.getByTestId('p');
    expect(privacy.textContent).toBe('Oculta por privacidad');
    expect(privacy.className).toContain('ui-dashed');
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(1);
  });

  it('StatusChip «Oculto por privacidad» usa el estilo oculto; «Abierta», el punto', () => {
    render(
      <>
        <StatusChip status="SUPPRESSED_UNDER_THRESHOLD" threshold={3} testId="s" />
        <StatusChip status="ABIERTA" testId="a" />
      </>,
    );
    expect(screen.getByTestId('s').className).toContain('ui-dashed');
    expect(screen.getByTestId('a').textContent).toBe('Abierta');
  });
});

describe('FilterChips y Tabs', () => {
  it('FilterChips: grupo con aria-pressed y recuento opcional', () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        label="Filtrar por unidad"
        value="todos"
        onChange={onChange}
        options={[
          { value: 'todos', label: 'Todos' },
          { value: 'L', label: 'Litros', count: 4 },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Filtrar por unidad' });
    expect(within(group).getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(group).getByRole('button', { name: 'Litros 4' }));
    expect(onChange).toHaveBeenCalledWith('L');
  });

  it('Tabs: tablist con flechas, una sola pestaña en el orden de tabulación y panel etiquetado', () => {
    const onChange = vi.fn();
    render(
      <>
        <Tabs
          label="Borradores"
          idBase="b"
          value="actual"
          onChange={onChange}
          tabs={[
            { value: 'actual', label: 'Borrador actual' },
            { value: 'anteriores', label: 'Borradores anteriores', count: 4 },
          ]}
        />
        <TabPanel idBase="b" value="actual" active>
          contenido
        </TabPanel>
      </>,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(screen.getByRole('tabpanel', { name: 'Borrador actual' }).textContent).toBe('contenido');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('anteriores');
  });
});

describe('DataTable declarativa', () => {
  it('cada celda repite su encabezado (data-label) y la primera columna nombra la fila', () => {
    render(
      <DataTable
        caption="Productos"
        columns={[
          { key: 'n', header: 'Producto', rowHeader: true, cell: (row: { name: string; qty: string }) => row.name },
          { key: 'q', header: 'Necesidad', numeric: true, cell: (row) => row.qty },
        ]}
        rows={[{ name: 'Urea DEMO', qty: '1.046,7 kg' }]}
        rowKey={(row) => row.name}
      />,
    );
    const table = screen.getByRole('table', { name: 'Productos' });
    expect(table.className).toContain('ui-table-stack');
    expect(screen.getByRole('rowheader', { name: 'Urea DEMO' }).getAttribute('data-label')).toBe('Producto');
    const cell = screen.getByRole('cell', { name: '1.046,7 kg' });
    expect(cell.getAttribute('data-label')).toBe('Necesidad');
    expect(cell.className).toContain('ui-num');
  });
});

describe('Medidas y secuencias', () => {
  it('ProgressBar: meter con valores; sin máximo válido no inventa una proporción', () => {
    render(
      <>
        <ProgressBar value={25.3} max={1046.7} label="Mancozeb" valueText="25,3 kg" testId="a" />
        <ProgressBar value={10} max={0} label="Sin referencia" testId="b" />
      </>,
    );
    const a = screen.getByTestId('a');
    expect(a.getAttribute('role')).toBe('meter');
    expect(a.getAttribute('aria-valuetext')).toBe('25,3 kg');
    expect(a.firstElementChild).toBeTruthy();
    const b = screen.getByTestId('b');
    expect(b.getAttribute('aria-valuenow')).toBeNull();
    expect(b.firstElementChild).toBeNull();
  });

  it('Stepper: el paso actual con aria-current="step" y los anteriores, completados', () => {
    render(
      <Stepper
        label="Versión de las cifras"
        testId="st"
        current={1}
        steps={[
          { key: 'a', label: 'Abierta' },
          { key: 'c', label: 'Cerrada' },
          { key: 's', label: 'Sellada' },
        ]}
      />,
    );
    // Una sola línea decorativa de extremo a extremo (fuera de la lista): une también «Cerrada» y «Sellada».
    const line = screen.getByTestId('st-line');
    expect(line.getAttribute('aria-hidden')).toBe('true');
    expect(line.className).toMatch(/left-3 right-3/);
    const items = within(screen.getByRole('list', { name: 'Versión de las cifras' })).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[0]!.textContent).toBe('Abierta (completado)');
  });
});

describe('AttentionList, Avatar y HeroPanel', () => {
  it('AttentionList: enlaces con su texto; sin ítems no dibuja nada', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <AttentionList items={[{ id: 'b', text: 'Revisar el borrador de compra', to: '/colectivo/propuestas' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Para atender' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Revisar el borrador de compra' }).getAttribute('href')).toBe('/colectivo/propuestas');
    rerender(
      <MemoryRouter>
        <AttentionList items={[]} />
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });

  it('Avatar: iniciales del nombre, decorativas', () => {
    const { container } = render(<Avatar name="Directiva sintética del sindicato" />);
    expect(container.textContent).toBe('DS');
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
  });

  it('HeroPanel con selector: h1 para lectores de pantalla, selector con nombre y cifra con su etiqueta', () => {
    const onChange = vi.fn();
    render(
      <HeroPanel
        title="Resumen de la campaña"
        select={{ label: 'Campaña', value: 'c1', options: [{ value: 'c1', label: 'Invierno' }, { value: 'c2', label: 'Verano' }], onChange }}
        figure={{ label: 'Cobertura', value: '14 de 15', caption: 'agricultores vinculados con cifras publicadas' }}
        stats={[{ key: 'n', label: 'Necesidades publicadas', value: '7 productos' }]}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Resumen de la campaña' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Campaña' }), { target: { value: 'c2' } });
    expect(onChange).toHaveBeenCalledWith('c2');
    expect(screen.getByText('14 de 15')).toBeTruthy();
    expect(screen.getByText('Necesidades publicadas').tagName).toBe('DT');
  });
});

describe('DataState: estados de la lámina 05', () => {
  it.each([
    ['offline', 'Sin conexión con el servidor', 'alert'],
    ['busy', 'El servidor está ocupado', 'alert'],
    ['policy-pending', 'Las cifras todavía no se pueden mostrar', null],
  ] as const)('%s: título propio, sin cifras', (state, title, role) => {
    render(<DataState state={state} testId="ds" />);
    const node = screen.getByTestId('ds');
    expect(node.textContent).toContain(title);
    expect(node.textContent).not.toMatch(/\d/);
    expect(node.getAttribute('role')).toBe(role);
  });

  it('dataStateKindForError: sin respuesta → offline; 429 → busy; 403 → forbidden; 500 → error', () => {
    const withStatus = (status?: number) => {
      const error = new AxiosError('x');
      if (status) error.response = { status, data: {}, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
      return error;
    };
    expect(dataStateKindForError(withStatus())).toBe('offline');
    expect(dataStateKindForError(withStatus(429))).toBe('busy');
    expect(dataStateKindForError(withStatus(403))).toBe('forbidden');
    expect(dataStateKindForError(withStatus(500))).toBe('error');
    expect(dataStateKindForError(new Error('x'))).toBe('error');
  });
});
