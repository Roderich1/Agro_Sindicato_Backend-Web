import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import {
  CreateRefreshTokenData,
  RefreshTokenRepositoryPort,
  StoredRefreshToken,
} from '../../domain/ports/refresh-token.repository.port';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(data: CreateRefreshTokenData): Promise<{ id: string }> {
    return this.prisma.refreshToken.create({
      data: {
        tokenHash: data.tokenHash,
        userId: data.userId,
        tenantId: data.tenantId,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
      select: { id: true },
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, tenantId: true, expiresAt: true, revokedAt: true },
    });
  }

  async revokeById(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllByUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
