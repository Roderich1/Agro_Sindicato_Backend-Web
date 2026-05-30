import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { USER_REPOSITORY, UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { REFRESH_TOKEN_REPOSITORY, RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository.port';
import { JwtPayload } from '../types/jwt-payload.type';
import { AuthResponseDto } from '../dtos/auth-response.dto';

function parseDaysFromExpiry(expiry: string): number {
  const match = /^(\d+)d$/.exec(expiry);
  return match ? parseInt(match[1], 10) : 7;
}

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepositoryPort,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async execute(
    rawToken: string | undefined,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; user: AuthResponseDto['user'] }> {
    if (!rawToken) throw new UnauthorizedException('Sesión no válida');

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const stored = await this.refreshRepo.findByHash(tokenHash);

    if (!stored) throw new UnauthorizedException('Sesión no válida');

    if (stored.revokedAt) {
      // Reuse detection: revocar todos los tokens del usuario comprometido
      await this.refreshRepo.revokeAllByUser(stored.userId);
      throw new UnauthorizedException('Sesión inválida. Inicia sesión nuevamente.');
    }

    if (stored.expiresAt < new Date()) {
      await this.refreshRepo.revokeById(stored.id);
      throw new UnauthorizedException('Sesión expirada');
    }

    const user = await this.userRepo.findById(stored.userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Sesión no válida');

    // Revocar el token usado (rotación)
    await this.refreshRepo.revokeById(stored.id);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };

    const accessToken = this.jwtService.sign(payload);

    const newRawToken = crypto.randomUUID();
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const days = parseDaysFromExpiry(refreshExpiresIn);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.refreshRepo.save({ tokenHash: newTokenHash, userId: user.id, tenantId: user.tenantId, expiresAt, ipAddress, userAgent });

    return {
      accessToken,
      rawRefreshToken: newRawToken,
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
