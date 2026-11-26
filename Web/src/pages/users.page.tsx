import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/app-shell';
import {
  DataState,
  type DataStateKind,
  dataStateKindForError,
  FilterChips,
  Notice,
  PageHeader,
  SearchInput,
  surfaceClass,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { normalizeName } from '../lib/product-text';
import { listUsers } from '../services/users.service';
import type { AdminUser, UserRole } from '../types/users';
import { CreateUserDialog, DeactivateDialog, EditUserDialog, PasswordDialog } from './users/user-dialogs';
import { extractError, NUMBER, ROLE_ORDER, ROLE_TAB } from './users/user.constants';
import { UserRow } from './users/user-row';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'password'; user: AdminUser }
  | { kind: 'deactivate'; user: AdminUser };

type RoleFilter = 'ALL' | UserRole;

/**
 * Usuarios (`/users`, sólo ADMINISTRADOR por `AdminRoute`; láminas 31 y 44).
 */
export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: DataStateKind; text: string } | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('ALL');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      const kind = dataStateKindForError(err);
      setLoadError({ kind, text: extractError(err, 'No fue posible cargar los usuarios.') });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  const closeDialog = () => setDialog({ kind: 'none' });
  const handleCreated = (created: AdminUser) => {
    setUsers((prev) => [created, ...prev]);
    setMessage(`Se creó la cuenta de «${created.name}».`);
    closeDialog();
  };
  const handleUpdated = (updated: AdminUser, text: string) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setMessage(text);
    closeDialog();
  };

  const wanted = normalizeName(search);
  const byRole = users.filter((u) => role === 'ALL' || u.role === role);
  const shown = byRole
    .filter((u) => !wanted || normalizeName(u.name).includes(wanted) || u.email.toLowerCase().includes(search.trim().toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.id === currentUser?.id) - Number(a.id === currentUser?.id) ||
        Number(b.isActive) - Number(a.isActive) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    );
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <AppShell title="Usuarios" section="Sindicato">
      <div className="flex flex-col gap-5">
        <PageHeader
          showSynthetic={false}
          attachToHeader
          eyebrowPhoneOnly
          title="Usuarios"
          eyebrow={currentUser?.tenant?.name ? `${currentUser.tenant.name} · solo Administración` : 'Solo Administración'}
          subtitle={
            isLoading || loadError
              ? 'Los agricultores entran por la aplicación móvil, no por la Web.'
              : `${NUMBER.format(activeCount)} ${activeCount === 1 ? 'cuenta activa' : 'cuentas activas'} de ${NUMBER.format(users.length)}. Los agricultores entran por la aplicación móvil, no por la Web.`
          }
          primaryAction={{ label: 'Nuevo usuario', onClick: () => setDialog({ kind: 'create' }) }}
        />
        {message && <Notice kind="ok">{message}</Notice>}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            label="Filtrar por rol"
            testId="role-filter"
            value={role}
            onChange={setRole}
            options={[
              { value: 'ALL', label: 'Todos', count: isLoading || loadError ? undefined : NUMBER.format(users.length) },
              ...(['DIRECTIVA', 'ADMINISTRADOR', 'AGRICULTOR'] as UserRole[]).map((value) => ({
                value,
                label: ROLE_TAB[value],
                count: isLoading || loadError ? undefined : NUMBER.format(users.filter((u) => u.role === value).length),
              })),
            ]}
          />
          <SearchInput
            id="user-search"
            label="Buscar usuario"
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o correo"
            autoComplete="off"
            fieldClassName="w-full lg:w-72"
          />
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 space-y-3" aria-label="Cuentas del sindicato">
            {isLoading ? (
              <div className={surfaceClass}>
                <DataState state="loading" title="Cargando usuarios…" skeletonRows={4} />
              </div>
            ) : loadError ? (
              <div className={surfaceClass}>
                <DataState state={loadError.kind} description={loadError.kind === 'offline' ? undefined : loadError.text} onRetry={loadError.kind === 'forbidden' ? undefined : () => void refresh()} testId="users-error" />
              </div>
            ) : shown.length === 0 ? (
              <div className={surfaceClass}>
                {users.length === 0 ? (
                  <DataState state="empty" title="No hay usuarios registrados" description="Cree la primera cuenta con «Nuevo usuario»." />
                ) : (
                  <DataState
                    state="no-match"
                    description="Ninguna cuenta coincide con el filtro o la búsqueda."
                    onClearFilters={() => {
                      setSearch('');
                      setRole('ALL');
                    }}
                  />
                )}
              </div>
            ) : (
              <>
                <ul className={`${surfaceClass} divide-y divide-line overflow-hidden`} aria-label="Usuarios">
                  {shown.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      isSelf={u.id === currentUser?.id}
                      onEdit={() => setDialog({ kind: 'edit', user: u })}
                      onPassword={() => setDialog({ kind: 'password', user: u })}
                      onDeactivate={() => setDialog({ kind: 'deactivate', user: u })}
                    />
                  ))}
                </ul>
                <p className="text-sm text-ink-muted" data-testid="users-shown">
                  Se muestran {NUMBER.format(shown.length)} de {NUMBER.format(users.length)}.
                </p>
              </>
            )}
          </section>

          <aside className="min-w-0" aria-label="Historial del permiso «Sustituir responsable»">
          </aside>
        </div>
      </div>

      {dialog.kind === 'create' && <CreateUserDialog onCancel={closeDialog} onCreated={handleCreated} />}
      {dialog.kind === 'edit' && (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUser?.id}
          onCancel={closeDialog}
          onUpdated={(updated) => handleUpdated(updated, `Se guardaron los cambios de «${updated.name}».`)}
        />
      )}
      {dialog.kind === 'password' && (
        <PasswordDialog
          user={dialog.user}
          onCancel={closeDialog}
          onDone={() => {
            setMessage(`Se cambió la contraseña de «${dialog.user.name}».`);
            closeDialog();
          }}
        />
      )}
      {dialog.kind === 'deactivate' && (
        <DeactivateDialog user={dialog.user} onCancel={closeDialog} onConfirmed={(updated) => handleUpdated(updated, `«${updated.name}» quedó desactivada. Sus datos no se borran.`)} />
      )}
    </AppShell>
  );
}
