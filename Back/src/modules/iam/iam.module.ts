import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './api/rest/auth.controller';
import { JwtAuthGuard } from './api/rest/guards/jwt-auth.guard';
import { RolesGuard } from './api/rest/guards/roles.guard';

import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';

import { REFRESH_TOKEN_REPOSITORY } from './domain/ports/refresh-token.repository.port';
import { USER_REPOSITORY } from './domain/ports/user.repository.port';

import { JwtStrategy } from './infrastructure/auth/jwt.strategy';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma-refresh-token.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '15m') as never },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetMeUseCase,
    JwtStrategy,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class IamModule {}
