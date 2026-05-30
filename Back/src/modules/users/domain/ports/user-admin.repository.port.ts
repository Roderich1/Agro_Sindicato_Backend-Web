import { UserRole } from '@prisma/client';

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

export interface UserAdminRepositoryPort {
  findByEmail(email: string): Promise<AdminUserView | null>;
  findByIdInTenant(id: string, tenantId: string): Promise<AdminUserView | null>;
  listByTenant(tenantId: string): Promise<AdminUserView[]>;
  create(data: CreateUserData): Promise<AdminUserView>;
  update(id: string, data: UpdateUserData): Promise<AdminUserView>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
}
