import { Module } from '@nestjs/common';
import { UsersController } from './api/rest/users.controller';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from './application/use-cases/deactivate-user.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case';
import { USER_ADMIN_REPOSITORY } from './domain/ports/user-admin.repository.port';
import { PrismaUserAdminRepository } from './infrastructure/persistence/prisma-user-admin.repository';

@Module({
  controllers: [UsersController],
  providers: [
    CreateUserUseCase,
    ListUsersUseCase,
    GetUserUseCase,
    UpdateUserUseCase,
    ResetUserPasswordUseCase,
    DeactivateUserUseCase,
    { provide: USER_ADMIN_REPOSITORY, useClass: PrismaUserAdminRepository },
  ],
})
export class UsersModule {}
