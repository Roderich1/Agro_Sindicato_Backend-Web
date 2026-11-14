import { AuditAction, UserRole } from '@prisma/client';

export const USER_ADMIN_REPOSITORY = 'USER_ADMIN_REPOSITORY';

export interface AdminUserView {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserData {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface UpdateUserData {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

/**
 * RF-02, RF-25: what the Bitácora keeps of an account change. The specific
 * code goes in `metadata.event`; `action` is the coarse `AuditAction` the
 * other modules already use. Never a password, hash, token or e-mail.
 */
export type UserAuditEvent =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'USER_PASSWORD_RESET';

export type UserAuditValue = string | boolean | null;

export interface UserAuditEntry {
  action: AuditAction;
  event: UserAuditEvent;
  summary: string;
  before?: Record<string, UserAuditValue>;
  after?: Record<string, UserAuditValue>;
}

/** The entries are written in the same transaction as the change they describe. */
export interface UserAuditTrail {
  actorUserId: string;
  entries: UserAuditEntry[];
}

export interface UserAdminRepositoryPort {
  findByEmail(email: string): Promise<AdminUserView | null>;
  findByIdInTenant(id: string, tenantId: string): Promise<AdminUserView | null>;
  listByTenant(tenantId: string): Promise<AdminUserView[]>;
  createWithMember(data: CreateUserData, audit: UserAuditTrail): Promise<AdminUserView>;
  updateWithMember(
    id: string,
    tenantId: string,
    data: UpdateUserData,
    audit: UserAuditTrail,
  ): Promise<AdminUserView>;
  updatePasswordHash(
    id: string,
    tenantId: string,
    passwordHash: string,
    audit: UserAuditTrail,
  ): Promise<void>;
}
