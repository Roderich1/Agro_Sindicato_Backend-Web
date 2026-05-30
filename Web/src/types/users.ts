export type UserRole = 'AGRICULTOR' | 'DIRECTIVA' | 'ADMINISTRADOR';

export const USER_ROLES: UserRole[] = ['AGRICULTOR', 'DIRECTIVA', 'ADMINISTRADOR'];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMINISTRADOR: 'Administrador',
  DIRECTIVA: 'Directiva',
  AGRICULTOR: 'Agricultor',
};

export interface AdminUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  allowAdministrator?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ResetPasswordPayload {
  password: string;
}
