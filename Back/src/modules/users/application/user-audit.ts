import { AuditAction, UserRole } from '@prisma/client';
import {
  AdminUserView,
  UpdateUserData,
  UserAuditEntry,
} from '../domain/ports/user-admin.repository.port';

/**
 * RF-02, RF-25 (D-01): Bitácora entries for account administration. Each
 * entry names the account and what changed, with the previous and new value
 * of the changed field; never a password, its hash, a token or an e-mail
 * (the Directiva reads the Bitácora and does not see e-mails, F10-SEC-02).
 */
const ROLE_LABEL: Record<UserRole, string> = {
  AGRICULTOR: 'Agricultor',
  DIRECTIVA: 'Directiva',
  ADMINISTRADOR: 'Administrador',
};

export function userCreatedEntry(user: { name: string; role: UserRole; isActive: boolean }): UserAuditEntry {
  return {
    action: AuditAction.CREAR,
    event: 'USER_CREATED',
    summary: `Cuenta de «${user.name}» creada con el rol ${ROLE_LABEL[user.role]}.`,
    after: { name: user.name, role: user.role, isActive: user.isActive },
  };
}

/** One entry per field that really changes; an unchanged value leaves none. */
export function userUpdateEntries(target: AdminUserView, data: UpdateUserData): UserAuditEntry[] {
  const entries: UserAuditEntry[] = [];
  const name = data.name ?? target.name;
  if (data.name !== undefined && data.name !== target.name) {
    entries.push({
      action: AuditAction.ACTUALIZAR,
      event: 'USER_UPDATED',
      summary: `Nombre de la cuenta «${target.name}» cambiado a «${data.name}».`,
      before: { name: target.name },
      after: { name: data.name },
    });
  }
  if (data.role !== undefined && data.role !== target.role) {
    entries.push({
      action: AuditAction.ACTUALIZAR,
      event: 'USER_ROLE_CHANGED',
      summary: `Rol de la cuenta de «${name}» cambiado de ${ROLE_LABEL[target.role]} a ${ROLE_LABEL[data.role]}.`,
      before: { role: target.role },
      after: { role: data.role },
    });
  }
  if (data.isActive !== undefined && data.isActive !== target.isActive) {
    entries.push(
      data.isActive
        ? {
            action: AuditAction.ACTUALIZAR,
            event: 'USER_REACTIVATED',
            summary: `Cuenta de «${name}» reactivada.`,
            before: { isActive: false },
            after: { isActive: true },
          }
        : {
            action: AuditAction.INACTIVAR,
            event: 'USER_DEACTIVATED',
            summary: `Cuenta de «${name}» desactivada.`,
            before: { isActive: true },
            after: { isActive: false },
          },
    );
  }
  return entries;
}

/** Only the fact: the new password is never part of the entry. */
export function userPasswordResetEntry(target: Pick<AdminUserView, 'name'>): UserAuditEntry {
  return {
    action: AuditAction.OTRO,
    event: 'USER_PASSWORD_RESET',
    summary: `Contraseña de la cuenta de «${target.name}» restablecida.`,
  };
}
