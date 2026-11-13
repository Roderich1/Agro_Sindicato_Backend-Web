import { act, fireEvent, screen, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectiveService } from '../services/collective.service';
import { identificationService } from '../services/identification.service';
import { IDENTIFICATION_CHANGED_EVENT } from '../contexts/identification-pending';
import { renderAt } from '../test/render';
import type { CatalogEntry } from '../types/collective';
import type { IdentificationCandidate, IdentificationEvent, IdentificationRequest } from '../types/identification';
import { ProductIdentificationView } from './product-identification.page';

vi.mock('../services/identification.service', () => ({
  identificationService: {
    list: vi.fn(),
    candidates: vi.fn(),
    history: vi.fn(),
    photoBlob: vi.fn(),
    link: vi.fn(),
    createProduct: vi.fn(),
    defer: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({ collectiveService: { catalog: vi.fn() } }));

/** E1 §6: «Por identificar». Datos sintéticos: ningún agricultor, producto ni cifra real. */
const PHOTO = { state: 'STORED' as const, sha256: 'a'.repeat(64), consent_version: 'FOTO-1', content_type: 'image/jpeg', width: 1200, height: 900, stored_at: '2026-11-11T18:21:00.000Z' };

const REQ_A: IdentificationRequest = {
  contractVersion: 1,
  id: 'r-a',
  request_id: '7f4b1c2e-9d3a-4f61-8b2c-0e5a6d7c8b9a',
  status: 'PENDING',
  local_name: 'Glifosato 480 del Sur',
  active_ingredient: 'Glifosato',
  unit: 'L',
  base_unit: 'ML',
  received_at: '2026-11-11T18:20:05.120Z',
  updated_at: '2026-11-11T18:20:05.120Z',
  photo: PHOTO,
  resolution: null,
  pending_note: null,
};
const REQ_B: IdentificationRequest = {
  ...REQ_A,
  id: 'r-b',
  request_id: '8f4b1c2e-9d3a-4f61-8b2c-0e5a6d7c8b9a',
  local_name: 'Urea perlada',
  active_ingredient: null,
  unit: 'KG',
  base_unit: 'G',
  photo: { state: 'NONE', sha256: null, consent_version: null },
  pending_note: { text: 'Falta la concentración en la etiqueta', at: '2026-11-12T10:00:00.000Z' },
};
const REQ_LINKED: IdentificationRequest = {
  ...REQ_A,
  id: 'r-c',
  status: 'LINKED',
  local_name: 'Manco 80',
  unit: 'KG',
  base_unit: 'G',
  photo: { state: 'REMOVED', sha256: null, consent_version: 'FOTO-1' },
  resolution: {
    kind: 'CREATED_PRODUCT',
    product_ref: 'p-9',
    product_name: 'Mancozeb 80 WP',
    unit: 'KG',
    base_unit: 'G',
    is_active: true,
    resolved_at: '2026-11-12T09:00:00.000Z',
  },
};

const CATALOG: CatalogEntry[] = [
  { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'p-2', product_name: 'Glifosato 480', unit: 'L', base_unit: 'ML', is_active: true },
  { product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true },
  { product_ref: 'p-4', product_name: 'Herbicida retirado', unit: 'L', base_unit: 'ML', is_active: false },
  { product_ref: 'p-5', product_name: 'Adherente', unit: 'unidad', base_unit: null, is_active: true },
];

const CANDIDATES: IdentificationCandidate[] = [
  { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', is_active: true, is_alias: false, canonical_product_ref: null, similarity: 'ALTA', matched_on: ['name', 'active_ingredient'] },
  { product_ref: 'p-2', product_name: 'Glifosato 480', unit: 'L', base_unit: 'ML', is_active: true, is_alias: true, canonical_product_ref: 'p-1', similarity: 'MEDIA', matched_on: ['name'] },
  { product_ref: 'p-4', product_name: 'Herbicida retirado', unit: 'L', base_unit: 'ML', is_active: false, is_alias: false, canonical_product_ref: null, similarity: 'BAJA', matched_on: ['name'] },
];

const at = (minute: number) => `2026-11-12T09:${String(minute).padStart(2, '0')}:00.000Z`;
const HISTORY: IdentificationEvent[] = [
  { at: at(0), kind: 'RECEIVED', actor: null, product_ref: null, product_name: null, detail: null },
  { at: at(1), kind: 'UPDATED', actor: null, product_ref: null, product_name: null, detail: null },
  { at: at(2), kind: 'PHOTO_RECEIVED', actor: null, product_ref: null, product_name: null, detail: null },
  { at: at(3), kind: 'PHOTO_REPLACED', actor: null, product_ref: null, product_name: null, detail: null },
  { at: at(4), kind: 'PHOTO_REMOVED', actor: null, product_ref: null, product_name: null, detail: null },
  { at: at(5), kind: 'NOTE', actor: { name: 'Directiva sintética' }, product_ref: null, product_name: null, detail: 'Falta la concentración' },
  { at: at(6), kind: 'LINKED', actor: { name: 'Directiva sintética' }, product_ref: 'p-2', product_name: 'Glifosato 480', detail: 'misma etiqueta' },
  { at: at(7), kind: 'RELINKED', actor: { name: 'Administrador sintético' }, product_ref: 'p-1', product_name: 'Glifosato 48 SL', detail: 'corrección' },
  { at: at(8), kind: 'PRODUCT_CREATED', actor: { name: 'Directiva sintética' }, product_ref: 'p-9', product_name: 'Mancozeb 80 WP', detail: 'nuevo' },
];

function axiosError(status: number | null, data: unknown = {}) {
  const error = new AxiosError(status ? String(status) : 'Network Error', status ? String(status) : 'ERR_NETWORK');
  if (status) error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const render = () => renderAt(<ProductIdentificationView />, { path: '/colectivo/catalogo' });
const card = (id: string) => screen.findByTestId(`identification-${id}`);
const dialog = () => screen.getByRole('dialog');
/**
 * Rediseño v2 (láminas 23 y 47): la solicitud se elige en la lista y la decisión se toma en el panel de al lado
 * (antes, un diálogo por acción). Sólo cambia cómo se llega; lo que se comprueba es lo mismo.
 */
const panel = () => screen.getByTestId('identification-panel');
const CHOICE = { 'Vincular…': /^Ya está en el catálogo/, 'Crear producto colectivo…': /^Es un producto nuevo/, 'Dejar pendiente…': /^Falta información/ } as const;
const openAction = async (id: string, action: keyof typeof CHOICE) => {
  fireEvent.click(within(await card(id)).getByRole('button'));
  fireEvent.click(within(panel()).getByRole('radio', { name: CHOICE[action] }));
  return panel();
};
const submitButton = (name: string) => within(panel()).getByRole('button', { name }) as HTMLButtonElement;
const candidateRadios = () => screen.queryAllByTestId(/^candidate-/).map((item) => within(item).getByRole('radio') as HTMLInputElement);

describe('Productos por identificar (E1 §6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(identificationService.list).mockImplementation(async (status) => (status === 'LINKED' ? [REQ_LINKED] : [REQ_A, REQ_B]));
    vi.mocked(identificationService.candidates).mockResolvedValue(CANDIDATES);
    vi.mocked(identificationService.history).mockResolvedValue(HISTORY);
    vi.mocked(collectiveService.catalog).mockResolvedValue(CATALOG);
  });

  it('carga → lista de pendientes con nombre, ingrediente, unidad, fecha, foto y nota, sin escribir nada', async () => {
    let resolve!: (value: IdentificationRequest[]) => void;
    vi.mocked(identificationService.list).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render();
    expect(await screen.findByTestId('identification-loading')).toBeTruthy();
    await act(async () => resolve([REQ_A, REQ_B]));
    const a = await card('r-a');
    expect(identificationService.list).toHaveBeenCalledWith('PENDING');
    expect(a.textContent).toContain('Glifosato 480 del Sur');
    expect(a.textContent).toMatch(/Litros · .* · con foto/);
    // La primera solicitud queda elegida: su panel muestra los datos y la foto (sin pedirla todavía).
    expect(panel().textContent).toContain('Ingrediente activoGlifosato');
    expect(panel().textContent).toContain('Se mide enlitros');
    expect(panel().textContent).toContain('Recibido');
    expect(within(panel()).getByRole('button', { name: 'Ver la foto' })).toBeTruthy();
    expect(identificationService.photoBlob).not.toHaveBeenCalled();
    const b = await card('r-b');
    expect(within(b).getByText('Falta información')).toBeTruthy();
    fireEvent.click(within(b).getByRole('button'));
    expect(panel().textContent).toContain('Ingrediente activoSin dato');
    expect(within(panel()).queryByRole('button', { name: 'Ver la foto' })).toBeNull();
    expect(within(panel()).getByTestId('pending-note').textContent).toContain('Pendiente por falta de información: Falta la concentración en la etiqueta');
    expect(screen.queryByTestId('identification-loading')).toBeNull();
    for (const write of [identificationService.link, identificationService.createProduct, identificationService.defer]) expect(write).not.toHaveBeenCalled();
    // Ni la API ni la vista identifican a quien reportó.
    expect(document.body.textContent).not.toMatch(/@|request_id|7f4b1c2e/);
  });

  it('vacío: lo dice sin paneles vacíos', async () => {
    vi.mocked(identificationService.list).mockResolvedValue([]);
    render();
    const empty = await screen.findByTestId('identification-empty');
    expect(empty.textContent).toContain('No hay productos por identificar.');
    expect(screen.queryByRole('list', { name: 'Solicitudes pendientes' })).toBeNull();
  });

  it('error con «Reintentar» que vuelve a consultar; un 403 es «sin permiso», sin reintento', async () => {
    vi.mocked(identificationService.list).mockRejectedValueOnce(axiosError(null));
    const view = render();
    const error = await screen.findByTestId('identification-error');
    expect(error.getAttribute('data-state')).toBe('error');
    expect(error.textContent).toMatch(/Sin conexión con el servidor/);
    fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
    expect(await card('r-a')).toBeTruthy();
    expect(identificationService.list).toHaveBeenCalledTimes(2);
    view.unmount();

    vi.mocked(identificationService.list).mockRejectedValueOnce(axiosError(403));
    render();
    const forbidden = await screen.findByTestId('identification-error');
    expect(forbidden.getAttribute('data-state')).toBe('forbidden');
    expect(within(forbidden).queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  describe('foto', () => {
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn(() => 'blob:foto-sintetica');
    const revokeObjectURL = vi.fn();
    // Con llaves: lo que devuelve un `beforeEach` se trata como su limpieza.
    beforeEach(() => {
      Object.assign(URL, { createObjectURL, revokeObjectURL });
    });
    afterEach(() => {
      Object.assign(URL, { createObjectURL: original.create, revokeObjectURL: original.revoke });
    });

    it('se pide como blob y se muestra con una URL local que se revoca al cerrar', async () => {
      const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
      vi.mocked(identificationService.photoBlob).mockResolvedValue(blob);
      render();
      await card('r-a');
      fireEvent.click(within(panel()).getByRole('button', { name: 'Ver la foto' }));
      const image = (await screen.findByAltText('Foto de la etiqueta reportada')) as HTMLImageElement;
      expect(identificationService.photoBlob).toHaveBeenCalledWith('r-a');
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(image.getAttribute('src')).toBe('blob:foto-sintetica');
      expect(image.getAttribute('src')).not.toMatch(/api|identification-requests/);
      expect(revokeObjectURL).not.toHaveBeenCalled();
      fireEvent.click(within(dialog()).getAllByRole('button', { name: 'Cerrar' })[0]!);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:foto-sintetica');
    });

    it('un 404 se explica en el diálogo, sin imagen', async () => {
      vi.mocked(identificationService.photoBlob).mockRejectedValue(axiosError(404));
      render();
      await card('r-a');
      fireEvent.click(within(panel()).getByRole('button', { name: 'Ver la foto' }));
      expect(await within(dialog()).findByText('La foto ya no está disponible: fue retirada o no existe.')).toBeTruthy();
      expect(screen.queryByAltText('Foto de la etiqueta reportada')).toBeNull();
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });

  it('vincular: sugerencias con su parecido y la aclaración; exige motivo y confirmación y envía el cuerpo del contrato', async () => {
    vi.mocked(identificationService.link).mockResolvedValue({ ...REQ_A, status: 'LINKED' });
    const changed = vi.fn();
    window.addEventListener(IDENTIFICATION_CHANGED_EVENT, changed);
    render();
    const modal = await openAction('r-a', 'Vincular…');
    expect(identificationService.candidates).toHaveBeenCalledWith('r-a');
    const first = await within(modal).findByTestId('candidate-p-1');
    expect(first.textContent).toContain('Parecido alto');
    expect(first.textContent).toContain('Coincide en nombre y ingrediente activo.');
    expect(within(modal).getByTestId('candidate-p-2').textContent).toContain('Parecido medio');
    expect(within(modal).getByTestId('candidate-p-2').textContent).toContain('denominación asociada a otro producto');
    const inactive = within(modal).getByTestId('candidate-p-4');
    expect(inactive.textContent).toContain('Parecido bajo');
    expect((within(inactive).getByRole('radio') as HTMLInputElement).disabled).toBe(true);
    expect(within(modal).getByTestId('candidates-disclaimer').textContent).toBe('Sugerencias por parecido del nombre; la decisión es suya.');
    // Nada viene elegido: la sugerencia no es una decisión.
    expect(candidateRadios().some((radio) => radio.checked)).toBe(false);

    const confirm = submitButton('Confirmar identificación');
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(first).getByRole('radio'));
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(modal).getByLabelText('Motivo'), { target: { value: '  misma etiqueta  ' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(within(modal).getByRole('checkbox'));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect(await screen.findByText('“Glifosato 480 del Sur” vinculado con “Glifosato 48 SL”. La decisión queda en la bitácora.')).toBeTruthy();
    expect(identificationService.link).toHaveBeenCalledWith('r-a', { product_ref: 'p-1', reason: 'misma etiqueta', confirmed: true });
    expect(identificationService.list).toHaveBeenCalledTimes(2);
    // U.5: el armazón vuelve a contar los pendientes (una señal por decisión).
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(IDENTIFICATION_CHANGED_EVENT, changed);
  });

  it('vincular: el catálogo se limita a productos activos de la misma dimensión y se puede buscar sin tildes', async () => {
    vi.mocked(identificationService.link).mockResolvedValue({ changed: false });
    render();
    const modal = await openAction('r-a', 'Vincular…');
    const select = (await within(modal).findByLabelText('Producto del catálogo')) as HTMLSelectElement;
    await vi.waitFor(() => expect(select.disabled).toBe(false));
    expect([...select.options].map((o) => o.textContent)).toEqual(['Seleccione…', 'Glifosato 48 SL (L)', 'Glifosato 480 (L)']);
    fireEvent.change(within(modal).getByLabelText(/Buscar en el catálogo/), { target: { value: 'GLIFOSATO 480' } });
    expect([...select.options].map((o) => o.textContent)).toEqual(['Seleccione…', 'Glifosato 480 (L)']);
    fireEvent.change(select, { target: { value: 'p-2' } });
    fireEvent.change(within(modal).getByLabelText('Motivo'), { target: { value: 'misma etiqueta' } });
    fireEvent.click(within(modal).getByRole('checkbox'));
    fireEvent.click(submitButton('Confirmar identificación'));
    expect(await screen.findByText('“Glifosato 480 del Sur” ya estaba vinculado con “Glifosato 480”; no cambió nada.')).toBeTruthy();
    expect(identificationService.link).toHaveBeenCalledWith('r-a', { product_ref: 'p-2', reason: 'misma etiqueta', confirmed: true });
  });

  it('vincular: los errores del servidor se muestran por errorCode, y lo desconocido con un texto general', async () => {
    vi.mocked(identificationService.link)
      .mockRejectedValueOnce(axiosError(422, { errorCode: 'PRODUCT_INACTIVE' }))
      .mockRejectedValueOnce(axiosError(500, { errorCode: 'ALGO_NUEVO' }));
    render();
    const modal = await openAction('r-a', 'Vincular…');
    fireEvent.click(within(await within(modal).findByTestId('candidate-p-1')).getByRole('radio'));
    fireEvent.change(within(modal).getByLabelText('Motivo'), { target: { value: 'misma etiqueta' } });
    fireEvent.click(within(modal).getByRole('checkbox'));
    fireEvent.click(submitButton('Confirmar identificación'));
    expect(await within(modal).findByText('El producto elegido está inactivo: elija un producto activo.')).toBeTruthy();
    fireEvent.click(submitButton('Confirmar identificación'));
    expect(await within(modal).findByText('No fue posible guardar el vínculo.')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/ALGO_NUEVO|PRODUCT_INACTIVE/);
  });

  it('crear producto colectivo: nombre e ingrediente precargados, unidad fija; un 409 PRODUCT_NAME_TAKEN pasa a «Vincular»', async () => {
    vi.mocked(identificationService.createProduct).mockRejectedValue(axiosError(409, { errorCode: 'PRODUCT_NAME_TAKEN' }));
    render();
    const modal = await openAction('r-a', 'Crear producto colectivo…');
    const name = within(modal).getByLabelText('Nombre del producto colectivo') as HTMLInputElement;
    expect(name.value).toBe('Glifosato 480 del Sur');
    expect((within(modal).getByLabelText('Ingrediente activo (opcional)') as HTMLInputElement).value).toBe('Glifosato');
    expect(within(modal).getByTestId('identification-unit-locked').textContent).toContain('Unidad: L');
    expect(candidateRadios()).toHaveLength(0);

    // Un nombre que ya está en el catálogo se avisa antes de enviar y ofrece vincular.
    await vi.waitFor(() => expect(collectiveService.catalog).toHaveBeenCalled());
    fireEvent.change(name, { target: { value: 'glifosato 48 sl' } });
    expect(within(modal).getByRole('alert').textContent).toContain('Ya existe “Glifosato 48 SL”');
    expect(within(modal).getByRole('button', { name: 'Vincular con “Glifosato 48 SL”' })).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Glifosato 480 Sur' } });

    const create = submitButton('Crear e identificar');
    fireEvent.change(within(modal).getByLabelText('Motivo'), { target: { value: 'producto nuevo' } });
    expect(create.disabled).toBe(true);
    fireEvent.click(within(modal).getByRole('checkbox'));
    expect(create.disabled).toBe(false);
    fireEvent.click(create);

    expect(await within(modal).findByText('Ya existe un producto con ese nombre; vincule con él en su lugar.')).toBeTruthy();
    expect(identificationService.createProduct).toHaveBeenCalledWith('r-a', {
      name: 'Glifosato 480 Sur',
      active_ingredient: 'Glifosato',
      reason: 'producto nuevo',
      confirmed: true,
    });
    expect((within(modal).getByRole('radio', { name: /^Ya está en el catálogo/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(modal).getByRole('button', { name: 'Confirmar identificación' })).toBeTruthy();
    expect(screen.queryByText(/Se creó el producto colectivo/)).toBeNull();
  });

  it('crear producto colectivo: éxito con mensaje y recarga', async () => {
    vi.mocked(identificationService.createProduct).mockResolvedValue({ ...REQ_B, status: 'LINKED' });
    render();
    const modal = await openAction('r-b', 'Crear producto colectivo…');
    expect(within(modal).getByTestId('identification-unit-locked').textContent).toContain('Unidad: KG');
    fireEvent.change(within(modal).getByLabelText('Motivo'), { target: { value: 'no existe en el catálogo' } });
    fireEvent.click(within(modal).getByRole('checkbox'));
    fireEvent.click(submitButton('Crear e identificar'));
    expect(await screen.findByText('Se creó el producto colectivo “Urea perlada” y “Urea perlada” quedó vinculado con él. La decisión queda en la bitácora.')).toBeTruthy();
    expect(identificationService.createProduct).toHaveBeenCalledWith('r-b', { name: 'Urea perlada', active_ingredient: null, reason: 'no existe en el catálogo', confirmed: true });
  });

  it('dejar pendiente: nota y confirmación obligatorias, luego defer', async () => {
    vi.mocked(identificationService.defer).mockResolvedValue(REQ_B);
    render();
    const modal = await openAction('r-b', 'Dejar pendiente…');
    const save = submitButton('Dejar pendiente');
    fireEvent.change(within(modal).getByLabelText('Nota'), { target: { value: 'Falta la concentración' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(within(modal).getByRole('checkbox'));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByText('“Urea perlada” sigue pendiente por falta de información. La nota queda en la bitácora.')).toBeTruthy();
    expect(identificationService.defer).toHaveBeenCalledWith('r-b', { note: 'Falta la concentración', confirmed: true });
    expect(identificationService.link).not.toHaveBeenCalled();
  });

  it('historial: acciones en español, quién decidió sólo en decisiones institucionales, sin identidad del agricultor', async () => {
    render();
    const modal = await openAction('r-a', 'Vincular…');
    const history = within(modal).getByTestId('identification-history');
    expect(history.tagName).toBe('DETAILS');
    const events = await within(history).findAllByTestId('history-event');
    expect(identificationService.history).toHaveBeenCalledWith('r-a');
    const labels = events.map((event) => event.querySelector('span')!.textContent);
    expect(labels).toEqual([
      'Recibida',
      'Datos actualizados',
      'Foto recibida',
      'Foto reemplazada',
      'Foto retirada',
      'Nota',
      'Vinculada',
      'Vínculo corregido',
      'Producto colectivo creado',
    ]);
    expect(events[0]!.textContent).not.toContain('·');
    expect(events[5]!.textContent).toContain('· Directiva sintética');
    expect(events[5]!.textContent).toContain('Falta la concentración');
    expect(events[7]!.textContent).toContain('Producto: “Glifosato 48 SL”');
    expect(events[7]!.textContent).toContain('· Administrador sintético');
    expect(document.body.textContent).not.toMatch(/@|RELINKED|PRODUCT_CREATED/);
  });

  it('«Ya identificados» se consulta al abrirla y permite corregir la identificación (link → RELINKED) con motivo y confirmación', async () => {
    vi.mocked(identificationService.link).mockResolvedValue({ ...REQ_LINKED });
    const changed = vi.fn();
    window.addEventListener(IDENTIFICATION_CHANGED_EVENT, changed);
    render();
    await card('r-a');
    expect(identificationService.list).not.toHaveBeenCalledWith('LINKED');
    fireEvent.click(within(screen.getByRole('group', { name: 'Lista' })).getByRole('button', { name: /^Ya identificados/ }));
    const row = await screen.findByTestId('identified-r-c');
    expect(identificationService.list).toHaveBeenCalledWith('LINKED');
    expect(row.textContent).toContain('«Manco 80»');
    expect(row.textContent).toContain('Identificado como Mancozeb 80 WP');
    expect(row.textContent).toContain('Producto colectivo creado');
    fireEvent.click(within(row).getByRole('button', { name: /^Corregir la identificación/ }));
    const correction = screen.getByRole('region', { name: 'Corregir la identificación' });
    expect(within(correction).queryByRole('radio')).toBeNull();
    const save = within(correction).getByRole('button', { name: 'Guardar corrección' }) as HTMLButtonElement;
    const select = within(correction).getByLabelText('Producto correcto') as HTMLSelectElement;
    await vi.waitFor(() => expect(select.disabled).toBe(false));
    // Sólo productos activos de la misma dimensión (kg).
    expect([...select.options].map((o) => o.textContent)).toEqual(['Seleccione…', 'Urea (kg)']);
    fireEvent.change(select, { target: { value: 'p-3' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(within(correction).getByLabelText('Motivo'), { target: { value: 'era urea' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(within(correction).getByRole('checkbox'));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByText('“Manco 80” vinculado con “Urea”. La decisión queda en la bitácora.')).toBeTruthy();
    expect(identificationService.link).toHaveBeenCalledWith('r-c', { product_ref: 'p-3', reason: 'era urea', confirmed: true });
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(IDENTIFICATION_CHANGED_EVENT, changed);
  });
});
