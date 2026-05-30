export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserWithTenant {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  tenantId: string;
  lastLoginAt: Date | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserWithTenant | null>;
  findById(id: string): Promise<UserWithTenant | null>;
  updateLastLogin(userId: string, date: Date): Promise<void>;
}
