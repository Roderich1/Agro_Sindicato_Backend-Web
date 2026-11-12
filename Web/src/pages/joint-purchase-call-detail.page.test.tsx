import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_IMPLICATION,
  MANAGE_LOST_TEXT,
  MANAGE_ONLY_TEXT,
  NOT_A_PURCHASE_TEXT,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  RESPONSIBLE_INELIGIBLE_TEXT,
  RESPONSIBLE_ONLY_HIDDEN_TEXT,
} from '../lib/joint-purchase-call-text';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallClosingParticipant,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipants,
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
    collaborators: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), proposals: vi.fn(), proposal: vi.fn() },
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/**
 * E2 §6: detalle de una convocatoria, con las formas que responde el servidor
 * (`call-views.ts`). Datos sintéticos: ningún agricultor, producto ni cifra real.
 */
const RESPONSIBLE = { user_ref: 'u-2', name: 'Responsable sintética' };
const DRAFT: JointPurchaseCallDetail = {
  contractVersion: 1,
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'DRAFT',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  deadline_at: '2026-12-01T22:00:00.000Z',
  opened_at: null,
  closed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-11-11T10:00:00.000Z',
  updated_at: '2026-11-11T10:00:00.000Z',
  server_time: '2026-11-11T10:00:00.000Z',
  responsible: { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: true },
  created_by: RESPONSIBLE,
  opened_by: null,
  cancelled_by: null,
  source_proposal_ref: 'pr-1',
  participant_count: 0,
  totals_source: 'NONE',
  totals_threshold: 3,
  can_view_participants: false,
  is_responsible: false,
  // Quien consulta (u-1) tiene `MANAGE` concedido por la responsable, no `PARTICIPANTS`.
  can_manage: true,
  can_cancel_or_close: true,
  my_grants: ['MANAGE'],
  collaborator_count: 1,
  products: [
    {
      position: 0,
      product_ref: 'p-1',
      name: 'Glifosato 48 SL',
      unit: 'L',
      base_unit: 'ML',
      is_active: true,
      reference: {
        proposal_ref: 'pr-1',
        position: 0,
        status: 'DISCLOSED',
        label: 'Cifra divulgada en el borrador',
        quantity_base: '120000',
        contributors: 5,
        released_at: '2026-11-10T15:00:00.000Z',
      },
      totals: { participant_count: 0, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' },
    },
    {
      position: 1,
      product_ref: 'p-3',
      name: 'Urea',
      unit: 'KG',
      base_unit: 'G',
      is_active: true,
      reference: { proposal_ref: 'pr-1', position: 1, status: 'NO_FIGURE', label: 'Sin cifra', quantity_base: null, contributors: null, released_at: null },
      totals: { participant_count: 0, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' },
    },
  ],
  history: [{ at: '2026-11-11T10:00:00.000Z', kind: 'CREATED', actor: RESPONSIBLE, detail: 'Borrador creado.' }],
};

/** Abierta, vista por quien no es el responsable: E2-P1 retiene todos los totales en vivo. */
const OPEN: JointPurchaseCallDetail = {
  ...DRAFT,
  status: 'OPEN',
  opened_at: '2026-11-11T12:00:00.000Z',
  opened_by: RESPONSIBLE,
  updated_at: '2026-11-11T12:00:00.000Z',
  participant_count: 4,
  totals_source: 'LIVE',
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: null, visibility: 'RESPONSIBLE_ONLY' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: null, visibility: 'RESPONSIBLE_ONLY' } },
  ],
  history: [...DRAFT.history, { at: '2026-11-11T12:00:00.000Z', kind: 'OPENED', actor: RESPONSIBLE, detail: 'Convocatoria abierta.' }],
};

/** Abierta, vista por el responsable (permiso E2-D6): todos los totales. */
const OPEN_RESPONSIBLE: JointPurchaseCallDetail = {
  ...OPEN,
  can_view_participants: true,
  is_responsible: true,
  my_grants: ['MANAGE', 'PARTICIPANTS'],
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: '50000', visibility: 'VISIBLE' } },
  ],
};

const CLOSED: JointPurchaseCallDetail = {
  ...OPEN,
  status: 'CLOSED',
  closed_at: '2026-12-01T22:00:05.000Z',
  updated_at: '2026-12-01T22:00:05.000Z',
  totals_source: 'CLOSING',
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' } },
  ],
  history: [...OPEN.history, { at: '2026-12-01T22:00:05.000Z', kind: 'CLOSED', actor: null, detail: null }],
};

/** El servidor nunca envía correos; si lo hiciera, la vista no los muestra. */
const PARTICIPANTS = {
  contractVersion: 1,
  call_id: 'c-1',
  status: 'OPEN',
  provisional: true,
  notice: 'Lista provisional: puede cambiar hasta el cierre',
  participant_count: 2,
  hidden_participant_count: 0,
  hidden_notice: null,
  participants: [
    {
      participation_ref: 'pa-1',
      name: 'Agricultora sintética',
      email: 'agricultora@example.test',
      phone: '70000000',
      status: 'ACTIVE',
      accepted_at: '2026-11-12T08:00:00.000Z',
      lines: [
        { product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', quantity_base: '2500' },
        { product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', quantity_base: '50000' },
      ],
    },
    {
      participation_ref: 'pa-2',
      name: 'Agricultor sintético',
      email: 'agricultor@example.test',
      status: 'ACTIVE',
      accepted_at: '2026-11-12T09:00:00.000Z',
      lines: [{ product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', quantity_base: '7000' }],
    },
  ],
} as unknown as JointPurchaseCallParticipants;

/** Detalle congelado al cierre: sin `status` (sólo participaciones vigentes al corte). */
const CLOSING_PARTICIPANTS = PARTICIPANTS.participants.map((participant) =>
  Object.fromEntries(Object.entries(participant).filter(([key]) => key !== 'status')),
) as unknown as JointPurchaseCallClosingParticipant[];

const CLOSING: JointPurchaseCallClosing = {
  contractVersion: 1,
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'CLOSED',
  label: 'Consolidado al cierre: cantidades solicitadas',
  mode: 'MANUAL',
  cutoff_at: '2026-12-01T22:00:00.000Z',
  closed_at: '2026-12-01T22:00:05.000Z',
  closed_by: RESPONSIBLE,
  participant_count: 4,
  totals_threshold: 3,
  can_view_participants: false,
  lines: [
    { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE' },
    { product_ref: 'p-3', product_name: 'Urea', unit: 'KG', base_unit: 'G', participant_count: 1, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' },
  ],
  participants: null,
  hidden_participant_count: 0,
  hidden_notice: null,
};

/** §10.2: colaboradores vistos por quien no es la responsable (sin colaboradores). */
const NO_COLLABORATORS: JointPurchaseCallCollaborators = {
  contractVersion: 1,
  call_id: 'c-1',
  status: 'OPEN',
  responsible: RESPONSIBLE,
  can_grant: false,
  collaborators: [],
  history: [],
};

const RESPONSIBLE_ONLY_TEXT =
  'Total visible sólo para el responsable mientras la convocatoria está abierta; al cierre se muestra si hay 3 o más personas en el producto.';
const UNDER_THRESHOLD_TEXT = 'Total no visible: menos de 3 personas pidieron este producto.';

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
    vi.mocked(jointPurchaseCallsService.open).mockResolvedValue(OPEN);
    vi.mocked(jointPurchaseCallsService.close).mockResolvedValue(CLOSING);
    vi.mocked(jointPurchaseCallsService.cancel).mockResolvedValue({ ...DRAFT, status: 'CANCELLED' });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
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
    [422, 'CAMPAIGN_NOT_ELIGIBLE', /La campaña no admite convocatorias/],
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

  it('abrir con 409 INVALID_TRANSITION y status: dice el estado actual en español', async () => {
    vi.mocked(jointPurchaseCallsService.open).mockRejectedValue(axiosError(409, { errorCode: 'INVALID_TRANSITION', status: 'CANCELLED' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }));
    expect(await within(dialog()).findByText(/cambió de estado mientras tanto.*Estado actual: Cancelada\./)).toBeTruthy();
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
      products: [{ ...DRAFT.products[1]!, position: 0, reference: null }],
    };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(catalogDraft);
    vi.mocked(jointPurchaseCallsService.update).mockResolvedValue(catalogDraft);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([{ user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' }]);
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

  it('abierta sin permiso (E2-P1): no pide participantes y retiene todos los totales, sin un 0, con el número de personas', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN);
    render();
    expect((await screen.findByTestId('participants-forbidden')).textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(screen.queryByText('Agricultora sintética')).toBeNull();
    for (const ref of ['p-1', 'p-3']) {
      const row = screen.getByTestId(`call-product-${ref}`);
      expect(within(row).getByTestId('hidden-total').textContent).toBe(RESPONSIBLE_ONLY_TEXT);
      expect(row.textContent).not.toMatch(/\b0 (L|KG)\b|9,5 L/);
    }
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/3 personas/);
    expect(screen.getByTestId('call-product-p-3').textContent).toMatch(/1 persona/);
    expect(screen.getByTestId('participants-panel').textContent).toMatch(/4 personas/);
  });

  it('abierta con permiso pero 403 PARTICIPANTS_FORBIDDEN: el permiso se perdió entre el detalle y la lista (§10.2), sin datos', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_RESPONSIBLE);
    vi.mocked(jointPurchaseCallsService.participants).mockRejectedValue(axiosError(403, { errorCode: 'PARTICIPANTS_FORBIDDEN' }));
    render();
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.participants).toHaveBeenCalledWith('c-1');
    expect(screen.queryByText('Agricultora sintética')).toBeNull();
    // Los totales que dependían del permiso tampoco quedan a la vista.
    expect(screen.getByTestId('call-product-p-1').textContent).not.toMatch(/9,5 L/);
    expect(screen.getByTestId('call-product-p-3').textContent).not.toMatch(/50 KG/);
  });

  it('abierta con permiso: totales visibles y lista provisional con el aviso del servidor, nombre, producto, cantidad, estado y hora; nunca el correo', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_RESPONSIBLE);
    render();
    const panel = await screen.findByTestId('participants-panel');
    await within(panel).findByText('Agricultora sintética');
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/9,5 L.*3 personas/);
    expect(screen.getByTestId('call-product-p-3').textContent).toMatch(/50 KG.*1 persona/);
    expect(screen.queryByTestId('hidden-total')).toBeNull();
    expect(within(panel).getByRole('heading', { name: 'Participantes (lista provisional)' })).toBeTruthy();
    expect(within(panel).getByTestId('provisional-note').textContent).toBe(PARTICIPANTS.notice);
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
    expect(within(panel).getByTestId('closing-label').textContent).toBe(CLOSING.label);
    const under = within(panel).getByTestId('closing-line-p-3');
    expect(within(under).getByTestId('hidden-total').textContent).toBe(UNDER_THRESHOLD_TEXT);
    expect(under.textContent).not.toMatch(/\b0 KG\b/);
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
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED, can_view_participants: true, is_responsible: true });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING,
      mode: 'AUTOMATIC',
      closed_by: null,
      can_view_participants: true,
      participants: CLOSING_PARTICIPANTS,
    });
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

// ------------------------------------------------------------------ E2-P3 (§10.2 y §10.3)

/** Quien consulta en las pruebas es `u-1` («Usuario sintético», `renderAt`). */
const ME = { user_ref: 'u-1', name: 'Usuario sintético' };
const COLLABORATOR = { user_ref: 'u-4', name: 'Colaboradora sintética' };
const ELIGIBLE = [
  { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA' },
  { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
  { user_ref: 'u-4', name: 'Colaboradora sintética', role: 'DIRECTIVA' },
];
const NO_GRANTS = { can_manage: false, can_cancel_or_close: false, my_grants: [] } as const;

/** Abierta, vista por la persona responsable (u-1). */
const OPEN_MINE: JointPurchaseCallDetail = {
  ...OPEN_RESPONSIBLE,
  responsible: { ...ME, role: 'DIRECTIVA', eligible: true },
  created_by: ME,
};

/** Abierta, vista por un colaborador (u-1) con `PARTICIPANTS`; Urea incluye una participación con CONV-1. */
const OPEN_COLLAB: JointPurchaseCallDetail = {
  ...OPEN,
  can_view_participants: true,
  can_manage: false,
  can_cancel_or_close: false,
  my_grants: ['PARTICIPANTS'],
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 2, total_quantity_base: null, visibility: 'RESPONSIBLE_ONLY' } },
  ],
};
const OPEN_REVOKED: JointPurchaseCallDetail = { ...OPEN, ...NO_GRANTS, my_grants: [] };

const HIDDEN_NOTICE = '1 participación aceptada con un consentimiento anterior: sólo la ve la persona responsable.';
const COLLAB_PARTICIPANTS = { ...PARTICIPANTS, hidden_participant_count: 1, hidden_notice: HIDDEN_NOTICE } as JointPurchaseCallParticipants;

const MY_GRANT_VIEW: JointPurchaseCallCollaborators = {
  ...NO_COLLABORATORS,
  collaborators: [
    {
      ...ME,
      role: 'DIRECTIVA',
      grants: [{ grant: 'PARTICIPANTS', label: 'Consultar participantes y cantidades', granted_at: '2026-11-11T12:30:00.000Z', granted_by: RESPONSIBLE }],
    },
  ],
  history: [{ at: '2026-11-11T12:30:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS', user: ME, actor: RESPONSIBLE }],
};

const ADMIN = { user_ref: 'u-3', name: 'Administrador sintético' };
const RESPONSIBLE_VIEW: JointPurchaseCallCollaborators = {
  ...NO_COLLABORATORS,
  responsible: ME,
  can_grant: true,
  collaborators: [
    {
      ...COLLABORATOR,
      role: 'DIRECTIVA',
      grants: [{ grant: 'PARTICIPANTS', label: 'Consultar participantes y cantidades', granted_at: '2026-11-11T12:30:00.000Z', granted_by: ME }],
    },
  ],
  history: [
    { at: '2026-11-11T12:30:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS', user: COLLABORATOR, actor: ME },
    { at: '2026-11-11T12:40:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: ADMIN, actor: ME },
    { at: '2026-11-11T12:50:00.000Z', action: 'REVOKED', grant: 'MANAGE', user: ADMIN, actor: ADMIN },
  ],
};

/** Ni nombres ni cantidades por persona de `PARTICIPANTS` (2,5 L, 50 KG y 7 L), ni el total 9,5 L. */
function expectNoIdentifiedData() {
  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(/Agricultora sintética|Agricultor sintético/);
  expect(text).not.toMatch(/2,5 L|\b7 L|9,5 L|50 KG/);
  expect(screen.queryAllByTestId('participant-row')).toHaveLength(0);
}

async function participantsShown() {
  const panel = await screen.findByTestId('participants-panel');
  await within(panel).findByText('Agricultora sintética');
  return panel;
}

const mockResponsibleView = () => {
  vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_MINE);
  vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS);
  vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(RESPONSIBLE_VIEW);
};

describe('Compras conjuntas: colaboradores y visibilidad (E2-P3, §10.2 y §10.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_COLLAB);
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(COLLAB_PARTICIPANTS);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(MY_GRANT_VIEW);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue(ELIGIBLE);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['borrador', { ...DRAFT, ...NO_GRANTS, my_grants: [] } as JointPurchaseCallDetail],
    ['abierta', { ...OPEN, ...NO_GRANTS, my_grants: [] } as JointPurchaseCallDetail],
  ])('%s sin can_manage: ni Editar, ni Abrir, ni Cerrar, ni Cancelar; se explica quién puede', async (_label, call) => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(call);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    render();
    expect((await screen.findByTestId('manage-note')).textContent).toBe(MANAGE_ONLY_TEXT);
    for (const name of ['Editar', 'Abrir', 'Cerrar', 'Cancelar convocatoria']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Sus permisos:Ninguno/);
  });

  it('con can_manage (sin ser responsable): Editar, Abrir y Cancelar en el borrador; sin aviso', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DRAFT);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    render();
    for (const name of ['Editar', 'Abrir', 'Cancelar convocatoria']) expect(await screen.findByRole('button', { name })).toBeTruthy();
    expect(screen.queryByTestId('manage-note')).toBeNull();
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Sus permisos:Administrar la convocatoria/);
  });

  it('responsable que ya no es elegible: cualquiera de la Directiva puede cancelar o cerrar, pero no editar ni abrir', async () => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, responsible: ineligible, ...NO_GRANTS, can_cancel_or_close: true, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    render();
    expect((await screen.findByTestId('manage-note')).textContent).toBe(RESPONSIBLE_INELIGIBLE_TEXT);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar convocatoria' })).toBeTruthy();
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Responsable sintética \(ya no está activa\)/);
    // Sin `PARTICIPANTS` no se piden participantes.
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it('403 MANAGE_FORBIDDEN al cerrar: cierra el diálogo, lo explica y recarga con los permisos actuales', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN).mockResolvedValue(OPEN_REVOKED);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    vi.mocked(jointPurchaseCallsService.close).mockRejectedValue(axiosError(403, { errorCode: 'MANAGE_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar convocatoria' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe(MANAGE_LOST_TEXT);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar' })).toBeNull());
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('manage-note').textContent).toBe(MANAGE_ONLY_TEXT);
  });

  it('403 MANAGE_FORBIDDEN al guardar el borrador: cierra el formulario, lo explica y recarga', async () => {
    const draft: JointPurchaseCallDetail = { ...DRAFT, source_proposal_ref: null, products: [{ ...DRAFT.products[1]!, position: 0, reference: null }] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    vi.mocked(jointPurchaseCallsService.update).mockRejectedValue(axiosError(403, { errorCode: 'MANAGE_FORBIDDEN' }));
    vi.mocked(collectiveService.catalog).mockResolvedValue([{ product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true }]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await waitFor(() => expect((within(dialog()).getByLabelText('Responsable') as HTMLSelectElement).value).toBe('u-2'));
    await within(dialog()).findByRole('checkbox', { name: /Urea/ });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar borrador' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe(MANAGE_LOST_TEXT);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull());
  });

  it('responsable: lista vigente con permisos, quién y cuándo, e historial de concesiones, revocaciones y renuncias', async () => {
    mockResponsibleView();
    render();
    const panel = await screen.findByTestId('collaborators-panel');
    const row = await within(panel).findByTestId('collaborator-u-4');
    expect(row.textContent).toMatch(/Colaboradora sintética.*Directiva.*Consultar participantes y cantidades.*Concedido por Usuario sintético el/);
    expect(within(panel).getByRole('button', { name: 'Conceder permiso' })).toBeTruthy();
    const events = within(screen.getByTestId('access-history'))
      .getAllByTestId('access-history-event')
      .map((li) => li.textContent);
    expect(events[0]).toMatch(/Concedido.*«Consultar participantes y cantidades» · Colaboradora sintética.*por Usuario sintético/);
    expect(events[2]).toMatch(/Renuncia.*«Administrar la convocatoria» · Administrador sintético/);
    expect(screen.getByTestId('call-facts').textContent).toMatch(
      /Administrar la convocatoria y Consultar participantes y cantidades \(persona responsable\)/,
    );
  });

  it('responsable concede: sólo otros usuarios (ni sí misma ni la responsable), elige el permiso y confirma', async () => {
    const granted: JointPurchaseCallCollaborators = {
      ...RESPONSIBLE_VIEW,
      collaborators: [
        ...RESPONSIBLE_VIEW.collaborators,
        {
          ...ADMIN,
          role: 'ADMINISTRADOR',
          grants: [{ grant: 'MANAGE', label: 'Administrar la convocatoria', granted_at: '2026-11-11T13:00:00.000Z', granted_by: ME }],
        },
      ],
    };
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.grant).mockResolvedValue(granted);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Conceder permiso' }));
    const person = (await within(dialog()).findByLabelText('Persona')) as HTMLSelectElement;
    await waitFor(() => expect(within(person).getAllByRole('option').length).toBeGreaterThan(1));
    const options = within(person)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Fuente: `eligible-responsibles`, sin quien concede (u-1, que aquí es la persona responsable de la convocatoria).
    expect(options).toEqual(['Seleccione…', 'Responsable sintética · Directiva', 'Administrador sintético · Administrador', 'Colaboradora sintética · Directiva']);
    const submit = within(dialog()).getByRole('button', { name: 'Conceder permiso' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(person, { target: { value: 'u-3' } });
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Administrar la convocatoria/ }));
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Confirmo que concedo «Administrar la convocatoria» a Administrador sintético/ }));
    expect(jointPurchaseCallsService.grant).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.grant).toHaveBeenCalledWith('c-1', 'u-3', 'MANAGE'));
    expect(await screen.findByText('Permiso «Administrar la convocatoria» concedido a Administrador sintético.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('collaborator-u-3').textContent).toMatch(/Administrar la convocatoria/);
    // El detalle se vuelve a pedir (recuento de colaboradores y permisos propios).
    await waitFor(() => expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2));
  });

  it('conceder con 422 COLLABORATOR_NOT_ELIGIBLE: el motivo en español, sin el código, y el diálogo sigue abierto', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.grant).mockRejectedValue(axiosError(422, { errorCode: 'COLLABORATOR_NOT_ELIGIBLE' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Conceder permiso' }));
    const person = (await within(dialog()).findByLabelText('Persona')) as HTMLSelectElement;
    await waitFor(() => expect(within(person).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(person, { target: { value: 'u-4' } });
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Conceder permiso' }));
    expect(await within(dialog()).findByText(/no puede recibir o perder este permiso/)).toBeTruthy();
    expect(within(dialog()).queryByText('COLLABORATOR_NOT_ELIGIBLE')).toBeNull();
    expect(jointPurchaseCallsService.grant).toHaveBeenCalledWith('c-1', 'u-4', 'PARTICIPANTS');
  });

  it('responsable retira un permiso con confirmación', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue({ ...RESPONSIBLE_VIEW, collaborators: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar «Consultar participantes y cantidades» a Colaboradora sintética' }));
    const submit = within(dialog()).getByRole('button', { name: 'Retirar permiso' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.revoke).toHaveBeenCalledWith('c-1', 'u-4', 'PARTICIPANTS'));
    expect(await screen.findByText('Permiso «Consultar participantes y cantidades» retirado a Colaboradora sintética.')).toBeTruthy();
    expect(await screen.findByTestId('collaborators-empty')).toBeTruthy();
  });

  it('403 COLLABORATORS_FORBIDDEN al retirar: lo explica y recarga', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValueOnce(RESPONSIBLE_VIEW).mockResolvedValue({ ...RESPONSIBLE_VIEW, can_grant: false });
    vi.mocked(jointPurchaseCallsService.revoke).mockRejectedValue(axiosError(403, { errorCode: 'COLLABORATORS_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: /^Retirar «Consultar/ }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Retirar permiso' }));
    expect((await screen.findByTestId('call-alert')).textContent).toMatch(/sólo la persona responsable puede hacerlo/);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Conceder permiso' })).toBeNull());
    expect(jointPurchaseCallsService.collaborators).toHaveBeenCalledTimes(2);
  });

  it('colaborador: no concede ni retira; renuncia a su permiso y deja de ver nombres y cantidades', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN_COLLAB).mockResolvedValue(OPEN_REVOKED);
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue(NO_COLLABORATORS);
    render();
    await participantsShown();
    const panel = screen.getByTestId('collaborators-panel');
    expect(within(panel).queryByRole('button', { name: 'Conceder permiso' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Retirar/ })).toBeNull();
    expect((await within(panel).findByTestId('collaborator-u-1')).textContent).toMatch(/Usuario sintético \(usted\)/);
    fireEvent.click(within(panel).getByRole('button', { name: 'Renunciar a este permiso' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Renunciar a este permiso' }));
    await waitFor(() => expect(jointPurchaseCallsService.revoke).toHaveBeenCalledWith('c-1', 'u-1', 'PARTICIPANTS'));
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(await screen.findByText('Renunció al permiso «Consultar participantes y cantidades».')).toBeTruthy();
    expectNoIdentifiedData();
  });

  it('colaborador con PARTICIPANTS: aviso de participaciones con consentimiento anterior y total RESPONSIBLE_ONLY explicado (abierta)', async () => {
    render();
    const panel = await participantsShown();
    expect(within(panel).getByTestId('hidden-participants-notice').textContent).toBe(HIDDEN_NOTICE);
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/9,5 L.*3 personas/);
    const urea = screen.getByTestId('call-product-p-3');
    expect(within(urea).getByTestId('hidden-total').textContent).toBe(RESPONSIBLE_ONLY_HIDDEN_TEXT);
    expect(urea.textContent).toMatch(/2 personas/);
  });

  it('responsable: sin aviso de consentimiento anterior (lo ve todo)', async () => {
    mockResponsibleView();
    render();
    await participantsShown();
    expect(screen.queryByTestId('hidden-participants-notice')).toBeNull();
  });

  it('abierta sin PARTICIPANTS (E2-P1): el texto de RESPONSIBLE_ONLY es el de la convocatoria abierta, no el de participaciones ocultas', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_REVOKED);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    render();
    const row = await screen.findByTestId('call-product-p-3');
    expect(within(row).getByTestId('hidden-total').textContent).toBe(RESPONSIBLE_ONLY_TEXT);
  });

  it('cerrada, colaborador: detalle sólo de CONV-2, aviso de las demás y total RESPONSIBLE_ONLY explicado en el consolidado', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED, can_view_participants: true, ...NO_GRANTS, my_grants: ['PARTICIPANTS'] });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING,
      can_view_participants: true,
      participants: [CLOSING_PARTICIPANTS[1]!],
      hidden_participant_count: 1,
      hidden_notice: HIDDEN_NOTICE,
      lines: [CLOSING.lines[0]!, { ...CLOSING.lines[1]!, participant_count: 2, visibility: 'RESPONSIBLE_ONLY' }],
    });
    render();
    const panel = await screen.findByTestId('closing-panel');
    expect(await within(panel).findByText('Agricultor sintético')).toBeTruthy();
    expect(within(panel).queryByText('Agricultora sintética')).toBeNull();
    expect(within(panel).getByTestId('hidden-participants-notice').textContent).toBe(HIDDEN_NOTICE);
    expect(within(within(panel).getByTestId('closing-line-p-3')).getByTestId('hidden-total').textContent).toBe(RESPONSIBLE_ONLY_HIDDEN_TEXT);
  });

  it('revocación detectada al recuperar el foco: borra nombres y cantidades y lo dice con el texto exacto', async () => {
    render();
    await participantsShown();
    expect(screen.getByText('9,5 L')).toBeTruthy();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_REVOKED);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2);
    expectNoIdentifiedData();
    expect(screen.queryByTestId('participants-forbidden')).toBeNull();
  });

  it('revocación detectada al recuperar el foco: la lista de colaboradores se vuelve a pedir y deja de mostrar el permiso perdido', async () => {
    // Hallazgo del recorrido real (2026-11-11): el panel seguía mostrando «Consultar participantes…» y «Renunciar».
    render();
    await participantsShown();
    const panel = await screen.findByTestId('collaborators-panel');
    expect(within(panel).getByRole('button', { name: 'Renunciar a este permiso' })).toBeTruthy();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_REVOKED, collaborator_count: 0 });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue({
      ...NO_COLLABORATORS,
      history: [...MY_GRANT_VIEW.history, { at: '2026-11-11T13:00:00.000Z', action: 'REVOKED', grant: 'PARTICIPANTS', user: ME, actor: RESPONSIBLE }],
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByTestId('participants-revoked');
    await waitFor(() => expect(jointPurchaseCallsService.collaborators).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByTestId('collaborators-panel')).queryByRole('button', { name: 'Renunciar a este permiso' })).toBeNull());
    expect(within(screen.getByTestId('collaborators-panel')).getByTestId('collaborators-empty')).toBeTruthy();
  });

  it('revocación por 403 PARTICIPANTS_FORBIDDEN al volver a la pestaña: borra nombres, cantidades y totales del DOM', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render();
    await participantsShown();
    vi.mocked(jointPurchaseCallsService.participants).mockRejectedValue(axiosError(403, { errorCode: 'PARTICIPANTS_FORBIDDEN' }));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.participants).toHaveBeenCalledTimes(2);
    expectNoIdentifiedData();
  });

  it('con la pestaña oculta no se comprueba; cada 60 s sí', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render();
    await participantsShown();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_REVOKED);
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2);
    expectNoIdentifiedData();
  });

  it('cerrada: la revocación al recuperar el foco borra el detalle por persona del consolidado', async () => {
    const closedCollab: JointPurchaseCallDetail = { ...CLOSED, can_view_participants: true, ...NO_GRANTS, my_grants: ['PARTICIPANTS'] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(closedCollab).mockResolvedValue({ ...CLOSED, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.closing)
      .mockResolvedValueOnce({ ...CLOSING, can_view_participants: true, participants: CLOSING_PARTICIPANTS })
      .mockResolvedValue(CLOSING);
    render();
    await within(await screen.findByTestId('closing-panel')).findByText('Agricultora sintética');
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    const panel = screen.getByTestId('closing-panel');
    expect((await within(panel).findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    await within(panel).findByTestId('closing-cutoff');
    expect(jointPurchaseCallsService.closing).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toMatch(/Agricultora sintética|Agricultor sintético|2,5 L|\b7 L/);
  });

  it('nada de participantes en el navegador: ni localStorage ni sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    render();
    await participantsShown();
    for (const args of setItem.mock.calls) expect(JSON.stringify(args)).not.toMatch(/Agricultora|Agricultor|pa-1|pa-2/);
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) expect(store.getItem(store.key(i)!) ?? '').not.toMatch(/Agricultora|Agricultor/);
    }
  });

  it('cambiar de convocatoria descarta la respuesta tardía de la anterior', async () => {
    let resolveFirst: (value: JointPurchaseCallDetail) => void = () => undefined;
    vi.mocked(jointPurchaseCallsService.get).mockImplementation((id: string) =>
      id === 'c-1'
        ? new Promise<JointPurchaseCallDetail>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ ...DRAFT, call_id: 'c-2', name: 'Otra convocatoria' }),
    );
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    renderAt(
      <>
        <JointPurchaseCallDetailPage />
        <Link to="/colectivo/compras-conjuntas/c-2">Ir a otra</Link>
      </>,
      { path: '/colectivo/compras-conjuntas/c-1', routePath: '/colectivo/compras-conjuntas/:id' },
    );
    await waitFor(() => expect(jointPurchaseCallsService.get).toHaveBeenCalledWith('c-1'));
    fireEvent.click(screen.getByRole('link', { name: 'Ir a otra' }));
    expect((await screen.findAllByText('Otra convocatoria')).length).toBeGreaterThan(0);
    await act(async () => {
      resolveFirst(OPEN_COLLAB);
    });
    expect(screen.queryByText('Herbicidas de la siembra')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });
});
