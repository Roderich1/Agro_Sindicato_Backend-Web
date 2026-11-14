import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportDisclosureMode } from '../lib/data-mode';
import { auditLogsService } from '../services/audit-logs.service';
import { campaignsService } from '../services/campaigns.service';
import { listUsers } from '../services/users.service';
import { CAMPAIGN, renderAt } from '../test/render';
import type { AuditLog } from '../types/audit-logs';
import type { AdminUser } from '../types/users';
import { AuditLogsPage } from './audit-logs.page';

vi.mock('../services/audit-logs.service', () => ({ auditLogsService: { list: vi.fn() } }));
vi.mock('../services/campaigns.service', () => ({ campaignsService: { list: vi.fn() } }));
vi.mock('../services/users.service', () => ({ listUsers: vi.fn() }));

/** Bitácora (láminas 32, 33.4 y 42). Datos sintéticos con la forma de `GET /audit-logs`. */
function log(id: string, createdAt: string, overrides: Partial<AuditLog>): AuditLog {
  return {
    id,
    campaignId: CAMPAIGN.id,
    campaign: { id: CAMPAIGN.id, name: CAMPAIGN.name, status: 'ABIERTA' },
    ownerUserId: null,
    owner: null,
    actorUserId: 'u-2',
    actor: { id: 'u-2', name: 'Directiva sintética', email: 'd@example.test' },
    action: 'OTRO',
    entityName: 'JointPurchaseCall',
    entityId: `e-${id}`,
    summary: null,
    before: null,
    after: null,
    metadata: null,
    createdAt,
    ...overrides,
  };
}

const LOGS: AuditLog[] = [
  log('a', '2026-11-12T16:43:00.000Z', {
    entityName: 'ProductIdentificationRequest',
    campaignId: null,
    campaign: null,
    summary: 'Solicitud de identificación de producto dejada pendiente con una nota.',
    metadata: { productRef: null, reason: 'Falta confirmar el ingrediente activo' },
  }),
  log('b', '2026-11-12T16:26:00.000Z', { summary: 'Permiso «Consultar participantes» concedido en la convocatoria «X».', metadata: { grant: 'PARTICIPANTS', collaboratorUserRef: 'u-3' } }),
  log('c', '2026-11-12T16:20:00.000Z', { summary: 'Convocatoria de compra conjunta «X» abierta.', metadata: {} }),
  log('d', '2026-11-11T16:30:00.000Z', {
    summary: 'Convocatoria de compra conjunta «X» cerrada automáticamente al vencer la fecha límite.',
    actorUserId: null,
    actor: null,
    metadata: { mode: 'AUTOMATIC' },
  }),
  log('e', '2026-11-01T14:00:00.000Z', { entityName: 'AgriculturalCampaign', action: 'ABRIR_CAMPANA', summary: 'Campana abierta: Campaña sintética' }),
];

const USERS = [
  { id: 'u-2', name: 'Directiva sintética', isActive: true },
  { id: 'u-5', name: 'Directiva retirada sintética', isActive: false },
] as AdminUser[];

const render = () => renderAt(<AuditLogsPage />, { path: '/audit-logs' });

describe('Bitácora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // «Hoy» = 12 nov 2026 (en UTC y en La Paz, UTC−4); sólo se fija la fecha.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-12T18:00:00.000Z'));
    vi.mocked(auditLogsService.list).mockResolvedValue(LOGS);
    vi.mocked(campaignsService.list).mockResolvedValue([CAMPAIGN]);
    vi.mocked(listUsers).mockResolvedValue(USERS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa por día con lo que el servidor registró; quién y dónde; «Sistema» sin actor', async () => {
    render();
    await screen.findByTestId('audit-a');
    const headings = within(screen.getByTestId('audit-days')).getAllByRole('heading').map((h) => h.textContent);
    expect(headings[0]).toMatch(/^Hoy · /);
    expect(headings[1]).toMatch(/^Ayer · /);
    expect(headings).toHaveLength(3);
    expect(screen.getByTestId('audit-a').textContent).toContain('Directiva sintética · Catálogo');
    expect(screen.getByTestId('audit-c').textContent).toContain(`Directiva sintética · ${CAMPAIGN.name}`);
    expect(screen.getByTestId('audit-d').textContent).toContain(`Sistema · ${CAMPAIGN.name}`);
    // H-08: sólo las filas del servidor.
    expect(screen.getAllByRole('listitem').filter((li) => li.dataset.testid?.startsWith('audit-'))).toHaveLength(LOGS.length);
    expect(screen.getByTestId('audit-limit').textContent).toMatch(/últimas 300 acciones/);
  });

  it('tipo de acción en el navegador: un permiso dentro de una convocatoria cuenta como «Permisos»', async () => {
    render();
    await screen.findByTestId('audit-a');
    expect(screen.getByTestId('audit-b').dataset.category).toBe('permisos');
    expect(screen.getByTestId('audit-c').dataset.category).toBe('convocatorias');
    const chips = screen.getByRole('group', { name: 'Tipo de acción' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas 5', 'Convocatorias 2', 'Permisos 1', 'Catálogo 1', 'Campañas 1']);
    fireEvent.click(within(chips).getByRole('button', { name: /^Permisos/ }));
    expect(screen.getByTestId('audit-b')).toBeTruthy();
    expect(screen.queryByTestId('audit-c')).toBeNull();
    // Filtrar por tipo no vuelve a pedir datos.
    expect(auditLogsService.list).toHaveBeenCalledTimes(1);
  });

  it('campaña y persona (con las inactivas) van al servidor', async () => {
    render();
    await screen.findByTestId('audit-a');
    const people = screen.getByLabelText('Persona') as HTMLSelectElement;
    await waitFor(() => expect(people.options.length).toBe(3));
    expect([...people.options].map((o) => o.textContent)).toEqual(['Todas las personas', 'Directiva sintética', 'Directiva retirada sintética (inactiva)']);
    fireEvent.change(people, { target: { value: 'u-5' } });
    await waitFor(() => expect(auditLogsService.list).toHaveBeenLastCalledWith({ campaignId: undefined, actorUserId: 'u-5', from: undefined, to: undefined }));
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: CAMPAIGN.id } });
    await waitFor(() => expect(auditLogsService.list).toHaveBeenLastCalledWith({ campaignId: CAMPAIGN.id, actorUserId: 'u-5', from: undefined, to: undefined }));
  });

  it('«Qué pasó»: acción, cuándo, quién, dónde y la nota; los datos técnicos plegados', async () => {
    render();
    fireEvent.click(within(await screen.findByTestId('audit-a')).getByRole('button', { name: /^Detalle/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Qué pasó' })).toBeTruthy();
    expect(dialog.textContent).toContain('QuiénDirectiva sintética');
    expect(dialog.textContent).toContain('DóndeCatálogo');
    expect(dialog.textContent).toContain('NotaFalta confirmar el ingrediente activo');
    expect(within(dialog).getByTestId('audit-technical').tagName).toBe('DETAILS');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('H-03 (V-2): «Datos sintéticos» no aparece en la Bitácora aunque el modo provisional esté activo', async () => {
    reportDisclosureMode('PROVISIONAL_SYNTHETIC');
    try {
      render();
      await screen.findByTestId('audit-a');
      expect(screen.queryByTestId('synthetic-badge')).toBeNull();
      expect(screen.queryByText('Datos sintéticos')).toBeNull();
    } finally {
      reportDisclosureMode(null);
    }
  });

  it('sin conexión: estado propio con «Reintentar»', async () => {
    vi.mocked(auditLogsService.list).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    render();
    const error = await screen.findByTestId('audit-error');
    expect(error.getAttribute('data-state')).toBe('offline');
    fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('audit-a');
  });
});
