import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';
import { Dialog } from './dialog';

afterEach(cleanup);

/** Botón que abre un diálogo: para comprobar el retorno del foco. */
function Opener({ dirty = false }: { dirty?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <>
      <Button onClick={() => setOpen(true)}>Nueva campaña</Button>
      {open && (
        <Dialog
          title="Nueva campaña"
          description="Se crea como planificada."
          onClose={() => setOpen(false)}
          dirty={dirty && text.length > 0}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button>Crear campaña</Button>
            </>
          }
        >
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={text} onChange={(event) => setText(event.target.value)} />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('modal con nombre y descripción; foco inicial en el primer campo', () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva campaña' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe('Se crea como planificada.');
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'));
  });

  it('Esc cierra y el foco vuelve al control que lo abrió', () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Nueva campaña' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Tab y Mayús+Tab no salen del diálogo', () => {
    render(<Opener />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    const last = screen.getByRole('button', { name: 'Crear campaña' });
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('con borrador, Esc no cierra sin preguntar; «Seguir editando» conserva lo escrito y «Descartar cambios» cierra', () => {
    render(<Opener dirty />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Invierno' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Hay cambios sin guardar');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Invierno');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('«Cancelar» del pie cierra aunque haya borrador (es una decisión explícita)', () => {
    render(<Opener dirty />);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva campaña' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Invierno' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mientras está ocupado no se cierra', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Sellar" onClose={onClose} busy>
        <p>Enviando…</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  it('la acción queda desactivada hasta escribir el motivo y marcar la casilla; entrega el motivo sin espacios', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="Cancelar la convocatoria"
        confirmLabel="Cancelar convocatoria"
        tone="danger"
        reason={{}}
        acknowledgement="Confirmo que se cancela esta convocatoria."
        onConfirm={onConfirm}
        onCancel={() => undefined}
      >
        <p>Los pedidos quedan sin efecto.</p>
      </ConfirmDialog>,
    );
    expect(screen.getByRole('alertdialog', { name: 'Cancelar la convocatoria' })).toBeTruthy();
    const action = screen.getByRole('button', { name: 'Cancelar convocatoria' }) as HTMLButtonElement;
    expect(screen.getByText('Obligatorio. Queda en el historial.')).toBeTruthy();
    expect(action.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '   ' } });
    fireEvent.click(screen.getByLabelText('Confirmo que se cancela esta convocatoria.'));
    expect(action.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: '  Sin proveedor  ' } });
    expect(action.disabled).toBe(false);
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledWith('Sin proveedor');
  });

  it('el motivo queda asociado a su ayuda; «Volver» llama a onCancel', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Cerrar campaña" confirmLabel="Cerrar campaña" reason={{ required: false, label: 'Motivo o notas' }} onConfirm={() => undefined} onCancel={onCancel} />);
    const field = screen.getByLabelText('Motivo o notas');
    expect(document.getElementById(field.getAttribute('aria-describedby')!)!.textContent).toBe('Opcional.');
    expect((screen.getByRole('button', { name: 'Cerrar campaña' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('muestra el error del servidor sin perder el motivo escrito', () => {
    render(<ConfirmDialog title="Sustituir" confirmLabel="Sustituir" reason={{}} error="La sucesora no está habilitada." onConfirm={() => undefined} onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Baja' } });
    expect(screen.getByText('La sucesora no está habilitada.')).toBeTruthy();
    expect((screen.getByLabelText('Motivo') as HTMLTextAreaElement).value).toBe('Baja');
  });
});
