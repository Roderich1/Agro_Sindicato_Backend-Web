import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Collapsible } from './collapsible';

afterEach(cleanup);

describe('Collapsible', () => {
  it('plegada por defecto, con «Ver»/«Ocultar» como texto; abierta con defaultOpen', () => {
    render(
      <Collapsible title="Fuentes y método" testId="method">
        <p>detalle</p>
      </Collapsible>,
    );
    const details = screen.getByTestId('method') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.getAttribute('aria-label')).toBe('Fuentes y método');
    expect(details.querySelector('summary')!.textContent).toBe('Fuentes y métodoVerOcultar');
    cleanup();
    render(
      <Collapsible title="Historial" testId="h" defaultOpen>
        <p>detalle</p>
      </Collapsible>,
    );
    expect((screen.getByTestId('h') as HTMLDetailsElement).open).toBe(true);
  });
});
