import { useState, type FormEvent } from 'react';
import { Button, Checkbox, ConfirmDialog, Dialog, ICON, Icon, Notice, Select, TextInput } from '../../components/ui';
import { createUser, deactivateUser, resetUserPassword, updateUser } from '../../services/users.service';
import { ROLE_LABELS, USER_ROLES, type AdminUser, type UserRole } from '../../types/users';
import { extractError, MIN_PASSWORD } from './user.constants';

function isValidAccountEmail(email: string): boolean {
  const [local, domain, extra] = email.trim().split('@');
  if (!local || !domain || extra !== undefined || /\s/.test(local) || /\s/.test(domain)) return false;
  return domain.lastIndexOf('.', domain.length - 2) > 0;
}

/** Lámina 33.1. Rol propuesto: Directiva; los agricultores entran por la aplicación móvil. */
export function CreateUserDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (user: AdminUser) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('DIRECTIVA');
  const [allowAdmin, setAllowAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const emailValid = isValidAccountEmail(email);
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

/** Lámina 34.6. El correo es de sólo lectura (H-13). */
export function EditUserDialog({ user, isSelf, onCancel, onUpdated }: { user: AdminUser; isSelf: boolean; onCancel: () => void; onUpdated: (user: AdminUser) => void }) {
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

/** Lámina 33.2: nueva contraseña y su repetición. */
export function PasswordDialog({ user, onCancel, onDone }: { user: AdminUser; onCancel: () => void; onDone: () => void }) {
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
export function DeactivateDialog({ user, onCancel, onConfirmed }: { user: AdminUser; onCancel: () => void; onConfirmed: (user: AdminUser) => void }) {
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
