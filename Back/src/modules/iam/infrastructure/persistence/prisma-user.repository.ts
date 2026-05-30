import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { UserRepositoryPort, UserWithTenant } from '../../domain/ports/user.repository.port';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithTenant | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
    return user as UserWithTenant | null;
  }

  async findById(id: string): Promise<UserWithTenant | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
    return user as UserWithTenant | null;
  }

  async updateLastLogin(userId: string, date: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: date },
    });
  }
}
