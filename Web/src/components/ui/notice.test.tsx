import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Notice } from './notice';

afterEach(cleanup);

describe('Notice', () => {
  it.each(['ok', 'error', 'info', 'warn'] as const)('%s: icono decorativo y el texto como contenido', (kind) => {
    const { container } = render(<Notice kind={kind}>Mensaje de prueba</Notice>);
    expect(screen.getByText('Mensaje de prueba')).toBeTruthy();
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.firstElementChild!.className).not.toMatch(/backdrop|blur/);
  });
});
