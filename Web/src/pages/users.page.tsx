import axios from 'axios';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AppShell,
  EmptyState,
  Modal,
  UserAvatar,
  RoleBadge,
  buttonClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  secondaryButtonClass,
  ROLE_COLORS,
} from '../components/app-shell';
import { useAuth } from '../hooks/use-auth';
import {
  createUser,
  deactivateUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from '../services/users.service';
import {
  ROLE_LABELS,
  USER_ROLES,
  type AdminUser,
  type UserRole,
} from '../types/users';

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'password'; user: AdminUser }
  | { kind: 'deactivate'; user: AdminUser };

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response) {
    const data = err.response.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(', ') : data.message;
    }
    if (err.response.status === 401) return 'Sesión expirada. Inicia sesión nuevamente.';
    if (err.response.status === 403) return 'No tienes permisos para esta acción.';
    if (err.response.status === 429) return 'Demasiadas solicitudes. Espera un momento.';
  }
  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setLoadError(extractError(err, 'No fue posible cargar los usuarios.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeDialog = () => setDialog({ kind: 'none' });

  const handleCreated = (created: AdminUser) => {
    setUsers((prev) => [created, ...prev]);
    closeDialog();
  };

  const handleUpdated = (updated: AdminUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    closeDialog();
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const headerActions = (
    <button
      onClick={() => setDialog({ kind: 'create' })}
      className={buttonClass}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Nuevo usuario
    </button>
  );

  return (
    <AppShell title="Administrar usuarios" section="Administración" actions={headerActions}>
      {/* Search & stats */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 max-w-sm">
          <label htmlFor="user-search" className={labelClass}>Buscar</label>
          <div className="input-icon-wrapper">
            <input
              id="user-search"
              className={`${inputClass} pl-10`}
              placeholder="Nombre o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            <span className="input-icon">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>
        </div>
        <div className="flex gap-3 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {users.filter((u) => u.isActive).length} activos
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {users.length} total
          </span>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fade-in">
          <svg className="h-5 w-5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {loadError}
        </div>
      )}

      {isLoading ? (
        <div className="glass-card flex items-center justify-center px-6 py-20 text-emerald-700 animate-fade-in">
          <svg className="mr-3 h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm font-medium">Cargando usuarios…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
            title={search ? 'Sin resultados' : 'No hay usuarios registrados'}
            description={search ? 'Intenta con otros términos de búsqueda.' : 'Crea el primer usuario de la organización.'}
          />
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block table-container">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Usuario</th>
                  <th className="px-5 py-3.5">Rol</th>
                  <th className="px-5 py-3.5">Estado</th>
                  <th className="px-5 py-3.5">Creado</th>
                  <th className="px-5 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="transition hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={u.name} size="sm" gradient={ROLE_COLORS[u.role]} />
                          <div>
                            <p className="font-semibold text-slate-800">
                              {u.name}
                              {isSelf && <span className="ml-1.5 text-[10px] font-medium text-emerald-600">(tú)</span>}
                            </p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                      <td className="px-5 py-3.5">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-soft" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex gap-1.5">
                          <ActionButton label="Editar" onClick={() => setDialog({ kind: 'edit', user: u })} />
                          <ActionButton label="Contraseña" onClick={() => setDialog({ kind: 'password', user: u })} />
                          <ActionButton
                            label="Desactivar"
                            danger
                            disabled={!u.isActive || isSelf}
                            onClick={() => setDialog({ kind: 'deactivate', user: u })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((u) => {
              const isSelf = u.id === currentUser?.id;
              return (
                <div key={u.id} className="glass-card p-4 animate-fade-in">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.name} size="md" gradient={ROLE_COLORS[u.role]} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">
                          {u.name}
                          {isSelf && <span className="ml-1.5 text-[10px] font-medium text-emerald-600">(tú)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RoleBadge role={u.role} />
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <ActionButton label="Editar" onClick={() => setDialog({ kind: 'edit', user: u })} />
                    <ActionButton label="Contraseña" onClick={() => setDialog({ kind: 'password', user: u })} />
                    <ActionButton
                      label="Desactivar"
                      danger
                      disabled={!u.isActive || isSelf}
                      onClick={() => setDialog({ kind: 'deactivate', user: u })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Dialogs */}
      {dialog.kind === 'create' && <CreateUserDialog onCancel={closeDialog} onCreated={handleCreated} />}
      {dialog.kind === 'edit' && (
        <EditUserDialog user={dialog.user} isSelf={dialog.user.id === currentUser?.id} onCancel={closeDialog} onUpdated={handleUpdated} />
      )}
      {dialog.kind === 'password' && (
        <ResetPasswordDialog user={dialog.user} onCancel={closeDialog} onDone={closeDialog} />
      )}
      {dialog.kind === 'deactivate' && (
        <DeactivateDialog user={dialog.user} onCancel={closeDialog} onConfirmed={handleUpdated} />
      )}
    </AppShell>
  );
}

/* ── ActionButton ── */
function ActionButton({ label, onClick, danger, disabled }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
        danger
          ? 'border border-red-200 text-red-700 hover:bg-red-50 disabled:text-slate-400 disabled:border-slate-200 disabled:hover:bg-transparent'
          : 'border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

/* ── FieldError ── */
function FieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-red-600">{children}</p>;
}

/* ── Create User Dialog ── */
function CreateUserDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (user: AdminUser) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('AGRICULTOR');
  const [allowAdmin, setAllowAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const adminConfirmed = role !== 'ADMINISTRADOR' || allowAdmin;
  const canSubmit = nameValid && emailValid && passwordValid && adminConfirmed && !isSubmitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        ...(role === 'ADMINISTRADOR' ? { allowAdministrator: true } : {}),
      });
      onCreated(created);
    } catch (err) {
      setError(extractError(err, 'No fue posible crear el usuario.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Nuevo usuario" onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className={labelClass}>Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} className={inputClass} />
          {name.length > 0 && !nameValid && <FieldError>Mínimo 2 caracteres.</FieldError>}
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isSubmitting} className={inputClass} />
          {email.length > 0 && !emailValid && <FieldError>Email inválido.</FieldError>}
        </div>
        <div>
          <label className={labelClass}>Contraseña</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} className={inputClass} />
          {password.length > 0 && !passwordValid && <FieldError>Mínimo 8 caracteres.</FieldError>}
        </div>
        <div>
          <label className={labelClass}>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSubmitting} className={inputClass}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        {role === 'ADMINISTRADOR' && (
          <label className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
            <input type="checkbox" checked={allowAdmin} onChange={(e) => setAllowAdmin(e.target.checked)} disabled={isSubmitting} className="mt-0.5 accent-amber-600" />
            <span>Confirmo crear otro usuario con rol <strong>Administrador</strong>.</span>
          </label>
        )}
        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className={secondaryButtonClass}>Cancelar</button>
          <button type="submit" disabled={!canSubmit} className={buttonClass}>{isSubmitting ? 'Creando…' : 'Crear usuario'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Edit User Dialog ── */
function EditUserDialog({ user, isSelf, onCancel, onUpdated }: { user: AdminUser; isSelf: boolean; onCancel: () => void; onUpdated: (user: AdminUser) => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const hasChanges = name.trim() !== user.name || role !== user.role || isActive !== user.isActive;
  const canSubmit = nameValid && hasChanges && !isSubmitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateUser(user.id, {
        ...(name.trim() !== user.name ? { name: name.trim() } : {}),
        ...(role !== user.role ? { role } : {}),
        ...(isActive !== user.isActive ? { isActive } : {}),
      });
      onUpdated(updated);
    } catch (err) {
      setError(extractError(err, 'No fue posible actualizar el usuario.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={`Editar ${user.name}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className={labelClass}>Nombre</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isSubmitting} className={inputClass} />
          {name.length > 0 && !nameValid && <FieldError>Mínimo 2 caracteres.</FieldError>}
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={user.email} disabled className={`${inputClass} !bg-slate-50 !text-slate-500`} />
          <p className="mt-1 text-xs text-slate-400">El email no puede modificarse.</p>
        </div>
        <div>
          <label className={labelClass}>Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSubmitting} className={inputClass}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && user.role === 'ADMINISTRADOR' && role !== 'ADMINISTRADOR' && (
            <FieldError>No puedes quitarte tu propio rol de administrador.</FieldError>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSubmitting || isSelf} className="accent-emerald-600" />
          <span>Usuario activo</span>
          {isSelf && <span className="text-xs text-slate-400">(no puedes desactivarte)</span>}
        </label>
        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className={secondaryButtonClass}>Cancelar</button>
          <button type="submit" disabled={!canSubmit} className={buttonClass}>{isSubmitting ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Reset Password Dialog ── */
function ResetPasswordDialog({ user, onCancel, onDone }: { user: AdminUser; onCancel: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordValid = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = passwordValid && matches && !isSubmitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await resetUserPassword(user.id, password);
      setSuccess(true);
      setTimeout(onDone, 1200);
    } catch (err) {
      setError(extractError(err, 'No fue posible actualizar la contraseña.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={`Restablecer contraseña de ${user.name}`} onClose={onCancel}>
      {success ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 animate-scale-in">
          <svg className="h-5 w-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Contraseña actualizada correctamente.
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className={labelClass}>Nueva contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} className={inputClass} />
            {password.length > 0 && !passwordValid && <FieldError>Mínimo 8 caracteres.</FieldError>}
          </div>
          <div>
            <label className={labelClass}>Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={isSubmitting} className={inputClass} />
            {confirm.length > 0 && !matches && <FieldError>Las contraseñas no coinciden.</FieldError>}
          </div>
          {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} disabled={isSubmitting} className={secondaryButtonClass}>Cancelar</button>
            <button type="submit" disabled={!canSubmit} className={buttonClass}>{isSubmitting ? 'Actualizando…' : 'Restablecer'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ── Deactivate Dialog ── */
function DeactivateDialog({ user, onCancel, onConfirmed }: { user: AdminUser; onCancel: () => void; onConfirmed: (user: AdminUser) => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const updated = await deactivateUser(user.id);
      onConfirmed(updated);
    } catch (err) {
      setError(extractError(err, 'No fue posible desactivar al usuario.'));
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Desactivar usuario" onClose={onCancel} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
          <svg className="h-6 w-6 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-800">
            ¿Confirmas que deseas desactivar a <strong>{user.name}</strong> ({user.email})?
            El usuario no podrá iniciar sesión.
          </p>
        </div>
        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className={secondaryButtonClass}>Cancelar</button>
          <button type="button" onClick={handleConfirm} disabled={isSubmitting} className={dangerButtonClass}>
            {isSubmitting ? 'Desactivando…' : 'Sí, desactivar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
