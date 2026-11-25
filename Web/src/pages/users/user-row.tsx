import { RowLink } from '../../components/c/bits';
import { Avatar, Chip } from '../../components/ui';
import { ROLE_LABELS, type AdminUser } from '../../types/users';
import { ROLE_TONE } from './user.constants';

export function UserRow({
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
    <li className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6 lg:flex-nowrap" data-testid={`user-${user.email}`}>
      <Avatar name={user.name} tone={user.isActive ? 'ink' : 'soft'} />
      <div className="min-w-0 flex-1 basis-48 lg:basis-0">
        <p className="font-semibold text-ink [overflow-wrap:anywhere]">
          {user.name}
          {isSelf && <span className="font-normal text-ink-muted"> (usted)</span>}
        </p>
        <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
          {user.email}
          {user.role === 'AGRICULTOR' && <span className="lg:hidden"> · usa la aplicación móvil</span>}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 lg:w-28 lg:shrink-0 lg:flex-col lg:items-start lg:gap-1">
        <Chip tone={ROLE_TONE[user.role]}>{ROLE_LABELS[user.role]}</Chip>
        <span className={`text-sm font-semibold ${user.isActive ? 'text-link' : 'text-ink-muted'}`} data-testid="user-status">
          {user.isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap gap-1 lg:w-[15.5rem] lg:shrink-0 lg:flex-nowrap lg:justify-end">
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
