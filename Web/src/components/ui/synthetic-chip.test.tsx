import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { reportDisclosureMode } from '../../lib/data-mode';
import { HeroPanel } from './hero-panel';
import { PageHeader } from './page-header';

afterEach(() => {
  cleanup();
  reportDisclosureMode(null);
});

/** H-03 y corrección del orquestador (2026-11-13): «Datos sintéticos» va en la cabecera de la vista, no en el armazón. */
describe('«Datos sintéticos» en PageHeader y HeroPanel', () => {
  it('PageHeader: sólo cuando el servidor declara el modo provisional', () => {
    render(<PageHeader title="Campañas" />);
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
    act(() => reportDisclosureMode('PROVISIONAL_SYNTHETIC'));
    expect(screen.getByTestId('synthetic-badge').textContent).toBe('Datos sintéticos');
    act(() => reportDisclosureMode('POLICY_PENDING'));
    expect(screen.queryByTestId('synthetic-badge')).toBeNull();
  });

  it('una cabecera anidada (h2) no lo repite, salvo que se pida', () => {
    reportDisclosureMode('PROVISIONAL_SYNTHETIC');
    render(
      <>
        <PageHeader title="Histórico y estimaciones" />
        <PageHeader title="Histórico sellado" headingLevel={2} />
      </>,
    );
    expect(screen.getAllByTestId('synthetic-badge')).toHaveLength(1);
    cleanup();
    render(<PageHeader title="Vista" headingLevel={2} showSynthetic />);
    expect(screen.getByTestId('synthetic-badge')).toBeTruthy();
  });

  it('HeroPanel: arriba a la derecha, junto a las migas', () => {
    reportDisclosureMode('PROVISIONAL_SYNTHETIC');
    render(<HeroPanel title="Resumen de la campaña" breadcrumb="Sindicato sintético · Resumen de la campaña" />);
    const chip = screen.getByTestId('synthetic-badge');
    expect(chip.textContent).toBe('Datos sintéticos');
    expect(screen.getByText('Sindicato sintético · Resumen de la campaña').parentElement).toBe(chip.parentElement!.parentElement);
  });
});
