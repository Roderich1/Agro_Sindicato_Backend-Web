import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALL_FOOTNOTE,
  PARTICIPANTS_FORBIDDEN_TEXT,
  PENDING_CONSENT_TOTAL_NOTE,
  PENDING_CONSENT_TOTAL_TEXT,
  RESPONSIBLE_INELIGIBLE_WHO,
  WHAT_NEXT_TEXT,
} from '../lib/joint-purchase-call-text';
import { campaignsService } from '../services/campaigns.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { JointPurchaseCallClosing, JointPurchaseCallCollaborators, JointPurchaseCallDetail } from '../types/joint-purchase-calls';
import { JointPurchaseCallDetailPage } from './joint-purchase-call-detail.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    get: vi.fn(),
    participants: vi.fn(),
    closing: vi.fn(),
    collaborators: vi.fn(),
    revoke: vi.fn(),
    eligibleResponsibles: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({ collectiveService: {} }));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/**
 * Rediseño v2 (sesión B): estados del detalle de las láminas 13, 17, 19 y 20
 * con las formas del servidor (contrato institucional 2, E4). Datos
 * sintéticos. Quien consulta es `u-1`, de la Directiva.
 */
const ME = { user_ref: 'u-1', name: 'Usuario sintético' };
const RESP = { user_ref: 'u-2', name: 'Responsable sintética' };
const BASE: JointPurchaseCallDetail = {
  contractVersion: 2,
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'OPEN',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
  deadline_at: '2026-12-01T22:00:00.000Z',
  opened_at: '2026-11-11T12:00:00.000Z',
  closed_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-11-11T10:00:00.000Z',
  updated_at: '2026-11-11T12:00:00.000Z',
  server_time: '2026-11-11T12:00:00.000Z',
  responsible: { ...RESP, role: 'DIRECTIVA', eligible: true, version: 1 },
  created_by: RESP,
  opened_by: RESP,
  cancelled_by: null,
  source_proposal_ref: null,
  participant_count: 3,
  totals_source: 'LIVE',
  can_view_participants: false,
  is_responsible: false,
  can_manage: false,
  can_cancel_or_close: false,
  delegations_suspended: false,
  can_substitute_responsible: false,
  pending_delegation_reviews: 0,
  pending_consent_count: 0,
  responsible_changes: [],
  my_grants: [],
  collaborator_count: 0,
  products: [
    {
      position: 0,
      product_ref: 'p-1',
      name: 'Glifosato 48 SL',
      unit: 'L',
      base_unit: 'ML',
      is_active: true,
      reference: null,
      totals: { participant_count: 3, total_quantity_base: '9500', visibility: 'VISIBLE', totals_basis: 'ROLE_CONSENT' },
    },
  ],
  history: [
    { at: '2026-11-11T10:00:00.000Z', kind: 'CREATED', actor: RESP, detail: null },
    { at: '2026-11-11T12:00:00.000Z', kind: 'OPENED', actor: RESP, detail: null },
  ],
};
const EMPTY: JointPurchaseCallCollaborators = {
  contractVersion: 2,
  call_id: 'c-1',
  status: 'OPEN',
  responsible: RESP,
  can_grant: false,
  can_review: false,
  responsible_version: 1,
  collaborators: [],
  retired_grants: [],
  history: [],
};

const render = () => renderAt(<JointPurchaseCallDetailPage />, { path: `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`, routePath: '/colectivo/compras-conjuntas/:id' });
const dialog = () => screen.queryByRole('dialog') ?? screen.getByRole('alertdialog');

describe('Detalle de convocatoria: estados del rediseño v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(EMPTY);
  });

  // Reescrita por E4: el permiso que se retira ahora es «Administrar»; los permisos de visualización retirados
  // no se anuncian como pérdida propia. La Directiva ve el total provisional (regla T) y no ve nombres.
  it('17: «Administrar» retirado antes de entrar: aviso con la fecha, «Su acceso» y total provisional; no pide participantes', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(BASE);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue({
      ...EMPTY,
      history: [
        { at: '2026-11-12T08:00:00.000Z', action: 'GRANTED', grant: 'MANAGE', user: ME, actor: RESP, retired: false, notice: null },
        { at: '2026-11-13T13:12:00.000Z', action: 'REVOKED', grant: 'MANAGE', user: ME, actor: RESP, retired: false, notice: null },
      ],
    });
    render();
    const banner = await screen.findByTestId('access-revoked-MANAGE');
    expect(banner.textContent).toMatch(/Su permiso «Administrar la convocatoria» se retiró el .*Ya no puede administrarla/);
    const panel = screen.getByTestId('collaborators-panel');
    expect(within(panel).getByRole('heading', { name: 'Su acceso' })).toBeTruthy();
    expect(within(panel).getByTestId('my-revoked-MANAGE').textContent).toMatch(/Retirado por Responsable sintética el/);
    expect(screen.getByTestId('call-product-p-1').textContent).toMatch(/9,5 L/);
    expect(screen.getByTestId('participants-forbidden').textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  // Reescrita por E4: quien consulta es de la Directiva y no sustituye: ve a quién pedírselo (antes, el texto del
  // permiso «Sustituir responsable», retirado). La renuncia a un «Administrar» suspendido se conserva.
  it('20: responsable no habilitada: la Directiva con «Administrar» suspendido ve a quién pedir la sustitución y puede renunciar con confirmación', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...BASE,
      responsible: { ...RESP, role: 'DIRECTIVA', eligible: false, version: 1 },
      delegations_suspended: true,
    });
    const suspended = {
      ...EMPTY,
      collaborators: [
        { ...ME, role: 'DIRECTIVA', grants: [{ grant: 'MANAGE' as const, label: 'Administrar la convocatoria', granted_at: '2026-11-12T16:26:00.000Z', granted_by: RESP, status: 'SUSPENDED' as const, responsible_version: 1 }] },
      ],
    };
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(suspended);
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue(EMPTY);
    render();
    const panel = await screen.findByTestId('collaborators-panel');
    expect(await within(panel).findByRole('heading', { name: 'Permisos suspendidos · 1' })).toBeTruthy();
    expect(within(panel).getByTestId('grant-status-u-1-MANAGE').textContent).toBe('Suspendido: la responsable no está habilitada.');
    expect(within(panel).queryByTestId('substitution-why')).toBeNull();
    expect(screen.getByTestId('responsible-ineligible-who').textContent?.trim()).toBe(RESPONSIBLE_INELIGIBLE_WHO);
    expect(screen.queryByRole('button', { name: 'Sustituir responsable…' })).toBeNull();
    expect(screen.getByTestId('participants-forbidden').textContent).toBe(PARTICIPANTS_FORBIDDEN_TEXT);
    expect(screen.getByTestId('responsible-ineligible-chip')).toBeTruthy();
    // Ni cerrar ni cancelar por el cargo (N2 rechazada).
    expect(screen.queryByRole('button', { name: 'Cerrar y consolidar…' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Renunciar a este permiso' }));
    const submit = within(dialog()).getByRole('button', { name: 'Renunciar a este permiso' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(submit);
    await waitFor(() => expect(jointPurchaseCallsService.revoke).toHaveBeenCalledWith('c-1', 'u-1', 'MANAGE'));
  });

  it('13: cancelada: motivo destacado, quién canceló y la responsable en la cabecera; «Quién pidió» sin consolidado', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...BASE,
      status: 'CANCELLED',
      cancelled_at: '2026-11-12T16:36:00.000Z',
      cancelled_by: { user_ref: 'u-3', name: 'Administración sintética' },
      cancel_reason: 'Convocatoria de prueba que ya no se usará',
      responsible: { ...RESP, role: 'DIRECTIVA', eligible: false, version: 1 },
    });
    render();
    expect((await screen.findByTestId('cancel-reason')).textContent).toBe('Motivo de la cancelación: Convocatoria de prueba que ya no se usará');
    const facts = screen.getByTestId('call-key-facts').textContent ?? '';
    expect(facts).toMatch(/Cancelada el.*Por.*Administración sintética.*Responsable.*Responsable sintética/);
    // H-11: en una cancelada no se marca «Responsable no habilitada».
    expect(screen.queryByTestId('responsible-ineligible-chip')).toBeNull();
    expect(screen.getByTestId('participants-cancelled')).toBeTruthy();
    expect(screen.getByTestId('call-footnote').textContent).toBe(CALL_FOOTNOTE);
  });

  // Reescrita por E4 (sin umbral): con 2 personas y una autorización anterior el total queda «Pendiente de
  // autorización» (regla T), ya no «Oculto por umbral». Se conservan «Qué sigue», «Sistema» y que no sale un 0.
  it('19: cerrada al vencer el plazo, Directiva: total pendiente de autorización con su motivo, «Qué sigue» y «Sistema» en la actividad', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...BASE,
      status: 'CLOSED',
      closed_at: '2026-11-11T22:30:00.000Z',
      totals_source: 'CLOSING',
      pending_consent_count: 1,
      history: [...BASE.history, { at: '2026-11-11T22:30:00.000Z', kind: 'CLOSED', actor: null, detail: null }],
    });
    const closing: JointPurchaseCallClosing = {
      contractVersion: 2,
      call_id: 'c-1',
      name: BASE.name,
      status: 'CLOSED',
      label: 'Consolidado al cierre',
      mode: 'AUTOMATIC',
      cutoff_at: '2026-11-11T22:30:00.000Z',
      closed_at: '2026-11-11T22:30:00.000Z',
      closed_by: null,
      participant_count: 2,
      can_view_participants: false,
      lines: [{ product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', participant_count: 2, total_quantity_base: null, visibility: 'PENDING_CONSENT', totals_basis: null }],
      participants: null,
      pending_consent_count: 1,
      pending_consent_notice: '1 participación sin la autorización vigente para que la Administración vea su nombre y cantidades: sus datos no se muestran.',
    };
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(closing);
    render();
    const line = await screen.findByTestId('closing-line-p-1');
    expect(within(line).getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(line.textContent).toContain(PENDING_CONSENT_TOTAL_NOTE);
    expect(document.body.textContent).not.toMatch(/umbral|menos de 3/i);
    expect(line.textContent).not.toMatch(/\b0 L\b/);
    expect(screen.getByTestId('closing-mode').textContent).toMatch(/Automático, al vencer el plazo/);
    expect(screen.getByTestId('what-next').textContent).toContain(WHAT_NEXT_TEXT);
    expect(screen.getAllByTestId('call-history-event')[0]!.textContent).toMatch(/Convocatoria cerrada al vencer el plazo.*Sistema/);
    expect(screen.getByTestId('closing-detail-hidden')).toBeTruthy();
    // Sin permisos en la convocatoria cerrada (ni cancelada) no se dibuja «Quién más puede administrarla».
    expect(screen.queryByTestId('collaborators-panel')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });
});
