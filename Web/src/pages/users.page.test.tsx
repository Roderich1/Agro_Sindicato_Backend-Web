import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from '../components/admin-route';
import { reportDisclosureMode } from '../lib/data-mode';
import { jointPurchaseCallsService } from '../services/joint-purchase-calls.service';
import { createUser, deactivateUser, listUsers, resetUserPassword, updateUser } from '../services/users.service';
import { renderAt } from '../test/render';
import type { AdminUser } from '../types/users';
import { UsersPage } from './users.page';

vi.mock('../services/users.service', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  resetUserPassword: vi.fn(),
  deactivateUser: vi.fn(),
}));
vi.mock('../services/joint-purchase-calls.service', () => ({
  jointPurchaseCallsService: { substitutionPermissionsHistory: vi.fn(), eligibleResponsibles: vi.fn() },
}));

/** Usuarios (láminas 31, 33.1–33.3, 34.6 y 44). Datos sintéticos; `u-1` es la sesión (ver `test/render`). */
function account(id: string, name: string, role: AdminUser['role'], isActive = true): AdminUser {
  return {
    id,
    tenantId: 't-1',
    name,
    email: `${id}@example.test`,
    role,
    isActive,
    lastLoginAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

const USERS = [
  account('u-1', 'Administración sintética', 'ADMINISTRADOR'),
  account('u-2', 'Directiva sintética', 'DIRECTIVA'),
  account('u-3', 'Directiva inactiva sintética', 'DIRECTIVA', false),
  account('u-4', 'Agricultora sintética', 'AGRICULTOR'),
];

const render = () => renderAt(<UsersPage />, { path: '/users', role: 'ADMINISTRADOR' });
const row = (id: string) => screen.getByTestId(`user-${id}@example.test`);
const dialog = () => screen.getByRole('dialog');
/** Las confirmaciones destructivas son `alertdialog`. */
const alert = () => screen.getByRole('alertdialog');

describe('Usuarios (Administración)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listUsers).mockResolvedValue(USERS);
    vi.mocked(jointPurchaseCallsService.substitutionPermissionsHistory).mockResolvedValue({
      contractVersion: 2,
      retired_at: '2026-11-13T18:00:00.000Z',
      notice: 'Ya no se usa: sustituye la Administración habilitada',
      can_grant: false,
      holders: [],
      history: [],
    });
  });

  it('lista las cuentas con «(usted)», rol y estado; recuentos por rol y búsqueda en el navegador', async () => {
    render();
    await screen.findByTestId('user-u-1@example.test');
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/3 cuentas activas de 4\./)).toBeTruthy();
    // D12 (lámina 31): «Se muestran N de M» también sin filtro; sin paginación, N = M.
    expect(screen.getByTestId('users-shown').textContent).toBe('Se muestran 4 de 4.');
    expect(row('u-1').textContent).toContain('Administración sintética (usted)');
    expect(within(row('u-3')).getByTestId('user-status').textContent).toBe('Inactiva');
    const filter = screen.getByRole('group', { name: 'Filtrar por rol' });
    expect(within(filter).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos 4', 'Directiva 2', 'Administración 1', 'Agricultores 1']);
    fireEvent.click(within(filter).getByRole('button', { name: /^Directiva/ }));
    expect(screen.queryByTestId('user-u-1@example.test')).toBeNull();
    expect(screen.getByTestId('users-shown').textContent).toBe('Se muestran 2 de 4.');
    fireEvent.change(screen.getByLabelText('Buscar usuario'), { target: { value: 'INACTIVA' } });
    expect(screen.getAllByRole('listitem').filter((li) => li.dataset.testid?.startsWith('user-'))).toHaveLength(1);
    // Reescrito por E4 §3.2: en lugar del panel de gestión del permiso «Sustituir responsable» (U.4), su historia
    // plegada y de sólo lectura; no se pide al servidor hasta desplegarla y no tiene controles.
    const history = screen.getByTestId('substitution-history');
    expect(history.tagName).toBe('DETAILS');
    expect((history as HTMLDetailsElement).open).toBe(false);
    expect(screen.queryByTestId('substitution-permissions')).toBeNull();
    expect(screen.queryByTestId('substitution-grant-button')).toBeNull();
    expect(within(history).queryAllByRole('button')).toHaveLength(0);
    expect(jointPurchaseCallsService.substitutionPermissionsHistory).not.toHaveBeenCalled();
    (history as HTMLDetailsElement).open = true;
    fireEvent(history, new Event('toggle'));
    await waitFor(() => expect(jointPurchaseCallsService.substitutionPermissionsHistory).toHaveBeenCalledTimes(1));
    expect(await within(history).findByTestId('substitution-holders-empty')).toBeTruthy();
    expect(within(history).queryAllByRole('button')).toHaveLength(0);
  });

  it('nadie se desactiva a sí mismo ni se quita el rol de administrador', async () => {
    render();
    await screen.findByTestId('user-u-1@example.test');
    expect(within(row('u-1')).queryByRole('button', { name: /^Desactivar/ })).toBeNull();
    expect(within(row('u-3')).queryByRole('button', { name: /^Desactivar/ })).toBeNull();
    fireEvent.click(within(row('u-1')).getByRole('button', { name: /^Editar/ }));
    expect((within(dialog()).getByRole('checkbox', { name: 'Cuenta activa' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Rol'), { target: { value: 'DIRECTIVA' } });
    expect(within(dialog()).getByText('No puede quitarse su propio rol de administrador.')).toBeTruthy();
    expect((within(dialog()).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('nuevo usuario: rol propuesto Directiva, validaciones y confirmación para Administrador', async () => {
    vi.mocked(createUser).mockResolvedValue(account('u-9', 'Nueva sintética', 'ADMINISTRADOR'));
    render();
    await screen.findByTestId('user-u-1@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }));
    const create = within(dialog()).getByRole('button', { name: 'Crear usuario' }) as HTMLButtonElement;
    expect((within(dialog()).getByLabelText('Rol') as HTMLSelectElement).value).toBe('DIRECTIVA');
    fireEvent.change(within(dialog()).getByLabelText('Nombre'), { target: { value: 'Nueva sintética' } });
    fireEvent.change(within(dialog()).getByLabelText('Correo electrónico'), { target: { value: 'nueva@example.test' } });
    fireEvent.change(within(dialog()).getByLabelText('Contraseña'), { target: { value: 'corta' } });
    expect(within(dialog()).getByText('Mínimo 8 caracteres.')).toBeTruthy();
    expect(create.disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Contraseña'), { target: { value: 'una-clave-larga' } });
    expect(create.disabled).toBe(false);
    fireEvent.change(within(dialog()).getByLabelText('Rol'), { target: { value: 'ADMINISTRADOR' } });
    expect(create.disabled).toBe(true);
    fireEvent.click(within(dialog()).getByRole('checkbox'));
    fireEvent.click(create);
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith({ name: 'Nueva sintética', email: 'nueva@example.test', password: 'una-clave-larga', role: 'ADMINISTRADOR', allowAdministrator: true }),
    );
    expect(await screen.findByText('Se creó la cuenta de «Nueva sintética».')).toBeTruthy();
  });

  it('editar: el correo es de sólo lectura (H-13) y sólo se envía lo que cambió', async () => {
    vi.mocked(updateUser).mockResolvedValue({ ...USERS[1]!, isActive: false });
    render();
    await screen.findByTestId('user-u-2@example.test');
    fireEvent.click(within(row('u-2')).getByRole('button', { name: /^Editar/ }));
    expect(within(dialog()).getByTestId('email-readonly').textContent).toBe('u-2@example.test');
    expect(within(dialog()).queryByRole('textbox', { name: 'Correo electrónico' })).toBeNull();
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Cuenta activa' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('u-2', { isActive: false }));
    expect(await screen.findByText('Se guardaron los cambios de «Directiva sintética».')).toBeTruthy();
  });

  it('contraseña: se repite en el navegador antes de enviarla', async () => {
    vi.mocked(resetUserPassword).mockResolvedValue(undefined);
    render();
    await screen.findByTestId('user-u-2@example.test');
    fireEvent.click(within(row('u-2')).getByRole('button', { name: /^Contraseña/ }));
    expect(dialog().textContent).toContain('Contraseña de Directiva sintética');
    const save = within(dialog()).getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    fireEvent.change(within(dialog()).getByLabelText('Nueva contraseña'), { target: { value: 'clave-sintetica-1' } });
    fireEvent.change(within(dialog()).getByLabelText('Repetir la contraseña'), { target: { value: 'clave-sintetica-2' } });
    expect(within(dialog()).getByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog()).getByLabelText('Repetir la contraseña'), { target: { value: 'clave-sintetica-1' } });
    fireEvent.click(save);
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u-2', 'clave-sintetica-1'));
    expect(await screen.findByText('Se cambió la contraseña de «Directiva sintética».')).toBeTruthy();
  });

  it('desactivar pide confirmación y no envía nada al volver', async () => {
    vi.mocked(deactivateUser).mockResolvedValue({ ...USERS[3]!, isActive: false });
    render();
    await screen.findByTestId('user-u-4@example.test');
    fireEvent.click(within(row('u-4')).getByRole('button', { name: /^Desactivar/ }));
    expect(alert().textContent).toMatch(/Ya no podrá ingresar\. Sus datos no se borran/);
    fireEvent.click(within(alert()).getByRole('button', { name: 'Volver' }));
    expect(deactivateUser).not.toHaveBeenCalled();
    fireEvent.click(within(row('u-4')).getByRole('button', { name: /^Desactivar/ }));
    fireEvent.click(within(alert()).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(deactivateUser).toHaveBeenCalledWith('u-4'));
    expect(await screen.findByText(/«Agricultora sintética» quedó desactivada/)).toBeTruthy();
    expect(within(row('u-4')).getByTestId('user-status').textContent).toBe('Inactiva');
  });

  it('sin conexión: estado propio con «Reintentar», sin filas residuales', async () => {
    vi.mocked(listUsers).mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
    render();
    const error = await screen.findByTestId('users-error');
    expect(error.getAttribute('data-state')).toBe('offline');
    expect(screen.queryByTestId('user-u-1@example.test')).toBeNull();
    fireEvent.click(within(error).getByRole('button', { name: 'Reintentar' }));
    await screen.findByTestId('user-u-1@example.test');
  });

  it('H-03 (V-2): «Datos sintéticos» no aparece en Usuarios aunque el modo provisional esté activo', async () => {
    reportDisclosureMode('PROVISIONAL_SYNTHETIC');
    try {
      render();
      await screen.findByTestId('user-u-1@example.test');
      expect(screen.queryByTestId('synthetic-badge')).toBeNull();
      expect(screen.queryByText('Datos sintéticos')).toBeNull();
    } finally {
      reportDisclosureMode(null);
    }
  });

  it('la Directiva no entra en Usuarios ni se piden las cuentas (AdminRoute)', () => {
    renderAt(
      <AdminRoute>
        <UsersPage />
      </AdminRoute>,
      { path: '/users', role: 'DIRECTIVA', routes: [{ path: '/colectivo/resumen', element: <p>resumen</p> }] },
    );
    expect(screen.queryByRole('heading', { name: 'Usuarios' })).toBeNull();
    expect(listUsers).not.toHaveBeenCalled();
  });
});
