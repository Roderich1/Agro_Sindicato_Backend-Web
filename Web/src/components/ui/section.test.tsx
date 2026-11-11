import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Section, SectionHeader } from './section';

afterEach(cleanup);

describe('Section y SectionHeader', () => {
  it('la sección se etiqueta con su título y muestra nota, insignia y acciones', () => {
    render(
      <Section title="Necesidades declaradas por producto" note="Datos hasta el corte." badge={<span>Publicado</span>} actions={<button type="button">Exportar</button>}>
        <p>contenido</p>
      </Section>,
    );
    const region = screen.getByRole('region', { name: 'Necesidades declaradas por producto' });
    expect(within(region).getByRole('heading', { level: 2 })).toBeTruthy();
    expect(within(region).getByText('Datos hasta el corte.')).toBeTruthy();
    expect(within(region).getByText('Publicado')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Exportar' })).toBeTruthy();
    expect(region.className).not.toMatch(/glass|backdrop|blur/);
  });

  it('SectionHeader conserva la firma anterior (title, note, actions, badge)', () => {
    render(<SectionHeader title="Historial" note="Más reciente primero." />);
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeTruthy();
    expect(screen.getByText('Más reciente primero.')).toBeTruthy();
  });
});
