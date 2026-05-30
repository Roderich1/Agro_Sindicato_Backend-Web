import { AdminUserView } from '../../domain/ports/user-admin.repository.port';

export interface UserResponse {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserResponse(user: AdminUserView): UserResponse {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
