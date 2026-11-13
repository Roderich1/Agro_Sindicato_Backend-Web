import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubstitutionPermissionsPanel } from '../components/b/substitution-permissions';
import { COLLECTIVE_PATHS } from '../lib/navigation';
import { campaignsService } from '../services/campaigns.service';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { JointPurchaseCallSummary, SubstitutionPermissions } from '../types/joint-purchase-calls';
import { JointPurchaseCallsPage } from './joint-purchase-calls.page';

vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: {
    list: vi.fn(),
    eligibleResponsibles: vi.fn(),
    substitutionPermissions: vi.fn(),
    grantSubstitution: vi.fn(),
    revokeSubstitution: vi.fn(),
  },
}));
vi.mock('../services/collective.service', () => ({ collectiveService: {} }));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn(), active: vi.fn() } }));

/** Rediseño v2 (láminas 09 y 37, U.4): secciones, contadores, campaña cerrada y la franja del permiso. Datos sintéticos. */
const ROW: JointPurchaseCallSummary = {
  call_id: 'c-1',
  name: 'Herbicidas de la siembra',
  status: 'OPEN',
  campaign: { campaign_ref: CAMPAIGN.id, name: CAMPAIGN.name },
  deadline_at: '2026-12-01T22:00:00.000Z',
  opened_at: '2026-11-11T12:00:00.000Z',
  closed_at: null,
  cancelled_at: null,
  created_at: '2026-11-11T10:00:00.000Z',
  responsible: { user_ref: 'u-1', name: 'Usuario sintético' },
  product_count: 2,
  participant_count: 4,
};
const ROWS: JointPurchaseCallSummary[] = [
  ROW,
  { ...ROW, call_id: 'c-2', name: 'Fertilizantes', status: 'DRAFT', opened_at: null, participant_count: 0, responsible: { user_ref: 'u-2', name: 'Responsable sintética' } },
  { ...ROW, call_id: 'c-3', name: 'Urea', status: 'CLOSED', closed_at: '2026-11-12T10:00:00.000Z', participant_count: 2, responsible: { user_ref: 'u-2', name: 'Responsable sintética' } },
  { ...ROW, call_id: 'c-4', name: 'Fungicidas', status: 'CANCELLED', cancelled_at: '2026-11-12T11:00:00.000Z', responsible: { user_ref: 'u-3', name: 'Administración sintética' } },
];
const PERMISSIONS: SubstitutionPermissions = {
  contractVersion: 1,
  can_grant: true,
  holds_permission: false,
  holders: [
    { user_ref: 'u-5', name: 'Directiva sintética', role: 'DIRECTIVA', eligible: true, granted_at: '2026-11-11T10:00:00.000Z', granted_by: { user_ref: 'u-1', name: 'Usuario sintético' }, reason: 'Suplencia' },
    { user_ref: 'u-6', name: 'Tesorera sintética', role: 'DIRECTIVA', eligible: true, granted_at: '2026-11-11T10:00:00.000Z', granted_by: { user_ref: 'u-1', name: 'Usuario sintético' }, reason: 'Suplencia' },
  ],
  history: [],
};
const render = () => renderAt(<JointPurchaseCallsPage />, { path: COLLECTIVE_PATHS.jointPurchaseCalls });

describe('Compras conjuntas: lista del rediseño v2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(jointPurchaseCallsService.list).mockResolvedValue(ROWS);
    vi.mocked(jointPurchaseCallsService.substitutionPermissions).mockResolvedValue(PERMISSIONS);
  });

  it('agrupa en abiertas, borradores y terminadas; «Usted es responsable» sólo en las suyas; en terminadas, la responsable (H-11)', async () => {
    render();
    const open = await screen.findByTestId('call-row-c-1');
    expect(within(open).getByText('Usted es responsable')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Abiertas · reciben pedidos' })).getByTestId('call-row-c-1')).toBeTruthy();
    const drafts = screen.getByRole('region', { name: 'Borradores · los agricultores aún no los ven' });
    expect(within(drafts).getByRole('link', { name: 'Revisar y abrir «Fertilizantes»' }).getAttribute('href')).toMatch(/\/colectivo\/compras-conjuntas\/c-2\?campaign=/);
    const finished = screen.getByRole('region', { name: 'Terminadas' });
    expect(within(finished).getByTestId('call-row-c-3').textContent).toMatch(/Cerrada el .*2 participantes · Responsable: Responsable sintética/);
    expect(within(finished).getByTestId('call-row-c-4').textContent).toMatch(/Cancelada el .*sin consolidado · Responsable: Administración sintética/);
    expect(screen.queryByText('Responsable no habilitada')).toBeNull();
    expect(within(screen.getByTestId('call-status-filter')).getByRole('button', { name: 'Todas 4' })).toBeTruthy();
  });

  it.each([
    ['CERRADA', true],
    ['CANCELADA', true],
    ['PLANIFICADA', false],
    ['ABIERTA', false],
  ] as const)('campaña %s: «Nueva convocatoria» desactivada = %s (N1: borradores en planificada o abierta)', async (status, disabled) => {
    vi.mocked(campaignsService.list).mockResolvedValue([{ ...CAMPAIGN, status }]);
    render();
    await screen.findByTestId('call-row-c-1');
    const button = screen.getByRole('button', { name: 'Nueva convocatoria' }) as HTMLButtonElement;
    expect(button.disabled).toBe(disabled);
    if (disabled) expect(screen.getByTestId('calls-create-note').textContent).toMatch(/no admite convocatorias nuevas/);
  });

  it('franja «Sustituir responsable»: cuántas personas lo tienen y, al desplegar, sólo consulta (aunque se pueda conceder, eso se hace en Usuarios)', async () => {
    render();
    const strip = await screen.findByTestId('substitution-strip');
    await waitFor(() => expect(strip.textContent).toMatch(/2 personas pueden nombrar a otra responsable/));
    fireEvent.click(within(strip).getByRole('button', { name: 'Ver quién lo tiene' }));
    expect(await within(strip).findByTestId('substitution-holder-u-5')).toBeTruthy();
    expect(within(strip).queryByTestId('substitution-grant-button')).toBeNull();
    expect(within(strip).queryByRole('button', { name: /^Retirar/ })).toBeNull();
    expect(within(strip).getByRole('link', { name: 'Usuarios' }).getAttribute('href')).toBe('/users');
  });
});

describe('Permiso «Sustituir responsable»: contrato del componente (U.4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('modo gestión con can_grant: conceder y retirar; sin can_grant, sólo consulta aunque el modo sea gestión', async () => {
    vi.mocked(jointPurchaseCallsService.substitutionPermissions).mockResolvedValueOnce(PERMISSIONS);
    const first = renderAt(<SubstitutionPermissionsPanel userId="u-1" mode="manage" tone="ink" />, { role: 'ADMINISTRADOR' });
    expect(await screen.findByTestId('substitution-grant-button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retirar el permiso a Directiva sintética' })).toBeTruthy();
    first.unmount();
    vi.mocked(jointPurchaseCallsService.substitutionPermissions).mockResolvedValueOnce({ ...PERMISSIONS, can_grant: false });
    renderAt(<SubstitutionPermissionsPanel userId="u-1" mode="manage" />, { role: 'DIRECTIVA' });
    await screen.findByTestId('substitution-holder-u-5');
    expect(screen.queryByTestId('substitution-grant-button')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retirar/ })).toBeNull();
  });
});
