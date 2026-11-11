import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../../types/campaigns';
import { CampaignSelector } from './campaign-selector';

afterEach(cleanup);

function campaign(overrides: Partial<Campaign>): Campaign {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Campaña sintética',
    status: 'ABIERTA',
    isActive: false,
    startDate: '2026-09-01T00:00:00.000Z',
    estimatedEndDate: null,
    closedAt: null,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Dos campañas ABIERTA a la vez: sólo una la marca el servidor como activa. */
const VERANO = campaign({ id: '11111111-1111-4111-8111-111111111111', name: 'Verano sintético', isActive: true });
const INVIERNO = campaign({ id: '22222222-2222-4222-8222-222222222222', name: 'Invierno sintético' });
const PASADA = campaign({ id: '33333333-3333-4333-8333-333333333333', name: 'Campaña pasada', status: 'CERRADA' });
const ALL = [VERANO, INVIERNO, PASADA];

describe('CampaignSelector', () => {
  it('lista todas las campañas, incluidas dos ABIERTA, con «nombre · estado» y «Activa» sólo en la marcada', () => {
    render(<CampaignSelector campaigns={ALL} selected={VERANO.id} onSelect={() => undefined} />);
    const options = Array.from((screen.getByLabelText('Campaña') as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(['Verano sintético · Abierta · Activa', 'Invierno sintético · Abierta', 'Campaña pasada · Cerrada']);
  });

  it('la seleccionada activa muestra su estado y «Activa» como texto', () => {
    render(<CampaignSelector campaigns={ALL} selected={VERANO.id} onSelect={() => undefined} />);
    expect(screen.getByTestId('campaign-active').textContent).toBe('Activa');
    expect(screen.getByTestId('campaign-state').textContent).toContain('Abierta');
    expect(screen.queryByTestId('campaign-differs')).toBeNull();
  });

  it('otra campaña ABIERTA no activa: «Distinta de la activa», nombrando la activa en title', () => {
    render(<CampaignSelector campaigns={ALL} selected={INVIERNO.id} onSelect={() => undefined} />);
    const differs = screen.getByTestId('campaign-differs');
    expect(differs.textContent).toBe('Distinta de la activa');
    expect(differs.getAttribute('title')).toBe('La campaña activa del sindicato es Verano sintético');
    expect(screen.queryByTestId('campaign-active')).toBeNull();
  });

  it('si el servidor no marca ninguna como activa, no inventa «Activa» ni «Distinta de la activa»', () => {
    const none = [campaign({ ...VERANO, isActive: false }), INVIERNO];
    render(<CampaignSelector campaigns={none} selected={INVIERNO.id} onSelect={() => undefined} />);
    expect(screen.queryByTestId('campaign-active')).toBeNull();
    expect(screen.queryByTestId('campaign-differs')).toBeNull();
  });

  it('showActiveBadge=false oculta las dos marcas, pero no el estado', () => {
    render(<CampaignSelector campaigns={ALL} selected={INVIERNO.id} onSelect={() => undefined} showActiveBadge={false} />);
    expect(screen.queryByTestId('campaign-differs')).toBeNull();
    expect(screen.getByTestId('campaign-state').textContent).toBe('Abierta');
  });

  it('elegir una campaña llama a onSelect con su id; sin selección pide elegir una', () => {
    const onSelect = vi.fn();
    render(<CampaignSelector campaigns={ALL} selected={null} onSelect={onSelect} label="Campaña consultada" />);
    const select = screen.getByLabelText('Campaña consultada') as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe('Seleccione una campaña');
    fireEvent.change(select, { target: { value: INVIERNO.id } });
    expect(onSelect).toHaveBeenCalledWith(INVIERNO.id);
  });
});
