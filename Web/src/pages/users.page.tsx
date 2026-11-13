import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppShell } from '../components/app-shell';
import { RowLink } from '../components/c/bits';
import { SubstitutionSlot } from '../components/c/substitution-slot';
import { ViewHeader } from '../components/c/view-header';
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  DataState,
  dataStateKindForError,
  Dialog,
  FilterChips,
  Icon,
  ICON,
  Notice,
  SearchInput,
  Select,
  surfaceClass,
  TextInput,
  type DataStateKind,
  type TagTone,
} from '../components/ui';
import { useAuth } from '../hooks/use-auth';
import { offlineMessage } from '../lib/format';
import { normalizeName } from '../lib/product-text';
import { createUser, deactivateUser, listUsers, resetUserPassword, updateUser } from '../services/users.service';
import { ROLE_LABELS, USER_ROLES, type AdminUser, type UserRole } from '../types/users';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'password'; user: AdminUser }
  | { kind: 'deactivate'; user: AdminUser };

type RoleFilter = 'ALL' | UserRole;

const NUMBER = new Intl.NumberFormat('es-BO');
const ROLE_TONE: Record<UserRole, TagTone> = { ADMINISTRADOR: 'dark', DIRECTIVA: 'positive', AGRICULTOR: 'neutral' };
const ROLE_TAB: Record<UserRole, string> = { DIRECTIVA: 'Directiva', ADMINISTRADOR: 'Administración', AGRICULTOR: 'Agricultores' };
const MIN_PASSWORD = 8;

function extractError(err: unknown, fallback: string): string {
  const offline = offlineMessage(err);
  if (offline) return offline;
  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    if (err.response.status === 401) return 'Sesión expirada. Inicie sesión nuevamente.';
    if (err.response.status === 403) return 'No tiene permisos para esta acción.';
    if (err.response.status === 429) return 'Demasiadas solicitudes. Espere un momento.';
  }
  return fallback;
}

/**
 * Usuarios (`/users`, sólo ADMINISTRADOR por `AdminRoute`; láminas 31 y 44,
 * diálogos 33.1–33.3 y 34.6). Cuentas del sindicato con `GET /users`; crear,
 * editar (nombre, rol y «Cuenta activa» = `isActive`), cambiar la contraseña y
 * desactivar con las llamadas de siempre. El correo no se edita: la API no lo
 * admite (H-13). Los filtros por rol, sus recuentos y la búsqueda se hacen en el
 * navegador con la lista ya recibida.
 *
 * A la derecha (abajo en teléfono), el permiso «Sustituir responsable» (U.4):
 * el componente de la sesión B en modo gestión; conceder y retirar dependen de
 * `can_grant`, que decide el servidor.
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
  const shown = byRole.filter((u) => !wanted || normalizeName(u.name).includes(wanted) || u.email.toLowerCase().includes(search.trim().toLowerCase()));
  const activeCount = users.filter((u) => u.isActive).length;
  const filtered = role !== 'ALL' || wanted.length > 0;

  return (
    <AppShell title="Usuarios" section="Sindicato">
      <div className="space-y-5">
        <ViewHeader
          title="Usuarios"
          eyebrow={currentUser?.tenant?.name ? `${currentUser.tenant.name} · solo Administración` : 'Solo Administración'}
          subtitle={
            isLoading || loadError
              ? 'Los agricultores entran por la aplicación móvil, no por la Web.'
              : `${NUMBER.format(activeCount)} ${activeCount === 1 ? 'cuenta activa' : 'cuentas activas'} de ${NUMBER.format(users.length)}. Los agricultores entran por la aplicación móvil, no por la Web.`
          }
          action={{ label: 'Nuevo usuario', onClick: () => setDialog({ kind: 'create' }) }}
        />
        {message && <Notice kind="ok">{message}</Notice>}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="min-w-0 space-y-3" aria-label="Cuentas del sindicato">
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
                {filtered && (
                  <p className="text-sm text-ink-muted" data-testid="users-shown">
                    Se muestran {NUMBER.format(shown.length)} de {NUMBER.format(users.length)}.
                  </p>
                )}
              </>
            )}
          </section>

          <aside className="min-w-0" aria-label="Permiso «Sustituir responsable»">
            <SubstitutionSlot userId={currentUser?.id ?? null} />
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

function UserRow({
  user,
  isSelf,
  onEdit,
  onPassword,
  onDeactivate,
}: {
  user: AdminUser;
  isSelf: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onDeactivate: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6" data-testid={`user-${user.email}`}>
      <Avatar name={user.name} tone={user.isActive ? 'ink' : 'soft'} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold text-ink [overflow-wrap:anywhere]">
          {user.name}
          {isSelf && <span className="font-normal text-ink-muted"> (usted)</span>}
        </p>
        <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
          {user.email}
          {user.role === 'AGRICULTOR' && ' · usa la aplicación móvil'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Chip>
        <span className={`w-16 text-sm font-semibold ${user.isActive ? 'text-link' : 'text-ink-muted'}`} data-testid="user-status">
          {user.isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap gap-1">
        <RowLink onClick={onEdit} aria-label={`Editar a ${user.name}`}>
          Editar
        </RowLink>
        <RowLink onClick={onPassword} aria-label={`Contraseña de ${user.name}`}>
          Contraseña
        </RowLink>
        {user.isActive && !isSelf && (
          <RowLink tone="danger" onClick={onDeactivate} aria-label={`Desactivar a ${user.name}`}>
            Desactivar
          </RowLink>
        )}
      </div>
    </li>
  );
}

/** Lámina 33.1. Rol propuesto: Directiva (la Web es institucional); los agricultores entran por la aplicación móvil. */
function CreateUserDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (user: AdminUser) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('DIRECTIVA');
  const [allowAdmin, setAllowAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD;
  const adminConfirmed = role !== 'ADMINISTRADOR' || allowAdmin;
  const canSubmit = nameValid && emailValid && passwordValid && adminConfirmed && !isSubmitting;
  const dirty = name.length > 0 || email.length > 0 || password.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      onCreated(
        await createUser({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          ...(role === 'ADMINISTRADOR' ? { allowAdministrator: true } : {}),
        }),
      );
    } catch (err) {
      setError(extractError(err, 'No fue posible crear el usuario.'));
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title="Nuevo usuario"
      onClose={onCancel}
      dirty={dirty}
      busy={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="user-create-form" disabled={!canSubmit} busy={isSubmitting}>
            Crear usuario
          </Button>
        </>
      }
    >
      <form id="user-create-form" onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <TextInput id="user-name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} autoComplete="off" error={name.length > 0 && !nameValid ? 'Mínimo 2 caracteres.' : undefined} />
        <TextInput
          id="user-email"
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          autoComplete="off"
          placeholder="nombre@correo.com"
          error={email.length > 0 && !emailValid ? 'Correo no válido.' : undefined}
        />
        <TextInput
          id="user-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          help="Al menos 8 caracteres."
          error={password.length > 0 && !passwordValid ? 'Mínimo 8 caracteres.' : undefined}
        />
        <Select id="user-role" label="Rol" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSubmitting} help="Los agricultores entran por la aplicación móvil.">
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        {role === 'ADMINISTRADOR' && (
          <Checkbox label="Confirmo crear otro usuario con rol Administrador." checked={allowAdmin} onChange={(e) => setAllowAdmin(e.target.checked)} disabled={isSubmitting} />
        )}
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}

/** Lámina 34.6. El correo es de sólo lectura (H-13): `UpdateUserDto` admite nombre, rol y `isActive`. */
function EditUserDialog({ user, isSelf, onCancel, onUpdated }: { user: AdminUser; isSelf: boolean; onCancel: () => void; onUpdated: (user: AdminUser) => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const hasChanges = name.trim() !== user.name || role !== user.role || isActive !== user.isActive;
  const selfDemotion = isSelf && user.role === 'ADMINISTRADOR' && role !== 'ADMINISTRADOR';
  const canSubmit = nameValid && hasChanges && !selfDemotion && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      onUpdated(
        await updateUser(user.id, {
          ...(name.trim() !== user.name ? { name: name.trim() } : {}),
          ...(role !== user.role ? { role } : {}),
          ...(isActive !== user.isActive ? { isActive } : {}),
        }),
      );
    } catch (err) {
      setError(extractError(err, 'No fue posible actualizar el usuario.'));
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title={`Editar a ${user.name}`}
      onClose={onCancel}
      dirty={hasChanges}
      busy={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="user-edit-form" disabled={!canSubmit} busy={isSubmitting}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <form id="user-edit-form" onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <TextInput id="user-edit-name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} autoComplete="off" error={name.length > 0 && !nameValid ? 'Mínimo 2 caracteres.' : undefined} />
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink" id="user-edit-email-label">
            Correo electrónico
          </p>
          <p className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-sunken px-4 py-2.5 text-base text-ink [overflow-wrap:anywhere]" aria-labelledby="user-edit-email-label" data-testid="email-readonly">
            <Icon d={ICON.lock} className="h-4 w-4 shrink-0" />
            {user.email}
          </p>
          <p className="mt-1.5 text-xs text-ink-muted">El correo no se puede cambiar desde la Web.</p>
        </div>
        <Select
          id="user-edit-role"
          label="Rol"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isSubmitting}
          help="Cambiar el rol no concede permisos sobre convocatorias."
          error={selfDemotion ? 'No puede quitarse su propio rol de administrador.' : undefined}
        >
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Checkbox
          label="Cuenta activa"
          description={isSelf ? 'No puede desactivar su propia cuenta.' : 'Una cuenta inactiva no puede ingresar; sus datos se conservan.'}
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={isSubmitting || isSelf}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}

/** Lámina 33.2: nueva contraseña y su repetición (comprobada en el navegador; el servidor valida la longitud). */
function PasswordDialog({ user, onCancel, onDone }: { user: AdminUser; onCancel: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordValid = password.length >= MIN_PASSWORD;
  const matches = password === confirm;
  const canSubmit = passwordValid && matches && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await resetUserPassword(user.id, password);
      onDone();
    } catch (err) {
      setError(extractError(err, 'No fue posible cambiar la contraseña.'));
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title={`Contraseña de ${user.name}`}
      onClose={onCancel}
      dirty={password.length > 0 || confirm.length > 0}
      busy={isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="user-password-form" disabled={!canSubmit} busy={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="user-password-form" onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <TextInput
          id="user-new-password"
          label="Nueva contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          help="Al menos 8 caracteres."
          error={password.length > 0 && !passwordValid ? 'Mínimo 8 caracteres.' : undefined}
        />
        <TextInput
          id="user-repeat-password"
          label="Repetir la contraseña"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isSubmitting}
          autoComplete="new-password"
          error={confirm.length > 0 && !matches ? 'Las contraseñas no coinciden.' : undefined}
        />
        {error && <Notice kind="error">{error}</Notice>}
      </form>
    </Dialog>
  );
}

/** Lámina 33.3. */
function DeactivateDialog({ user, onCancel, onConfirmed }: { user: AdminUser; onCancel: () => void; onConfirmed: (user: AdminUser) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      onConfirmed(await deactivateUser(user.id));
    } catch (err) {
      setError(extractError(err, 'No fue posible desactivar al usuario.'));
      setIsSubmitting(false);
    }
  };

  return (
    <ConfirmDialog tone="danger" title={`Desactivar a ${user.name}`} confirmLabel="Desactivar" busy={isSubmitting} error={error} onConfirm={() => void handleConfirm()} onCancel={onCancel}>
      <p className="text-ink-muted">
        {user.email}. Ya no podrá ingresar. Sus datos no se borran y la cuenta se puede volver a activar desde «Editar».
      </p>
    </ConfirmDialog>
  );
}
