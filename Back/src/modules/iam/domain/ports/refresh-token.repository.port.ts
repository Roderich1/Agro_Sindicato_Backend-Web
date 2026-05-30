export const REFRESH_TOKEN_REPOSITORY = 'REFRESH_TOKEN_REPOSITORY';

export interface CreateRefreshTokenData {
  tokenHash: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRepositoryPort {
  save(data: CreateRefreshTokenData): Promise<{ id: string }>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  revokeById(id: string): Promise<void>;
  revokeAllByUser(userId: string): Promise<void>;
}
