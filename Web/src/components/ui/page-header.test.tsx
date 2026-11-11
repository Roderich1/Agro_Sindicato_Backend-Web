import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

afterEach(cleanup);

describe('PageHeader', () => {
  it('título como <h1>, contexto, campaña y acción; h2 cuando la vista ya tiene h1', () => {
    render(<PageHeader title="Necesidades y propuestas" subtitle="De la campaña seleccionada." campaign={<span>selector</span>} actions={<button type="button">Generar borrador</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Necesidades y propuestas' })).toBeTruthy();
    expect(screen.getByText('De la campaña seleccionada.')).toBeTruthy();
    expect(screen.getByText('selector')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generar borrador' })).toBeTruthy();
    cleanup();
    render(<PageHeader title="Resumen" headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Resumen' })).toBeTruthy();
  });
});
