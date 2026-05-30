import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from '../dtos/login.dto';
import { AuthResponseDto } from '../dtos/auth-response.dto';
import { USER_REPOSITORY, UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { REFRESH_TOKEN_REPOSITORY, RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository.port';
import { JwtPayload } from '../types/jwt-payload.type';

const TIMING_SAFE_FAKE_HASH = '$2b$12$invalidhashfortimingattackprotectiononly';
const INVALID_CREDENTIALS_MSG = 'Credenciales inválidas';

function parseDaysFromExpiry(expiry: string): number {
  const match = /^(\d+)d$/.exec(expiry);
  return match ? parseInt(match[1], 10) : 7;
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepositoryPort,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; user: AuthResponseDto['user'] }> {
    const user = await this.userRepo.findByEmail(dto.email);

    if (!user || !user.isActive) {
      await bcrypt.compare(dto.password, TIMING_SAFE_FAKE_HASH);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const days = parseDaysFromExpiry(refreshExpiresIn);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.refreshRepo.save({ tokenHash, userId: user.id, tenantId: user.tenantId, expiresAt, ipAddress, userAgent });
    await this.userRepo.updateLastLogin(user.id, new Date());

    return {
      accessToken,
      rawRefreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
      },
    };
  }
}
