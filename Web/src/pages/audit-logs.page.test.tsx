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
    actor: { id: 'u-2', name: 'Directiva sintética', role: 'DIRECTIVA' },
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

  it('D-01: cambios de cuentas, de nombres y del catálogo con su texto en español, nunca el código crudo', async () => {
    vi.mocked(auditLogsService.list).mockResolvedValue([
      log('u1', '2026-11-12T17:00:00.000Z', {
        entityName: 'User',
        campaignId: null,
        campaign: null,
        action: 'ACTUALIZAR',
        summary: 'Rol de la cuenta de «Cuenta sintética» cambiado de Agricultor a Directiva.',
        before: { role: 'AGRICULTOR' },
        after: { role: 'DIRECTIVA' },
        metadata: { event: 'USER_ROLE_CHANGED' },
      }),
      log('u2', '2026-11-12T16:59:00.000Z', {
        entityName: 'User',
        campaignId: null,
        campaign: null,
        summary: 'Contraseña de la cuenta de «Cuenta sintética» restablecida.',
        metadata: { event: 'USER_PASSWORD_RESET' },
      }),
      log('p1', '2026-11-12T16:58:00.000Z', {
        entityName: 'ProductCanonicalAssociation',
        campaignId: null,
        campaign: null,
        action: 'CREAR',
        summary: 'Nombre «Belator» unido con «Belator 20 SC».',
        metadata: { event: 'PRODUCT_ALIAS_ASSOCIATED', productRef: 'p-1', reason: 'misma fórmula' },
      }),
      log('p2', '2026-11-12T16:57:00.000Z', {
        entityName: 'Product',
        campaignId: null,
        campaign: null,
        action: 'INACTIVAR',
        summary: 'Producto «Herbicida sintético» inactivado en el catálogo.',
        metadata: { event: 'PRODUCT_DEACTIVATED' },
      }),
      log('x1', '2026-11-12T16:56:00.000Z', { summary: 'Acción con un código desconocido.', metadata: { event: 'CODIGO_DESCONOCIDO' } }),
    ]);
    render();
    await screen.findByTestId('audit-u1');
    expect(screen.getByTestId('audit-u1').dataset.category).toBe('cuentas');
    expect(screen.getByTestId('audit-p1').dataset.category).toBe('catalogo');
    expect(screen.getByTestId('audit-p2').dataset.category).toBe('catalogo');
    expect(screen.getByTestId('audit-u1').textContent).toContain('Directiva sintética · Cuentas');
    const chips = screen.getByRole('group', { name: 'Tipo de acción' });
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas 5', 'Convocatorias 1', 'Catálogo 2', 'Cuentas 2']);
    for (const li of screen.getAllByRole('listitem').filter((item) => item.dataset.testid?.startsWith('audit-'))) {
      expect(li.textContent).not.toMatch(/USER_|PRODUCT_|CODIGO_/);
    }

    const expected: [string, string][] = [
      ['audit-u1', 'TipoCambio de rol'],
      ['audit-u2', 'TipoContraseña restablecida'],
      ['audit-p1', 'TipoNombres unidos'],
      ['audit-p2', 'TipoProducto inactivado'],
    ];
    for (const [row, text] of expected) {
      fireEvent.click(within(screen.getByTestId(row)).getByRole('button', { name: /^Detalle/ }));
      const dialog = screen.getByRole('dialog');
      expect(dialog.textContent).toContain(text);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    }
    fireEvent.click(within(screen.getByTestId('audit-p1')).getByRole('button', { name: /^Detalle/ }));
    expect(screen.getByRole('dialog').textContent).toContain('Notamisma fórmula');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
    // Un código desconocido no añade «Tipo».
    fireEvent.click(within(screen.getByTestId('audit-x1')).getByRole('button', { name: /^Detalle/ }));
    expect(screen.getByRole('dialog').textContent).not.toContain('Tipo');
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
