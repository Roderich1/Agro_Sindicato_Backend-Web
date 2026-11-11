import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

afterEach(cleanup);

describe('SegmentedControl', () => {
  it('grupo con nombre, aria-pressed en la opción activa y cambio por clic', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Vista"
        options={[
          { value: 'tendencias', label: 'Histórico sellado' },
          { value: 'estimacion', label: 'Estimación del consumo' },
        ]}
        value="tendencias"
        onChange={onChange}
      />,
    );
    const group = screen.getByRole('group', { name: 'Vista' });
    expect(within(group).getByRole('button', { name: 'Histórico sellado' }).getAttribute('aria-pressed')).toBe('true');
    const other = within(group).getByRole('button', { name: 'Estimación del consumo' });
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.className).not.toMatch(/transition/);
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith('estimacion');
  });
});
