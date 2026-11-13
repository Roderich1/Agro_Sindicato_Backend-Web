import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CALL_FOOTNOTE, RESPONSIBLE_ONLY_HIDDEN_TEXT, WHAT_NEXT_TEXT } from '../lib/joint-purchase-call-text';
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
 * con las formas del servidor. Datos sintéticos. Quien consulta es `u-1`.
 */
const ME = { user_ref: 'u-1', name: 'Usuario sintético' };
const RESP = { user_ref: 'u-2', name: 'Responsable sintética' };
const BASE: JointPurchaseCallDetail = {
  contractVersion: 1,
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
  totals_threshold: 3,
  can_view_participants: false,
  is_responsible: false,
  can_manage: false,
  can_cancel_or_close: false,
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
      totals: { participant_count: 3, total_quantity_base: null, visibility: 'RESPONSIBLE_ONLY' },
    },
  ],
  history: [
    { at: '2026-11-11T10:00:00.000Z', kind: 'CREATED', actor: RESP, detail: null },
    { at: '2026-11-11T12:00:00.000Z', kind: 'OPENED', actor: RESP, detail: null },
  ],
};
const EMPTY: JointPurchaseCallCollaborators = { contractVersion: 1, call_id: 'c-1', status: 'OPEN', responsible: RESP, can_grant: false, collaborators: [], history: [] };

const render = () => renderAt(<JointPurchaseCallDetailPage />, { path: `/colectivo/compras-conjuntas/c-1?campaign=${CAMPAIGN.id}`, routePath: '/colectivo/compras-conjuntas/:id' });
const dialog = () => screen.queryByRole('dialog') ?? screen.getByRole('alertdialog');

describe('Detalle de convocatoria: estados del rediseño v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(EMPTY);
  });

  it('17: permiso retirado antes de entrar: aviso con la fecha, «Su acceso» y totales «no disponibles para su acceso actual»; no pide participantes', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue(BASE);
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue({
      ...EMPTY,
      history: [
        { at: '2026-11-12T08:00:00.000Z', action: 'GRANTED', grant: 'PARTICIPANTS', user: ME, actor: RESP },
        { at: '2026-11-13T13:12:00.000Z', action: 'REVOKED', grant: 'PARTICIPANTS', user: ME, actor: RESP },
      ],
    });
    render();
    const banner = await screen.findByTestId('access-revoked-PARTICIPANTS');
    expect(banner.textContent).toMatch(/Su permiso «Consultar participantes y cantidades» se retiró el .*Ya no ve nombres ni cantidades/);
    const panel = screen.getByTestId('collaborators-panel');
    expect(within(panel).getByRole('heading', { name: 'Su acceso' })).toBeTruthy();
    expect(within(panel).getByTestId('my-revoked-PARTICIPANTS').textContent).toMatch(/Retirado por Responsable sintética el/);
    expect(within(screen.getByTestId('call-product-p-1')).getByTestId('hidden-total').textContent).toBe(RESPONSIBLE_ONLY_HIDDEN_TEXT);
    expect(screen.getByTestId('participants-panel').textContent).toMatch(/pídalo a la responsable, Responsable sintética/);
    expect(screen.queryByTestId('participants-forbidden')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });

  it('20: responsable no habilitada: quien tiene «Administrar» suspendido puede renunciar (el servidor lo admite) con confirmación', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...BASE,
      responsible: { ...RESP, role: 'DIRECTIVA', eligible: false, version: 1 },
      delegations_suspended: true,
      has_substitution_permission: true,
      can_substitute_responsible: true,
    });
    const suspended = {
      ...EMPTY,
      collaborators: [
        { ...ME, role: 'DIRECTIVA', grants: [{ grant: 'MANAGE' as const, label: 'Administrar la convocatoria', granted_at: '2026-11-12T16:26:00.000Z', granted_by: RESP, status: 'SUSPENDED' as const }] },
      ],
    };
    vi.mocked(jointPurchaseCallsService.collaborators).mockResolvedValue(suspended);
    vi.mocked(jointPurchaseCallsService.revoke).mockResolvedValue(EMPTY);
    render();
    const panel = await screen.findByTestId('collaborators-panel');
    expect(await within(panel).findByRole('heading', { name: 'Permisos suspendidos · 1' })).toBeTruthy();
    expect(within(panel).getByTestId('grant-status-u-1-MANAGE').textContent).toBe('Suspendido: la responsable no está habilitada.');
    expect(within(panel).getByTestId('substitution-why')).toBeTruthy();
    expect(screen.getByTestId('participants-panel').textContent).toMatch(/los permisos de esta convocatoria están suspendidos/);
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
      responsible: { ...RESP, role: 'DIRECTIVA', eligible: false },
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

  it('19: cerrada al vencer el plazo, sin permiso: «Oculto por umbral» con el motivo, «Qué sigue» y «Sistema» en la actividad', async () => {
    vi.mocked(jointPurchaseCallsService.get).mockResolvedValue({
      ...BASE,
      status: 'CLOSED',
      closed_at: '2026-11-11T22:30:00.000Z',
      totals_source: 'CLOSING',
      history: [...BASE.history, { at: '2026-11-11T22:30:00.000Z', kind: 'CLOSED', actor: null, detail: null }],
    });
    const closing: JointPurchaseCallClosing = {
      contractVersion: 1,
      call_id: 'c-1',
      name: BASE.name,
      status: 'CLOSED',
      label: 'Consolidado al cierre',
      mode: 'AUTOMATIC',
      cutoff_at: '2026-11-11T22:30:00.000Z',
      closed_at: '2026-11-11T22:30:00.000Z',
      closed_by: null,
      participant_count: 2,
      totals_threshold: 3,
      can_view_participants: false,
      lines: [{ product_ref: 'p-1', product_name: 'Glifosato 48 SL', unit: 'L', base_unit: 'ML', participant_count: 2, total_quantity_base: null, visibility: 'UNDER_THRESHOLD' }],
      participants: null,
      hidden_participant_count: 0,
      hidden_notice: null,
    };
    vi.mocked(jointPurchaseCallsService.closing).mockResolvedValue(closing);
    render();
    const line = await screen.findByTestId('closing-line-p-1');
    expect(within(line).getByTestId('hidden-total').textContent).toBe('Oculto por umbral');
    expect(line.textContent).toMatch(/Lo pidieron menos de 3 personas/);
    expect(line.textContent).not.toMatch(/\b0 L\b/);
    expect(screen.getByTestId('closing-mode').textContent).toMatch(/Automático, al vencer el plazo/);
    expect(screen.getByTestId('what-next').textContent).toContain(WHAT_NEXT_TEXT);
    expect(screen.getAllByTestId('call-history-event')[0]!.textContent).toMatch(/Convocatoria cerrada al vencer el plazo.*Sistema/);
    expect(screen.getByTestId('closing-detail-hidden')).toBeTruthy();
    // Sin permiso de la convocatoria cerrada (ni cancelada) no se dibuja «Quién más puede verla».
    expect(screen.queryByTestId('collaborators-panel')).toBeNull();
    expect(jointPurchaseCallsService.participants).not.toHaveBeenCalled();
  });
});
