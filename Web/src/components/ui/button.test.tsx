import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { buttonClass, buttonClassFor, dangerButtonClass, ghostButtonClass, secondaryButtonClass } from './classes';
import type { ButtonVariant } from './types';

afterEach(cleanup);

describe('Button', () => {
  it('es type="button" por defecto (no envía formularios por accidente) y respeta type="submit"', () => {
    render(
      <>
        <Button>Generar borrador</Button>
        <Button type="submit">Guardar</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Generar borrador' }).getAttribute('type')).toBe('button');
    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('type')).toBe('submit');
  });

  it.each<ButtonVariant>(['primary', 'secondary', 'ghost', 'danger'])('%s: respuesta al pulsar (ui-press), foco visible y sin degradados', (variant) => {
    render(<Button variant={variant}>Acción</Button>);
    const cls = screen.getByRole('button', { name: 'Acción' }).className;
    expect(cls).toContain('ui-press');
    expect(cls).toContain('focus-visible:outline-2');
    expect(cls).not.toMatch(/gradient|transition-all|backdrop/);
  });

  it('las clases exportadas coinciden con las variantes y el tamaño sm', () => {
    expect(buttonClass).toBe(buttonClassFor('primary'));
    expect(secondaryButtonClass).toBe(buttonClassFor('secondary'));
    expect(ghostButtonClass).toBe(buttonClassFor('ghost'));
    expect(dangerButtonClass).toBe(buttonClassFor('danger'));
    expect(buttonClassFor('primary', 'sm')).toContain('text-xs');
  });

  it('deshabilitado no ejecuta la acción; añade clases propias sin perder las del sistema', () => {
    const onClick = vi.fn();
    render(
      <Button variant="danger" disabled onClick={onClick} className="w-full">
        Inactivar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Inactivar' });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('ui-press');
  });
});
