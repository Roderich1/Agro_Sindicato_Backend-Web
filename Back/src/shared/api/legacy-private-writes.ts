import { applyDecorators, CanActivate, ForbiddenException, Global, Injectable, Logger, Module, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { LEGACY_ROUTE_CLOSED } from './legacy-route-closed.guard';

/**
 * #81 PHASE 6 (limited): the farmer's legacy private writes on the Central
 * (inventory, purchases, payables, applications, plots and the legacy sync
 * queue) are closed. Mobile is the system of record (ADR-001) and calls none
 * of them; the collective path is Sync v1. Closing is reversible: routes,
 * use cases, models, tables and data are kept, and nothing is dropped.
 *
 * Rollback is a setting of THIS server, `LEGACY_PRIVATE_WRITES_ROLLBACK=enabled`,
 * never a client parameter. It restores the previous behaviour of every
 * closed route (including its ownership checks); it is not the normal path
 * and authorises no deployment.
 */
@Injectable()
export class LegacyPrivateWritesConfig {
  private readonly logger = new Logger(LegacyPrivateWritesConfig.name);
  readonly rollback: boolean;

  constructor(config: ConfigService) {
    this.rollback = config.get<string>('LEGACY_PRIVATE_WRITES_ROLLBACK') === 'enabled';
    if (this.rollback) {
      this.logger.warn(
        'LEGACY_PRIVATE_WRITES_ROLLBACK=enabled: legacy private writes are open again (operational rollback of #81 PHASE 6)'
      );
    }
  }
}

/**
 * Applied per method, after the global authentication and role guards: a
 * missing session still answers 401 and an institutional role still answers
 * 403 from RolesGuard. A farmer gets 403 `LEGACY_ROUTE_CLOSED` before any
 * pipe or handler runs, so nothing is read or written.
 */
@Injectable()
export class LegacyPrivateWriteGuard implements CanActivate {
  constructor(private readonly writes: LegacyPrivateWritesConfig) {}

  canActivate(): boolean {
    if (this.writes.rollback) return true;
    throw new ForbiddenException(LEGACY_ROUTE_CLOSED);
  }
}

@Global()
@Module({
  providers: [LegacyPrivateWritesConfig, LegacyPrivateWriteGuard],
  exports: [LegacyPrivateWritesConfig, LegacyPrivateWriteGuard],
})
export class LegacyPrivateWritesModule {}

export const LEGACY_PRIVATE_WRITE_CLOSED_DESCRIPTION =
  'Cerrada en la fase 6 de #81: el AGRICULTOR recibe 403 con message LEGACY_ROUTE_CLOSED, sin efectos; ' +
  'los roles institucionales siguen con su 403 de rol. ' +
  'La app móvil es el sistema de registro y no usa esta ruta. Rollback operativo sólo del servidor: ' +
  'LEGACY_PRIVATE_WRITES_ROLLBACK=enabled.';

/**
 * Closes one legacy private write. `success` keeps the response the route
 * already documented (Swagger drops its default 200/201 once a 403 is
 * declared); routes that already declared a 403 had no success entry.
 */
export function LegacyPrivateWrite(success?: 200 | 201) {
  return applyDecorators(
    UseGuards(LegacyPrivateWriteGuard),
    ...(success ? [ApiResponse({ status: success, description: '' })] : []),
    ApiForbiddenResponse({ description: LEGACY_PRIVATE_WRITE_CLOSED_DESCRIPTION }),
  );
}
