export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  tenant: TenantInfo;
}

export interface AuthResponseDto {
  accessToken: string;
  user: AuthUserDto;
}
