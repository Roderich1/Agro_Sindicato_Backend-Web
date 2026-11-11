import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_IMPLICATION,
  NOT_A_PURCHASE_TEXT,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PROVISIONAL_NOTE,
} from '../lib/joint-purchase-call-text';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipant,
} from '../types/joint-purchase-calls';
import { JointPurchaseCallDetailPage } from './joint-purchase-call-detail.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    open: vi.fn(),
    cancel: vi.fn(),
    close: vi.fn(),
    participants: vi.fn(),
    closing: vi.fn(),
    eligibleResponsibles: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), proposals: vi.fn(), proposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/** E2 §6: detalle de una convocatoria. Datos sintéticos: ningún agricultor, producto ni cifra real. */
const DRAFT: JointPurchaseCallDetail = {
  id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'DRAFT',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name },
  deadline_at: '2026-12-01T22:00:00.000Z',
  opened_at: null,
  closed_at: null,
  cancelled_at: null,
  responsible: { id: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  participant_count: 0,
  created_at: '2026-11-11T10:00:00.000Z',
  updated_at: '2026-11-11T10:00:00.000Z',
  products: [
    {
      position: 0,
      product_ref: 'p-1',
      product_name: 'Glifosato 48 SL',
      base_unit: 'ML',
      unit: 'L',
      reference: { source_proposal_ref: 'pr-1', source_position: 0, status: 'DISCLOSED', quantity_base: '120000', quantity_presentation: '120' },
    },
    {
      position: 1,
      product_ref: 'p-3',
      product_name: 'Urea',
      base_unit: 'G',
      unit: 'KG',
      reference: { source_proposal_ref: 'pr-1', source_position: 1, status: 'SUPPRESSED_UNDER_THRESHOLD', quantity_base: null },
    },
  ],
  source_proposal_ref: 'pr-1',
  cancel_reason: null,
  can_view_participants: false,
  totals_threshold: 3,
  history: [{ at: '2026-11-11T10:00:00.000Z', kind: 'CREATED', actor: { name: 'Responsable sintética' }, detail: null }],
};

const OPEN: JointPurchaseCallDetail = {
  ...DRAFT,
  status: 'OPEN',
  opened_at: '2026-11-11T12:00:00.000Z',
  updated_at: '2026-11-11T12:00:00.000Z',
  participant_count: 4,
  products: [
    { ...DRAFT.products[0]!, total: { total_quantity_base: '9500', participant_count: 3 } },
    { ...DRAFT.products[1]!, total: { total_quantity_base: null, participant_count: null } },
  ],
  history: [...DRAFT.history, { at: '2026-11-11T12:00:00.000Z', kind: 'OPENED', actor: { name: 'Responsable sintética' }, detail: null }],
};

const CLOSED: JointPurchaseCallDetail = {
  ...OPEN,
  status: 'CLOSED',
  closed_at: '2026-12-01T22:00:05.000Z',
  updated_at: '2026-12-01T22:00:05.000Z',
  history: [...OPEN.history, { at: '2026-12-01T22:00:05.000Z', kind: 'CLOSED', actor: null, detail: null }],
};

/** El servidor nunca envía correos; si lo hiciera, la vista no los muestra. */
const PARTICIPANTS = [
  {
    participation_ref: 'pa-1',
    name: 'Agricultora sintética',
    email: 'agricultora@example.test',
    phone: '70000000',
    status: 'ACTIVE',
    accepted_at: '2026-11-12T08:00:00.000Z',
    lines: [
      { product_ref: 'p-1', base_unit: 'ML', quantity_base: '2500' },
      { product_ref: 'p-3', base_unit: 'G', quantity_base: '50000' },
    ],
  },
  {
    participation_ref: 'pa-2',
    name: 'Agricultor sintético',
    email: 'agricultor@example.test',
    status: 'ACTIVE',
    accepted_at: '2026-11-12T09:00:00.000Z',
    lines: [{ product_ref: 'p-1', base_unit: 'ML', quantity_base: '7000' }],
  },
] as unknown as JointPurchaseCallParticipant[];

const CLOSING: JointPurchaseCallClosing = {
  call_id: 'c-1',
  mode: 'MANUAL',
  cutoff_at: '2026-12-01T22:00:00.000Z',
  closed_at: '2026-12-01T22:00:05.000Z',
  closed_by: { name: 'Responsable sintética' },
  participant_count: 4,
  lines: [
    { product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', total_quantity_base: '9500', participant_count: 3 },
    { product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', total_quantity_base: null, participant_count: null },
  ],
  participants: null,
};

function axiosError(status: number, data: unknown = {}) {
  const error = new AxiosError(String(status), String(status));
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const render = () =>
  renderAt(<JointPurchaseCallDetailPage />, {
    path: `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`,
    routePath: '/colectivo/compras-conjuntas/:id',
  });
const dialog = () => screen.getByRole('dialog');
const confirmBox = () => within(dialog()).getByRole('checkbox');
const FORBIDDEN_WORDS = /comprad|entregad|deuda/i;

describe('Compras conjuntas: detalle (E2 §6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DRAFT);
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING);
    vi.mocked(jointPurchaseCallsService.open).mockResolvedValue({});
    vi.mocked(jointPurchaseCallsService.close).mockResolvedValue({});
    vi.mocked(jointPurchaseCallsService.cancel).mockResolvedValue({});
  });

  it('borrador: estado, datos, productos con su referencia, historial y acciones Editar, Abrir y Cancelar', async () => {
    render();
    expect((await screen.findByTestId('call-status')).textContent).toBe('Borrador');
    expect(jointPurchaseCallsService.get).toHaveBeenCalledWith('c-1');
    const facts = screen.getByTestId('call-facts');
    expect(facts.textContent).toMatch(/Responsable sintética/);
    expect(facts.textContent).toMatch(/Todavía no se abrió/);
    expect(facts.textContent).toMatch(/0 personas/);
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/Referencia del borrador: 120 L \(divulgada\)/);
    expect(screen.getByTestId('call-product-p-3').textContent).toMatch(/Sin cifra divulgada/);
    expect(within(screen.getByTestId('call-history')).getByText('Borrador creado')).toBeTruthy();
    for (const name of ['Editar', 'Abrir', 'Cancelar convocatoria']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    expect(screen.queryByTestId('participants-panel')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it('abrir: el diálogo dice lo que implica y exige confirmar; luego recarga la convocatoria', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(DRAFT).mockResolvedValue(OPEN);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    const implications = within(dialog()).getByTestId('open-implications').textContent;
    for (const text of OPEN_IMPLICATIONS) expect(implications).toContain(text);
    const submit = within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.open).toHaveBeenCalledWith('c-1'));
    expect(await screen.findByText('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.')).toBeTruthy();
    expect((await screen.findByTestId('call-status')).textContent).toBe('Abierta');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    [409, 'PRODUCT_IN_OPEN_CALL', /ya está en otra convocatoria abierta de esta campaña/],
    [422, 'DEADLINE_IN_PAST', /La fecha límite ya pasó según la hora del servidor/],
    [422, 'CONFIRMATION_REQUIRED', /Falta la confirmación/],
  ])('abrir con %s %s: el motivo se explica en español y el diálogo sigue abierto', async (status, errorCode, text) => {
    vi.mocked(jointPurchaseCallsService.open).mockRejectedValue(axiosError(status, { errorCode }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }));
    expect(await within(dialog()).findByText(text)).toBeTruthy();
    expect(within(dialog()).queryByText(errorCode)).toBeNull();
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(1);
  });

  it('cancelar exige motivo y confirmación; envía el motivo', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convocatoria' }));
    const submit = within(dialog()).getByRole('button', { name: 'Cancelar convocatoria' }) as HTMLButtonElement;
    fireEvent.click(confirmBox());
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: '  Se repite con otra convocatoria ' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.cancel).toHaveBeenCalledWith('c-1', 'Se repite con otra convocatoria'));
  });

  it('cancelar: REASON_REQUIRED del servidor se explica', async () => {
    vi.mocked(jointPurchaseCallsService.cancel).mockRejectedValue(axiosError(422, { errorCode: 'REASON_REQUIRED' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convocatoria' }));
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: 'x' } });
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar convocatoria' }));
    expect(await within(dialog()).findByText(/Escriba el motivo/)).toBeTruthy();
  });

  it('editar el borrador envía un PATCH con lo elegido', async () => {
    const catalogDraft: JointPurchaseCallDetail = {
      ...DRAFT,
      source_proposal_ref: null,
      products: [{ position: 0, product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', unit: 'KG', reference: null }],
    };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(catalogDraft);
    vi.mocked(jointPurchaseCallsService.update).mockResolvedValue(catalogDraft);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([{ id: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' }]);
    vi.mocked(collectiveService.catalog).mockResolvedValue([
      { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', is_active: true },
      { product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true },
    ]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    expect((within(dialog()).getByLabelText('Nombre') as HTMLInputElement).value).toBe('Herbicidas de la siembra');
    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: 'Urea de la siembra' } });
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await waitFor(() => expect((within(dialog()).getByLabelText('Responsable') as HTMLSelectElement).value).toBe('u-2'));
    expect((await within(dialog()).findByRole('checkbox', { name: /Urea/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.update).toHaveBeenCalledWith('c-1', {
        name: 'Urea de la siembra',
        deadline_at: new Date('2099-12-01T18:00').toISOString(),
        responsible_user_id: 'u-2',
        products: [{ product_ref: 'p-3' }],
        source_proposal_id: null,
      }),
    );
  });

  it('abierta: cerrar pide confirmación con lo que implica y llama al servidor', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN).mockResolvedValue(CLOSED);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar' }));
    expect(within(dialog()).getByTestId('close-implication').textContent).toBe(CLOSE_IMPLICATION);
    const submit = within(dialog()).getByRole('button', { name: 'Cerrar convocatoria' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.close).toHaveBeenCalledWith('c-1'));
    expect(await screen.findByTestId('closing-panel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
  });

  it('abierta sin permiso: no pide participantes, lo explica y oculta los totales bajo el umbral', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN);
    render();
    expect((await screen.findByTestId('participants-forbidden')).textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(screen.queryByText('Agricultora sintética')).toBeNull();
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/9,5 L/);
    expect(within(screen.getByTestId('call-product-p-3')).getByTestId('hidden-total').textContent).toBe(
      'Total visible sólo para el responsable o con 3 o más participantes en el producto',
    );
    expect(screen.getByTestId('participants-panel').textContent).toMatch(/4 personas/);
  });

  it('abierta con permiso pero 403 PARTICIPANTS_FORBIDDEN: el mismo texto, sin datos', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, can_view_participants: true });
    vi.mocked(jointPurchaseCallsService.participants).mockRejectedValue(axiosError(403, { errorCode: 'PARTICIPANTS_FORBIDDEN' }));
    render();
    expect((await screen.findByTestId('participants-forbidden')).textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).toHaveBeenCalledWith('c-1');
  });

  it('abierta con permiso: lista provisional con nombre, producto, cantidad en L/KG, estado y hora; nunca el correo', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, can_view_participants: true });
    render();
    const panel = await screen.findByTestId('participants-panel');
    await within(panel).findByText('Agricultora sintética');
    expect(within(panel).getByRole('heading', { name: 'Participantes (lista provisional)' })).toBeTruthy();
    expect(within(panel).getByTestId('provisional-note').textContent).toBe(PROVISIONAL_NOTE);
    const rows = within(panel).getAllByTestId('participant-row').map((row) => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/Agricultora sintética.*Glifosato 48 SL.*2,5 L.*Vigente/);
    expect(rows[1]).toMatch(/Urea.*50 KG/);
    expect(rows[2]).toMatch(/Agricultor sintético.*Glifosato 48 SL.*7 L/);
    expect(document.body.textContent).not.toContain('@');
    expect(document.body.innerHTML).not.toMatch(/example\.test|70000000/);
  });

  it('cerrada: «Consolidado al cierre» con corte, modo, personas y totales solicitados; sin detalle por persona sin permiso', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(CLOSED);
    render();
    const panel = await screen.findByTestId('closing-panel');
    await within(panel).findByTestId('closing-cutoff');
    expect(within(panel).getByRole('heading', { name: 'Consolidado al cierre' })).toBeTruthy();
    expect(within(panel).getByTestId('closing-mode').textContent).toMatch(/Manual/);
    expect(within(panel).getByTestId('closing-participants').textContent).toMatch(/4 personas/);
    expect(within(panel).getByTestId('closing-line-p-1').textContent).toMatch(/9,5 L/);
    expect(within(panel).getByTestId('closing-line-p-3').textContent).toMatch(/Total visible sólo para el responsable/);
    expect(within(panel).getByText('Cantidad solicitada (total)')).toBeTruthy();
    expect(within(panel).getByTestId('closing-detail-hidden')).toBeTruthy();
    expect(within(panel).queryByText('Agricultora sintética')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(within(panel).getByTestId('not-a-purchase').textContent).toBe(NOT_A_PURCHASE_TEXT);
    // Sólo la frase que lo niega explícitamente menciona compras, entregas o deudas.
    const text = (document.body.textContent ?? '').split(NOT_A_PURCHASE_TEXT).join(' ');
    expect(text).not.toMatch(FORBIDDEN_WORDS);
    expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar convocatoria' })).toBeNull();
  });

  it('cerrada con permiso: detalle por participante congelado, sin correo', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED, can_view_participants: true });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({ ...CLOSING, mode: 'AUTOMATIC', closed_by: null, participants: PARTICIPANTS });
    render();
    const panel = await screen.findByTestId('closing-panel');
    expect(await within(panel).findByText('Agricultora sintética')).toBeTruthy();
    expect(within(panel).getByTestId('closing-mode').textContent).toMatch(/Automático/);
    expect(within(panel).getByText('Detalle por participante')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
    const text = (document.body.textContent ?? '').split(NOT_A_PURCHASE_TEXT).join(' ');
    expect(text).not.toMatch(FORBIDDEN_WORDS);
  });

  it('una convocatoria de otro tenant o inexistente: 404 en español, sin datos', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockRejectedValue(axiosError(404, { errorCode: 'CALL_NOT_FOUND' }));
    render();
    expect((await screen.findByTestId('call-error')).textContent).toMatch(/no existe o no pertenece a su organización/);
  });
});
