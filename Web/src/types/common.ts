export type UserRole = 'AGRICULTOR' | 'DIRECTIVA' | 'ADMINISTRADOR';
export type ApiDateString = string;
export type DecimalString = string;

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role?: UserRole | string;
}

export interface EntitySummary {
  id: string;
  name: string;
}

export interface ApiMessageResponse {
  message?: string;
}

export interface DateRangeQuery {
  from?: string;
  to?: string;
}

export interface OwnerScopedQuery {
  ownerUserId?: string;
}
