import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeContext, memoryBackend, openContext, setCopyBackend } from '../lib/estimation-copy';
import { renderAt } from '../test/render';
import { EstimationCopyPage } from './estimation-copy.page';

const PATH = '/estimacion/copia-sin-conexion';
const OWNER = { userId: 'u-1', tenantId: 't-1', name: 'Usuario sintético', tenantName: 'Sindicato sintético', role: 'DIRECTIVA' };

/** Rediseño v2 (lámina 27): estados 2 (sin copia) y 3 (sesión cerrada o de otra persona), sin cifras. */
describe('copia sin conexión v2', () => {
  beforeEach(() => {
    localStorage.clear();
    setCopyBackend(memoryBackend());
  });

  it('(2) con el acceso local de esta sesión y sin copia: «No hay ninguna copia guardada»', async () => {
    openContext(OWNER);
    renderAt(<EstimationCopyPage />, { path: PATH });
    expect((await screen.findByTestId('copy-none')).textContent).toMatch(/No hay ninguna copia guardada/);
    expect(screen.getByRole('link', { name: 'Volver a la estimación' }).getAttribute('href')).toBe('/colectivo/estimacion');
  });

  it('(3) sin acceso local vigente: «La copia ya no se puede leer», sin ninguna cifra', async () => {
    closeContext();
    renderAt(<EstimationCopyPage />, { path: PATH });
    const none = await screen.findByTestId('copy-none');
    expect(none.textContent).toMatch(/La copia ya no se puede leer/);
    expect(none.textContent).toMatch(/ninguna cifra/);
    expect(document.body.textContent).not.toMatch(/\d\s?(L|KG)\b/);
  });

  it('(3) con el acceso local de otra persona: tampoco se lee', async () => {
    openContext({ ...OWNER, userId: 'u-9' });
    renderAt(<EstimationCopyPage />, { path: PATH });
    expect((await screen.findByTestId('copy-none')).textContent).toMatch(/La copia ya no se puede leer/);
  });
});
