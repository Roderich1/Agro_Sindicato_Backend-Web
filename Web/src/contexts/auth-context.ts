import { createContext } from 'react';

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  tenant: TenantInfo;
}

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
