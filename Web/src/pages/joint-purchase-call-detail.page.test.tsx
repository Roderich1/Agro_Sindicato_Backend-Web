import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_IMPLICATION,
  fmtWhen,
  MANAGE_ONLY_TEXT,
  NOT_A_PURCHASE_TEXT,
  OPEN_ACCESS_LINE,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  PENDING_CONSENT_TOTAL_TEXT,
  PREVIOUS_POLICY_TOTAL_NOTE,
  WHY_VISIBLE_TEXT,
} from '../lib/joint-purchase-call-text';
import { campaignsService } from '../services/campaigns.service';
import { collectiveService } from '../services/collective.service';
import { requestSessionRevalidation } from '../lib/axios';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallClosingParticipant,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallOrigin,
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
    reviewDelegation: vi.fn(),
    substituteResponsible: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({
  collectiveService: { catalog: vi.fn(), associations: vi.fn(), proposals: vi.fn(), proposal: vi.fn() },
}));
vi.mock('../lib/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/axios')>()),
  requestSessionRevalidation: vi.fn(),
}));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/**
 * E2 §6 con E4 (contrato institucional 2): detalle de una convocatoria, con
 * las formas que responde el servidor (`call-views.ts`). Datos sintéticos:
 * ningún agricultor, producto ni cifra real. Quien consulta es `u-1`
 * (`renderAt`); cada fixture dice con qué rol lo ve el servidor
 * (`can_view_participants` = Administración habilitada).
 */
const RESPONSIBLE = { user_ref: 'u-2', name: 'Responsable sintética' };
const DRAFT: JointPurchaseCallDetail = {
  contractVersion: 2,
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
  responsible: { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: true, version: 1 },
  created_by: RESPONSIBLE,
  opened_by: null,
  cancelled_by: null,
  source_proposal_ref: 'pr-1',
  participant_count: 0,
  totals_source: 'NONE',
  can_view_participants: false,
  is_responsible: false,
  // Quien consulta (u-1, Directiva) tiene `MANAGE` concedido por la responsable.
  can_manage: true,
  can_cancel_or_close: true,
  delegations_suspended: false,
  can_substitute_responsible: false,
  pending_delegation_reviews: 0,
  pending_consent_count: 0,
  responsible_changes: [],
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
      // E4_EJEMPLOS_RESPUESTAS §2.1: en un borrador cada producto sale VISIBLE con "0" y ROLE_CONSENT.
      totals: { participant_count: 0, total_quantity_base: '0', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
    {
      position: 1,
      product_ref: 'p-3',
      name: 'Urea',
      unit: 'KG',
      base_unit: 'G',
      is_active: true,
      reference: { proposal_ref: 'pr-1', position: 1, status: 'NO_FIGURE', label: 'Sin cifra', quantity_base: null, contributors: null, released_at: null },
      totals: { participant_count: 0, total_quantity_base: '0', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
  ],
  history: [{ at: '2026-11-11T10:00:00.000Z', kind: 'CREATED', actor: RESPONSIBLE, detail: 'Borrador creado.' }],
};

/**
 * Abierta, vista por la Directiva (u-1 con `MANAGE`). Regla T en vivo, igual
 * para los dos roles: Glifosato con 3 personas que autorizan los totales
 * (`ROLE_CONSENT`); Urea con 1 persona con una autorización anterior (`PENDING_CONSENT`).
 */
const OPEN: JointPurchaseCallDetail = {
  ...DRAFT,
  status: 'OPEN',
  opened_at: '2026-11-11T12:00:00.000Z',
  opened_by: RESPONSIBLE,
  updated_at: '2026-11-11T12:00:00.000Z',
  participant_count: 4,
  totals_source: 'LIVE',
  pending_consent_count: 1,
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null } },
  ],
  history: [...DRAFT.history, { at: '2026-11-11T12:00:00.000Z', kind: 'OPENED', actor: RESPONSIBLE, detail: 'Convocatoria abierta.' }],
};

/** Abierta, vista por la Administración (u-1): los mismos totales y, además, el detalle identificado. */
const OPEN_ADMIN: JointPurchaseCallDetail = {
  ...OPEN,
  can_view_participants: true,
  pending_consent_count: 0,
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: '50000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' } },
  ],
};

/** Cerrada, vista por la Directiva: Glifosato visible por la regla anterior (3 personas), Urea pendiente. */
const CLOSED: JointPurchaseCallDetail = {
  ...OPEN,
  status: 'CLOSED',
  closed_at: '2026-12-01T22:00:05.000Z',
  updated_at: '2026-12-01T22:00:05.000Z',
  totals_source: 'CLOSING',
  pending_consent_count: 2,
  products: [
    { ...DRAFT.products[0]!, totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE', totals_basis: 'PREVIOUS_POLICY_K3' } },
    { ...DRAFT.products[1]!, totals: { participant_count: 1, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null } },
  ],
  history: [...OPEN.history, { at: '2026-12-01T22:00:05.000Z', kind: 'CLOSED', actor: null, detail: null }],
};

/** `/participants` de la Administración. El servidor nunca envía correos; si lo hiciera, la vista no los muestra. */
const PARTICIPANTS = {
  contractVersion: 2,
  call_id: 'c-1',
  status: 'OPEN',
  provisional: true,
  notice: 'Lista provisional: puede cambiar hasta el cierre',
  participant_count: 2,
  pending_consent_count: 0,
  pending_consent_notice: null,
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

const PENDING_NOTICE_2 = '2 participaciones sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.';

/** Consolidado visto por la Directiva (sin detalle por persona). */
const CLOSING: JointPurchaseCallClosing = {
  contractVersion: 2,
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'CLOSED',
  label: 'Consolidado al cierre: cantidades solicitadas',
  mode: 'MANUAL',
  cutoff_at: '2026-12-01T22:00:00.000Z',
  closed_at: '2026-12-01T22:00:05.000Z',
  closed_by: RESPONSIBLE,
  participant_count: 4,
  can_view_participants: false,
  lines: [
    { product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE', totals_basis: 'PREVIOUS_POLICY_K3' },
    { product_ref: 'p-3', product_name: 'Urea', unit: 'KG', base_unit: 'G', participant_count: 1, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
  ],
  participants: null,
  pending_consent_count: 2,
  pending_consent_notice: PENDING_NOTICE_2,
};

/** Colaboradores vistos por quien no es la responsable (sin colaboradores ni historia). */
const NO_COLLABORATORS: JointPurchaseCallCollaborators = {
  contractVersion: 2,
  call_id: 'c-1',
  status: 'OPEN',
  responsible: RESPONSIBLE,
  can_grant: false,
  can_review: false,
  responsible_version: 1,
  collaborators: [],
  retired_grants: [],
  history: [],
};

function axiosError(status: number, data: unknown = {}) {
  const error = new AxiosError(String(status), String(status));
  error.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const render = (role = 'DIRECTIVA') =>
  renderAt(<JointPurchaseCallDetailPage />, {
    role,
    path: `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`,
    routePath: '/colectivo/compras-conjuntas/:id',
  });
// Rediseño v2: las confirmaciones destructivas usan `ConfirmDialog` de BASE con `role="alertdialog"`.
const dialog = () => screen.queryByRole('dialog') ?? screen.getByRole('alertdialog');
const anyDialog = () => screen.queryByRole('dialog') ?? screen.queryByRole('alertdialog');
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
    // Rediseño v2 (lámina 10): los datos clave van en la cabecera; en un borrador, «Los agricultores: Aún no la ven».
    const facts = screen.getByTestId('call-key-facts');
    expect(facts.textContent).toMatch(/Responsable sintética/);
    expect(facts.textContent).toMatch(/Aún no la ven/);
    expect(screen.getByTestId('draft-requests').textContent).toMatch(/Nadie puede pedir todavía/);
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/Necesidad declarada en el borrador: 120 L/);
    expect(screen.getByTestId('call-product-p-3').textContent).toMatch(/Sin cifra publicada en el borrador/);
    expect(within(screen.getByTestId('call-history')).getByText('Borrador creado')).toBeTruthy();
    for (const name of ['Editar', 'Abrir convocatoria…', 'Cancelar convocatoria…']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull();
    expect(screen.queryByTestId('participants-panel')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it('abrir: el diálogo dice lo que implica y exige confirmar; luego recarga la convocatoria', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(DRAFT).mockResolvedValue(OPEN);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir convocatoria…' }));
    const implications = within(dialog()).getByTestId('open-implications').textContent;
    for (const text of OPEN_IMPLICATIONS) expect(implications).toContain(text);
    const submit = within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.open).toHaveBeenCalledWith('c-1'));
    expect(await screen.findByText('Convocatoria abierta. Los agricultores la verán al actualizar su aplicación.')).toBeTruthy();
    expect((await screen.findByTestId('call-status')).textContent).toBe('Abierta');
    expect(anyDialog()).toBeNull();
  });

  it.each([
    [409, 'PRODUCT_IN_OPEN_CALL', /ya está en otra convocatoria abierta de esta campaña/],
    [422, 'DEADLINE_IN_PAST', /La fecha límite ya pasó según la hora del servidor/],
    [422, 'CONFIRMATION_REQUIRED', /Falta la confirmación/],
    [422, 'CAMPAIGN_NOT_ELIGIBLE', /La campaña no admite convocatorias/],
  ])('abrir con %s %s: el motivo se explica en español y el diálogo sigue abierto', async (status, errorCode, text) => {
    vi.mocked(jointPurchaseCallsService.open).mockRejectedValue(axiosError(status, { errorCode }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir convocatoria…' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }));
    expect(await within(dialog()).findByText(text)).toBeTruthy();
    expect(within(dialog()).queryByText(errorCode)).toBeNull();
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(1);
  });

  it('abrir con 409 INVALID_TRANSITION y status: dice el estado actual en español', async () => {
    vi.mocked(jointPurchaseCallsService.open).mockRejectedValue(axiosError(409, { errorCode: 'INVALID_TRANSITION', status: 'CANCELLED' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir convocatoria…' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Abrir convocatoria' }));
    expect(await within(dialog()).findByText(/cambió de estado mientras tanto.*Estado actual: Cancelada\./)).toBeTruthy();
  });

  it('cancelar exige motivo y confirmación; envía el motivo', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convocatoria…' }));
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
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convocatoria…' }));
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
    expect((await within(dialog()).findByRole('checkbox', { name: /Urea/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.update).toHaveBeenCalledWith('c-1', {
        name: 'Urea de la siembra',
        deadline_at: new Date('2099-12-01T18:00').toISOString(),
        products: [{ product_ref: 'p-3' }],
        source_proposal_id: null,
      }),
    );
  });

  it('abierta: cerrar pide confirmación con lo que implica y llama al servidor', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN).mockResolvedValue(CLOSED);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar y consolidar…' }));
    expect(within(dialog()).getByTestId('close-implication').textContent).toBe(CLOSE_IMPLICATION);
    const submit = within(dialog()).getByRole('button', { name: 'Cerrar convocatoria' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.close).toHaveBeenCalledWith('c-1'));
    expect(await screen.findByTestId('closing-panel')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir convocatoria…' })).toBeNull();
  });

  // Reescrita por E4 (decisión del autor del 2026-11-13): antes la Directiva sin permiso no veía ningún total en vivo
  // (RESPONSIBLE_ONLY). Ahora ve el total provisional según la regla T y el recuento de pendientes; sigue sin nombres.
  it('abierta, Directiva: no pide participantes; total provisional visible o pendiente con su recuento, sin un 0 ni nombres', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN);
    render();
    expect((await screen.findByTestId('participants-forbidden')).textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(screen.queryByText('Agricultora sintética')).toBeNull();
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/3 personas.*9,5 L/);
    const urea = screen.getByTestId('call-product-p-3');
    expect(within(urea).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(urea.textContent).not.toMatch(/\b0 KG\b|50 KG/);
    expect(urea.textContent).toMatch(/1 persona/);
    expect(screen.getByTestId('pending-consent-count').textContent).toMatch(/^1 participación no autoriza que la Administración vea su nombre/);
    expect(screen.getByTestId('products-note').textContent).toBe('Total provisional: puede cambiar hasta el cierre');
    expect(screen.getByTestId('participants-count').textContent).toMatch(/4 personas/);
  });

  // Reescrita por E4: el 403 ya no se debe a un permiso de la convocatoria sino a que la cuenta dejó de ser de la
  // Administración habilitada. Se borran nombres y cantidades por persona; los totales por producto no son datos
  // identificados y siguen la regla T (igual para los dos roles en vivo), así que se conservan hasta la próxima respuesta.
  it('abierta, Administración con 403 PARTICIPANTS_FORBIDDEN: el acceso se perdió entre el detalle y la lista (E4 §6.4), sin nombres', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ADMIN);
    vi.mocked(jointPurchaseCallsService.participants).mockRejectedValue(axiosError(403, { errorCode: 'PARTICIPANTS_FORBIDDEN' }));
    render();
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.participants).toHaveBeenCalledWith('c-1');
    expect(screen.queryByText('Agricultora sintética')).toBeNull();
    expect(screen.queryAllByTestId('participant-row')).toHaveLength(0);
  });

  it('abierta, Administración: totales y lista provisional con el aviso del servidor, nombre, producto, cantidad, estado y hora; nunca el correo', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ADMIN);
    render();
    const panel = await screen.findByTestId('participants-panel');
    await within(panel).findAllByText('Agricultora sintética');
    // Rediseño v2 (lámina 11): el número de personas va bajo el nombre y el total a la derecha.
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/3 personas.*9,5 L/);
    expect(screen.getByTestId('call-product-p-3').textContent).toMatch(/1 persona.*50 KG/);
    expect(screen.queryByTestId('hidden-total')).toBeNull();
    expect(within(panel).getByRole('heading', { name: 'Quién pidió' })).toBeTruthy();
    expect(within(panel).getByTestId('provisional-note').textContent).toBe(PARTICIPANTS.notice);
    expect(within(panel).getByText(WHY_VISIBLE_TEXT)).toBeTruthy();
    expect(within(panel).queryByTestId('pending-consent-notice')).toBeNull();
    const rows = within(panel).getAllByTestId('participant-row').map((row) => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/Agricultora sintética.*Glifosato 48 SL.*2,5 L.*Vigente/);
    expect(rows[1]).toMatch(/Urea.*50 KG/);
    expect(rows[2]).toMatch(/Agricultor sintético.*Glifosato 48 SL.*7 L/);
    expect(document.body.textContent).not.toContain('@');
    expect(document.body.innerHTML).not.toMatch(/example\.test|70000000/);
  });

  // Reescrita por E4: el producto con menos de 3 personas ya no sale «Oculto por umbral»; sale pendiente de
  // autorización (regla T), y el visible lleva la nota de la regla anterior (PREVIOUS_POLICY_K3).
  it('cerrada, Directiva: «Consolidado al cierre» fijado, con corte, modo, personas, regla anterior y pendientes; sin detalle por persona', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(CLOSED);
    render();
    const panel = await screen.findByTestId('closing-panel');
    await within(panel).findByTestId('closing-cutoff');
    expect(within(panel).getByRole('heading', { name: 'Consolidado al cierre' })).toBeTruthy();
    expect(within(panel).getByTestId('closing-fixed').textContent).toMatch(/Fijado al cierre/);
    // Rediseño v2 (lámina 12): modo de cierre y personas van en la cabecera, con el resto de los datos clave.
    expect(screen.getByTestId('closing-mode').textContent).toMatch(/Manual/);
    expect(screen.getByTestId('closing-participants').textContent).toMatch(/4 personas/);
    const glifosato = within(panel).getByTestId('closing-line-p-1');
    expect(glifosato.textContent).toMatch(/9,5 L/);
    expect(within(glifosato).getByTestId('total-basis-note').textContent).toBe(PREVIOUS_POLICY_TOTAL_NOTE);
    expect(within(panel).getByTestId('closing-label').textContent).toBe(CLOSING.label);
    const urea = within(panel).getByTestId('closing-line-p-3');
    expect(within(urea).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(urea.textContent).not.toMatch(/\b0 KG\b/);
    expect(within(panel).getByTestId('pending-consent-count').textContent).toMatch(/^2 participaciones no autorizan que la Administración vea su nombre/);
    expect(within(panel).getByText('Cantidad solicitada (total)')).toBeTruthy();
    expect(within(panel).getByTestId('closing-detail-hidden')).toBeTruthy();
    expect(within(panel).queryByText('Agricultora sintética')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(within(panel).getByTestId('not-a-purchase').textContent).toBe(NOT_A_PURCHASE_TEXT);
    // Sólo la frase que lo niega explícitamente menciona compras, entregas o deudas.
    const text = (document.body.textContent ?? '').split(NOT_A_PURCHASE_TEXT).join(' ');
    expect(text).not.toMatch(FORBIDDEN_WORDS);
    expect(document.body.textContent).not.toMatch(/umbral/i);
    expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar convocatoria…' })).toBeNull();
  });

  it('cerrada, Administración: detalle por participante congelado, sin correo', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED, can_view_participants: true, is_responsible: true });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING,
      mode: 'AUTOMATIC',
      closed_by: null,
      can_view_participants: true,
      participants: CLOSING_PARTICIPANTS,
      pending_consent_count: 0,
      pending_consent_notice: null,
    });
    render();
    const panel = await screen.findByTestId('closing-panel');
    expect(await within(panel).findAllByText('Agricultora sintética')).toBeTruthy();
    expect(screen.getByTestId('closing-mode').textContent).toMatch(/Automático/);
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

  describe('origen de la convocatoria (E3-P2)', () => {
    const ORIGIN: JointPurchaseCallOrigin = {
      kind: 'PROPOSAL',
      proposal_ref: 'pr-1',
      proposal_generated_at: '2026-11-10T14:30:00.000Z',
      proposal_fingerprint: 'a'.repeat(64),
      selection_revision: 2,
      selection_matched: true,
      recorded_at: '2026-11-11T10:00:00.000Z',
      recorded_by: RESPONSIBLE,
      products: [
        { position: 0, product_ref: 'p-1', product_name: 'Glifosato 48 SL', base_unit: 'ML', proposal_position: 0 },
        { position: 1, product_ref: 'p-3', product_name: 'Urea', base_unit: 'G', proposal_position: 1 },
      ],
    };
    // Rediseño v2: fecha con hora de 24 h, como en el resto del detalle; «borrador de compra» es el nombre del menú.
    const draftDate = fmtWhen(ORIGIN.proposal_generated_at, 'always');
    const originText = async () => (await screen.findByTestId('call-origin')).textContent;

    it('desde el borrador con la selección guardada: fecha del borrador y n.º de la selección', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...DRAFT, origin: ORIGIN, origin_differs_from_current: false });
      render();
      expect(await originText()).toBe(`Creada desde el borrador de compra del ${draftDate} (selección guardada n.º 2).`);
      expect(within(screen.getByTestId('call-facts')).getByText('Origen:')).toBeTruthy();
      expect(screen.queryByTestId('call-origin-edited')).toBeNull();
      // Ni la huella ni el identificador del borrador se muestran.
      expect(screen.getByTestId('call-facts').textContent).not.toMatch(/aaaa|pr-1/);
    });

    it('desde el borrador con productos distintos de la selección guardada', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
        ...DRAFT,
        origin: { ...ORIGIN, selection_matched: false },
        origin_differs_from_current: false,
      });
      render();
      expect(await originText()).toBe(
        `Creada desde el borrador de compra del ${draftDate}, con productos distintos de la selección guardada (n.º 2).`,
      );
    });

    it('desde el borrador sin selección guardada: no inventa un número', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
        ...DRAFT,
        origin: { ...ORIGIN, selection_revision: null, selection_matched: null },
        origin_differs_from_current: false,
      });
      render();
      expect(await originText()).toBe(`Creada desde el borrador de compra del ${draftDate}.`);
    });

    it('desde el catálogo', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
        ...DRAFT,
        source_proposal_ref: null,
        origin: {
          ...ORIGIN,
          kind: 'CATALOG',
          proposal_ref: null,
          proposal_generated_at: null,
          proposal_fingerprint: null,
          selection_revision: null,
          selection_matched: null,
          products: ORIGIN.products.map((p) => ({ ...p, proposal_position: null })),
        },
        origin_differs_from_current: false,
      });
      render();
      expect(await originText()).toBe('Creada eligiendo productos del catálogo.');
    });

    it('convocatoria anterior al registro: «Origen no registrado», sin deducirlo', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...DRAFT, origin: null, origin_differs_from_current: false });
      render();
      expect(await originText()).toBe('Origen no registrado (convocatoria anterior).');
      expect(screen.queryByTestId('call-origin-edited')).toBeNull();
    });

    it('productos editados después de crearla: lo dice y nombra los del origen', async () => {
      vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
        ...DRAFT,
        products: [DRAFT.products[0]!],
        origin: ORIGIN,
        origin_differs_from_current: true,
      });
      render();
      expect((await screen.findByTestId('call-origin-edited')).textContent).toBe(
        'Los productos se editaron después de crearla; origen: Glifosato 48 SL, Urea.',
      );
    });

    it('si el servidor no envía el origen, no muestra la línea', async () => {
      render();
      expect(await screen.findByTestId('call-facts')).toBeTruthy();
      expect(screen.queryByTestId('call-origin')).toBeNull();
    });
  });
});

/// ------------------------------------------------------------------ E4: acceso por rol, MANAGE y sustitución

/** Quien consulta en las pruebas es `u-1` («Usuario sintético», `renderAt`). */
const ME = { user_ref: 'u-1', name: 'Usuario sintético' };
const ELIGIBLE = [
  { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA' },
  { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
  { user_ref: 'u-4', name: 'Colaboradora sintética', role: 'DIRECTIVA' },
];
const NO_GRANTS = { can_manage: false, can_cancel_or_close: false, my_grants: [] } as const;

/** Abierta, vista por una persona de la Administración (u-1) sin `MANAGE`. */
const OPEN_ADMIN_VIEWER: JointPurchaseCallDetail = { ...OPEN_ADMIN, ...NO_GRANTS, my_grants: [] };
/** La misma persona tras perder el rol de Administración (pasa a Directiva o se deshabilita). */
const OPEN_ROLE_LOST: JointPurchaseCallDetail = { ...OPEN, ...NO_GRANTS, my_grants: [] };

/** Ni nombres ni cantidades por persona de `PARTICIPANTS` (2,5 L y 7 L). */
function expectNoIdentifiedData() {
  const text = document.body.textContent ?? '';
  expect(text).not.toMatch(/Agricultora sintética|Agricultor sintético/);
  expect(text).not.toMatch(/2,5 L|\b7 L/);
  expect(screen.queryAllByTestId('participant-row')).toHaveLength(0);
}

async function participantsShown() {
  const panel = await screen.findByTestId('participants-panel');
  await within(panel).findAllByText('Agricultora sintética');
  return panel;
}

describe('Compras conjuntas: gestión por rol y consentimiento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ADMIN_VIEWER);
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(NO_COLLABORATORS);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue(ELIGIBLE);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['ADMINISTRADOR', 'DIRECTIVA'] as const)('permite a %s actuar con un responsable legado deshabilitado', async (role) => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...DRAFT,
      is_responsible: false,
      can_manage: true,
      can_cancel_or_close: true,
      responsible: { ...DRAFT.responsible, eligible: false },
      my_grants: [],
      can_substitute_responsible: true,
    });
    render(role);
    for (const name of ['Editar', 'Abrir convocatoria…', 'Cancelar convocatoria…']) {
      expect(await screen.findByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByTestId('responsible-ineligible')).toBeNull();
    expect(screen.queryByTestId('substitute-open')).toBeNull();
    expect(jointPurchaseCallsService.collaborators).not.toHaveBeenCalled();
  });

  it('403 MANAGE_FORBIDDEN al cerrar: cierra el diálogo, lo explica y recarga con los permisos actuales', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN).mockResolvedValue({ ...OPEN, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.close).mockRejectedValue(axiosError(403, { errorCode: 'MANAGE_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar y consolidar…' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar convocatoria' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe('Su cuenta ya no tiene acceso para gestionar esta convocatoria.');
    expect(anyDialog()).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull());
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('manage-note').textContent).toBe(MANAGE_ONLY_TEXT);
  });

  it('403 MANAGE_FORBIDDEN al guardar el borrador: cierra el formulario, lo explica y recarga', async () => {
    const draft: JointPurchaseCallDetail = { ...DRAFT, source_proposal_ref: null, products: [{ ...DRAFT.products[1]!, position: 0, reference: null }] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(draft).mockResolvedValue({ ...draft, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.update).mockRejectedValue(axiosError(403, { errorCode: 'MANAGE_FORBIDDEN' }));
    vi.mocked(collectiveService.catalog).mockResolvedValue([{ product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true }]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await within(dialog()).findByRole('checkbox', { name: /Urea/ });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe('Su cuenta ya no tiene acceso para gestionar esta convocatoria.');
    expect(anyDialog()).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull());
  });

  // Reescrita por E4: la lista vigente sólo tiene `MANAGE`; los permisos de visualización salen plegados como historia.
  it('conserva la actividad institucional en el detalle', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN);
    render();
    expect(await screen.findByText(/Borrador creado/)).toBeTruthy();
    expect(screen.queryByText(/Sus permisos|Quién más puede administrarla/)).toBeNull();
  });

  it('Administración con participaciones anteriores: aviso claro del servidor, sin nombres de esas personas, y total pendiente', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_ADMIN_VIEWER, pending_consent_count: 1, products: OPEN.products });
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue({
      ...PARTICIPANTS,
      participant_count: 3,
      pending_consent_count: 1,
      pending_consent_notice: '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.',
    });
    render();
    const panel = await participantsShown();
    expect(within(panel).getByTestId('pending-consent-notice').textContent).toBe(
      '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.',
    );
    expect(within(panel).getByText(/Revisar quién puede ver mi participación/)).toBeTruthy();
    expect(within(screen.getByTestId('call-product-p-3')).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
  });

  it('Administración sin pendientes: sin aviso de autorizaciones', async () => {
    render();
    await participantsShown();
    expect(screen.queryByTestId('pending-consent-notice')).toBeNull();
    expect(screen.queryByTestId('pending-consent-count')).toBeNull();
  });

  it('la responsable que es Directiva no ve nombres aunque sea la responsable (E4 §9.1)', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, is_responsible: true, responsible: { ...ME, role: 'DIRECTIVA', eligible: true, version: 1 } });
    render();
    expect((await screen.findByTestId('participants-forbidden')).textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expectNoIdentifiedData();
  });

  // Reescrita por E4: el detalle del consolidado de la Administración sólo trae las participaciones con la autorización
  // nueva; las demás son un recuento. La Administración puede ver pendiente un total que la Directiva ve por la regla anterior.
  it('cerrada, Administración: detalle sólo de quienes autorizaron, aviso de las demás y total pendiente aunque la Directiva lo vea', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...CLOSED,
      can_view_participants: true,
      ...NO_GRANTS,
      my_grants: [],
      products: [{ ...CLOSED.products[0]!, totals: { participant_count: 3, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null } }, CLOSED.products[1]!],
    });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING,
      can_view_participants: true,
      participants: [CLOSING_PARTICIPANTS[1]!],
      lines: [{ ...CLOSING.lines[0]!, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null }, CLOSING.lines[1]!],
    });
    render();
    const panel = await screen.findByTestId('closing-panel');
    expect(await within(panel).findByText('Agricultor sintético')).toBeTruthy();
    expect(within(panel).queryByText('Agricultora sintética')).toBeNull();
    expect(within(panel).getByTestId('pending-consent-notice').textContent).toBe(PENDING_NOTICE_2);
    expect(within(within(panel).getByTestId('closing-line-p-1')).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(within(panel).getByTestId('closing-line-p-1').textContent).not.toMatch(/9,5 L/);
  });

  it('cerrada, Directiva: aunque el consolidado trajera nombres por error, no se muestran (sólo con can_view_participants)', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...CLOSED, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({ ...CLOSING, participants: CLOSING_PARTICIPANTS });
    render();
    const panel = await screen.findByTestId('closing-panel');
    await within(panel).findByTestId('closing-cutoff');
    expect(within(panel).getByTestId('closing-detail-hidden')).toBeTruthy();
    expectNoIdentifiedData();
  });

  // Reescrita por E4: lo que se pierde es el rol de Administración (o la habilitación), no un permiso de la convocatoria.
  it('Administración que deja de serlo, detectado al recuperar el foco: borra nombres y cantidades y lo dice con el texto exacto', async () => {
    render();
    await participantsShown();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ROLE_LOST);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect((await screen.findByTestId('participants-revoked')).textContent).toBe(PARTICIPANTS_REVOKED_TEXT);
    expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2);
    expectNoIdentifiedData();
    expect(screen.queryByTestId('participants-forbidden')).toBeNull();
  });

  it('cierre O5: si al recuperar el foco cambia can_view_participants de la misma convocatoria, revalida la sesión una vez', async () => {
    render();
    await participantsShown();
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2));
    expect(requestSessionRevalidation).not.toHaveBeenCalled();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ROLE_LOST);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await screen.findByTestId('participants-revoked');
    expect(requestSessionRevalidation).toHaveBeenCalledTimes(1);
  });

  // Reescrita por E4: el permiso que cambia la lista de colaboradores es ahora «Administrar».
  it('403 PARTICIPANTS_FORBIDDEN al volver a la pestaña: borra nombres y cantidades por persona del DOM', async () => {
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
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_ROLE_LOST);
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

  it('cerrada: perder el rol al recuperar el foco borra el detalle por persona del consolidado', async () => {
    const closedAdmin: JointPurchaseCallDetail = { ...CLOSED, can_view_participants: true, ...NO_GRANTS, my_grants: [] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(closedAdmin).mockResolvedValue({ ...CLOSED, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.closing)
      .mockResolvedValueOnce({ ...CLOSING, can_view_participants: true, participants: CLOSING_PARTICIPANTS })
      .mockResolvedValue(CLOSING);
    render();
    await within(await screen.findByTestId('closing-panel')).findAllByText('Agricultora sintética');
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
      resolveFirst(OPEN_ADMIN_VIEWER);
    });
    expect(screen.queryByText('Herbicidas de la siembra')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it('abrir: el diálogo dice quién verá qué (Directiva totales; Administración nombres con autorización)', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DRAFT);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir convocatoria…' }));
    expect(within(dialog()).getByTestId('open-access-line').textContent).toBe(OPEN_ACCESS_LINE);
    expect(dialog().textContent).not.toMatch(/como responsable, verá/);
  });
});
