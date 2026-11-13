import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOSE_IMPLICATION,
  fmtWhen,
  GRANT_ACCESS_NOTE,
  MANAGE_LOST_TEXT,
  MANAGE_ONLY_TEXT,
  NOT_A_PURCHASE_TEXT,
  OPEN_ACCESS_LINE,
  OPEN_IMPLICATIONS,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PARTICIPANTS_REVOKED_TEXT,
  PENDING_CONSENT_TOTAL_TEXT,
  PREVIOUS_POLICY_TOTAL_NOTE,
  RESPONSIBLE_INELIGIBLE_TEXT,
  RESPONSIBLE_INELIGIBLE_WHO,
  SELF_SUBSTITUTION_TEXT,
  SUBSTITUTION_NO_CANDIDATES_TEXT,
  SUBSTITUTION_ONLY_SELF_TEXT,
  SUBSTITUTION_WHO_TEXT,
  WHY_VISIBLE_TEXT,
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

const render = () =>
  renderAt(<JointPurchaseCallDetailPage />, {
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
    await waitFor(() => expect((within(dialog()).getByLabelText('Responsable') as HTMLSelectElement).value).toBe('u-2'));
    expect((await within(dialog()).findByRole('checkbox', { name: /Urea/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
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

  /** Borrador del catálogo cuya responsable es quien consulta (u-1). */
  function mineDraft(): JointPurchaseCallDetail {
    return {
      ...DRAFT,
      source_proposal_ref: null,
      products: [{ ...DRAFT.products[1]!, position: 0, reference: null }],
      responsible: { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA', eligible: true, version: 1 },
      is_responsible: true,
      my_grants: [],
    };
  }

  async function openEditor(draft: JointPurchaseCallDetail) {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(draft);
    vi.mocked(jointPurchaseCallsService.update).mockResolvedValue(draft);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([
      { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA' },
      { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
      { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
    ]);
    vi.mocked(collectiveService.catalog).mockResolvedValue([{ product_ref: 'p-3', product_name: 'Urea', unit: 'kg', base_unit: 'G', is_active: true }]);
    vi.mocked(collectiveService.associations).mockResolvedValue({ current: [], history: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    fireEvent.change(within(dialog()).getByLabelText('Fecha y hora límite'), { target: { value: '2099-12-01T18:00' } });
    await waitFor(() => expect((within(dialog()).getByLabelText('Responsable') as HTMLSelectElement).value).toBe(draft.responsible.user_ref));
    await within(dialog()).findByRole('checkbox', { name: /Urea/ });
  }

  it('P-B al editar: la responsable que nombra a otra persona ve el aviso y sólo con «Confirmar» se envía', async () => {
    await openEditor(mineDraft());
    fireEvent.change(within(dialog()).getByLabelText('Responsable'), { target: { value: 'u-2' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    const warning = within(dialog()).getByTestId('handover-warning');
    expect(warning.textContent).toContain('Eligió a Responsable sintética como responsable. Si guarda así, usted deja de administrar esta convocatoria:');
    expect(warning.textContent).toContain('no podrá editar el borrador;');
    expect(jointPurchaseCallsService.update).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.update).toHaveBeenCalledWith('c-1', expect.objectContaining({ responsible_user_id: 'u-2' })),
    );
    expect(jointPurchaseCallsService.update).toHaveBeenCalledTimes(1);
  });

  it('P-B al editar: la responsable que se mantiene no ve ningún aviso', async () => {
    await openEditor(mineDraft());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.update).toHaveBeenCalledWith('c-1', expect.objectContaining({ responsible_user_id: 'u-1' })),
    );
    expect(screen.queryByTestId('handover-warning')).toBeNull();
  });

  it('P-B al editar: quien administra sin ser la responsable (con «Administrar») no ve el aviso aunque elija a otra persona', async () => {
    // DRAFT: responsable u-2; quien consulta (u-1) tiene MANAGE.
    await openEditor({ ...DRAFT, source_proposal_ref: null, products: [{ ...DRAFT.products[1]!, position: 0, reference: null }] });
    fireEvent.change(within(dialog()).getByLabelText('Responsable'), { target: { value: 'u-3' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(jointPurchaseCallsService.update).toHaveBeenCalledWith('c-1', expect.objectContaining({ responsible_user_id: 'u-3' })),
    );
    expect(screen.queryByTestId('handover-warning')).toBeNull();
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
    expect(screen.getByTestId('pending-consent-count').textContent).toMatch(/^1 participación tiene una autorización anterior/);
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
    expect(within(panel).getByTestId('pending-consent-count').textContent).toMatch(/^2 participaciones tienen una autorización anterior/);
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
const COLLABORATOR = { user_ref: 'u-4', name: 'Colaboradora sintética' };
const ELIGIBLE = [
  { user_ref: 'u-1', name: 'Usuario sintético', role: 'DIRECTIVA' },
  { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
  { user_ref: 'u-3', name: 'Administrador sintético', role: 'ADMINISTRADOR' },
  { user_ref: 'u-4', name: 'Colaboradora sintética', role: 'DIRECTIVA' },
];
const NO_GRANTS = { can_manage: false, can_cancel_or_close: false, my_grants: [] } as const;
const RETIRED_NOTICE = 'Permiso de visualización retirado el 2026-11-13; no da acceso.';

/** Abierta, vista por la persona responsable (u-1), que es de la Administración. */
const OPEN_MINE: JointPurchaseCallDetail = {
  ...OPEN_ADMIN,
  is_responsible: true,
  responsible: { ...ME, role: 'ADMINISTRADOR', eligible: true, version: 1 },
  created_by: ME,
};

/** Abierta, vista por una persona de la Administración (u-1) sin `MANAGE`. */
const OPEN_ADMIN_VIEWER: JointPurchaseCallDetail = { ...OPEN_ADMIN, ...NO_GRANTS, my_grants: [] };
/** La misma persona tras perder el rol de Administración (pasa a Directiva o se deshabilita). */
const OPEN_ROLE_LOST: JointPurchaseCallDetail = { ...OPEN, ...NO_GRANTS, my_grants: [] };

const manageGrant = (by: { user_ref: string; name: string }, over: Partial<JointPurchaseCallCollaborators['collaborators'][number]['grants'][number]> = {}) => ({
  grant: 'MANAGE' as const,
  label: 'Administrar la convocatoria',
  granted_at: '2026-11-11T12:30:00.000Z',
  granted_by: by,
  status: 'IN_FORCE' as const,
  responsible_version: 1,
  ...over,
});

/** `MANAGE` de quien consulta (u-1), concedido por la responsable. */
const MY_GRANT_VIEW: JointPurchaseCallCollaborators = {
  ...NO_COLLABORATORS,
  collaborators: [{ ...ME, role: 'DIRECTIVA', grants: [manageGrant(RESPONSIBLE)] }],
  history: [{ at: '2026-11-11T12:30:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: ME, actor: RESPONSIBLE, retired: false, notice: null }],
};

const ADMIN = { user_ref: 'u-3', name: 'Administrador sintético' };
/** Vista de la responsable (u-1): un `MANAGE` vigente y la historia de un permiso de visualización retirado. */
const RESPONSIBLE_VIEW: JointPurchaseCallCollaborators = {
  ...NO_COLLABORATORS,
  responsible: ME,
  can_grant: true,
  collaborators: [{ ...COLLABORATOR, role: 'DIRECTIVA', grants: [manageGrant(ME)] }],
  retired_grants: [
    {
      grant: 'PARTICIPANTS',
      label: 'Consultar participantes y cantidades',
      user: ADMIN,
      granted_at: '2026-11-10T16:00:00.000Z',
      granted_by: ME,
      responsible_version: 1,
      retired: true,
      notice: RETIRED_NOTICE,
    },
  ],
  history: [
    { at: '2026-11-10T16:00:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS', user: ADMIN, actor: ME, retired: true, notice: RETIRED_NOTICE },
    { at: '2026-11-11T12:30:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: COLLABORATOR, actor: ME, retired: false, notice: null },
    { at: '2026-11-11T12:40:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: ADMIN, actor: ME, retired: false, notice: null },
    { at: '2026-11-11T12:50:00.000Z', action: 'REVOKED', grant: 'MANAGE', user: ADMIN, actor: ADMIN, retired: false, notice: null },
  ],
};

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

const mockResponsibleView = () => {
  vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(OPEN_MINE);
  vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS);
  vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(RESPONSIBLE_VIEW);
};

describe('Compras conjuntas: acceso por rol, «Administrar» y sustitución (E4 §2, §3.1 y §6)', () => {
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

  it.each([
    ['borrador', { ...DRAFT, ...NO_GRANTS, my_grants: [] } as JointPurchaseCallDetail],
    ['abierta', { ...OPEN, ...NO_GRANTS, my_grants: [] } as JointPurchaseCallDetail],
  ])('%s sin can_manage: ni Editar, ni Abrir, ni Cerrar, ni Cancelar; se explica quién puede', async (_label, call) => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(call);
    render();
    expect((await screen.findByTestId('manage-note')).textContent).toBe(MANAGE_ONLY_TEXT);
    for (const name of ['Editar', 'Abrir convocatoria…', 'Cerrar y consolidar…', 'Cancelar convocatoria…']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Sus permisos:Ninguno/);
  });

  it('con can_manage (sin ser responsable): Editar, Abrir y Cancelar en el borrador; sin aviso', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DRAFT);
    render();
    for (const name of ['Editar', 'Abrir convocatoria…', 'Cancelar convocatoria…']) expect(await screen.findByRole('button', { name })).toBeTruthy();
    expect(screen.queryByTestId('manage-note')).toBeNull();
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Sus permisos:Administrar la convocatoria/);
  });

  // Reescrita por E4 §6.3: sustituye la Administración habilitada sin permiso adicional (antes, quien tuviera el
  // permiso «Sustituir responsable»). Se conservan motivo, confirmación, prohibición de autosustitución y versión esperada.
  it('responsable no habilitada, Administración: nadie administra por su rol; la Administración la sustituye con motivo y confirmación', async () => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false, version: 1 };
    const successor = { user_ref: 'u-9', name: 'Sucesora sintética' };
    const base: JointPurchaseCallDetail = { ...OPEN_ADMIN, responsible: ineligible, ...NO_GRANTS, my_grants: [], delegations_suspended: true };
    const after: JointPurchaseCallDetail = {
      ...base,
      responsible: { ...successor, role: 'DIRECTIVA', eligible: true, version: 2 },
      delegations_suspended: false,
      responsible_changes: [
        {
          version: 2,
          at: '2026-11-12T15:00:00.000Z',
          previous: RESPONSIBLE,
          next: successor,
          actor: { user_ref: 'u-1', name: 'Administradora sintética' },
          reason: 'La responsable está de viaje',
          call_status: 'OPEN',
          suspended_delegations: 1,
        },
      ],
    };
    vi.mocked(jointPurchaseCallsService.get)
      .mockResolvedValueOnce({ ...base, can_substitute_responsible: true })
      .mockResolvedValue(after);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([
      { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
      { user_ref: 'u-1', name: 'Administradora sintética', role: 'ADMINISTRADOR' },
      { ...successor, role: 'DIRECTIVA' },
    ]);
    vi.mocked(jointPurchaseCallsService.substituteResponsible).mockResolvedValue(after);
    render();
    expect((await screen.findByTestId('responsible-ineligible')).textContent).toBe(RESPONSIBLE_INELIGIBLE_TEXT);
    expect(screen.queryByTestId('responsible-ineligible-who')).toBeNull();
    // Ningún rol cierra ni cancela.
    expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar convocatoria…' })).toBeNull();
    // Rediseño v2 (lámina 20): la responsable va en la cabecera con el chip «Responsable no habilitada».
    expect(screen.getByTestId('hero-responsible').textContent).toMatch(/Responsable sintética/);
    expect(screen.getByTestId('responsible-ineligible-chip').textContent).toBe('Responsable no habilitada');
    fireEvent.click(screen.getByRole('button', { name: 'Sustituir responsable…' }));
    const implications = within(dialog()).getByTestId('substitute-implications').textContent;
    expect(implications).toMatch(/Ser responsable no da acceso a nombres ni cantidades/);
    expect(implications).toMatch(/No pide ninguna autorización nueva a los agricultores/);
    expect(within(dialog()).getByTestId('substitute-who').textContent).toBe(SUBSTITUTION_WHO_TEXT);
    expect(dialog().textContent).not.toMatch(/el permiso del sindicato/);
    const select = (await within(dialog()).findByLabelText('Nueva persona responsable')) as HTMLSelectElement;
    await waitFor(() => expect([...select.options].map((option) => option.value)).toEqual(['', 'u-9']));
    // Decisión del autor: quien sustituye (u-1, elegible) no aparece y se le explica por qué.
    expect(within(dialog()).getByTestId('substitute-self-note').textContent).toBe(SELF_SUBSTITUTION_TEXT);
    const submit = () => within(dialog()).getByRole('button', { name: 'Sustituir responsable' }) as HTMLButtonElement;
    fireEvent.change(select, { target: { value: 'u-9' } });
    fireEvent.click(confirmBox());
    // Sin motivo no se puede confirmar.
    expect(submit().disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: 'La responsable está de viaje' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() =>
      expect(jointPurchaseCallsService.substituteResponsible).toHaveBeenCalledWith('c-1', {
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        expectedVersion: 1,
        newResponsibleRef: 'u-9',
        reason: 'La responsable está de viaje',
      }),
    );
    expect((await screen.findByTestId('responsible-change')).textContent).toMatch(
      /Sucesora sintética sustituyó a Responsable sintética .*Administradora sintética\. Motivo: La responsable está de viaje/,
    );
    expect(screen.queryByTestId('responsible-ineligible')).toBeNull();
  });

  it('responsable no habilitada, Directiva: explicación breve para pedir la intervención de la Administración, sin botón de sustituir', async () => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false, version: 1 };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, responsible: ineligible, ...NO_GRANTS, my_grants: [], delegations_suspended: true });
    render();
    expect((await screen.findByTestId('responsible-ineligible')).textContent).toBe(RESPONSIBLE_INELIGIBLE_TEXT);
    expect(screen.getByTestId('responsible-ineligible-who').textContent?.trim()).toBe(RESPONSIBLE_INELIGIBLE_WHO);
    expect(screen.queryByRole('button', { name: 'Sustituir responsable…' })).toBeNull();
    expect(screen.queryByTestId('substitute-dialog')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it.each([
    ['sólo es elegible quien sustituye', [{ user_ref: 'u-1', name: 'Usuario sintético', role: 'ADMINISTRADOR' }], SUBSTITUTION_ONLY_SELF_TEXT],
    ['no hay nadie elegible', [], SUBSTITUTION_NO_CANDIDATES_TEXT],
  ] as const)('sustitución: si %s, se informa del bloqueo sin salida automática ni forma de enviar', async (_case, eligible, text) => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false, version: 1 };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_ADMIN, responsible: ineligible, ...NO_GRANTS, my_grants: [], can_substitute_responsible: true });
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([
      { user_ref: 'u-2', name: 'Responsable sintética', role: 'DIRECTIVA' },
      ...eligible,
    ]);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Sustituir responsable…' }));
    expect((await within(dialog()).findByTestId('substitute-no-candidates')).textContent).toContain(text);
    expect(within(dialog()).queryByLabelText('Nueva persona responsable')).toBeNull();
    expect(within(dialog()).queryByTestId('substitute-self-note')).toBeNull();
    expect((within(dialog()).getByRole('button', { name: 'Sustituir responsable' }) as HTMLButtonElement).disabled).toBe(true);
    expect(jointPurchaseCallsService.substituteResponsible).not.toHaveBeenCalled();
  });

  it('sustitución: si otra persona sustituyó antes (409 RESPONSIBLE_CHANGED), se explica y se recarga; nunca se reintenta sola', async () => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false, version: 1 };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_ADMIN, responsible: ineligible, ...NO_GRANTS, my_grants: [], can_substitute_responsible: true });
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([{ user_ref: 'u-9', name: 'Sucesora sintética', role: 'DIRECTIVA' }]);
    vi.mocked(jointPurchaseCallsService.substituteResponsible).mockRejectedValue(axiosError(409, { errorCode: 'RESPONSIBLE_CHANGED', responsible_version: 2 }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Sustituir responsable…' }));
    const select = (await within(dialog()).findByLabelText('Nueva persona responsable')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    fireEvent.change(select, { target: { value: 'u-9' } });
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: 'Motivo sintético' } });
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sustituir responsable' }));
    expect((await screen.findByTestId('call-alert')).textContent).toMatch(/Otra persona sustituyó a la responsable mientras tanto/);
    expect(anyDialog()).toBeNull();
    expect(jointPurchaseCallsService.substituteResponsible).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2));
  });

  it('sustitución: 403 SUBSTITUTION_FORBIDDEN (el rol cambió entre tanto) se explica y se recarga', async () => {
    const ineligible = { ...RESPONSIBLE, role: 'DIRECTIVA', eligible: false, version: 1 };
    vi.mocked(jointPurchaseCallsService.get)
      .mockResolvedValueOnce({ ...OPEN_ADMIN, responsible: ineligible, ...NO_GRANTS, my_grants: [], can_substitute_responsible: true })
      .mockResolvedValue({ ...OPEN, responsible: ineligible, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([{ user_ref: 'u-9', name: 'Sucesora sintética', role: 'DIRECTIVA' }]);
    vi.mocked(jointPurchaseCallsService.substituteResponsible).mockRejectedValue(axiosError(403, { errorCode: 'SUBSTITUTION_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Sustituir responsable…' }));
    const select = (await within(dialog()).findByLabelText('Nueva persona responsable')) as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(2));
    fireEvent.change(select, { target: { value: 'u-9' } });
    fireEvent.change(within(dialog()).getByLabelText('Motivo'), { target: { value: 'Motivo sintético' } });
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Sustituir responsable' }));
    expect((await screen.findByTestId('call-alert')).textContent).toMatch(/Sólo una persona de la Administración habilitada puede sustituir/);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sustituir responsable…' })).toBeNull());
    expect(screen.getByTestId('responsible-ineligible-who')).toBeTruthy();
  });

  // Reescrita por E4: la nueva responsable sólo revisa `MANAGE`; los permisos de visualización ya no se revisan.
  it('la nueva responsable revisa cada «Administrar» suspendido (confirmar o retirar) y ve el recuento de pendientes de autorización', async () => {
    const successorView: JointPurchaseCallDetail = {
      ...OPEN,
      is_responsible: true,
      responsible: { ...ME, role: 'DIRECTIVA', eligible: true, version: 2 },
      pending_delegation_reviews: 1,
      responsible_changes: [
        {
          version: 2,
          at: '2026-11-12T15:00:00.000Z',
          previous: { user_ref: 'u-7', name: 'Responsable anterior' },
          next: ME,
          actor: { user_ref: 'u-8', name: 'Administradora' },
          reason: 'Motivo sintético',
          call_status: 'OPEN',
          suspended_delegations: 1,
        },
      ],
    };
    const pendingGrant = manageGrant({ user_ref: 'u-7', name: 'Responsable anterior' }, { granted_at: '2026-11-11T12:00:00.000Z', status: 'PENDING_REVIEW' });
    const collaborators: JointPurchaseCallCollaborators = {
      ...NO_COLLABORATORS,
      can_grant: true,
      can_review: true,
      responsible_version: 2,
      collaborators: [{ user_ref: 'u-5', name: 'Colaboradora sintética', role: 'DIRECTIVA', grants: [pendingGrant] }],
      history: [
        { at: '2026-11-11T12:00:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: { user_ref: 'u-5', name: 'Colaboradora sintética' }, actor: { user_ref: 'u-7', name: 'Responsable anterior' }, retired: false, notice: null },
        { at: '2026-11-12T15:00:00.000Z', action: 'SUSPENDED', grant: 'MANAGE', user: { user_ref: 'u-5', name: 'Colaboradora sintética' }, actor: { user_ref: 'u-8', name: 'Administradora' }, retired: false, notice: null },
      ],
    };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(successorView);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(collaborators);
    vi.mocked(jointPurchaseCallsService.reviewDelegation).mockResolvedValue({
      ...collaborators,
      collaborators: [{ ...collaborators.collaborators[0]!, grants: [{ ...pendingGrant, status: 'IN_FORCE', responsible_version: 2 }] }],
    });
    render();
    expect((await screen.findByTestId('pending-delegation-reviews')).textContent).toMatch(/1 permiso concedido por la responsable anterior espera su revisión/);
    // La responsable que es Directiva no ve nombres (E4 §9.1), pero sí el recuento de pendientes.
    expect(screen.getByTestId('pending-consent-count').textContent).toMatch(/^1 participación/);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('new-responsible')).getByText('Ser responsable no le da acceso a nombres ni cantidades de cada persona.')).toBeTruthy();
    expect((await screen.findByTestId('grant-status-u-5-MANAGE')).textContent).toMatch(/espera la revisión de la actual/);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar «Administrar la convocatoria» de Colaboradora sintética' }));
    expect(within(dialog()).getByTestId('review-implication').textContent).toContain(GRANT_ACCESS_NOTE);
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Confirmar permiso' }));
    await waitFor(() => expect(jointPurchaseCallsService.reviewDelegation).toHaveBeenCalledWith('c-1', 'u-5', 'MANAGE', 'CONFIRM'));
    await waitFor(() => expect(screen.queryByTestId('grant-status-u-5-MANAGE')).toBeNull());
    expect(screen.getByTestId('access-history').textContent).toMatch(/Suspendido al sustituir a la responsable/);
  });

  it('403 MANAGE_FORBIDDEN al cerrar: cierra el diálogo, lo explica y recarga con los permisos actuales', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(OPEN).mockResolvedValue({ ...OPEN, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.close).mockRejectedValue(axiosError(403, { errorCode: 'MANAGE_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar y consolidar…' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cerrar convocatoria' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe(MANAGE_LOST_TEXT);
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
    await waitFor(() => expect((within(dialog()).getByLabelText('Responsable') as HTMLSelectElement).value).toBe('u-2'));
    await within(dialog()).findByRole('checkbox', { name: /Urea/ });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByTestId('call-alert')).textContent).toBe(MANAGE_LOST_TEXT);
    expect(anyDialog()).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull());
  });

  // Reescrita por E4: la lista vigente sólo tiene `MANAGE`; los permisos de visualización salen plegados como historia.
  it('responsable: «Administrar» vigentes, quién y cuándo, historial y permisos de visualización retirados plegados, sin acciones', async () => {
    mockResponsibleView();
    render();
    const panel = await screen.findByTestId('collaborators-panel');
    expect(within(panel).getByRole('heading', { name: 'Quién más puede administrarla' })).toBeTruthy();
    const row = await within(panel).findByTestId('collaborator-u-4');
    expect(row.textContent).toMatch(/Colaboradora sintética.*Directiva.*Administrar la convocatoria.*Usted lo concedió el/);
    expect(within(panel).getByRole('button', { name: 'Conceder «Administrar la convocatoria»' })).toBeTruthy();
    // Historia retirada: plegada, de sólo lectura y con el aviso del servidor.
    const retired = within(panel).getByTestId('retired-grants');
    expect(retired.tagName).toBe('DETAILS');
    expect((retired as HTMLDetailsElement).open).toBe(false);
    expect(within(retired).getByTestId('retired-grant').textContent).toMatch(/«Consultar participantes y cantidades» · Administrador sintético.*concedido por Usuario sintético/);
    expect(within(retired).getByText(RETIRED_NOTICE)).toBeTruthy();
    expect(within(retired).queryAllByRole('button')).toHaveLength(0);
    expect(within(panel).queryByRole('button', { name: /Consultar participantes/ })).toBeNull();
    const events = within(screen.getByTestId('access-history'))
      .getAllByTestId('access-history-event')
      .map((li) => li.textContent);
    expect(events[0]).toMatch(/Concedido.*«Consultar participantes y cantidades» · Administrador sintético.*Permiso de visualización retirado el 2026-11-13; no da acceso\./);
    expect(events[3]).toMatch(/Renuncia.*«Administrar la convocatoria» · Administrador sintético/);
    expect(within(screen.getByTestId('access-history')).getAllByTestId('access-history-retired')).toHaveLength(1);
    expect(screen.getByTestId('call-facts').textContent).toMatch(/Sus permisos:Administrar la convocatoria \(persona responsable\)/);
  });

  // Reescrita por E4: el diálogo ya no ofrece elegir «Consultar participantes»; sólo concede «Administrar».
  it('responsable concede «Administrar»: sólo otros usuarios (ni sí misma ni la responsable), sin elegir otro permiso, y confirma', async () => {
    const granted: JointPurchaseCallCollaborators = {
      ...RESPONSIBLE_VIEW,
      collaborators: [...RESPONSIBLE_VIEW.collaborators, { ...ADMIN, role: 'ADMINISTRADOR', grants: [manageGrant(ME, { granted_at: '2026-11-11T13:00:00.000Z' })] }],
    };
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.grant).mockResolvedValue(granted);
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Conceder «Administrar la convocatoria»' }));
    expect(within(dialog()).queryAllByRole('radio')).toHaveLength(0);
    expect(dialog().textContent).not.toMatch(/Consultar participantes/);
    expect(within(dialog()).getByTestId('grant-description').textContent).toMatch(/No da acceso a participantes ni a cantidades individuales/);
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
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: /Confirmo que concedo «Administrar la convocatoria» a Administrador sintético/ }));
    expect(jointPurchaseCallsService.grant).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.grant).toHaveBeenCalledWith('c-1', 'u-3', 'MANAGE'));
    expect(await screen.findByText('Permiso «Administrar la convocatoria» concedido a Administrador sintético.')).toBeTruthy();
    expect(anyDialog()).toBeNull();
    expect(screen.getByTestId('collaborator-u-3').textContent).toMatch(/Administrar la convocatoria/);
    // El detalle se vuelve a pedir (recuento de colaboradores y permisos propios).
    await waitFor(() => expect(jointPurchaseCallsService.get).toHaveBeenCalledTimes(2));
  });

  it('conceder con 422 COLLABORATOR_NOT_ELIGIBLE: el motivo en español, sin el código, y el diálogo sigue abierto', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.grant).mockRejectedValue(axiosError(422, { errorCode: 'COLLABORATOR_NOT_ELIGIBLE' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Conceder «Administrar la convocatoria»' }));
    const person = (await within(dialog()).findByLabelText('Persona')) as HTMLSelectElement;
    await waitFor(() => expect(within(person).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(person, { target: { value: 'u-4' } });
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Conceder permiso' }));
    expect(await within(dialog()).findByText(/no puede recibir o perder este permiso/)).toBeTruthy();
    expect(within(dialog()).queryByText('COLLABORATOR_NOT_ELIGIBLE')).toBeNull();
    expect(jointPurchaseCallsService.grant).toHaveBeenCalledWith('c-1', 'u-4', 'MANAGE');
  });

  it('409 GRANT_RETIRED (otra pestaña sin actualizar): se explica en español, sin el código', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.grant).mockRejectedValue(axiosError(409, { errorCode: 'GRANT_RETIRED' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Conceder «Administrar la convocatoria»' }));
    const person = (await within(dialog()).findByLabelText('Persona')) as HTMLSelectElement;
    await waitFor(() => expect(within(person).getAllByRole('option').length).toBeGreaterThan(1));
    fireEvent.change(person, { target: { value: 'u-4' } });
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Conceder permiso' }));
    expect(await within(dialog()).findByText(/El permiso para consultar participantes ya no existe/)).toBeTruthy();
    expect(within(dialog()).queryByText('GRANT_RETIRED')).toBeNull();
  });

  it('responsable retira un «Administrar» con confirmación', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue({ ...RESPONSIBLE_VIEW, collaborators: [] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar «Administrar la convocatoria» a Colaboradora sintética' }));
    const submit = within(dialog()).getByRole('button', { name: 'Retirar permiso' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(confirmBox());
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.revoke).toHaveBeenCalledWith('c-1', 'u-4', 'MANAGE'));
    expect(await screen.findByText('Permiso «Administrar la convocatoria» retirado a Colaboradora sintética.')).toBeTruthy();
    expect(await screen.findByTestId('collaborators-empty')).toBeTruthy();
  });

  it('403 COLLABORATORS_FORBIDDEN al retirar: lo explica y recarga', async () => {
    mockResponsibleView();
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValueOnce(RESPONSIBLE_VIEW).mockResolvedValue({ ...RESPONSIBLE_VIEW, can_grant: false });
    vi.mocked(jointPurchaseCallsService.revoke).mockRejectedValue(axiosError(403, { errorCode: 'COLLABORATORS_FORBIDDEN' }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: /^Retirar «Administrar/ }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Retirar permiso' }));
    expect((await screen.findByTestId('call-alert')).textContent).toMatch(/sólo la persona responsable puede hacerlo/);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Conceder «Administrar la convocatoria»' })).toBeNull());
    expect(jointPurchaseCallsService.collaborators).toHaveBeenCalledTimes(2);
  });

  // Reescrita por E4: el colaborador renuncia a «Administrar» (ya no hay permiso de visualización al que renunciar).
  it('colaborador: no concede ni retira; renuncia a su «Administrar» y deja de poder administrarla', async () => {
    const collab: JointPurchaseCallDetail = { ...OPEN, can_manage: true, can_cancel_or_close: true, my_grants: ['MANAGE'] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValueOnce(collab).mockResolvedValue({ ...OPEN, ...NO_GRANTS, my_grants: [] });
    const renounced: JointPurchaseCallCollaborators = {
      ...NO_COLLABORATORS,
      history: [...MY_GRANT_VIEW.history, { at: '2026-11-11T13:00:00.000Z', action: 'REVOKED', grant: 'MANAGE', user: ME, actor: ME, retired: false, notice: null }],
    };
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValueOnce(MY_GRANT_VIEW).mockResolvedValue(renounced);
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue(renounced);
    render();
    const panel = await screen.findByTestId('collaborators-panel');
    expect((await within(panel).findByTestId('collaborator-u-1')).textContent).toMatch(/Usuario sintético \(usted\)/);
    expect(within(panel).queryByRole('button', { name: /^Conceder/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Retirar/ })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Renunciar a este permiso' }));
    fireEvent.click(confirmBox());
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Renunciar a este permiso' }));
    await waitFor(() => expect(jointPurchaseCallsService.revoke).toHaveBeenCalledWith('c-1', 'u-1', 'MANAGE'));
    expect(await screen.findByText('Renunció al permiso «Administrar la convocatoria».')).toBeTruthy();
    expect((await screen.findByTestId('access-revoked-MANAGE')).textContent).toMatch(/Renunció a su permiso «Administrar la convocatoria».*Ya no puede administrarla/);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull());
  });

  it('un permiso de visualización retirado en el historial no se anuncia como «Su permiso se retiró»', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN, ...NO_GRANTS, my_grants: [] });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue({
      ...NO_COLLABORATORS,
      history: [
        { at: '2026-11-10T12:00:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS', user: ME, actor: RESPONSIBLE, retired: true, notice: RETIRED_NOTICE },
        { at: '2026-11-10T13:00:00.000Z', action: 'REVOKED', grant: 'PARTICIPANTS', user: ME, actor: RESPONSIBLE, retired: true, notice: RETIRED_NOTICE },
      ],
    });
    render();
    await screen.findByTestId('collaborators-panel');
    await waitFor(() => expect(jointPurchaseCallsService.collaborators).toHaveBeenCalled());
    expect(screen.queryByTestId('access-revoked-PARTICIPANTS')).toBeNull();
    expect(screen.queryByTestId('my-revoked-PARTICIPANTS')).toBeNull();
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

  // Reescrita por E4: el permiso que cambia la lista de colaboradores es ahora «Administrar».
  it('«Administrar» retirado, detectado al recuperar el foco: la lista de colaboradores se vuelve a pedir y deja de mostrarlo', async () => {
    const collab: JointPurchaseCallDetail = { ...OPEN_ADMIN, can_manage: true, can_cancel_or_close: true, my_grants: ['MANAGE'] };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(collab);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(MY_GRANT_VIEW);
    render();
    await participantsShown();
    const panel = await screen.findByTestId('collaborators-panel');
    expect(await within(panel).findByRole('button', { name: 'Renunciar a este permiso' })).toBeTruthy();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...OPEN_ADMIN_VIEWER, collaborator_count: 0 });
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue({
      ...NO_COLLABORATORS,
      history: [...MY_GRANT_VIEW.history, { at: '2026-11-11T13:00:00.000Z', action: 'REVOKED', grant: 'MANAGE', user: ME, actor: RESPONSIBLE, retired: false, notice: null }],
    });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(jointPurchaseCallsService.collaborators).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByTestId('collaborators-panel')).queryByRole('button', { name: 'Renunciar a este permiso' })).toBeNull());
    expect(within(screen.getByTestId('collaborators-panel')).getByTestId('my-revoked-MANAGE')).toBeTruthy();
  });

  // Reescrita por E4: el 403 borra nombres y cantidades por persona; los totales por producto no son datos
  // identificados (regla T, iguales para los dos roles en vivo) y no se borran.
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
