import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { statusReason } from '../../lib/collective-text';
import { DataState } from './data-state';
import type { DataStateKind } from './types';

afterEach(cleanup);

const STATES: { state: DataStateKind; title: string }[] = [
  { state: 'loading', title: 'Cargando…' },
  { state: 'empty', title: 'Sin registros' },
  { state: 'no-match', title: 'Sin coincidencias' },
  { state: 'error', title: 'No se pudo cargar la información' },
  { state: 'forbidden', title: 'Sin permiso' },
  { state: 'restricted', title: 'Información restringida' },
  { state: 'insufficient', title: 'Datos insuficientes' },
  { state: 'stale', title: 'Resultado desactualizado' },
];

describe('DataState: los ocho estados del contrato', () => {
  it.each(STATES)('$state: título propio, icono y ninguna cifra (nunca un «0»)', ({ state, title }) => {
    for (const compact of [false, true]) {
      const { container, unmount } = render(<DataState state={state} compact={compact} testId="ds" />);
      const node = screen.getByTestId('ds');
      expect(node.getAttribute('data-state')).toBe(state);
      expect(node.textContent).toContain(title);
      expect(node.textContent).not.toMatch(/\d/);
      // Icono (o indicador de carga) decorativo, acompañado siempre de texto.
      expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
      unmount();
    }
  });

  it('cargando se anuncia con role="status" y el error con role="alert"; los demás no son regiones vivas', () => {
    for (const { state } of STATES) {
      render(<DataState state={state} testId="ds" />);
      const role = screen.getByTestId('ds').getAttribute('role');
      expect(role).toBe(state === 'loading' ? 'status' : state === 'error' ? 'alert' : null);
      cleanup();
    }
  });

  it('«Sin registros» explica que la ausencia no es cero', () => {
    render(<DataState state="empty" />);
    expect(screen.getByText(/Eso no significa cero/)).toBeTruthy();
  });

  it('error: muestra el mensaje de la vista y «Reintentar» llama a onRetry', () => {
    const onRetry = vi.fn();
    render(<DataState state="error" description="Sin conexión con el servidor." onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Sin conexión con el servidor.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('cargando nunca ofrece «Reintentar», aunque reciba onRetry', () => {
    render(<DataState state="loading" onRetry={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('sin coincidencias ofrece «Quitar filtros»; sin registros no', () => {
    const onClear = vi.fn();
    render(<DataState state="no-match" onClearFilters={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    cleanup();
    render(<DataState state="empty" onClearFilters={onClear} />);
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull();
  });

  it('información restringida usa el motivo del estado de divulgación, sin cifra propia', () => {
    render(<DataState state="restricted" status="SUPPRESSED_REVISION" testId="ds" />);
    const node = screen.getByTestId('ds');
    expect(node.textContent).toContain(statusReason('SUPPRESSED_REVISION')!);
    expect(node.textContent).not.toMatch(/\d/);
  });

  it('información restringida bajo umbral: el motivo cita el umbral recibido, no un conteo', () => {
    render(<DataState state="restricted" status="SUPPRESSED_UNDER_THRESHOLD" threshold={3} testId="ds" />);
    expect(screen.getByTestId('ds').textContent).toContain(statusReason('SUPPRESSED_UNDER_THRESHOLD', 3)!);
  });

  it('la descripción de la vista sustituye a la explicación por defecto', () => {
    render(<DataState state="stale" description="De una ejecución anterior (12 nov. 2026)." />);
    expect(screen.getByText('De una ejecución anterior (12 nov. 2026).')).toBeTruthy();
    expect(screen.queryByText('Este resultado corresponde a una ejecución anterior.')).toBeNull();
  });
});
