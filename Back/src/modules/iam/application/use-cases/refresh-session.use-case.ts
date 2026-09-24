import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as crypto from "crypto";
import {
  USER_REPOSITORY,
  UserRepositoryPort,
} from "../../domain/ports/user.repository.port";
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepositoryPort,
} from "../../domain/ports/refresh-token.repository.port";
import { JwtPayload } from "../types/jwt-payload.type";
import { AuthResponseDto } from "../dtos/auth-response.dto";
import { AuthTtlPolicy } from "../services/auth-ttl-policy";

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshRepo: RefreshTokenRepositoryPort,
    private readonly jwtService: JwtService,
    private readonly ttl: AuthTtlPolicy,
  ) {}

  async execute(
    rawToken: string | undefined,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    rawRefreshToken: string;
    refreshExpiresAt: Date;
    user: AuthResponseDto["user"];
  }> {
    if (!rawToken) throw new UnauthorizedException("SesiÃ³n no vÃ¡lida");

    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const stored = await this.refreshRepo.findByHash(tokenHash);

    if (!stored || stored.contractVersion !== 1 || stored.sessionId !== null) {
      throw new UnauthorizedException("SesiÃ³n no vÃ¡lida");
    }

    if (stored.revokedAt) {
      // V1 keeps its legacy user-wide reuse behavior during coexistence.
      await this.refreshRepo.revokeAllByUser(stored.userId);
      throw new UnauthorizedException(
        "SesiÃ³n invÃ¡lida. Inicia sesiÃ³n nuevamente.",
      );
    }

    if (stored.expiresAt < new Date()) {
      await this.refreshRepo.revokeById(stored.id);
      throw new UnauthorizedException("SesiÃ³n expirada");
    }

    const user = await this.userRepo.findById(stored.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException("SesiÃ³n no vÃ¡lida");
    }

    await this.refreshRepo.revokeById(stored.id);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
    const accessToken = this.jwtService.sign(payload);

    const newRawToken = crypto.randomUUID();
    const newTokenHash = crypto
      .createHash("sha256")
      .update(newRawToken)
      .digest("hex");
    const expiresAt = this.ttl.refreshExpiresAt();

    await this.refreshRepo.save({
      tokenHash: newTokenHash,
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt,
      ipAddress,
      userAgent,
      contractVersion: 1,
    });

    return {
      accessToken,
      rawRefreshToken: newRawToken,
      refreshExpiresAt: expiresAt,
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
