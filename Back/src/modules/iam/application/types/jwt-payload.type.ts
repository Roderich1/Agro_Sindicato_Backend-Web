export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  memberId?: string;
  sessionId?: string;
  ver?: number;
}
