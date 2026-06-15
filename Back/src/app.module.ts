import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountsPayableModule } from './modules/accounts-payable/accounts-payable.module';
import { IamModule } from './modules/iam/iam.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SyncModule } from './modules/sync/sync.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './shared/infrastructure/persistence/prisma/prisma.module';
import { envSchema } from './config/env.schema';
import { HealthController } from './bootstrap/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config)
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PrismaModule,
    IamModule,
    InventoryModule,
    ProcurementModule,
    AccountsPayableModule,
    SyncModule,
    UsersModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
