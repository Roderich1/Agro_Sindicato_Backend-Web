import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { REFRESH_TOKEN_REPOSITORY, RefreshTokenRepositoryPort } from '../../domain/ports/refresh-token.repository.port';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshRepo: RefreshTokenRepositoryPort,
  ) {}

  async execute(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const stored = await this.refreshRepo.findByHash(tokenHash);

    if (stored && !stored.revokedAt) {
      await this.refreshRepo.revokeById(stored.id);
    }
  }
}
