import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_RULES,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PENDING_CONSENT_TOTAL_TEXT,
  PREVIOUS_POLICY_TOTAL_NOTE,
  RESPONSIBLE_INELIGIBLE_WHO,
  WHY_VISIBLE_TEXT,
} from '../lib/joint-purchase-call-text';
import { campaignsService } from '../services/campaigns.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type {
  JointPurchaseCallClosing,
  JointPurchaseCallCollaborators,
  JointPurchaseCallDetail,
  JointPurchaseCallParticipants,
} from '../types/joint-purchase-calls';
import { JointPurchaseCallDetailPage } from './joint-purchase-call-detail.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    get: vi.fn(),
    participants: vi.fn(),
    closing: vi.fn(),
    collaborators: vi.fn(),
    eligibleResponsibles: vi.fn(),
    substituteResponsible: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    reviewDelegation: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({ collectiveService: {} }));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/*
 * E4 (acceso por rol y totales sin umbral), con las formas de
 * `docs/architecture/E4_EJEMPLOS_RESPUESTAS.md` §2 copiadas como fixtures
 * (identificadores, nombres y cantidades sintéticos del documento). Quien
 * consulta en `renderAt` es `u-1`; el rol lo dice cada respuesta del servidor.
 */
const CAMPAIGN_ROW = { ...CAMPAIGN, id: 'c-0001', name: 'Campaña sintética 2026' };
const D1 = { user_ref: 'u-dir-1', name: 'Directiva sintética D1' };

/** §2.1: detalle de la Directiva, `OPEN` (la responsable es ella misma). */
const DETAIL_DIRECTIVA_OPEN: JointPurchaseCallDetail = {
  contractVersion: 2,
  call_id: '6f1d6e3a-0000-4000-8000-000000000001',
  name: 'Compra conjunta sintética',
  status: 'OPEN',
  campaign: { campaign_ref: 'c-0001', name: 'Campaña sintética 2026', status: 'ABIERTA' },
  deadline_at: '2026-11-20T23:00:00.000Z',
  opened_at: '2026-11-13T15:00:00.000Z',
  closed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-11-13T14:00:00.000Z',
  updated_at: '2026-11-13T15:00:00.000Z',
  server_time: '2026-11-13T16:00:00.000Z',
  responsible: { user_ref: 'u-dir-1', name: 'Directiva sintética D1', role: 'DIRECTIVA', eligible: true, version: 1 },
  created_by: D1,
  opened_by: D1,
  cancelled_by: null,
  source_proposal_ref: null,
  participant_count: 3,
  totals_source: 'LIVE',
  can_view_participants: false,
  is_responsible: true,
  can_manage: true,
  can_cancel_or_close: true,
  delegations_suspended: false,
  my_grants: ['MANAGE'],
  collaborator_count: 0,
  can_substitute_responsible: false,
  pending_delegation_reviews: 0,
  pending_consent_count: 1,
  responsible_changes: [],
  products: [
    {
      position: 0, product_ref: 'p-0001', name: 'Producto sintético P1', unit: 'L', base_unit: 'ML',
      is_active: true, reference: null,
      totals: { participant_count: 2, total_quantity_base: '45000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
    {
      position: 1, product_ref: 'p-0002', name: 'Producto sintético P2', unit: 'KG', base_unit: 'G',
      is_active: true, reference: null,
      totals: { participant_count: 2, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
    },
  ],
  origin: null,
  origin_differs_from_current: false,
  history: [
    { at: '2026-11-13T14:00:00.000Z', kind: 'CREATED', actor: D1, detail: 'Borrador creado.' },
    { at: '2026-11-13T14:00:00.001Z', kind: 'RESPONSIBLE_ASSIGNED', actor: D1, detail: 'Responsable asignado: Directiva sintética D1.' },
    { at: '2026-11-13T15:00:00.000Z', kind: 'OPENED', actor: D1, detail: 'Convocatoria abierta.' },
  ],
};

/** §2.2: lo mismo visto por la Administración. */
const DETAIL_ADMIN_OPEN: JointPurchaseCallDetail = {
  ...DETAIL_DIRECTIVA_OPEN,
  can_view_participants: true,
  is_responsible: false,
  can_manage: false,
  can_cancel_or_close: false,
  my_grants: [],
  can_substitute_responsible: false,
  pending_consent_count: 1,
};

/** §2.5: `/participants` de la Administración. */
const PARTICIPANTS_ADMIN: JointPurchaseCallParticipants = {
  contractVersion: 2,
  call_id: '6f1d6e3a-0000-4000-8000-000000000001',
  status: 'OPEN',
  provisional: true,
  notice: 'Lista provisional: puede cambiar hasta el cierre',
  participant_count: 3,
  pending_consent_count: 1,
  pending_consent_notice: '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.',
  participants: [
    {
      participation_ref: '7a2b0000-0000-4000-8000-000000000011',
      name: 'Agricultor sintético F1',
      status: 'ACTIVE',
      accepted_at: '2026-11-13T15:10:00.000Z',
      lines: [
        { product_ref: 'p-0001', product_name: 'Producto sintético P1', base_unit: 'ML', quantity_base: '20000' },
        { product_ref: 'p-0002', product_name: 'Producto sintético P2', base_unit: 'G', quantity_base: '5000' },
      ],
    },
    {
      participation_ref: '7a2b0000-0000-4000-8000-000000000012',
      name: 'Agricultor sintético F2',
      status: 'ACTIVE',
      accepted_at: '2026-11-13T15:20:00.000Z',
      lines: [{ product_ref: 'p-0001', product_name: 'Producto sintético P1', base_unit: 'ML', quantity_base: '25000' }],
    },
  ],
};

const closedBase = (over: Partial<JointPurchaseCallDetail>): JointPurchaseCallDetail => ({
  ...DETAIL_DIRECTIVA_OPEN,
  status: 'CLOSED',
  closed_at: '2026-11-20T23:00:00.000Z',
  totals_source: 'CLOSING',
  is_responsible: false,
  can_manage: false,
  can_cancel_or_close: false,
  my_grants: [],
  history: [...DETAIL_DIRECTIVA_OPEN.history, { at: '2026-11-20T23:00:00.000Z', kind: 'CLOSED', actor: null, detail: null }],
  ...over,
});

/** §2.3: `CLOSED`, una sola persona, todas cubren los totales (`ROLE_CONSENT`). */
const DETAIL_CLOSED_ONE = closedBase({
  participant_count: 1,
  pending_consent_count: 0,
  products: [
    {
      position: 0, product_ref: 'p-0001', name: 'Producto sintético P1', unit: 'L', base_unit: 'ML',
      is_active: true, reference: null,
      totals: { participant_count: 1, total_quantity_base: '20000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
  ],
});

/** §2.4: `CLOSED` con consolidado anterior, para la Directiva. */
const DETAIL_CLOSED_K3_DIRECTIVA = closedBase({
  can_view_participants: false,
  pending_consent_count: 5,
  products: [
    {
      position: 0, product_ref: 'p-0003', name: 'Producto sintético P3', unit: 'L', base_unit: 'ML',
      is_active: true, reference: null,
      totals: { participant_count: 4, total_quantity_base: '96000', visibility: 'VISIBLE', totals_basis: 'PREVIOUS_POLICY_K3' },
    },
    {
      position: 1, product_ref: 'p-0004', name: 'Producto sintético P4', unit: 'KG', base_unit: 'G',
      is_active: true, reference: null,
      totals: { participant_count: 2, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
    },
  ],
});

/** §2.4: el mismo consolidado para la Administración (P3 queda pendiente: restando vería a las anteriores). */
const DETAIL_CLOSED_K3_ADMIN = closedBase({
  can_view_participants: true,
  pending_consent_count: 5,
  products: [
    { ...DETAIL_CLOSED_K3_DIRECTIVA.products[0]!, totals: { participant_count: 4, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null } },
    DETAIL_CLOSED_K3_DIRECTIVA.products[1]!,
  ],
});

/** §2.7: `/closing` de la Administración. */
const CLOSING_ADMIN: JointPurchaseCallClosing = {
  contractVersion: 2,
  call_id: '6f1d6e3a-0000-4000-8000-000000000002',
  name: 'Compra conjunta sintética cerrada',
  status: 'CLOSED',
  label: 'Consolidado al cierre: cantidades solicitadas',
  mode: 'AUTOMATIC',
  cutoff_at: '2026-11-20T23:00:00.000Z',
  closed_at: '2026-11-20T23:00:05.000Z',
  closed_by: null,
  participant_count: 2,
  can_view_participants: true,
  lines: [
    { product_ref: 'p-0001', product_name: 'Producto sintético P1', unit: 'L', base_unit: 'ML', participant_count: 2, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
  ],
  participants: [
    {
      participation_ref: '7a2b0000-0000-4000-8000-000000000021',
      name: 'Agricultor sintético F1',
      accepted_at: '2026-11-18T10:00:00.000Z',
      lines: [{ product_ref: 'p-0001', product_name: 'Producto sintético P1', base_unit: 'ML', quantity_base: '20000' }],
    },
  ],
  pending_consent_count: 1,
  pending_consent_notice: '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.',
};

/** §2.8: `/closing` de la Directiva: mismo consolidado, sin detalle identificado. */
const CLOSING_DIRECTIVA: JointPurchaseCallClosing = { ...CLOSING_ADMIN, can_view_participants: false, participants: null };

/** §2.9: colaboradores con historia retirada. */
const COLLABORATORS_RETIRED: JointPurchaseCallCollaborators = {
  contractVersion: 2,
  call_id: '6f1d6e3a-0000-4000-8000-000000000001',
  status: 'OPEN',
  responsible: D1,
  can_grant: true,
  can_review: true,
  responsible_version: 1,
  collaborators: [
    {
      user_ref: 'u-dir-2', name: 'Directiva sintética D2', role: 'DIRECTIVA',
      grants: [
        { grant: 'MANAGE', label: 'Administrar la convocatoria', granted_at: '2026-11-13T15:30:00.000Z', granted_by: D1, status: 'IN_FORCE', responsible_version: 1 },
      ],
    },
  ],
  retired_grants: [
    {
      grant: 'PARTICIPANTS', label: 'Consultar participantes y cantidades',
      user: D1,
      granted_at: '2026-11-12T15:00:00.000Z', granted_by: null, responsible_version: 1,
      retired: true, notice: 'Permiso de visualización retirado el 2026-11-13; no da acceso.',
    },
    {
      grant: 'PARTICIPANTS', label: 'Consultar participantes y cantidades',
      user: { user_ref: 'u-adm-1', name: 'Administración sintética A1' },
      granted_at: '2026-11-12T16:00:00.000Z', granted_by: D1, responsible_version: 1,
      retired: true, notice: 'Permiso de visualización retirado el 2026-11-13; no da acceso.',
    },
  ],
  history: [
    {
      at: '2026-11-12T16:00:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS',
      user: { user_ref: 'u-adm-1', name: 'Administración sintética A1' }, actor: D1,
      retired: true, notice: 'Permiso de visualización retirado el 2026-11-13; no da acceso.',
    },
    {
      at: '2026-11-13T15:30:00.000Z', action: 'GRANTED', grant: 'MANAGE',
      user: { user_ref: 'u-dir-2', name: 'Directiva sintética D2' }, actor: D1,
      retired: false, notice: null,
    },
  ],
};

const EMPTY_COLLABORATORS: JointPurchaseCallCollaborators = { ...COLLABORATORS_RETIRED, can_grant: false, can_review: false, collaborators: [], retired_grants: [], history: [] };

const FARMER_NAMES = /Agricultor sintético F1|Agricultor sintético F2/;
/** Cantidades por persona de §2.5 y §2.7 (20 L, 5 KG y 25 L); los totales sin nombres (45 L, 96 L) sí pueden verse. */
const PER_PERSON = /\b20 L\b|\b5 KG\b|\b25 L\b/;

const render = (role: 'DIRECTIVA' | 'ADMINISTRADOR') =>
  renderAt(<JointPurchaseCallDetailPage />, {
    path: '/colectivo/compras-conjuntas/6f1d6e3a-0000-4000-8000-000000000001',
    routePath: '/colectivo/compras-conjuntas/:id',
    role,
  });

/** Texto, `title`, `aria-*`, `alt`, `placeholder` y `data-*` de toda la página: ninguna identidad de agricultor. */
function expectNoFarmerIdentity() {
  expect(document.body.textContent ?? '').not.toMatch(FARMER_NAMES);
  expect(document.body.textContent ?? '').not.toMatch(PER_PERSON);
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === 'title' || attribute.name === 'alt' || attribute.name === 'placeholder' || attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) {
        expect(attribute.value).not.toMatch(FARMER_NAMES);
        expect(attribute.value).not.toMatch(/7a2b0000/);
      }
    }
  }
  expect(document.title).not.toMatch(FARMER_NAMES);
  expect(screen.queryAllByTestId('participant-row')).toHaveLength(0);
}

describe('E4: detalle de convocatoria por rol (fixtures de E4_EJEMPLOS_RESPUESTAS §2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN_ROW]);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(EMPTY_COLLABORATORS);
    // Si la vista pidiera el detalle identificado sin deber, recibiría nombres: las pruebas de la Directiva lo detectan.
    vi.mocked(jointPurchaseCallsService.participants).mockResolvedValue(PARTICIPANTS_ADMIN);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(CLOSING_DIRECTIVA);
  });

  it('§2.1 Directiva (responsable), abierta: total provisional de P1, P2 pendiente con su recuento, sin pedir ni mostrar nombres', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_DIRECTIVA_OPEN);
    render('DIRECTIVA');
    const p1 = await screen.findByTestId('call-product-p-0001');
    expect(p1.textContent).toMatch(/2 personas.*45 L/);
    expect(within(screen.getByTestId('call-product-p-0002')).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(screen.getByTestId('pending-consent-count').textContent).toMatch(/^1 participación/);
    expect(screen.getByTestId('products-note').textContent).toMatch(/Total provisional/);
    expect(screen.getByTestId('participants-forbidden').textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(screen.getByTestId('participants-count').textContent).toMatch(/Participan 3 personas/);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
    expectNoFarmerIdentity();
  });

  it('§2.2 + §2.5 Administración, abierta: mismos totales y, además, nombres y cantidades autorizados con el aviso claro de pendientes', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_ADMIN_OPEN);
    render('ADMINISTRADOR');
    const panel = await screen.findByTestId('participants-panel');
    await within(panel).findAllByText('Agricultor sintético F1');
    expect(screen.getByTestId('call-product-p-0001').textContent).toMatch(/45 L/);
    expect(within(screen.getByTestId('call-product-p-0002')).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(within(panel).getByText(WHY_VISIBLE_TEXT)).toBeTruthy();
    expect(within(panel).getByTestId('pending-consent-notice').textContent).toBe(PARTICIPANTS_ADMIN.pending_consent_notice);
    expect(within(panel).getAllByTestId('participant-row')).toHaveLength(3);
    expect(within(panel).getByTestId('provisional-note').textContent).toBe('Lista provisional: puede cambiar hasta el cierre');
  });

  it('§2.3 cerrada con una sola persona (ROLE_CONSENT): la Directiva ve el consolidado de 1 persona, sin umbral', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_CLOSED_ONE);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING_DIRECTIVA,
      participant_count: 1,
      pending_consent_count: 0,
      pending_consent_notice: null,
      lines: [{ ...CLOSING_DIRECTIVA.lines[0]!, participant_count: 1, total_quantity_base: '20000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' }],
    });
    render('DIRECTIVA');
    const line = await screen.findByTestId('closing-line-p-0001');
    expect(line.textContent).toMatch(/1 persona.*20 L/);
    expect(within(line).queryByTestId('total-basis-note')).toBeNull();
    expect(screen.getByTestId('closing-fixed').textContent).toMatch(/Fijado al cierre/);
    expect(document.body.textContent).not.toMatch(/umbral|menos de 3|anónim/i);
    expect(screen.queryByTestId('pending-consent-count')).toBeNull();
  });

  it('§2.3 cerrada con dos personas que autorizan: el total se muestra', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_CLOSED_ONE);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING_DIRECTIVA,
      pending_consent_count: 0,
      pending_consent_notice: null,
      lines: [{ ...CLOSING_DIRECTIVA.lines[0]!, participant_count: 2, total_quantity_base: '45000', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' }],
    });
    render('DIRECTIVA');
    expect((await screen.findByTestId('closing-line-p-0001')).textContent).toMatch(/2 personas.*45 L/);
  });

  it('§2.4 + §2.8 Directiva: P3 visible por la regla anterior (rotulada), P4 pendiente con el recuento, sin detalle identificado', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_CLOSED_K3_DIRECTIVA);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING_DIRECTIVA,
      participant_count: 6,
      pending_consent_count: 5,
      pending_consent_notice: null,
      lines: [
        { product_ref: 'p-0003', product_name: 'Producto sintético P3', unit: 'L', base_unit: 'ML', participant_count: 4, total_quantity_base: '96000', visibility: 'VISIBLE', totals_basis: 'PREVIOUS_POLICY_K3' },
        { product_ref: 'p-0004', product_name: 'Producto sintético P4', unit: 'KG', base_unit: 'G', participant_count: 2, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
      ],
    });
    render('DIRECTIVA');
    const p3 = await screen.findByTestId('closing-line-p-0003');
    expect(p3.textContent).toMatch(/4 personas.*96 L/);
    expect(within(p3).getByTestId('total-basis-note').textContent).toBe(PREVIOUS_POLICY_TOTAL_NOTE);
    expect(within(screen.getByTestId('closing-line-p-0004')).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(screen.getByTestId('pending-consent-count').textContent).toMatch(/^5 participaciones/);
    expect(screen.getByTestId('closing-detail-hidden')).toBeTruthy();
    expectNoFarmerIdentity();
  });

  it('§2.4 + §2.7 Administración: P3 pendiente (no la regla anterior), detalle identificado y aviso de pendientes del servidor', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_CLOSED_K3_ADMIN);
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({
      ...CLOSING_ADMIN,
      lines: [
        { product_ref: 'p-0003', product_name: 'Producto sintético P3', unit: 'L', base_unit: 'ML', participant_count: 4, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null },
      ],
    });
    render('ADMINISTRADOR');
    const detail = await screen.findByTestId('closing-detail');
    expect(await within(detail).findByText('Agricultor sintético F1')).toBeTruthy();
    expect(within(detail).getByTestId('pending-consent-notice').textContent).toBe(CLOSING_ADMIN.pending_consent_notice);
    const p3 = screen.getByTestId('closing-line-p-0003');
    expect(within(p3).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(p3.textContent).not.toMatch(/96 L/);
    expect(within(p3).queryByTestId('total-basis-note')).toBeNull();
  });

  it('§2.8 Directiva: si el consolidado trajera nombres por error, no se montan en el DOM ni en atributos', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(closedBase({ can_view_participants: false, pending_consent_count: 1, products: [] }));
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue({ ...CLOSING_ADMIN, can_view_participants: true });
    render('DIRECTIVA');
    await screen.findByTestId('closing-cutoff');
    expect(screen.getByTestId('closing-detail-hidden')).toBeTruthy();
    expectNoFarmerIdentity();
  });

  it('responsable no habilitada (§2.2): la Directiva ve a quién pedir la intervención; la Administración, «Sustituir responsable…»', async () => {
    const ineligible = { ...DETAIL_DIRECTIVA_OPEN.responsible, eligible: false };
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...DETAIL_DIRECTIVA_OPEN, is_responsible: false, can_manage: false, can_cancel_or_close: false, my_grants: [], responsible: ineligible, delegations_suspended: true });
    const first = render('DIRECTIVA');
    expect((await screen.findByTestId('responsible-ineligible-who')).textContent?.trim()).toBe(RESPONSIBLE_INELIGIBLE_WHO);
    expect(screen.queryByRole('button', { name: 'Sustituir responsable…' })).toBeNull();
    first.unmount();

    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({ ...DETAIL_ADMIN_OPEN, responsible: ineligible, delegations_suspended: true, can_substitute_responsible: true });
    render('ADMINISTRADOR');
    expect(await screen.findByRole('button', { name: 'Sustituir responsable…' })).toBeTruthy();
    expect(screen.queryByTestId('responsible-ineligible-who')).toBeNull();
  });

  it('§2.9 colaboradores: «Administrar» vigente; los permisos de visualización sólo como historia plegada, sin acciones ni opción de concederlos', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_DIRECTIVA_OPEN);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(COLLABORATORS_RETIRED);
    vi.mocked(jointPurchaseCallsService.eligibleResponsibles).mockResolvedValue([{ user_ref: 'u-adm-1', name: 'Administración sintética A1', role: 'ADMINISTRADOR' }]);
    render('DIRECTIVA');
    const panel = await screen.findByTestId('collaborators-panel');
    expect(await within(panel).findByTestId('collaborator-u-dir-2')).toBeTruthy();
    const retired = within(panel).getByTestId('retired-grants');
    expect((retired as HTMLDetailsElement).open).toBe(false);
    expect(within(retired).getAllByTestId('retired-grant')).toHaveLength(2);
    expect(within(retired).getAllByTestId('retired-grant')[0]!.textContent).toMatch(/concedido por el sistema a la responsable/);
    expect(within(retired).getAllByText('Permiso de visualización retirado el 2026-11-13; no da acceso.')).toHaveLength(2);
    expect(within(retired).queryAllByRole('button')).toHaveLength(0);
    // Ningún control para conceder, retirar o revisar «Consultar participantes».
    expect(screen.queryByRole('button', { name: /Consultar participantes/ })).toBeNull();
    expect(screen.queryByTestId('collaborator-grant-u-adm-1-PARTICIPANTS')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Conceder «Administrar la convocatoria»' }));
    const dialog = await screen.findByTestId('grant-dialog');
    expect(within(dialog).queryAllByRole('radio')).toHaveLength(0);
    expect(dialog.textContent).not.toMatch(/Consultar participantes/);
  });

  it('«Cómo funciona el acceso»: por rol y sin umbral ni textos del modelo anterior', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_DIRECTIVA_OPEN);
    render('DIRECTIVA');
    const rules = await screen.findByTestId('access-rules');
    for (const rule of ACCESS_RULES) expect(rules.textContent).toContain(rule.term);
    expect(rules.textContent).not.toMatch(/umbral|3 o más|Consultar participantes|sin permiso/i);
    await waitFor(() => expect(jointPurchaseCallsService.collaborators).toHaveBeenCalled());
  });

  it('ningún texto del modelo anterior en la página de la Directiva ni de la Administración', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_DIRECTIVA_OPEN);
    const first = render('DIRECTIVA');
    await screen.findByTestId('call-products');
    const retiredTexts = /Oculto por umbral|Lo pidieron menos de|Restringido para su acceso|No disponible mientras esté abierta|Usted no tiene el permiso|Lo concede la responsable|pídalo a la responsable|permiso del sindicato|anónim/i;
    expect(document.body.textContent).not.toMatch(retiredTexts);
    first.unmount();
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(DETAIL_ADMIN_OPEN);
    render('ADMINISTRADOR');
    await within(await screen.findByTestId('participants-panel')).findAllByText('Agricultor sintético F1');
    expect(document.body.textContent).not.toMatch(retiredTexts);
  });
});
